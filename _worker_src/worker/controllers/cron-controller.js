// =====================================================================
// controllers/cron-controller.js
// -----------------------------------------------------------------------
// POST /api/v1/cron/check-overdue-activities
//
// 2026-08-07 (pedido do usuário): "quero notificar, com o app fechado
// e o mesmo som já existente, quando uma atividade atrasa".
//
// Cloudflare Pages NÃO suporta Cron Triggers diretamente (limitação
// confirmada da própria plataforma — Workers têm, Pages não). Este
// endpoint faz o trabalho de verdade (varrer atividades, decidir quem
// está atrasado, mandar push); QUEM o chama periodicamente é um Worker
// pequeno e separado, com Cron Trigger configurado no painel do
// Cloudflare (ver instruções entregues junto com este código).
//
// Autenticação: não existe usuário logado nesse contexto (quem chama é
// o Worker de cron, não um cliente do app) — em vez de JWT, exige um
// cabeçalho X-Cron-Secret batendo com CRON_SECRET (ver utils/env.js).
//
// Como decide "está atrasada": activity.scheduledAt no passado E
// !activity.done. Pra não notificar a MESMA atividade atrasada de novo
// a cada execução do cron (ex.: a cada 5 minutos), marca
// activity.overdueNotifiedAt na primeira vez e pula quem já tem esse
// campo — só reseta se a atividade for reagendada de novo pra um
// scheduledAt futuro (nesse caso o próprio campo overdueNotifiedAt é
// apagado no lado do cliente ao reagendar, ver js/agenda.js).
// =====================================================================

import { ok } from '../utils/response.js';
import { ForbiddenError } from '../errors/http-errors.js';
import { selectFrom, updateWhere } from '../lib/supabase-rest.js';
import { dispatchPushToUsers } from '../lib/push-dispatch.js';

const FS_TABLE = 'fs_documents';
const ATIVIDADES_PATH_PREFIX = 'atividades/list/';
const MAX_USERS_PER_RUN = 500; // trava de sanidade

function uidFromPath(path) {
  const clean = String(path || '');
  return clean.indexOf(ATIVIDADES_PATH_PREFIX) === 0 ? clean.slice(ATIVIDADES_PATH_PREFIX.length) : null;
}

export async function checkOverdueActivitiesController(request, ctx) {
  const secretHeader = request.headers.get('X-Cron-Secret') || '';
  if (!ctx.cfg.CRON_SECRET || secretHeader !== ctx.cfg.CRON_SECRET) {
    throw new ForbiddenError('Segredo de cron inválido ou não configurado.', { code: 'CRON_SECRET_MISMATCH' });
  }

  const nowIso = new Date().toISOString();
  const summary = { usersScanned: 0, activitiesOverdue: 0, notified: 0, errors: [] };

  let rows;
  try {
    const result = await selectFrom(ctx.cfg, FS_TABLE, {
      filters: { path: 'like.' + ATIVIDADES_PATH_PREFIX + '*' },
      select: 'path,data',
      limit: MAX_USERS_PER_RUN,
    });
    rows = result.rows || [];
  } catch (err) {
    summary.errors.push('Falha ao listar atividades: ' + String(err && err.message || err));
    return ok(summary, { endpoint: '/api/v1/cron/check-overdue-activities' }, ctx.headers);
  }

  for (const row of rows) {
    const uid = uidFromPath(row.path);
    if (!uid) continue;
    summary.usersScanned++;

    const list = (row.data && Array.isArray(row.data.list)) ? row.data.list : [];
    const newlyOverdue = [];
    let changed = false;

    for (const act of list) {
      if (!act || act.done || !act.scheduledAt) continue;
      if (act.scheduledAt >= nowIso) continue; // ainda não chegou a hora
      summary.activitiesOverdue++;
      if (act.overdueNotifiedAt) continue; // já notificado antes, não repete
      act.overdueNotifiedAt = nowIso;
      changed = true;
      newlyOverdue.push(act);
    }

    if (!newlyOverdue.length) continue;

    // Uma notificação por usuário (não uma por atividade) — evita
    // inundar quem ficou várias atividades atrasadas de uma vez (ex.:
    // celular desligado o fim de semana inteiro).
    const title = '⏰ Lider CRM';
    const body = newlyOverdue.length === 1
      ? 'Atividade atrasada: ' + String(newlyOverdue[0].desc || newlyOverdue[0].tipo || 'lembrete').slice(0, 120)
      : newlyOverdue.length + ' atividades atrasadas — confira a Agenda';

    try {
      const dispatch = await dispatchPushToUsers(ctx.cfg, [uid], title, body, { type: 'activity_overdue', count: newlyOverdue.length });
      summary.notified += dispatch.sent;
    } catch (err) {
      summary.errors.push('Push falhou pra ' + uid + ': ' + String(err && err.message || err));
    }

    // Grava overdueNotifiedAt de volta — best-effort: se falhar, a
    // próxima execução do cron tenta de novo (só gera notificação
    // duplicada na pior das hipóteses, não perde nenhuma).
    if (changed) {
      try {
        await updateWhere(ctx.cfg, FS_TABLE, { path: 'eq.' + row.path }, { data: Object.assign({}, row.data, { list }), updated_at: nowIso });
      } catch (err) {
        summary.errors.push('Gravação falhou pra ' + uid + ': ' + String(err && err.message || err));
      }
    }
  }

  return ok(summary, { endpoint: '/api/v1/cron/check-overdue-activities' }, ctx.headers);
}
