/* =====================================================================
 * api.js — wrapper mínimo para POST /api/v1/*  (anti GET-405)
 * ---------------------------------------------------------------------
 * FIX DEFINITIVO (2026-07-27): a raiz do
 *     { code: "METHOD_NOT_ALLOWED", details: { allowed: ["POST"] } }
 * é uma chamada acidental via GET (cache do SW, hot-link, ou teste
 * manual no navegador) para uma rota /api/* que só aceita POST.
 *
 * Em vez de "engolir" e deixar o erro subir cru pro usuário, este
 * wrapper:
 *
 *   1. Força method='POST' em rotas registradas em _POST_ONLY_ROUTES
 *      (sinaliza via console.warn — não troca silenciosamente, pra
 *      você caçar o bug de origem; mas faz o retry pra evitar UX
 *      quebrada).
 *   2. Quando o servidor responde 405 com allowed[] != method enviado,
 *      refaz automaticamente a chamada com o method correto.
 *   3. Renormaliza erros {"ok":false,"error":{code, message}} na forma
 *      { code, message, details, ok:false } sem mudar o shape do JSON.
 * ===================================================================== */

(function(global){
  'use strict';
  if (!global || !global.document) return;
  if (global.__lf_api_client_v1_20260727) return;
  global.__lf_api_client_v1_20260727 = true;

  const POST_ONLY = new Set([
    '/api/v1/login',
    '/api/v1/logout',
    '/api/v1/usuarios/admin-reset-password',
    '/api/v1/usuarios/create',
    '/api/v1/usuarios/update',
    '/api/v1/usuarios/delete',
    '/api/v1/usuarios/toggle',
    '/api/v1/session/legacy-bridge',
    '/api/v1/chat/send',
    '/api/v1/notificacoes/mark-read',
    '/api/v1/agenda/create',
    '/api/v1/agenda/update',
    '/api/v1/agenda/delete',
    '/api/v1/leads/create',
    '/api/v1/leads/update',
    '/api/v1/leads/delete',
    '/api/v1/leads/move-stage',
    '/api/v1/negocios/create',
    '/api/v1/negocios/update',
    '/api/v1/negocios/delete',
    '/api/v1/clientes/create',
    '/api/v1/clientes/update',
    '/api/v1/clientes/delete',
    '/api/v1/relatorios/gerar'
  ]);

  function _isPostOnly(pathname) {
    if (!pathname) return false;
    if (POST_ONLY.has(pathname)) return true;
    for (const r of POST_ONLY) {
      if (pathname === r) return true;
    }
    return false;
  }
  function _sharedData(){
    try { return (global.LiderCRM && global.LiderCRM.sharedData) || null; } catch(_e) { return null; }
  }

  function _canCache(method, pathname) {
    if (method !== 'GET' || !pathname) return false;
    return /^\/api\/v1\/(clientes\/list|kanban\/list|ligacoes\/list|atividades\/list|usuarios(?:\/config)?|dashboard|feed|notificacoes|agenda-slots)(?:$|\?)/.test(pathname);
  }

  function _cacheTtl(pathname) {
    if (/\/feed(?:$|\?)/.test(pathname)) return 5000;
    if (/\/notificacoes(?:$|\?)/.test(pathname)) return 4000;
    if (/\/dashboard(?:$|\?)/.test(pathname)) return 8000;
    return 15000;
  }

  /**
   * request(url, opts)
   *  url      : path absoluto (começando com /api/...) ou URL completa
   *  opts.method : default 'POST' para rota POST-only, senão 'GET'
   *  opts.body    : objeto → JSON.stringify; string → cru
   *  opts.headers : additional headers (Content-Type default application/json)
   *  opts.timeout : ms (default 30000)
   *  opts.retries : nº de retries (default 0). Se 405 com allowed, refaz 1x.
   *  return: { ok, status, data, message, code, allowed }
   */
  async function request(url, opts) {
    opts = opts || {};
    const isAbsolute = /^https?:/i.test(String(url||''));
    const baseEnv = (global.LiderCRM||{}).apiBase || '';
    const full = isAbsolute ? String(url) : (baseEnv + url);

    let method = (opts.method || '').toUpperCase();
    let pathname = '';
    let cacheKey = '';
    let search = '';
    if (!method) {
      try {
        const u = new URL(full, global.location.href);
        pathname = u.pathname;
        search = u.search || '';
        method = _isPostOnly(u.pathname) ? 'POST' : 'GET';
      } catch(_e) { method = 'GET'; }
    }
    if (!pathname) {
      try {
        const u2 = new URL(full, global.location.href);
        pathname = u2.pathname;
        search = u2.search || '';
      } catch(_e) { pathname = ''; search = ''; }
    }

    const sd = _sharedData();
    if (_canCache(method, pathname) && sd && typeof sd.httpCacheKey === 'function') {
      cacheKey = sd.httpCacheKey(method, pathname + search, null);
      try {
        const cached = await sd.httpCacheGet(cacheKey);
        if (cached) return cached;
      } catch(_e){}
    }

    const headers = Object.assign({
      'content-type': 'application/json',
      'accept': 'application/json',
      'x-lf-client': 'web'
    }, opts.headers || {});

    let body = undefined;
    if (opts.body !== undefined && opts.body !== null && method !== 'GET' && method !== 'HEAD') {
      body = (typeof opts.body === 'string') ? opts.body : JSON.stringify(opts.body);
    }

    const ctrl = new AbortController();
    const t = setTimeout(()=>ctrl.abort(), opts.timeout || 30000);

    let resp;
    try {
      resp = await fetch(full, {
        method,
        headers,
        body,
        signal: ctrl.signal,
        credentials: opts.credentials || (isAbsolute ? 'include' : 'same-origin'),
        mode: opts.mode || 'cors'
      });
    } catch(err) {
      clearTimeout(t);
      return {
        ok: false,
        status: 0,
        message: 'network_error: ' + (err && err.message || err),
        code: 'NETWORK_ERROR'
      };
    }
    clearTimeout(t);

    let data = null;
    const ct = (resp.headers.get('content-type')||'').toLowerCase();
    if (ct.indexOf('application/json') >= 0) {
      try { data = await resp.json(); } catch(_e) { data = null; }
    } else {
      try { data = await resp.text(); } catch(_e) { data = null; }
    }

    let allowed = null;
    if (resp.status === 405) {
      try {
        const a = (resp.headers.get('allow')||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
        if (a.length) allowed = a;
        else if (data && data.error && data.error.details && Array.isArray(data.error.details.allowed)) {
          allowed = data.error.details.allowed;
        }
      } catch(_e){}
    }

    if (resp.status === 405 && allowed && allowed.length && allowed.indexOf(method) < 0) {
      const tryMethod = allowed[0];
      console.warn('[api] 405 em', full, '— reenviando como', tryMethod);
      const retry = await request(full, Object.assign({}, opts, { method: tryMethod }));
      retry.fromRetry = true;
      return retry;
    }

    const ok = resp.ok && (!data || data.ok !== false);
    const errShape = data && data.error;
    const out = {
      ok,
      status: resp.status,
      allowed,
      data,
      message: errShape && errShape.message,
      code: errShape && errShape.code
    };

    try {
      if (ok && cacheKey && sd && typeof sd.httpCachePut === 'function') sd.httpCachePut(cacheKey, out, _cacheTtl(pathname));
      if (ok && method !== 'GET' && sd && typeof sd.httpCacheInvalidatePrefix === 'function') sd.httpCacheInvalidatePrefix('GET::');
    } catch(_e){}

    return out;
  }

  // helpers específicos (login, adminResetPassword) — passthrough tipado
  async function login(email, password){
    return request('/api/v1/login', { method: 'POST', body: { email, password } });
  }
  async function adminResetPassword(targetUserId, newPassword){
    return request('/api/v1/usuarios/admin-reset-password', {
      method: 'POST',
      body: { targetUserId, newPassword }
    });
  }

  // expõe
  try {
    global.LiderCRM = global.LiderCRM || {};
    global.LiderCRM.api = global.LiderCRM.api || {};
    global.LiderCRM.api.request = request;
    global.LiderCRM.api.login   = login;
    global.LiderCRM.api.adminResetPassword = adminResetPassword;
    // atalhos legacy-friendly
    global.lfApiRequest         = request;
    global.lfApiLogin           = login;
    global.lfApiAdminReset      = adminResetPassword;
  } catch(_e){}
})(typeof window !== 'undefined' ? window : globalThis);
