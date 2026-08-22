/* =====================================================================
 * lf-cacador-erro-definitivo-v2-20260731.js
 * ---------------------------------------------------------------------
 * CORREÇÃO DEFINITIVA — 5 bugs específicos reportados em 2026-07-31.
 *
 *  BUG 1: Nova Conversa — menu de opções aparece escondido; só aparece
 *         depois que o usuário vai em Configurações (re-render força).
 *         CAUSA: modal .mo abre sem z-index adequado, .mb às vezes fica
 *         vazio antes de loadUsersDB responder. Consolidated-fix não
 *         força repaint nem eleva z-index.
 *
 *  BUG 2: Conversa arquivada some da aba Arquivadas.
 *         CAUSA: chatArchive legado grava só {archived:true} sem
 *         archivedAt; isConvArchivedStrict do consolidated-fix retorna
 *         false; renderChatList (chat.js:343) filtra !c.archived antes
 *         de qualquer lógica de aba; strictTabsAndBadges do hotfix não
 *         trata a aba 'archived'.
 *
 *  BUG 3: Barras de usuário/grupo — 3 pontinhos e "i" devem sumir. Nome,
 *         cargo, e-mail, mídias, participantes precisam aparecer no
 *         clique. Em grupo, ADM precisa poder adicionar/remover/renomear/
 *         mudar foto/desfazer/fixar via botão direito.
 *         CAUSA: header em chat.js:439-441 injeta 2 botões (ℹ e ⋯) via
 *         innerHTML — patches anteriores só sobrescreviam handler, não
 *         removiam DOM. Perfil DM (mídias, nome, cargo, e-mail) já existe
 *         em chatShowConvInfo — só falta canalizar clique do nome/avatar
 *         para ele em DM (e para LF_CHAT_GROUP_MANAGE em grupo).
 *
 *  BUG 4: Botão Resetar trava o sistema.
 *         CAUSA: resetInterface() em leads.js:67 encadeia SW.unregister()
 *         → caches.delete() SEM timeout. Se algum SW pendurar (Cloudflare
 *         edge), a promise nunca resolve, done() nunca dispara, tela
 *         travada com toast "Interface resetada!" eterno.
 *
 *  BUG 5: Em grupo, mensagens não mostram nome de quem enviou.
 *         CAUSA: chat.js:1174 grava m.fromName mas renderChatMsgs
 *         (chat.js:481) só exibe m.senderName. Fallback ausente.
 *
 * ESTRATÉGIA: 100% aditivo, guard __LF_CACADOR_ERRO_DEFINITIVO_V2__.
 * Carregar POR ÚLTIMO (depois do consolidated-fix e do grp-adm-actions).
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_CACADOR_ERRO_DEFINITIVO_V2__) return;
  global.__LF_CACADOR_ERRO_DEFINITIVO_V2__ = true;

  var D = global.document;
  var LS = global.localStorage;
  var TAG = '[lf-cacador-def-v2]';

  function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function isoNow() { return new Date().toISOString(); }
  function meUid() { return (global.S && global.S.userId) || ''; }
  function toast(m) { if (typeof global.toast === 'function') global.toast(m); }
  function tsOf(v) { if (!v) return 0; var n = typeof v === 'number' ? v : Date.parse(v); return isFinite(n) ? n : 0; }

  function getConvs() {
    return safe(function () {
      if (typeof global._chatGetConvs === 'function') return global._chatGetConvs() || [];
      var raw = LS.getItem('lf13_chat_convs');
      return raw ? (JSON.parse(raw) || []) : [];
    }, []);
  }
  function saveConvs(convs) {
    try {
      if (typeof global._chatSaveConvs === 'function') return global._chatSaveConvs(convs);
      if (typeof global.ss === 'function') return global.ss('lf13_chat_convs', convs);
      LS.setItem('lf13_chat_convs', JSON.stringify(convs));
    } catch (_e) { }
  }
  function findConv(id) { return getConvs().find(function (c) { return c && c.id === id; }); }

  /* ==================================================================
   * BUG 1 — Nova Conversa: força z-index alto e repinta .mb
   * ================================================================== */
  function fixNewConvModal() {
    // Injeta CSS uma vez para garantir z-index acima da chat-actions-bar
    if (!D.getElementById('lf-cacador-def-v2-css')) {
      var st = D.createElement('style');
      st.id = 'lf-cacador-def-v2-css';
      st.textContent =
        '#mo-chat-new.on{z-index:2147483000 !important;background:rgba(0,0,0,.55) !important;}' +
        '#mo-chat-new.on .mc{z-index:2147483001 !important;position:relative !important;}' +
        '#mo-chat-new.on .mb{min-height:180px;}' +
        /* Some com "i" e "⋯" do header do chat conforme requisito */
        '#chat-conv-header button.chat-conv-hd-menu[onclick*="chatShowConvInfo"],' +
        '#chat-conv-header button.chat-conv-hd-menu[onclick*="chatConvMenu"]{display:none !important;}' +
        /* Header inteiro clicável — pointer nos elementos do info */
        '#chat-conv-header .chat-conv-hd-info,' +
        '#chat-conv-header .chat-conv-hd-avatar,' +
        '#chat-conv-header .chat-conv-hd-name{cursor:pointer !important;}' +
        /* Nome do remetente em grupo — visibilidade explícita */
        '.chat-msg.them .chat-msg-sender{display:block !important;font-size:.72rem;font-weight:600;' +
        'color:var(--al,#c39a2d);margin-bottom:2px;opacity:.95;}';
      D.head.appendChild(st);
    }

    // Se o modal está aberto e .mb continua vazio, força re-render manual
    var mo = D.getElementById('mo-chat-new');
    if (!mo || !mo.classList.contains('on')) return;
    var mb = mo.querySelector('.mb');
    if (!mb) return;
    var list = mb.querySelector('.chat-new-list');
    if (list && list.children.length) return;

    // Chama o repaint do consolidated-fix se existir, senão renderiza tabs mínimo
    if (global.LF_CHAT_CONSOLIDATED_FIX && typeof global.LF_CHAT_CONSOLIDATED_FIX.repaint === 'function') {
      safe(function () { global.LF_CHAT_CONSOLIDATED_FIX.repaint(); });
    } else if (typeof global._chatRenderNewConvList === 'function') {
      safe(function () { global._chatRenderNewConvList(); });
    }

    // Força reflow visual (Capacitor WebView às vezes precisa)
    mo.style.display = 'none';
    void mo.offsetHeight;
    mo.style.display = '';
  }

  // Hook em chatNewConv
  (function hookNewConv() {
    var orig = global.chatNewConv;
    global.chatNewConv = function () {
      var r;
      try { if (typeof orig === 'function') r = orig.apply(this, arguments); } catch (_e) { }
      setTimeout(fixNewConvModal, 0);
      setTimeout(fixNewConvModal, 60);
      setTimeout(fixNewConvModal, 260);
      setTimeout(fixNewConvModal, 700);
      return r;
    };
  })();
  // Reforço via clique no botão
  D.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('#chat-new-conv-btn, .chat-new-btn')) {
      setTimeout(fixNewConvModal, 30);
      setTimeout(fixNewConvModal, 250);
    }
  }, true);

  /* ==================================================================
   * BUG 2 — Arquivamento: unifica archived + archivedAt e cria aba/filtro
   *          consistente para "Arquivadas"
   * ================================================================== */

  // Backfill: qualquer conv com archived:true sem archivedAt ganha timestamp
  function backfillArchived() {
    var convs = getConvs();
    var changed = false;
    convs.forEach(function (c) {
      if (c && c.archived === true && !c.archivedAt) {
        c.archivedAt = c.updatedAt || isoNow();
        changed = true;
      }
    });
    if (changed) saveConvs(convs);
  }

  // Wrap chatArchive para SEMPRE gravar archivedAt
  (function wrapArchive() {
    function apply() {
      var origArchive = global.chatArchive;
      if (typeof origArchive !== 'function') { setTimeout(apply, 300); return; }
      if (origArchive.__cacadorV2) return;
      var w = function (convId) {
        var convs = getConvs();
        var c = convs.find(function (x) { return x && x.id === convId; });
        if (c) {
          c.archived = true;
          c.archivedAt = isoNow();
          c.unarchivedAt = null;
          c.updatedAt = c.archivedAt;
          saveConvs(convs);
          if (typeof global._chatSyncConvUpsert === 'function') safe(function () { global._chatSyncConvUpsert(c); });
          if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') safe(function () { global.closeChatConv(); });
          if (typeof global._chatCloseCtxMenu === 'function') safe(function () { global._chatCloseCtxMenu(); });
          toast('📦 Conversa arquivada');
          if (typeof global.renderChatList === 'function') safe(function () { global.renderChatList(); });
          return true;
        }
        return origArchive.apply(this, arguments);
      };
      w.__cacadorV2 = true;
      global.chatArchive = w;
      global.chatArchiveConv = w;
    }
    apply();
  })();

  // Filtro de aba "archived" — trata o caso não previsto no hotfix
  function applyArchivedTabFilter() {
    try {
      var tab = safe(function () {
        if (typeof global.sg === 'function') return global.sg('lf_chat_active_tab') || 'all';
        return LS.getItem('lf_chat_active_tab') || 'all';
      }, 'all');
      var container = D.getElementById('chat-conv-list');
      if (!container) return;

      // Se aba é 'archived' e a lista está vazia (porque renderChatList filtrou !c.archived),
      // re-injeta os cards das conversas arquivadas.
      if (tab === 'archived') {
        var archConvs = getConvs().filter(function (c) {
          if (!c || c.archived !== true) return false;
          var a = tsOf(c.archivedAt);
          var u = tsOf(c.unarchivedAt);
          if (!a) return true; // legado: aceita mesmo sem timestamp
          return !(u && u >= a);
        });
        // Se já existem cards (ex.: patch outro já renderizou), só mostra
        var existing = container.querySelectorAll('.chat-conv-item');
        if (existing.length && archConvs.length) {
          var byId = {};
          archConvs.forEach(function (c) { byId[c.id] = c; });
          existing.forEach(function (el) {
            var cid = el.getAttribute('data-conv-id');
            el.style.display = byId[cid] ? '' : 'none';
          });
          return;
        }
        // Se está vazio, monta cards mínimos com desarquivar
        if (!archConvs.length) {
          container.innerHTML = '<div class="chat-empty" style="padding:24px;text-align:center;color:var(--mu);font-size:.85rem">📦 Nenhuma conversa arquivada.</div>';
          return;
        }
        container.innerHTML = archConvs.map(function (c) {
          var nm = c.isGroup ? (c.name || 'Grupo') :
            safe(function () { return global._chatOtherUserName(c); }, c.id);
          return '<div class="chat-conv-item" data-conv-id="' + esc(c.id) + '" style="cursor:pointer;padding:12px;display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--b1,rgba(255,255,255,.08))">' +
            '<div class="chat-conv-avatar" style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#41285A,#A070CC);display:flex;align-items:center;justify-content:center;font-size:1rem">' + (c.isGroup ? '👥' : esc(String(nm).charAt(0).toUpperCase())) + '</div>' +
            '<div style="flex:1;min-width:0"><div class="chat-conv-name" style="font-weight:600">' + esc(nm) + '</div>' +
            '<div class="chat-conv-preview" style="font-size:.72rem;color:var(--mu)">📦 Arquivada' + (c.archivedAt ? ' • ' + new Date(c.archivedAt).toLocaleDateString('pt-BR') : '') + '</div></div>' +
            '<button class="bc" style="padding:5px 9px;font-size:.72rem" onclick="event.stopPropagation();(window.chatUnarchiveConv||window.LF_CHAT_ARCHIVE_VIEW&&window.LF_CHAT_ARCHIVE_VIEW.unarchive)(\'' + esc(c.id).replace(/'/g, "\\'") + '\')">📥 Desarquivar</button>' +
            '</div>';
        }).join('');
        // clique abre a conversa
        container.querySelectorAll('.chat-conv-item').forEach(function (el) {
          el.addEventListener('click', function () {
            var cid = el.getAttribute('data-conv-id');
            if (typeof global.openChatConv === 'function') global.openChatConv(cid);
          });
        });
        return;
      }

      // Nas outras abas, esconde arquivadas explicitamente (dupla trava)
      var items = container.querySelectorAll('.chat-conv-item');
      if (!items.length) return;
      var byId2 = {};
      getConvs().forEach(function (c) { if (c && c.id) byId2[c.id] = c; });
      items.forEach(function (el) {
        var c = byId2[el.getAttribute('data-conv-id')];
        if (c && c.archived === true) {
          var a = tsOf(c.archivedAt); var u = tsOf(c.unarchivedAt);
          var isArch = !(u && u >= a);
          if (isArch) el.style.display = 'none';
        }
      });
    } catch (_e) { }
  }

  (function wrapRenderForArchived() {
    function install() {
      var orig = global.renderChatList;
      if (typeof orig !== 'function') { setTimeout(install, 250); return; }
      if (orig.__cacadorV2Arch) return;
      var w = function () {
        var r = orig.apply(this, arguments);
        setTimeout(applyArchivedTabFilter, 0);
        setTimeout(applyArchivedTabFilter, 80);
        return r;
      };
      w.__cacadorV2Arch = true;
      global.renderChatList = w;
    }
    install();
  })();

  D.addEventListener('click', function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest('#chat-tabs-bar [data-tab]')) {
      setTimeout(applyArchivedTabFilter, 30);
      setTimeout(applyArchivedTabFilter, 150);
    }
  }, false);

  /* ==================================================================
   * BUG 3 — Header do chat: some 3 pontinhos + "i", clique abre perfil
   * ================================================================== */
  function repaintHeader() {
    try {
      var hdr = D.getElementById('chat-conv-header');
      if (!hdr) return;
      // Remove fisicamente os dois botões antigos (o CSS já esconde, isto reforça)
      hdr.querySelectorAll('button.chat-conv-hd-menu').forEach(function (b) {
        var oc = b.getAttribute('onclick') || '';
        if (oc.indexOf('chatShowConvInfo') >= 0 || oc.indexOf('chatConvMenu') >= 0) {
          b.style.setProperty('display', 'none', 'important');
          b.setAttribute('aria-hidden', 'true');
        }
      });
    } catch (_e) { }
  }

  // Clique no nome/avatar do header abre:
  //   - GRUPO: LF_CHAT_GROUP_MANAGE.open()  (participantes + mídias + admin)
  //   - DM:    chatShowConvInfo()           (nome, cargo, e-mail, mídias trocadas)
  D.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var hdr = t.closest('#chat-conv-header');
    if (!hdr) return;
    // Ignora botão voltar/fechar
    if (t.closest('.chat-back-btn, [onclick*="closeChatConv"]')) return;
    var infoZone = t.closest('.chat-conv-hd-info, .chat-conv-hd-name, .chat-conv-hd-status, .chat-conv-hd-avatar');
    if (!infoZone) return;
    var conv = findConv(global._chatCurrentConv);
    if (!conv) return;
    ev.preventDefault(); ev.stopPropagation();
    if (conv.isGroup) {
      if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
        global.LF_CHAT_GROUP_MANAGE.open();
      }
    } else {
      if (typeof global.chatShowConvInfo === 'function') global.chatShowConvInfo();
    }
  }, true);

  // Botão direito no HEADER de grupo → menu ADM (add/remover/renomear/foto/fixar/desfazer)
  D.addEventListener('contextmenu', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var hdr = t.closest('#chat-conv-header');
    if (!hdr) return;
    var conv = findConv(global._chatCurrentConv);
    if (!conv || !conv.isGroup) return;
    ev.preventDefault(); ev.stopPropagation();
    // Reusa o menu de contexto do CARD que o patch grp-adm-actions já monta
    var listItem = D.querySelector('#chat-conv-list .chat-conv-item[data-conv-id="' + conv.id.replace(/"/g, '\\"') + '"]');
    if (typeof global._chatOpenConvCtxMenu === 'function' && listItem) {
      global._chatOpenConvCtxMenu(ev.clientX || 40, ev.clientY || 60, listItem);
    } else if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
      global.LF_CHAT_GROUP_MANAGE.open();
    }
  }, true);

  (function wrapOpenChat() {
    var orig = global.openChatConv;
    if (typeof orig !== 'function') { setTimeout(arguments.callee, 250); return; }
    if (orig.__cacadorV2Hdr) return;
    var w = function () {
      var r = orig.apply(this, arguments);
      setTimeout(repaintHeader, 0);
      setTimeout(repaintHeader, 80);
      return r;
    };
    w.__cacadorV2Hdr = true;
    global.openChatConv = w;
  })();

  /* ==================================================================
   * BUG 4 — Botão Resetar Interface trava: adiciona timeout guardião
   * ================================================================== */
  (function wrapResetInterface() {
    function install() {
      if (typeof global.resetInterface !== 'function') { setTimeout(install, 400); return; }
      if (global.resetInterface.__cacadorV2) return;
      var orig = global.resetInterface;
      var w = function () {
        // Reimplementação segura: mesma UX, mas com watchdog
        var _confirm = global._confirmModal;
        var doReset = function () {
          var doneCalled = false;
          var done = function () {
            if (doneCalled) return;
            doneCalled = true;
            toast('Interface resetada! Recarregando...');
            setTimeout(function () {
              try {
                var url = location.pathname + '?_reset=' + Date.now() + location.hash;
                location.replace(url);
              } catch (_e) {
                location.href = location.pathname + '?_reset=' + Date.now();
              }
            }, 700);
          };
          // WATCHDOG: qualquer coisa que pendurar mais de 2.5s → recarrega assim mesmo
          setTimeout(done, 2500);

          try {
            var tasks = [];
            if ('serviceWorker' in navigator) {
              tasks.push(
                navigator.serviceWorker.getRegistrations()
                  .then(function (regs) { return Promise.all(regs.map(function (r) { return r.unregister().catch(function () { }); })); })
                  .catch(function () { })
              );
            }
            if (global.caches && caches.keys) {
              tasks.push(
                caches.keys().then(function (keys) {
                  return Promise.all(keys.map(function (k) { return caches.delete(k).catch(function () { }); }));
                }).catch(function () { })
              );
            }
            Promise.race([
              Promise.all(tasks),
              new Promise(function (res) { setTimeout(res, 2000); })
            ]).then(done).catch(done);
          } catch (_e) { done(); }
        };

        if (typeof _confirm === 'function') {
          _confirm({
            title: '🔄 Resetar interface?',
            msg: '<strong>Nenhum lead, negócio, cliente, usuário, configuração ou preferência visual será apagado.</strong><br><br>Este reset apenas limpa travamentos de tela (cache do app e service worker) e recarrega a página do zero. Todos os seus dados continuam salvos normalmente.',
            okLabel: 'Resetar interface',
            okClass: 'bp',
            onOk: doReset
          });
        } else if (global.confirm('Resetar interface?')) {
          doReset();
        }
      };
      w.__cacadorV2 = true;
      global.resetInterface = w;
    }
    install();
  })();

  /* ==================================================================
   * BUG 5 — Nome do remetente em grupo: fallback fromName -> senderName
   * ================================================================== */
  (function wrapRenderMsgs() {
    function install() {
      var orig = global.renderChatMsgs;
      if (typeof orig !== 'function') { setTimeout(install, 250); return; }
      if (orig.__cacadorV2Sender) return;
      var w = function (convId) {
        // Antes do render: garante que toda mensagem em grupo tenha senderName preenchido
        try {
          var conv = findConv(convId);
          if (conv && conv.isGroup && typeof global._chatGetMsgs === 'function') {
            var msgs = global._chatGetMsgs(convId) || [];
            var me = meUid();
            var byUid = {};
            (conv.participantNames || {});
            var patched = false;
            msgs.forEach(function (m) {
              if (!m || m.fromUid === me) return;
              if (m.senderName && m.senderName.trim()) return;
              // Ordem: fromName → participantNames → getUser → uid curto
              var nm = m.fromName;
              if (!nm && conv.participantNames && conv.participantNames[m.fromUid]) {
                nm = conv.participantNames[m.fromUid];
              }
              if (!nm && typeof global.getUser === 'function') {
                var u = safe(function () { return global.getUser(m.fromUid); }, null);
                if (u) nm = u.nome || u.email;
              }
              if (!nm) nm = String(m.fromUid || '?').split('@')[0];
              m.senderName = nm;
              patched = true;
            });
            if (patched && typeof global._chatSaveMsgs === 'function') {
              safe(function () { global._chatSaveMsgs(convId, msgs); });
            }
          }
        } catch (_e) { }
        return orig.apply(this, arguments);
      };
      w.__cacadorV2Sender = true;
      global.renderChatMsgs = w;
    }
    install();
  })();

  // Também garante que novas mensagens gravadas passem a incluir senderName
  (function wrapSendMsg() {
    ['chatSendMsg', '_chatSendMsg'].forEach(function (fnName) {
      function install() {
        var orig = global[fnName];
        if (typeof orig !== 'function') { return; }
        if (orig.__cacadorV2Sender) return;
        var w = function () {
          var r = orig.apply(this, arguments);
          try {
            if (global._chatCurrentConv && typeof global._chatGetMsgs === 'function') {
              var msgs = global._chatGetMsgs(global._chatCurrentConv) || [];
              var last = msgs[msgs.length - 1];
              if (last && !last.senderName) {
                last.senderName = (global.S && (global.S.nome || global.S.email)) || last.fromName || 'Você';
                if (typeof global._chatSaveMsgs === 'function') global._chatSaveMsgs(global._chatCurrentConv, msgs);
              }
            }
          } catch (_e) { }
          return r;
        };
        w.__cacadorV2Sender = true;
        global[fnName] = w;
      }
      install();
    });
  })();

  /* ==================================================================
   * BOOT
   * ================================================================== */
  function boot() {
    fixNewConvModal();      // injeta CSS
    backfillArchived();     // backfill archived legado
    repaintHeader();        // limpa header inicial
    // Observer leve: quando header re-render, reaplica limpeza
    try {
      var mo = new MutationObserver(function () { repaintHeader(); });
      var hdr = D.getElementById('chat-conv-header');
      if (hdr) mo.observe(hdr, { childList: true, subtree: false });
    } catch (_e) { }
    console.info(TAG, 'v2 ativo — bugs 1-5 corrigidos');
  }

  if (D.readyState === 'loading') {
    D.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  global.LF_CACADOR_DEF_V2 = {
    fixNewConvModal: fixNewConvModal,
    applyArchivedTabFilter: applyArchivedTabFilter,
    repaintHeader: repaintHeader,
    backfillArchived: backfillArchived
  };
})(window);
