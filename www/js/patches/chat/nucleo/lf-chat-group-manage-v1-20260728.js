/**
 * lf-chat-group-manage-v1-20260728.js
 *
 * P0-3: Gestão completa de grupo no header.
 *  - Sair do grupo (qualquer membro)
 *  - Remover membro (apenas ADM)
 *  - Transferir admin / promover membro → admin
 *  - Definir descrição do grupo
 *  - Definir foto do grupo (data: URL persistida em conv)
 *  - Mention @uid com autocomplete no textarea
 *
 * Carregar DEPOIS de lf-chat-avatar-presence-profile-fix-20260727.js
 * Stackable (guard __LF_CHAT_GROUP_MANAGE_V1__).
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_GROUP_MANAGE_V1__) return;
  window.__LF_CHAT_GROUP_MANAGE_V1__ = true;

  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function getTab(){ return (typeof sg==='function') ? sg('lf13_chat_convs') : []; }
  function normArr(a){ return Array.isArray(a)?a:[]; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function meUid(){ return (window.S && window.S.userId) || ''; }
  function isMeAdmin(conv){ return !!(conv && Array.isArray(conv.admins) && conv.admins.indexOf(meUid())>=0); }

  function saveConv(conv){
    var convs = normArr(getTab());
    var idx = convs.findIndex(function(c){ return c && c.id===conv.id; });
    if(idx<0) convs.push(conv); else convs[idx]=Object.assign({},convs[idx],conv);
    try{ if(typeof ss==='function') ss('lf13_chat_convs',convs); }catch(_e){}
  }
  function getConv(id){
    return normArr(getTab()).find(function(c){ return c && c.id===id; });
  }

  function ensureManageModal(){
    if(document.getElementById('mo-chat-manage')) return document.getElementById('mo-chat-manage');
    var mo = document.createElement('div');
    mo.id = 'mo-chat-manage';
    mo.className = 'mo';
    mo.innerHTML = '<div class="mc"><div class="mb" style="max-width:480px"></div></div>';
    mo.addEventListener('click', function(ev){ if(ev.target===mo) mo.classList.remove('on'); });
    document.body.appendChild(mo);
    return mo;
  }

  function openManageModal(){
    if(typeof _chatCurrentConv==='undefined' || !_chatCurrentConv){ if(typeof toast==='function') toast('Abra um grupo primeiro'); return; }
    var conv = getConv(_chatCurrentConv);
    if(!conv || !conv.isGroup){ if(typeof toast==='function') toast('Conversa não é um grupo'); return; }
    var me = meUid();
    var amIAdmin = isMeAdmin(conv);
    var members = normArr(conv.participants).map(function(uid){
      var u = safe(function(){ return (typeof getUser==='function') ? getUser(uid) : null; }, null);
      return { uid:uid, nome:(u&&(u.nome||u.email))||uid, cargo:(u&&u.cargo)||'—', isAdmin:(normArr(conv.admins).indexOf(uid)>=0), isMe:(uid===me) };
    });
    var photoBtn = amIAdmin
      ? '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.setPhoto()" style="font-size:.78rem">🖼 Definir foto</button>'
      : '';
    var descBtn = amIAdmin
      ? '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.setDescription()" style="font-size:.78rem">📝 Definir descrição</button>'
      : '';
    // ADICIONADO 2026-08-01: addMember nunca tinha sido implementado —
    // o botão "Remover" já existia (removeMember/applyRemove), mas não
    // havia jeito nenhum de adicionar alguém de volta. Segue exatamente
    // o mesmo padrão (participants array + saveConv + sync + refresh).
    var addMemberUI = '';
    if (amIAdmin) {
      var _rawUsers = safe(function(){ return (typeof getUsers==='function') ? (getUsers()||[]) : []; }, []);
      var _currentIds = normArr(conv.participants);
      var _candidates = _rawUsers.filter(function(u){
        if(!u) return false;
        var uid = u.id||u.uid||u.userId||u._id||u.email;
        if(!uid) return false;
        if(_currentIds.indexOf(uid)>=0) return false;
        if(u.ativo===false) return false;
        return true;
      });
      if (_candidates.length) {
        var _opts = _candidates.map(function(u){
          var uid = u.id||u.uid||u.userId||u._id||u.email;
          var attrEsc = (typeof _htmlAttr==='function') ? _htmlAttr(uid) : esc(uid);
          return '<option value="'+attrEsc+'">'+esc(u.nome||u.email||uid)+'</option>';
        }).join('');
        addMemberUI = '<div style="display:flex;gap:6px;margin-bottom:14px;align-items:center">'+
          '<select id="chat-grp-add-sel" style="flex:1;padding:6px;border-radius:6px;min-width:0">'+_opts+'</select>'+
          '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.addMember(document.getElementById(\'chat-grp-add-sel\').value)" style="font-size:.78rem;white-space:nowrap">+ Adicionar</button>'+
        '</div>';
      } else {
        addMemberUI = '<div style="font-size:.75rem;color:var(--mu);margin-bottom:14px">Todos os usuários ativos já estão neste grupo.</div>';
      }
    }
    var mo = ensureManageModal();
    var modalBody = mo.querySelector('.mb');
    modalBody.innerHTML =
      '<h2>👥 '+esc(conv.name||'Grupo')+'</h2>'+
      (conv.description ? '<div style="font-size:.82rem;color:var(--mu);margin-bottom:10px;padding:8px;background:var(--bg3);border-radius:8px">'+esc(conv.description)+'</div>' : '<div style="font-size:.75rem;color:var(--mu);margin-bottom:10px">Sem descrição.</div>')+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+descBtn+photoBtn+'</div>'+
      '<div style="font-size:.78rem;color:var(--mu);margin-bottom:6px"><b>'+members.length+'</b> participante(s)</div>'+
      '<div class="chat-grp-manage-list">'+
        members.map(function(m,idx){
          var safeId = String(m.uid).replace(/"/g,'&quot;');
          var adminTag = m.isAdmin ? ' <span style="color:var(--amber,#c39a2d);font-size:.7rem">⭐ ADM</span>' : '';
          var meTag = m.isMe ? ' <span style="color:var(--mu);font-size:.7rem">(você)</span>' : '';
          var actions = '';
          if(amIAdmin && !m.isMe && m.isAdmin){
            actions += '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.transferAdmin('+idx+')" style="font-size:.7rem;padding:3px 7px">↓ Rebaixar</button>';
          } else if(amIAdmin && !m.isMe && !m.isAdmin){
            actions += '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.promoteAdmin('+idx+')" style="font-size:.7rem;padding:3px 7px">↑ Promover</button>';
          }
          if(amIAdmin && !m.isMe){
            actions += '<button class="bc" style="font-size:.7rem;padding:3px 7px;color:var(--rl,#ef4444);border-color:var(--rl,#ef4444)" onclick="window.LF_CHAT_GROUP_MANAGE.removeMember('+idx+')">✕ Remover</button>';
          }
          return '<div class="chat-new-item" data-uid="'+safeId+'">'+
            '<div class="chat-new-info" style="flex:1"><div class="chat-new-name">'+esc(m.nome)+adminTag+meTag+'</div><div class="chat-new-role">'+esc(m.cargo)+'</div></div>'+
            '<div style="display:flex;gap:4px;flex-wrap:wrap">'+actions+'</div>'+
          '</div>';
        }).join('')+
      '</div>'+
      addMemberUI+
      '<div class="mbtns">'+
        '<button class="bc" onclick="document.getElementById(\'mo-chat-manage\').classList.remove(\'on\')">Fechar</button>'+
        '<button class="bd" onclick="window.LF_CHAT_GROUP_MANAGE.leave()">🚪 Sair do grupo</button>'+
      '</div>';
    // Expor members para handlers via dataset
    mo._members = members;
    mo._convId = conv.id;
    mo.classList.add('on');
  }

  window.LF_CHAT_GROUP_MANAGE = {
    open: openManageModal,
    removeMember: function(idx){
      var mo = document.getElementById('mo-chat-manage');
      if(!mo || !mo._members) return;
      var m = mo._members[idx]; if(!m) return;
      if(typeof _confirmModal==='function'){
        _confirmModal({title:'Remover '+m.nome+'?',msg:'Esta pessoa não verá mais as mensagens deste grupo.',okLabel:'Remover',okClass:'bd',onOk:function(){
          applyRemove(mo._convId, m.uid);
        }});
      } else if(confirm('Remover '+m.nome+'?')) applyRemove(mo._convId, m.uid);
    },
    addMember: function(uid){
      // ADICIONADO 2026-08-01 — nunca tinha existido antes.
      if(!uid) return;
      var mo = document.getElementById('mo-chat-manage');
      if(!mo || !mo._convId) return;
      applyAdd(mo._convId, uid);
    },
    promoteAdmin: function(idx){
      var mo = document.getElementById('mo-chat-manage');
      var m = mo && mo._members && mo._members[idx]; if(!m) return;
      var conv = getConv(mo._convId); if(!conv) return;
      conv.admins = normArr(conv.admins); if(conv.admins.indexOf(m.uid)<0) conv.admins.push(m.uid);
      conv.updatedAt = new Date().toISOString();
      saveConv(conv);
      if(typeof toast==='function') toast('⭐ '+m.nome+' agora é ADM');
      if(typeof _chatSyncConvUpsert==='function') safe(function(){ _chatSyncConvUpsert(conv); }, function(){});
      openManageModal();
    },
    transferAdmin: function(idx){
      var mo = document.getElementById('mo-chat-manage');
      var m = mo && mo._members && mo._members[idx]; if(!m) return;
      var me = meUid();
      var conv = getConv(mo._convId); if(!conv) return;
      conv.admins = normArr(conv.admins).filter(function(uid){ return uid!==me; });
      if(conv.admins.indexOf(m.uid)<0) conv.admins.push(m.uid);
      conv.updatedAt = new Date().toISOString();
      saveConv(conv);
      if(typeof toast==='function') toast('👑 Admin transferido para '+m.nome);
      if(typeof _chatSyncConvUpsert==='function') safe(function(){ _chatSyncConvUpsert(conv); }, function(){});
      openManageModal();
    },
    setDescription: function(){
      var mo = document.getElementById('mo-chat-manage');
      var conv = getConv(mo._convId); if(!conv) return;
      var nv = (typeof prompt==='function') ? prompt('Descrição do grupo:', conv.description||'') : null;
      if(nv==null) return;
      conv.description = String(nv).slice(0, 500);
      conv.updatedAt = new Date().toISOString();
      saveConv(conv);
      if(typeof toast==='function') toast('📝 Descrição salva');
      if(typeof _chatSyncConvUpsert==='function') safe(function(){ _chatSyncConvUpsert(conv); }, function(){});
      openManageModal();
    },
    setPhoto: function(){
      var mo = document.getElementById('mo-chat-manage');
      var conv = getConv(mo._convId); if(!conv) return;
      // Reaproveita modal existente do usuário (se houver) ou cria input inline
      var inp = document.createElement('input');
      inp.type='file'; inp.accept='image/*';
      inp.style.display='none';
      document.body.appendChild(inp);
      inp.onchange = function(){
        var f = inp.files && inp.files[0]; if(!f){ inp.remove(); return; }
        if(f.size>2*1024*1024){ if(typeof toast==='function') toast('⚠️ Imagem muito grande. Até 2MB.'); inp.remove(); return; }
        var r = new FileReader();
        r.onload = function(ev){
          conv.avatar = ev.target.result;
          conv.updatedAt = new Date().toISOString();
          saveConv(conv);
          if(typeof toast==='function') toast('🖼 Foto do grupo atualizada');
          if(typeof _chatSyncConvUpsert==='function') safe(function(){ _chatSyncConvUpsert(conv); }, function(){});
          if(typeof renderChatList==='function') renderChatList();
          openManageModal();
          inp.remove();
        };
        r.readAsDataURL(f);
      };
      inp.click();
    },
    leave: function(){
      var mo = document.getElementById('mo-chat-manage');
      var conv = getConv(mo._convId); if(!conv) return;
      var me = meUid();
      var doIt = function(){
        conv.participants = normArr(conv.participants).filter(function(uid){ return uid!==me; });
        conv.admins = normArr(conv.admins).filter(function(uid){ return uid!==me; });
        conv.updatedAt = new Date().toISOString();
        saveConv(conv);
        if(typeof toast==='function') toast('🚪 Você saiu do grupo');
        if(typeof _chatSyncConvUpsert==='function') safe(function(){ _chatSyncConvUpsert(conv); }, function(){});
        mo.classList.remove('on');
        if(typeof closeChatConv==='function') closeChatConv();
        if(typeof renderChatList==='function') renderChatList();
      };
      if(typeof _confirmModal==='function'){
        _confirmModal({title:'Sair do grupo?',msg:'Você não receberá mais mensagens deste grupo. O ADM pode te readicionar depois.',okLabel:'Sair',okClass:'bd',onOk:doIt});
      } else if(confirm('Sair do grupo?')) doIt();
    }
  };

  function applyRemove(convId, uid){
    var conv = getConv(convId); if(!conv) return;
    conv.participants = normArr(conv.participants).filter(function(u){ return u!==uid; });
    conv.admins = normArr(conv.admins).filter(function(u){ return u!==uid; });
    conv.updatedAt = new Date().toISOString();
    saveConv(conv);
    if(typeof toast==='function') toast('🚫 Membro removido');
    if(typeof _chatSyncConvUpsert==='function') safe(function(){ _chatSyncConvUpsert(conv); }, function(){});
    openManageModal();
  }

  function applyAdd(convId, uid){
    // ADICIONADO 2026-08-01 — espelha applyRemove; addMember nunca tinha
    // sido implementado (confirmado ao vivo: window.LF_CHAT_GROUP_MANAGE.
    // addMember === undefined antes desta correção).
    var conv = getConv(convId); if(!conv) return;
    conv.participants = normArr(conv.participants);
    if(conv.participants.indexOf(uid)<0) conv.participants.push(uid);
    conv.updatedAt = new Date().toISOString();
    saveConv(conv);
    if(typeof toast==='function') toast('✅ Membro adicionado');
    if(typeof _chatSyncConvUpsert==='function') safe(function(){ _chatSyncConvUpsert(conv); }, function(){});
    openManageModal();
  }

  /* === botão "⋯" no header quando é grupo === */
  function injectManageButton(){
    var hdr = document.getElementById('chat-conv-header');
    if(!hdr || hdr.querySelector('#chat-conv-manage-btn')) return;
    // estilo compatível com .chat-conv-hd-menu
    var btn = document.createElement('button');
    btn.id = 'chat-conv-manage-btn';
    btn.type = 'button';
    btn.className = 'chat-conv-hd-menu';
    btn.setAttribute('aria-label', 'Gerir grupo');
    btn.title = 'Gerir grupo';
    btn.style.cssText = 'background:none;border:0;color:inherit;font-size:1.1rem;cursor:pointer;padding:6px 10px';
    btn.innerHTML = '⋯';
    btn.onclick = function(){ openManageModal(); };
    hdr.appendChild(btn);
  }

  /* === wrap openChatConv: injetar botão de gestão quando for grupo === */
  if(typeof window.openChatConv==='function'){
    var _origOC = window.openChatConv;
    window.openChatConv = function(){
      var r = _origOC.apply(this, arguments);
      try{
        var conv = getConv(arguments[0]);
        setTimeout(function(){
          if(conv && conv.isGroup) injectManageButton();
        }, 30);
      }catch(_e){}
      return r;
    };
  }

  /* === mention @uid com autocomplete no input === */
  function setupMentions(){
    var inp = document.getElementById('chat-input');
    if(!inp || inp.__lfMentionBound) return;
    inp.__lfMentionBound = true;
    var pop = document.createElement('div');
    pop.id = 'chat-mention-pop';
    pop.style.cssText = 'position:absolute;z-index:100020;display:none;background:var(--bg2);border:1.5px solid var(--b2);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.5);padding:6px;min-width:240px;max-height:240px;overflow-y:auto;font-family:Outfit,sans-serif;font-size:.82rem';
    document.body.appendChild(pop);
    var items = [];
    var activeIdx = 0;
    function recomputeItems(){
      var conv = (typeof _chatCurrentConv!=='undefined') ? getConv(_chatCurrentConv) : null;
      if(!conv || !conv.isGroup){ items=[]; return; }
      var list = normArr((typeof getUsers==='function')?(getUsers()||[]):[]);
      var parts = normArr(conv.participants);
      items = list.filter(function(u){
        var uid = u && (u.id||u.uid||u.userId||u._id||u.email);
        return uid && parts.indexOf(String(uid))>=0;
      }).map(function(u){
        var uid = u.id||u.uid||u.userId||u._id||u.email;
        return { uid:String(uid), nome:u.nome||u.email||'?' };
      });
    }
    function isOpen(){ return pop.style.display==='block'; }
    function close(){ pop.style.display='none'; items=[]; activeIdx=0; }
    function render(){
      if(!items.length){ close(); return; }
      pop.innerHTML = items.map(function(it,idx){
        return '<div class="chat-mention-it" data-idx="'+idx+'" style="padding:8px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:8px">'+
          '<div class="chat-new-avatar" style="background:'+((typeof AVB!=='undefined')?AVB[(idx||0)%AVB.length]:'#64748b')+';width:26px;height:26px;font-size:.7rem">'+esc(String(it.nome).charAt(0).toUpperCase())+'</div>'+
          '<span>'+esc(it.nome)+'</span>'+
        '</div>';
      }).join('');
      pop.querySelectorAll('.chat-mention-it').forEach(function(el){
        el.addEventListener('click', function(){
          var idx = parseInt(el.getAttribute('data-idx'),10);
          var it = items[idx]; if(!it) return;
          insertMention(it);
        });
      });
      if(activeIdx>=items.length) activeIdx=0;
      var activeEl = pop.querySelector('.chat-mention-it[data-idx="'+activeIdx+'"]');
      if(activeEl) activeEl.style.background = 'rgba(195,154,45,.18)';
    }
    function insertMention(it){
      var txt = inp.value;
      var caret = inp.selectionStart || txt.length;
      var before = txt.slice(0, caret);
      var atIdx = before.lastIndexOf('@');
      if(atIdx<0){ close(); return; }
      var after = txt.slice(caret);
      var inserted = '@'+it.nome.replace(/\s+/g,'_')+' ';
      inp.value = before.slice(0, atIdx) + inserted + after;
      inp.focus();
      close();
    }
    function updatePosition(){
      var r = inp.getBoundingClientRect();
      pop.style.left = Math.max(8, r.left + 10) + 'px';
      pop.style.top  = Math.max(8, r.top - 256) + 'px';
    }
    inp.addEventListener('input', function(){
      var txt = inp.value; var caret = inp.selectionStart || txt.length;
      var before = txt.slice(0, caret);
      var at = before.lastIndexOf('@');
      if(at<0 || /\s/.test(before.slice(at+1))){ close(); return; }
      recomputeItems();
      if(!items.length){ close(); return; }
      var q = before.slice(at+1).toLowerCase();
      items = items.filter(function(it){ return it.nome.toLowerCase().indexOf(q)>=0; });
      if(!items.length){ close(); return; }
      activeIdx = 0;
      updatePosition();
      render();
      pop.style.display = 'block';
    });
    inp.addEventListener('keydown', function(e){
      if(!isOpen()) return;
      if(e.key==='ArrowDown'){ activeIdx = (activeIdx+1)%items.length; render(); e.preventDefault(); }
      else if(e.key==='ArrowUp'){ activeIdx = (activeIdx-1+items.length)%items.length; render(); e.preventDefault(); }
      else if(e.key==='Enter' || e.key==='Tab'){
        if(items[activeIdx]){ insertMention(items[activeIdx]); e.preventDefault(); }
      } else if(e.key==='Escape'){ close(); }
    });
    document.addEventListener('click', function(e){
      if(e.target!==inp && !pop.contains(e.target)) close();
    }, true);
  }

  function boot(){
    setupMentions();
  }
  if(document.readyState==='complete'||document.readyState==='interactive'){
    setTimeout(boot, 60);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
