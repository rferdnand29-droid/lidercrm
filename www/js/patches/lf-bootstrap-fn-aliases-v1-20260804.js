/* lf-bootstrap-fn-aliases-v1-20260804 | aliases globais para funções encapsuladas
 * ------------------------------------------------------------------------------
 * O refactor encapsulou as funções do CRM em módulos (IIFE / LiderCRM.*),
 * então patches antigos que buscam `window.fetchLeads`,
 * `window.completeActivity` e `window.changePassword` não acham nada e
 * ficam em loop de 40 tentativas.
 *
 * Este bootstrap cria os aliases globais canônicos APONTANDO para as funções
 * reais do build atual, mantendo o contexto (`this`) original. Não sobrescreve
 * nada que já exista.
 *
 *   window.fetchLeads       -> refresh/re-render real do quadro de leads
 *                              (_syncKBRemoteBG + renderKB/renderKBLocal)
 *   window.completeActivity -> actConfirmDone (agenda.js)
 *   window.changePassword   -> changeMyPassword (configuracoes.js) e,
 *                              via changePassword.adminReset, adminResetPassword (usuarios.js)
 * ------------------------------------------------------------------------------ */
(function(global){
  'use strict';
  if(global.__LF_BOOTSTRAP_FN_ALIASES_V1__)return;
  global.__LF_BOOTSTRAP_FN_ALIASES_V1__=true;

  function _log(){try{console.debug.apply(console,['[lf-bootstrap-aliases]'].concat([].slice.call(arguments)));}catch(_e){}}

  /* ---- fetchLeads: função real de fetch+render do kanban de leads ---- */
  if(typeof global.fetchLeads!=='function'){
    global.fetchLeads=function(){
      var uid=(global.S&&global.S.userId)||null;
      try{ if(typeof global._syncKBRemoteBG==='function') global._syncKBRemoteBG('leads'); }catch(_e){}
      try{ if(typeof global.renderKBConsBar==='function') global.renderKBConsBar('leads'); }catch(_e){}
      try{ if(typeof global.renderKBLocal==='function') global.renderKBLocal('leads'); }catch(_e){}
      /* re-render assíncrono com dados frescos (mesmo padrão do goPage) */
      try{ if(typeof global.renderKB==='function') setTimeout(function(){ global.renderKB('leads'); },350); }catch(_e){}
      /* mantém a lista de clientes sincronizada (fonte dos cards) */
      if(uid&&typeof global.loadCli==='function'){
        try{ global.loadCli(uid,function(){}); }catch(_e){}
      }
      return uid;
    };
    _log('alias window.fetchLeads criado (kanban leads)');
  }

  /* ---- completeActivity: função real de conclusão de atividade ---- */
  if(typeof global.completeActivity!=='function'){
    global.completeActivity=function(id,ownerId){
      if(typeof global.actConfirmDone==='function') return global.actConfirmDone(id,ownerId);
      /* fallback: timeline de cliente */
      if(typeof global.markTlActDone==='function') return global.markTlActDone(arguments[1],id);
      try{console.warn('[lf-bootstrap-aliases] completeActivity: actConfirmDone indisponível');}catch(_e){}
    };
    _log('alias window.completeActivity -> actConfirmDone criado');
  }

  /* ---- changePassword: troca da própria senha + admin reset ---- */
  if(typeof global.changePassword!=='function'){
    var fn=function(){
      if(typeof global.changeMyPassword==='function') return global.changeMyPassword.apply(this,arguments);
      try{console.warn('[lf-bootstrap-aliases] changePassword: changeMyPassword indisponível');}catch(_e){}
    };
    /* admin reset de terceiro: changePassword.adminReset(uid, newPw) */
    fn.adminReset=function(uid,newPw){
      if(typeof global.adminResetPassword==='function') return global.adminResetPassword(uid,newPw);
      try{console.warn('[lf-bootstrap-aliases] adminResetPassword indisponível');}catch(_e){}
    };
    global.changePassword=fn;
    _log('alias window.changePassword -> changeMyPassword (+adminReset) criado');
  }
})(window);
