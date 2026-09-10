/**
 * lf-chat-nav-menu-v1-20260720.js
 *
 * Patch consolidado para o módulo "Papo da Empresa":
 *  A) Botões flutuantes TRANSPARENTES (ir ao início / voltar ao final)
 *     - Não sobrepõem a barra de digitação nem o header em mobile/PC
 *     - Aparecem apenas quando faz sentido (scroll > 200px longe do topo/fundo)
 *     - Fade in/out suave
 *  B) Menu de mensagem (right-click PC + long-press mobile)
 *     - Copiar, Encaminhar, Fixar/Desfixar, Editar, Reagir com emojis
 *     - Reposiciona automaticamente para NUNCA cobrir a barra de digitação,
 *       nunca cobrir o header, nunca vazar pela borda da tela.
 *     - Backdrop transparente que fecha o menu ao tocar fora, mas mantém
 *       o menu visível e utilizável.
 *
 * Não altera storage, sync, worker, poll, envio, gravação de áudio.
 * Rode DEPOIS de js/chat.js (é carregado como <script defer> no fim da página).
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_NAV_MENU_V1__) return;
  window.__LF_CHAT_NAV_MENU_V1__ = true;

  /* ─────────────── CSS INJETADO ─────────────── */
  var css = [
    /* Botões flutuantes: TRANSPARENTES, glass, sem invadir barra de digitação */
    '#chat-nav-top, #chat-nav-bot {',
    '  position:absolute;',
    '  right:14px;',
    '  z-index:15;',                  /* abaixo do header (que é sticky/flex-shrink) e do input-area */
    '  width:38px;height:38px;',
    '  border-radius:50%;',
    '  background:rgba(15,23,42,0.42) !important;',   /* SEMI-TRANSPARENTE */
    '  color:#fff;',
    '  border:1px solid rgba(255,255,255,0.18);',
    '  backdrop-filter:blur(8px);',
    '  -webkit-backdrop-filter:blur(8px);',
    '  font-size:1.05rem;',
    '  cursor:pointer;',
    '  box-shadow:0 4px 14px rgba(0,0,0,0.28);',
    '  align-items:center;justify-content:center;',
    '  opacity:0;pointer-events:none;',
    '  transition:opacity .18s ease, transform .18s ease, background .18s ease;',
    '  transform:translateY(4px);',
    '}',
    '#chat-nav-top.show, #chat-nav-bot.show {',
    '  opacity:.85;pointer-events:auto;transform:translateY(0);',
    '}',
    '#chat-nav-top:hover, #chat-nav-bot:hover { opacity:1; background:rgba(15,23,42,0.62) !important; }',

    /* Posições padrão (desktop):
       - top button logo abaixo do header
       - bottom button logo acima do input-area */
    '#chat-nav-top { top: 68px; }',
    '#chat-nav-bot { bottom: 82px; }',

    /* Tema claro: contorno mais legível */
    'body:not(.theme-classic) #chat-nav-top, body:not(.theme-classic) #chat-nav-bot {',
    '  background:rgba(255,255,255,0.55) !important;',
    '  color:#1a2740;',
    '  border:1px solid rgba(0,0,0,0.10);',
    '  box-shadow:0 4px 14px rgba(20,40,80,0.15);',
    '}',
    'body:not(.theme-classic) #chat-nav-top:hover, body:not(.theme-classic) #chat-nav-bot:hover {',
    '  background:rgba(255,255,255,0.85) !important;',
    '}',

    /* Mobile: subir o botão de baixo acima da barra + safe-area do iOS,
       encolher levemente para não roubar toque da barra */
    '@media (max-width:768px){',
    '  #chat-nav-top { top: 62px; right:10px; width:36px; height:36px; }',
    '  #chat-nav-bot {',
    '    bottom: calc(72px + env(safe-area-inset-bottom,0px));',
    '    right:10px; width:36px; height:36px;',
    '  }',
    '}',

    /* Se o painel ainda não está "open" (lista visível no mobile), esconder */
    '#chat-conv-panel:not(.open) #chat-nav-top,',
    '#chat-conv-panel:not(.open) #chat-nav-bot { display:none !important; }',

    /* ─── Menu contextual: reforço de anti-sobreposição ─── */
    '#chat-ctx-menu.chat-ctx-menu {',
    '  position:fixed !important;',
    '  z-index:99999 !important;',
    '  pointer-events:auto !important;',
    '  max-height: calc(100vh - 120px) !important;',   /* nunca cobre topo+base */
    '  max-height: calc(100dvh - 120px) !important;',
    '  overflow-y:auto !important;',
    '}',
    '#chat-ctx-backdrop {',
    '  position:fixed;inset:0;',
    '  background:transparent;',
    '  z-index:99998;',
    '}',
    /* Destaque suave da mensagem-alvo enquanto o menu está aberto */
    '.chat-msg.ctx-target .chat-msg-text {',
    '  outline:2px solid rgba(195,154,45,.55);',
    '  outline-offset:2px;',
    '  transition:outline .15s ease;',
    '}'
  ].join('\n');

  function injectCSS(){
    if (document.getElementById('lf-chat-nav-menu-css')) return;
    var s = document.createElement('style');
    s.id = 'lf-chat-nav-menu-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ─────────────── BOTÕES FLUTUANTES ─────────────── */
  function ensureNavButtons(){
    var panel = document.getElementById('chat-conv-panel');
    if (!panel) return;
    // se o container-pai não é position:relative/absolute, força relative para ancorar
    var cs = window.getComputedStyle(panel);
    if (cs && cs.position === 'static') {
      panel.style.position = 'relative';
    }

    var top = document.getElementById('chat-nav-top');
    if (!top) {
      top = document.createElement('button');
      top.type = 'button';
      top.id = 'chat-nav-top';
      top.title = 'Ir para o início da conversa';
      top.setAttribute('aria-label', 'Ir para o início da conversa');
      top.innerHTML = '⤴';
      panel.appendChild(top);
    }
    top.onclick = function(){ scrollTo('top'); };

    var bot = document.getElementById('chat-nav-bot');
    if (!bot) {
      bot = document.createElement('button');
      bot.type = 'button';
      bot.id = 'chat-nav-bot';
      bot.title = 'Voltar para o final da conversa';
      bot.setAttribute('aria-label', 'Voltar para o final da conversa');
      bot.innerHTML = '⤵';
      panel.appendChild(bot);
    }
    bot.onclick = function(){ scrollTo('bottom'); };

    updateNavBtns();
  }

  function scrollTo(where){
    var c = document.getElementById('chat-msgs');
    if (!c) return;
    var target = (where === 'top') ? 0 : c.scrollHeight;
    try {
      c.scrollTo({ top: target, behavior: 'smooth' });
    } catch(e) {
      c.scrollTop = target;
    }
  }

  function updateNavBtns(){
    var c = document.getElementById('chat-msgs');
    var top = document.getElementById('chat-nav-top');
    var bot = document.getElementById('chat-nav-bot');
    if (!c || !top || !bot) return;
    var sc = c.scrollTop;
    var mx = c.scrollHeight - c.clientHeight;
    // display precisa ser flex antes da classe .show — o inline style="display:none"
    // do HTML original interfere. Removemos qualquer display inline.
    top.style.display = '';
    bot.style.display = '';
    if (sc > 200) top.classList.add('show'); else top.classList.remove('show');
    if (mx > 100 && sc < mx - 200) bot.classList.add('show'); else bot.classList.remove('show');
  }
  window._chatUpdateNavBtnsPatched = updateNavBtns;

  // Reforça a chamada em cada evento relevante
  function bindNavListeners(){
    var c = document.getElementById('chat-msgs');
    if (!c || c.__lfNavBound) return;
    c.__lfNavBound = true;
    c.addEventListener('scroll', updateNavBtns, { passive: true });
    // resize/orientationchange também podem mudar mx
    window.addEventListener('resize', updateNavBtns);
    window.addEventListener('orientationchange', updateNavBtns);
    // Após render das mensagens, o chat.js já chama _chatUpdateNavBtns.
    // Um ResizeObserver garante que também refletimos mudanças de altura
    // (teclado virtual, novos áudios carregando, etc.)
    try {
      if (typeof ResizeObserver !== 'undefined') {
        var ro = new ResizeObserver(updateNavBtns);
        ro.observe(c);
      }
    } catch(_){}
  }

  /* ─────────────── MENU CONTEXTUAL: REPOSICIONAMENTO SEGURO ─────────────── */
  // O menu já é criado por _chatOpenCtxMenu em js/chat.js.
  // Aqui apenas garantimos que, DEPOIS de posicionado, ele nunca cubra
  // a barra de digitação nem o header.
  function fenceMenuInsideSafeZone(menu){
    if (!menu) return;
    var vw = window.innerWidth  || document.documentElement.clientWidth;
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var input = document.getElementById('chat-input-area');
    var header = document.getElementById('chat-conv-header');
    var topLimit = 8;
    var botLimit = vh - 8;
    if (header) {
      var hr = header.getBoundingClientRect();
      topLimit = Math.max(topLimit, hr.bottom + 6);
    }
    if (input && input.offsetParent !== null) {
      var ir = input.getBoundingClientRect();
      botLimit = Math.min(botLimit, ir.top - 6);
    }
    var mw = menu.offsetWidth || 240;
    var mh = menu.offsetHeight || 260;
    var availH = Math.max(120, botLimit - topLimit);
    // Se o menu é maior do que a área segura, encolhe (ganha scroll interno)
    if (mh > availH) {
      menu.style.maxHeight = availH + 'px';
      mh = availH;
    }
    var rect = menu.getBoundingClientRect();
    var left = rect.left, top = rect.top;
    // Corrige verticalmente
    if (top + mh > botLimit) top = botLimit - mh;
    if (top < topLimit)      top = topLimit;
    // Corrige horizontalmente
    if (left + mw > vw - 8)  left = vw - 8 - mw;
    if (left < 8)            left = 8;
    menu.style.left = Math.round(left) + 'px';
    menu.style.top  = Math.round(top)  + 'px';
  }

  // Vigia a criação/remoção do menu — quando ele nasce, cercamos e re-cercamos
  // após um pequeno delay (para pegar o tamanho real depois do layout).
  function watchCtxMenu(){
    var mo = new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n && n.id === 'chat-ctx-menu' && n.classList && n.classList.contains('chat-ctx-menu')) {
            fenceMenuInsideSafeZone(n);
            requestAnimationFrame(function(){ fenceMenuInsideSafeZone(n); });
            setTimeout(function(){ fenceMenuInsideSafeZone(n); }, 30);
          }
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: false });
    // Se a janela redimensionar com menu aberto, reposiciona
    window.addEventListener('resize', function(){
      var el = document.getElementById('chat-ctx-menu');
      if (el && el.classList.contains('chat-ctx-menu')) fenceMenuInsideSafeZone(el);
    });
  }

  /* ─────────────── HOOKS DE VIDA ─────────────── */
  function boot(){
    injectCSS();
    ensureNavButtons();
    bindNavListeners();
    watchCtxMenu();
  }

  // Reforça quando o usuário entra na página do chat
  function onGoPage(){
    setTimeout(function(){
      ensureNavButtons();
      bindNavListeners();
      updateNavBtns();
    }, 60);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // Toda vez que a página #pg-chat ficar visível, reforçar
  document.addEventListener('click', function(e){
    var t = e.target;
    if (!t) return;
    var goingChat = (t.getAttribute && (t.getAttribute('onclick')||'').indexOf("'chat'") >= 0)
                 || (t.closest && t.closest('[data-page="chat"], [onclick*="\'chat\'"]'));
    if (goingChat) onGoPage();
  }, true);

  // API pública mínima (para console/debug)
  window.LF_CHAT_NAV = {
    top: function(){ scrollTo('top'); },
    bottom: function(){ scrollTo('bottom'); },
    refresh: function(){ ensureNavButtons(); bindNavListeners(); updateNavBtns(); }
  };
})();
