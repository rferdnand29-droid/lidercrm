/**
 * lf-chat-redesign-v1-20260731.js
 *
 * Redesign visual da aba "Papo da Empresa" (pg-chat) — trilha B.
 * Aplicado por: prompt-redesign-aba-papo.md (2026-07-31)
 *
 * O que este patch FAZ (apenas reorganização visual):
 *  1. Cria/garante um contêiner #chat-actions-bar logo abaixo da barra de
 *     abas #chat-tabs-bar, dentro de #chat-list-panel.
 *  2. Insere nessa barra um botão "+ Nova conversa" (chama chatNewConv()
 *     já existente — MESMA função do botão "+" antigo do header, que
 *     continua no DOM mas oculto via CSS).
 *  3. Move para essa mesma barra o botão "✓ Limpar não lidas"
 *     (#chat-sweep-btn) criado pelo patch lf-chat-archive-view-v1-20260728.
 *     onclick permanece intocado (markAllRead()).
 *
 * O que este patch NÃO FAZ:
 *  • Não altera IDs. Não renomeia/remove funções JS.
 *  • Não toca em chat.js, chat.css, chat-ui-p0.css, nem nos patches P0.
 *  • Não recria a barra de abas nem a lógica de markAllRead.
 *
 * Stackable. Idempotente. Carregar DEPOIS de:
 *   - lf-chat-msgsearch-and-tabs-v1-20260728.js
 *   - lf-chat-archive-view-v1-20260728.js
 *   - lf-chat-ui-polish-v1-20260730.js
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_REDESIGN_V1__) return;
  window.__LF_CHAT_REDESIGN_V1__ = true;

  var ACTIONS_ID = 'chat-actions-bar';

  function q(sel, root){ return (root||document).querySelector(sel); }

  /**
   * Garante que exista uma barra de ações (#chat-actions-bar) logo abaixo
   * da barra de abas dentro do painel da lista de conversas.
   * Reaproveita o botão "+ Nova conversa" (novo) e o botão
   * "✓ Limpar não lidas" (#chat-sweep-btn, criado pelo archive-view patch).
   */
  function ensureActionsBar(){
    var listPanel = document.getElementById('chat-list-panel');
    if (!listPanel) return;

    var tabsBar = document.getElementById('chat-tabs-bar');
    // Se a barra de abas ainda não foi criada, aguarda o patch dela rodar.
    if (!tabsBar) return;

    var bar = document.getElementById(ACTIONS_ID);
    if (!bar){
      bar = document.createElement('div');
      bar.id = ACTIONS_ID;
      // Insere IMEDIATAMENTE depois da barra de abas
      if (tabsBar.nextSibling){
        listPanel.insertBefore(bar, tabsBar.nextSibling);
      } else {
        listPanel.appendChild(bar);
      }
    } else {
      // Se por algum motivo re-render moveu o node, garante posição correta
      if (bar.previousElementSibling !== tabsBar && tabsBar.parentNode === listPanel){
        listPanel.insertBefore(bar, tabsBar.nextSibling);
      }
    }

    // Botão "+ Nova conversa" (novo — reaproveita chatNewConv() existente)
    var newBtn = bar.querySelector('#chat-new-conv-btn');
    if (!newBtn){
      newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.id = 'chat-new-conv-btn';
      newBtn.className = 'lfcr-btn-primary';
      newBtn.setAttribute('title', 'Iniciar nova conversa');
      newBtn.setAttribute('aria-label', 'Nova conversa');
      newBtn.innerHTML = '<span aria-hidden="true">+</span> Nova conversa';
      newBtn.addEventListener('click', function(){
        try { if (typeof chatNewConv === 'function') chatNewConv(); }
        catch(_e){}
      });
      bar.appendChild(newBtn);
    }

    // Move (não recria) o botão "✓ Limpar não lidas" para a barra de ações.
    // O onclick já é markAllRead(), definido pelo patch lf-chat-archive-view.
    var sweep = document.getElementById('chat-sweep-btn');
    if (sweep && sweep.parentNode !== bar){
      bar.appendChild(sweep);
    }
  }

  /**
   * Observa mudanças no #chat-list-panel — assim, quando os patches
   * lf-chat-msgsearch-and-tabs e lf-chat-archive-view criarem seus nodes,
   * nós reposicionamos sem correr contra eles.
   */
  function startObserver(){
    var listPanel = document.getElementById('chat-list-panel');
    if (!listPanel){ setTimeout(startObserver, 300); return; }
    ensureActionsBar();
    try{
      var mo = new MutationObserver(function(){ ensureActionsBar(); });
      mo.observe(listPanel, { childList:true, subtree:false });
    }catch(_e){}
  }

  function boot(){
    ensureActionsBar();
    startObserver();
    // Reforço: quando o usuário navegar para a página de chat, alguns patches
    // reinjetam elementos — garante nossa barra depois.
    setTimeout(ensureActionsBar, 120);
    setTimeout(ensureActionsBar, 400);
    setTimeout(ensureActionsBar, 900);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive'){
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // Ao clicar em qualquer atalho que abra a página "chat", reforça o layout.
  document.addEventListener('click', function(e){
    var t = e.target;
    if (!t) return;
    var goingChat =
      (t.getAttribute && (t.getAttribute('onclick')||'').indexOf("'chat'") >= 0)
      || (t.closest && t.closest('[data-page="chat"], [onclick*="\'chat\'"]'));
    if (goingChat) setTimeout(ensureActionsBar, 80);
  }, true);

  window.LF_CHAT_REDESIGN = { ensureActionsBar: ensureActionsBar };
})();
