/**
 * lf-chat-avatar-presence-profile-fix-20260727.js
 *
 * Correções cirúrgicas para 2 bugs relatados:
 *  1) Foto de perfil não persiste / não aparece no chat
 *  2) Usuários online não aparecem corretamente no bate-papo
 *
 * Estratégia:
 *  - Persistir a foto em localStorage E no cadastro do usuário via saveUsersLocal()
 *    (que já é o caminho usado pelo projeto para sincronizar alterações de usuário).
 *  - Hidratar o cache local da foto a partir do cadastro remoto ao abrir o app.
 *  - Reaproveitar a foto no chat (lista e header), sem reescrever chat.js.
 *  - Trocar o indicador de "online" do chat para usar presença REAL (_chatIsOnline)
 *    em vez de u.ativo / heartbeat local inexistente de terceiros.
 */
(function(){
  'use strict';
  if(window.__LF_CHAT_AVATAR_PRESENCE_PROFILE_FIX_20260727__) return;
  window.__LF_CHAT_AVATAR_PRESENCE_PROFILE_FIX_20260727__ = true;

  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function escAttr(v){ return (typeof _htmlAttr==='function') ? _htmlAttr(v) : String(v||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
  function byId(id){ return document.getElementById(id); }
  function getMe(){ return window.S||null; }
  function getUsersList(){ return (typeof getUsers==='function' ? (getUsers()||[]) : []); }
  function getUsr(uid){
    if(typeof getUser==='function'){
      var u = safe(function(){ return getUser(uid); }, null);
      if(u) return u;
    }
    var list = getUsersList();
    for(var i=0;i<list.length;i++) if(list[i] && String(list[i].id)===String(uid)) return list[i];
    return null;
  }
  function picKey(uid){ return 'lf13_pic_'+uid; }
  function readLocalPic(uid){
    if(!uid || typeof sg!=='function') return '';
    var v = safe(function(){ return sg(picKey(uid)); }, '');
    return (typeof v==='string' && v.indexOf('data:image/')===0) ? v : '';
  }
  function readUserPic(uid){
    var u = getUsr(uid);
    if(!u) return '';
    var cand = u.pic || u.picData || u.photo || u.photoData || u.profilePic || u.avatarUrl || '';
    return (typeof cand==='string' && cand) ? cand : '';
  }
  function getPic(uid){ return readLocalPic(uid) || readUserPic(uid) || ''; }
  function ensureLocalPic(uid){
    if(!uid || typeof ss!=='function') return '';
    var local = readLocalPic(uid);
    if(local) return local;
    var remote = readUserPic(uid);
    if(remote){ safe(function(){ ss(picKey(uid), remote); }); return remote; }
    return '';
  }
  function persistUserPic(uid, data){
    if(!uid || typeof ss!=='function') return false;
    if(data){
      var ok = safe(function(){ return ss(picKey(uid), data); }, false);
      if(!ok) return false;
    }else{
      safe(function(){ ss(picKey(uid), null); });
      safe(function(){ localStorage.removeItem(picKey(uid)); });
    }

    var list = getUsersList();
    var u = null;
    for(var i=0;i<list.length;i++) if(list[i] && String(list[i].id)===String(uid)){ u=list[i]; break; }
    if(u){
      u.pic = data || null;
      u.picData = data || null;
      u.photo = data || null;
      u.photoData = data || null;
      u.profilePic = data || null;
      u.avatarUrl = data || null;
      if(typeof saveUsersLocal==='function'){
        safe(function(){
          saveUsersLocal(list, uid, {
            pic: data || null,
            picData: data || null,
            photo: data || null,
            photoData: data || null,
            profilePic: data || null,
            avatarUrl: data || null
          });
        });
      }
    }
    var S = getMe();
    if(S && S.userId===uid){
      S.pic = data || null;
      S.profilePic = data || null;
      safe(function(){ ss('lf6_s', S); });
    }
    safe(function(){ window.dispatchEvent(new CustomEvent('crm:users-updated',{detail:{reason:'profile-pic-sync',uid:uid}})); });
    return true;
  }
  function renderNodeAvatar(el, uid, name, color){
    if(!el) return;
    var pic = getPic(uid);
    if(pic){
      el.style.background = 'transparent';
      el.innerHTML = '<img src="'+escAttr(pic)+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block">';
      return;
    }
    el.innerHTML = '';
    el.textContent = String(name||'?').charAt(0).toUpperCase();
    if(color) el.style.background = color;
  }
  function refreshChromeAvatar(){
    var S = getMe(); if(!S||!S.userId) return;
    var me = getUsr(S.userId) || S;
    var name = (me&&me.nome) || S.nome || '?';
    var color = (typeof AVB!=='undefined' && AVB && AVB.length) ? AVB[((me&&me.cor)||S.cor||0)%AVB.length] : '#64748b';
    ['nav-av','mtb-av','mmd-av','cfg-pic-preview'].forEach(function(id){ renderNodeAvatar(byId(id), S.userId, name, color); });
    var nu = byId('nav-un'); if(nu && name) nu.textContent = name;
  }
  function realOnline(uid){
    if(!uid) return false;
    if(typeof _chatIsOnline==='function') return !!safe(function(){ return _chatIsOnline(uid); }, false);
    return false;
  }
  function patchChatListDom(){
    if(typeof _chatGetConvs!=='function' || typeof _chatOtherUid!=='function') return;
    var convs = safe(function(){ return _chatGetConvs()||[]; }, []);
    var items = document.querySelectorAll('#chat-conv-list .chat-conv-item');
    items.forEach(function(el){
      var cid = el.getAttribute('data-conv-id');
      var conv = convs.find(function(c){ return c && String(c.id)===String(cid); });
      if(!conv || conv.isGroup) return;
      var other = safe(function(){ return _chatOtherUid(conv); }, '');
      var u = other ? getUsr(other) : null;
      var name = (u&&u.nome) || (typeof _chatOtherUserName==='function' ? safe(function(){ return _chatOtherUserName(conv); }, '') : '') || '?';
      var color = (typeof _chatOtherUserColor==='function') ? safe(function(){ return _chatOtherUserColor(conv); }, '') : '';
      var av = el.querySelector('.chat-conv-avatar');
      if(av) renderNodeAvatar(av, other, name, color);
      if(av){
        var dot = av.querySelector('.chat-online-dot');
        if(realOnline(other)){
          if(!dot){ dot=document.createElement('span'); dot.className='chat-online-dot'; av.appendChild(dot); }
        }else if(dot){ dot.remove(); }
      }
    });
  }
  function patchChatHeaderDom(convId){
    if(!convId || typeof _chatGetConvs!=='function') return;
    var convs = safe(function(){ return _chatGetConvs()||[]; }, []);
    var conv = convs.find(function(c){ return c && String(c.id)===String(convId); });
    if(!conv) return;
    if(conv.isGroup) return;
    var other = (typeof _chatOtherUid==='function') ? safe(function(){ return _chatOtherUid(conv); }, '') : '';
    var u = other ? getUsr(other) : null;
    var name = (u&&u.nome) || (typeof _chatOtherUserName==='function' ? safe(function(){ return _chatOtherUserName(conv); }, '') : '') || '?';
    var color = (typeof _chatOtherUserColor==='function') ? safe(function(){ return _chatOtherUserColor(conv); }, '') : '';
    var av = document.querySelector('#chat-conv-header .chat-conv-hd-avatar');
    if(av) renderNodeAvatar(av, other, name, color);
    var st = document.querySelector('#chat-conv-header .chat-conv-hd-status');
    if(st) st.textContent = realOnline(other) ? 'online' : 'offline';
  }

  // Reimplementa upload da foto com persistência local + cadastro do usuário.
  window.handlePicUpload = function(inp){
    var file = inp && inp.files && inp.files[0]; if(!file) return;
    if(!file.type || file.type.indexOf('image/')!==0){ toast('⚠️ Selecione um arquivo de imagem válido (JPG, PNG, WebP…)'); inp.value=''; return; }
    if(file.size>20*1024*1024){ toast('⚠️ Imagem muito grande. Use uma imagem menor que 20MB.',4000); inp.value=''; return; }
    if(!getMe() || !getMe().userId){ toast('Sessão inválida. Faça login novamente.'); inp.value=''; return; }
    toast('Otimizando foto...',1500);
    compressImageFile(file,900000,function(data){
      if(!data || String(data).indexOf('data:image/')!==0){ toast('⚠️ Arquivo inválido.'); inp.value=''; return; }
      var ok = persistUserPic(getMe().userId, data);
      if(!ok){ toast('⚠️ Foto muito grande para o armazenamento local. Tente uma imagem menor.',4500); inp.value=''; return; }
      refreshChromeAvatar();
      patchChatListDom();
      if(typeof _chatCurrentConv!=='undefined' && _chatCurrentConv) patchChatHeaderDom(_chatCurrentConv);
      toast('Foto atualizada!');
      inp.value='';
    });
  };

  window.removePic = function(){
    var S = getMe(); if(!S||!S.userId) return;
    persistUserPic(S.userId, null);
    refreshChromeAvatar();
    patchChatListDom();
    if(typeof _chatCurrentConv!=='undefined' && _chatCurrentConv) patchChatHeaderDom(_chatCurrentConv);
    toast('Foto removida');
  };

  if(typeof window.startApp==='function'){
    var _origStartApp = window.startApp;
    window.startApp = function(){
      var r = _origStartApp.apply(this, arguments);
      try{ var S=getMe(); if(S&&S.userId) ensureLocalPic(S.userId); }catch(_e){}
      setTimeout(refreshChromeAvatar, 0);
      return r;
    };
  }

  if(typeof window.renderConfig==='function'){
    var _origRenderConfig = window.renderConfig;
    window.renderConfig = function(){
      var r = _origRenderConfig.apply(this, arguments);
      setTimeout(refreshChromeAvatar, 0);
      return r;
    };
  }

  if(typeof window.renderChatList==='function'){
    var _origRenderChatList = window.renderChatList;
    window.renderChatList = function(){
      var r = _origRenderChatList.apply(this, arguments);
      setTimeout(function(){ patchChatListDom(); if(typeof _chatCurrentConv!=='undefined' && _chatCurrentConv) patchChatHeaderDom(_chatCurrentConv); }, 0);
      return r;
    };
  }

  if(typeof window.openChatConv==='function'){
    var _origOpenChatConv = window.openChatConv;
    window.openChatConv = function(convId){
      var r = _origOpenChatConv.apply(this, arguments);
      setTimeout(function(){ patchChatHeaderDom(convId); patchChatListDom(); }, 0);
      return r;
    };
  }

  window.addEventListener('crm:users-updated', function(){
    setTimeout(function(){ refreshChromeAvatar(); patchChatListDom(); if(typeof _chatCurrentConv!=='undefined' && _chatCurrentConv) patchChatHeaderDom(_chatCurrentConv); }, 0);
  });

  setInterval(function(){
    if(document.getElementById('pg-chat') && document.getElementById('pg-chat').classList.contains('on')){
      patchChatListDom();
      if(typeof _chatCurrentConv!=='undefined' && _chatCurrentConv) patchChatHeaderDom(_chatCurrentConv);
    }
  }, 15000);
})();
