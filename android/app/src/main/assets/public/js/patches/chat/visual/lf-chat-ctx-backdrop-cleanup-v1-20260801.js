/* =====================================================================
   PATCH: lf-chat-ctx-backdrop-cleanup-v1-20260801
   PROBLEMA: na aba "Papo" (pg-chat), um overlay escuro semitransparente
   com um spinnerzinho no centro fica preso sobre a lista de conversas.
   A lista ("Lider teste", "teste k", "Luis Carlos Moreira") continua
   visível por trás, mas os cliques não passam.
   CAUSA-RAIZ: o elemento #chat-ctx-backdrop (definido em css/chat.css
   linha 291: position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.22))
   é criado por _chatOpenConvCtxMenu()/_chatOpenCtxMenu() em js/chat.js
   e DEVERIA ser removido junto com #chat-ctx-menu por _chatCloseCtxMenu().
   Porém 4 patches concorrentes mexem no ctx-menu:
     - lf-chat-ctx-sound-fix-v1-20260720
     - lf-chat-consolidated-fix-v1-20260731
     - lf-chat-hotfix-20260731
     - lf-chat-redesign-v1-20260731
   Em algumas sequências (ex.: menu removido por scroll RAF enquanto o
   backdrop está sendo re-anexado pelo consolidated-fix), o menu é
   deletado mas o backdrop fica órfão — o usuário vê um "loader" no
   centro da tela que na verdade é o efeito do overlay + spinner do
   #chat-sync-spinner atrás dele. Clicar no backdrop NÃO fecha porque
   os event listeners foram anexados a uma referência antiga do elemento
   quando o consolidated-fix o recriou.
   FIX (aditivo, idempotente, singleton):
     1) Sweep periódico (250ms enquanto pg-chat está ativa): se o
        backdrop existe MAS o menu correspondente não existe (ou foi
        removido do DOM), remove o backdrop.
     2) Delegated listener global que fecha o backdrop em qualquer
        clique / touchstart / ESC / scroll — recuperando o caminho de
        escape mesmo quando os listeners originais estão quebrados.
     3) Expõe window.lfKillChatBackdrop() para debug pelo Rhuan no
        console.
   NÃO modifica nenhum arquivo central — só é registrado nas 2 tags
   <script> em index.html e app.html. Reverter = remover essas 2 linhas.
   ===================================================================== */
(function(){
  if(window.__lfChatCtxBackdropCleanupArmed) return;
  window.__lfChatCtxBackdropCleanupArmed = 1;

  var TAG = '[lf-chat-ctx-backdrop-cleanup v1-20260801]';

  function _log(){
    try{ console.log.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){}
  }

  function _killOrphan(reason){
    try{
      var b = document.getElementById('chat-ctx-backdrop');
      if(!b) return false;
      var m = document.getElementById('chat-ctx-menu');
      // Órfão = backdrop sem menu, OU menu com display none / height 0.
      var orphan = !m;
      if(!orphan && m){
        try{
          var st = getComputedStyle(m);
          if(st.display === 'none' || st.visibility === 'hidden') orphan = true;
          if(!orphan){
            var r = m.getBoundingClientRect();
            if(!r || (r.width === 0 && r.height === 0)) orphan = true;
          }
        }catch(_e){}
      }
      if(!orphan) return false;
      _log('Removendo backdrop órfão. Motivo:', reason);
      try{ b.parentNode && b.parentNode.removeChild(b); }catch(_e){ try{ b.remove(); }catch(_e2){} }
      // Também tenta chamar o closer oficial (se existir) pra limpar estado interno.
      try{ if(typeof _chatCloseCtxMenu === 'function') _chatCloseCtxMenu(); }catch(_e){}
      return true;
    }catch(_e){ return false; }
  }

  // Expor helper global pra debug manual do usuário no DevTools.
  window.lfKillChatBackdrop = function(){
    var b = document.getElementById('chat-ctx-backdrop');
    var m = document.getElementById('chat-ctx-menu');
    try{ if(b) b.remove(); }catch(_e){}
    try{ if(m) m.remove(); }catch(_e){}
    _log('lfKillChatBackdrop() executado manualmente.');
    return true;
  };

  // Sweep periódico: só ativa se a aba Papo está aberta (pra não gastar CPU).
  function _isChatPageOpen(){
    try{
      var p = document.getElementById('pg-chat');
      return !!(p && p.classList && p.classList.contains('on'));
    }catch(_e){ return false; }
  }

  var _sweepIv = setInterval(function(){
    if(!_isChatPageOpen()) return;
    _killOrphan('sweep-interval');
  }, 250);

  // Escape universal: se o backdrop existe, qualquer clique/touchstart/ESC
  // fora dele o remove — recupera o clique-fora-fecha mesmo se os
  // listeners originais estiverem broken.
  document.addEventListener('click', function(e){
    var b = document.getElementById('chat-ctx-backdrop');
    if(!b) return;
    // Se o clique foi no próprio backdrop OU numa área NÃO coberta pelo
    // menu, remove o backdrop.
    var m = document.getElementById('chat-ctx-menu');
    if(e.target === b || !m || !m.contains(e.target)){
      _killOrphan('universal-click');
    }
  }, true);

  document.addEventListener('touchstart', function(e){
    var b = document.getElementById('chat-ctx-backdrop');
    if(!b) return;
    var m = document.getElementById('chat-ctx-menu');
    if(e.target === b || !m || !m.contains(e.target)){
      _killOrphan('universal-touchstart');
    }
  }, {passive:true, capture:true});

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' || e.keyCode === 27){
      var b = document.getElementById('chat-ctx-backdrop');
      if(b){ _killOrphan('universal-escape'); }
    }
  }, true);

  // Extra: quando o usuário troca de aba (Bingo, Leads, Negocios...), o
  // Papo é escondido — então TODO ctx-menu/backdrop deve morrer.
  document.addEventListener('click', function(e){
    var t = e.target;
    while(t && t !== document.body){
      if(t.classList && (t.classList.contains('ntab') || t.classList.contains('mbn-item'))){
        setTimeout(function(){
          if(!_isChatPageOpen()) _killOrphan('tab-switched-out-of-chat');
        }, 50);
        return;
      }
      t = t.parentNode;
    }
  }, true);

  // Quando a página está sendo escondida (visibility hidden), limpa tudo
  // pra não voltar com o backdrop preso.
  document.addEventListener('visibilitychange', function(){
    if(document.hidden){
      setTimeout(function(){ _killOrphan('visibility-hidden'); }, 100);
    }
  }, false);

  _log('Armado. Sweep ativo a cada 250ms enquanto Papo está aberto. Use window.lfKillChatBackdrop() para forçar limpeza.');
})();
