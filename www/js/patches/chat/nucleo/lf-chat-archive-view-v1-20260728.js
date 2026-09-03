/**
 * lf-chat-archive-view-v1-20260728.js
 *
 * P1-1 + complemento de P0-2: Tela "Arquivadas" + ação "Desarquivar" + "Marcar todas como lidas".
 *
 * Carregar DEPOIS de lf-chat-msgsearch-and-tabs-v1-20260728.js.
 * Stackable (guard __LF_CHAT_ARCHIVE_VIEW_V1__).
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_ARCHIVE_VIEW_V1__) return;
  window.__LF_CHAT_ARCHIVE_VIEW_V1__ = true;

  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function normArr(a){ return Array.isArray(a)?a:[]; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function saveConvs(convs){ try{ if(typeof ss==='function') ss('lf13_chat_convs', convs); }catch(_e){} }
  function loadConvs(){ return normArr(safe(function(){ return (typeof _chatGetConvs==='function')?_chatGetConvs():[]; }, [])); }

  function unarchive(convId){
    var convs = loadConvs();
    var idx = convs.findIndex(function(c){ return c && c.id===convId; });
    if(idx<0) return;
    convs[idx] = Object.assign({}, convs[idx], { archived:false, updatedAt: new Date().toISOString() });
    saveConvs(convs);
    if(typeof toast==='function') toast('📥 Conversa desarquivada');
    if(typeof renderChatList==='function') renderChatList();
    if(typeof _chatSyncConvUpsert==='function') safe(function(){ _chatSyncConvUpsert(convs[idx]); }, function(){});
  }

  function markAllRead(){
    var convs = loadConvs();
    var n = 0;
    convs.forEach(function(c){
      if(!c || c.archived) return;
      var msgs = safe(function(){ return (typeof _chatGetMsgs==='function')?_chatGetMsgs(c.id):[]; }, []);
      var me = (window.S && window.S.userId) || '';
      var changed = false;
      msgs.forEach(function(m){
        if(!m || m.read) return;
        var isForMe = c.isGroup ? (m.fromUid !== me) : (m.toUid === me);
        if(!isForMe) return;
        m.read = true; changed = true; n++;
      });
      if(changed) saveConvs(convs);
    });
    if(typeof _chatUpdateUnreadBadge==='function') _chatUpdateUnreadBadge();
    if(typeof renderChatList==='function') renderChatList();
    if(typeof toast==='function') toast('✅ '+n+' mensagens marcadas como lidas');
  }

  // Injeta itens no menu de contexto da lista
  function patchContextMenu(){
    document.addEventListener('contextmenu', function(e){
      var conv = (typeof _chatFindConvEl==='function') ? _chatFindConvEl(e.target) : null;
      if(!conv) return;
      var cid = conv.getAttribute('data-conv-id');
      if(!cid) return;
      // Adiciona botão "Desarquivar" dinamicamente
      var cm = document.getElementById('chat-ctx-menu');
      if(!cm) return;
      var convs = loadConvs();
      var c = convs.find(function(x){ return x && x.id===cid; });
      if(!c || !c.archived) return;
      var btn = document.createElement('button');
      btn.className = 'chat-ctx-btn';
      btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem';
      btn.textContent = '📥 Desarquivar conversa';
      btn.onclick = function(){ unarchive(cid); if(typeof _chatCloseCtxMenu==='function') _chatCloseCtxMenu(); };
      cm.appendChild(btn);
    }, true);
  }

  // sweepManager: botão "limpar não lidas" injetado no header da lista
  function injectSweep(){
    var hdr = document.querySelector('.chat-list-header');
    if(!hdr || hdr.querySelector('#chat-sweep-btn')) return;
    var b = document.createElement('button');
    b.id = 'chat-sweep-btn';
    b.type = 'button';
    b.className = 'bc';
    b.style.cssText = 'padding:5px 9px;font-size:.74rem;border-radius:8px';
    b.textContent = '✓ Limpar não lidas';
    b.title = 'Marcar todas as conversas como lidas';
    b.onclick = markAllRead;
    hdr.appendChild(b);
  }

  function boot(){
    patchContextMenu();
    injectSweep();
  }
  if(document.readyState==='complete'||document.readyState==='interactive'){
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
  document.addEventListener('click', function(e){
    var t = e.target;
    if(!t) return;
    var goingChat = (t.getAttribute && (t.getAttribute('onclick')||'').indexOf("'chat'") >= 0)
                 || (t.closest && t.closest('[onclick*="\'chat\'"]'));
    if(goingChat) setTimeout(boot, 60);
  }, true);

  window.LF_CHAT_ARCHIVE_VIEW = { unarchive: unarchive, markAllRead: markAllRead };
})();
