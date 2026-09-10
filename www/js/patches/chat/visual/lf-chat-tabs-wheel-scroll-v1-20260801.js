/**
 * lf-chat-tabs-wheel-scroll-v1-20260801.js
 *
 * BUG (reportado 2026-08-01): abas do chat (#chat-tabs-bar) não rolam ao
 * usar a roda do mouse. Causa: a barra só tem `overflow-x:auto` (CSS,
 * css/chat/chat-ui-p0.css) — rolagem HORIZONTAL. Roda de mouse comum só
 * gera scroll VERTICAL (deltaY); sem tradução explícita pra scrollLeft,
 * o navegador não faz nada com esse elemento (ou o evento borbulha pro
 * pai, rolando o que está atrás em vez da barra de abas).
 *
 * Correção: traduz deltaY em scrollLeft quando o mouse está sobre a
 * barra de abas. Trackpad (que já manda deltaX nativo) continua
 * funcionando normal — só entra em ação quando deltaY é o componente
 * dominante do gesto.
 *
 * Aditivo, idempotente, não mexe em nenhuma função existente.
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_TABS_WHEEL_V1__) return;
  window.__LF_CHAT_TABS_WHEEL_V1__ = true;

  function attach(el){
    if (!el || el.__lfWheelBound) return;
    el.__lfWheelBound = true;
    el.addEventListener('wheel', function(ev){
      // Só assume o evento se o componente vertical for maior (roda de
      // mouse comum) — gesto de trackpad com deltaX próprio continua
      // intocado, deixa o navegador tratar nativamente.
      if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX)) {
        el.scrollLeft += ev.deltaY;
        ev.preventDefault();
      }
    }, { passive: false });
  }

  function scan(){
    var bars = document.querySelectorAll('.chat-tabs-bar, #chat-tabs-bar');
    for (var i = 0; i < bars.length; i++) attach(bars[i]);
  }

  // A barra de abas é recriada/reanexada conforme o chat monta a tela —
  // observa o container do chat e reanexa o listener quando aparecer.
  scan();
  try {
    var mo = new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i++){
        if (muts[i].addedNodes && muts[i].addedNodes.length){ scan(); break; }
      }
    });
    var root = document.getElementById('pg-chat') || document.body;
    mo.observe(root, { childList: true, subtree: true });
  } catch(_e){}

  try { console.log('[lf-chat-tabs-wheel-scroll v1-20260801] instalado — roda do mouse agora rola as abas horizontalmente.'); } catch(_e){}
})();
