(function(global){
  'use strict';
  if (global.__LF_CHAT_CONSOLIDATED_FIX_V1__) return;
  global.__LF_CHAT_CONSOLIDATED_FIX_V1__ = true;

  var D = global.document;
  var LS = global.localStorage;
  var TAG = '[lf-chat-consolidated-fix]';

  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function arr(x){ return Array.isArray(x) ? x : []; }
  function isoNow(){ return new Date().toISOString(); }
  function norm(s){ return String(s == null ? '' : s).trim().toLowerCase(); }
  function esc(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function toast(msg){ if (typeof global.toast === 'function') global.toast(msg); }
  function meUid(){ return (global.S && global.S.userId) || ''; }

  function getConvs(){
    return safe(function(){
      if (typeof global._chatGetConvs === 'function') return global._chatGetConvs() || [];
      if (typeof global.sg === 'function') return global.sg('lf13_chat_convs') || [];
      var raw = LS.getItem('lf13_chat_convs');
      return raw ? (JSON.parse(raw) || []) : [];
    }, []);
  }

  function saveConvs(convs){
    try{
      if (typeof global._chatSaveConvs === 'function') return global._chatSaveConvs(convs);
      if (typeof global.ss === 'function') return global.ss('lf13_chat_convs', convs);
      LS.setItem('lf13_chat_convs', JSON.stringify(convs));
      return true;
    }catch(_e){ return false; }
  }

  function findConv(convId){
    convId = String(convId || '').trim();
    return getConvs().find(function(c){ return c && String(c.id) === convId; }) || null;
  }

  function persistConv(conv){
    var convs = getConvs().slice();
    var idx = convs.findIndex(function(c){ return c && c.id === conv.id; });
    if (idx >= 0) convs[idx] = Object.assign({}, convs[idx], conv);
    else convs.push(conv);
    saveConvs(convs);
    if (typeof global._chatSyncConvUpsert === 'function') {
      safe(function(){ global._chatSyncConvUpsert(convs[idx >= 0 ? idx : (convs.length - 1)]); });
    }
    if (typeof global._chatUpdateUnreadBadge === 'function') safe(function(){ global._chatUpdateUnreadBadge(); });
    if (typeof global.renderChatList === 'function') safe(function(){ global.renderChatList(); });
  }

  function tsOf(v){
    if (!v) return 0;
    var n = (typeof v === 'number') ? v : Date.parse(v);
    return isFinite(n) ? n : 0;
  }

  function isConvArchivedStrict(c){
    if (!c || c.archived !== true) return false;
    var a = tsOf(c.archivedAt);
    if (!a) return false;
    var u = tsOf(c.unarchivedAt);
    if (u && u >= a) return false;
    return true;
  }
  global._isConvArchived = isConvArchivedStrict;

  function archiveConv(convId){
    var c = findConv(convId);
    if (!c) return false;
    var at = isoNow();
    c.archived = true;
    c.archivedAt = at;
    c.unarchivedAt = null;
    c.updatedAt = at;
    persistConv(c);
    if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') {
      safe(function(){ global.closeChatConv(); });
    }
    if (typeof global._chatCloseCtxMenu === 'function') safe(function(){ global._chatCloseCtxMenu(); });
    toast('Conversa arquivada');
    return true;
  }

  function unarchiveConv(convId){
    var c = findConv(convId);
    if (!c) return false;
    var at = isoNow();
    if (!c.archivedAt) c.archivedAt = at;
    c.archived = false;
    c.unarchivedAt = at;
    c.updatedAt = at;
    persistConv(c);
    if (typeof global._chatCloseCtxMenu === 'function') safe(function(){ global._chatCloseCtxMenu(); });
    toast('Conversa desarquivada');
    return true;
  }

  global.chatArchive = archiveConv;
  global.chatArchiveConv = archiveConv;
  global.chatUnarchiveConv = unarchiveConv;
  global.chatToggleArchive = function(convId){
    var c = findConv(convId);
    if (!c) return false;
    return isConvArchivedStrict(c) ? unarchiveConv(convId) : archiveConv(convId);
  };

  function currentTab(){
    return safe(function(){
      if (typeof global.sg === 'function') return global.sg('lf_chat_active_tab') || 'all';
      return LS.getItem('lf_chat_active_tab') || 'all';
    }, 'all');
  }

  function applyStrictArchivedFilter(){
    try{
      var tab = currentTab();
      var items = D.querySelectorAll('#chat-conv-list .chat-conv-item');
      if (!items || !items.length) return;
      var byId = {};
      getConvs().forEach(function(c){ if (c && c.id) byId[c.id] = c; });
      items.forEach(function(el){
        var cid = el.getAttribute('data-conv-id');
        var c = byId[cid];
        if (!c) return;
        var arch = isConvArchivedStrict(c);
        var hide = false;
        if (tab === 'archived' && !arch) hide = true;
        if (tab !== 'archived' && arch) hide = true;
        if (hide) el.style.display = 'none';
      });
    }catch(_e){}
  }

  (function wrapRenderChatList(){
    function install(){
      if (typeof global.renderChatList !== 'function') { setTimeout(install, 200); return; }
      if (global.renderChatList.__lfConsolidatedFix) return;
      var orig = global.renderChatList;
      var wrapped = function(){
        var r = orig.apply(this, arguments);
        setTimeout(applyStrictArchivedFilter, 0);
        setTimeout(applyStrictArchivedFilter, 60);
        return r;
      };
      wrapped.__lfConsolidatedFix = true;
      global.renderChatList = wrapped;
    }
    install();
  })();

  (function observeChatList(){
    function boot(){
      var list = D.getElementById('chat-conv-list');
      if (!list) { setTimeout(boot, 300); return; }
      try{
        var mo = new MutationObserver(function(){
          if (mo.__scheduled) return;
          mo.__scheduled = true;
          global.requestAnimationFrame(function(){
            mo.__scheduled = false;
            applyStrictArchivedFilter();
          });
        });
        mo.observe(list, { childList:true, subtree:false });
      }catch(_e){}
      applyStrictArchivedFilter();
    }
    boot();
    D.addEventListener('click', function(ev){
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#chat-tabs-bar [data-tab], #chat-tabs-bar .chat-tab')) {
        setTimeout(applyStrictArchivedFilter, 30);
        setTimeout(applyStrictArchivedFilter, 140);
      }
    }, false);
  })();

  function getCachedUsers(){
    var list = [];
    try{
      if (typeof global.getUsers === 'function') list = global.getUsers() || [];
    }catch(_e){}
    if (!Array.isArray(list) || !list.length) {
      try{ if (typeof global.sg === 'function') list = global.sg('lf6_u') || []; }catch(_e){}
    }
    if ((!Array.isArray(list) || !list.length)) {
      try{
        var raw = LS.getItem('lf6_u');
        if (raw) list = JSON.parse(raw) || [];
      }catch(_e){}
    }
    list = arr(list).filter(function(u){
      if (!u) return false;
      var uid = u.id || u.uid || u.userId || u._id || u.email;
      if (!uid) return false;
      if (String(uid) === String(meUid())) return false;
      if (u.ativo === false) return false;
      return true;
    }).map(function(u){
      u.id = u.id || u.uid || u.userId || u._id || u.email;
      return u;
    });
    list.sort(function(a,b){
      return String(a.nome || a.email || a.id || '').localeCompare(String(b.nome || b.email || b.id || ''));
    });
    return list;
  }

  function getAvatarBg(u){
    var palette = global.AVB || ['#3A9FE0','#C39A2D','#2F855A','#805AD5','#DD6B20','#E53E3E'];
    var idx = (u && typeof u.cor === 'number') ? u.cor : 0;
    idx = Math.abs(idx) % palette.length;
    return palette[idx];
  }

  function manualRenderNewConvList(){
    var modalBody = D.querySelector('#mo-chat-new .mb');
    if (!modalBody) return false;
    var users = getCachedUsers();
    if (!users.length) return false;

    var isAdm = !!(typeof global.hasAdminAccess === 'function' && global.hasAdminAccess());
    var mode = (global._chatNewConvMode === 'group' && isAdm) ? 'group' : 'dm';
    var groupSel = global._chatNewGroupSel || {};

    var tabs = isAdm
      ? '<div class="chat-new-tabs" style="display:flex;gap:6px;margin-bottom:10px">'
        + '<button type="button" class="chat-new-tab'+(mode==='dm'?' on':'')+'" onclick="chatSwitchNewMode(\'dm\')">💬 Individual</button>'
        + '<button type="button" class="chat-new-tab'+(mode==='group'?' on':'')+'" onclick="chatSwitchNewMode(\'group\')">👥 Novo Grupo</button>'
        + '</div>'
      : '';

    var listHTML;
    if (mode === 'group' && isAdm) {
      listHTML = '<input id="chat-new-group-name" placeholder="Nome do grupo" '
        + 'style="width:100%;padding:10px;margin-bottom:10px;background:rgba(255,255,255,.04);border:1px solid rgba(195,154,45,.2);border-radius:8px;color:inherit;font-size:.9rem">'
        + '<div style="font-size:.75rem;color:var(--mu);margin-bottom:6px">Marque os participantes:</div>'
        + '<div class="chat-new-list">'
        + users.map(function(u){
            var nome = u.nome || u.email || u.id || '?';
            var av = String(nome).charAt(0).toUpperCase();
            var checked = groupSel[u.id] ? 'checked' : '';
            return '<label class="chat-new-item" style="cursor:pointer">'
              + '<input type="checkbox" '+checked+' onchange="chatToggleGroupMember(\''+String(u.id).replace(/'/g,'\\\'')+'\',this.checked)" style="margin-right:8px">'
              + '<div class="chat-new-avatar" style="background:'+getAvatarBg(u)+'">'+esc(av)+'</div>'
              + '<div class="chat-new-info"><div class="chat-new-name">'+esc(nome)+'</div><div class="chat-new-role">'+esc(u.cargo || 'Consultor')+'</div></div>'
              + '</label>';
          }).join('')
        + '</div>';
    } else {
      listHTML = '<div class="chat-new-list">'
        + users.map(function(u){
            var nome = u.nome || u.email || u.id || '?';
            var av = String(nome).charAt(0).toUpperCase();
            return '<div class="chat-new-item" onclick="chatStartConv(\''+String(u.id).replace(/'/g,'\\\'')+'\')">'
              + '<div class="chat-new-avatar" style="background:'+getAvatarBg(u)+'">'+esc(av)+'</div>'
              + '<div class="chat-new-info"><div class="chat-new-name">'+esc(nome)+'</div><div class="chat-new-role">'+esc(u.cargo || 'Consultor')+'</div></div>'
              + '</div>';
          }).join('')
        + '</div>';
    }

    var footer = (mode === 'group' && isAdm)
      ? '<div class="mbtns"><button class="bc" onclick="closeM(\'mo-chat-new\')">Cancelar</button><button class="bp" onclick="chatCreateGroupFromModal()">Criar grupo</button></div>'
      : '<div class="mbtns"><button class="bc" onclick="closeM(\'mo-chat-new\')">Cancelar</button></div>';

    modalBody.innerHTML = '<h2>'+(mode==='group'?'👥 Novo Grupo':'💬 Nova Conversa')+'</h2>'
      + tabs
      + '<div style="font-size:.78rem;color:var(--mu);margin-bottom:12px">'
      + (mode==='group' ? 'Somente ADM pode criar grupos.' : 'Selecione um colaborador ('+users.length+' disponíveis):')
      + '</div>'
      + listHTML + footer;
    return true;
  }

  function ensureNewConvHasOptions(){
    var modal = D.getElementById('mo-chat-new');
    if (!modal || !modal.classList || !modal.classList.contains('on')) return;
    // FIX 2026-08 — loop infinito: antes disto, _chatRenderNewConvList() era
    // chamada incondicionalmente aqui, reescrevendo o innerHTML do modal
    // TODA vez. Como o watchNewConvModal() observa mutações no <body>
    // inteiro (childList+attributes), cada reescrita disparava o próprio
    // observer de novo, que chamava ensureNewConvHasOptions() de novo,
    // que reescrevia de novo — loop infinito de auto-alimentação que
    // travava a aba inteira (não só o chat: o main thread nunca mais
    // volta pra fila de eventos, então cliques em leads/config também
    // param de responder). Correção: só renderiza se a lista realmente
    // ainda estiver vazia. Depois da 1ª renderização real, toda chamada
    // seguinte (inclusive as do próprio MutationObserver) vê a lista já
    // populada e retorna sem tocar no DOM — o loop converge em no máximo
    // 2 execuções em vez de rodar pra sempre.
    var list = modal.querySelector('.chat-new-list');
    if (list && list.children.length) return;
    if (typeof global._chatRenderNewConvList === 'function') {
      safe(function(){ global._chatRenderNewConvList(); });
    }
    list = modal.querySelector('.chat-new-list');
    if (list && list.children.length) return;
    manualRenderNewConvList();
  }

  (function wrapChatNewConv(){
    var orig = global.chatNewConv;
    global.chatNewConv = function(){
      var r;
      try{
        if (typeof orig === 'function') r = orig.apply(this, arguments);
      }catch(err){
        console.warn(TAG, 'chatNewConv falhou; usando fallback', err);
      }
      safe(function(){ if (typeof global.openM === 'function') global.openM('mo-chat-new'); });
      setTimeout(ensureNewConvHasOptions, 0);
      setTimeout(ensureNewConvHasOptions, 120);
      setTimeout(ensureNewConvHasOptions, 400);
      if (typeof global.loadUsersDB === 'function') {
        safe(function(){
          global.loadUsersDB(function(){
            setTimeout(ensureNewConvHasOptions, 0);
            setTimeout(ensureNewConvHasOptions, 120);
          });
        });
      }
      return r;
    };
  })();

  D.addEventListener('click', function(ev){
    var t = ev.target;
    if (!t || !t.closest) return;
    var btn = t.closest('#chat-new-conv-btn, .chat-new-btn');
    if (!btn) return;
    setTimeout(function(){
      var modal = D.getElementById('mo-chat-new');
      if (!modal || !modal.classList || !modal.classList.contains('on')) {
        safe(function(){ global.chatNewConv(); });
      } else {
        ensureNewConvHasOptions();
      }
    }, 50);
  }, false);

  (function watchNewConvModal(){
    try{
      var _busy = false, _queued = false;
      function runOnce(){
        if (_busy){ _queued = true; return; }
        _busy = true;
        try{ ensureNewConvHasOptions(); }
        finally {
          setTimeout(function(){
            _busy = false;
            if (_queued){ _queued = false; runOnce(); }
          }, 150);
        }
      }
      var mo = new MutationObserver(runOnce);
      mo.observe(D.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
    }catch(_e){}
  })();

  global.chatSearch = function(q){
    q = norm(q);
    var items = D.querySelectorAll('#chat-conv-list .chat-conv-item');
    if (!items || !items.length) return;

    if (!q) {
      if (typeof global.renderChatList === 'function') safe(function(){ global.renderChatList(); });
      else items.forEach(function(el){ el.style.display = ''; });
      setTimeout(applyStrictArchivedFilter, 0);
      return;
    }

    var shown = 0;
    items.forEach(function(el){
      var name = norm(safe(function(){ return el.querySelector('.chat-conv-name').textContent; }, ''));
      var prev = norm(safe(function(){ return el.querySelector('.chat-conv-preview').textContent; }, ''));
      var hit = name.indexOf(q) >= 0 || prev.indexOf(q) >= 0;
      el.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });

    if (!shown && global.LF_CHAT_MSGSEARCH_TABS && typeof global.LF_CHAT_MSGSEARCH_TABS.search === 'function') {
      safe(function(){ global.LF_CHAT_MSGSEARCH_TABS.search(q); });
    }
  };

  function roleOf(conv, uid){
    if (!conv) return 'viewer';
    var admins = arr(conv.admins);
    var isAdmin = admins.indexOf(uid) >= 0;
    var isOwner = (conv.createdBy && conv.createdBy === uid) || (isAdmin && admins.length === 1);
    if (isOwner) return 'owner';
    if (isAdmin) return 'admin';
    return 'viewer';
  }

  function openGroupManage(convId){
    if (!convId) convId = global._chatCurrentConv;
    if (!convId) return false;
    if (global._chatCurrentConv !== convId && typeof global.openChatConv === 'function') {
      safe(function(){ global.openChatConv(convId); });
    }
    if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
      setTimeout(function(){ safe(function(){ global.LF_CHAT_GROUP_MANAGE.open(); }); }, 30);
      return true;
    }
    return false;
  }

  function closeCtxMenu(){
    var menu = D.getElementById('chat-ctx-menu');
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    var backdrop = D.getElementById('chat-ctx-backdrop');
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (typeof global._chatCloseCtxMenu === 'function') safe(function(){ global._chatCloseCtxMenu(); });
  }

  function openGroupCardMenu(x, y, convId){
    var conv = findConv(convId);
    if (!conv || !conv.isGroup) return false;

    closeCtxMenu();

    var backdrop = D.createElement('div');
    backdrop.id = 'chat-ctx-backdrop';
    backdrop.addEventListener('click', closeCtxMenu, true);
    D.body.appendChild(backdrop);

    var menu = D.createElement('div');
    menu.id = 'chat-ctx-menu';
    menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg2,#1a1e26);color:var(--tx,#eee);border:1px solid var(--b1,rgba(255,255,255,.18));border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.65);padding:6px;min-width:260px;max-width:92vw;max-height:80vh;overflow-y:auto;font-family:Outfit,sans-serif;font-size:.85rem';
    function btn(act, label, danger){
      var b = D.createElement('button');
      b.className = 'chat-ctx-btn';
      b.type = 'button';
      b.setAttribute('data-act', act);
      b.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:'+(danger ? 'var(--rl,#ef4444)' : 'inherit')+';padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem';
      b.textContent = label;
      return b;
    }
    function sep(){
      var d = D.createElement('div');
      d.style.cssText = 'height:1px;background:var(--b1,rgba(255,255,255,.1));margin:4px 0';
      return d;
    }

    var uid = meUid();
    var role = roleOf(conv, uid);
    var canManage = role === 'admin' || role === 'owner';

    var nodes = [
      btn('manage', '👥 Participantes / Gestão'),
      btn('pin', conv.pinned ? '📌 Desafixar' : '📌 Fixar no topo'),
      btn('mute', conv.muted ? '🔔 Reativar notificações' : '🔕 Silenciar'),
      btn('archive', isConvArchivedStrict(conv) ? '📥 Desarquivar' : '📦 Arquivar')
    ];
    if (canManage && typeof global.chatOpenAddMemberModal === 'function') nodes.push(btn('add-member', '➕ Adicionar participante'));
    menu.appendChild(nodes[0]);
    menu.appendChild(nodes[1]);
    menu.appendChild(nodes[2]);
    menu.appendChild(nodes[3]);
    if (nodes[4]) menu.appendChild(nodes[4]);
    menu.appendChild(sep());
    menu.appendChild(btn('close', 'Fechar'));

    menu.addEventListener('click', function(ev){
      var actionBtn = ev.target && ev.target.closest && ev.target.closest('.chat-ctx-btn');
      if (!actionBtn) return;
      var act = actionBtn.getAttribute('data-act');
      if (act === 'manage') { closeCtxMenu(); openGroupManage(convId); return; }
      if (act === 'pin' && typeof global.chatTogglePin === 'function') { safe(function(){ global.chatTogglePin(convId); }); closeCtxMenu(); return; }
      if (act === 'mute' && typeof global.chatToggleMute === 'function') { safe(function(){ global.chatToggleMute(convId); }); closeCtxMenu(); return; }
      if (act === 'archive') { isConvArchivedStrict(findConv(convId)) ? unarchiveConv(convId) : archiveConv(convId); closeCtxMenu(); return; }
      if (act === 'add-member' && typeof global.chatOpenAddMemberModal === 'function') { closeCtxMenu(); safe(function(){ global.chatOpenAddMemberModal(convId); }); return; }
      closeCtxMenu();
    }, false);

    D.body.appendChild(menu);

    var vw = global.innerWidth || D.documentElement.clientWidth;
    var vh = global.innerHeight || D.documentElement.clientHeight;
    var mw = menu.offsetWidth || 260;
    var mh = menu.offsetHeight || 220;
    var pad = 8;
    var left = x;
    var top = y;
    if (left + mw + pad > vw) left = vw - mw - pad;
    if (left < pad) left = pad;
    if (top + mh + pad > vh) top = Math.max(pad, y - mh - 12);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    return true;
  }

  (function hookHeaderAndContextMenu(){
    var CLOSE_SELECTOR = [
      'button.chat-conv-hd-close', '.chat-conv-hd-close', '[data-action="close-chat"]',
      '[data-action="close"]', 'button[onclick*="closeChatConv"]', 'button[onclick*="chatBack"]',
      '.chat-conv-hd-back', '.chat-back-btn', '#chat-conv-back'
    ].join(',');

    global.addEventListener('click', function(ev){
      var t = ev.target;
      if (!t || !t.closest) return;
      var header = t.closest('#chat-conv-header');
      if (!header) return;
      if (t.closest(CLOSE_SELECTOR)) return;
      var conv = findConv(global._chatCurrentConv);
      if (!conv || !conv.isGroup) return;
      if (t.closest('button.chat-conv-hd-menu, .chat-conv-hd-info, .chat-conv-hd-name, .chat-conv-hd-status, .chat-conv-hd-avatar')) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        openGroupManage(conv.id);
      }
    }, true);

    global.addEventListener('contextmenu', function(ev){
      var t = ev.target;
      if (!t || !t.closest) return;
      var item = t.closest('#chat-conv-list .chat-conv-item[data-conv-id]');
      if (!item) return;
      var convId = item.getAttribute('data-conv-id');
      var conv = findConv(convId);
      if (!conv || !conv.isGroup) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      openGroupCardMenu(ev.clientX || 20, ev.clientY || 20, convId);
    }, true);
  })();

  console.info(TAG, 'ativo');
})(window);
