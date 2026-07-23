/* =====================================================================
 * lf-legacy-auth-bridge-v1-20260717.js  (Fase 3.2)
 * ---------------------------------------------------------------------
 * Ponte de autenticação entre o login LEGADO do CRM (users em
 * localStorage / config/users) e o JWT do Worker. Roda 100% no cliente,
 * sem exigir mexer no auth.js legado, e é totalmente idempotente
 * (guardrail lf.legacyAuthBridge.v1 — não roda duas vezes).
 *
 * Fluxo:
 *   1) Espera existir sessão legada (S.userId + S.email) e o usuário
 *      correspondente no getUsers()/loadUsersDB().
 *   2) Se já existe JWT do Worker válido (api.httpClient.session.isValid),
 *      não faz nada.
 *   3) Caso contrário:
 *        a) GET  /api/v1/session/legacy-nonce?uid=&email=  -> {ts}
 *        b) sig = HMAC-SHA256(JWT_SECRET_DERIVED, `${uid}|${email}|${ts}|${ph}`)
 *           obs.: o Worker recomputa o HMAC do lado servidor usando o
 *           mesmo JWT_SECRET e o `ph` que já tem no fs_documents —
 *           então o cliente NÃO precisa saber JWT_SECRET; ele só
 *           precisa provar que conhece `ph`. Para isso, o cliente usa
 *           o próprio `ph` como *chave HMAC* (compatível com o mesmo
 *           material do servidor porque JWT_SECRET aqui participa como
 *           parte do próprio material — ver auth-service.js).
 *        c) POST /api/v1/session/legacy-bridge  { uid, email, ts, sig }
 *           -> JWT do Worker, salvo em api.httpClient.session.
 *
 * Segurança:
 *   • `ph` NUNCA sai do dispositivo (só é usado localmente como material
 *     do HMAC).
 *   • Janela de validade do nonce = 60s no servidor.
 *   • Se o user não tem `ph` (ex.: primeiro login pós-migração), o
 *     bridge é abortado silenciosamente — o próximo login vai emitir
 *     JWT direto pelo /api/v1/login (que aceita legado agora).
 *
 * Após o sucesso:
 *   • dispara `window.dispatchEvent(new CustomEvent('lf:worker-session-ready'))`
 *   • marca `window.__lf_worker_session_source = 'legacy-bridge'`
 * ===================================================================== */
(function(global){
  'use strict';
  if (!global || !global.document) return;
  var guard = global.__lf_guards = global.__lf_guards || {};
  if (guard['legacyAuthBridge.v1']) return;
  guard['legacyAuthBridge.v1'] = true;

  var LOG_PREFIX = '[lf-legacy-auth-bridge]';
  function log(){ if (global.console && global.console.debug) try { console.debug.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch(_e){} }

  function root(){ return global.LiderCRM || {}; }
  function cfg(){ return (root().config || {}); }
  function api(){ return (root().api || {}); }

  function isBridgeEnabled(){
    var c = cfg();
    return c && c.useLegacyAuthBridge !== false;
  }
  function hasValidWorkerJwt(){
    var http = api().httpClient;
    return !!(http && http.session && http.session.isValid && http.session.isValid());
  }
  function currentLegacySession(){
    // S global do CRM legado (auth.js) + fallback ao lf6_s persistido.
    var S = global.S;
    if (!S || !S.userId) {
      try {
        var raw = global.localStorage && global.localStorage.getItem('lf6_s');
        if (raw) S = JSON.parse(raw);
      } catch(_e){}
    }
    return (S && S.userId) ? S : null;
  }
  function findUserRecord(uid){
    // getUsers() já é global no legado (js/usuarios.js).
    if (typeof global.getUser === 'function'){
      try { var u = global.getUser(uid); if (u) return u; } catch(_e){}
    }
    if (typeof global.getUsers === 'function'){
      try {
        var list = global.getUsers();
        if (Array.isArray(list)){
          for (var i = 0; i < list.length; i++){
            if (list[i] && String(list[i].id) === String(uid)) return list[i];
          }
        }
      } catch(_e){}
    }
    return null;
  }

  // ------------ HMAC-SHA256 (hex) usando WebCrypto do browser ------------
  function _bufToHex(buf){
    var arr = new Uint8Array(buf); var hex = '';
    for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2,'0');
    return hex;
  }
  function hmacSha256Hex(keyStr, msgStr){
    if (!(global.crypto && global.crypto.subtle)){
      return Promise.reject(new Error('crypto_subtle_unavailable'));
    }
    var enc = new TextEncoder();
    return global.crypto.subtle.importKey(
      'raw', enc.encode(String(keyStr || '')),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    ).then(function(key){
      return global.crypto.subtle.sign('HMAC', key, enc.encode(String(msgStr || '')));
    }).then(_bufToHex);
  }

  // ------------ Fluxo principal ------------
  var _inFlight = null;
  function tryBridge(){
    if (!isBridgeEnabled()) { log('desativado por config'); return Promise.resolve(false); }
    if (hasValidWorkerJwt()) { log('já tem JWT válido — nada a fazer'); return Promise.resolve(true); }
    if (_inFlight) return _inFlight;

    var sess = currentLegacySession();
    if (!sess) { log('sem sessão legada — aguardando'); return Promise.resolve(false); }
    var uid = String(sess.userId);
    var email = String(sess.email || '').trim().toLowerCase();
    if (!uid || !email) { log('sessão legada sem uid/email'); return Promise.resolve(false); }

    var u = findUserRecord(uid);
    if (!u) { log('user record não encontrado ainda'); return Promise.resolve(false); }
    var ph = String(u.ph || '');
    if (!ph) { log('user sem ph — bridge abortado (usuário precisa logar via /login)'); return Promise.resolve(false); }

    var wc = api().workerClient;
    if (!wc || typeof wc.legacyNonce !== 'function' || typeof wc.legacyBridge !== 'function'){
      log('workerClient sem métodos de bridge — ignorado');
      return Promise.resolve(false);
    }

    _inFlight = wc.legacyNonce(uid, email).then(function(nonce){
      if (!nonce || typeof nonce.ts !== 'number'){
        throw new Error('nonce_invalido');
      }
      // Contrato do HMAC (idêntico ao auth-service.js do Worker):
      //   chave    = ph  (hash da senha do user, só conhecido pelo
      //                    cliente e pelo Worker)
      //   material = `${uid}|${email}|${ts}|${ph}`
      // Quem NÃO conhece `ph` não consegue forjar a assinatura, e o
      // `ph` nunca trafega pela rede em nenhum momento.
      var material = uid + '|' + email + '|' + String(nonce.ts) + '|' + ph;
      return hmacSha256Hex(ph, material).then(function(sig){
        return wc.legacyBridge({
          uid: uid, email: email, ts: nonce.ts, sig: sig
        });
      });
    }).then(function(result){
      if (result && result.token){
        global.__lf_worker_session_source = 'legacy-bridge';
        try { global.dispatchEvent(new CustomEvent('lf:worker-session-ready', { detail: { source: 'legacy-bridge' } })); } catch(_e){}
        log('JWT emitido pela ponte legada, source=legacy-bridge, user=', result.user && result.user.email);
        return true;
      }
      log('bridge respondeu sem token');
      return false;
    }).catch(function(err){
      // Não escala erro: o app continua operando via fallback legado.
      log('bridge falhou:', err && err.message);
      return false;
    }).finally(function(){ _inFlight = null; });

    return _inFlight;
  }

  // ------------ Disparadores ------------
  // 1) Ao subir o app (DOMContentLoaded / arch pronto)
  function scheduleInitial(){
    // aguarda um pouquinho pra garantir que os users legados foram
    // carregados (loadUsersDB é assíncrono no primeiro boot).
    setTimeout(tryBridge, 800);
    setTimeout(tryBridge, 2500);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive'){
    scheduleInitial();
  } else {
    document.addEventListener('DOMContentLoaded', scheduleInitial, { once: true });
  }
  // 2) Quando o app legado terminar o startApp() (bootApp), tentar de novo.
  global.addEventListener('lf:app-started', tryBridge);
  // 3) Após o login legado (o botão "Entrar" chama doLogin que chama startApp).
  //    Instrumenta uma polling curta que detecta troca de S.userId.
  var _lastUid = null;
  setInterval(function(){
    var s = currentLegacySession();
    var uid = s && s.userId ? String(s.userId) : null;
    if (uid && uid !== _lastUid){
      _lastUid = uid;
      tryBridge();
    } else if (!uid){
      _lastUid = null;
      // Se o legado deslogou, também limpa o JWT do Worker (Fase 3.2:
      // desligar o legado de forma controlada).
      var http = api().httpClient;
      if (http && http.session && http.session.isValid && http.session.isValid()){
        try { http.session.clear(); } catch(_e){}
        log('sessão legada caiu — JWT do Worker limpo');
      }
    }
  }, 1500);

  // Exposto para debug/manual
  global.__lfLegacyAuthBridge = { tryBridge: tryBridge };
})(window);
