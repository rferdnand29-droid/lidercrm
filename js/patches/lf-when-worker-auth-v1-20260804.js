/* lf-when-worker-auth-v1-20260804 | gate compartilhado "só chame o backend com JWT"
 * ------------------------------------------------------------------------------
 * Problema: vários patches (scope-v2, departments-crud, zombie-users) faziam a
 * PRIMEIRA chamada autenticada ao worker antes da ponte de token
 * (lf-fix-raiz-token-quota) ter espelhado o JWT em S._workerToken —
 * resultado: blocos de 401 na subida do app.
 *
 * Solução: helper único `LF_WHEN_WORKER_AUTH(fn)` que adia `fn` até:
 *   - o evento 'lf:worker-token-synced' com hasToken=true; OU
 *   - S._workerToken / S.token já existir (caso o evento já tenha passado); OU
 *   - um polling barato (300ms) detectar o token; OU
 *   - timeout de segurança de 15s: só libera a callback se existir uma
 *     sessão legada para recuperar; sem sessão, cancela silenciosamente.
 * Idempotente, sem dependências, carrega antes de qualquer patch consumidor.
 * ------------------------------------------------------------------------------ */
(function(global){
  'use strict';
  if(global.__LF_WHEN_WORKER_AUTH_V1__)return;
  global.__LF_WHEN_WORKER_AUTH_V1__=true;

  var TIMEOUT_MS=15000;
  var POLL_MS=300;

  function _hasToken(){
    try{
      var s=global.S||{};
      if(s._workerToken||s.token)return true;
      if(global.__LF_WORKER_JWT)return true;
      var hc=global.LiderCRM&&global.LiderCRM.api&&global.LiderCRM.api.httpClient;
      var sess=hc&&hc.session;
      if(sess&&typeof sess.get==='function'){
        var cur=sess.get();
        if(cur&&cur.token)return true;
      }
    }catch(_e){}
    return false;
  }

  function _hasLegacySession(){
    try{
      var s=global.S||{};
      if(s.userId)return true;
      var raw=global.localStorage&&global.localStorage.getItem('lf6_s');
      if(!raw)return false;
      var parsed=JSON.parse(raw);
      return !!(parsed&&parsed.userId);
    }catch(_e){return false;}
  }

  global.LF_WHEN_WORKER_AUTH=function(fn){
    if(typeof fn!=='function')return;
    if(_hasToken()){
      try{fn();}catch(_e){try{console.warn('[lf-when-worker-auth] fn throw',_e);}catch(_e2){}}
      return;
    }
    var done=false;
    function stop(){
      if(done)return;
      done=true;
      try{global.removeEventListener('lf:worker-token-synced',onEvt,true);}catch(_e){}
      try{clearInterval(iv);}catch(_e){}
      try{clearTimeout(to);}catch(_e){}
    }
    function run(){
      if(done)return;
      stop();
      try{fn();}catch(_e){try{console.warn('[lf-when-worker-auth] fn throw',_e);}catch(_e2){}}
    }
    function onEvt(ev){
      if(ev&&ev.detail&&ev.detail.hasToken===false)return; /* token limpo — continua esperando */
      run();
    }
    var iv=setInterval(function(){ if(_hasToken())run(); },POLL_MS);
    var to=setTimeout(function(){
      if(_hasLegacySession()){
        try{console.debug('[lf-when-worker-auth] timeout de '+TIMEOUT_MS+'ms — recuperando sessão legada');}catch(_e){}
        run();
      }else{
        stop();
      }
    },TIMEOUT_MS);
    try{global.addEventListener('lf:worker-token-synced',onEvt,true);}catch(_e){}
  };
})(window);
