// =====================================================================
// controllers/device-push-controller.js
// FASE 1 — Registro de device push (esqueleto pronto para Fase 2)
// -----------------------------------------------------------------------
// POST /api/v1/push/register   — registra/atualiza token do device
// DELETE /api/v1/push/register — remove token (logout / revogação)
// GET  /api/v1/push/devices    — lista devices do próprio usuário (debug)
//
// Tabela Supabase necessária (criar em Fase 2 — SQL abaixo como comentário):
/*
  CREATE TABLE IF NOT EXISTS public.push_devices (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       text        NOT NULL,
    token         text        NOT NULL,
    platform      text        NOT NULL DEFAULT 'web',  -- web | android | ios
    provider      text        NOT NULL DEFAULT 'fcm',  -- fcm | apns | web-push
    endpoint      text,           -- Web Push endpoint (VAPID)
    p256dh        text,           -- Web Push key
    auth_secret   text,           -- Web Push auth
    device_label  text,           -- ex: "Samsung Galaxy S24"
    app_version   text,
    active        boolean     NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, token)
  );
  CREATE INDEX IF NOT EXISTS push_devices_user_active ON public.push_devices (user_id, active);
*/
// =====================================================================

import { ok, created, noContent } from '../utils/response.js';
import { BadRequestError }        from '../errors/http-errors.js';
import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { selectFrom, insertInto, updateWhere, deleteWhere } from '../lib/supabase-rest.js';

const TABLE = 'push_devices';

// ── Esquema de validação manual (sem dependência extra) ───────────────
const PLATFORMS  = new Set(['web', 'android', 'ios']);
const PROVIDERS  = new Set(['fcm', 'apns', 'web-push']);

function _validateRegister(body) {
  const errors = [];
  if (!body.token    || typeof body.token !== 'string')    errors.push('token obrigatório (string).');
  if (!body.platform || !PLATFORMS.has(body.platform))     errors.push('platform inválido (web|android|ios).');
  if (!body.provider || !PROVIDERS.has(body.provider))     errors.push('provider inválido (fcm|apns|web-push).');
  if (body.token && body.token.length > 4096)              errors.push('token muito longo (máx 4096).');
  if (errors.length) throw new BadRequestError(errors.join(' '));
}

// ─────────────────────────────────────────────────────────────────────
// POST /api/v1/push/register
// Body: { token, platform, provider, endpoint?, p256dh?, auth_secret?,
//         device_label?, app_version? }
// ─────────────────────────────────────────────────────────────────────
export async function registerDeviceController(request, ctx) {
  const body = await readJsonBody(request);
  _validateRegister(body);

  const userId = ctx.user && ctx.user.sub;
  const now    = new Date().toISOString();

  const record = {
    user_id:      userId,
    token:        sanitizeString(body.token, 4096),
    platform:     body.platform,
    provider:     body.provider,
    endpoint:     body.endpoint     ? sanitizeString(body.endpoint,     2048) : null,
    p256dh:       body.p256dh       ? sanitizeString(body.p256dh,       512)  : null,
    auth_secret:  body.auth_secret  ? sanitizeString(body.auth_secret,  256)  : null,
    device_label: body.device_label ? sanitizeString(body.device_label, 200)  : null,
    app_version:  body.app_version  ? sanitizeString(body.app_version,  40)   : null,
    active:       true,
    updated_at:   now,
  };

  // Upsert: tenta atualizar pelo (user_id + token); se não existir, insere.
  // CORREÇÃO 2026-08-05: dois bugs aqui — (1) a chave certa é `filters`
  // (plural), não `filter`, então a busca nunca filtrava por
  // user_id/token de verdade; (2) selectFrom retorna {rows, total}, não
  // a lista direto, então `rows.length`/`.map()` batiam num objeto, não
  // num array. Isso fazia o registro SEMPRE cair no caminho "insert"
  // (nunca achava o "existente"), criando linha duplicada a cada login
  // em vez de atualizar a mesma — e é a mesma causa raiz do
  // "devices.map is not a function" no diagnóstico de push. Mesmo bug
  // corrigido nas 2 ocorrências deste arquivo + nas 2 de
  // push-send-controller.js.
  let rows;
  try {
    const result = await selectFrom(ctx.cfg, TABLE, {
      filters: { user_id: 'eq.' + userId, token: 'eq.' + record.token },
      limit:   1,
    });
    rows = (result && result.rows) || [];
  } catch (_e) {
    rows = [];
  }

  let saved;
  let persisted = true;
  let persistError = null;
  if (rows && rows.length > 0) {
    // update — updateWhere já retorna o objeto atualizado direto (não array).
    try {
      const updated = await updateWhere(ctx.cfg, TABLE,
        { user_id: 'eq.' + userId, token: 'eq.' + record.token },
        { ...record },
      );
      saved = updated || record;
    } catch (dbErr) {
      /* CORREÇÃO 2026-08-06: antes isso era engolido em silêncio
         ("fallback gracioso") e o endpoint respondia 201 registered:true
         mesmo quando NADA foi salvo — ex.: se a tabela push_devices
         nunca foi criada no Supabase (o SQL fica só como comentário
         acima, precisa ser rodado manualmente uma vez). Isso fazia
         parecer que o registro funcionou, mas o passo 3 do diagnóstico
         de push (/api/v1/push/selftest) nunca achava device nenhum —
         porque de fato nunca existiu. Agora o problema real aparece na
         resposta em vez de ficar escondido. */
      saved = record;
      persisted = false;
      persistError = String(dbErr && dbErr.message || dbErr);
      console.warn('[push] updateWhere falhou — device pode não ter sido salvo:', persistError);
    }
  } else {
    // insert — insertInto já retorna o objeto inserido direto (não array).
    try {
      record.created_at = now;
      const inserted = await insertInto(ctx.cfg, TABLE, record);
      saved = inserted || record;
    } catch (dbErr) {
      saved = record;
      persisted = false;
      persistError = String(dbErr && dbErr.message || dbErr);
      console.warn('[push] insertInto falhou — device pode não ter sido salvo:', persistError);
    }
  }

  return created(
    {
      registered:   true,
      persisted,                              // false = "parecia ok mas não salvou" (ver persistError)
      persistError: persistError || undefined,
      user_id:      userId,
      platform:     record.platform,
      provider:     record.provider,
      device_label: record.device_label,
      token_prefix: record.token.slice(0, 12) + '…', // nunca devolver token inteiro
    },
    { endpoint: '/api/v1/push/register' },
    ctx.headers,
  );
}

// ─────────────────────────────────────────────────────────────────────
// DELETE /api/v1/push/register
// Body: { token }  — remove o token do device atual
// ─────────────────────────────────────────────────────────────────────
export async function unregisterDeviceController(request, ctx) {
  const body   = await readJsonBody(request);
  const token  = body && sanitizeString(body.token, 4096);
  if (!token)  throw new BadRequestError('token obrigatório.');

  const userId = ctx.user && ctx.user.sub;

  try {
    await deleteWhere(ctx.cfg, TABLE, { user_id: 'eq.' + userId, token: 'eq.' + token });
  } catch (_e) {
    // não-crítico — tabela pode ainda não existir
    console.warn('[push] deleteWhere falhou (tabela pode não existir ainda):', _e.message);
  }

  return ok({ unregistered: true, token_prefix: token.slice(0, 12) + '…' }, { endpoint: '/api/v1/push/register' }, ctx.headers);
}

// ─────────────────────────────────────────────────────────────────────
// GET /api/v1/push/devices
// Retorna lista de devices ativos do próprio usuário (sem tokens completos)
// ─────────────────────────────────────────────────────────────────────
export async function listDevicesController(request, ctx) {
  const userId = ctx.user && ctx.user.sub;

  let rows = [];
  try {
    const result = await selectFrom(ctx.cfg, TABLE, {
      filters: { user_id: 'eq.' + userId, active: 'eq.true' },
      limit:   50,
    });
    rows = (result && result.rows) || [];
  } catch (_e) {
    // tabela não existe ainda — retornar lista vazia
  }

  const safe = rows.map(r => ({
    id:           r.id,
    platform:     r.platform,
    provider:     r.provider,
    device_label: r.device_label,
    app_version:  r.app_version,
    token_prefix: r.token ? r.token.slice(0, 12) + '…' : null,
    created_at:   r.created_at,
    updated_at:   r.updated_at,
  }));

  return ok(safe, { total: safe.length, endpoint: '/api/v1/push/devices' }, ctx.headers);
}
