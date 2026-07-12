(function(){
  if(window.__CHAT_MESSENGER_CLEANUP_20260711_FINAL__) return;
  window.__CHAT_MESSENGER_CLEANUP_20260711_FINAL__ = 1;

  function q(s,p){ return (p||document).querySelector(s); }
  function qa(s,p){ return Array.prototype.slice.call((p||document).querySelectorAll(s)); }
  function el(id){ return document.getElementById(id); }
  function mob(){ return window.matchMedia('(max-width:768px)').matches; }
  function iconMore(){ return '⋯'; }
  var ROOM_TAB = 'direct';

  function ensureStyle(){
    if(el('chat-messenger-cleanup-20260711-final-style')) return;
    var st = document.createElement('style');
    st.id = 'chat-messenger-cleanup-20260711-final-style';
    st.textContent = `
      #chat-page.chat-cleanup-final .chat-clean-tabs{display:flex;align-items:center;gap:8px;padding:8px 0 0;overflow:auto;scrollbar-width:none}
      #chat-page.chat-cleanup-final .chat-clean-tabs::-webkit-scrollbar{display:none}
      #chat-page.chat-cleanup-final .chat-clean-tab{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border:1px solid #d9e2ec;background:#fff;color:#4f5e70;border-radius:14px;padding:9px 13px;font:600 .8rem/1 Inter,Outfit,sans-serif;box-shadow:none}
      #chat-page.chat-cleanup-final .chat-clean-tab.on{background:#eef5ff;border-color:#bcd3f8;color:#1663d6}
      #chat-page.chat-cleanup-final .chat-clean-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#e8f1ff;color:#1663d6;font:700 .66rem/18px Inter,Outfit,sans-serif}
      #chat-page.chat-cleanup-final .chat-clean-tab.on .chat-clean-count{background:#1663d6;color:#fff}
      #chat-page.chat-cleanup-final .chat-hidden-by-tab{display:none!important}
      #chat-page.chat-cleanup-final #chat-legacy-tabs,#chat-page.chat-cleanup-final #chat-bitrix-tabs{display:none!important}
      #chat-page.chat-cleanup-final .chat-room{padding-left:16px!important}
      #chat-page.chat-cleanup-final .chat-room::before{left:4px!important;top:10px!important;bottom:10px!important}
      #chat-page.chat-cleanup-final .chat-top-right{display:flex!important;align-items:center!important;gap:8px!important}
      #chat-page.chat-cleanup-final #chat-call-btn,
      #chat-page.chat-cleanup-final #chat-video-btn,
      #chat-page.chat-cleanup-final #chat-video-pill,
      #chat-page.chat-cleanup-final .chat-room-members-btn,
      #chat-page.chat-cleanup-final .chat-room-search-btn{display:none!important}
      #chat-page.chat-cleanup-final #chat-emoji-btn{display:none!important}
      #mo-chat-inspect [data-bx-inspect-action="video"],
      #mo-chat-inspect [data-bx-inspect-action="call"]{display:none!important}
      @media (max-width:768px){
        #chat-page.chat-cleanup-final .chat-hd{padding:12px 14px 10px!important;background:#fff!important;border-bottom:1px solid #edf2f7!important}
        #chat-page.chat-cleanup-final .chat-hd-row{gap:10px!important}
        #chat-page.chat-cleanup-final .chat-actions{gap:8px!important}
        #chat-page.chat-cleanup-final .chat-head-icon,#chat-page.chat-cleanup-final .chat-actions .chat-mini{width:36px!important;height:36px!important;min-width:36px!important}
        #chat-page.chat-cleanup-final .chat-side-tools{display:grid!important;gap:8px!important;max-height:none!important;overflow:visible!important;padding:0 14px 10px!important;background:#fff!important;border-bottom:1px solid #edf2f7!important}
        #chat-page.chat-cleanup-final .chat-clean-tabs{padding-top:8px!important;gap:8px!important}
        #chat-page.chat-cleanup-final .chat-clean-tab{font-size:.78rem!important;padding:10px 12px!important}
        #chat-page.chat-cleanup-final .chat-room-list{padding:0!important}
        #chat-page.chat-cleanup-final .chat-room{min-height:78px!important;padding:12px 14px 12px 18px!important;gap:12px!important}
        #chat-page.chat-cleanup-final .chat-room .chat-av{width:44px!important;height:44px!important}
        #chat-page.chat-cleanup-final .chat-room-name{font-size:.95rem!important}
        #chat-page.chat-cleanup-final .chat-room-sub{font-size:.73rem!important}
        #chat-page.chat-cleanup-final .chat-room-last{margin-top:5px!important;font-size:.78rem!important}
        #chat-page.chat-cleanup-final .chat-shell,
        #chat-page.chat-cleanup-final .chat-main,
        #chat-page.chat-cleanup-final #chat-room-wrap{min-height:0!important}
        #chat-page.chat-cleanup-final.room-open .chat-shell{height:var(--lf-chat-shell-h,auto)!important;min-height:var(--lf-chat-shell-h,auto)!important}
        #chat-page.chat-cleanup-final.room-open .chat-main{display:flex!important;height:100%!important;min-height:0!important;position:relative!important}
        #chat-page.chat-cleanup-final.room-open #chat-room-wrap{display:flex!important;height:100%!important;min-height:0!important;flex-direction:column!important}
        #chat-page.chat-cleanup-final.room-open .chat-msgs{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;padding:14px 12px 10px!important}
        #chat-page.chat-cleanup-final .chat-top{padding:10px 12px!important;background:#fff!important;border-bottom:1px solid #e7edf5!important}
        #chat-page.chat-cleanup-final .chat-top-sub{max-width:54vw!important}
        #chat-page.chat-cleanup-final .chat-compose{position:sticky!important;bottom:0!important;z-index:20!important;margin-top:auto!important;background:#fff!important;border-top:1px solid #e7edf5!important;box-shadow:0 -10px 24px rgba(15,23,42,.08)!important;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px))!important}
        #chat-page.chat-cleanup-final .chat-compose-row{grid-template-columns:42px minmax(0,1fr) 42px!important;gap:8px!important;align-items:end!important}
        #chat-page.chat-cleanup-final #chat-text{min-height:46px!important;max-height:120px!important;border-radius:22px!important;padding:12px 14px!important}
        #chat-page.chat-cleanup-final #chat-attach,
        #chat-page.chat-cleanup-final #chat-rec,
        #chat-page.chat-cleanup-final #chat-send{width:42px!important;height:42px!important;min-width:42px!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
        #chat-page.chat-cleanup-final #chat-send{border:none!important;border-radius:50%!important;background:#1f87ff!important;color:#fff!important;box-shadow:0 10px 20px rgba(31,135,255,.22)!important}
      }
    `;
    document.head.appendChild(st);
  }

  function roomTypeOfRow(row){
    if(!row) return 'direct';
    if(row.getAttribute('data-user-direct')) return 'direct';
    var id = row.getAttribute('data-room');
    var r = id && window.C && C.roomMap ? C.roomMap[id] : null;
    return r && r.type === 'group' ? 'group' : 'direct';
  }

  function ensureTabs(){
    var page = el('chat-page');
    var hd = page && q('.chat-hd', page);
    if(!page || !hd) return;
    page.classList.add('chat-cleanup-final');
    var legacy = el('chat-bitrix-tabs');
    if(legacy){ legacy.id = 'chat-legacy-tabs'; legacy.setAttribute('aria-hidden','true'); }
    var host = el('chat-clean-tabs');
    if(!host){
      host = document.createElement('div');
      host.id = 'chat-clean-tabs';
      host.className = 'chat-clean-tabs';
      host.innerHTML = '<button type="button" class="chat-clean-tab on" data-chat-clean-tab="direct">Conversas <span class="chat-clean-count" id="chat-clean-count-direct">0</span></button>'+
                       '<button type="button" class="chat-clean-tab" data-chat-clean-tab="group">Grupos <span class="chat-clean-count" id="chat-clean-count-group">0</span></button>';
      hd.appendChild(host);
    }
    qa('[data-chat-clean-tab]', host).forEach(function(btn){
      btn.classList.toggle('on', btn.getAttribute('data-chat-clean-tab') === ROOM_TAB);
    });
  }

  function applyRoomTab(){
    var list = el('chat-room-list');
    if(!list) return;
    var rows = qa('.chat-room', list);
    var directCount = 0, groupCount = 0, shown = 0;
    rows.forEach(function(row){
      var type = roomTypeOfRow(row);
      if(type === 'group') groupCount++; else directCount++;
      var show = ROOM_TAB === 'group' ? type === 'group' : type !== 'group';
      row.classList.toggle('chat-hidden-by-tab', !show);
      if(show) shown++;
    });
    var cd = el('chat-clean-count-direct');
    var cg = el('chat-clean-count-group');
    if(cd) cd.textContent = String(directCount);
    if(cg) cg.textContent = String(groupCount);
    var emptyNote = el('chat-clean-empty-note');
    if(!shown){
      if(!emptyNote){
        emptyNote = document.createElement('div');
        emptyNote.id = 'chat-clean-empty-note';
        emptyNote.className = 'est';
        list.appendChild(emptyNote);
      }
      emptyNote.textContent = ROOM_TAB === 'group' ? 'Nenhum grupo encontrado.' : 'Nenhuma conversa encontrada.';
    }else if(emptyNote){
      emptyNote.remove();
    }
    var tabs = el('chat-clean-tabs');
    if(tabs) qa('[data-chat-clean-tab]', tabs).forEach(function(btn){
      btn.classList.toggle('on', btn.getAttribute('data-chat-clean-tab') === ROOM_TAB);
    });
  }

  function cleanTopRight(){
    var page = el('chat-page');
    var right = page && q('.chat-top-right', page);
    if(!right) return;
    ['chat-video-btn','chat-call-btn','chat-video-pill','chat-room-members-btn','chat-room-search-btn','chat-room-menu-desktop'].forEach(function(id){
      var n = el(id);
      if(n) n.remove();
    });
    var menu = el('chat-room-menu');
    if(!menu){
      menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'chat-mini';
      menu.id = 'chat-room-menu';
      menu.setAttribute('aria-label','Mais opções');
      menu.textContent = iconMore();
    }else if(!menu.textContent || menu.textContent.trim() === ''){
      menu.textContent = iconMore();
    }
    right.innerHTML = '';
    right.appendChild(menu);
  }

  function removeEmojiButton(){
    var b = el('chat-emoji-btn');
    if(b && b.parentNode) b.parentNode.removeChild(b);
  }

  function refineInspect(){
    qa('#mo-chat-inspect [data-bx-inspect-action="video"], #mo-chat-inspect [data-bx-inspect-action="call"]').forEach(function(btn){
      btn.remove();
    });
  }

  function syncShellHeight(){
    var page = el('chat-page');
    var shell = page && q('.chat-shell', page);
    if(!page || !shell || !mob()) return;
    page.classList.add('chat-cleanup-final');
    var vv = window.visualViewport;
    var viewH = vv ? vv.height : window.innerHeight;
    var viewTop = vv ? vv.offsetTop : 0;
    var keyboardOpen = vv ? (window.innerHeight - vv.height > 120) : false;
    var bottomNav = 0;
    var nav = el('mobile-bottom-nav');
    if(nav && !keyboardOpen){
      var nr = nav.getBoundingClientRect();
      bottomNav = Math.max(0, Math.round(nr.height || 0));
    }
    var top = page.getBoundingClientRect().top + viewTop;
    var h = Math.max(320, Math.round(viewH - top - bottomNav));
    page.style.setProperty('--lf-chat-shell-h', h + 'px');
    if(page.classList.contains('room-open')){
      shell.style.height = h + 'px';
      shell.style.minHeight = h + 'px';
    }else{
      shell.style.removeProperty('height');
      shell.style.removeProperty('min-height');
    }
  }

  function keepComposerVisible(){
    var box = el('chat-msgs');
    if(box) box.style.paddingBottom = '12px';
    var txt = el('chat-text');
    if(txt && document.activeElement === txt){
      setTimeout(function(){
        try{ txt.scrollIntoView({block:'nearest'}); }catch(_e){}
        var msgs = el('chat-msgs');
        if(msgs) msgs.scrollTop = msgs.scrollHeight;
        syncShellHeight();
      }, 60);
    }
  }

  function syncAll(){
    ensureStyle();
    ensureTabs();
    cleanTopRight();
    removeEmojiButton();
    refineInspect();
    applyRoomTab();
    syncShellHeight();
    keepComposerVisible();
  }

  function patchFns(){
    if(typeof window.renderRooms === 'function' && !window.renderRooms.__cleanupFinal){
      var rr = window.renderRooms;
      window.renderRooms = function(){ var out = rr.apply(this, arguments); setTimeout(syncAll, 0); return out; };
      window.renderRooms.__cleanupFinal = 1;
    }
    if(typeof window.renderHeader === 'function' && !window.renderHeader.__cleanupFinal){
      var rh = window.renderHeader;
      window.renderHeader = function(){ var out = rh.apply(this, arguments); setTimeout(syncAll, 0); return out; };
      window.renderHeader.__cleanupFinal = 1;
    }
    if(typeof window.renderComposer === 'function' && !window.renderComposer.__cleanupFinal){
      var rc = window.renderComposer;
      window.renderComposer = function(){ var out = rc.apply(this, arguments); setTimeout(syncAll, 0); return out; };
      window.renderComposer.__cleanupFinal = 1;
    }
    if(typeof window.openRoom === 'function' && !window.openRoom.__cleanupFinal){
      var oroom = window.openRoom;
      window.openRoom = function(){ var out = oroom.apply(this, arguments); setTimeout(function(){ syncAll(); var msgs = el('chat-msgs'); if(msgs) msgs.scrollTop = msgs.scrollHeight; }, 20); return out; };
      window.openRoom.__cleanupFinal = 1;
    }
    if(typeof window.closeRoomMobile === 'function' && !window.closeRoomMobile.__cleanupFinal){
      var croom = window.closeRoomMobile;
      window.closeRoomMobile = function(){ var out = croom.apply(this, arguments); setTimeout(syncAll, 20); return out; };
      window.closeRoomMobile.__cleanupFinal = 1;
    }
  }

  function bind(){
    if(window.__CHAT_MESSENGER_CLEANUP_20260711_FINAL_BIND__) return;
    window.__CHAT_MESSENGER_CLEANUP_20260711_FINAL_BIND__ = 1;
    document.addEventListener('click', function(e){
      var tab = e.target.closest('[data-chat-clean-tab]');
      if(tab){
        e.preventDefault();
        ROOM_TAB = tab.getAttribute('data-chat-clean-tab') || 'direct';
        applyRoomTab();
        return;
      }
      if(e.target && e.target.closest('#chat-room-menu')){
        setTimeout(syncAll, 0);
      }
    }, true);
    document.addEventListener('focusin', function(e){
      if(e.target && e.target.id === 'chat-text') setTimeout(syncAll, 30);
    }, true);
    document.addEventListener('input', function(e){
      if(e.target && e.target.id === 'chat-text') setTimeout(syncAll, 0);
    }, true);
    window.addEventListener('resize', syncAll, {passive:true});
    window.addEventListener('orientationchange', function(){ setTimeout(syncAll, 120); }, {passive:true});
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', syncAll, {passive:true});
      window.visualViewport.addEventListener('scroll', syncAll, {passive:true});
    }
    var mo = new MutationObserver(function(){ syncAll(); });
    setTimeout(function(){ var page = el('chat-page'); if(page) mo.observe(page, {childList:true, subtree:true}); }, 200);
  }

  function boot(){
    patchFns();
    bind();
    syncAll();
    setTimeout(syncAll, 60);
    setTimeout(syncAll, 260);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
