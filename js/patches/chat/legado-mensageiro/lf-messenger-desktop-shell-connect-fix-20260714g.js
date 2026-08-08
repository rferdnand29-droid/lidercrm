(function(){
  if(window.__LF_MESSENGER_DESKTOP_SHELL_CONNECT_FIX_20260714G__) return;
  window.__LF_MESSENGER_DESKTOP_SHELL_CONNECT_FIX_20260714G__ = 1;

  function el(id){ return document.getElementById(id); }
  function q(sel,root){ return (root||document).querySelector(sel); }
  function isDesktop(){ return !window.matchMedia('(max-width: 768px)').matches; }
  function page(){ return el('chat-page'); }
  function shell(){ var p=page(); return p ? q('.chat-shell', p) : null; }
  function roomWrap(){ return el('chat-room-wrap'); }
  function msgs(){ return el('chat-msgs'); }
  function composer(){ var p=page(); return p ? q('.chat-compose', p) : null; }
  function activeRoomSafe(){ try{ return typeof activeRoom==='function' ? activeRoom() : null; }catch(_e){ return null; } }
  function cloudReady(){
    try{ return !!(typeof DB_MODE!=='undefined' && DB_MODE==='firebase' && typeof db!=='undefined' && db); }
    catch(_e){ return false; }
  }

  function ensureStyle(){
    if(el('lf-messenger-desktop-shell-connect-fix-20260714g-style')) return;
    var st=document.createElement('style');
    st.id='lf-messenger-desktop-shell-connect-fix-20260714g-style';
    st.textContent=''
      + '@media (min-width:769px){'
      +   '#pg-chat,#chat-page,#chat-page .chat-shell,#chat-page .chat-side,#chat-page .chat-main,#chat-page #chat-room-wrap{min-height:0!important}'
      +   '#chat-page .chat-shell{height:var(--lf-chat-shell-desktop-h,calc(100vh - 116px))!important;min-height:var(--lf-chat-shell-desktop-h,calc(100vh - 116px))!important}'
      +   '#chat-page .chat-side{min-height:0!important}'
      +   '#chat-page .chat-room-list{min-height:0!important;overflow:auto!important}'
      +   '#chat-page .chat-main{display:flex!important;flex-direction:column!important;min-height:0!important;height:100%!important}'
      +   '#chat-page #chat-room-wrap{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important;height:100%!important}'
      +   '#chat-page .chat-empty{min-height:0!important}'
      +   '#chat-page .chat-top{flex:0 0 auto!important}'
      +   '#chat-page .chat-msgs{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;overscroll-behavior:contain!important;scroll-padding-bottom:132px!important;padding-bottom:14px!important}'
      +   '#chat-page .chat-compose{position:sticky!important;left:0!important;right:0!important;bottom:0!important;z-index:18!important;margin-top:auto!important;background:#fff!important;border-top:1px solid #e7edf5!important}'
      +   'body.theme-classic #chat-page .chat-compose{background:#141b24!important}'
      + '}'
      + '@supports (height: 100dvh){'
      +   '@media (min-width:769px){#chat-page .chat-shell{height:var(--lf-chat-shell-desktop-h,calc(100dvh - 116px))!important;min-height:var(--lf-chat-shell-desktop-h,calc(100dvh - 116px))!important}}'
      + '}';
    document.head.appendChild(st);
  }

  var resizeRaf=0;
  function syncDesktopShellHeight(){
    ensureStyle();
    var p=page(), sh=shell();
    if(!p || !sh) return;
    if(!isDesktop()){
      p.style.removeProperty('--lf-chat-shell-desktop-h');
      sh.style.removeProperty('height');
      sh.style.removeProperty('min-height');
      return;
    }
    var vv=window.visualViewport;
    var viewH=Math.round((vv && vv.height) || window.innerHeight || 0);
    var top=Math.round(p.getBoundingClientRect().top + ((vv && vv.offsetTop) || 0));
    var bottomGap=16;
    var usable=Math.max(420, viewH - top - bottomGap);
    p.style.setProperty('--lf-chat-shell-desktop-h', usable+'px');
    sh.style.height=usable+'px';
    sh.style.minHeight=usable+'px';
  }
  function scheduleSyncDesktopShellHeight(){
    if(resizeRaf) return;
    resizeRaf=requestAnimationFrame(function(){
      resizeRaf=0;
      syncDesktopShellHeight();
    });
  }

  function scrollMsgsToBottom(){
    var box=msgs();
    if(!box) return;
    box.scrollTop=box.scrollHeight;
  }
  function scheduleBottomScroll(){
    requestAnimationFrame(function(){
      scrollMsgsToBottom();
      requestAnimationFrame(scrollMsgsToBottom);
    });
  }

  var reconnectBusy=false;
  var reconnectPoll=null;
  var deferredByKey={};

  function setBusyStatus(text){
    try{
      if(typeof _chatSetSync==='function') _chatSetSync('busy', text || 'Conectando ao Messenger…');
    }catch(_e){}
  }

  function flushDeferred(ok){
    var keys=Object.keys(deferredByKey);
    var jobs=keys.map(function(k){ return deferredByKey[k]; });
    deferredByKey={};
    jobs.forEach(function(job){
      try{
        if(ok) job.run();
        else if(typeof job.reject==='function') job.reject(new Error('cloud-not-ready'));
      }catch(_e){}
    });
  }

  function ensureCloudConnection(){
    if(cloudReady()) return;
    if(!reconnectBusy){
      reconnectBusy=true;
      setBusyStatus('Conectando ao Messenger…');
      try{ if(typeof initDB==='function') initDB(); }catch(_e){}
    }
    if(reconnectPoll) return;
    var tries=0;
    reconnectPoll=setInterval(function(){
      tries++;
      if(cloudReady()){
        clearInterval(reconnectPoll);
        reconnectPoll=null;
        reconnectBusy=false;
        try{ if(typeof startRooms==='function') startRooms(); }catch(_e){}
        flushDeferred(true);
        return;
      }
      if(tries>=120){ // FIX (2026-07-22): 36→120 (18s→60s) — redes móveis lentas ou troca 4G↔WiFi precisam de mais tempo
        clearInterval(reconnectPoll);
        reconnectPoll=null;
        reconnectBusy=false;
        try{ if(typeof _chatSetSync==='function') _chatSetSync('error','Falha ao conectar ao Messenger'); }catch(_e){}
        flushDeferred(false);
      }
    }, 500);
  }

  function deferCloudAction(key, runner){
    key=String(key||'chat-action');
    if(cloudReady()) return runner();
    setBusyStatus('Conectando para continuar…');
    ensureCloudConnection();
    return new Promise(function(resolve,reject){
      deferredByKey[key]={
        reject: reject,
        run: function(){
          Promise.resolve().then(runner).then(resolve).catch(reject);
        }
      };
    });
  }

  function patchOpenRoom(){
    if(typeof window.openRoom!=='function' || window.openRoom.__lfDesktopConnectFix) return;
    var orig=window.openRoom;
    window.openRoom=function(id,silent){
      var prevActive = null;
      var sameRoom = false;
      try{
        prevActive = window.C && C.active ? C.active : null;
        sameRoom = !!(id && prevActive===id && window.C && C.msgUnsub);
      }catch(_e){}
      if(!cloudReady()){
        try{
          if(window.C){
            C.pendingOpenId=id;
            C.forceScrollBottom=true;
          }
        }catch(_e){}
        return deferCloudAction('open:'+String(id||''), function(){
          return orig.call(window,id,silent);
        });
      }
      var out=orig.apply(this,arguments);
      scheduleSyncDesktopShellHeight();
      if(!sameRoom || silent===false){
        scheduleBottomScroll();
      }
      return out;
    };
    window.openRoom.__lfDesktopConnectFix=1;
  }

  function patchCreateDirectRoom(){
    if(typeof window.createDirectRoom!=='function' || window.createDirectRoom.__lfDesktopConnectFix) return;
    var orig=window.createDirectRoom;
    window.createDirectRoom=function(otherId,autoOpen){
      if(!cloudReady()){
        try{ if(window.C) C.forceScrollBottom=true; }catch(_e){}
        return deferCloudAction('direct:'+String(otherId||''), function(){
          return orig.call(window,otherId,autoOpen);
        });
      }
      return orig.apply(this,arguments);
    };
    window.createDirectRoom.__lfDesktopConnectFix=1;
  }

  function patchRenderMsgs(){
    if(typeof window.renderMsgs!=='function' || window.renderMsgs.__lfDesktopConnectFix) return;
    var orig=window.renderMsgs;
    window.renderMsgs=function(){
      var out=orig.apply(this,arguments);
      scheduleSyncDesktopShellHeight();
      var box=msgs();
      if(box && activeRoomSafe()){
        var nearBottom=(box.scrollHeight - box.scrollTop - box.clientHeight) < 140;
        if(nearBottom || (window.C && C.forceScrollBottom)) scheduleBottomScroll();
      }
      return out;
    };
    window.renderMsgs.__lfDesktopConnectFix=1;
  }

  function patchRenderHeaderAndComposer(){
    if(typeof window.renderHeader==='function' && !window.renderHeader.__lfDesktopConnectFix){
      var rh=window.renderHeader;
      window.renderHeader=function(){
        var out=rh.apply(this,arguments);
        scheduleSyncDesktopShellHeight();
        return out;
      };
      window.renderHeader.__lfDesktopConnectFix=1;
    }
    if(typeof window.renderComposer==='function' && !window.renderComposer.__lfDesktopConnectFix){
      var rc=window.renderComposer;
      window.renderComposer=function(){
        var out=rc.apply(this,arguments);
        scheduleSyncDesktopShellHeight();
        return out;
      };
      window.renderComposer.__lfDesktopConnectFix=1;
    }
  }

  function patchStartRooms(){
    if(typeof window.startRooms!=='function' || window.startRooms.__lfDesktopConnectFix) return;
    var orig=window.startRooms;
    window.startRooms=function(){
      var out=orig.apply(this,arguments);
      scheduleSyncDesktopShellHeight();
      return out;
    };
    window.startRooms.__lfDesktopConnectFix=1;
  }

  function bind(){
    window.addEventListener('resize', scheduleSyncDesktopShellHeight, {passive:true});
    window.addEventListener('orientationchange', function(){ setTimeout(scheduleSyncDesktopShellHeight, 120); }, {passive:true});
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', scheduleSyncDesktopShellHeight, {passive:true});
      window.visualViewport.addEventListener('scroll', scheduleSyncDesktopShellHeight, {passive:true});
    }
    document.addEventListener('focusin', function(e){
      if(e.target && e.target.id==='chat-text'){
        scheduleSyncDesktopShellHeight();
        scheduleBottomScroll();
      }
    }, true);
    document.addEventListener('click', function(e){
      var roomNode = e.target && e.target.closest ? e.target.closest('#chat-room-list .chat-room') : null;
      if(roomNode){
        var rid = roomNode.getAttribute('data-room');
        if(rid && (!window.C || C.active!==rid)) scheduleBottomScroll();
      }
    }, true);
  }

  function boot(){
    ensureStyle();
    patchOpenRoom();
    patchCreateDirectRoom();
    patchRenderMsgs();
    patchRenderHeaderAndComposer();
    patchStartRooms();
    bind();
    scheduleSyncDesktopShellHeight();
    setTimeout(scheduleSyncDesktopShellHeight, 60);
    setTimeout(scheduleSyncDesktopShellHeight, 260);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
