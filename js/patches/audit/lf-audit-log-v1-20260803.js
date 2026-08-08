/* lf-audit-log-v1-20260803 | Fase 3.5 — Log de segurança
 * ----------------------------------------------------------
 * Registra eventos-chave (login, logout, troca de senha, mudança de
 * departamento/supervisor, exclusão, transferência de lead, visualização
 * de dados sensíveis). Grava em ring-buffer local (limite 5000 entradas)
 * e sincroniza no worker/Supabase quando disponível.
 * ----------------------------------------------------------
 *
 * CHANGELOG
 *   v1.2-20260803 — fix: retry de instalação agendava _hookGlobals em
 *     vez de _install, então só tentava 2x (não ~20x/10s como o código
 *     sugeria). Funções login/logout definidas depois de ~500ms pelo
 *     app nunca eram interceptadas pelo log de auditoria.
 * ----------------------------------------------------------
 */
(function(global){
  'use strict';
  if(global.__LF_AUDIT_LOG_V1__)return;
  global.__LF_AUDIT_LOG_V1__=true;

  var TAG='[lf-audit]';
  var LS_KEY='lf_audit_ring_v1';
  var MAX=5000;

  function _log(){try{console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _wc(){
    var root=global.LiderCRM;
    return (root && root.api && root.api.workerClient) || global.workerClient || null;
  }
  function _uid(){ return (global.S && global.S.userId) || null; }

  function _readRing(){
    try{
      var raw=localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(_e){ return []; }
  }
  function _writeRing(arr){
    if(arr.length>MAX) arr=arr.slice(arr.length-MAX);
    try{ localStorage.setItem(LS_KEY, JSON.stringify(arr)); }catch(_e){}
  }

  function logEvent(action, data){
    var evt={
      ts:new Date().toISOString(),
      actor:_uid(),
      action:String(action||'unknown'),
      data:data||{}
    };
    var ring=_readRing();
    ring.push(evt);
    _writeRing(ring);

    var wc=_wc();
    if(wc && typeof wc.saveDocument==='function'){
      var docId='audit_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);
      Promise.resolve().then(function(){ return wc.saveDocument('audit/'+docId, evt); })
        .catch(function(){ /* silencioso — já persistido local */ });
    }
    _log(action, data);
    return evt;
  }

  function tail(n){
    n=n||50;
    var ring=_readRing();
    return ring.slice(-n);
  }
  function filter(predicate){
    return _readRing().filter(predicate||function(){return true;});
  }
  function exportJSON(){
    var blob=new Blob([JSON.stringify(_readRing(),null,2)],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;
    a.download='lf-audit-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); a.remove(); },500);
  }
  function clear(){ try{ localStorage.removeItem(LS_KEY); }catch(_e){} }

  /* auto-hook em eventos comuns já existentes (não substitui, apenas observa) */
  function _hookGlobals(){
    var count=0;
    ['login','logout','doLogin','doLogout','changePassword','resetPassword']
      .forEach(function(fn){
        if(typeof global[fn]!=='function')return;
        if(global[fn].__lfAuditHooked)return;
        var orig=global[fn];
        var wrapped=function(){
          logEvent('auth.'+fn+'.attempt',{argsShape:arguments.length});
          var ret=orig.apply(this,arguments);
          if(ret && typeof ret.then==='function'){
            ret.then(function(){ logEvent('auth.'+fn+'.success'); })
               .catch(function(err){ logEvent('auth.'+fn+'.error',{msg:String(err&&err.message||err)}); });
          }else{
            logEvent('auth.'+fn+'.sync-return');
          }
          return ret;
        };
        wrapped.__lfAuditHooked=true;
        global[fn]=wrapped;
        count++;
      });
    return count;
  }

  /* FIX v1.2-20260803: o retry agendava setTimeout(_hookGlobals,500) em
     vez de setTimeout(_install,500) — isso fazia o contador _retries
     nunca avançar de verdade, então só havia 2 tentativas reais
     (imediata + 500ms), não as ~20 (10s) que o código sugeria. Funções
     login/logout/changePassword definidas mais tarde pelo app (comum em
     inits assíncronos) nunca eram interceptadas. Agora reagenda
     _install corretamente. */
  function _install(){
    var hookedNow=_hookGlobals();
    var anyHooked=['login','logout','doLogin','doLogout','changePassword','resetPassword']
      .some(function(fn){ return typeof global[fn]==='function' && global[fn].__lfAuditHooked; });

    if(!anyHooked){
      _install._retries=(_install._retries||0)+1;
      if(_install._retries<20){ setTimeout(_install,500); return; }
      _warn('nenhuma função de auth (login/logout/changePassword) encontrada após 20 tentativas — '+
            'API continua disponível para chamadas explícitas via LF_AUDIT.log()');
    }
    _log('v1-20260803 ativo. ring size:',_readRing().length,
         hookedNow?('| hooks instalados agora: '+hookedNow):'');
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{ _install(); }

  global.LF_AUDIT = {
    version:'v1.2-20260803',
    log:logEvent, tail:tail, filter:filter,
    exportJSON:exportJSON, clear:clear,
    diag:function(){ return { size:_readRing().length, hasWorker:!!_wc(), actor:_uid() }; }
  };
})(window);
