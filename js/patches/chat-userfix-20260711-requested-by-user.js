(function(){
  if(window.__CHAT_USERFIX_20260711__) return;
  window.__CHAT_USERFIX_20260711__ = 1;

  function q(s,p){ return (p||document).querySelector(s); }
  function qa(s,p){ return Array.prototype.slice.call((p||document).querySelectorAll(s)); }
  function el(id){ return document.getElementById(id); }
  function mob(){ return window.matchMedia('(max-width:768px)').matches; }
  function activeRoomSafe(){ return typeof activeRoom === 'function' ? activeRoom() : null; }
  function currentUserSafe(){
    if(typeof currentUser === 'function') return currentUser();
    if(typeof getUser === 'function' && window.S && S.userId) return getUser(S.userId);
    return null;
  }
  function phoneRaw(u){ return u && (u.whatsapp || u.telefone || u.phone || u.celular || '') || ''; }
  function icon(name){
    var map = {
      search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.8" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M20 20l-4.3-4.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
      close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
      up:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5l-7 7m7-7 7 7M12 5v14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      down:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19l7-7m-7 7-7-7m7 7V5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5c.07-.33.1-.67.1-1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    };
    return map[name] || '';
  }

  function ensureStyle(){
    if(el('chat-userfix-20260711-style')) return;
    var st = document.createElement('style');
    st.id = 'chat-userfix-20260711-style';
    st.textContent = `
      #chat-page.chat-userfix-20260711{--uf-line:#e7edf5;--uf-bg:#fff;--uf-blue:#1f87ff;--uf-blue-soft:#eef5ff;--uf-text:#1f2937;--uf-muted:#778396}
      #chat-page.chat-userfix-20260711 .chat-main,
      #chat-page.chat-userfix-20260711 #chat-room-wrap{min-height:0!important}
      #chat-page.chat-userfix-20260711 .chat-top-right{display:flex!important;align-items:center!important;gap:8px!important}
      #chat-page.chat-userfix-20260711 #chat-video-btn,
      #chat-page.chat-userfix-20260711 #chat-call-btn,
      #chat-page.chat-userfix-20260711 #chat-video-pill,
      #chat-page.chat-userfix-20260711 .chat-room-members-btn,
      #chat-page.chat-userfix-20260711 .chat-room-search-btn,
      #chat-page.chat-userfix-20260711 .chat-room-menu-desktop,
      #chat-page.chat-userfix-20260711 #chat-room-menu,
      #chat-page.chat-userfix-20260711 #chat-emoji-btn{display:none!important}
      #chat-page.chat-userfix-20260711 .chat-only-search-btn,
      #chat-page.chat-userfix-20260711 #chat-msg-search-close,
      #chat-page.chat-userfix-20260711 .chat-jump-btn{width:40px;height:40px;min-width:40px;border-radius:12px;border:1px solid var(--uf-line);background:#fff;color:#5f6b7c;display:inline-flex;align-items:center;justify-content:center;padding:0;box-shadow:none}
      #chat-page.chat-userfix-20260711 .chat-only-search-btn svg,
      #chat-page.chat-userfix-20260711 #chat-msg-search-close svg,
      #chat-page.chat-userfix-20260711 .chat-jump-btn svg{width:18px;height:18px}
      #chat-page.chat-userfix-20260711 #chat-msg-search-row{display:none!important;grid-template-columns:minmax(0,1fr) auto!important;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--uf-line);background:#fff}
      #chat-page.chat-userfix-20260711.chat-search-open #chat-msg-search-row{display:grid!important}
      #chat-page.chat-userfix-20260711 #chat-msg-search{height:42px;min-height:42px;border-radius:999px!important;background:#fff!important;border:1px solid #dbe4ee!important;padding:0 14px!important}
      #chat-page.chat-userfix-20260711 #chat-msg-search-meta{display:none!important}
      #chat-page.chat-userfix-20260711 .chat-jump-controls{position:absolute;right:14px;bottom:88px;z-index:24;display:grid;gap:8px}
      #chat-page.chat-userfix-20260711 .chat-jump-btn{box-shadow:0 10px 24px rgba(15,23,42,.12);background:rgba(255,255,255,.96)}
      #chat-page.chat-userfix-20260711 .chat-jump-btn[disabled]{opacity:.38;pointer-events:none}
      #chat-page.chat-userfix-20260711 .chat-compose{background:#fff!important;border-top:1px solid var(--uf-line)!important;box-shadow:0 -10px 24px rgba(15,23,42,.08)!important}
      #chat-page.chat-userfix-20260711 .chat-compose-row{display:grid!important;grid-template-columns:42px 42px minmax(0,1fr) 42px!important;gap:8px!important;align-items:end!important}
      #chat-page.chat-userfix-20260711 #chat-attach,
      #chat-page.chat-userfix-20260711 #chat-rec,
      #chat-page.chat-userfix-20260711 #chat-send{width:42px!important;height:42px!important;min-width:42px!important;padding:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;border-radius:12px!important}
      #chat-page.chat-userfix-20260711 #chat-send{border:none!important;border-radius:50%!important;background:var(--uf-blue)!important;color:#fff!important;box-shadow:0 10px 20px rgba(31,135,255,.22)!important}
      #chat-page.chat-userfix-20260711 #chat-text{width:100%!important;min-height:48px!important;max-height:130px!important;border-radius:22px!important;padding:12px 14px!important;background:#fff!important;border:1px solid #dbe4ee!important;line-height:1.35!important;box-sizing:border-box!important}
      #chat-page.chat-userfix-20260711 .chat-reply-box,
      #chat-page.chat-userfix-20260711 .chat-queue,
      #chat-page.chat-userfix-20260711 .chat-edit-box{border-radius:14px!important}
      @media (min-width:769px){
        #chat-page.chat-userfix-20260711 .chat-shell{min-height:calc(100vh - 108px)!important}
        #chat-page.chat-userfix-20260711 .chat-main{display:flex!important;flex-direction:column!important;height:100%!important;min-height:0!important;position:relative!important}
        #chat-page.chat-userfix-20260711 #chat-room-wrap{display:flex!important;flex-direction:column!important;height:100%!important;min-height:0!important}
        #chat-page.chat-userfix-20260711 .chat-top{position:sticky!important;top:0!important;z-index:15!important;background:#fff!important;border-bottom:1px solid var(--uf-line)!important}
        #chat-page.chat-userfix-20260711 .chat-msgs{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;padding:18px 20px 14px!important}
        #chat-page.chat-userfix-20260711 .chat-compose{position:sticky!important;bottom:0!important;z-index:20!important;margin-top:auto!important;padding:12px 14px!important}
        #chat-page.chat-userfix-20260711 .chat-jump-controls{right:18px;bottom:92px}
      }
      @media (max-width:768px){
        #chat-page.chat-userfix-20260711.room-open .chat-main{display:flex!important;height:100%!important;min-height:0!important;position:relative!important}
        #chat-page.chat-userfix-20260711.room-open #chat-room-wrap{display:flex!important;height:100%!important;min-height:0!important;flex-direction:column!important}
        #chat-page.chat-userfix-20260711.room-open .chat-msgs{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;padding:14px 12px 12px!important}
        #chat-page.chat-userfix-20260711 .chat-compose{position:sticky!important;bottom:0!important;z-index:20!important;margin-top:auto!important;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px))!important}
        #chat-page.chat-userfix-20260711 .chat-top{padding:10px 12px!important}
        #chat-page.chat-userfix-20260711 .chat-top-sub{max-width:54vw!important}
        #chat-page.chat-userfix-20260711 .chat-jump-controls{right:12px;bottom:84px}
      }
      #cfg-desc{min-height:92px;resize:vertical}
    `;
    document.head.appendChild(st);
  }

  function ensureSearchRow(){
    var row = el('chat-msg-search-row');
    if(!row) return;
    if(!el('chat-msg-search-close')){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'chat-msg-search-close';
      btn.className = 'chat-mini';
      btn.setAttribute('aria-label','Fechar busca');
      btn.innerHTML = icon('close');
      row.appendChild(btn);
    }
  }

  function setSearchOpen(open){
    var page = el('chat-page');
    if(!page) return;
    page.classList.toggle('chat-search-open', !!open);
    var inp = el('chat-msg-search');
    if(open){
      setTimeout(function(){ try{ if(inp) inp.focus(); }catch(_e){} }, 20);
    }else if(inp){
      if(inp.value){ inp.value = ''; }
      if(window.C) C.msgSearch = '';
      if(typeof renderMsgs === 'function') renderMsgs();
    }
  }

  function cleanTopRight(){
    var page = el('chat-page');
    var right = page && q('.chat-top-right', page);
    if(!right) return;
    page.classList.add('chat-userfix-20260711');
    var search = document.createElement('button');
    search.type = 'button';
    search.id = 'chat-search-msg-btn';
    search.className = 'chat-mini chat-only-search-btn';
    search.setAttribute('aria-label','Pesquisar na conversa');
    search.title = 'Pesquisar na conversa';
    search.innerHTML = icon('search');
    right.innerHTML = '';
    right.appendChild(search);
  }

  function ensureConfigButton(){
    var actions = q('#chat-page .chat-actions');
    if(!actions) return;
    var btn = el('chat-wa-settings-btn');
    if(!btn){
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-mini';
      btn.id = 'chat-wa-settings-btn';
      actions.appendChild(btn);
    }
    btn.innerHTML = icon('settings');
    btn.title = 'Configurações do usuário';
    btn.setAttribute('aria-label','Configurações do usuário');
  }

  function ensureProfileFields(){
    var name = el('cfg-nome');
    var email = el('cfg-email');
    if(!name || !email) return;
    var section = name.closest('.settings-section');
    if(!section) return;

    var phone = el('cfg-whatsapp');
    if(phone){
      var lbl0 = section.querySelector('label[for="cfg-whatsapp"]');
      if(lbl0) lbl0.textContent = 'Telefone / WhatsApp';
    }else{
      var rowPhone = document.createElement('div');
      rowPhone.className = 'mf';
      rowPhone.id = 'cfg-phone-wrap';
      rowPhone.innerHTML = '<label for="cfg-whatsapp">Telefone / WhatsApp</label><input type="text" id="cfg-whatsapp" autocomplete="off" inputmode="tel" placeholder="Ex: +55 11 99999-9999">';
      email.parentNode.insertAdjacentElement('afterend', rowPhone);
    }

    if(!el('cfg-desc')){
      var saveBtn = section.querySelector('button[onclick*="saveProfileData"]');
      var rowDesc = document.createElement('div');
      rowDesc.className = 'mf';
      rowDesc.id = 'cfg-desc-wrap';
      rowDesc.innerHTML = '<label for="cfg-desc">Descrição</label><textarea id="cfg-desc" autocomplete="off" maxlength="220" placeholder="Ex: Consultor comercial, foco em atendimento e relacionamento com clientes."></textarea>';
      if(saveBtn) section.insertBefore(rowDesc, saveBtn);
      else section.appendChild(rowDesc);
    }
  }

  function syncProfileFields(){
    ensureProfileFields();
    var u = currentUserSafe();
    if(!u) return;
    if(el('cfg-whatsapp')) el('cfg-whatsapp').value = u.whatsapp || u.telefone || u.phone || u.celular || '';
    if(el('cfg-desc')) el('cfg-desc').value = u.descricao || u.descricaoPerfil || u.bio || '';
  }

  function patchProfileSave(){
    if(window.saveProfileData && window.saveProfileData.__userfix20260711) return;
    window.saveProfileData = function(){
      var nome = (el('cfg-nome') && el('cfg-nome').value || '').trim();
      var email = (el('cfg-email') && el('cfg-email').value || '').trim();
      var whatsapp = (el('cfg-whatsapp') && el('cfg-whatsapp').value || '').trim();
      var descricao = (el('cfg-desc') && el('cfg-desc').value || '').trim();
      if(!nome){ if(typeof toast==='function') toast('Nome inválido.'); return; }
      var users = typeof getUsers === 'function' ? getUsers() : [];
      var uid = window.S && S.userId;
      var u = users.find(function(x){ return x.id === uid; });
      if(!u){ if(typeof toast==='function') toast('Usuário não encontrado.'); return; }
      u.nome = nome;
      u.email = email;
      u.whatsapp = whatsapp;
      u.descricao = descricao;
      if(typeof saveUsersLocal === 'function') saveUsersLocal(users, u.id, {nome:nome, email:email, whatsapp:whatsapp, descricao:descricao});
      if(window.S){ S.nome = nome; S.email = email; try{ if(typeof ss === 'function') ss('lf6_s', S); }catch(_e){} }
      var nu = el('nav-un'); if(nu) nu.textContent = nome;
      if(typeof toast === 'function') toast('Dados salvos!');
    };
    window.saveProfileData.__userfix20260711 = 1;

    if(typeof window.renderConfig === 'function' && !window.renderConfig.__userfix20260711){
      var orig = window.renderConfig;
      window.renderConfig = function(){
        var out = orig.apply(this, arguments);
        setTimeout(syncProfileFields, 0);
        return out;
      };
      window.renderConfig.__userfix20260711 = 1;
    }
  }

  function ensureJumpControls(){
    var page = el('chat-page');
    var main = page && q('.chat-main', page);
    var wrap = el('chat-room-wrap');
    if(!page || !main || !wrap) return;
    page.classList.add('chat-userfix-20260711');
    var ctrl = el('chat-jump-controls');
    if(!ctrl){
      ctrl = document.createElement('div');
      ctrl.id = 'chat-jump-controls';
      ctrl.className = 'chat-jump-controls';
      ctrl.innerHTML = '<button type="button" class="chat-jump-btn" id="chat-jump-top" aria-label="Ir para o início da conversa">'+icon('up')+'</button>'+
                       '<button type="button" class="chat-jump-btn" id="chat-jump-bottom" aria-label="Ir para o final da conversa">'+icon('down')+'</button>';
      main.appendChild(ctrl);
    }
    bindMsgScroll();
    syncJumpButtons();
  }

  function bindMsgScroll(){
    var box = el('chat-msgs');
    if(!box || box.dataset.userfixScrollBound) return;
    box.dataset.userfixScrollBound = '1';
    box.addEventListener('scroll', syncJumpButtons, {passive:true});
  }

  function syncJumpButtons(){
    var box = el('chat-msgs');
    var ctrl = el('chat-jump-controls');
    if(!box || !ctrl || !activeRoomSafe()){
      if(ctrl) ctrl.style.display = 'none';
      return;
    }
    var max = Math.max(0, box.scrollHeight - box.clientHeight);
    if(max < 80){ ctrl.style.display = 'none'; return; }
    ctrl.style.display = 'grid';
    var nearTop = box.scrollTop < 40;
    var nearBottom = (max - box.scrollTop) < 40;
    if(el('chat-jump-top')) el('chat-jump-top').disabled = nearTop;
    if(el('chat-jump-bottom')) el('chat-jump-bottom').disabled = nearBottom;
  }

  function scrollMsgs(where){
    var box = el('chat-msgs');
    if(!box) return;
    box.scrollTo({ top: where === 'top' ? 0 : box.scrollHeight, behavior: 'smooth' });
    setTimeout(syncJumpButtons, 240);
  }

  function keepComposerVisible(){
    var page = el('chat-page');
    var box = el('chat-msgs');
    if(!page || !box) return;
    page.classList.add('chat-userfix-20260711');
    bindMsgScroll();
    syncJumpButtons();
  }

  function syncAll(){
    ensureStyle();
    cleanTopRight();
    ensureSearchRow();
    ensureConfigButton();
    ensureProfileFields();
    patchProfileSave();
    ensureJumpControls();
    keepComposerVisible();
  }

  function bind(){
    if(window.__CHAT_USERFIX_20260711_BIND__) return;
    window.__CHAT_USERFIX_20260711_BIND__ = 1;

    document.addEventListener('click', function(e){
      var t = e.target;
      if(t && t.closest('#chat-search-msg-btn')){
        e.preventDefault(); e.stopPropagation();
        var page = el('chat-page');
        var isOpen = !!(page && page.classList.contains('chat-search-open'));
        setSearchOpen(!isOpen);
        return;
      }
      if(t && t.closest('#chat-msg-search-close')){
        e.preventDefault(); e.stopPropagation();
        setSearchOpen(false);
        return;
      }
      if(t && t.closest('#chat-wa-settings-btn')){
        e.preventDefault(); e.stopPropagation();
        if(typeof goPage === 'function') goPage('config');
        setTimeout(function(){
          syncProfileFields();
          try{ if(el('cfg-nome')) el('cfg-nome').focus(); }catch(_e){}
        }, 40);
        return;
      }
      if(t && t.closest('#chat-jump-top')){
        e.preventDefault(); e.stopPropagation(); scrollMsgs('top'); return;
      }
      if(t && t.closest('#chat-jump-bottom')){
        e.preventDefault(); e.stopPropagation(); scrollMsgs('bottom'); return;
      }
    }, true);

    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape' && el('chat-page') && el('chat-page').classList.contains('chat-search-open')) setSearchOpen(false);
    }, true);

    document.addEventListener('focusin', function(e){
      if(e.target && e.target.id === 'chat-text') setTimeout(keepComposerVisible, 30);
    }, true);
    document.addEventListener('input', function(e){
      if(e.target && e.target.id === 'chat-text') setTimeout(keepComposerVisible, 0);
    }, true);

    window.addEventListener('resize', syncAll, {passive:true});
    window.addEventListener('orientationchange', function(){ setTimeout(syncAll, 120); }, {passive:true});
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', syncAll, {passive:true});
      window.visualViewport.addEventListener('scroll', syncAll, {passive:true});
    }
  }

  function patchFns(){
    if(typeof window.renderRooms === 'function' && !window.renderRooms.__userfix20260711){
      var rr = window.renderRooms;
      window.renderRooms = function(){ var out = rr.apply(this, arguments); setTimeout(syncAll, 0); return out; };
      window.renderRooms.__userfix20260711 = 1;
    }
    if(typeof window.renderHeader === 'function' && !window.renderHeader.__userfix20260711){
      var rh = window.renderHeader;
      window.renderHeader = function(){ var out = rh.apply(this, arguments); setTimeout(syncAll, 0); return out; };
      window.renderHeader.__userfix20260711 = 1;
    }
    if(typeof window.renderComposer === 'function' && !window.renderComposer.__userfix20260711){
      var rc = window.renderComposer;
      window.renderComposer = function(){ var out = rc.apply(this, arguments); setTimeout(syncAll, 0); return out; };
      window.renderComposer.__userfix20260711 = 1;
    }
    if(typeof window.openRoom === 'function' && !window.openRoom.__userfix20260711){
      var oroom = window.openRoom;
      window.openRoom = function(){ var out = oroom.apply(this, arguments); setTimeout(function(){ setSearchOpen(false); syncAll(); scrollMsgs('bottom'); }, 20); return out; };
      window.openRoom.__userfix20260711 = 1;
    }
    if(typeof window.closeRoomMobile === 'function' && !window.closeRoomMobile.__userfix20260711){
      var croom = window.closeRoomMobile;
      window.closeRoomMobile = function(){ var out = croom.apply(this, arguments); setTimeout(function(){ setSearchOpen(false); syncAll(); }, 20); return out; };
      window.closeRoomMobile.__userfix20260711 = 1;
    }
    if(typeof window.renderConfig === 'function' && !window.renderConfig.__userfixSyncOnly){
      var rcfg = window.renderConfig;
      window.renderConfig = function(){ var out = rcfg.apply(this, arguments); setTimeout(syncProfileFields, 0); return out; };
      window.renderConfig.__userfixSyncOnly = 1;
    }
  }

  function boot(){
    patchFns();
    bind();
    syncAll();
    setTimeout(syncAll, 60);
    setTimeout(syncAll, 260);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
