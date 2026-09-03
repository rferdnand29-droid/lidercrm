/* lf-fix-worker-auth-gate-v1-20260818.js
 * Aditivo. 1) Loga em warn o motivo real do aborto da bridge.
 * 2) Gate único: requests /api/v1 autenticadas aguardam o JWT
 *    (evento lf:worker-session-ready) por até 8s antes de sair sem token.
 *    Se não houver sessão legada ou a bridge falhar, comportamento
 *    antigo é preservado (request segue e o fallback local atua). */
(function(global){
  'use strict';
  if (global.__lfFixWorkerAuthGateV1) return;
  global.__lfFixWorkerAuthGateV1 = true;
  var g = global.__lf_guards = global.__lf_guards || {};
  if (g['workerAuthGate.v1']) return; g['workerAuthGate.v1'] = true;
  var TAG = '[lf-auth-gate]';

  // (a) Bridge verbosa: embrulha tryBridge para expor o motivo do false
  function wrapBridge(){
    var b = global.__lfLegacyAuthBridge;
    if (!b || typeof b.tryBridge !== 'function' || b.__gateWrapped) return;
    var orig = b.tryBridge;
    b.tryBridge = function(){
      return orig().then(function(r){
        if (r === false){
          var S = global.S, uid = S && S.userId;
          var u = uid && typeof global.getUser === 'function' ? global.getUser(uid) : null;
          console.warn(TAG, 'bridge não emitiu JWT. Motivo provável:',
            !uid ? 'sem sessão legada (S.userId)'
            : !u ? 'getUser(' + uid + ') não achou registro local'
            : !u.ph ? 'registro local SEM ph (veio da nuvem, que faz scrub) — exige login manual via /api/v1/login'
            : 'nonce/HMAC falhou ou workerClient indisponível');
        }
        return r;
      });
    };
    b.__gateWrapped = true;
  }

  // (b) Gate no httpClient.request
  function installGate(){
    var api = global.LiderCRM && global.LiderCRM.api;
    var http = api && api.httpClient;
    if (!http || typeof http.request !== 'function' || http.__gateWrapped) return;
    var PUBLIC = /^\/api\/v1\/(health|login|session\/legacy-nonce|session\/legacy-bridge|branding)(?:\?|$)/;
    var orig = http.request;
    function waitJwt(ms){
      return new Promise(function(res){
        if (http.session.isValid()) return res(true);
        var done = false;
        function fin(ok){ if (done) return; done = true;
          global.removeEventListener('lf:worker-session-ready', onR); res(ok); }
        function onR(){ fin(true); }
        global.addEventListener('lf:worker-session-ready', onR);
        setTimeout(function(){ fin(http.session.isValid()); }, ms);
      });
    }
    http.request = function(path, options){
      var needsAuth = typeof path === 'string' && path.indexOf('/api/v1/') === 0 && !PUBLIC.test(path);
      var hasLegacy = !!(global.S && global.S.userId);
      if (!needsAuth || http.session.isValid() || !hasLegacy){
        return orig.call(http, path, options);
      }
      // Tenta a ponte e aguarda o JWT antes de disparar (máx 8s)
      var b = global.__lfLegacyAuthBridge;
      var kick = (b && typeof b.tryBridge === 'function') ? b.tryBridge() : Promise.resolve(false);
      return Promise.resolve(kick).then(function(){ return waitJwt(8000); })
        .then(function(got){
          if (!got) console.warn(TAG, 'JWT não chegou em 8s — request segue sem Bearer (fallback local):', path);
          return orig.call(http, path, options);
        });
    };
    http.__gateWrapped = true;
  }

  function boot(){ wrapBridge(); installGate(); }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else { boot(); }
  // Re-tenta embrulhar caso a bridge tenha carregado depois
  setTimeout(boot, 500); setTimeout(boot, 2000);
})(window);
