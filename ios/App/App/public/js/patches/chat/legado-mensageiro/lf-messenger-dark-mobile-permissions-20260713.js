(function(){
  if(window.__LF_MESSENGER_DARK_MOBILE_PERMISSIONS_20260713__) return;
  window.__LF_MESSENGER_DARK_MOBILE_PERMISSIONS_20260713__ = 1;

  function el(id){ return document.getElementById(id); }
  function q(sel,root){ return (root||document).querySelector(sel); }
  function safeToast(msg,ms){ try{ if(typeof toast==='function') toast(msg,ms); }catch(_e){} }

  function ensureStyle(){
    if(el('lf-messenger-dark-mobile-permissions-20260713-style')) return;
    var st=document.createElement('style');
    st.id='lf-messenger-dark-mobile-permissions-20260713-style';
    st.textContent=''
      + '#pg-chat #chat-new-direct,#pg-chat #chat-new-group{display:none!important}'
      + '#chat-page.bitrix-mainpager-2026 .chat-actions{display:none!important}'
      + '#chat-page.bitrix-mainpager-2026 .chat-side{padding-bottom:92px}'
      + '#chat-page.bitrix-mainpager-2026 .chat-fab{display:inline-flex!important}'
      + 'body.theme-classic #pg-chat .chat-shell{background:#10151d!important;border-color:rgba(255,255,255,.08)!important;box-shadow:0 22px 54px rgba(0,0,0,.42)!important}'
      + 'body.theme-classic #pg-chat .chat-side{background:linear-gradient(180deg,#151b24 0%,#0f141c 100%)!important}'
      + 'body.theme-classic #pg-chat .chat-main{background:linear-gradient(180deg,#0f141c 0%,#0b1118 100%)!important}'
      + 'body.theme-classic #pg-chat .chat-hd,body.theme-classic #pg-chat .chat-top,body.theme-classic #pg-chat .chat-compose{background:#141b24!important;border-color:rgba(255,255,255,.08)!important}'
      + 'body.theme-classic #pg-chat .chat-side-tools,body.theme-classic #pg-chat .chat-room-list{background:#141b24!important;border-color:rgba(255,255,255,.08)!important}'
      + 'body.theme-classic #pg-chat .chat-msgs{background:radial-gradient(circle at top left,rgba(35,58,84,.22),rgba(15,20,28,.96) 34%,rgba(10,15,22,.98) 100%)!important}'
      + 'body.theme-classic #pg-chat .chat-room{background:transparent!important;border-bottom:1px solid rgba(255,255,255,.06)!important}'
      + 'body.theme-classic #pg-chat .chat-room:hover{background:rgba(255,255,255,.03)!important}'
      + 'body.theme-classic #pg-chat .chat-room.on{background:rgba(59,130,246,.14)!important}'
      + 'body.theme-classic #pg-chat .chat-room-name,body.theme-classic #pg-chat .chat-top-title,body.theme-classic #pg-chat .chat-hd h2,body.theme-classic #pg-chat .chat-empty h3{color:#f5f7fb!important}'
      + 'body.theme-classic #pg-chat .chat-room-sub,body.theme-classic #pg-chat .chat-room-last,body.theme-classic #pg-chat .chat-top-sub,body.theme-classic #pg-chat .chat-empty-sub,body.theme-classic #pg-chat .chat-sync-left,body.theme-classic #pg-chat .chat-soft,body.theme-classic #pg-chat .chat-meta,body.theme-classic #pg-chat .chat-row:not(.me) .chat-meta{color:#b4bfce!important}'
      + 'body.theme-classic #pg-chat .chat-input,body.theme-classic #pg-chat .chat-select,body.theme-classic #pg-chat #chat-text{background:#0e141b!important;border:1px solid rgba(255,255,255,.10)!important;color:#f3f6fb!important}'
      + 'body.theme-classic #pg-chat .chat-input::placeholder,body.theme-classic #pg-chat #chat-text::placeholder{color:#8c98ab!important}'
      + 'body.theme-classic #pg-chat .chat-mini{background:#0e141b!important;border-color:rgba(255,255,255,.10)!important;color:#d7dde7!important}'
      + 'body.theme-classic #pg-chat .chat-mini:hover{background:#17202b!important;border-color:rgba(255,255,255,.14)!important}'
      + 'body.theme-classic #pg-chat .chat-day{background:#151c26!important;border-color:rgba(255,255,255,.08)!important;color:#dbe2ec!important}'
      + 'body.theme-classic #pg-chat .chat-bubble{background:#151c26!important;border:1px solid rgba(255,255,255,.08)!important;color:#eef2f7!important;box-shadow:0 10px 24px rgba(0,0,0,.26)!important}'
      + 'body.theme-classic #pg-chat .chat-row.me .chat-bubble{background:linear-gradient(180deg,#1b3b2a,#173123)!important;border-color:rgba(84,214,145,.18)!important}'
      + 'body.theme-classic #pg-chat .chat-text{color:#eef2f7!important}'
      + 'body.theme-classic #pg-chat .chat-author,body.theme-classic #pg-chat .chat-att a{color:#8fc4ff!important}'
      + 'body.theme-classic #pg-chat .chat-reply{background:#101720!important;border-left-color:#60a5fa!important;color:#dce4ee!important}'
      + 'body.theme-classic #pg-chat .chat-reply b{color:#8fc4ff!important}'
      + 'body.theme-classic #pg-chat .chat-att{background:#101720!important;border-color:rgba(255,255,255,.08)!important}'
      + 'body.theme-classic #pg-chat .chat-att small{color:#b4bfce!important}'
      + 'body.theme-classic #pg-chat #chat-send{background:linear-gradient(180deg,#3b82f6,#2563eb)!important;border:none!important;color:#fff!important;box-shadow:0 12px 24px rgba(37,99,235,.28)!important}'
      + 'body.theme-classic #pg-chat #chat-rec.on{background:rgba(217,45,32,.14)!important;border-color:rgba(217,45,32,.34)!important;color:#ffb4b1!important}'
      + '@media (max-width:768px){'
      + '  #chat-page.chat-cleanup-final .chat-compose{position:sticky!important;left:0;right:0;bottom:0!important;z-index:35!important;margin-top:auto!important;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px))!important;background:inherit!important}'
      + '  #chat-page.chat-cleanup-final .chat-compose-row{display:grid!important;grid-template-columns:42px 42px minmax(0,1fr) 42px!important;gap:8px!important;align-items:center!important}'
      + '  #chat-page.chat-cleanup-final #chat-attach{grid-column:1!important;grid-row:1!important}'
      + '  #chat-page.chat-cleanup-final #chat-rec{grid-column:2!important;grid-row:1!important}'
      + '  #chat-page.chat-cleanup-final #chat-text{grid-column:3!important;grid-row:1!important;width:100%!important;min-width:0!important;min-height:46px!important;max-height:120px!important;padding:12px 14px!important;overflow-y:auto!important;white-space:pre-wrap!important}'
      + '  #chat-page.chat-cleanup-final #chat-send{grid-column:4!important;grid-row:1!important;width:42px!important;height:42px!important;min-width:42px!important;border-radius:50%!important;font-size:0!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}'
      + '  #chat-page.chat-cleanup-final #chat-send::before{content:"➤";font-size:1rem;line-height:1}'
      + '  #chat-page.chat-cleanup-final #chat-attach,#chat-page.chat-cleanup-final #chat-rec{width:42px!important;height:42px!important;min-width:42px!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}'
      + '  #chat-page.chat-cleanup-final .chat-msgs{padding:14px 12px 14px!important;scroll-padding-bottom:120px!important}'
      + '  #chat-page.chat-cleanup-final.room-open .chat-main,#chat-page.chat-cleanup-final.room-open #chat-room-wrap{height:100%!important;min-height:0!important}'
      + '  body.theme-classic #chat-page.bitrix-mainpager-2026 .chat-top-title{color:#f5f7fb!important}'
      + '  body.theme-classic #chat-page.bitrix-mainpager-2026 .chat-top-sub{color:#b4bfce!important}'
      + '}';
    document.head.appendChild(st);
  }

  function ensureFabIntent(){
    var page=el('chat-page');
    if(!page) return;
    var side=q('.chat-side', page);
    if(!side) return;
    var fab=el('chat-fab-create');
    if(!fab){
      fab=document.createElement('button');
      fab.type='button';
      fab.id='chat-fab-create';
      fab.className='chat-fab';
      fab.title='Criar conversa ou grupo';
      fab.setAttribute('aria-label','Criar conversa ou grupo');
      fab.textContent='+';
      side.appendChild(fab);
    }
  }

  function syncMicUX(){
    var rec=el('chat-rec');
    if(!rec) return;
    rec.title='Gravar áudio';
    if(!window.isSecureContext && !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname||'')){
      rec.title='Gravar áudio (requer HTTPS)';
    }
    if(navigator.permissions && navigator.permissions.query){
      try{
        navigator.permissions.query({name:'microphone'}).then(function(status){
          if(!status) return;
          function apply(){
            if(status.state==='denied') rec.title='Microfone bloqueado no navegador';
            else if(status.state==='granted') rec.title='Gravar áudio';
          }
          apply();
          if(typeof status.addEventListener==='function') status.addEventListener('change', apply);
        }).catch(function(e){console.warn("[messenger] bg op falhou",e);});
      }catch(_e){}
    }
  }

  function patchRecorderGuidance(){
    if(typeof window.toggleRecord!=='function' || window.toggleRecord.__lfMicGuidancePatch) return;
    var prev=window.toggleRecord;
    window.toggleRecord=function(){
      if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)){
        safeToast('Seu navegador não suporta gravação de áudio neste aparelho.',4200);
        return prev.apply(this, arguments);
      }
      if(!window.isSecureContext && !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname||'')){
        safeToast('O microfone só funciona com HTTPS. Abra o CRM pelo endereço seguro.',4600);
      }
      return prev.apply(this, arguments);
    };
    window.toggleRecord.__lfMicGuidancePatch=1;
  }

  function syncAll(){
    ensureStyle();
    ensureFabIntent();
    syncMicUX();
  }

  function boot(){
    syncAll();
    patchRecorderGuidance();
    if(typeof window.renderComposer==='function' && !window.renderComposer.__lfMessengerFinalAdjust){
      var rc=window.renderComposer;
      window.renderComposer=function(){ var out=rc.apply(this, arguments); setTimeout(syncAll,0); return out; };
      window.renderComposer.__lfMessengerFinalAdjust=1;
    }
    if(typeof window.renderHeader==='function' && !window.renderHeader.__lfMessengerFinalAdjust){
      var rh=window.renderHeader;
      window.renderHeader=function(){ var out=rh.apply(this, arguments); setTimeout(syncAll,0); return out; };
      window.renderHeader.__lfMessengerFinalAdjust=1;
    }
    if(typeof window.renderRooms==='function' && !window.renderRooms.__lfMessengerFinalAdjust){
      var rr=window.renderRooms;
      window.renderRooms=function(){ var out=rr.apply(this, arguments); setTimeout(syncAll,0); return out; };
      window.renderRooms.__lfMessengerFinalAdjust=1;
    }
    document.addEventListener('click', function(e){
      if(e.target && e.target.closest('#chat-rec')) setTimeout(syncMicUX,120);
    }, true);
    window.addEventListener('resize', syncAll, {passive:true});
    setTimeout(syncAll,60);
    setTimeout(syncAll,300);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
