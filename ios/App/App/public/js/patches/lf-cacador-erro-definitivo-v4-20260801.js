/* =====================================================================
 * lf-cacador-erro-definitivo-v4-20260801.js
 * ---------------------------------------------------------------------
 * PATCH CONSOLIDADO — Caçador de Erro Específico v4
 *
 * Corrige em definitivo os 5 bugs reportados, ganhando a última palavra
 * sobre TODOS os patches anteriores (deve ser o ÚLTIMO <script> no
 * index.html e no app.html, depois de:
 *   - js/chat.js
 *   - js/patches/lf-chat-group-manage-v1-20260728.js
 *   - js/patches/lf-chat-consolidated-fix-v1-20260731.js
 *   - js/patches/lf-chat-group-adm-actions-fix-v1-20260731.js
 *   - js/patches/lf-cacador-erro-definitivo-v1-20260731.js
 *   - js/patches/lf-cacador-erro-definitivo-v2-20260731.js
 *   - js/patches/lf-chat-6fixes-v1-20260731.js
 *   - js/patches/lf-cacador-erro-especifico-v2-20260801.js
 *   - js/patches/lf-fix-novaconv-e-ctxgrupo-v1-20260801.js
 *   - js/patches/lf-fix-quota-e-descgrupo-v1-20260801.js
 *   - js/patches/lf-fix-raiz-token-quota-v1-20260801.js
 *
 * BUGs cobertos (causa-raiz verificada no zip):
 *
 *   [BUG 1] Hudson (ADM) "desfaz grupo" — sumia pra todos MENOS ele,
 *           menu mostrava "Fechar" no lugar de "Apagar".
 *           Causa raiz: `isStrictOwner = createdBy===me` do patch
 *           lf-fix-novaconv-e-ctxgrupo sobrescreveu `roleOf` do
 *           lf-chat-group-adm-actions-fix. Hudson (ADM secundário)
 *           caía em role='admin' → botão "Apagar/Desfazer" some.
 *           Além disso, o menu do lf-chat-consolidated-fix renderiza
 *           um botão literal "Fechar" (fechar-modal) que era
 *           confundido com "Fechar grupo".
 *
 *   [BUG 2] "Nova conversa": menu escondido na tela do papo; só
 *           aparece após ir em Configurações e voltar.
 *           Causa raiz: #mo-chat-new tem .mb como filho direto de
 *           .mo (sem .mc). Sob .mo{contain:layout style} + body-lock
 *           do openM(), o 1º frame não pinta .mb. Trocar aba força
 *           reflow que arruma por acidente.
 *           CSS injetado pelos patches ancorava por `.on` mas
 *           openM() aplica `.open` — nunca casava.
 *
 *   [BUG 3] Arquivar aparece arquivado só pra quem arquivou;
 *           desarquivar volta ao normal em todos os dispositivos.
 *           Causa raiz: _chatSyncConvUpsert (chat.js:1461-1475)
 *           NÃO carrega `archived/archivedAt/unarchivedAt` no
 *           payload — quando o dono sincroniza em outro dispositivo,
 *           o remoto (sem esses campos) sobrescreve o local.
 *
 *   [BUG 4] Configurações não rola + trava ao "Resetar Interface".
 *           Causa raiz: renderConfig pinta #bg-thumbs com data-URL
 *           inline (papel de parede) → contain:layout style +
 *           touch-action:pan-y travam o scroll. resetInterface foi
 *           envelopado 3× (leads.js → cacador-v2 → chat-6fixes) —
 *           o watchdog do interior nunca fecha o _confirmModal do
 *           exterior.
 *
 *   [BUG 5] Hudson (ADM) não consegue abrir/editar leads alheios.
 *           Causa raiz: kanban.js:583 e :869 usam
 *           `limitedForeignAccess = !readOnly && !hasAdminAccess()
 *           && uid && S && uid !== S.userId`. Quando hasAdminAccess
 *           retorna false (Hudson com cargo Supervisor + admExtra
 *           ainda não hidratado no cache local, ou cargoCodigo
 *           ausente), o modal abre em read-only. auth.js já expõe
 *           `canEditForeign(uid,item)` — este patch usa isso como
 *           gate secundário robusto, sem tocar em hasAdminAccess.
 *
 * PRINCÍPIOS:
 *   • Aditivo, idempotente, reversível — remova o <script> e o
 *     comportamento anterior volta.
 *   • Ganha a última palavra: instala handlers em fase de CAPTURA
 *     e envelopa símbolos globais depois de todos os outros.
 *   • Não edita chat.js, kanban.js, leads.js, HTML nem CSS
 *     originais. Todos os fixes vivem neste arquivo.
 *
 * GUARD: window.__LF_CACADOR_ERRO_DEFINITIVO_V4__
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_CACADOR_ERRO_DEFINITIVO_V4__) return;
  global.__LF_CACADOR_ERRO_DEFINITIVO_V4__ = true;

  var D   = global.document;
  var LS  = global.localStorage;
  var TAG = '[lf-cacador-v4]';
  var CHAT_KEY = 'lf13_chat_convs';

  /* ================================================================
   * Helpers comuns
   * ================================================================ */
  function log()  { try { console.log.apply(console,  [TAG].concat([].slice.call(arguments))); } catch (_) {} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_) {} }
  function safe(fn, fb) { try { return fn(); } catch (_) { return fb; } }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function nowIso() { return new Date().toISOString(); }
  function toast(m) { if (typeof global.toast === 'function') global.toast(m); }
  function normUid(x) {
    if (x == null) return '';
    if (typeof x === 'object') return String(x.uid || x.id || x.userId || '').trim();
    return String(x).trim();
  }
  function meUid() { return normUid(global.S && global.S.userId); }
  function sameUid(a, b) { a = normUid(a); b = normUid(b); return !!a && a === b; }

  function getConvs() {
    return safe(function () {
      if (typeof global._chatGetConvs === 'function') return arr(global._chatGetConvs());
      if (typeof global.sg === 'function') return arr(global.sg(CHAT_KEY));
      var raw = LS.getItem(CHAT_KEY);
      return raw ? arr(JSON.parse(raw)) : [];
    }, []);
  }
  function findConv(id) {
    id = String(id || '');
    return getConvs().find(function (c) { return c && String(c.id) === id; }) || null;
  }
  function persistConvs(list) {
    if (typeof global._chatSaveConvs === 'function') return global._chatSaveConvs(list);
    if (typeof global.ss === 'function') return global.ss(CHAT_KEY, list);
    try { LS.setItem(CHAT_KEY, JSON.stringify(list)); return true; }
    catch (_) { return false; }
  }
  function persistConvMerge(conv) {
    if (!conv || !conv.id) return false;
    var list = getConvs().slice();
    var i = list.findIndex(function (c) { return c && c.id === conv.id; });
    if (i >= 0) list[i] = Object.assign({}, list[i], conv);
    else list.push(conv);
    return persistConvs(list);
  }

  /* ================================================================
   * Papel efetivo do usuário no grupo (v4 — regra unificada)
   *   owner:  quem pode DESFAZER pra todos
   *           = createdBy===me
   *           OR (isAdmin && admins.length<=1)
   *           OR (isAdmin && !createdBy)   ← grupos legados
   *   admin:  isAdmin (mas não owner)
   *   viewer: participa mas não é admin
   * ================================================================ */
  function isAdmin(conv) {
    if (!conv) return false;
    return arr(conv.admins).some(function (u) { return sameUid(u, meUid()); });
  }
  function isOwner(conv) {
    if (!conv || !conv.isGroup) return false;
    if (sameUid(conv.createdBy, meUid())) return true;
    if (!isAdmin(conv)) return false;
    var admins = arr(conv.admins).map(normUid).filter(Boolean);
    if (admins.length <= 1) return true;
    if (!conv.createdBy) return true;   // grupo legado sem createdBy
    return false;
  }
  function roleOf(conv) {
    if (!conv || !conv.isGroup) return 'viewer';
    if (isOwner(conv)) return 'owner';
    if (isAdmin(conv)) return 'admin';
    return 'viewer';
  }
  function canManageGroup(conv) {
    return !!conv && conv.isGroup !== false && (isAdmin(conv) || isOwner(conv));
  }

  /* Expõe pra debug e para outros patches poderem se apoiar */
  global.LF_V4_isOwner = isOwner;
  global.LF_V4_isAdmin = isAdmin;
  global.LF_V4_roleOf = roleOf;
  global.LF_V4_canManageGroup = canManageGroup;

  /* ================================================================
   * BUG 2 — Nova conversa aparece escondida no 1º render
   * ---------------------------------------------------------------- */
  var CSS_ID = 'lf-cacador-v4-css';
  function injectCss() {
    if (D.getElementById(CSS_ID)) return;
    var st = D.createElement('style');
    st.id = CSS_ID;
    // Ancorado em .open E .on (openM() usa .open; alguns patches usam .on)
    st.textContent = [
      '#mo-chat-new.on, #mo-chat-new.open {',
      '  display:flex !important;',
      '  align-items:center;',
      '  justify-content:center;',
      '  z-index:2147483000 !important;',
      '  background:rgba(0,0,0,.55) !important;',
      '  pointer-events:auto !important;',
      '  contain:none !important;',
      '}',
      '#mo-chat-new.on > .mc, #mo-chat-new.open > .mc,',
      '#mo-chat-new.on > .mb, #mo-chat-new.open > .mb {',
      '  position:relative;',
      '  z-index:2147483001 !important;',
      '  max-width:420px;',
      '  width:92vw;',
      '  max-height:88vh;',
      '  overflow-y:auto;',
      '}',
      /* Enquanto o modal está aberto, remove contain do #pg-chat pai
         para o reflow não ficar preso no container do papo */
      'body:has(#mo-chat-new.on) #pg-chat, body:has(#mo-chat-new.open) #pg-chat {',
      '  contain:none !important;',
      '}',
      /* BUG 4 — enquanto Configurações está pintando, remove contain
         e touch-action:pan-y do pg-config para o scroll voltar */
      '#pg-config.lf-v4-scroll-ok {',
      '  contain:none !important;',
      '  touch-action:auto !important;',
      '  overflow-y:auto !important;',
      '}',
      '#bg-thumbs .bg-thumb.lf-v4-thumb {',
      '  background-size:cover !important;',
      '  background-position:center !important;',
      '}'
    ].join('\n');
    (D.head || D.documentElement).appendChild(st);
  }

  function normalizeNewConvMarkup() {
    var mo = D.getElementById('mo-chat-new');
    if (!mo) return null;
    // Se já tem .mc envolvendo .mb, ok.
    if (mo.querySelector(':scope > .mc > .mb')) return mo;
    var mb = mo.querySelector(':scope > .mb');
    if (!mb) {
      mo.innerHTML = '<div class="mc"><div class="mb" style="max-width:420px"></div></div>';
      return mo;
    }
    // .mb solto: envolve em .mc.
    var mc = D.createElement('div');
    mc.className = 'mc';
    mo.insertBefore(mc, mb);
    mc.appendChild(mb);
    return mo;
  }

  function forceReflow(el) {
    if (!el) return;
    /* jshint -W030 */
    el.offsetHeight;
    var prev = el.style.transform;
    el.style.transform = 'translateZ(0)';
    el.offsetHeight;
    el.style.transform = prev || '';
  }

  function wireNewConvFix() {
    var origNew = global.chatNewConv;

    global.chatNewConv = function () {
      if (!global.S || !global.S.userId) { toast('Sessão expirada.'); return; }
      var mo = normalizeNewConvMarkup();
      // 1) render síncrono da lista dentro do .mb ANTES de abrir
      if (typeof global._chatRenderNewConvList === 'function') {
        safe(function () { global._chatRenderNewConvList(); });
      }
      // 2) reflow ANTES do openM
      forceReflow(mo);
      // 3) chama o original OU openM direto (mais seguro que reinventar)
      try {
        if (typeof origNew === 'function' && !origNew.__lfV4Neutralized) {
          origNew.call(this);
        } else if (typeof global.openM === 'function') {
          global.openM('mo-chat-new');
        }
      } catch (e) {
        warn('chatNewConv orig falhou; recorrendo a openM', e);
        if (typeof global.openM === 'function') global.openM('mo-chat-new');
      }
      // 4) rAF sanity check
      var check = function () {
        var m = D.getElementById('mo-chat-new');
        if (!m) return;
        var isOpen = m.classList.contains('open') || m.classList.contains('on');
        if (!isOpen) return;
        var mb = m.querySelector('.mb');
        if (mb && !mb.innerHTML.trim() && typeof global._chatRenderNewConvList === 'function') {
          safe(function () { global._chatRenderNewConvList(); });
        }
        forceReflow(m);
      };
      if (typeof global.requestAnimationFrame === 'function') {
        global.requestAnimationFrame(check);
        global.requestAnimationFrame(function () { global.requestAnimationFrame(check); });
      }
      setTimeout(check, 60);
      setTimeout(check, 250);
      // 5) reidrata usuários em background
      if (typeof global.loadUsersDB === 'function') {
        safe(function () { global.loadUsersDB(function () { check(); }); });
      }
    };
    global.chatNewConv.__lfV4 = true;

    // Clique direto no botão "+" também garante a rede de segurança
    D.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('#chat-new-conv-btn, .chat-new-btn')) {
        setTimeout(function () {
          var m = D.getElementById('mo-chat-new');
          if (m && (m.classList.contains('open') || m.classList.contains('on'))) {
            forceReflow(m);
          }
        }, 60);
      }
    }, true);

    // Normaliza no boot (idempotente)
    if (D.readyState === 'loading') {
      D.addEventListener('DOMContentLoaded', normalizeNewConvMarkup, { once: true });
    } else {
      normalizeNewConvMarkup();
    }
  }

  /* ================================================================
   * BUG 1 — Menu de contexto do CARD de grupo (right-click / long-press)
   *
   * Estratégia:
   *   • Instalar handler em CAPTURA no document que:
   *     - detecta contextmenu em `.chat-conv-item[data-conv-id]`
   *     - se conv.isGroup → constrói NOSSO menu (rótulos v4) e
   *       previne todos os outros patches (stopImmediatePropagation)
   *   • Substituir chatDeleteConv e _chatOpenConvCtxMenu para casos
   *     de fallback (long-press mobile, código legado que chama direto).
   *   • Os botões do menu executam ações v4 (leaveGroup / dissolveGroup)
   *     usando a regra unificada de owner.
   * ---------------------------------------------------------------- */
  function closeCtxMenu() {
    try {
      var m = D.getElementById('chat-ctx-menu');
      if (m && m.parentNode) m.parentNode.removeChild(m);
    } catch (_) {}
    try {
      var b = D.getElementById('chat-ctx-backdrop');
      if (b && b.parentNode) b.parentNode.removeChild(b);
    } catch (_) {}
    try {
      if (typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu();
    } catch (_) {}
  }

  function buildGroupCtxMenu(x, y, conv) {
    closeCtxMenu();

    var role = roleOf(conv);
    var canManage = (role === 'admin' || role === 'owner');
    var canDissolve = (role === 'owner');
    var convId = conv.id;
    var archived = (conv.archived === true);

    var backdrop = D.createElement('div');
    backdrop.id = 'chat-ctx-backdrop';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:99998;background:transparent;pointer-events:auto';
    D.body.appendChild(backdrop);

    var menu = D.createElement('div');
    menu.id = 'chat-ctx-menu';
    menu.className = 'chat-ctx-menu';
    menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg2,#1a1e26);color:var(--tx,#eee);border:1px solid var(--b1,rgba(255,255,255,.18));border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.65);padding:6px;min-width:260px;max-width:92vw;max-height:80vh;overflow-y:auto;font-family:Outfit,sans-serif;font-size:.85rem;pointer-events:auto;-webkit-user-select:none;user-select:none';

    function btn(act, label, danger) {
      var col = danger ? 'var(--rl,#ef4444)' : 'inherit';
      return '<button type="button" class="chat-ctx-btn lf-v4-ctx-btn" data-act="' + act + '" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:' + col + ';padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">' + label + '</button>';
    }
    function sep() {
      return '<div style="height:1px;background:var(--b1,rgba(255,255,255,.1));margin:4px 0"></div>';
    }

    var html = ''
      + btn('pin',     conv.pinned ? '📌 Desafixar' : '📌 Fixar no topo')
      + btn('mute',    conv.muted  ? '🔔 Reativar notificações' : '🔕 Silenciar')
      + btn('archive', archived    ? '📥 Desarquivar' : '📦 Arquivar')
      + sep()
      + btn('manage', '👥 Participantes / Gestão');
    if (canManage) {
      html += btn('add-member', '➕ Adicionar participante')
           +  btn('set-photo',  '🖼 Editar foto do grupo')
           +  btn('set-name',   '✏ Editar nome do grupo')
           +  btn('set-desc',   '📝 Editar descrição');
    }
    html += sep() + btn('leave', '🚪 Sair do grupo', true);
    if (canDissolve) {
      html += btn('dissolve', '🗑 Apagar grupo (todos)', true);
    }
    // rótulo neutro (BUG 1): nunca usar "Fechar" solto — confunde com "Fechar grupo"
    html += sep() + btn('cancel', '✖ Cancelar');
    menu.innerHTML = html;

    D.body.appendChild(menu);

    // Posicionamento
    var vw = global.innerWidth || D.documentElement.clientWidth;
    var vh = global.innerHeight || D.documentElement.clientHeight;
    var mw = menu.offsetWidth || 260;
    var mh = menu.offsetHeight || 300;
    var pad = 8;
    var left = x, top = y;
    if (left + mw + pad > vw) left = vw - mw - pad;
    if (left < pad) left = pad;
    if (top + mh + pad > vh) top = Math.max(pad, y - mh - 12);
    menu.style.left = left + 'px';
    menu.style.top  = top + 'px';

    // Backdrop fecha o menu, mas SÓ depois de qualquer clique dentro
    // dele ser tratado — usamos capture no menu abaixo pra ganhar.
    backdrop.addEventListener('click',       function () { closeCtxMenu(); }, false);
    backdrop.addEventListener('contextmenu', function (ev) { ev.preventDefault(); closeCtxMenu(); }, false);
    backdrop.addEventListener('touchstart',  function (ev) { ev.preventDefault(); closeCtxMenu(); }, { passive: false });

    // Handler em fase de CAPTURA no menu — pega o clique ANTES do
    // backdrop-capture de qualquer patch antigo remover o menu.
    menu.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest && ev.target.closest('.chat-ctx-btn');
      if (!b) return;
      var act = b.getAttribute('data-act');
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      runCtxAction(act, convId);
    }, true);
  }

  function runCtxAction(act, convId) {
    // Fecha PRIMEIRO — evita que fluxos assíncronos deixem o menu solto
    closeCtxMenu();
    try {
      if (act === 'cancel') return;
      if (act === 'pin' && typeof global.chatTogglePin === 'function') return global.chatTogglePin(convId);
      if (act === 'mute' && typeof global.chatToggleMute === 'function') return global.chatToggleMute(convId);
      if (act === 'archive') return toggleArchiveV4(convId);
      if (act === 'manage')     return openManage(convId);
      if (act === 'add-member' && typeof global.chatOpenAddMemberModal === 'function') return global.chatOpenAddMemberModal(convId);
      if (act === 'set-photo' && global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.setPhoto === 'function') return global.LF_CHAT_GROUP_MANAGE.setPhoto(convId);
      if (act === 'set-name')   return renameGroup(convId);
      if (act === 'set-desc')   return editDescription(convId);
      if (act === 'leave')      return leaveGroup(convId);
      if (act === 'dissolve')   return dissolveGroup(convId);
    } catch (e) {
      warn('ctx action falhou', act, e);
    }
  }

  function openManage(convId) {
    if (global._chatCurrentConv !== convId && typeof global.openChatConv === 'function') {
      safe(function () { global.openChatConv(convId); });
    }
    if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
      setTimeout(function () { global.LF_CHAT_GROUP_MANAGE.open(); }, 40);
    }
  }

  function renameGroup(convId) {
    var conv = findConv(convId);
    if (!conv) return;
    if (!canManageGroup(conv)) { toast('Apenas ADM ou criador pode renomear.'); return; }
    var nv = global.prompt ? global.prompt('Nome do grupo:', conv.name || '') : null;
    if (nv == null) return;
    nv = String(nv || '').trim().slice(0, 80);
    if (!nv) { toast('Nome inválido.'); return; }
    conv.name = nv;
    conv.updatedAt = nowIso();
    persistConvMerge(conv);
    safe(function () { if (typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(conv); });
    if (typeof global.renderChatList === 'function') safe(function () { global.renderChatList(); });
    toast('✏ Nome atualizado');
  }

  function editDescription(convId) {
    var conv = findConv(convId);
    if (!conv) return;
    if (!canManageGroup(conv)) { toast('Apenas ADM ou criador pode editar descrição.'); return; }
    var nv = global.prompt ? global.prompt('Descrição do grupo:', conv.description || '') : null;
    if (nv == null) return;
    conv.description = String(nv || '').slice(0, 500);
    conv.updatedAt = nowIso();
    persistConvMerge(conv);
    safe(function () { if (typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(conv); });
    toast('📝 Descrição salva');
  }

  function leaveGroup(convId) {
    var conv = findConv(convId);
    if (!conv || !conv.isGroup) return;
    var me = meUid();

    function doLeave() {
      var next = Object.assign({}, conv);
      next.participants = arr(next.participants).filter(function (u) { return !sameUid(u, me); });
      next.admins       = arr(next.admins).filter(function (u) { return !sameUid(u, me); });
      next.updatedAt    = nowIso();
      persistConvMerge(next);
      safe(function () { if (typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(next); });
      // Remove SÓ MEU inbox remoto (não mexe no dos outros)
      safe(function () {
        if (typeof global._chatRemoveInboxEntryForUsers === 'function') {
          global._chatRemoveInboxEntryForUsers(convId, [me]);
        }
      });
      // Higieniza inbox local
      var mine = getConvs().filter(function (c) { return !(c && c.id === convId); });
      persistConvs(mine);
      try { LS.removeItem('lf13_chat_msgs_' + convId); } catch (_) {}
      if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') {
        safe(function () { global.closeChatConv(); });
      }
      if (typeof global.renderChatList === 'function') safe(function () { global.renderChatList(); });
      toast('🚪 Você saiu do grupo');
    }

    if (typeof global._confirmModal === 'function') {
      global._confirmModal({
        title:   'Sair do grupo?',
        msg:     'Você não receberá mais mensagens deste grupo. Ele continua para os demais participantes.',
        okLabel: 'Sair',
        okClass: 'bd',
        onOk:    doLeave
      });
    } else if (global.confirm('Sair do grupo?')) {
      doLeave();
    }
  }

  function dissolveGroup(convId) {
    var conv = findConv(convId);
    if (!conv || !conv.isGroup) return;

    if (!isOwner(conv)) {
      toast('Apenas o criador (ou ADM único) pode apagar o grupo para todos. Você pode SAIR.');
      return;
    }

    function doDissolve() {
      var participants = arr(conv.participants).slice();
      var next = Object.assign({}, conv);
      next.dissolved   = true;
      next.dissolvedAt = nowIso();
      next.dissolvedBy = meUid();
      next.updatedAt   = next.dissolvedAt;
      next.participants = [];
      next.admins       = [];
      persistConvMerge(next);

      // Sync PRIMEIRO — só depois higieniza inbox
      var syncP = safe(function () {
        if (typeof global._chatSyncConvUpsert === 'function') return global._chatSyncConvUpsert(next);
        return Promise.resolve();
      }) || Promise.resolve();

      Promise.resolve(syncP).then(function () {
        return safe(function () {
          if (typeof global._chatRemoveInboxEntryForUsers === 'function' && participants.length) {
            return global._chatRemoveInboxEntryForUsers(convId, participants);
          }
        });
      }).then(function () {
        // Higieniza MEU inbox local (é o intencional em "apagar para todos")
        var mine = getConvs().filter(function (c) { return !(c && c.id === convId); });
        persistConvs(mine);
        try { LS.removeItem('lf13_chat_msgs_' + convId); } catch (_) {}
        if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') {
          safe(function () { global.closeChatConv(); });
        }
        if (typeof global.renderChatList === 'function') safe(function () { global.renderChatList(); });
        toast('🗑 Grupo apagado para todos');
      }).catch(function (e) {
        warn('dissolve chain err', e);
        toast('⚠ Grupo apagado localmente; a sincronização remota falhou.');
      });
    }

    // Confirmação com digitação — evita toque acidental
    if (typeof global._confirmModal === 'function') {
      global._confirmModal({
        title:   '🗑 Apagar grupo para todos?',
        msg:     'Esta ação remove o grupo para TODOS os participantes e não pode ser desfeita.<br><br>Digite <strong>APAGAR</strong> no prompt seguinte para confirmar.',
        okLabel: 'Continuar',
        okClass: 'bd',
        onOk: function () {
          var typed = global.prompt
            ? global.prompt('Digite APAGAR para confirmar (o grupo será removido para todos):')
            : 'APAGAR';
          if (String(typed || '').trim().toUpperCase() !== 'APAGAR') {
            toast('Ação cancelada.');
            return;
          }
          doDissolve();
        }
      });
    } else if (global.confirm('Apagar grupo para TODOS? Digite APAGAR na próxima janela para confirmar.')) {
      var typed = global.prompt ? global.prompt('Digite APAGAR:') : 'APAGAR';
      if (String(typed || '').trim().toUpperCase() !== 'APAGAR') { toast('Cancelado.'); return; }
      doDissolve();
    }
  }

  function wireGroupCtxMenu() {
    // 1) contextmenu em CAPTURA no document — vence qualquer outro patch
    D.addEventListener('contextmenu', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var item = t.closest('#chat-conv-list .chat-conv-item[data-conv-id]');
      if (!item) return;
      var convId = item.getAttribute('data-conv-id');
      var conv = findConv(convId);
      if (!conv || !conv.isGroup) return;   // DM segue fluxo original
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      buildGroupCtxMenu(ev.clientX || 20, ev.clientY || 20, conv);
    }, true);

    // 2) long-press mobile: intercepta touchstart+timer nos cards de grupo
    (function longPress() {
      var timer = null, sx = 0, sy = 0, target = null;
      D.addEventListener('touchstart', function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var item = t.closest('#chat-conv-list .chat-conv-item[data-conv-id]');
        if (!item) return;
        var conv = findConv(item.getAttribute('data-conv-id'));
        if (!conv || !conv.isGroup) return;
        var touch = ev.touches && ev.touches[0]; if (!touch) return;
        sx = touch.clientX; sy = touch.clientY; target = item;
        clearTimeout(timer);
        timer = setTimeout(function () {
          if (!target) return;
          try { if (navigator.vibrate) navigator.vibrate(40); } catch (_) {}
          buildGroupCtxMenu(sx, sy, conv);
        }, 520);
      }, { passive: true, capture: true });
      D.addEventListener('touchmove', function (ev) {
        var touch = ev.touches && ev.touches[0]; if (!touch) return;
        if (Math.abs(touch.clientX - sx) > 10 || Math.abs(touch.clientY - sy) > 10) {
          clearTimeout(timer); timer = null; target = null;
        }
      }, { passive: true, capture: true });
      D.addEventListener('touchend', function () {
        clearTimeout(timer); timer = null; target = null;
      }, { passive: true, capture: true });
    })();

    // 3) Substitui _chatOpenConvCtxMenu para casos de fallback (código
    //    que chama a função direta em vez de disparar contextmenu)
    global._chatOpenConvCtxMenu = function (x, y, convEl) {
      if (convEl && convEl.getAttribute) {
        var conv = findConv(convEl.getAttribute('data-conv-id'));
        if (conv && conv.isGroup) {
          buildGroupCtxMenu(x, y, conv);
          return;
        }
      }
      // DM: fallback nativo (se ainda existir)
      if (typeof global.__origChatOpenCtxMenu === 'function') {
        return global.__origChatOpenCtxMenu.apply(this, arguments);
      }
    };

    // 4) Substitui chatDeleteConv: nunca dissolve grupo por acidente
    global.chatDeleteConv = function (convId) {
      var conv = findConv(convId);
      if (!conv || !conv.isGroup) {
        if (typeof global.__origChatDeleteConv === 'function') {
          return global.__origChatDeleteConv.apply(this, arguments);
        }
        return;
      }
      // Grupo: owner escolhe; não-owner só sai
      if (isOwner(conv)) {
        if (typeof global._confirmModal === 'function') {
          return global._confirmModal({
            title:   'Excluir conversa (grupo)',
            msg:     'Você é o criador deste grupo.<br><br>• <strong>Sair apenas eu</strong>: o grupo continua para os demais.<br>• <strong>Apagar p/ todos</strong>: remove para todos (vai pedir confirmação digitada).',
            okLabel: 'Apagar p/ todos',
            okClass: 'bd',
            cancelLabel: 'Sair apenas eu',
            onOk:     function () { dissolveGroup(convId); },
            onCancel: function () { leaveGroup(convId); }
          });
        }
        return global.confirm('Apagar p/ TODOS? (Cancelar = sair apenas você)')
          ? dissolveGroup(convId)
          : leaveGroup(convId);
      }
      return leaveGroup(convId);
    };

    // 5) chatConvMenu (⋯ do header) em grupo → abre gestão
    var origConvMenu = global.chatConvMenu;
    global.chatConvMenu = function (convId) {
      var conv = findConv(convId || global._chatCurrentConv);
      if (conv && conv.isGroup) {
        openManage(conv.id);
        return;
      }
      if (typeof origConvMenu === 'function') return origConvMenu.apply(this, arguments);
    };
  }

  /* ================================================================
   * BUG 3 — Arquivar/desarquivar não persiste no próprio dono entre
   *         dispositivos porque o payload do sync não carrega
   *         archived/archivedAt/unarchivedAt/archivedBy.
   *
   * Fix: envelopa _chatSyncConvUpsert para: (a) enriquecer o payload
   * com esses campos quando presentes na conv local; (b) na leitura
   * remota (por outro caminho), preservar archived* se archivedBy===me.
   * ---------------------------------------------------------------- */
  function toggleArchiveV4(convId) {
    var conv = findConv(convId);
    if (!conv) return;
    var me = meUid();
    var now = nowIso();
    var next = Object.assign({}, conv);
    var archiving = !(conv.archived === true);
    if (archiving) {
      next.archived     = true;
      next.archivedAt   = now;
      next.archivedBy   = me;
      next.unarchivedAt = null;
    } else {
      next.archived     = false;
      next.unarchivedAt = now;
      next.archivedBy   = me;    // último a mexer
    }
    next.updatedAt = now;
    persistConvMerge(next);
    // Sync com metadata enriquecida (nosso wrapper cuida do payload)
    safe(function () { if (typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(next); });
    if (global._chatCurrentConv === convId && archiving && typeof global.closeChatConv === 'function') {
      safe(function () { global.closeChatConv(); });
    }
    if (typeof global.renderChatList === 'function') safe(function () { global.renderChatList(); });
    toast(archiving ? '📦 Conversa arquivada' : '📥 Conversa desarquivada');
  }

  function wireArchiveSyncFix() {
    // Envelopa chatArchive / chatUnarchiveConv para usar nossa versão
    global.chatArchive = function (convId) { return toggleArchiveV4(convId); };
    global.chatArchiveConv = global.chatArchive;
    global.chatUnarchiveConv = function (convId) {
      var c = findConv(convId);
      if (c && c.archived === true) return toggleArchiveV4(convId);
      return true;
    };
    global.chatToggleArchive = function (convId) { return toggleArchiveV4(convId); };

    // Envelopa _chatSyncConvUpsert para injetar archived* no payload
    var orig = global._chatSyncConvUpsert;
    if (typeof orig !== 'function') { setTimeout(wireArchiveSyncFix, 400); return; }
    if (orig.__lfV4) return;

    global._chatSyncConvUpsert = function (conv) {
      if (!conv || !conv.id) return orig.apply(this, arguments);
      // Enriquece a conv em memória com os campos que o payload nativo perde.
      // O orig lê `conv.archived` etc.? Não — ele monta payload próprio.
      // Truque: chamamos orig e depois, se possível, escrevemos os campos
      // adicionais direto no doc de config, via workerClient.putConfig.
      var origPromise;
      try { origPromise = orig.apply(this, arguments); }
      catch (e) { warn('orig _chatSyncConvUpsert throw', e); origPromise = Promise.resolve(conv); }
      Promise.resolve(origPromise).then(function () {
        var wc = safe(function () {
          var root = global.LiderCRM;
          return root && root.api && root.api.workerClient;
        });
        if (!wc || typeof wc.getConfig !== 'function' || typeof wc.putConfig !== 'function') return;
        var key = 'chat_conv_' + conv.id;
        return wc.getConfig(key).then(function (remote) {
          if (!remote || typeof remote !== 'object') return;
          var patch = {};
          var changed = false;
          ['archived', 'archivedAt', 'archivedBy', 'unarchivedAt', 'dissolved', 'dissolvedAt', 'dissolvedBy', 'description', 'avatar'].forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(conv, k) && conv[k] !== remote[k]) {
              patch[k] = conv[k];
              changed = true;
            }
          });
          if (!changed) return;
          var merged = Object.assign({}, remote, patch);
          return wc.putConfig(key, merged);
        }).catch(function (e) { warn('sync enrich err', e); });
      }).catch(function () {});
      return origPromise;
    };
    global._chatSyncConvUpsert.__lfV4 = true;

    // Rede de segurança na LEITURA: quando uma conv chegar do remoto sem
    // archived* mas eu tenho localmente archivedBy===me, preserva o local.
    // Fazemos isso interceptando _chatSaveConvs — quando alguém sobrescreve
    // a lista com uma cópia "limpa" da remoto, protegemos os archived* meus.
    var origSave = global._chatSaveConvs;
    if (typeof origSave === 'function' && !origSave.__lfV4Archive) {
      global._chatSaveConvs = function (list) {
        try {
          var me = meUid();
          var currentByI = {};
          safe(function () {
            arr(global._chatGetConvs ? global._chatGetConvs() : []).forEach(function (c) {
              if (c && c.id) currentByI[c.id] = c;
            });
          });
          arr(list).forEach(function (c) {
            if (!c || !c.id) return;
            var cur = currentByI[c.id];
            if (!cur) return;
            // Se o local tem archived* setado POR MIM e o novo apagou → preserva
            if (sameUid(cur.archivedBy, me)) {
              if (cur.archived === true && c.archived !== true && !c.unarchivedAt) {
                c.archived = true;
                c.archivedAt = cur.archivedAt || c.archivedAt;
                c.archivedBy = cur.archivedBy;
              }
              if (cur.archived === false && cur.unarchivedAt && c.archived === true) {
                c.archived = false;
                c.unarchivedAt = cur.unarchivedAt;
                c.archivedBy = cur.archivedBy;
              }
            }
          });
        } catch (e) { warn('save-archive-guard err', e); }
        return origSave.apply(this, arguments);
      };
      global._chatSaveConvs.__lfV4Archive = true;
    }
  }

  /* ================================================================
   * BUG 4 — Configurações não rola + trava ao "Resetar Interface"
   *
   * (a) Reidrata #bg-thumbs depois do renderConfig:
   *     - troca data-URL grande do papel de parede por blob: URL
   *     - libera contain/touch-action no #pg-config
   * (b) Substitui resetInterface por versão única com watchdog
   *     robusto e fechamento explícito do _confirmModal.
   * ---------------------------------------------------------------- */
  function wireConfigScrollFix() {
    function fixThumbs() {
      var wrap = D.getElementById('bg-thumbs');
      var pg = D.getElementById('pg-config');
      if (pg) pg.classList.add('lf-v4-scroll-ok');
      if (!wrap) return;
      // Percorre thumbs e converte inline data-URL grande em blob:
      var thumbs = wrap.querySelectorAll('.bg-thumb');
      thumbs.forEach(function (t) {
        t.classList.add('lf-v4-thumb');
        var style = t.getAttribute('style') || '';
        var m = style.match(/url\(['"]?(data:image\/[a-z]+;base64,[^'")]+)['"]?\)/i);
        if (!m) return;
        var dataUrl = m[1];
        if (dataUrl.length < 32 * 1024) return; // só otimiza os grandes
        try {
          var bin = global.atob(dataUrl.split(',')[1]);
          var u8 = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          var mime = (dataUrl.match(/^data:([^;,]+)/) || [])[1] || 'image/jpeg';
          var blob = new Blob([u8], { type: mime });
          var url = URL.createObjectURL(blob);
          t.setAttribute('style', style.replace(dataUrl, url));
        } catch (_) {}
      });
    }

    function wrapRenderConfig() {
      var orig = global.renderConfig;
      if (typeof orig !== 'function') { setTimeout(wrapRenderConfig, 250); return; }
      if (orig.__lfV4) return;
      global.renderConfig = function () {
        var r;
        try { r = orig.apply(this, arguments); }
        catch (e) { warn('renderConfig orig err', e); }
        // Deferred fix — deixa o DOM assentar, depois otimiza
        setTimeout(fixThumbs, 0);
        setTimeout(fixThumbs, 80);
        return r;
      };
      global.renderConfig.__lfV4 = true;
    }
    wrapRenderConfig();

    // Também garantimos ao entrar na página Config (ancorado no goPage)
    D.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest('[onclick*="goPage(\'config\')"], [data-page="config"]')) {
        setTimeout(fixThumbs, 60);
        setTimeout(fixThumbs, 300);
      }
    }, true);
  }

  function wireResetInterfaceFix() {
    function install() {
      var orig = global.resetInterface;
      if (typeof orig !== 'function') { setTimeout(install, 300); return; }
      // Sempre reinstala (mesmo se algum wrapper anterior estiver marcado),
      // porque somos o último a rodar.
      global.resetInterface = function () {
        if (typeof global._confirmModal !== 'function') {
          return doReset('no-modal');
        }
        global._confirmModal({
          title:   '🔄 Resetar interface?',
          msg:     '<strong>Nenhum lead, negócio, cliente, usuário, configuração ou preferência visual será apagado.</strong><br><br>Este reset apenas limpa travamentos de tela (cache do app e service worker) e recarrega a página do zero.',
          okLabel: 'Resetar interface',
          okClass: 'bp',
          onOk:    function () { doReset('modal-ok'); }
        });
      };
      global.resetInterface.__lfV4 = true;
    }

    function forceCloseModals() {
      // fecha _confirmModal e qualquer .mo aberto ANTES do reload
      safe(function () {
        D.querySelectorAll('.mo.open, .mo.on').forEach(function (m) {
          m.classList.remove('open');
          m.classList.remove('on');
          m.style.display = 'none';
        });
      });
    }

    function doReset(reason) {
      forceCloseModals();
      var finished = false;
      var HARD_MS = 5000;
      var finalize = function (label) {
        if (finished) return;
        finished = true;
        try { toast('Interface resetada! Recarregando...'); } catch (_) {}
        log('reset ok (' + reason + '/' + label + ')');
        setTimeout(function () {
          try {
            global.location.href = global.location.pathname + '?_reset=' + Date.now() + global.location.hash;
          } catch (_) {
            global.location.reload();
          }
        }, 500);
      };
      // Watchdog duro
      var hard = setTimeout(function () { finalize('watchdog'); }, HARD_MS);

      var chain;
      try {
        if ('serviceWorker' in global.navigator) {
          chain = global.navigator.serviceWorker.getRegistrations().then(function (regs) {
            return Promise.all(arr(regs).map(function (r) {
              return Promise.race([
                safe(function () { return r.unregister(); }, Promise.resolve(false)) || Promise.resolve(false),
                new Promise(function (res) { setTimeout(function () { res(false); }, 1500); })
              ]);
            }));
          }).then(function () {
            if (global.caches && global.caches.keys) {
              return global.caches.keys().then(function (keys) {
                return Promise.all(arr(keys).map(function (k) {
                  return Promise.race([
                    safe(function () { return global.caches.delete(k); }, Promise.resolve(false)) || Promise.resolve(false),
                    new Promise(function (res) { setTimeout(function () { res(false); }, 1200); })
                  ]);
                }));
              });
            }
          });
        } else {
          chain = Promise.resolve();
        }
      } catch (e) {
        warn('reset sync err', e);
        chain = Promise.resolve();
      }
      chain.then(function () { clearTimeout(hard); finalize('chain'); })
           .catch(function (e) { clearTimeout(hard); warn('reset chain err', e); finalize('chain-err'); });
    }

    install();
  }

  /* ================================================================
   * BUG 5 — Hudson (ADM) não consegue abrir/editar leads alheios
   *
   * Estratégia:
   *   • Não tocar em hasAdminAccess (perigoso — várias telas).
   *   • Interceptar openKBDet: se o gate primário (hasAdminAccess) já
   *     autorizar, ok; senão, se canEditForeign(S.userId,{ownerId:uid})
   *     autorizar (foreign==='edit' + escopo != self), remove o
   *     bloqueio de somente-leitura ANTES do modal renderizar.
   *   • Reforço no DOM: depois do render, se o modal ficou em modo
   *     read-only mas o usuário tem edit foreign, remove readOnly
   *     dos campos.
   *   • Nos cards do board: se um card veio marcado com .kb-card-ro
   *     por foreign, mas canEditForeign for true, remove a classe.
   * ---------------------------------------------------------------- */
  function canEditForeignV4(ownerUid) {
    try {
      var me = meUid();
      if (!me) return false;
      if (sameUid(ownerUid, me)) return true;
      if (typeof global.hasAdminAccess === 'function' && global.hasAdminAccess()) return true;
      if (typeof global.canEditForeign === 'function') {
        return !!global.canEditForeign(me, { ownerId: ownerUid });
      }
      // Fallback direto na matriz CARGO_CAPS
      if (typeof global.getCargoCaps === 'function') {
        var caps = global.getCargoCaps(me);
        if (caps && caps.foreign === 'edit' && caps.escopo !== 'self') return true;
      }
      return false;
    } catch (_) { return false; }
  }
  global.LF_V4_canEditForeign = canEditForeignV4;

  function wireLeadEditForeignFix() {
    function wrapOpenKBDet() {
      var orig = global.openKBDet;
      if (typeof orig !== 'function') { setTimeout(wrapOpenKBDet, 300); return; }
      if (orig.__lfV4) return;
      global.openKBDet = function (cardId, board, ownerUid, readOnly) {
        // Se o chamador pediu explicitamente readOnly=true (aba Time do
        // Supervisor), respeita. Caso contrário, se posso editar foreign,
        // força readOnly=false.
        var explicitRO = (readOnly === true);
        if (!explicitRO && canEditForeignV4(ownerUid)) {
          readOnly = false;
        }
        var r = orig.call(this, cardId, board, ownerUid, readOnly);
        // Rede de segurança pós-render: libera campos do modal
        if (!explicitRO && canEditForeignV4(ownerUid)) {
          setTimeout(function () { unlockDetModal(); }, 40);
          setTimeout(function () { unlockDetModal(); }, 180);
        }
        return r;
      };
      global.openKBDet.__lfV4 = true;
    }

    function unlockDetModal() {
      var m = D.getElementById('mo-kb-det') || D.querySelector('.mo.open, .mo.on');
      if (!m) return;
      // Remove readOnly em todos os inputs/textarea do modal
      m.querySelectorAll('input, textarea, select').forEach(function (el) {
        try { el.readOnly = false; el.disabled = false; } catch (_) {}
      });
      // Reexibe wrappers ocultos por modo read-only
      ['det-transfer-wrap', 'det-convert-wrap', 'det-stages'].forEach(function (id) {
        var e = D.getElementById(id);
        if (e && e.style.display === 'none') e.style.display = '';
      });
    }

    // Observer nos cards: sempre que o kanban re-renderizar, garantimos
    // que cards de outros donos NÃO fiquem em .kb-card-ro para Hudson.
    function unlockCards() {
      D.querySelectorAll('.kb-card.kb-card-ro').forEach(function (el) {
        var ownerUid = el.dataset && el.dataset.owner;
        if (!ownerUid) return;
        if (canEditForeignV4(ownerUid)) {
          el.classList.remove('kb-card-ro');
          el.draggable = true;
        }
      });
    }
    var mo = new MutationObserver(function () {
      // debounce por rAF
      if (mo.__scheduled) return;
      mo.__scheduled = true;
      global.requestAnimationFrame(function () {
        mo.__scheduled = false;
        unlockCards();
      });
    });
    function bootObserver() {
      var pgLeads = D.getElementById('pg-leads');
      var pgNeg   = D.getElementById('pg-negocios');
      if (!pgLeads && !pgNeg) { setTimeout(bootObserver, 500); return; }
      if (pgLeads) mo.observe(pgLeads, { childList: true, subtree: true });
      if (pgNeg)   mo.observe(pgNeg,   { childList: true, subtree: true });
      unlockCards();
    }
    bootObserver();

    wrapOpenKBDet();
  }

  /* ================================================================
   * Boot — instala tudo depois do DOM pronto
   * ================================================================ */
  function boot() {
    // Guarda referências ORIGINAIS antes de sobrescrever, para fallback
    if (!global.__origChatOpenCtxMenu && typeof global._chatOpenConvCtxMenu === 'function') {
      // Ignora se algum patch anterior já embrulhou — nesse caso o "orig"
      // que salvamos já é um wrapper, o que ainda funciona.
      global.__origChatOpenCtxMenu = global._chatOpenConvCtxMenu;
    }
    if (!global.__origChatDeleteConv && typeof global.chatDeleteConv === 'function') {
      global.__origChatDeleteConv = global.chatDeleteConv;
    }

    injectCss();
    wireNewConvFix();
    wireGroupCtxMenu();
    wireArchiveSyncFix();
    wireConfigScrollFix();
    wireResetInterfaceFix();
    wireLeadEditForeignFix();

    log('v4 aplicado — 5 bugs cobertos (grupo/nova-conv/arquivar/config/edit-foreign)');
  }

  if (D.readyState === 'loading') {
    D.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window);
