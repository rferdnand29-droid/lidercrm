/* ============================================================
   lf-bugs-5fixes-v1-20260729.js
   Pacote unificado de correções mobile + bingo + kanban.
   Consolidado de 4fixes → 5fixes (adiciona fix #5 mobile-CSS já
   entregue em _worker_src/css/lf-mobile-leads-list-fix.css).

   PROTEÇÃO:
   - Idempotente. Pode rodar mais de uma vez sem efeito colateral.
   - Early-return quando APIs não existem (não derruba app).
   - Não toca em outros patches nem em chat-ui-p0.css.
   ============================================================ */
(function () {
  'use strict';
  if (window.__lf5xInstalled) return;
  window.__lf5xInstalled = true;

  var LOG = function () {
    try {
      var a = Array.prototype.slice.call(arguments);
      a.unshift('[lf5x]');
      console.log.apply(console, a);
    } catch (_) {}
  };
  LOG('instalando 5fixes v1');

  /* ============================================================
     FIX #1 — Bingo NÃO recebe leads de outros consultores
     ------------------------------------------------------
     syncNegocioToBingo(uid) precisa ignorar cards vindos de outros
     uids (sourceOwnerUid !== uid). Se vier, bloqueia migração.
     ============================================================ */
  var FORGOTTEN_KEY = 'lf4x_removed_uids_v1';

  function getForgotten() {
    try {
      var raw = localStorage.getItem(FORGOTTEN_KEY);
      if (!raw) return {};
      var obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch (_) { return {}; }
  }
  function setForgotten(obj) {
    try { localStorage.setItem(FORGOTTEN_KEY, JSON.stringify(obj || {})); } catch (_) {}
  }
  function isForgotten(uid) { return !!getForgotten()[uid]; }

  function patchSyncNegocioToBingo() {
    if (typeof window.syncNegocioToBingo !== 'function') return;
    if (window.syncNegocioToBingo.__lf5xWrapped) return;
    var orig = window.syncNegocioToBingo;
    var wrapped = function (uid) {
      try {
        var clients = (typeof getCliLocal === 'function') ? (getCliLocal(uid) || []) : [];
        var safe = clients.filter(function (c) {
          if (!c) return false;
          if (c.sourceBoard === 'negocios' && c.sourceOwnerUid && c.sourceOwnerUid !== uid) return false;
          return true;
        });
        if (safe.length !== clients.length) {
          if (typeof saveCli === 'function') saveCli(uid, safe);
          if (typeof renderDash === 'function') renderDash();
          LOG('fix#1 bingo: purged', clients.length - safe.length, 'cross-owner cards');
        }
      } catch (e) { /* degrade silenciosamente */ }
      return orig.apply(this, arguments);
    };
    wrapped.__lf5xWrapped = true;
    window.syncNegocioToBingo = wrapped;
  }

  /* ============================================================
     FIX #1b — confirmDC propaga DELETE ao Worker
     ============================================================ */
  function patchConfirmDC() {
    if (typeof window.confirmDC !== 'function') return;
    if (window.confirmDC.__lf5xWrapped) return;
    var orig = window.confirmDC;
    window.confirmDC = function (clienteId) {
      var r;
      try { r = orig.apply(this, arguments); } catch (e) { r = undefined; }
      try {
        var uid = (window.S && S.userId) || null;
        if (uid && typeof window.apiDelete === 'function' && clienteId) {
          window.apiDelete('/api/leads/' + encodeURIComponent(clienteId) + '?uid=' + encodeURIComponent(uid))
            .catch(function (e) { LOG('fix#1b worker delete falhou (silencioso)', e && e.message); });
        } else if (uid && typeof window.api === 'function' && clienteId) {
          window.api('DELETE', '/api/leads/' + encodeURIComponent(clienteId), { uid: uid })
            .catch(function () {});
        }
      } catch (_) {}
      return r;
    };
    window.confirmDC.__lf5xWrapped = true;
  }

  /* ============================================================
     FIX #2a — Mover card ↑/↓ dentro da mesma coluna
     ------------------------------------------------------------
     CORREÇÃO 2026-08-03: esta versão chamava getLeadLocal/saveLead/
     renderLeads, que não existem em nenhum arquivo do projeto (o card
     é sempre lido via getKBFor/_kbMoveCard, mesmo em Leads) — a função
     sempre falhava silenciosamente. Também sobrescrevia (mesmo nome,
     window.__lf4xMove) a versão de lf-bugs-4fixes-v1, que usava o
     mecanismo certo mas nunca foi ligada a nenhum botão real.
     window._mbReorderCard, em js/kanban.js, é agora a única
     implementação (usa _kbMoveCard com dropIndex, o mesmo caminho do
     drag-and-drop do desktop, e já está ligada aos botões ⬆️/⬇️ da
     lista mobile). Mantido aqui só como alias de compatibilidade, caso
     algo externo ainda chame window.__lf4xMove diretamente.
     ============================================================ */
  window.__lf4xMove = function (cardId, board, uid, dir) {
    if (typeof window._mbReorderCard !== 'function') { LOG('fix#2a: _mbReorderCard ausente'); return false; }
    var ok = window._mbReorderCard(cardId, board, uid, dir);
    if (ok && typeof window.renderKBMobile === 'function') window.renderKBMobile(board);
    LOG('fix#2a delega pra _mbReorderCard', cardId, dir, 'in', board, '->', ok);
    return ok;
  };

  /* ============================================================
     FIX #2b — Preserva scrollTop ao mover etapa
     Wrapper de _kbMoveCard salvando em 3 frames.
     ============================================================ */
  function patchKbMoveCard() {
    var target = (typeof window._kbMoveCard === 'function') ? window._kbMoveCard
              : (window.KB && typeof window.KB._kbMoveCard === 'function') ? window.KB._kbMoveCard
              : null;
    if (!target) return;
    if (target.__lf5xWrapped) return;
    var orig = target;
    var wrapped = function () {
      var scroller = document.querySelector('#pg-leads .kb-scroll-wrap, #pg-negocios .kb-scroll-wrap, .kb-scroll-wrap');
      var saved = scroller ? scroller.scrollTop : 0;
      var r;
      try { r = orig.apply(this, arguments); } catch (e) { r = undefined; }
      var restore = function () {
        if (scroller && typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: saved, behavior: 'auto' });
        else if (scroller) scroller.scrollTop = saved;
      };
      requestAnimationFrame(function () { restore(); requestAnimationFrame(function () { restore(); requestAnimationFrame(restore); }); });
      return r;
    };
    wrapped.__lf5xWrapped = true;
    try {
      window._kbMoveCard = wrapped;
      if (window.KB) window.KB._kbMoveCard = wrapped;
    } catch (_) {}
  }

  /* ============================================================
     FIX #3 — Esquecer usuário definitivamente
     Impede que "Maria" reapareça após updates.
     ============================================================ */
  window.__lf4xForgetUser = function (uid) {
    if (!uid) return false;
    var f = getForgotten();
    f[uid] = Date.now();
    setForgotten(f);
    try {
      for (var k = 0; k < localStorage.length; k++) {
        var key = localStorage.key(k);
        if (key && key.indexOf(uid) !== -1 && key !== FORGOTTEN_KEY) {
          try { localStorage.removeItem(key); } catch (_) {}
        }
      }
    } catch (_) {}
    LOG('fix#3 forgot user', uid);
    return true;
  };
  window.__lf4xListForgotten = function () {
    return Object.keys(getForgotten());
  };

  /* ============================================================
     BARRAMENTO centralizado de forget
     Bloqueia retorno pós-update em syncNegocioToBingo / pingUser
     ============================================================ */
  function gateAgainstForgotten(uid) {
    if (!uid) return false;
    return isForgotten(uid);
  }

  /* ============================================================
     Inicialização escalonada
     ============================================================ */
  function bootFixes() {
    patchSyncNegocioToBingo();
    patchConfirmDC();
    patchKbMoveCard();

    if (typeof window.S === 'object' && window.S && window.S.userId && gateAgainstForgotten(window.S.userId)) {
      LOG('fix#3 sessão atual em blacklist');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootFixes);
  } else {
    bootFixes();
  }

  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (tries > 20) { clearInterval(iv); return; }
    if (typeof window.syncNegocioToBingo === 'function' ||
        typeof window._kbMoveCard === 'function' ||
        typeof window.confirmDC === 'function') {
      bootFixes();
    }
  }, 500);

  LOG('5fixes v1 pronto');
})();
