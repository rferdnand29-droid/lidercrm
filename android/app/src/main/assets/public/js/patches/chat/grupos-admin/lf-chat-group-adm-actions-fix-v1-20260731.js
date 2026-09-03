/* =====================================================================
 * lf-chat-group-adm-actions-fix-v1-20260731.js
 * ---------------------------------------------------------------------
 * CORREÇÃO DEFINITIVA – Grupos: ações do ADM (foto, participantes, remover),
 * menu de contexto do card e semântica de "Excluir conversa".
 *
 * CAUSAS-RAIZ (verificadas em js/chat.js + js/patches/*):
 *   1) Header do chat de grupo (`⋯` nativo em chat.js:441) chama
 *      chatConvMenu → _chatOpenConvCtxMenu (pin/mute/archive). Nunca
 *      abre LF_CHAT_GROUP_MANAGE.
 *   2) O botão duplicado #chat-conv-manage-btn criado pelo patch
 *      lf-chat-group-manage é ocultado por lf-chat-hotfix-20260731
 *      (killDuplicateDots), sobrando só o botão que abre o menu errado.
 *   3) Botão `i` (ℹ) só abre "mídias / info", não gestão do grupo.
 *   4) O menu de contexto do CARD (botão direito na lista) só tem
 *      pin/mute/archive/add-member/excluir — sem "Participantes",
 *      "Editar foto/nome", "Sair" ou "Desfazer".
 *   5) chatDeleteConv em grupo age igual a "desfazer para todos" porque
 *      o sync de inbox (lf-chat-hotfix wrapUpsert / _chatRemoveInboxEntryForUsers)
 *      propaga a remoção. Falta separar "sair (só eu)" de "desfazer (todos)".
 *
 * ESTRATÉGIA (aditiva, stackable, reversível):
 *   A) Substitui `chatConvMenu(convId)` por um roteador: se conv.isGroup,
 *      abre LF_CHAT_GROUP_MANAGE.open(); senão delega ao original.
 *   B) Reescreve `_chatOpenConvCtxMenu` (long-press / right-click do card)
 *      inserindo, quando conv.isGroup, as ações extras:
 *         • 👥 Participantes / gestão
 *         • 🖼 Editar foto (só ADM)
 *         • ✏ Editar nome (só ADM)
 *         • 🚪 Sair do grupo (só eu — não propaga)
 *         • 🗑 Desfazer grupo (só owner — propaga com dissolved=true)
 *      e REMOVE "Excluir conversa" para grupos (troca por Sair / Desfazer).
 *   C) Reescreve `chatDeleteConv` para BLOQUEAR uso direto em grupo –
 *      redireciona para leave/dissolve conforme papel.
 *   D) Torna o header realmente clicável e o botão `i` também abre gestão
 *      quando for grupo (contorna o guard `.closest('button')` do
 *      lf-fix-participantes-notif-tabs).
 *   E) Adiciona setName no LF_CHAT_GROUP_MANAGE (faltava).
 *
 * NÃO ALTERA arquivos originais; guard __LF_CHAT_GRP_ADM_FIX_V1__.
 * Carregar POR ÚLTIMO, depois de:
 *   - js/chat.js
 *   - lf-chat-group-manage-v1-20260728.js
 *   - lf-chat-group-participants-perms-v1-20260730.js
 *   - lf-fix-participantes-notif-tabs-v1-20260730.js
 *   - lf-chat-hotfix-20260731.js
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_CHAT_GRP_ADM_FIX_V1__) return;
  global.__LF_CHAT_GRP_ADM_FIX_V1__ = true;

  var D = global.document;
  var TAG = '[lf-chat-grp-adm-fix]';

  function arr(x) { return Array.isArray(x) ? x : []; }
  function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
  function meUid() { return (global.S && global.S.userId) || ''; }
  function toast(m) { if (typeof global.toast === 'function') global.toast(m); }

  function getConv(id) {
    var convs = (typeof global._chatGetConvs === 'function')
      ? global._chatGetConvs()
      : (typeof global.sg === 'function' ? global.sg('lf13_chat_convs') : []);
    return arr(convs).find(function (c) { return c && c.id === id; });
  }
  function saveConvsMerge(conv) {
    var convs = (typeof global._chatGetConvs === 'function')
      ? (global._chatGetConvs() || [])
      : arr(global.sg && global.sg('lf13_chat_convs'));
    var i = convs.findIndex(function (c) { return c && c.id === conv.id; });
    if (i < 0) convs.push(conv);
    else convs[i] = Object.assign({}, convs[i], conv);
    if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(convs);
    else if (typeof global.ss === 'function') global.ss('lf13_chat_convs', convs);
  }
  function roleOf(conv, me) {
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

  /* --------------------------------------------------------------
   * A) chatConvMenu (botão ⋯ do header) → roteia para gestão em grupos
   * -------------------------------------------------------------- */
  (function wrapChatConvMenu() {
    var orig = global.chatConvMenu;
    if (typeof orig !== 'function') { setTimeout(wrapChatConvMenu, 300); return; }
    if (orig.__lfGrpAdmFix) return;
    var w = function (convId) {
      try {
        var conv = getConv(convId);
        if (conv && conv.isGroup && global.LF_CHAT_GROUP_MANAGE
          && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
          global.LF_CHAT_GROUP_MANAGE.open();
          return;
        }
      } catch (_e) {}
      return orig.apply(this, arguments);
    };
    w.__lfGrpAdmFix = true;
    global.chatConvMenu = w;
  })();

  /* --------------------------------------------------------------
   * B) Menu de contexto do CARD (right-click / long-press)
   *    Reescreve _chatOpenConvCtxMenu para incluir ações de grupo
   * -------------------------------------------------------------- */
  (function wrapCardCtxMenu() {
    var orig = global._chatOpenConvCtxMenu;
    if (typeof orig !== 'function') { setTimeout(wrapCardCtxMenu, 300); return; }
    if (orig.__lfGrpAdmFix) return;

    var w = function (x, y, convEl) {
      if (!convEl) return orig.call(this, x, y, convEl);
      var convId = convEl.getAttribute && convEl.getAttribute('data-conv-id');
      var conv = convId && getConv(convId);
      // Para DMs (não-grupo) mantém comportamento nativo.
      if (!conv || !conv.isGroup) return orig.call(this, x, y, convEl);

      // ---- constrói menu específico de grupo ----
      if (typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu();
      var me = meUid();
      var role = roleOf(conv, me);
      var canManage = (role === 'admin' || role === 'owner');
      var canDissolve = (role === 'owner');

      var backdrop = D.createElement('div');
      backdrop.id = 'chat-ctx-backdrop';
      D.body.appendChild(backdrop);
      backdrop.addEventListener('click', function () {
        if (typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu();
      }, true);
      backdrop.addEventListener('touchstart', function (ev) {
        ev.preventDefault();
        if (typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu();
      }, { passive: false });
      backdrop.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
        if (typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu();
      }, true);

      var menu = D.createElement('div');
      menu.id = 'chat-ctx-menu';
      menu.className = 'chat-ctx-menu';
      menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg2,#1a1e26);color:var(--tx,#eee);border:1px solid var(--b1,rgba(255,255,255,.18));border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.65);padding:6px;min-width:260px;max-width:92vw;max-height:80vh;overflow-y:auto;font-family:Outfit,sans-serif;font-size:.85rem;pointer-events:auto;-webkit-user-select:none;user-select:none';

      var BTN = function (act, label, danger) {
        var col = danger ? 'var(--rl,#ef4444)' : 'inherit';
        return '<button class="chat-ctx-btn" data-act="' + act + '" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:' + col + ';padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">' + label + '</button>';
      };
      var SEP = '<div style="height:1px;background:var(--b1,rgba(255,255,255,.1));margin:4px 0"></div>';

      var html = ''
        + BTN('pin', conv.pinned ? '📌 Desafixar' : '📌 Fixar no topo')
        + BTN('mute', conv.muted ? '🔔 Reativar notificações' : '🔕 Silenciar')
        + BTN('archive', '📦 Arquivar')
        + SEP
        + BTN('manage', '👥 Participantes / Gestão');
      if (canManage) {
        html += BTN('add-member', '➕ Adicionar participante')
             +  BTN('set-photo', '🖼 Editar foto do grupo')
             +  BTN('set-name',  '✏ Editar nome do grupo')
             +  BTN('set-desc',  '📝 Editar descrição');
      }
      html += SEP + BTN('leave', '🚪 Sair do grupo', true);
      if (canDissolve) {
        html += BTN('dissolve', '🗑 Desfazer grupo (todos)', true);
      }
      menu.innerHTML = html;

      // impede propagação p/ handlers globais
      menu.addEventListener('contextmenu', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
      }, true);
      menu.addEventListener('touchstart', function (ev) { ev.stopPropagation(); }, { passive: true });

      D.body.appendChild(menu);

      // Posicionamento (mesma lógica do original)
      var vw = global.innerWidth || D.documentElement.clientWidth;
      var vh = global.innerHeight || D.documentElement.clientHeight;
      var mw = menu.offsetWidth || 260;
      var mh = menu.offsetHeight || 260;
      var pad = 8;
      var left = x, top = y;
      if (left + mw + pad > vw) left = vw - mw - pad;
      if (left < pad) left = pad;
      if (top + mh + pad > vh) top = Math.max(pad, y - mh - 12);
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';

      // handlers
      function close() {
        if (typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu();
      }
      function openManage() {
        // garante conv aberta antes de abrir o modal (LF_CHAT_GROUP_MANAGE lê _chatCurrentConv)
        if (global._chatCurrentConv !== convId && typeof global.openChatConv === 'function') {
          try { global.openChatConv(convId); } catch (_e) {}
        }
        if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
          setTimeout(function () { global.LF_CHAT_GROUP_MANAGE.open(); }, 40);
        }
      }

      menu.querySelectorAll('.chat-ctx-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var act = btn.getAttribute('data-act');
          try {
            if (act === 'pin' && typeof global.chatTogglePin === 'function') global.chatTogglePin(convId);
            else if (act === 'mute' && typeof global.chatToggleMute === 'function') global.chatToggleMute(convId);
            else if (act === 'archive' && typeof global.chatArchive === 'function') global.chatArchive(convId);
            else if (act === 'add-member') { close(); if (typeof global.chatOpenAddMemberModal === 'function') global.chatOpenAddMemberModal(convId); }
            else if (act === 'manage') { close(); openManage(); }
            else if (act === 'set-photo') { close(); openManage(); setTimeout(function(){ global.LF_CHAT_GROUP_MANAGE.setPhoto(); }, 120); }
            else if (act === 'set-name') { close(); handleSetName(convId); }
            else if (act === 'set-desc') { close(); openManage(); setTimeout(function(){ global.LF_CHAT_GROUP_MANAGE.setDescription(); }, 120); }
            else if (act === 'leave') { close(); handleLeave(convId); }
            else if (act === 'dissolve') { close(); handleDissolve(convId); }
          } catch (e) { console.error(TAG, 'action failed', act, e); }
        });
      });
    };
    w.__lfGrpAdmFix = true;
    global._chatOpenConvCtxMenu = w;
  })();

  /* --------------------------------------------------------------
   * C) chatDeleteConv em grupo: bloqueia (redirecionamento seguro)
   * -------------------------------------------------------------- */
  (function wrapDeleteConv() {
    var orig = global.chatDeleteConv;
    if (typeof orig !== 'function') { setTimeout(wrapDeleteConv, 300); return; }
    if (orig.__lfGrpAdmFix) return;
    var w = function (convId) {
      var conv = getConv(convId);
      if (conv && conv.isGroup) {
        var me = meUid();
        var role = roleOf(conv, me);
        if (typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu();
        if (role === 'owner') {
          // owner escolhe: sair ou desfazer
          var msg = 'Você é o ADM principal deste grupo. O que deseja?\n\n'
                  + '• "Sair do grupo": você sai, o grupo continua para os demais.\n'
                  + '• "Desfazer grupo": apaga o grupo para todos.';
          if (typeof global._confirmModal === 'function') {
            global._confirmModal({
              title: 'Excluir conversa (grupo)',
              msg: msg,
              okLabel: 'Desfazer p/ todos', okClass: 'bd',
              cancelLabel: 'Sair apenas eu',
              onOk: function () { handleDissolve(convId); },
              onCancel: function () { handleLeave(convId); }
            });
          } else {
            if (global.confirm('Desfazer grupo para TODOS? (Cancelar = apenas sair)')) handleDissolve(convId);
            else handleLeave(convId);
          }
        } else {
          handleLeave(convId);
        }
        return;
      }
      return orig.apply(this, arguments);
    };
    w.__lfGrpAdmFix = true;
    global.chatDeleteConv = w;
  })();

  /* --------------------------------------------------------------
   * D) Header clicável (nome / N participantes / ℹ) → gestão em grupo
   *    Usa capture=true para vencer o guard `.closest('button')` do
   *    lf-fix-participantes-notif-tabs.
   * -------------------------------------------------------------- */
  D.addEventListener('click', function (ev) {
    try {
      var hdr = ev.target && ev.target.closest && ev.target.closest('#chat-conv-header');
      if (!hdr) return;
      var convId = global._chatCurrentConv;
      var conv = convId && getConv(convId);
      if (!conv || !conv.isGroup) return;

      var t = ev.target;

      // Botão ℹ → também abre gestão em grupos (era só mídias)
      var infoBtn = t.closest && t.closest('button.chat-conv-hd-menu');
      if (infoBtn && /chatShowConvInfo/.test(infoBtn.getAttribute('onclick') || '')) {
        ev.preventDefault(); ev.stopPropagation();
        if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
          global.LF_CHAT_GROUP_MANAGE.open();
        }
        return;
      }

      // ⋯ do header em grupo
      if (infoBtn && /chatConvMenu/.test(infoBtn.getAttribute('onclick') || '')) {
        ev.preventDefault(); ev.stopPropagation();
        if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
          global.LF_CHAT_GROUP_MANAGE.open();
        }
        return;
      }

      // Nome / avatar / status → gestão
      if (t.closest('.chat-conv-hd-info, .chat-conv-hd-name, .chat-conv-hd-status, .chat-conv-hd-avatar')) {
        ev.preventDefault(); ev.stopPropagation();
        if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
          global.LF_CHAT_GROUP_MANAGE.open();
        }
      }
    } catch (_e) {}
  }, true); // capture

  /* --------------------------------------------------------------
   * E) Amplia LF_CHAT_GROUP_MANAGE com setName (faltava)
   * -------------------------------------------------------------- */
  (function extendManageApi() {
    var api = global.LF_CHAT_GROUP_MANAGE;
    if (!api) { setTimeout(extendManageApi, 250); return; }
    if (api.setName) return;
    api.setName = function () {
      var mo = D.getElementById('mo-chat-manage');
      var convId = mo && mo._convId;
      handleSetName(convId);
    };
  })();

  /* --------------------------------------------------------------
   * Handlers auxiliares (leave / dissolve / setName escopo local)
   * -------------------------------------------------------------- */
  function handleSetName(convId) {
    var conv = getConv(convId); if (!conv) return;
    var me = meUid();
    if (roleOf(conv, me) === 'viewer') { toast('Apenas ADM pode renomear'); return; }
    var nv = global.prompt ? global.prompt('Nome do grupo:', conv.name || '') : null;
    if (nv == null) return;
    var name = String(nv).trim().slice(0, 80);
    if (!name) { toast('Nome inválido'); return; }
    conv.name = name;
    conv.updatedAt = new Date().toISOString();
    saveConvsMerge(conv);
    if (typeof global._chatSyncConvUpsert === 'function')
      safe(function () { global._chatSyncConvUpsert(conv); });
    toast('✏ Nome atualizado');
    if (typeof global.renderChatList === 'function') global.renderChatList();
    if (global._chatCurrentConv === convId && typeof global.openChatConv === 'function') {
      try { global.openChatConv(convId); } catch (_e) {}
    }
  }

  function handleLeave(convId) {
    var conv = getConv(convId); if (!conv) return;
    var me = meUid();
    var doIt = function () {
      conv.participants = arr(conv.participants).filter(function (u) { return u !== me; });
      conv.admins = arr(conv.admins).filter(function (u) { return u !== me; });
      conv.updatedAt = new Date().toISOString();
      saveConvsMerge(conv);
      if (typeof global._chatSyncConvUpsert === 'function')
        safe(function () { global._chatSyncConvUpsert(conv); });
      toast('🚪 Você saiu do grupo');
      if (typeof global.closeChatConv === 'function' && global._chatCurrentConv === convId) global.closeChatConv();
      // remove só do MEU inbox local — sem tocar nos outros
      try {
        var convs = global._chatGetConvs ? global._chatGetConvs() : [];
        convs = convs.filter(function (c) { return !(c && c.id === convId); });
        if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(convs);
        try { global.localStorage.removeItem('lf13_chat_msgs_' + convId); } catch (_e) {}
      } catch (_e) {}
      if (typeof global.renderChatList === 'function') global.renderChatList();
    };
    if (typeof global._confirmModal === 'function') {
      global._confirmModal({
        title: 'Sair do grupo?',
        msg: 'Você não receberá mais mensagens deste grupo. O ADM pode te readicionar depois.',
        okLabel: 'Sair', okClass: 'bd', onOk: doIt
      });
    } else if (global.confirm('Sair do grupo?')) doIt();
  }

  function handleDissolve(convId) {
    var conv = getConv(convId); if (!conv) return;
    var me = meUid();
    if (roleOf(conv, me) !== 'owner') {
      toast('Apenas o criador/ADM único pode desfazer o grupo');
      return;
    }
    var doIt = function () {
      conv.dissolved = true;
      conv.dissolvedAt = new Date().toISOString();
      conv.dissolvedBy = me;
      conv.updatedAt = conv.dissolvedAt;
      conv.participants = [];
      conv.admins = [];
      saveConvsMerge(conv);
      if (typeof global._chatSyncConvUpsert === 'function')
        safe(function () { global._chatSyncConvUpsert(conv); });
      toast('🗑 Grupo desfeito');
      if (typeof global.closeChatConv === 'function' && global._chatCurrentConv === convId) global.closeChatConv();
      if (typeof global.renderChatList === 'function') global.renderChatList();
    };
    if (typeof global._confirmModal === 'function') {
      global._confirmModal({
        title: 'Desfazer grupo?',
        msg: 'O grupo será apagado para você e para todos os participantes. Esta ação não pode ser desfeita.',
        okLabel: 'Desfazer', okClass: 'bd', onOk: doIt
      });
    } else if (global.confirm('Desfazer grupo? Apaga para TODOS.')) doIt();
  }

  console.log(TAG, 'v1-20260731 aplicado (grupo: ctx-menu, header, gestão, foto, remover, sair/desfazer)');
})(window);
