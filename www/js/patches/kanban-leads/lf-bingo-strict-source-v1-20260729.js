/* =====================================================================
 * lf-bingo-strict-source-v1-20260729.js
 * ---------------------------------------------------------------------
 * Corrige (definitivo) a entrada indevida no Bingo de cards em etapas
 * que NÃO são agvid/presencial (retag, cart, fich, aprov, fecham,
 * fechado). Baseado em lf-bingo-sync-v1-20260722.js — não substitui,
 * INTERCEPTA syncNegocioToBingo e endurece a regra.
 *
 * Também trata "AG-desligamento": quando o card volta de agvid/
 * presencial para uma coluna não-operacional, desmarca steps[0] e
 * remove o cliente da aba Agendados (comportamento esperado pelo time).
 *
 * NÃO cria backend, NÃO migra dados, NÃO reescreve nada existente.
 * Idempotente. Reversível removendo o <script>.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixBingoStrictSourceV1) return;
  global.__lfFixBingoStrictSourceV1 = true;
  if (global.__LF_BINGO_STRICT_SOURCE_V1) return;
  global.__LF_BINGO_STRICT_SOURCE_V1 = true;

  var OPERATIONAL = { agvid: true, presencial: true };
  var DEACTIVATE   = { retag: true, cart: true, fich: true, aprov: true, fecham: true, fechado: true };

  function _nowIso() { return new Date().toISOString(); }
  function _norm(s) { return String(s || '').replace(/\D/g, ''); }

  function _findExistingSameCard(list, card) {
    if (!list || !card) return null;
    for (var i = 0; i < list.length; i++) {
      var c = list[i]; if (!c) continue;
      if (card.id && c.sourceCardId === card.id) return c;
      if (card.originalLeadId && c.sourceOriginalLeadId === card.originalLeadId) return c;
    }
    return null;
  }

  function _install() {
    if (typeof global.syncNegocioToBingo !== 'function' &&
        !(global.LiderCRM && global.LiderCRM.bingoSync)) {
      return setTimeout(_install, 300);
    }
    var api  = (global.LiderCRM && global.LiderCRM.bingoSync) || {};
    var orig = api.syncNegocioToBingo || global.syncNegocioToBingo;
    if (!orig || orig.__lfStrictWrapped) return;

    var wrapped = function (card, ownerUid, newCol) {
      if (!card) return;
      var uid = ownerUid || card.userId || (global.S && global.S.userId);
      if (!uid) return;
      var col = newCol || card.col;

      try {
        var list = (typeof global.getCliLocal === 'function') ? (global.getCliLocal(uid) || []) : [];
        var existing = _findExistingSameCard(list, card);

        if (OPERATIONAL[col]) {
          /* BUG #2 (2026-08-19): transição de ENTRADA em coluna
             operacional — se o cliente tinha sido arquivado por uma
             transição anterior, limpa o marcador AGORA (na transição,
             não num sweep cego de boot). O orig (bingo-sync) já
             re-marca steps[0] via _ensureAgStep. */
          if (existing && existing.bingoArchivedAt) {
            try {
              existing.bingoArchivedAt = null;
              existing.bingoArchivedFromCol = null;
            } catch (_e) {}
          }
          return orig.apply(this, arguments);
        }

        if (DEACTIVATE[col] && existing) {
          var changed = false;
          if (Array.isArray(existing.steps) && existing.steps[0]) {
            existing.steps[0] = false;
            if (Array.isArray(existing.stepDates)) existing.stepDates[0] = null;
            changed = true;
          }
          if (!existing.bingoArchivedFromCol || existing.bingoArchivedFromCol !== col) {
            existing.bingoArchivedFromCol = col;
            existing.bingoArchivedAt = _nowIso();
            changed = true;
          }
          if (changed && typeof global.saveCli === 'function') {
            global.saveCli(uid, list);
            if (global.S && global.S.userId === uid && typeof global.renderDash === 'function') {
              var pg = document.getElementById('pg-dash');
              if (pg && pg.classList.contains('on')) { try { global.renderDash(); } catch (_e) {} }
            }
          }
          return;
        }

        if (existing && (col === 'vidp' || col === 'reag' || col === 'noshow')) {
          return orig.apply(this, arguments);
        }

        return;
      } catch (e) {
        try { console.warn('[lf-bingo-strict]', e); } catch (_e) {}
      }
    };
    wrapped.__lfStrictWrapped = true;

    if (api.syncNegocioToBingo) api.syncNegocioToBingo = wrapped;
    global.syncNegocioToBingo = wrapped;

    /* BUG #2 (2026-08-19) — BOOT SWEEP REMOVIDO.
       O sweep antigo rodava 2,5s após o load e ZERAVA steps[0] de todo
       cliente cujo Negócio vinculado não estava em agvid/presencial
       NAQUELE INSTANTE — sem verificar se o card já tinha voltado ao
       estado operacional por outra aba/dispositivo. Combinado com os
       fetches múltiplos do boot (bug #1), o cliente era desligado do
       Bingo entre sincronizações.

       O arquivamento agora acontece APENAS na transição (no wrapper
       acima, quando o card entra em coluna DEACTIVATE). O que resta
       aqui é um reconcile RESTORE-ONLY: re-marca steps[0] de quem foi
       arquivado por transição mas cujo card voltou pra agvid/
       presencial (ex.: movido de volta por outro dispositivo). Este
       reconcile NUNCA arquiva — só restaura. */
    setTimeout(function () {
      try {
        if (!global.S || !global.S.userId) return;
        if (typeof global.getCliLocal !== 'function' ||
            typeof global.getKBFor    !== 'function' ||
            typeof global.saveCli     !== 'function') return;
        var uid  = global.S.userId;
        var clis = global.getCliLocal(uid) || [];
        var negs = global.getKBFor('negocios', uid) || [];
        var byCardId = {}, byLeadId = {};
        negs.forEach(function (n) {
          if (!n) return;
          if (n.id) byCardId[n.id] = n;
          if (n.originalLeadId) byLeadId[n.originalLeadId] = n;
        });
        var changed = false;
        clis.forEach(function (c) {
          if (!c || !c.bingoArchivedAt) return;            // só quem foi arquivado por transição
          if (!Array.isArray(c.steps) || c.steps[0]) return; // já está ativo
          var neg = (c.sourceCardId && byCardId[c.sourceCardId]) ||
                    (c.sourceOriginalLeadId && byLeadId[c.sourceOriginalLeadId]);
          if (!neg) return;
          if (OPERATIONAL[neg.col]) {
            // Card voltou pra coluna operacional: restaura o Bingo.
            c.steps[0] = true;
            if (Array.isArray(c.stepDates)) c.stepDates[0] = _nowIso();
            c.bingoArchivedAt = null;
            c.bingoArchivedFromCol = null;
            changed = true;
          }
        });
        if (changed) {
          global.saveCli(uid, clis);
          if (typeof global.renderDash === 'function') {
            try { global.renderDash(); } catch (_e) {}
          }
          try { console.info('[lf-bingo-strict] reconcile restore-only: clientes reativados por retorno a agvid/presencial'); } catch (_e) {}
        }
      } catch (_e) {}
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _install);
  } else {
    _install();
  }
})(window);
