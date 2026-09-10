/* =====================================================================
 * lf-cacador-erro-especifico-v2-20260801.js
 * ---------------------------------------------------------------------
 * Correção focada em 5 causas-raiz específicas do chat:
 *  1) Nova conversa abre "escondida" no 1º render.
 *  2) Menu de contexto do grupo / chatDeleteConv de grupo foi sobrescrito.
 *  3) lf13_chat_convs estoura quota por data URLs grandes.
 *  4) Foto de grupo precisa ir para upload remoto, não localStorage.
 *  5) Owner (createdBy) precisa poder editar descrição/foto/nome mesmo
 *     quando não estiver listado em conv.admins.
 *
 * Patch ADITIVO. Carregar por último.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_CACADOR_ERRO_ESPECIFICO_V2__) return;
  global.__LF_CACADOR_ERRO_ESPECIFICO_V2__ = true;

  var D = global.document;
  var LS = global.localStorage;
  var TAG = '[lf-cacador-erro-especifico-v2]';
  var CHAT_KEY = 'lf13_chat_convs';
  var AVATAR_DATAURL_MIN = 24 * 1024;
  var GENERIC_DATAURL_MIN = 48 * 1024;
  var pendingAvatarUploads = Object.create(null);

  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function nowIso() { return new Date().toISOString(); }
  function toast(msg, dur) { if (typeof global.toast === 'function') global.toast(msg, dur); }
  function sameUid(a, b) { return String(a || '').trim() === String(b || '').trim(); }
  function meUid() { return (global.S && global.S.userId) || ''; }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function getConvs() {
    return safe(function () {
      if (typeof global._chatGetConvs === 'function') return global._chatGetConvs() || [];
      if (typeof global.sg === 'function') return global.sg(CHAT_KEY) || [];
      var raw = LS.getItem(CHAT_KEY);
      return raw ? (JSON.parse(raw) || []) : [];
    }, []);
  }

  function findConv(convId) {
    convId = String(convId || '');
    return getConvs().find(function (c) { return c && String(c.id) === convId; }) || null;
  }

  function hasAdmin(conv) {
    return arr(conv && conv.admins).some(function (uid) { return sameUid(uid, meUid()); });
  }

  function isOwner(conv) {
    if (!conv) return false;
    if (sameUid(conv.createdBy, meUid())) return true;
    var admins = arr(conv.admins);
    return hasAdmin(conv) && admins.length <= 1;
  }

  function canManageGroup(conv) {
    return !!conv && (hasAdmin(conv) || isOwner(conv));
  }

  var origSS = typeof global.ss === 'function' ? global.ss : null;
  var origSaveConvs = typeof global._chatSaveConvs === 'function' ? global._chatSaveConvs : null;
  var origChatNewConv = typeof global.chatNewConv === 'function' ? global.chatNewConv : null;
  var origChatDeleteConv = typeof global.chatDeleteConv === 'function' ? global.chatDeleteConv : null;
  var origCtxMenu = typeof global._chatOpenConvCtxMenu === 'function' ? global._chatOpenConvCtxMenu : null;
  var origChatConvMenu = typeof global.chatConvMenu === 'function' ? global.chatConvMenu : null;
  var origLFGroupManage = global.LF_CHAT_GROUP_MANAGE || null;

  function rawPersistConvs(list) {
    list = arr(list);
    if (origSaveConvs) return origSaveConvs.call(global, list);
    if (origSS) return origSS.call(global, CHAT_KEY, list);
    try {
      LS.setItem(CHAT_KEY, JSON.stringify(list));
      return true;
    } catch (_e) {
      return false;
    }
  }

  function persistMergedConv(conv) {
    if (!conv || !conv.id) return false;
    var list = getConvs().slice();
    var idx = list.findIndex(function (c) { return c && c.id === conv.id; });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], conv);
    else list.push(conv);
    return rawPersistConvs(list);
  }

  function removeConvOnlyLocal(convId) {
    convId = String(convId || '');
    var list = getConvs().filter(function (c) { return !(c && String(c.id) === convId); });
    rawPersistConvs(list);
    try {
      var key = (typeof global.CHAT_MSG_PREFIX !== 'undefined' ? global.CHAT_MSG_PREFIX : 'lf13_chat_msgs_') + convId;
      LS.removeItem(key);
    } catch (_e) {}
    if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') safe(function () { global.closeChatConv(); });
    if (typeof global.renderChatList === 'function') safe(function () { global.renderChatList(); });
    if (typeof global._chatUpdateUnreadBadge === 'function') safe(function () { global._chatUpdateUnreadBadge(); });
  }

  function syncConv(conv) {
    try { if (typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(conv); } catch (_e) {}
    try { if (typeof global.renderChatList === 'function') global.renderChatList(); } catch (_e) {}
    try {
      if (global._chatCurrentConv === conv.id && typeof global.openChatConv === 'function') {
        global.openChatConv(conv.id);
      }
    } catch (_e) {}
  }

  function parseDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) return null;
    var m = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!m) return null;
    return {
      mime: m[1] || 'application/octet-stream',
      isBase64: !!m[2],
      payload: m[3] || ''
    };
  }

  function dataUrlToArrayBuffer(dataUrl) {
    var parsed = parseDataUrl(dataUrl);
    if (!parsed || !parsed.isBase64) throw new Error('data-url inválida');
    var bstr = global.atob(parsed.payload);
    var bytes = new Uint8Array(bstr.length);
    for (var i = 0; i < bstr.length; i++) bytes[i] = bstr.charCodeAt(i);
    return { mime: parsed.mime, buffer: bytes.buffer };
  }

  function uploadArrayBuffer(buffer, mime, fileName, folder) {
    var token = (global.S && (global.S._workerToken || global.S.token)) || '';
    if (!token) return Promise.reject(new Error('sem-token'));
    return global.fetch('/api/v1/upload/binary', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': mime || 'application/octet-stream',
        'X-Filename': fileName || ('file_' + Date.now()),
        'X-Folder': folder || 'chat'
      },
      body: buffer
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('upload ' + res.status + ': ' + t); });
      return res.json();
    }).then(function (json) {
      var d = json && json.data;
      if (!d || !d.url) throw new Error('upload sem URL');
      return d;
    });
  }

  function uploadDataUrl(dataUrl, fileName, folder) {
    var bin = dataUrlToArrayBuffer(dataUrl);
    return uploadArrayBuffer(bin.buffer, bin.mime, fileName, folder);
  }

  function uploadFile(file, folder) {
    if (!file || typeof file.arrayBuffer !== 'function') return Promise.reject(new Error('arquivo inválido'));
    return file.arrayBuffer().then(function (buffer) {
      return uploadArrayBuffer(buffer, file.type || 'application/octet-stream', file.name || ('file_' + Date.now()), folder);
    });
  }

  function scheduleAvatarOffload(convId, dataUrl) {
    convId = String(convId || '');
    if (!convId || typeof dataUrl !== 'string' || dataUrl.indexOf('data:image/') !== 0) return;
    if (dataUrl.length < AVATAR_DATAURL_MIN) return;
    if (pendingAvatarUploads[convId]) return;
    pendingAvatarUploads[convId] = true;

    uploadDataUrl(dataUrl, 'group_' + convId + '.jpg', 'chat-groups')
      .then(function (d) {
        var conv = findConv(convId);
        if (!conv) return;
        if (typeof conv.avatar === 'string' && conv.avatar.indexOf('data:image/') === 0) {
          conv.avatar = d.url;
          conv.updatedAt = nowIso();
          persistMergedConv(conv);
          syncConv(conv);
          paintGroupAvatar(conv.id);
          log('avatar de grupo offload concluído', convId);
        }
      })
      .catch(function (err) {
        warn('falha no offload do avatar legado', convId, err && err.message);
      })
      .finally(function () {
        pendingAvatarUploads[convId] = false;
      });
  }

  function isLikelyAvatarKey(key) {
    return /(^|_|-)(avatar|photo|pic|image|cover)$/i.test(String(key || '')) || /avatar|photo|pic|cover/i.test(String(key || ''));
  }

  function sanitizeValue(value, ctx) {
    ctx = ctx || {};
    if (Array.isArray(value)) {
      return value.map(function (item, idx) {
        return sanitizeValue(item, { convId: ctx.convId, key: ctx.key, path: (ctx.path || '') + '[' + idx + ']' });
      });
    }
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) {
        out[k] = sanitizeValue(value[k], { convId: ctx.convId, key: k, path: (ctx.path || '') + '.' + k });
      });
      return out;
    }
    if (typeof value === 'string' && value.indexOf('data:') === 0) {
      var isImg = value.indexOf('data:image/') === 0;
      var min = isImg ? AVATAR_DATAURL_MIN : GENERIC_DATAURL_MIN;
      if (value.length >= min) {
        if (isImg && isLikelyAvatarKey(ctx.key)) {
          scheduleAvatarOffload(ctx.convId, value);
        }
        return null;
      }
    }
    return value;
  }

  function sanitizeConvs(list) {
    list = arr(list);
    return list.map(function (conv) {
      if (!conv || typeof conv !== 'object') return conv;
      return sanitizeValue(conv, { convId: conv.id || '', key: '', path: 'conv' });
    });
  }

  function convsChanged(a, b) {
    try { return JSON.stringify(a) !== JSON.stringify(b); } catch (_e) { return true; }
  }

  /* ================================================================
   * 1) Nova conversa — estado real é .open, não .on; modal usa .mb direto
   * ================================================================ */
  function isModalOpen(el) {
    return !!(el && el.classList && (el.classList.contains('open') || el.classList.contains('on')));
  }

  function ensureNewConvVisible() {
    var mo = D.getElementById('mo-chat-new');
    if (!mo || !isModalOpen(mo)) return;

    mo.style.zIndex = '2147483000';
    mo.style.display = 'flex';
    mo.style.pointerEvents = 'auto';
    mo.style.alignItems = mo.style.alignItems || 'center';
    mo.style.justifyContent = mo.style.justifyContent || 'center';
    mo.style.background = 'rgba(0,0,0,.55)';

    var box = mo.querySelector('.mb') || mo.querySelector('.mc') || mo.firstElementChild;
    if (box) {
      box.style.position = 'relative';
      box.style.zIndex = '2147483001';
      box.style.maxHeight = box.style.maxHeight || '88vh';
      box.style.overflowY = 'auto';
    }

    var list = mo.querySelector('.chat-new-list');
    if ((!list || !list.children.length) && typeof global._chatRenderNewConvList === 'function') {
      safe(function () { global._chatRenderNewConvList(); });
    }

    if (box) {
      box.style.transform = 'translateZ(0)';
      void box.offsetHeight;
    }
  }

  function installNewConvFix() {
    global.chatNewConv = function () {
      var r;
      try {
        if (typeof origChatNewConv === 'function') r = origChatNewConv.apply(this, arguments);
      } catch (err) {
        warn('chatNewConv original falhou', err && err.message);
      }
      setTimeout(ensureNewConvVisible, 0);
      setTimeout(ensureNewConvVisible, 60);
      setTimeout(ensureNewConvVisible, 260);
      setTimeout(ensureNewConvVisible, 700);
      return r;
    };

    D.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#chat-new-conv-btn, .chat-new-btn')) {
        setTimeout(ensureNewConvVisible, 30);
        setTimeout(ensureNewConvVisible, 180);
      }
    }, true);
  }

  /* ================================================================
   * 2) Grupo — menu de contexto definitivo + semântica leave/dissolve
   * ================================================================ */
  function closeCtxMenu() {
    try {
      var menu = D.getElementById('chat-ctx-menu');
      if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    } catch (_e) {}
    try {
      var backdrop = D.getElementById('chat-ctx-backdrop');
      if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    } catch (_e) {}
    try { if (typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu(); } catch (_e) {}
  }

  function renameGroup(convId) {
    var conv = findConv(convId);
    if (!conv) return;
    if (!canManageGroup(conv)) { toast('Apenas ADM ou criador pode renomear'); return; }
    var nv = global.prompt ? global.prompt('Nome do grupo:', conv.name || '') : null;
    if (nv == null) return;
    nv = String(nv || '').trim().slice(0, 80);
    if (!nv) { toast('Nome inválido'); return; }
    conv.name = nv;
    conv.updatedAt = nowIso();
    persistMergedConv(conv);
    syncConv(conv);
    toast('✏️ Nome atualizado');
  }

  function editGroupDescription(convId) {
    var conv = findConv(convId);
    if (!conv) return;
    if (!canManageGroup(conv)) { toast('Apenas ADM ou criador pode editar descrição'); return; }
    var nv = global.prompt ? global.prompt('Descrição do grupo:', conv.description || '') : null;
    if (nv == null) return;
    conv.description = String(nv || '').slice(0, 500);
    conv.updatedAt = nowIso();
    persistMergedConv(conv);
    syncConv(conv);
    try {
      if (typeof global.LF_CHAT_GROUP_MANAGE === 'object' && global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
        setTimeout(function () { global.LF_CHAT_GROUP_MANAGE.open(); injectOwnerManageActions(); }, 80);
      }
    } catch (_e) {}
    toast('📝 Descrição salva');
  }

  function leaveGroup(convId) {
    var conv = findConv(convId);
    if (!conv) return;
    var me = meUid();
    if (!me) return;

    function doLeave() {
      var remote = Object.assign({}, conv);
      remote.participants = arr(remote.participants).filter(function (uid) { return !sameUid(uid, me); });
      remote.admins = arr(remote.admins).filter(function (uid) { return !sameUid(uid, me); });
      remote.updatedAt = nowIso();
      persistMergedConv(remote);
      try { if (typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(remote); } catch (_e) {}
      try {
        if (typeof global._chatRemoveInboxEntryForUsers === 'function') {
          global._chatRemoveInboxEntryForUsers(convId, [me]);
        }
      } catch (_e) {}
      removeConvOnlyLocal(convId);
      toast('🚪 Você saiu do grupo');
    }

    if (typeof global._confirmModal === 'function') {
      global._confirmModal({
        title: 'Sair do grupo?',
        msg: 'Você não receberá mais mensagens deste grupo. O grupo continua para os demais participantes.',
        okLabel: 'Sair',
        okClass: 'bd',
        onOk: doLeave
      });
    } else if (global.confirm('Sair do grupo?')) {
      doLeave();
    }
  }

  function dissolveGroup(convId) {
    var conv = findConv(convId);
    if (!conv) return;
    if (!isOwner(conv)) { toast('Apenas o criador pode desfazer o grupo'); return; }
    var participants = arr(conv.participants).slice();

    function doDissolve() {
      conv.dissolved = true;
      conv.dissolvedAt = nowIso();
      conv.dissolvedBy = meUid();
      conv.updatedAt = conv.dissolvedAt;
      conv.participants = [];
      conv.admins = [];
      persistMergedConv(conv);
      try { if (typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(conv); } catch (_e) {}
      try {
        if (typeof global._chatRemoveInboxEntryForUsers === 'function' && participants.length) {
          global._chatRemoveInboxEntryForUsers(convId, participants);
        }
      } catch (_e) {}
      removeConvOnlyLocal(convId);
      toast('🗑 Grupo desfeito para todos');
    }

    if (typeof global._confirmModal === 'function') {
      global._confirmModal({
        title: 'Desfazer grupo?',
        msg: 'Esta ação remove o grupo para todos os participantes.',
        okLabel: 'Desfazer',
        okClass: 'bd',
        onOk: doDissolve
      });
    } else if (global.confirm('Desfazer grupo para todos?')) {
      doDissolve();
    }
  }

  function archiveOrUnarchive(conv) {
    if (!conv) return;
    if (conv.archived === true) {
      if (typeof global.chatUnarchiveConv === 'function') return global.chatUnarchiveConv(conv.id);
      if (global.LF_CHAT_ARCHIVE_VIEW && typeof global.LF_CHAT_ARCHIVE_VIEW.unarchive === 'function') return global.LF_CHAT_ARCHIVE_VIEW.unarchive(conv.id);
      conv.archived = false;
      conv.unarchivedAt = nowIso();
      conv.updatedAt = conv.unarchivedAt;
      persistMergedConv(conv);
      syncConv(conv);
      toast('📥 Conversa desarquivada');
      return;
    }
    if (typeof global.chatArchive === 'function') return global.chatArchive(conv.id);
    if (typeof global.chatArchiveConv === 'function') return global.chatArchiveConv(conv.id);
    conv.archived = true;
    conv.archivedAt = nowIso();
    conv.updatedAt = conv.archivedAt;
    persistMergedConv(conv);
    syncConv(conv);
    toast('📦 Conversa arquivada');
  }

  function openGroupCtxMenu(x, y, convEl) {
    var convId = convEl && convEl.getAttribute && convEl.getAttribute('data-conv-id');
    var conv = convId && findConv(convId);
    if (!conv || !conv.isGroup) return false;

    closeCtxMenu();

    var backdrop = D.createElement('div');
    backdrop.id = 'chat-ctx-backdrop';
    backdrop.addEventListener('click', closeCtxMenu, true);
    backdrop.addEventListener('touchstart', function (ev) { ev.preventDefault(); closeCtxMenu(); }, { passive: false });
    D.body.appendChild(backdrop);

    var menu = D.createElement('div');
    menu.id = 'chat-ctx-menu';
    menu.className = 'chat-ctx-menu';
    menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg2,#1a1e26);color:var(--tx,#eee);border:1px solid var(--b1,rgba(255,255,255,.18));border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.65);padding:6px;min-width:260px;max-width:92vw;max-height:80vh;overflow-y:auto;font-family:Outfit,sans-serif;font-size:.85rem;pointer-events:auto;-webkit-user-select:none;user-select:none';

    function btn(act, label, danger) {
      var col = danger ? 'var(--rl,#ef4444)' : 'inherit';
      return '<button type="button" class="chat-ctx-btn" data-act="' + act + '" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:' + col + ';padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">' + label + '</button>';
    }
    function sep() { return '<div style="height:1px;background:var(--b1,rgba(255,255,255,.1));margin:4px 0"></div>'; }

    var canManage = canManageGroup(conv);
    var owner = isOwner(conv);
    var html = ''
      + btn('pin', conv.pinned ? '📌 Desafixar' : '📌 Fixar no topo')
      + btn('mute', conv.muted ? '🔔 Reativar notificações' : '🔕 Silenciar')
      + btn('archive', conv.archived === true ? '📥 Desarquivar' : '📦 Arquivar')
      + sep()
      + btn('manage', '👥 Participantes / Gestão');

    if (canManage) {
      html += btn('add-member', '➕ Adicionar participante')
        + btn('set-photo', '🖼 Editar foto do grupo')
        + btn('set-name', '✏ Editar nome do grupo')
        + btn('set-desc', '📝 Editar descrição');
    }

    html += sep() + btn('leave', '🚪 Sair do grupo', true);
    if (owner) html += btn('dissolve', '🗑 Desfazer grupo (todos)', true);
    menu.innerHTML = html;
    D.body.appendChild(menu);

    var vw = global.innerWidth || D.documentElement.clientWidth;
    var vh = global.innerHeight || D.documentElement.clientHeight;
    var mw = menu.offsetWidth || 260;
    var mh = menu.offsetHeight || 260;
    var pad = 8;
    var left = x;
    var top = y;
    if (left + mw + pad > vw) left = vw - mw - pad;
    if (left < pad) left = pad;
    if (top + mh + pad > vh) top = Math.max(pad, y - mh - 12);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    menu.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('.chat-ctx-btn');
      if (!b) return;
      var act = b.getAttribute('data-act');
      closeCtxMenu();
      if (act === 'pin' && typeof global.chatTogglePin === 'function') return global.chatTogglePin(convId);
      if (act === 'mute' && typeof global.chatToggleMute === 'function') return global.chatToggleMute(convId);
      if (act === 'archive') return archiveOrUnarchive(findConv(convId));
      if (act === 'manage') {
        if (global._chatCurrentConv !== convId && typeof global.openChatConv === 'function') safe(function () { global.openChatConv(convId); });
        if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
          setTimeout(function () { global.LF_CHAT_GROUP_MANAGE.open(); injectOwnerManageActions(); }, 50);
        }
        return;
      }
      if (act === 'add-member' && typeof global.chatOpenAddMemberModal === 'function') return global.chatOpenAddMemberModal(convId);
      if (act === 'set-photo' && global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.setPhoto === 'function') return global.LF_CHAT_GROUP_MANAGE.setPhoto(convId);
      if (act === 'set-name') return renameGroup(convId);
      if (act === 'set-desc') return editGroupDescription(convId);
      if (act === 'leave') return leaveGroup(convId);
      if (act === 'dissolve') return dissolveGroup(convId);
    }, false);

    return true;
  }

  function installGroupMenuFix() {
    global._chatOpenConvCtxMenu = function (x, y, convEl) {
      if (convEl && openGroupCtxMenu(x, y, convEl)) return;
      if (typeof origCtxMenu === 'function') return origCtxMenu.apply(this, arguments);
    };

    global.chatConvMenu = function (convId) {
      var conv = findConv(convId || global._chatCurrentConv);
      if (conv && conv.isGroup && global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
        if (global._chatCurrentConv !== conv.id && typeof global.openChatConv === 'function') safe(function () { global.openChatConv(conv.id); });
        setTimeout(function () { global.LF_CHAT_GROUP_MANAGE.open(); injectOwnerManageActions(); }, 40);
        return;
      }
      if (typeof origChatConvMenu === 'function') return origChatConvMenu.apply(this, arguments);
    };

    global.chatDeleteConv = function (convId) {
      var conv = findConv(convId);
      if (!conv || !conv.isGroup) {
        if (typeof origChatDeleteConv === 'function') return origChatDeleteConv.apply(this, arguments);
        return;
      }
      if (isOwner(conv)) {
        if (typeof global._confirmModal === 'function') {
          return global._confirmModal({
            title: 'Excluir conversa (grupo)',
            msg: 'Você é o criador deste grupo. Escolha: sair só você ou desfazer o grupo para todos.',
            okLabel: 'Desfazer p/ todos',
            okClass: 'bd',
            cancelLabel: 'Sair apenas eu',
            onOk: function () { dissolveGroup(convId); },
            onCancel: function () { leaveGroup(convId); }
          });
        }
        return global.confirm('OK = desfazer para todos\nCancelar = sair apenas você') ? dissolveGroup(convId) : leaveGroup(convId);
      }
      return leaveGroup(convId);
    };
  }

  /* ================================================================
   * 3) Quota — sanitize lf13_chat_convs em _chatSaveConvs e ss()
   * ================================================================ */
  function installQuotaFix() {
    if (origSS) {
      global.ss = function (key, value) {
        if (key === CHAT_KEY) value = sanitizeConvs(value);
        return origSS.call(this, key, value);
      };
    }

    global._chatSaveConvs = function (list) {
      return rawPersistConvs(sanitizeConvs(list));
    };

    var current = getConvs();
    var cleaned = sanitizeConvs(current);
    if (convsChanged(current, cleaned)) {
      rawPersistConvs(cleaned);
      log('convs higienizadas para evitar QuotaExceeded');
    }
  }

  /* ================================================================
   * 4) Foto de grupo remota + owner pode gerir descrição/foto/nome
   * ================================================================ */
  function paintGroupAvatar(convId) {
    convId = String(convId || '');
    var conv = findConv(convId);
    if (!conv || !conv.isGroup || !conv.avatar || String(conv.avatar).indexOf('http') !== 0) return;
    try {
      D.querySelectorAll('#chat-conv-list .chat-conv-item').forEach(function (el) {
        if (String(el.getAttribute('data-conv-id') || '') !== convId) return;
        var av = el.querySelector('.chat-conv-avatar');
        if (av) av.innerHTML = '<img src="' + escAttr(conv.avatar) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
      });
      if (global._chatCurrentConv === convId) {
        var hav = D.querySelector('#chat-conv-header .chat-conv-hd-avatar');
        if (hav) hav.innerHTML = '<img src="' + escAttr(conv.avatar) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
      }
    } catch (_e) {}
  }

  function setGroupPhoto(convId) {
    convId = String(convId || global._chatCurrentConv || '');
    var conv = findConv(convId);
    if (!conv || !conv.isGroup) return;
    if (!canManageGroup(conv)) { toast('Apenas ADM ou criador pode trocar a foto'); return; }

    var inp = D.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.style.display = 'none';
    D.body.appendChild(inp);

    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) { inp.remove(); return; }
      if (f.size > 4 * 1024 * 1024) { toast('⚠️ Imagem muito grande. Máximo 4MB.'); inp.remove(); return; }
      toast('Enviando foto do grupo...');
      uploadFile(f, 'chat-groups').then(function (d) {
        conv.avatar = d.url;
        conv.updatedAt = nowIso();
        persistMergedConv(conv);
        syncConv(conv);
        paintGroupAvatar(conv.id);
        setTimeout(function () { injectOwnerManageActions(); }, 80);
        toast('🖼 Foto do grupo atualizada');
      }).catch(function (err) {
        warn('upload da foto do grupo falhou', err && err.message);
        toast('Falha ao enviar a foto do grupo. Tente novamente.');
      }).finally(function () {
        inp.remove();
      });
    };

    inp.click();
  }

  function injectOwnerManageActions() {
    var mo = D.getElementById('mo-chat-manage');
    if (!mo || !(mo.classList.contains('on') || mo.classList.contains('open'))) return;
    var conv = findConv(mo._convId || global._chatCurrentConv);
    if (!conv || !conv.isGroup || !isOwner(conv)) return;
    var mb = mo.querySelector('.mb');
    if (!mb || mb.querySelector('#lf-owner-manage-bar')) return;

    var bar = D.createElement('div');
    bar.id = 'lf-owner-manage-bar';
    bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 14px';
    bar.innerHTML = ''
      + '<button type="button" class="bc" data-lf-act="set-name" style="font-size:.78rem">✏ Nome</button>'
      + '<button type="button" class="bc" data-lf-act="set-desc" style="font-size:.78rem">📝 Descrição</button>'
      + '<button type="button" class="bc" data-lf-act="set-photo" style="font-size:.78rem">🖼 Foto</button>';

    var anchor = mb.querySelector('.chat-grp-manage-list') || mb.firstElementChild;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(bar, anchor);
    else mb.insertBefore(bar, mb.firstChild);

    bar.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('[data-lf-act]');
      if (!b) return;
      var act = b.getAttribute('data-lf-act');
      if (act === 'set-name') renameGroup(conv.id);
      else if (act === 'set-desc') editGroupDescription(conv.id);
      else if (act === 'set-photo') setGroupPhoto(conv.id);
    });
  }

  function installGroupManagePermissionFix() {
    function apply() {
      if (!global.LF_CHAT_GROUP_MANAGE || typeof global.LF_CHAT_GROUP_MANAGE !== 'object') {
        return setTimeout(apply, 250);
      }
      var api = global.LF_CHAT_GROUP_MANAGE;
      if (api.__lfSpecificV2) return;
      var prevOpen = typeof api.open === 'function' ? api.open : function () {};
      api.open = function () {
        var r = prevOpen.apply(this, arguments);
        setTimeout(injectOwnerManageActions, 60);
        setTimeout(injectOwnerManageActions, 180);
        return r;
      };
      api.setDescription = function (convId) { return editGroupDescription(convId || global._chatCurrentConv); };
      api.setPhoto = function (convId) { return setGroupPhoto(convId || global._chatCurrentConv); };
      api.setName = function (convId) { return renameGroup(convId || global._chatCurrentConv); };
      api.__lfSpecificV2 = true;
      log('LF_CHAT_GROUP_MANAGE reforçado para owner/createdBy');
    }
    apply();
  }

  /* ================================================================
   * 5) Anexos novos — envia remoto primeiro, sem depender de fallback inline
   * ================================================================ */
  function installAttachmentUploadFix() {
    var origFileSelected = typeof global.chatFileSelected === 'function' ? global.chatFileSelected : null;
    if (!origFileSelected) return;
    global.chatFileSelected = function () {
      var outerArgs = arguments;
      if (!global.S || !global.S.userId) { toast('Sessão expirada.'); return; }
      var input = D.getElementById('chat-file-input');
      if (!input || !input.files || !input.files[0]) return;
      var file = input.files[0];
      if (file.size > 5 * 1024 * 1024) { toast('Arquivo muito grande (máx 5MB)'); input.value = ''; return; }
      var conv = findConv(global._chatCurrentConv);
      if (!conv) return origFileSelected.apply(this, arguments);

      var mime = file.type || 'application/octet-stream';
      var kind = mime.indexOf('image/') === 0 ? 'image' : (mime.indexOf('audio/') === 0 ? 'audio' : 'file');
      var folder = kind === 'audio' ? 'audio' : 'chat';

      toast('Enviando arquivo...');
      uploadFile(file, folder).then(function (d) {
        if (typeof global._chatSendAttachmentRemote === 'function') {
          global._chatSendAttachmentRemote(file.name, d.url, d.path, conv, { kind: kind, mimeType: mime });
        } else if (typeof global._chatSendAttachment === 'function') {
          global._chatSendAttachment(file.name, d.url, { kind: kind, mimeType: mime, remoteUrl: d.url, path: d.path });
        }
        if (typeof global._chatSyncMobileLayout === 'function') setTimeout(function () { global._chatSyncMobileLayout(true); }, 40);
      }).catch(function (err) {
        warn('upload remoto de anexo falhou; fallback legado', err && err.message);
        origFileSelected.apply(global, outerArgs);
      }).finally(function () {
        input.value = '';
      });
    };
  }

  installNewConvFix();
  installQuotaFix();
  installGroupMenuFix();
  installGroupManagePermissionFix();
  installAttachmentUploadFix();

  setTimeout(ensureNewConvVisible, 150);
  setTimeout(function () {
    getConvs().forEach(function (conv) {
      if (conv && conv.isGroup && typeof conv.avatar === 'string' && conv.avatar.indexOf('data:image/') === 0) {
        scheduleAvatarOffload(conv.id, conv.avatar);
      }
    });
  }, 300);

  log('instalado');
})(window);
