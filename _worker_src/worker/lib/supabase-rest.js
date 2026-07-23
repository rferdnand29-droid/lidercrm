// =====================================================================
// supabase-rest.js
// Cliente REST minimalista para o Supabase (PostgREST + Auth + Storage)
// — o SDK oficial não é 100% edge-friendly em algumas versões, então
// preferimos falar direto com os endpoints HTTP, que são estáveis.
// =====================================================================

import { UpstreamError, UnauthorizedError, BadRequestError, NotFoundError } from '../errors/http-errors.js';

// Timeout padrão para todas as chamadas ao Supabase (10 s) — evita que o Worker
// fique travado esperando indefinidamente em cold-starts ou rede degradada.
const SUPABASE_FETCH_TIMEOUT_MS = 10000;

function fetchWithTimeout(url, init) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => { try { ctrl.abort(); } catch (_e) {} }, SUPABASE_FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: ctrl.signal })
    .then(res => { clearTimeout(tid); return res; })
    .catch(err => { clearTimeout(tid); throw err; });
}

function buildHeaders(cfg, extra = {}) {
  const headers = {
    'apikey': cfg.SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...extra,
  };
  // Supabase atual: a publishable key autentica a aplicação via header
  // `apikey`. O header Authorization só deve carregar um JWT de usuário
  // ou uma service-role/secret do backend. Se só existir ANON/PUBLISHABLE,
  // omitimos Authorization para evitar acoplamento ao formato antigo.
  if (cfg.SUPABASE_SERVICE_ROLE) {
    headers['Authorization'] = 'Bearer ' + cfg.SUPABASE_SERVICE_ROLE;
  }
  return headers;
}

async function readBody(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch (_e) { return text; }
}

async function ensureOk(response, contextLabel) {
  if (response.ok) return;
  const body = await readBody(response);
  const message = (body && body.message) || (body && body.error) || ('Falha em ' + contextLabel);
  if (response.status === 401 || response.status === 403) {
    throw new UnauthorizedError(String(message));
  }
  if (response.status === 400 || response.status === 422) {
    throw new BadRequestError(String(message), body);
  }
  if (response.status === 404) {
    throw new NotFoundError(String(message));
  }
  throw new UpstreamError(String(message), { status: response.status, body });
}

// ---------- AUTH ----------
export async function signInWithPassword(cfg, email, password) {
  const url = cfg.SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/token?grant_type=password';
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'apikey': cfg.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const body = await readBody(res);
  if (!res.ok) {
    const msg = (body && body.error_description) || (body && body.msg) || 'Falha no login.';
    throw new UnauthorizedError(String(msg));
  }
  return body;
}

// ---------- POSTGREST (table select/insert/update/delete) ----------
function buildRestUrl(cfg, table, query) {
  const base = cfg.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/' + encodeURIComponent(table);
  const qs = new URLSearchParams();
  if (query && typeof query === 'object') {
    Object.keys(query).forEach((k) => {
      const v = query[k];
      if (v === undefined || v === null) return;
      qs.append(k, String(v));
    });
  }
  const s = qs.toString();
  return s ? base + '?' + s : base;
}

export async function selectFrom(cfg, table, options = {}) {
  const query = Object.assign({}, options.filters || {});
  if (options.select) query.select = options.select;
  if (options.order) query.order = options.order;
  if (options.limit != null) query.limit = options.limit;
  if (options.offset != null) query.offset = options.offset;
  const url = buildRestUrl(cfg, table, query);
  const headers = buildHeaders(cfg, options.count ? { 'Prefer': 'count=' + options.count } : {});
  const res = await fetchWithTimeout(url, { method: 'GET', headers });
  await ensureOk(res, 'select ' + table);
  const rows = await readBody(res);
  const total = Number(res.headers.get('content-range')?.split('/')?.[1]) || null;
  return { rows: Array.isArray(rows) ? rows : [], total };
}

export async function insertInto(cfg, table, payload, options = {}) {
  const url = buildRestUrl(cfg, table);
  const headers = buildHeaders(cfg, { 'Prefer': options.returning === false ? 'return=minimal' : 'return=representation' });
  const res = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  await ensureOk(res, 'insert ' + table);
  const rows = await readBody(res);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function updateWhere(cfg, table, filters, patch) {
  const url = buildRestUrl(cfg, table, filters);
  const headers = buildHeaders(cfg, { 'Prefer': 'return=representation' });
  const res = await fetchWithTimeout(url, { method: 'PATCH', headers, body: JSON.stringify(patch) });
  await ensureOk(res, 'update ' + table);
  const rows = await readBody(res);
  return Array.isArray(rows) ? rows[0] : rows;
}

export async function deleteWhere(cfg, table, filters) {
  const url = buildRestUrl(cfg, table, filters);
  const headers = buildHeaders(cfg, { 'Prefer': 'return=representation' });
  const res = await fetchWithTimeout(url, { method: 'DELETE', headers });
  await ensureOk(res, 'delete ' + table);
  const rows = await readBody(res);
  return Array.isArray(rows) ? rows[0] : rows;
}

// ---------- STORAGE ----------
export async function uploadToStorage(cfg, path, bytes, contentType) {
  const bucket = cfg.SUPABASE_BUCKET;
  const url = cfg.SUPABASE_URL.replace(/\/+$/, '') + '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + encodeURI(path);
  const headers = {
    'apikey': cfg.SUPABASE_ANON_KEY,
    'Content-Type': contentType || 'application/octet-stream',
    'x-upsert': 'true',
  };
  if (cfg.SUPABASE_SERVICE_ROLE) {
    headers['Authorization'] = 'Bearer ' + cfg.SUPABASE_SERVICE_ROLE;
  }
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: bytes,
  });
  await ensureOk(res, 'upload ' + path);
  return {
    path,
    bucket,
    publicUrl: cfg.SUPABASE_URL.replace(/\/+$/, '') + '/storage/v1/object/public/' + encodeURIComponent(bucket) + '/' + encodeURI(path),
  };
}


export async function deleteFromStorage(cfg, path) {
  const bucket = cfg.SUPABASE_BUCKET;
  const url = cfg.SUPABASE_URL.replace(/\/+$/, '') + '/storage/v1/object/' + encodeURIComponent(bucket) + '/' + encodeURI(path);
  const headers = {
    'apikey': cfg.SUPABASE_ANON_KEY,
  };
  if (cfg.SUPABASE_SERVICE_ROLE) {
    headers['Authorization'] = 'Bearer ' + cfg.SUPABASE_SERVICE_ROLE;
  }
  const res = await fetchWithTimeout(url, {
    method: 'DELETE',
    headers,
  });
  await ensureOk(res, 'delete ' + path);
  return { path, bucket, deleted: true };
}
