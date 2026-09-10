/* js/patches/lf-fix-scroll-reset-conversao-etapa-v1-20260909.js
 * =====================================================================
 * BUG: ao converter Lead→Negócio ou alterar etapa, a rolagem da coluna/
 *      lista volta sozinha pro início.
 *
 * CAUSA RAIZ (auditada em 2026-09-09):
 *  1. renderKBLocal (kanban.js:963) captura o scroll DEPOIS da mutação
 *     dos dados — quando o card sai da coluna, o navegador já zerou o
 *     scrollTop. A âncora por card morre quando o card muda de board.
 *  2. Dois sistemas de preservação (por-board e global-snapshot) não se
 *     comunicam; fluxos como moveCard usam só o interno, sem snapshot.
 *  3. renderKBMobile (kanban.js:3970) restaura só em PIXELS crus com
 *     setTimeout(400) — sem âncora, sem clamp, sem guarda de scroll
 *     recente do usuário — e pula a restauração se scrollTop===0.
 *  4. O reforço setTimeout(apply,400) do sistema antigo reescreve o
 *     scroll 400ms depois, brigando com um gesto que o usuário já fez.
 *
 * ESTRATÉGIA (sem mudar regra de negócio, só preservação de posição):
 *  A. Wrappa _kbMoveCard e convertToNeg para capturar um SNAPSHOT
 *     GLOBAL *ANTES* da mutação e restaurar DEPOIS do último render.
 *     Como ambas já existem como globais (relatorios.js:740 / :1074) e
 *     já há wrappers de terceiros (lf-bingo-sync, lf-flow-hardening,
 *     lf-fix-scroll-reset-lead-move-v2), o wrapper é não-invasivo e
 *     DEVE carregar por último para ser a camada mais externa.
 *  B. Substitui a restauração mobile por uma baseada em ÂNCORA (id do
 *     primeiro card visível + offset dentro dele), igual ao desktop,
 *     com clamp no scrollHeight novo e guarda de 900ms de scroll ativo.
 *  C. Neutraliza o reforço setTimeout(400) herdado (faz o rAF vencer).
 * ===================================================================== */
(function(global){
  'use strict';
  if(!global)return;
  if(global.__lfScrollResetFixV1)return;
  global.__lfScrollResetFixV1=true;

  var RESTORE_GUARD_MS=900; // mesma janela do desktop (_kbLastScrollTs)

  function _copyFlags(orig,wrapped){
    // preserva flags idempotentes de wrappers anteriores (padrão do
    // lf-fix-scroll-reset-lead-move-v2) para não quebrar a cadeia
    if(orig&&wrapped){
      Object.keys(orig).forEach(function(k){
        try{wrapped[k]=orig[k];}catch(_e){}
      });
    }
  }
  function _publishAll(name,wrapped){
    try{global[name]=wrapped;}catch(_e){}
    try{global.KB&&global.KB[name]&&(global.KB[name]=wrapped);}catch(_e){}
  }

  /* ---------- util: captura ANTES da mutação ---------- */
  function capturePre(){
    if(typeof global._kbCaptureScrollSnapshot==='function'){
      try{return global._kbCaptureScrollSnapshot();}catch(_e){}
    }
    return null;
  }
  function restorePost(snap){
    if(!snap)return;
    if(typeof global._kbScheduleScrollRestore==='function'){
      try{global._kbScheduleScrollRestore(snap);}catch(_e){}
    }
  }

  /* ---------- A) wrap _kbMoveCard: snapshot ANTES de mudar col ----------
   * Assinatura real (relatorios.js:740):
   *   _kbMoveCard(cardId, board, uid, newCol, silent, bulk, dropIndex) */
  function wrapMoveCard(){
    var orig=global._kbMoveCard;
    if(typeof orig!=='function'||orig.__lfScrollWrapped)return;
    var wrapped=function(cardId,board,uid,newCol,silent,bulk,dropIndex){
      // Só captura quando VAI mudar de coluna (não em reordenação na mesma)
      var arr=null;
      try{arr=(typeof global.getKBFor==='function')?global.getKBFor(board,uid):null;}catch(_e){}
      var card=arr&&arr.find?arr.find(function(x){return x.id===cardId;}):null;
      var willChange=!!card&&card.col!==newCol;
      var snap=willChange?capturePre():null;
      var r=orig.apply(this,arguments);
      if(snap)restorePost(snap);
      return r;
    };
    _copyFlags(orig,wrapped);
    wrapped.__lfScrollWrapped=true;
    _publishAll('_kbMoveCard',wrapped);
  }

  /* ---------- A) wrap convertToNeg: snapshot ANTES do c.col='conv' ----------
   * Assinatura real (relatorios.js:1074):
   *   convertToNeg(cardId, ownerUid, prevCol, silent, opts, noAuto) */
  function wrapConvertToNeg(){
    var orig=global.convertToNeg;
    if(typeof orig!=='function'||orig.__lfScrollWrapped)return;
    var wrapped=function(cardId,ownerUid,prevCol,silent,opts,noAuto){
      var snap=capturePre(); // ANTES de marcar o lead como 'conv'
      var r=orig.apply(this,arguments);
      // O orig já agenda seu próprio restore interno; agendamos o nosso
      // DEPOIS para vencer por último (nosso snapshot é pré-mutação, o
      // dele é pós-mutação — o pré é o correto para a posição visual).
      if(snap)restorePost(snap);
      return r;
    };
    _copyFlags(orig,wrapped);
    wrapped.__lfScrollWrapped=true;
    try{global.convertToNeg=wrapped;}catch(_e){}
  }

  /* ---------- B) mobile: restauração por ÂNCORA em renderKBMobile ----------
   * renderKBLocal (kanban.js:986) despacha para renderKBMobile em mobile
   * view, então este wrap cobre: stage-picker mobile, conversão mobile,
   * sync em background — todos os fluxos que repintam a lista. */
  function patchMobile(){
    var orig=global.renderKBMobile;
    if(typeof orig!=='function'||orig.__lfAnchorPatched)return;
    var _lastUserScrollTs=0;
    function _isMobList(el){
      // os wrappers são <div id="leads-mobile-list"> / <div id="negocios-mobile-list">
      // (index.html:1016/1096) — sem classe própria, match só pelo sufixo do id
      return !!(el&&el.id&&/^(leads|negocios)-mobile-list$/.test(el.id));
    }
    // rastreia gesto/scroll manual na lista mobile (capture p/ scroll, que
    // não borbulha; demais eventos em bubble, todos passive)
    ['scroll','touchstart','touchmove','wheel','pointerdown'].forEach(function(ev){
      document.addEventListener(ev,function(e){
        var t=e&&e.target;
        while(t&&t!==document.body){
          if(_isMobList(t)){_lastUserScrollTs=Date.now();return;}
          t=t.parentNode;
        }
      },(ev==='scroll')?{capture:true,passive:true}:{passive:true});
    });

    var patched=function(board){
      var wrap=document.getElementById(board+'-mobile-list');
      if(!wrap)return orig.apply(this,arguments);
      // captura ÂNCORA (primeiro card visível + offset dentro dele)
      var anchor=null;
      try{
        var top=wrap.scrollTop||0;
        var cards=wrap.querySelectorAll('.mb-card');
        for(var i=0;i<cards.length;i++){
          var k=cards[i];
          if(k.offsetTop+k.offsetHeight>top){
            anchor={id:k.getAttribute('data-id'),offset:top-k.offsetTop};
            break;
          }
        }
        if(!anchor)anchor={id:null,offset:top}; // fallback: pixel bruto
      }catch(_e){anchor=null;}

      var r=orig.apply(this,arguments);

      // restaura por âncora com clamp, se o usuário não rolou há <900ms
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          try{
            if(Date.now()-_lastUserScrollTs<RESTORE_GUARD_MS)return;
            var m=Math.max(0,wrap.scrollHeight-wrap.clientHeight);
            var target=0;
            if(anchor&&anchor.id){
              var k=wrap.querySelector('.mb-card[data-id="'+anchor.id+'"]');
              if(k){target=k.offsetTop+anchor.offset;}
              else{target=anchor.offset;} // card saiu (convertido) — cai no pixel antigo clampado
            }else if(anchor){
              target=anchor.offset;
            }
            wrap.scrollTop=Math.max(0,Math.min(target,m));
          }catch(_e){}
        });
      });
      return r;
    };
    _copyFlags(orig,patched);
    patched.__lfAnchorPatched=true;
    try{global.renderKBMobile=patched;}catch(_e){}
  }

  /* ---------- instala quando as funções-alvo existirem ---------- */
  var _tries=0;
  function install(){
    _tries++;
    try{wrapMoveCard();}catch(_e){}
    try{wrapConvertToNeg();}catch(_e){}
    try{patchMobile();}catch(_e){}
    if(_tries<40&&!global.__lfScrollResetFixV1Done){
      // funções-alvo podem ser (re)definidas por patches carregados depois
      setTimeout(install,250);
    }else{
      global.__lfScrollResetFixV1Done=true;
    }
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',install);
  }else{install();}
  // relatorios.js/kanban.js carregam depois — re-tenta no load completo
  global.addEventListener('load',function(){
    install();
    // última barreira: alguns bundles definem as funções em deferred
    setTimeout(install,0);
  });
})(typeof window!=='undefined'?window:this);
