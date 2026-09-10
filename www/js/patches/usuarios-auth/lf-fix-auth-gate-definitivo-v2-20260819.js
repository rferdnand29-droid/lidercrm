/* =====================================================================
 * lf-fix-auth-gate-definitivo-v2-20260819.js
 * ---------------------------------------------------------------------
 * CORREÇÃO DEFINITIVA do erro "Bearer token ausente." (401 em
 * /api/v1/departamentos e /api/v1/departamentos/teams no boot).
 *
 * CAUSA-RAIZ (diagnóstico 2026-08-19):
 *   1) O gate anterior (lf-fix-worker-auth-gate-v1-20260818.js) testa
 *      `path.indexOf('/api/v1/') === 0` — mas config.workerBaseUrl é
 *      ABSOLUTO (https://lidercrm.pages.dev/api), então needsAuth é
 *      SEMPRE false e aquele gate nunca segura request nenhuma em
 *      produção (código morto). Este patch casa /api/v1/ em qualquer
 *      posição da URL (relativa ou absoluta).
 *   2) LF_WHEN_WORKER_AUTH tem fail-open de 15s: estourado o timeout,
 *      dispara _refreshTeamDeptCache/refresh mesmo sem JWT → 401.
 *   3) Nada re-executava os caches que falharam no boot depois que o
 *      JWT finalmente chegava (login manual / bridge tardia).
 *
 * O QUE ESTE PATCH FAZ (aditivo, idempotente, reversível — basta
 * remover o <script>):
 *   [GATE] Envelopa httpClient.request como camada MAIS EXTERNA:
 *      • Rotas públicas (health/login/legacy-nonce/legacy-bridge/
 *        branding) passam direto, como antes.
 *      • Request autenticada SEM JWT válido NÃO vai pra rede (ir pra
 *        rede sem Bearer é 401 garantido + session.clear() colateral):
 *          - existe sessão legada → dispara __lfLegacyAuthBridge.
 *            tryBridge() e SEGURA a request até o JWT chegar
 *            (eventos lf:worker-session-ready / lf:worker-token-synced
 *            + polling), com re-kick da bridge a cada 3s, até 12s;
 *          - JWT chegou → request sai já com Bearer válido;
 *          - não chegou (ex.: registro sem ph, exige login manual) →
 *            resolve com resposta sintética AUTH_PENDING (sem ir à
 *            rede): os .catch existentes (scope-v2, departments-crud)
 *            mantêm o cache local, sem 401 e sem spam no console;
 *          - sem sessão legada nenhuma (deslogado) → AUTH_REQUIRED
 *            imediato, sem espera e sem request.
 *      • Concorrência: uma rajada de requests no boot compartilha UMA
 *        única tentativa de autenticação (_authPending).
 *   [RETRY-401] Se um request COM token levar 401 real (token expirou
 *      entre refreshes), limpa, re-autentica pela bridge e repete o
 *      request UMA vez (somente GET — nunca repete escrita).
 *   [RECOVERY] Quando a sessão do Worker ficar pronta (bridge ou login
 *      manual), re-executa automaticamente LF_DEPARTMENTS.refresh() e
 *      LF_SCOPE_V2.refreshTeamDeptCache() — os dois caches exatos que
 *      falhavam no boot.
 *   [ANTIGATE] Marca http.__gateWrapped=true para o gate de 20260818
 *      (que falharia aberto em 8s) não instalar outra camada por fora;
 *      este patch o subsume integralmente.
 *
 * Diagnóstico em runtime: LF_AUTH_GATE_V2.status()
 * Guard: window.__LF_AUTH_GATE_V2_DEFINITIVO__
 * Carregar DEPOIS de lf-fix-worker-auth-gate-v1-20260818.js.
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__lfFixAuthGateDefinitivoV2) return;
  global.__lfFixAuthGateDefinitivoV2 = true;
  if (global.__LF_AUTH_GATE_V2_DEFINITIVO__) return;
  global.__LF_AUTH_GATE_V2_DEFINITIVO__ = true;

  var TAG        = '[lf-auth-gate-v2]';
  var TOKEN_KEY  = 'lidercrm_worker_jwt_v1';
  var WAIT_MS    = 12000;   // teto segurando request à espera do JWT
  var REKICK_MS  = 3000;    // re-dispara a bridge enquanto espera
  var POLL_MS    = 250;

  /* URL autenticada = contém /api/v1/ em QUALQUER posição (o bug do
     gate anterior era exigir posição 0 — URLs absolutas nunca casavam).
     Rotas públicas continuam liberadas sem JWT. */
  var API_RE    = /\/api\/v1\//;
  var PUBLIC_RE = /\/api\/v1\/(health|login|session\/legacy-nonce|session\/legacy-bridge|branding)(?:\?|$)/;

  function log(){  try{ console.log.apply(console,  [TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function warn(){ try{ console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }

  function _http(){
    return safe(function(){
      return global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.httpClient;
    }, null);
  }
  function _sessionValid(){
    var h = _http();
    return !!(h && h.session && typeof h.session.isValid === 'function' && safe(function(){ return h.session.isValid(); }, false));
  }
  /* Ressuscita sessão a partir do localStorage se a cópia em memória
     foi limpa por algum 401 anterior mas o token gravado ainda vale. */
  function _healFromStorage(){
    if (_sessionValid()) return true;
    return safe(function(){
      var raw = global.localStorage && global.localStorage.getItem(TOKEN_KEY);
      if (!raw) return false;
      var o = JSON.parse(raw);
      if (!o || !o.token || !o.expiresAt || o.expiresAt <= Date.now() + 5000) return false;
      var h = _http();
      if (!h || !h.session || typeof h.session.set !== 'function') return false;
      h.session.set(o.token, Math.max(1, Math.floor((o.expiresAt - Date.now())/1000)), o.user || null);
      log('sessão reidratada a partir do localStorage');
      return true;
    }, false);
  }
  function _hasLegacySession(){
    if (safe(function(){ return !!(global.S && global.S.userId); }, false)) return true;
    return safe(function(){
      var raw = global.localStorage && global.localStorage.getItem('lf6_s');
      if (!raw) return false;
      var s = JSON.parse(raw);
      return !!(s && s.userId);
    }, false);
  }
  function _kickBridge(){
    return safe(function(){
      var b = global.__lfLegacyAuthBridge;
      if (b && typeof b.tryBridge === 'function'){ b.tryBridge(); return true; }
      return false;
    }, false);
  }

  /* ------------------------------------------------------------------
   * ensureAuth(): promise ÚNICA compartilhada por toda a rajada de
   * requests do boot. Resolve true (JWT válido) ou false (sem como
   * autenticar agora). Nunca rejeita.
   * ------------------------------------------------------------------ */
  var _authPending = null;
  function ensureAuth(){
    if (_healFromStorage()) return Promise.resolve(true);
    if (_authPending) return _authPending;
    if (!_hasLegacySession()){
      return Promise.resolve(false); // deslogado de verdade — sem espera
    }
    _authPending = new Promise(function(resolve){
      var done = false;
      var iv = null, to = null, kickIv = null;
      function fin(ok){
        if (done) return;
        done = true;
        safe(function(){ global.removeEventListener('lf:worker-session-ready', onEvt, true); });
        safe(function(){ global.removeEventListener('lf:worker-token-synced', onEvt, true); });
        if (iv)     clearInterval(iv);
        if (to)     clearTimeout(to);
        if (kickIv) clearInterval(kickIv);
        _authPending = null;
        if (ok) log('JWT do Worker pronto — requests retidos foram liberados');
        else    warn('JWT não chegou em ' + (WAIT_MS/1000) + 's — requests respondem AUTH_PENDING localmente (sem 401 na rede)');
        resolve(!!ok);
      }
      function onEvt(ev){
        if (ev && ev.type === 'lf:worker-token-synced' && ev.detail && ev.detail.hasToken === false) return;
        if (_sessionValid()) fin(true);
      }
      safe(function(){ global.addEventListener('lf:worker-session-ready', onEvt, true); });
      safe(function(){ global.addEventListener('lf:worker-token-synced', onEvt, true); });
      iv = setInterval(function(){ if (_healFromStorage()) fin(true); }, POLL_MS);
      to = setTimeout(function(){ fin(_sessionValid()); }, WAIT_MS);
      _kickBridge();
      kickIv = setInterval(function(){ if (!done) _kickBridge(); }, REKICK_MS);
    });
    return _authPending;
  }

  function _isGet(options){
    var m = (options && options.method) || 'GET';
    return String(m).toUpperCase() === 'GET';
  }
  function _synthetic(status, code, path){
    return {
      ok: false,
      status: status,
      headers: null,
      _syntheticAuth: true,
      data: { ok: false, error: {
        code: code,
        message: code === 'AUTH_REQUIRED'
          ? 'Sem sessão na nuvem (deslogado) — request não enviada, mantidos dados locais.'
          : 'Autenticação da nuvem ainda pendente — request adiada, mantidos dados locais.',
        details: { path: String(path || ''), synthetic: true } // [FIX 20260826] shape confirmado
      } }
    };
  }

  /* ------------------------------------------------------------------
   * [RECOVERY] Assim que a sessão ficar pronta, refaz os caches que o
   * boot derrubava com 401 (departamentos e mapa team→departamento).
   * ------------------------------------------------------------------ */
  var _recoverT = null;
  function _recover(){
    if (_recoverT) clearTimeout(_recoverT);
    _recoverT = setTimeout(function(){
      _recoverT = null;
      if (!_sessionValid()) return;
      safe(function(){
        if (global.LF_DEPARTMENTS && typeof global.LF_DEPARTMENTS.refresh === 'function'){
          global.LF_DEPARTMENTS.refresh();
          log('recovery: LF_DEPARTMENTS.refresh() re-executado');
        }
      });
      safe(function(){
        if (global.LF_SCOPE_V2 && typeof global.LF_SCOPE_V2.refreshTeamDeptCache === 'function'){
          global.LF_SCOPE_V2.refreshTeamDeptCache();
          log('recovery: LF_SCOPE_V2.refreshTeamDeptCache() re-executado');
        }
      });
    }, 300);
  }
  safe(function(){
    global.addEventListener('lf:worker-session-ready', _recover, true);
    global.addEventListener('lf:worker-token-synced', function(ev){
      if (ev && ev.detail && ev.detail.hasToken === false) return;
      _recover();
    }, true);
  });

  /* ------------------------------------------------------------------
   * [GATE] Instalação como camada mais externa de httpClient.request,
   * com re-asserção periódica (outro patch pode envelopar depois).
   * ------------------------------------------------------------------ */
  var _stats = { held: 0, syntheticPending: 0, syntheticRequired: 0, retried401: 0, passthrough: 0 };
  var _ourWrapper = null;
  var _prevFn = null;

  function _wrap(){
    var http = _http();
    if (!http || typeof http.request !== 'function') return false;
    if (http.request === _ourWrapper) return true; // já somos os mais externos

    _prevFn = http.request;
    /* [ANTIGATE] impede o gate de 20260818 (fail-open em 8s, e cego a
       URL absoluta) de instalar camada própria por cima da nossa. */
    try{ http.__gateWrapped = true; }catch(_e){}

    _ourWrapper = function(path, options){
      var p = String(path || '');
      /* rota pública ou fora da API → fluxo original */
      if (!API_RE.test(p) || PUBLIC_RE.test(p)){
        return _prevFn.call(http, path, options);
      }
      /* sessão válida → segue direto; um 401 real (token expirou no
         meio do caminho) re-autentica e repete UMA vez, só GET. */
      if (_sessionValid()){
        _stats.passthrough++;
        return Promise.resolve(_prevFn.call(http, path, options)).then(function(res){
          if (res && res.status === 401 && !res._syntheticAuth && _isGet(options) && _hasLegacySession()){
            _stats.retried401++;
            warn('401 real com token em GET ' + p + ' — re-autenticando e repetindo 1x');
            return ensureAuth().then(function(ok){
              if (!ok) return res;
              return _prevFn.call(http, path, options);
            });
          }
          return res;
        });
      }
      /* sem JWT: segura, tenta autenticar, NUNCA sai sem Bearer */
      _stats.held++;
      return ensureAuth().then(function(ok){
        if (!ok){
          if (_hasLegacySession()){ _stats.syntheticPending++;  return _synthetic(401, 'AUTH_PENDING',  p); }
          _stats.syntheticRequired++;
          return _synthetic(401, 'AUTH_REQUIRED', p);
        }
        return _prevFn.call(http, path, options);
      });
    };
    _ourWrapper.__lfAuthGateV2 = true;
    http.request = _ourWrapper;
    log('gate v2 instalado como camada externa de httpClient.request');
    return true;
  }

  /* instala agora e re-tenta/re-assegura por até ~2min (httpClient pode
     montar depois, ou outro patch pode envelopar request depois de nós) */
  var _installTries = 0;
  (function _install(){
    _installTries++;
    var ok = _wrap();
    if (_installTries < 120){
      setTimeout(_install, ok ? 2000 : 250);
    }
  })();
  safe(function(){ global.addEventListener('lf:app-started', function(){ _wrap(); }, true); });

  /* -------- diagnóstico público -------- */
  global.LF_AUTH_GATE_V2 = {
    version: 'v2-20260819',
    kick: function(){ return ensureAuth(); },
    recover: _recover,
    status: function(){
      return {
        instalado: !!_ourWrapper,
        somosExternos: !!(_http() && _http().request === _ourWrapper),
        sessaoValida: _sessionValid(),
        temSessaoLegada: _hasLegacySession(),
        authPendente: !!_authPending,
        stats: JSON.parse(JSON.stringify(_stats))
      };
    }
  };

  log('v2-20260819 ativo — requests /api/v1 autenticadas nunca mais saem sem Bearer. Diagnóstico: LF_AUTH_GATE_V2.status()');
})(window);
