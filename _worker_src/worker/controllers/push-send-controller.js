// =====================================================================
// controllers/push-send-controller.js
// FASE 2 (2026-08-05) — dispara notificação push de verdade.
// -----------------------------------------------------------------------
// POST /api/v1/push/send
// Body: { toUserIds: string[], title?: string, body: string, data?: object }
//
// Chamado pelo CLIENTE logo depois de enviar uma mensagem de chat (ver
// js/chat.js, _chatPushMsg) — não existe gatilho de banco (trigger)
// porque as mensagens não vivem numa tabela relacional própria, vivem
// dentro de um documento JSON por conversa (fs_documents). O ponto mais
// simples e confiável de "algo novo aconteceu, notifique" é logo após
// o cliente confirmar que enviou.
//
// Best-effort por design: se um device não pode ser notificado (token
// morto, FCM fora do ar, etc.), isso NUNCA vira erro pro chamador — o
// chat já funciona sem push, isso é só um extra. Cada falha é reportada
// dentro de `data.results[]`, não como HTTP 4xx/5xx.
// =====================================================================

import { ok } from '../utils/response.js';
import { BadRequestError } from '../errors/http-errors.js';
import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { selectFrom } from '../lib/supabase-rest.js';
import { getFcmAccessToken, sendFcmToDevice } from '../lib/fcm-client.js';
import { dispatchPushToUsers } from '../lib/push-dispatch.js';

const TABLE = 'push_devices'; // usado só pelo diagnóstico (pushSelfTestController) — o envio de verdade agora vive em lib/push-dispatch.js

const MAX_TARGETS = 50; // trava de sanidade — grupo muito grande não devia acontecer

function _validate(body) {
  const errors = [];
  if (!Array.isArray(body.toUserIds) || !body.toUserIds.length) errors.push('toUserIds obrigatório (array não-vazio).');
  if (body.toUserIds && body.toUserIds.length > MAX_TARGETS) errors.push('toUserIds excede o máximo de ' + MAX_TARGETS + '.');
  if (!body.body || typeof body.body !== 'string') errors.push('body obrigatório (string) — texto da notificação.');
  if (errors.length) throw new BadRequestError(errors.join(' '));
}

export async function sendPushController(request, ctx) {
  const body = await readJsonBody(request);
  _validate(body);

  const fromUserId = ctx.user && ctx.user.sub;
  const targets = body.toUserIds
    .map((u) => sanitizeString(String(u || ''), 200))
    .filter((u) => u && u !== fromUserId); // nunca notifica quem mandou

  const title = sanitizeString(body.title || 'Lider CRM', 120);
  const notifBody = sanitizeString(body.body, 300);
  const data = (body.data && typeof body.data === 'object') ? body.data : {};

  // 2026-08-07: lógica de envio em si movida pra lib/push-dispatch.js
  // (dispatchPushToUsers) — reaproveitada também pelo cron de
  // atividades atrasadas. Comportamento deste endpoint inalterado.
  const dispatch = await dispatchPushToUsers(ctx.cfg, targets, title, notifBody, data);

  return ok(
    dispatch,
    { endpoint: '/api/v1/push/send' },
    ctx.headers,
  );
}

// =====================================================================
// DIAGNÓSTICO TEMPORÁRIO (2026-08-05) — pushSelfTestController
// -----------------------------------------------------------------------
// POST /api/v1/push/selftest — sem body. Roda os mesmos passos de
// sendPushController, mas UM DE CADA VEZ, PRO PRÓPRIO usuário que
// chamou (ignora o filtro "nunca notifica quem mandou" de propósito —
// aqui é exatamente isso que queremos: notificar a si mesmo pra testar),
// e retorna cada passo com ok:true/false + detalhe do que aconteceu,
// em vez de só um resultado agregado silencioso.
//
// Existe só pra investigação — remover esta função e a rota quando o
// push estiver confirmado funcionando em produção.
// =====================================================================
export async function pushSelfTestController(request, ctx) {
  const uid = ctx.user && ctx.user.sub;
  const steps = [];

  const configured = !!(ctx.cfg && ctx.cfg.FCM_SERVICE_ACCOUNT_JSON);
  steps.push({ step: 'Credencial FCM_SERVICE_ACCOUNT_JSON configurada no servidor', ok: configured });
  if (!configured) {
    return ok({ overallOk: false, steps }, { endpoint: '/api/v1/push/selftest' }, ctx.headers);
  }

  try {
    const authResult = await getFcmAccessToken(ctx.cfg);
    steps.push({ step: 'Autenticação com o Google (OAuth2) usando a credencial', ok: true, detail: 'project_id: ' + authResult.projectId });
  } catch (authErr) {
    steps.push({ step: 'Autenticação com o Google (OAuth2) usando a credencial', ok: false, detail: String(authErr && authErr.message || authErr) });
    return ok({ overallOk: false, steps }, { endpoint: '/api/v1/push/selftest' }, ctx.headers);
  }

  let devices;
  try {
    const result = await selectFrom(ctx.cfg, TABLE, {
      filters: { user_id: 'eq.' + uid, active: 'eq.true', provider: 'eq.fcm' },
      limit: 10,
    });
    devices = (result && result.rows) || [];
    steps.push({
      step: 'Celular(es) registrado(s) pra este usuário',
      ok: devices.length > 0,
      detail: devices.length + ' device(s) — ' + devices.map((d) => d.platform || '?').join(', '),
    });
  } catch (dbErr) {
    steps.push({ step: 'Celular(es) registrado(s) pra este usuário', ok: false, detail: String(dbErr && dbErr.message || dbErr) });
    return ok({ overallOk: false, steps }, { endpoint: '/api/v1/push/selftest' }, ctx.headers);
  }
  if (!devices.length) {
    steps.push({ step: 'Envio de teste via FCM', ok: false, detail: 'Pulado — nenhum device pra mandar. Abra a aba Papo no celular primeiro (é isso que registra o device) e teste de novo.' });
    return ok({ overallOk: false, steps }, { endpoint: '/api/v1/push/selftest' }, ctx.headers);
  }

  const sendResults = [];
  for (const dev of devices) {
    const r = await sendFcmToDevice(
      ctx.cfg,
      dev.token,
      { title: '🔔 Teste Lider CRM', body: 'Se você viu isso fora do app, a notificação tá funcionando!' },
      { test: '1' },
    );
    sendResults.push({ deviceId: dev.id, platform: dev.platform, ok: r.ok, status: r.status, fcmResponse: r.body });
  }
  const anySent = sendResults.some((r) => r.ok);
  steps.push({ step: 'Envio de teste via FCM', ok: anySent, detail: sendResults });

  return ok({ overallOk: anySent, steps }, { endpoint: '/api/v1/push/selftest' }, ctx.headers);
}
