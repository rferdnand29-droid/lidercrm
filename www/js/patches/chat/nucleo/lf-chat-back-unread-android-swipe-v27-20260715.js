/* ============================================================================
 * lf-chat-back-unread-android-swipe-v27-20260715.js
 * Ajustes cirúrgicos no Messenger pedidos pelo usuário:
 * 1) Botão "<" volta para a lista de conversas/contatos no PC e no celular.
 * 2) App Android (Capacitor): gesto de arrastar da esquerda para a direita
 *    fecha a conversa aberta e volta para a lista.
 * 3) Contador da aba Conversas passa a mostrar apenas quantas conversas têm
 *    mensagens não respondidas (em vez do total de conversas existentes).
 *
 * Arquivo 100% aditivo: não reescreve a base do Messenger.
 * ============================================================================ */
(function(){
  if(window.__LF_CHAT_BACK_UNREAD_V27__) return;
  window.__LF_CHAT_BACK_UNREAD_V27__ = 1;

  var LIST_SENTINEL = '__lf_chat_list_mode__';
  var forceListMode = false;
  var swipeState = null;

  function el(id){ return document.getElementById(id); }
  function activeRoomSafe(){
    try{ return (typeof window.activeRoom === 'function') ? window.activeRoom() : null; }
    catch(_e){ return null; }
  }
  function isMobile(){
    try{ return (typeof window.isMobileView === 'function') ? !!window.isMobileView() : window.innerWidth <= 768; }
    catch(_e){ return window.innerWidth <= 768; }
  }
  function isAndroidCapacitor(){
    var ua = String((window.navigator && navigator.userAgent) || '');
    return /Android/i.test(ua) && !!window.Capacitor;
  }
  function chatPage(){ return el('chat-page'); }
  function roomIsOpen(){ var p = chatPage(); return !!(p && p.classList.contains('room-open')); }
  function hasChatRowsTarget(node){ return !!(node && node.closest && node.closest('.chat-room[data-room], .chat-room[data-user-direct]')); }
  function unreadOfRoom(room){
    try{
      if(typeof window.unread === 'function') return parseInt(window.unread(room), 10) || 0;
      var ms = room && room.memberState && window.S && window.S.userId ? room.memberState[window.S.userId] : null;
      return parseInt((ms && ms.unreadCount) || 0, 10) || 0;
    }catch(_e){ return 0; }
  }
  function unreadRoomsCount(){
    var rooms = (window.C && Array.isArray(window.C.rooms)) ? window.C.rooms : [];
    var total = 0;
    rooms.forEach(function(room){ if(unreadOfRoom(room) > 0) total++; });
    return total;
  }
  function unreadDirectRoomsCount(){
    var rooms = (window.C && Array.isArray(window.C.rooms)) ? window.C.rooms : [];
    var total = 0;
    rooms.forEach(function(room){ if(room && room.type !== 'group' && unreadOfRoom(room) > 0) total++; });
    return total;
  }
  function fmtCount(n){ return n > 99 ? '99+' : String(n || 0); }
  function setForceListMode(on){
    forceListMode = !!on;
    try{ if(window.C) window.C.__lfForceListMode = forceListMode; }catch(_e){}
  }
  function refreshConversationCounters(){
    var unreadRooms = unreadRoomsCount();
    var unreadDirect = unreadDirectRoomsCount();
    var bitrixAll = el('chat-bitrix-all');
    if(bitrixAll) bitrixAll.textContent = fmtCount(unreadRooms);
    var cleanDirect = el('chat-clean-count-direct');
    if(cleanDirect) cleanDirect.textContent = fmtCount(unreadDirect);
  }
  function closeToConversationList(keepListMode){
    if(!window.C) return false;
    var state = window.C;
    setForceListMode(keepListMode !== false);
    try{ if(state.msgUnsub){ state.msgUnsub(); } }catch(_e){}
    state.msgUnsub = null;
    state.reply = null;
    state.msgs = [];
    state.active = LIST_SENTINEL;
    var page = chatPage();
    if(page) page.classList.remove('room-open');
    try{ if(typeof window.renderRooms === 'function') window.renderRooms(); }catch(_e){}
    try{ if(typeof window.renderHeader === 'function') window.renderHeader(); }catch(_e){}
    try{ if(typeof window.renderMsgs === 'function') window.renderMsgs(); }catch(_e){}
    refreshConversationCounters();
    return true;
  }
  function ensureStyle(){
    if(el('lf-chat-back-unread-v27-style')) return;
    var st = document.createElement('style');
    st.id = 'lf-chat-back-unread-v27-style';
    st.textContent = ''
      + '#pg-chat #chat-back-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important}'
      + '@media (min-width:769px){'
      +   '#pg-chat #chat-back-btn{display:inline-flex!important}'
      + '}'
      + '#chat-page #chat-back-btn{touch-action:pan-y}'
      + '#chat-page.room-open .chat-side{will-change:transform}';
    document.head.appendChild(st);
  }
  function wrapRenderRooms(){
    if(typeof window.renderRooms !== 'function' || window.renderRooms.__lfV27) return false;
    var orig = window.renderRooms;
    window.renderRooms = function(){
      var out = orig.apply(this, arguments);
      try{ refreshConversationCounters(); }catch(_e){}
      setTimeout(function(){ try{ refreshConversationCounters(); }catch(_e){} }, 0);
      setTimeout(function(){ try{ refreshConversationCounters(); }catch(_e){} }, 180);
      return out;
    };
    window.renderRooms.__lfV27 = 1;
    return true;
  }
  function wrapSyncBitrixChrome(){
    if(typeof window.syncBitrixChrome !== 'function' || window.syncBitrixChrome.__lfV27) return false;
    var orig = window.syncBitrixChrome;
    window.syncBitrixChrome = function(){
      var out = orig.apply(this, arguments);
      try{ refreshConversationCounters(); }catch(_e){}
      return out;
    };
    window.syncBitrixChrome.__lfV27 = 1;
    return true;
  }
  function wrapRenderHeader(){
    if(typeof window.renderHeader !== 'function' || window.renderHeader.__lfV27) return false;
    var orig = window.renderHeader;
    window.renderHeader = function(){
      var out = orig.apply(this, arguments);
      try{
        if(forceListMode && activeRoomSafe()){
          setTimeout(function(){
            try{
              if(forceListMode && activeRoomSafe()) closeToConversationList(true);
            }catch(_e){}
          }, 0);
        }
      }catch(_e){}
      return out;
    };
    window.renderHeader.__lfV27 = 1;
    return true;
  }
  function wrapOpenRoom(){
    if(typeof window.openRoom !== 'function' || window.openRoom.__lfV27) return false;
    var orig = window.openRoom;
    window.openRoom = function(){
      setForceListMode(false);
      return orig.apply(this, arguments);
    };
    window.openRoom.__lfV27 = 1;
    return true;
  }
  function bindBackButtonInterceptor(){
    if(document.__lfV27BackBound) return;
    document.__lfV27BackBound = 1;
    document.addEventListener('click', function(ev){
      var btn = ev.target && ev.target.closest ? ev.target.closest('#chat-back-btn') : null;
      if(!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      if(ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      closeToConversationList(true);
    }, true);
    document.addEventListener('click', function(ev){
      if(hasChatRowsTarget(ev.target)) setForceListMode(false);
    }, true);
  }
  function bindAndroidSwipeBack(){
    if(document.__lfV27SwipeBound) return;
    document.__lfV27SwipeBound = 1;

    document.addEventListener('touchstart', function(ev){
      if(!isAndroidCapacitor() || !isMobile() || !roomIsOpen()){
        swipeState = null;
        return;
      }
      var touch = ev.changedTouches && ev.changedTouches[0];
      if(!touch) return;
      var target = ev.target;
      if(!(target && target.closest && target.closest('#chat-page'))) return;
      swipeState = {
        x: touch.clientX,
        y: touch.clientY,
        t: Date.now(),
        eligible: touch.clientX <= 54, // FIX (2026-07-22): 36→54px — zona mais ampla para capas/protetores de tela Android
        consumed: false
      };
    }, { passive:true, capture:true });

    document.addEventListener('touchmove', function(ev){
      if(!swipeState || !swipeState.eligible || swipeState.consumed) return;
      var touch = ev.changedTouches && ev.changedTouches[0];
      if(!touch) return;
      var dx = touch.clientX - swipeState.x;
      var dy = touch.clientY - swipeState.y;
      if(dx > 18 && Math.abs(dx) > Math.abs(dy) * 1.2){
        swipeState.consumed = true;
      }
    }, { passive:true, capture:true });

    document.addEventListener('touchend', function(ev){
      if(!swipeState || !swipeState.eligible) return;
      var touch = ev.changedTouches && ev.changedTouches[0];
      if(!touch){ swipeState = null; return; }
      var dx = touch.clientX - swipeState.x;
      var dy = touch.clientY - swipeState.y;
      var dt = Date.now() - swipeState.t;
      var shouldClose = dx >= 72 && Math.abs(dy) <= 84 && dt <= 900 && roomIsOpen();
      swipeState = null;
      if(shouldClose) closeToConversationList(true);
    }, { passive:true, capture:true });

    document.addEventListener('touchcancel', function(){ swipeState = null; }, { passive:true, capture:true });
  }
  function boot(){
    ensureStyle();
    bindBackButtonInterceptor();
    bindAndroidSwipeBack();
    var ok1 = wrapRenderRooms();
    var ok2 = wrapSyncBitrixChrome();
    var ok3 = wrapRenderHeader();
    var ok4 = wrapOpenRoom();
    try{ refreshConversationCounters(); }catch(_e){}
    return ok1 && ok2 && ok3 && ok4;
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      boot();
      var tries = 0;
      var iv = setInterval(function(){
        tries++;
        if(boot() || tries > 150) clearInterval(iv);
      }, 200);
    }, { once:true });
  }else{
    boot();
    var tries2 = 0;
    var iv2 = setInterval(function(){
      tries2++;
      if(boot() || tries2 > 150) clearInterval(iv2);
    }, 200);
  }
})();
