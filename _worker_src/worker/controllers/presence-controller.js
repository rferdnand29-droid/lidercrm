// =====================================================================
// presence-controller.PATCHED-20260801.js
// ---------------------------------------------------------------------
// SUBSTITUTO DROP-IN de _worker_src/worker/controllers/presence-controller.js
//
// O QUE ESTAVA ERRADO NO ORIGINAL (causa dos 500 em série):
//   1) Gravava/filtrava public.users.last_heartbeat_at / updated_at /
//      last_login_at via PATCH/GET direto no PostgREST. Se a coluna não
//      existe no projeto (migration de presença não aplicada), o
//      PostgREST devolve 400/42703 e o `catch` único do controller
//      converte TUDO em errResp(500,'WORKER_ERROR') — daí os três
//      endpoints caírem juntos e a causa real ficar invisível no
//      DevTools (o front só vê "500").
//   2) Filtrava id=eq.<sub do JWT>. Com public.users.id uuid e sub
//      LEGADO (tokens.js: sub = String(user.id || user.uid || user.email)),
//      o Postgres devolve 22P02 "invalid input syntax for type uuid"
//      → também 500.
//   3) PATCH que não casa nenhuma linha retornava 200 silencioso:
//      presença "funcionava" sem gravar nada.
//
// O QUE ESTE ARQUIVO FAZ:
//   • Usa as RPCs criadas por sql/migrations/fix_presence_500_20260801.sql
//     (lf_presence_beat / lf_presence_online), que resolvem
//     uuid | legacy_id | email do lado do banco → fim do 22P02.
//   • Fallback automático para o caminho REST antigo se as RPCs ainda
//     não existirem (deploy do worker antes do SQL) — sem quebrar nada.
//   • Classificação HONESTA dos erros: 401 (auth), 404 (usuário não
//     resolvido), 503 PRESENCE_SCHEMA_MISSING (coluna/RPC ausente, com
//     instrução do SQL a rodar) e 500 só para erro realmente inesperado.
//   • Para o caso de schema ausente devolve HTTP 200 com
//     { degraded:true, reason:'schema-missing' } quando
//     PRESENCE_SOFT_DEGRADE !== 'false' — assim o circuit-breaker do
//     lf-error-hunter para de abrir a cada 30/60/120/240/300 s e o
//     console deixa de ser inundado, sem mentir sobre o estado (o campo
//     `degraded` e o `hint` vêm no corpo).
//
// COMO APLICAR:
//   cp presence-controller.PATCHED-20260801.js \
//      _worker_src/worker/controllers/presence-controller.js
//   (as assinaturas exportadas são idênticas — router.js não muda)
// =====================================================================

import { readJsonBody } from '../validators/validate.js';
import { ok, error as errResp } from '../utils/response.js';
import { selectFrom, updateWhere } from '../lib/supabase-rest.js';

const DEFAULT_WINDOW_SEC   = 90;
const HARD_CAP_WINDOW_SEC  = 6 * 60 * 60;
const MOVE_LAST_LOGIN = new Set(['logout', 'pagehide', 'beforeunload', 'hidden', 'before-close']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Cache por instância: evita bater na RPC ausente em todo request.
let _rpcAvailable = null;   // null = desconhecido, true/false = testado

function authedUid(ctx) {
  const u = (ctx && ctx.user) || {};
  const sub = u.sub || u.uid || (u.raw && u.raw.sub) || null;
  if (!sub) {
    const e = new Error('Bearer ausente ou inválido.');
    e.statusCode = 401;
    throw e;
  }
  return String(sub);
}
function nowIso(ts) {
  const n = Number(ts);
  if (!ts || !isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n).toISOString();
}
function softDegrade(cfg) {
  return String((cfg && cfg.PRESENCE_SOFT_DEGRADE) ?? 'true') !== 'false';
}

/** true quando o erro é "coluna/função/tabela não existe" (schema desatualizado) */
function isSchemaError(err) {
  const m = String((err && err.message) || err || '');
  return /does not exist|42703|42883|PGRST202|PGRST204|schema cache/i.test(m);
}
/** true quando o erro é cast de uuid inválido */
function isUuidCastError(err) {
  const m = String((err && err.message) || err || '');
  return /invalid input syntax for type uuid|22P02/i.test(m);
}

const SCHEMA_HINT =
  'Schema de presença ausente. Rode sql/migrations/fix_presence_500_20260801.sql ' +
  '(adiciona users.last_heartbeat_at/last_login_at/updated_at + RPCs lf_presence_beat/lf_presence_online).';

// ---------------------------------------------------------------------
// RPC helper (PostgREST /rpc/<fn>)
// ---------------------------------------------------------------------
async function callRpc(cfg, fn, args) {
  const url = String(cfg.SUPABASE_URL).replace(/\/+$/, '') + '/rest/v1/rpc/' + fn;
  const headers = {
    'apikey': cfg.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  if (cfg.SUPABASE_SERVICE_ROLE) headers['Authorization'] = 'Bearer ' + cfg.SUPABASE_SERVICE_ROLE;
  else if (cfg.SUPABASE_ANON_KEY && String(cfg.SUPABASE_ANON_KEY).indexOf('eyJ') === 0) {
    headers['Authorization'] = 'Bearer ' + cfg.SUPABASE_ANON_KEY;
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(args || {}) });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_e) { body = text; }

  if (!res.ok) {
    const msg = (body && (body.message || body.hint || body.error)) || text || ('rpc ' + fn + ' ' + res.status);
    const err = new Error(String(msg));
    err.status = res.status;
    err.pgCode = (body && body.code) || null;
    throw err;
  }
  return body;
}

// ---------------------------------------------------------------------
// Fallback REST (comportamento antigo, porém com resolução de id)
// ---------------------------------------------------------------------
async function resolveUserIdRest(cfg, sub) {
  if (UUID_RE.test(sub)) return sub;
  // legacy_id
  try {
    const r1 = await selectFrom(cfg, 'users', { filters: { legacy_id: 'eq.' + sub }, select: 'id', limit: 1 });
    const row1 = (r1 && r1.rows && r1.rows[0]) || null;
    if (row1 && row1.id) return String(row1.id);
  } catch (e) { if (!isSchemaError(e)) throw e; }
  // email
  if (sub.indexOf('@') > 0) {
    const r2 = await selectFrom(cfg, 'users', { filters: { email: 'eq.' + sub }, select: 'id', limit: 1 });
    const row2 = (r2 && r2.rows && r2.rows[0]) || null;
    if (row2 && row2.id) return String(row2.id);
  }
  return null;
}

async function beatRest(cfg, sub, tsIso, reason) {
  const id = await resolveUserIdRest(cfg, sub);
  if (!id) { const e = new Error('USER_NOT_FOUND'); e.notFound = true; throw e; }
  const patch = { last_heartbeat_at: tsIso, updated_at: tsIso };
  if (MOVE_LAST_LOGIN.has(reason)) patch.last_login_at = tsIso;
  const row = await updateWhere(cfg, 'users', { id: 'eq.' + id }, patch);
  if (!row) { const e = new Error('USER_NOT_UPDATED'); e.notFound = true; throw e; }
  return { user_id: id, last_heartbeat_at: tsIso, last_login_at: patch.last_login_at || null };
}

async function beat(ctx, sub, tsIso, reason) {
  const cfg = ctx.cfg;
  if (_rpcAvailable !== false) {
    try {
      const rows = await callRpc(cfg, 'lf_presence_beat', { p_sub: sub, p_ts: tsIso, p_reason: reason });
      _rpcAvailable = true;
      const r = Array.isArray(rows) ? rows[0] : rows;
      return r || { user_id: null, last_heartbeat_at: tsIso, last_login_at: null };
    } catch (e) {
      if (isSchemaError(e)) { _rpcAvailable = false; }          // RPC ainda não criada → cai no REST
      else if (/USER_NOT_FOUND|P0002/i.test(String(e.message))) { const x = new Error('USER_NOT_FOUND'); x.notFound = true; throw x; }
      else throw e;
    }
  }
  return beatRest(cfg, sub, tsIso, reason);
}

async function onlineList(ctx, win) {
  const cfg = ctx.cfg;
  if (_rpcAvailable !== false) {
    try {
      const rows = await callRpc(cfg, 'lf_presence_online', { p_window_sec: win });
      _rpcAvailable = true;
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      if (isSchemaError(e)) { _rpcAvailable = false; }
      else throw e;
    }
  }
  const sinceIso = new Date(Date.now() - win * 1000).toISOString();
  const { rows } = await selectFrom(cfg, 'users', {
    filters: { last_heartbeat_at: 'gte.' + sinceIso },
    select: 'id,nome,cargo,last_heartbeat_at,last_login_at',
    order: 'last_heartbeat_at.desc',
    limit: 500,
  });
  return rows || [];
}

// ---------------------------------------------------------------------
// Resposta padronizada de erro
// ---------------------------------------------------------------------
function presenceFailure(ctx, endpoint, err, extra) {
  if (err && err.notFound) {
    return errResp(404, 'USER_NOT_FOUND',
      'sub do JWT não corresponde a nenhum usuário (id/legacy_id/email). Verifique o mapeamento legacy_id.');
  }
  if (isSchemaError(err) || isUuidCastError(err)) {
    const payload = Object.assign({
      ok: false,
      degraded: true,
      reason: isUuidCastError(err) ? 'id-type-mismatch' : 'schema-missing',
      hint: SCHEMA_HINT,
      detail: String((err && err.message) || err),
    }, extra || {});
    // 200 degradado evita tempestade de circuit-breaker no cliente,
    // mas o corpo diz claramente que está degradado.
    if (softDegrade(ctx.cfg)) return ok(payload, { endpoint });
    return errResp(503, 'PRESENCE_SCHEMA_MISSING', SCHEMA_HINT);
  }
  return errResp(500, 'WORKER_ERROR', String((err && err.message) || err));
}

// =====================================================================
// POST /api/v1/users/heartbeat
// =====================================================================
export async function heartbeatController(request, ctx) {
  let uid;
  try { uid = authedUid(ctx); }
  catch (e) { return errResp(401, 'UNAUTHORIZED', e.message); }

  let body = {};
  try { body = await readJsonBody(request); } catch (_e) {}
  const bodyUid = body && body.userId ? String(body.userId) : null;
  if (bodyUid && bodyUid !== uid) {
    return errResp(403, 'FORBIDDEN', 'userId mismatch com a sessão autenticada.');
  }
  const tsIso = nowIso(body && body.ts);

  try {
    const r = await beat(ctx, uid, tsIso, 'heartbeat');
    return ok({ ok: true, userId: r.user_id || uid, last_heartbeat_at: r.last_heartbeat_at || tsIso },
      { endpoint: '/api/v1/users/heartbeat' });
  } catch (e) {
    return presenceFailure(ctx, '/api/v1/users/heartbeat', e, { userId: uid, last_heartbeat_at: tsIso });
  }
}

// =====================================================================
// POST /api/v1/users/last-seen
// =====================================================================
export async function lastSeenController(request, ctx) {
  let uid;
  try { uid = authedUid(ctx); }
  catch (e) { return errResp(401, 'UNAUTHORIZED', e.message); }

  let body = {};
  try { body = await readJsonBody(request); } catch (_e) {}
  const bodyUid = body && body.userId ? String(body.userId) : null;
  if (bodyUid && bodyUid !== uid) {
    return errResp(403, 'FORBIDDEN', 'userId mismatch com a sessão autenticada.');
  }
  const tsIso  = nowIso(body && body.ts);
  const reason = body && body.reason ? String(body.reason) : 'manual';

  try {
    const r = await beat(ctx, uid, tsIso, reason);
    return ok({
      ok: true,
      userId: r.user_id || uid,
      ts: tsIso,
      reason,
      movedLastLogin: MOVE_LAST_LOGIN.has(reason),
    }, { endpoint: '/api/v1/users/last-seen' });
  } catch (e) {
    return presenceFailure(ctx, '/api/v1/users/last-seen', e, { userId: uid, ts: tsIso, reason });
  }
}

// =====================================================================
// GET /api/v1/users/online[?window=90]
// =====================================================================
export async function onlineUsersController(request, ctx) {
  try { authedUid(ctx); }
  catch (e) { return errResp(401, 'UNAUTHORIZED', e.message); }

  let win = DEFAULT_WINDOW_SEC;
  try {
    const u = new URL(request.url, 'http://x');
    const w = parseInt(u.searchParams.get('window') || '', 10);
    if (isFinite(w) && w > 0) win = Math.min(w, HARD_CAP_WINDOW_SEC);
  } catch (_e) {}

  try {
    const rows = await onlineList(ctx, win);
    return ok({
      list: rows.map((u) => ({
        id: u.id,
        nome: u.nome || '',
        role: u.cargo || u.role || 'user',
        last_heartbeat_at: u.last_heartbeat_at || null,
        last_login_at: u.last_login_at || null,
      })),
      ts: new Date().toISOString(),
      windowSec: win,
    }, { endpoint: '/api/v1/users/online' });
  } catch (e) {
    return presenceFailure(ctx, '/api/v1/users/online', e, { list: [], windowSec: win });
  }
}
