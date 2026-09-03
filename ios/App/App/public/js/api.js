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
    var cache = global.LiderCRM && global.LiderCRM.config && global.LiderCRM.config.cache || {};
    if (/\/feed(?:$|\?)/.test(pathname)) return Number(cache.feedTtlMs) || 5000;
    if (/\/notificacoes(?:$|\?)/.test(pathname)) return Number(cache.notificationsTtlMs) || 4000;
    if (/\/dashboard(?:$|\?)/.test(pathname)) return Number(cache.dashboardTtlMs) || 8000;
    return Number(cache.apiDefaultTtlMs) || 15000;
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
  /* ================= LF-FIX-CAPACITOR-APIBASE-20260824 =================
   * BUG CRÍTICO (login no app Capacitor):
   * no bundle nativo (webDir 'www'), a página roda em https://localhost
   * (Capacitor 6/7) ou capacitor://localhost, então caminhos relativos
   * '/api/v1/*' resolviam para https://localhost/api/v1/login → 404/rede
   * → doLogin caía em 'Não foi possível entrar', mesmo com credenciais
   * certas. No PC (mesmo domínio do Worker) isso não acontece.
   *
   * Aqui resolvemos a base de produção em runtime, SOMENTE em plataforma
   * nativa: Capacitor.isNativePlatform() → base = origin do documento
   * atual se NÃO for localhost (ex.: webView aberta em domínio próprio),
   * senão usa LiderCRM.apiBase injetado no index.html; por fim cai para
   * o fallback derivado do ADM_EMAIL (liderfinanceira.com).
   * Em web desktop/mobile continua usando base relativa — comportamento
   * original 100% preservado.
   * ==================================================================== */
  function _lfNativeApiBase(){
    try{
      var Cap = global.Capacitor;
      var native = !!(Cap && ((typeof Cap.isNativePlatform==='function' && Cap.isNativePlatform()) || Cap.platform==='android' || Cap.platform==='ios'));
      if(!native) return '';
      // 1) origem real, se não for o localhost do WebView nativo
      var o = global.location && global.location.origin || '';
      if(/^https?:/i.test(o) && o.indexOf('://localhost')<0 && o.indexOf('://127.0.0.1')<0) return o;
      // 2) base injetada (index.html define LiderCRM.apiBase no <head>)
      var inj = (global.LiderCRM && global.LiderCRM.apiBase) || global.__LF_API_BASE || '';
      if(/^https?:/i.test(inj)) return inj;
      // 3) fallback derivado do e-mail do ADM (adm@liderfinanceira.com)
      var adm = global.ADM_EMAIL || '';
      var m = /^[^@]+@(.+)$/.exec(adm);
      if(m && m[1]) return 'https://' + m[1];
      return '';
    }catch(_e){ return ''; }
  }

  async function request(url, opts) {
    opts = opts || {};
    const isAbsolute = /^https?:/i.test(String(url||''));
    const baseEnv = _lfNativeApiBase() || (global.LiderCRM||{}).apiBase || '';
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

    // Auth padronizada: se não vier Authorization explícita e houver token
    // de sessão, injeta automaticamente — acaba com o padrão legado de cada
    // tela montar 'Bearer ...' na mão. Opt-out: opts.auth === false.
    if (opts.auth !== false && !('Authorization' in headers) && !('authorization' in headers)) {
      const _tok = _sessionToken();
      if (_tok) headers['Authorization'] = 'Bearer ' + _tok;
    }

    let body = undefined;
    if (opts.body !== undefined && opts.body !== null && method !== 'GET' && method !== 'HEAD') {
      body = (typeof opts.body === 'string') ? opts.body : JSON.stringify(opts.body);
    }

    let resp;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(()=>ctrl.abort(), opts.timeout || 30000);
      try {
        resp = await fetch(full, {
          method,
          headers,
          body,
          signal: ctrl.signal,
          credentials: opts.credentials || (isAbsolute ? 'include' : 'same-origin'),
          mode: opts.mode || 'cors'
        });
      } finally {
        clearTimeout(t);
      }
    } catch(err) {
      // Retry padronizado (opts.retries) com backoff exponencial + jitter,
      // apenas para erro de rede (status 0). Erros HTTP sobem sem retry.
      if ((opts.retries | 0) > 0) {
        await _retrySleep(1);
        const r = await request(url, Object.assign({}, opts, { retries: (opts.retries | 0) - 1 }));
        r.fromRetry = true;
        return r;
      }
      return {
        ok: false,
        status: 0,
        message: 'network_error: ' + (err && err.message || err),
        code: 'NETWORK_ERROR'
      };
    }

    let data;
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

    // Retry padronizado para falhas transitórias do servidor/gateway
    // (429 rate-limit, 502/503/504) — backoff exponencial com jitter.
    if (RETRYABLE_STATUS.indexOf(resp.status) >= 0 && (opts.retries | 0) > 0) {
      await _retrySleep(1);
      const r2 = await request(url, Object.assign({}, opts, { retries: (opts.retries | 0) - 1 }));
      r2.fromRetry = true;
      return r2;
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

  /* ================= LF-API-CLIENTE-UNIFICADO-20260902 =================
   * Unificação do acesso a dados (pedido do usuário, 2026-09-02):
   * toda tela passa pelo mesmo cliente de API — sem chamadas legadas
   * diretas (fetch cru com Bearer na mão), com resposta, erro, paginação
   * e retry padronizados.
   *
   * _sessionToken(): lê o token da sessão global S (mesma convenção já
   *   usada em chat.js) — fonte única de autenticação para /api/*.
   * _retrySleep(attempt): backoff exponencial com jitter (base 400ms,
   *   cap 8s) — política única de retry do app.
   * authedRequest(): request() com auth garantida; falha cedo com
   *   AUTH_REQUIRED se não houver sessão, em vez de chamar o servidor
   *   sem credencial e receber 401.
   * authedJson(): authedRequest() que já devolve o JSON cru, para os
   *   pontos que precisam do body exato (ex.: selftest de push).
   * list(): helper de listagens — normaliza a paginação do backend
   *   (limit/hasMore/limitCapped) num shape único { items, total, ... }.
   * ==================================================================== */
  const RETRYABLE_STATUS = [429, 502, 503, 504];

  function _sessionToken(){
    try {
      const S = global.S;
      return (S && (S._workerToken || S.token)) || '';
    } catch(_e) { return ''; }
  }

  function _retrySleep(attempt){
    const base = 400 * Math.pow(2, Math.max(0, attempt - 1));
    const wait = Math.min(8000, base) * (0.75 + Math.random() * 0.5);
    return new Promise(function(res){ setTimeout(res, wait); });
  }

  async function authedRequest(url, opts){
    if (!_sessionToken()) {
      return { ok: false, status: 0, code: 'AUTH_REQUIRED', message: 'Sessão expirada ou ausente.' };
    }
    return request(url, opts);
  }

  async function authedJson(url, opts){
    const r = await authedRequest(url, opts);
    // Mantém o contrato cru de Response: chamador lê .status/.json direto.
    return { status: r.status, ok: r.ok, json: r.data, code: r.code, message: r.message };
  }

  // Rotas de listagem com paginação/limit normalizáveis via list().
  const LIST_ROUTES = new Set([
    '/api/v1/clientes/list',
    '/api/v1/kanban/list',
    '/api/v1/ligacoes/list',
    '/api/v1/atividades/list',
    '/api/v1/notificacoes',
    '/api/v1/feed'
  ]);

  /**
   * list(path, params, opts)
   *  path   : rota de listagem (ver LIST_ROUTES)
   *  params : { limit, offset, ...filtros } — viram querystring
   *  return : { ok, status, items, total, limit, offset, hasMore,
   *             limitCapped, raw, code, message }
   * Normaliza respostas em formatos variados ({data:[...]}, {data:{items}},
   * [...]) para um único shape de paginação.
   */
  async function list(path, params, opts){
    params = params || {};
    const qs = Object.keys(params)
      .filter(function(k){ return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
      .map(function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    const url = qs ? path + '?' + qs : path;
    const r = await request(url, Object.assign({ method: 'GET' }, opts || {}));
    if (!r.ok) return { ok: false, status: r.status, items: [], total: 0, limit: params.limit || 0, offset: params.offset || 0, hasMore: false, limitCapped: false, raw: r.data, code: r.code, message: r.message };

    const d = r.data;
    let items = [], total = 0, hasMore = false, limitCapped = false;
    if (Array.isArray(d)) { items = d; total = d.length; }
    else if (d && Array.isArray(d.data)) { items = d.data; total = (typeof d.total === 'number') ? d.total : d.data.length; hasMore = !!d.hasMore; limitCapped = !!d.limitCapped; }
    else if (d && d.data && Array.isArray(d.data.items)) { items = d.data.items; total = (typeof d.data.total === 'number') ? d.data.total : d.data.items.length; hasMore = !!d.data.hasMore; limitCapped = !!(d.data.limitCapped || d.limitCapped); }
    else if (d && Array.isArray(d.items)) { items = d.items; total = (typeof d.total === 'number') ? d.total : d.items.length; hasMore = !!d.hasMore; limitCapped = !!d.limitCapped; }

    return { ok: true, status: r.status, items, total, limit: params.limit || 0, offset: params.offset || 0, hasMore, limitCapped, raw: d };
  }

  // helpers específicos (login, adminResetPassword) — passthrough tipado
  async function login(email, password){
    return request('/api/v1/login', { method: 'POST', body: { email, password }, auth: false });
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
    global.LiderCRM.api.authedRequest = authedRequest;
    global.LiderCRM.api.authedJson    = authedJson;
    global.LiderCRM.api.list    = list;
    global.LiderCRM.api.login   = login;
    global.LiderCRM.api.adminResetPassword = adminResetPassword;
    // atalhos legacy-friendly
    global.lfApiRequest         = request;
    global.lfApiLogin           = login;
    global.lfApiAdminReset      = adminResetPassword;
    global.lfApiAuthedRequest   = authedRequest;
    global.lfApiList            = list;
    global._lfNativeApiBase     = _lfNativeApiBase;
  } catch(_e){}
})(typeof window !== 'undefined' ? window : globalThis);
