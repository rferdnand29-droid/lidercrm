/* =====================================================================
 * lf-chat-group-participants-perms-v1-20260730.js
 * ---------------------------------------------------------------------
 * Causa raiz:
 *   1) O modal atual de "Participantes do grupo" (lf-chat-group-manage)
 *      exibe botões ✕ Remover, ↑ Promover, ↓ Rebaixar mesmo para
 *      membros comuns, quebrando permissão pretendida
 *      (não-ADM só vê a lista).
 *   2) Não existe "Desfazer grupo": ADM só consegue "Sair", o que
 *      não apaga o grupo para os demais.
 *
 * Fix (aditivo, sobrescreve LF_CHAT_GROUP_MANAGE.open):
 *   - Detecta papel do usuário na conv:
 *        owner  = criador (conv.createdBy === me) OU único admin
 *        admin  = está em conv.admins
 *        viewer = qualquer outro membro
 *   - viewer: só lista, sem botões de ação (exceto "Sair do grupo"
 *             e "Fechar").
 *   - admin : lista + Remover / Promover / Rebaixar / Definir foto
 *             / Definir descrição + "Sair do grupo".
 *   - owner : tudo do admin + botão "🗑 Desfazer grupo".
 *   - dissolve(): grava conv.dissolved=true + dissolvedAt + dissolvedBy,
 *     persiste, upserta para o sync, fecha a conv e esconde de todas
 *     as abas via filtro _isConvDissolved.
 *   - Envelopa renderChatList: convs dissolvidas somem em qualquer aba
 *     (equivalente a "apagou pra mim e pros que o compunham antes").
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__LF_CHAT_GRP_PARTS_PERMS_V1__) return;
  global.__LF_CHAT_GRP_PARTS_PERMS_V1__ = true;

  var D = global.document;

  function safe(fn,fb){ try{return fn();}catch(_e){return fb;} }
  function arr(x){ return Array.isArray(x)?x:[]; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function meUid(){ return (global.S && global.S.userId) || ''; }

  function getTab(){ return (typeof global.sg==='function') ? global.sg('lf13_chat_convs') : []; }
  function getConv(id){ return arr(getTab()).find(function(c){ return c && c.id===id; }); }
  function saveConv(conv){
    var list = arr(getTab());
    var i = list.findIndex(function(c){ return c && c.id===conv.id; });
    if (i<0) list.push(conv); else list[i] = Object.assign({}, list[i], conv);
    try{ if (typeof global.ss==='function') global.ss('lf13_chat_convs', list); }catch(_e){}
  }

  function _role(conv, me){
    if (!conv) return 'viewer';
    var admins = arr(conv.admins);
    var isAdmin = admins.indexOf(me) >= 0;
    var isOwner = (conv.createdBy && conv.createdBy === me)
               || (isAdmin && admins.length === 1)
               || (isAdmin && !conv.createdBy);
    if (isOwner) return 'owner';
    if (isAdmin) return 'admin';
    return 'viewer';
  }

  function _isConvDissolved(c){
    return !!(c && c.dissolved === true);
  }
  global._isConvDissolved = _isConvDissolved;

  function ensureModal(){
    var mo = D.getElementById('mo-chat-manage');
    if (mo) return mo;
    mo = D.createElement('div');
    mo.id = 'mo-chat-manage';
    mo.className = 'mo';
    mo.innerHTML = '<div class="mc"><div class="mb" style="max-width:480px"></div></div>';
    mo.addEventListener('click', function(ev){ if(ev.target===mo) mo.classList.remove('on'); });
    D.body.appendChild(mo);
    return mo;
  }

  function renderModal(){
    var convId = global._chatCurrentConv;
    if (!convId){ if (typeof global.toast==='function') global.toast('Abra um grupo primeiro'); return; }
    var conv = getConv(convId);
    if (!conv || !conv.isGroup){ if (typeof global.toast==='function') global.toast('Conversa não é um grupo'); return; }
    if (_isConvDissolved(conv)){
      if (typeof global.toast==='function') global.toast('Este grupo foi desfeito');
      return;
    }
    var me   = meUid();
    var role = _role(conv, me);
    var canManage = (role === 'admin' || role === 'owner');
    var canDissolve = (role === 'owner');

    var members = arr(conv.participants).map(function(uid){
      var u = safe(function(){ return (typeof global.getUser==='function') ? global.getUser(uid) : null; }, null);
      return {
        uid: uid,
        nome: (u && (u.nome||u.email)) || uid,
        cargo: (u && u.cargo) || '—',
        isAdmin: arr(conv.admins).indexOf(uid) >= 0,
        isMe: uid === me
      };
    });

    var topBtns = canManage ? (
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+
        '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.setDescription()" style="font-size:.78rem">📝 Definir descrição</button>'+
        '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.setPhoto()" style="font-size:.78rem">🖼 Definir foto</button>'+
      '</div>'
    ) : '';

    var body =
      '<h2>👥 '+esc(conv.name||'Grupo')+'</h2>'+
      (conv.description
        ? '<div style="font-size:.82rem;color:var(--mu);margin-bottom:10px;padding:8px;background:var(--bg3);border-radius:8px">'+esc(conv.description)+'</div>'
        : '<div style="font-size:.75rem;color:var(--mu);margin-bottom:10px">Sem descrição.</div>')+
      topBtns+
      '<div style="font-size:.78rem;color:var(--mu);margin-bottom:6px"><b>'+members.length+'</b> participante(s)'+
        (role==='viewer' ? ' — <i>somente leitura</i>' : '')+
      '</div>'+
      '<div class="chat-grp-manage-list">'+
        members.map(function(m,idx){
          var adminTag = m.isAdmin ? ' <span style="color:var(--amber,#c39a2d);font-size:.7rem">⭐ ADM</span>' : '';
          var meTag    = m.isMe ? ' <span style="color:var(--mu);font-size:.7rem">(você)</span>' : '';
          var actions = '';
          if (canManage && !m.isMe){
            if (m.isAdmin){
              actions += '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.transferAdmin('+idx+')" style="font-size:.7rem;padding:3px 7px">↓ Rebaixar</button>';
            } else {
              actions += '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.promoteAdmin('+idx+')" style="font-size:.7rem;padding:3px 7px">↑ Promover</button>';
            }
            actions += '<button class="bc" style="font-size:.7rem;padding:3px 7px;color:var(--rl,#ef4444);border-color:var(--rl,#ef4444)" onclick="window.LF_CHAT_GROUP_MANAGE.removeMember('+idx+')">✕ Remover</button>';
          }
          return '<div class="chat-new-item" data-uid="'+esc(m.uid)+'">'+
            '<div class="chat-new-info" style="flex:1">'+
              '<div class="chat-new-name">'+esc(m.nome)+adminTag+meTag+'</div>'+
              '<div class="chat-new-role">'+esc(m.cargo)+'</div>'+
            '</div>'+
            '<div style="display:flex;gap:4px;flex-wrap:wrap">'+actions+'</div>'+
          '</div>';
        }).join('')+
      '</div>'+
      '<div class="mbtns" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">'+
        '<button class="bc" onclick="document.getElementById(\'mo-chat-manage\').classList.remove(\'on\')">Fechar</button>'+
        '<button class="bd" onclick="window.LF_CHAT_GROUP_MANAGE.leave()">🚪 Sair do grupo</button>'+
        (canDissolve
          ? '<button class="bd" style="background:#7f1d1d;border-color:#7f1d1d" onclick="window.LF_CHAT_GROUP_MANAGE.dissolve()">🗑 Desfazer grupo</button>'
          : '')+
      '</div>';

    var mo = ensureModal();
    var mb = mo.querySelector('.mb');
    mb.innerHTML = body;
    mo._members = members;
    mo._convId  = conv.id;
    mo._role    = role;
    mo.classList.add('on');
  }

  // Ações que dependem de permissão (double-check no servidor local)
  function _assertCanManage(){
    var mo = D.getElementById('mo-chat-manage');
    if (!mo || (mo._role !== 'admin' && mo._role !== 'owner')){
      if (typeof global.toast==='function') global.toast('Apenas ADM pode fazer isso');
      return false;
    }
    return true;
  }
  function _assertOwner(){
    var mo = D.getElementById('mo-chat-manage');
    if (!mo || mo._role !== 'owner'){
      if (typeof global.toast==='function') global.toast('Apenas o criador/ADM único pode desfazer o grupo');
      return false;
    }
    return true;
  }

  // Preserva referência do módulo anterior para reaproveitar handlers
  // (setPhoto, setDescription, promote/transfer/remove/leave)
  var prev = global.LF_CHAT_GROUP_MANAGE || {};

  global.LF_CHAT_GROUP_MANAGE = {
    open: renderModal,

    removeMember: function(idx){
      if (!_assertCanManage()) return;
      if (typeof prev.removeMember === 'function') return prev.removeMember(idx);
    },
    promoteAdmin: function(idx){
      if (!_assertCanManage()) return;
      if (typeof prev.promoteAdmin === 'function') return prev.promoteAdmin(idx);
    },
    transferAdmin: function(idx){
      if (!_assertCanManage()) return;
      if (typeof prev.transferAdmin === 'function') return prev.transferAdmin(idx);
    },
    setDescription: function(){
      if (!_assertCanManage()) return;
      if (typeof prev.setDescription === 'function') return prev.setDescription();
    },
    setPhoto: function(){
      if (!_assertCanManage()) return;
      if (typeof prev.setPhoto === 'function') return prev.setPhoto();
    },
    leave: function(){
      if (typeof prev.leave === 'function') return prev.leave();
    },

    dissolve: function(){
      if (!_assertOwner()) return;
      var mo = D.getElementById('mo-chat-manage');
      var conv = getConv(mo._convId); if (!conv) return;
      var me = meUid();
      var doIt = function(){
        conv.dissolved   = true;
        conv.dissolvedAt = new Date().toISOString();
        conv.dissolvedBy = me;
        conv.updatedAt   = conv.dissolvedAt;
        // Zera participantes/admins para que, em quaisquer clientes com
        // sync antigo, a conv não apareça em "Grupos"/"Não lidas".
        conv.participants = [];
        conv.admins       = [];
        saveConv(conv);
        if (typeof global._chatSyncConvUpsert==='function')
          safe(function(){ global._chatSyncConvUpsert(conv); });
        if (typeof global.toast==='function') global.toast('🗑 Grupo desfeito');
        mo.classList.remove('on');
        if (typeof global.closeChatConv==='function') global.closeChatConv();
        if (typeof global.renderChatList==='function') global.renderChatList();
      };
      if (typeof global._confirmModal==='function'){
        global._confirmModal({
          title: 'Desfazer grupo?',
          msg:   'O grupo será apagado para você e para todos que o compunham. Esta ação não pode ser desfeita.',
          okLabel: 'Desfazer',
          okClass: 'bd',
          onOk: doIt
        });
      } else if (global.confirm('Desfazer grupo? Esta ação apaga o grupo para todos.')) doIt();
    }
  };

  // Esconde convs dissolvidas em qualquer aba
  (function wrapRenderChatList(){
    var orig = global.renderChatList;
    if (typeof orig !== 'function' || orig.__lfHideDissolved){
      setTimeout(wrapRenderChatList, 300); return;
    }
    var w = function(){
      var r = orig.apply(this, arguments);
      try{
        var items = D.querySelectorAll('#chat-conv-list .chat-conv-item');
        if (!items || !items.length) return r;
        var convs = (typeof global._chatGetConvs==='function') ? (global._chatGetConvs()||[]) : [];
        var byId = {}; convs.forEach(function(c){ if (c && c.id) byId[c.id]=c; });
        items.forEach(function(el){
          var cid = el.getAttribute('data-conv-id');
          var c = byId[cid]; if (!c) return;
          if (_isConvDissolved(c)) el.style.display = 'none';
        });
      }catch(_e){}
      return r;
    };
    w.__lfHideDissolved = true;
    global.renderChatList = w;
  })();

})(window);
