/* =====================================================================
 * lf-fix-novaconv-e-ctxgrupo-v1-20260801.js
 * ---------------------------------------------------------------------
 * CORREÇÃO DEFINITIVA de 2 bugs específicos do chat:
 *
 *   BUG 1 — "Nova conversa" abre com o menu escondido; só aparece
 *           após trocar para Configurações e voltar (reflow forçado).
 *
 *   BUG 2 — Botão direito no card do grupo:
 *           2a) nenhuma ação do menu funciona;
 *           2b) "Fechar grupo" some para TODOS os participantes,
 *               mesmo quando o usuário não é o dono.
 *
 * PRINCÍPIO: aditivo, stackable, reversível. Não edita chat.js,
 * utils.js, HTML ou CSS existentes. Envelopa apenas o necessário.
 * Guard: window.__LF_FIX_NOVACONV_CTXGRUPO_V1__.
 *
 * ORDEM DE CARGA: DEPOIS de:
 *   - js/chat.js
 *   - js/patches/lf-chat-group-adm-actions-fix-v1-20260731.js
 *   - js/patches/lf-chat-consolidated-fix-v1-20260731.js
 *   - js/patches/lf-cacador-erro-especifico-v2-20260801.js
 *
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_NOVACONV_CTXGRUPO_V1__) return;
  global.__LF_FIX_NOVACONV_CTXGRUPO_V1__ = true;

  var D   = global.document;
  var TAG = '[lf-fix-novaconv-e-ctxgrupo-v1]';

  function safe(fn) { try { return fn(); } catch (_e) { /* silent */ } }
  function arr(x)   { return Array.isArray(x) ? x : []; }
  function toast(m) { if (typeof global.toast === 'function') global.toast(m); }
  function meUid()  { return (global.S && global.S.userId) || ''; }
  function sameUid(a, b) { return String(a || '').trim() === String(b || '').trim(); }

  function getConvs() {
    if (typeof global._chatGetConvs === 'function') return arr(global._chatGetConvs());
    if (typeof global.sg === 'function')             return arr(global.sg('lf13_chat_convs'));
    try { return arr(JSON.parse(global.localStorage.getItem('lf13_chat_convs') || '[]')); }
    catch (_e) { return []; }
  }
  function findConv(id) {
    id = String(id || '');
    return getConvs().find(function (c) { return c && String(c.id) === id; }) || null;
  }

  /* ======================================================================
   * BUG 1 — Nova conversa: garante DOM correto + reflow ANTES do openM
   * ---------------------------------------------------------------------
   * Causa-raiz:
   *   1) #mo-chat-new no HTML tem .mb como filho direto de .mo, sem .mc
   *      (todos os outros modais têm .mc > .mb). Sob .mo{contain:layout
   *      style} + body-lock aplicado por openM(), o primeiro frame após
   *      .open não pinta o .mb — só um reflow completo (trocar de aba)
   *      recupera.
   *   2) Os wrappers anteriores tentam corrigir depois de openM(), mas
   *      já é tarde: o layout inicial não foi calculado com .mb dentro
   *      do flow.
   *
   * Fix:
   *   - Normaliza o markup INSERINDO um .mc entre .mo e .mb se faltar
   *     (idempotente, roda 1x no boot).
   *   - Envelopa chatNewConv para: (a) renderizar SÍNCRONO; (b) forçar
   *     reflow do .mo (offsetHeight) ANTES do openM; (c) abrir o modal;
   *     (d) rAF check pós-open que reforça visibilidade se ainda vazio.
   * ==================================================================== */
  (function fixNovaConversa() {

    function normalizeModalMarkup() {
      var mo = D.getElementById('mo-chat-new');
      if (!mo) return;
      // Se já tem .mc envolvendo .mb, nada a fazer.
      if (mo.querySelector(':scope > .mc > .mb')) return;
      var mb = mo.querySelector(':scope > .mb');
      if (!mb) {
        // Nenhum .mb — cria estrutura completa .mc > .mb.
        mo.innerHTML = '<div class="mc"><div class="mb" style="max-width:420px"></div></div>';
        return;
      }
      // .mb é filho direto de .mo: envelopa em .mc preservando o próprio .mb.
      var mc = D.createElement('div');
      mc.className = 'mc';
      mo.insertBefore(mc, mb);
      mc.appendChild(mb);
    }

    function ensureMbReady() {
      var mo = D.getElementById('mo-chat-new');
      if (!mo) return null;
      // Se um patch anterior destruiu o markup, restaura.
      if (!mo.querySelector('.mb')) {
        mo.innerHTML = '<div class="mc"><div class="mb" style="max-width:420px"></div></div>';
      } else {
        // Garante .mc como wrapper (idempotente).
        if (!mo.querySelector(':scope > .mc')) normalizeModalMarkup();
      }
      return mo;
    }

    function forceReflow(el) {
      if (!el) return;
      // Duas leituras de layout separadas por uma escrita: força o browser
      // a recalcular o box do modal antes do próximo paint. Sem isso o
      // .mb fica fora do flow no 1º frame depois de .open (bug do reflow
      // combinado com contain:layout style + body-lock do openM).
      /* jshint -W030 */
      el.offsetHeight;
      el.style.transform = 'translateZ(0)';
      el.offsetHeight;
    }

    function wrapChatNewConv() {
      var orig = global.chatNewConv;
      if (typeof orig !== 'function') { setTimeout(wrapChatNewConv, 250); return; }
      if (orig.__lfFixNovaConvV1) return;

      global.chatNewConv = function () {
        if (!global.S || !global.S.userId) { toast('Sessão expirada.'); return; }
        var mo = ensureMbReady();

        // 1) Render SÍNCRONO da lista dentro do .mb ANTES de abrir.
        if (typeof global._chatRenderNewConvList === 'function') {
          safe(function () { global._chatRenderNewConvList(); });
        }

        // 2) Força reflow do modal antes do openM aplicar body-lock.
        forceReflow(mo);

        // 3) Só agora abre.
        if (typeof global.openM === 'function') global.openM('mo-chat-new');

        // 4) Rede de segurança pós-open: se ainda vazio, re-renderiza e
        //    força novo reflow.
        if (typeof global.requestAnimationFrame === 'function') {
          global.requestAnimationFrame(function () {
            var m = D.getElementById('mo-chat-new');
            if (!m || !m.classList.contains('open')) return;
            var mb = m.querySelector('.mb');
            if (mb && !mb.innerHTML.trim() && typeof global._chatRenderNewConvList === 'function') {
              safe(function () { global._chatRenderNewConvList(); });
            }
            forceReflow(m);
          });
        }

        // 5) Reidrata lista de usuários em background (padrão original).
        if (typeof global.loadUsersDB === 'function') {
          safe(function () {
            global.loadUsersDB(function () {
              var m = D.getElementById('mo-chat-new');
              if (m && m.classList && m.classList.contains('open')
                  && typeof global._chatRenderNewConvList === 'function') {
                global._chatRenderNewConvList();
              }
            });
          });
        }
      };
      global.chatNewConv.__lfFixNovaConvV1 = true;
    }

    // Normalização de markup no boot (idempotente).
    if (D.readyState === 'loading') {
      D.addEventListener('DOMContentLoaded', normalizeModalMarkup, { once: true });
    } else {
      normalizeModalMarkup();
    }
    wrapChatNewConv();
  })();

  /* ======================================================================
   * BUG 2 — Botão direito no card do grupo
   * ---------------------------------------------------------------------
   * Causa-raiz A (ações não funcionam):
   *   O menu construído por lf-cacador-erro-especifico-v2 usa
   *   `menu.addEventListener('click', ..., false)` (bubble), enquanto o
   *   backdrop irmão usa `addEventListener('click', closeCtxMenu, true)`
   *   (capture). Todo clique passa PRIMEIRO pelo backdrop em captura,
   *   que remove o menu antes do delegate em bubbling rodar → ação
   *   nunca dispara.
   *
   * Causa-raiz B ("Fechar grupo" some para todos):
   *   isOwner() do v2 marca como owner qualquer ADM único
   *   (`hasAdmin() && admins.length <= 1`). Como grupos criados pelo
   *   próprio ADM começam com só 1 admin, QUALQUER admin único
   *   dispara dissolveGroup → _chatSyncConvUpsert propaga dissolved=true
   *   para o inbox de todos os participantes.
   *
   * Fix (sem tocar em v2):
   *   1) Instala um handler global em fase de CAPTURA sobre .chat-ctx-btn
   *      que EXECUTA a ação ANTES do backdrop fechar o menu.
   *   2) Substitui em runtime o handler de 'delete-conv' / 'dissolve'
   *      no chatDeleteConv para exigir que:
   *         - só o `createdBy` estrito (não "admin único") possa dissolver;
   *         - qualquer outro usuário só possa SAIR (leave), nunca dissolver;
   *         - a confirmação seja obrigatória e dupla ("digite DESFAZER"
   *           para dissolver, para bloquear toque acidental).
   * ==================================================================== */
  (function fixCtxMenuGrupo() {

    /* --- (1) Handler em CAPTURA vence o backdrop.close ------------------ */
    // Precisa vir antes de qualquer .chat-ctx-btn click chegar ao backdrop.
    // Instalamos NO document, capture=true, com stopPropagation controlado.
    D.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('.chat-ctx-btn');
      if (!btn) return;
      var menu = btn.closest('#chat-ctx-menu');
      if (!menu) return;

      var act = btn.getAttribute('data-act');
      if (!act) return;

      // Só interceptamos ações de conversa (não do msg-ctx que usa mesmos data-act).
      // Heurística: se o botão pertence a um menu que contém 'manage'/'leave'/'dissolve',
      // é o menu do CARD (grupo). Deixamos os demais fluírem.
      var isGroupCard = !!menu.querySelector('[data-act="manage"], [data-act="leave"], [data-act="dissolve"], [data-act="set-name"]');
      if (!isGroupCard) return;

      // Descobrir convId: procurar no data-conv-id do card em ctx-target,
      // ou no _chatCurrentConv como fallback.
      var convEl = D.querySelector('.chat-conv-item.ctx-target[data-conv-id]');
      var convId = (convEl && convEl.getAttribute('data-conv-id')) || global._chatCurrentConv || '';
      var conv = findConv(convId);

      // Impede o backdrop-capture de matar o menu ANTES da ação:
      // executa a ação AGORA (síncrono) e só depois fecha manualmente.
      ev.stopPropagation();
      ev.preventDefault();

      try {
        if (act === 'pin' && typeof global.chatTogglePin === 'function') global.chatTogglePin(convId);
        else if (act === 'mute' && typeof global.chatToggleMute === 'function') global.chatToggleMute(convId);
        else if (act === 'archive' && typeof global.chatArchive === 'function') global.chatArchive(convId);
        else if (act === 'manage') {
          if (global._chatCurrentConv !== convId && typeof global.openChatConv === 'function') {
            safe(function () { global.openChatConv(convId); });
          }
          if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
            setTimeout(function () { global.LF_CHAT_GROUP_MANAGE.open(); }, 40);
          }
        }
        else if (act === 'add-member' && typeof global.chatOpenAddMemberModal === 'function') {
          global.chatOpenAddMemberModal(convId);
        }
        else if (act === 'set-photo' && global.LF_CHAT_GROUP_MANAGE
                 && typeof global.LF_CHAT_GROUP_MANAGE.setPhoto === 'function') {
          global.LF_CHAT_GROUP_MANAGE.setPhoto(convId);
        }
        else if (act === 'set-name' && global.LF_CHAT_GROUP_MANAGE
                 && typeof global.LF_CHAT_GROUP_MANAGE.setName === 'function') {
          global.LF_CHAT_GROUP_MANAGE.setName(convId);
        }
        else if (act === 'set-desc' && global.LF_CHAT_GROUP_MANAGE
                 && typeof global.LF_CHAT_GROUP_MANAGE.setDescription === 'function') {
          global.LF_CHAT_GROUP_MANAGE.setDescription(convId);
        }
        else if (act === 'leave') {
          safeLeaveGroup(convId);
        }
        else if (act === 'dissolve') {
          strictDissolveGroup(convId);
        }
        else if (act === 'delete-conv') {
          // Em grupo, "excluir" NUNCA deve dissolver — só sair.
          if (conv && conv.isGroup) safeLeaveGroup(convId);
          else if (typeof global.chatDeleteConv === 'function') global.chatDeleteConv(convId);
        }
      } catch (e) {
        console.error(TAG, 'ação do menu de contexto falhou', act, e);
      }

      // Fecha manualmente APÓS a ação.
      try { if (typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu(); }
      catch (_e) {
        var m = D.getElementById('chat-ctx-menu'); if (m && m.parentNode) m.parentNode.removeChild(m);
        var b = D.getElementById('chat-ctx-backdrop'); if (b && b.parentNode) b.parentNode.removeChild(b);
      }
    }, true /* CAPTURE — vence backdrop.close */);

    /* --- (2) Owner estrito: só createdBy pode dissolver ----------------- */
    function isStrictOwner(conv) {
      if (!conv || !conv.isGroup) return false;
      var me = meUid();
      return !!conv.createdBy && sameUid(conv.createdBy, me);
    }

    function safeLeaveGroup(convId) {
      var conv = findConv(convId);
      if (!conv || !conv.isGroup) return;
      var me = meUid();

      function doLeave() {
        var remote = Object.assign({}, conv);
        remote.participants = arr(remote.participants).filter(function (u) { return !sameUid(u, me); });
        remote.admins       = arr(remote.admins).filter(function (u) { return !sameUid(u, me); });
        remote.updatedAt    = new Date().toISOString();

        // Persistência local (merge).
        var list = getConvs().slice();
        var i = list.findIndex(function (c) { return c && c.id === conv.id; });
        if (i >= 0) list[i] = Object.assign({}, list[i], remote);
        else list.push(remote);
        if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(list);

        // Sync remoto: só publica a REMOÇÃO do meu uid dos participantes.
        // NÃO seta dissolved. NÃO chama _chatRemoveInboxEntryForUsers com
        // outros uids — só o meu.
        safe(function () {
          if (typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(remote);
        });
        safe(function () {
          if (typeof global._chatRemoveInboxEntryForUsers === 'function') {
            global._chatRemoveInboxEntryForUsers(convId, [me]);
          }
        });

        // Higieniza meu inbox local.
        var mine = getConvs().filter(function (c) { return !(c && c.id === convId); });
        if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(mine);
        try { global.localStorage.removeItem('lf13_chat_msgs_' + convId); } catch (_e) {}
        if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') {
          safe(function () { global.closeChatConv(); });
        }
        if (typeof global.renderChatList === 'function') global.renderChatList();
        toast('🚪 Você saiu do grupo');
      }

      if (typeof global._confirmModal === 'function') {
        global._confirmModal({
          title: 'Sair do grupo?',
          msg:   'Você não receberá mais mensagens deste grupo. O grupo continua para os demais participantes.',
          okLabel: 'Sair', okClass: 'bd',
          onOk: doLeave
        });
      } else if (global.confirm('Sair do grupo? (o grupo continua para os demais)')) {
        doLeave();
      }
    }

    function strictDissolveGroup(convId) {
      var conv = findConv(convId);
      if (!conv || !conv.isGroup) return;

      // GATE 1 — só quem criou o grupo pode dissolver.
      if (!isStrictOwner(conv)) {
        toast('Apenas o criador do grupo pode desfazer para todos. Você pode SAIR do grupo.');
        return;
      }

      // GATE 2 — confirmação com digitação obrigatória, evita toque acidental.
      var typed = global.prompt
        ? global.prompt('⚠️ ATENÇÃO: isso apaga o grupo para TODOS.\nDigite DESFAZER para confirmar:')
        : null;
      if (String(typed || '').trim().toUpperCase() !== 'DESFAZER') {
        toast('Ação cancelada — texto de confirmação não bateu.');
        return;
      }

      var me = meUid();
      var participants = arr(conv.participants).slice();

      var next = Object.assign({}, conv);
      next.dissolved   = true;
      next.dissolvedAt = new Date().toISOString();
      next.dissolvedBy = me;
      next.updatedAt   = next.dissolvedAt;
      next.participants = [];
      next.admins       = [];

      // Persistência local (merge).
      var list = getConvs().slice();
      var i = list.findIndex(function (c) { return c && c.id === next.id; });
      if (i >= 0) list[i] = Object.assign({}, list[i], next);
      else list.push(next);
      if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(list);

      safe(function () {
        if (typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(next);
      });
      safe(function () {
        if (typeof global._chatRemoveInboxEntryForUsers === 'function' && participants.length) {
          global._chatRemoveInboxEntryForUsers(convId, participants);
        }
      });

      // Higieniza meu inbox.
      var mine = getConvs().filter(function (c) { return !(c && c.id === convId); });
      if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(mine);
      try { global.localStorage.removeItem('lf13_chat_msgs_' + convId); } catch (_e) {}
      if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') {
        safe(function () { global.closeChatConv(); });
      }
      if (typeof global.renderChatList === 'function') global.renderChatList();

      toast('🗑 Grupo desfeito para todos');
    }

    /* --- (3) Envelopa chatDeleteConv para NUNCA dissolver por acidente -- */
    (function wrapDeleteConv() {
      var orig = global.chatDeleteConv;
      if (typeof orig !== 'function') { setTimeout(wrapDeleteConv, 300); return; }
      if (orig.__lfFixCtxV1) return;

      global.chatDeleteConv = function (convId) {
        var conv = findConv(convId);
        if (!conv || !conv.isGroup) {
          // DM: comportamento original preservado.
          return orig.apply(this, arguments);
        }
        // GRUPO: nunca dissolve direto. Owner estrito → oferece opção.
        // Qualquer outro → só sair.
        if (isStrictOwner(conv)) {
          if (typeof global._confirmModal === 'function') {
            global._confirmModal({
              title: 'Excluir conversa (grupo)',
              msg:   'Você é o criador deste grupo.\n\n'
                   + '• "Sair apenas eu": o grupo continua para os demais.\n'
                   + '• "Desfazer p/ todos": apaga o grupo para todos '
                   + '(vai pedir confirmação digitada).',
              okLabel: 'Desfazer p/ todos', okClass: 'bd',
              cancelLabel: 'Sair apenas eu',
              onOk:     function () { strictDissolveGroup(convId); },
              onCancel: function () { safeLeaveGroup(convId); }
            });
          } else {
            // sem _confirmModal → fluxo mais conservador: apenas sair.
            safeLeaveGroup(convId);
          }
          return;
        }
        safeLeaveGroup(convId);
      };
      global.chatDeleteConv.__lfFixCtxV1 = true;
    })();

    /* --- (4) Guard extra: se o menu do v2 renderizar 'delete-conv'
     *        em grupo, redireciona para 'leave' antes do handler tocar. */
    D.addEventListener('DOMNodeInserted', function (ev) {
      var el = ev.target;
      if (!el || el.nodeType !== 1 || el.id !== 'chat-ctx-menu') return;
      // Em grupo, remove qualquer botão "delete-conv" que sobreviva
      // e garante que "dissolve" está protegido.
      var convEl = D.querySelector('.chat-conv-item.ctx-target[data-conv-id]');
      var convId = (convEl && convEl.getAttribute('data-conv-id')) || '';
      var conv = findConv(convId);
      if (!conv || !conv.isGroup) return;
      var del = el.querySelector('[data-act="delete-conv"]');
      if (del && del.parentNode) del.parentNode.removeChild(del);
    }, false);
  })();

  console.log(TAG, 'aplicado — nova conversa + ctx-menu de grupo protegidos');
})(window);
