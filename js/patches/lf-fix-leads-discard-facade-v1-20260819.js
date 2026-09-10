/* lf-fix-leads-discard-facade-v1-20260819
   ============================================================
   RECOMENDAÇÃO E + BUG #5 — DESCARTE = EVENTO UNIFICADO

   Cria LF.leads.discard(leadId, motivo, opts): UMA fachada que
   executa os 5 passos do descarte em transação local (mesmo lote
   de saveKBFor), eliminando a divergência "lead descartado →
   atividades continuam abertas / Negócio vinculado fica pra trás /
   card embutido dessincronizado".

   Passos da fachada (na ordem):
     (1) Kanban: marca o card (discarded/discardedAt/col/motivo),
         empilha _pushHistorico e acumula o array pra gravar no
         MESMO saveKBFor do final.
     (2) Atividades: fecha TODAS as atividades abertas do lead
         (done=true, doneAt, doneReason='lead_discarded',
         _pending=true) com estampa Lamport (se o patch multiaba
         v1 estiver presente) e grava via saveActivities /
         lfSaveActivitiesFor conforme o dono.
     (3) Card embutido: espelha o fechamento em c.activities[]
         (a cópia que viaja dentro do card do kanban).
     (4) Negócio vinculado: quando o descarte é de um Lead, espelha
         em todos os cards de 'negocios' com originalLeadId ===
         leadId (discarded + col 'noshow' + histórico).
     (5) Feed: logFeedEvent('discard', ...) uma única vez por card.

   Uso direto (console/testes):
     LF.leads.discard('lead_123', 'sem_budget', { detalhe:'sem verba' });

   O confirmDiscard (js/kanban.js) passa a DELEGAR pra esta fachada —
   o modal/toast continuam lá, a mutação de dados fica toda aqui.

   Seguro: flag __LF_DISCARD_FACADE_V1__ evita dupla instalação;
   tudo envolto em try/catch pra nunca derrubar o fluxo antigo.
   ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.__LF_DISCARD_FACADE_V1__) return;
  window.__LF_DISCARD_FACADE_V1__ = true;

  var TAG = '[lf-discard-facade-v1]';

  /* ---------- utilitários internos ---------- */

  function _nowIso() { return new Date().toISOString(); }

  function _getKB(board, uid) {
    try {
      if (typeof window.getKBFor === 'function') return window.getKBFor(board, uid) || [];
    } catch (_e) {}
    return [];
  }

  /* Carimbo Lamport reutilizando o patch multiaba quando presente —
     garante que o "done" desta mutação vença merges com versões
     antigas do servidor (raiz do bug #4). */
  function _stampAct(a, uid) {
    try {
      if (window.LF && window.LF.activities && window.LF.activities.lamport &&
          typeof window.LF.activities.lamport.stamp === 'function') {
        window.LF.activities.lamport.stamp(a, uid);
        return;
      }
    } catch (_e) {}
    // Fallback sem o patch multiaba: marca temporal simples.
    a.lf_updatedAt = _nowIso();
  }

  function _loadActsFor(uid) {
    try {
      if (typeof window.getActivitiesLocalFor === 'function') return window.getActivitiesLocalFor(uid) || [];
      if (window.S && window.S.userId === uid && typeof window.getActivities === 'function') return window.getActivities() || [];
    } catch (_e) {}
    return null;
  }

  function _saveActsFor(uid, acts) {
    try {
      if (window.S && window.S.userId === uid && typeof window.saveActivities === 'function') {
        window.saveActivities(acts);
        return true;
      }
      if (typeof window.lfSaveActivitiesFor === 'function') {
        window.lfSaveActivitiesFor(uid, acts);
        return true;
      }
    } catch (_e) {}
    return false;
  }

  function _reasonLabel(motivo) {
    try {
      if (typeof window._kbUnifiedReasonLabel === 'function') return window._kbUnifiedReasonLabel(motivo);
    } catch (_e) {}
    return String(motivo || '');
  }

  /* ============================================================
     A FACHADA
     leadId : id do card no board de origem
     motivo : chave do motivo (ex.: 'sem_budget') ou texto livre
     opts   : {
       board     : 'leads' | 'negocios'   (default 'leads')
       ownerUid  : dono do board          (default activeUID(board))
       targetCol : coluna destino         (default 'noshow' p/ negocios, 'desc' p/ leads)
       detalhe   : complemento digitado no "Outro"
       skipFeed  : true p/ não logar (uso em lote interno)
     }
     Retorna: { ok, leadId, board, actsClosed, linkedNegChanged, reasonText }
     ============================================================ */
  function discardLead(leadId, motivo, opts) {
    opts = opts || {};
    var res = { ok: false, leadId: leadId, board: null, actsClosed: 0, linkedNegChanged: false, reasonText: '' };
    if (!leadId) { res.error = 'missing_lead_id'; return res; }

    var board = opts.board || 'leads';
    var uid = opts.ownerUid || (typeof window.activeUID === 'function' ? window.activeUID(board) : (window.S && window.S.userId));
    if (!uid) { res.error = 'missing_owner_uid'; return res; }

    var ts = _nowIso();
    var motivoLabel = _reasonLabel(motivo);
    var reasonText = motivoLabel + (opts.detalhe ? ' - ' + opts.detalhe : '');
    var targetCol = opts.targetCol || (board === 'negocios' ? 'noshow' : 'desc');

    res.board = board;
    res.reasonText = reasonText;

    /* ---- (1) KANBAN: marca o card de origem ---- */
    var arr = _getKB(board, uid);
    var c = null;
    for (var i = 0; i < arr.length; i++) { if (arr[i] && arr[i].id === leadId) { c = arr[i]; break; } }
    if (!c) { res.error = 'card_not_found'; return res; }

    c.discarded = true;
    c.discardedAt = ts;
    c.discardMotivo = motivo;
    c.discardMotivoLabel = reasonText;
    c.col = targetCol;
    c.updatedAt = ts;
    try { if (typeof window._pushHistorico === 'function') window._pushHistorico(c, 'Descartado: ' + reasonText); } catch (_e) {}

    /* ---- (3) CARD EMBUTIDO: espelha em c.activities[] ---- */
    try {
      if (Array.isArray(c.activities)) {
        c.activities.forEach(function (x) {
          if (x && !x.done) {
            x.done = true;
            x.doneAt = ts;
            x.doneReason = 'lead_discarded';
          }
        });
      }
    } catch (_e) {}

    /* ---- (4) NEGÓCIO VINCULADO: espelha quando descarte é de Lead ---- */
    var negArr = null;
    var negChanged = false;
    if (board === 'leads') {
      try {
        negArr = _getKB('negocios', uid);
        negArr.forEach(function (n) {
          if (n && n.originalLeadId === leadId) {
            n.discarded = true;
            n.discardedAt = ts;
            n.discardMotivo = motivo;
            n.discardMotivoLabel = reasonText;
            n.col = 'noshow';
            n.updatedAt = ts;
            try { if (typeof window._pushHistorico === 'function') window._pushHistorico(n, 'Descartado: ' + reasonText + ' (vinculado ao Lead descartado)'); } catch (_e) {}
            // Atividades embutidas do Negócio também fecham:
            if (Array.isArray(n.activities)) {
              n.activities.forEach(function (x) {
                if (x && !x.done) { x.done = true; x.doneAt = ts; x.doneReason = 'lead_discarded'; }
              });
            }
            negChanged = true;
          }
        });
      } catch (_e) {}
    }
    res.linkedNegChanged = negChanged;

    /* ---- TRANSAÇÃO LOCAL: um saveKBFor por board afetado ---- */
    var okKB = true;
    try { if (typeof window.saveKBFor === 'function') { if (!window.saveKBFor(board, uid, arr)) okKB = false; } } catch (_e) { okKB = false; }
    if (negChanged && negArr) {
      try { if (typeof window.saveKBFor === 'function') { if (!window.saveKBFor('negocios', uid, negArr)) okKB = false; } } catch (_e) { okKB = false; }
    }

    /* ---- (2) ATIVIDADES: fecha todas as abertas do lead ---- */
    try {
      var acts = _loadActsFor(uid);
      if (Array.isArray(acts)) {
        var mutated = false;
        acts.forEach(function (a) {
          if (!a || a.done) return;
          if (a.clientId === leadId || a.cardId === leadId || a.leadId === leadId) {
            a.done = true;
            a.doneAt = ts;
            a.doneReason = 'lead_discarded';
            a._pending = true;
            a._doneLocalAt = Date.now(); // trava o alarme do checkUpcomingActs (bug #3)
            _stampAct(a, uid);           // Lamport: vence merge com servidor (bug #4)
            mutated = true;
            res.actsClosed++;
          }
        });
        // Cards de Negócio vinculados também podem ter atividade própria:
        if (negChanged && negArr) {
          var negIds = {};
          negArr.forEach(function (n) { if (n && n.originalLeadId === leadId && n.id) negIds[n.id] = true; });
          acts.forEach(function (a) {
            if (!a || a.done) return;
            if (a.clientId && negIds[a.clientId]) {
              a.done = true;
              a.doneAt = ts;
              a.doneReason = 'lead_discarded';
              a._pending = true;
              a._doneLocalAt = Date.now();
              _stampAct(a, uid);
              mutated = true;
              res.actsClosed++;
            }
          });
        }
        if (mutated) _saveActsFor(uid, acts);
      }
    } catch (_e) {}

    /* ---- (5) FEED: um log por descarte ---- */
    if (!opts.skipFeed) {
      try {
        if (window.S && window.S.userId && typeof window.logFeedEvent === 'function') {
          window.logFeedEvent('discard', window.S.userId, c.name || leadId, reasonText, board);
        }
      } catch (_e) {}
    }

    res.ok = okKB;
    try { console.debug(TAG, 'descarte unificado:', leadId, '| atividades fechadas:', res.actsClosed, '| negócio espelhado:', negChanged); } catch (_e) {}
    return res;
  }

  /* ---------- expõe a API ---------- */
  window.LF = window.LF || {};
  window.LF.leads = window.LF.leads || {};
  window.LF.leads.discard = discardLead;

  /* ---------- re-render helper p/ quem chama fora do kanban ---------- */
  window.LF.leads.discardAndRender = function (leadId, motivo, opts) {
    var r = discardLead(leadId, motivo, opts);
    try {
      var boards = { leads: true };
      if (r.linkedNegChanged || (opts && opts.board === 'negocios')) boards.negocios = true;
      if (opts && opts.board) boards[opts.board] = true;
      var _scrollSnap = (typeof window._kbCaptureScrollSnapshot === 'function') ? window._kbCaptureScrollSnapshot() : null;
      Object.keys(boards).forEach(function (b) {
        if (typeof window.renderKBLocal === 'function') { try { window.renderKBLocal(b); } catch (_e) {} }
      });
      if (_scrollSnap && typeof window._kbScheduleScrollRestore === 'function') window._kbScheduleScrollRestore(_scrollSnap);
      if (boards.leads && typeof window._lfRefreshLivrePoolFromServer === 'function') window._lfRefreshLivrePoolFromServer(true);
      if (typeof window.renderActPanel === 'function') { try { window.renderActPanel(); } catch (_e) {} }
      if (typeof window.updateActBadge === 'function') { try { window.updateActBadge(); } catch (_e) {} }
      if (typeof window.renderDash === 'function') { try { window.renderDash(); } catch (_e) {} }
    } catch (_e) {}
    return r;
  };

  try { console.info(TAG, 'instalado — LF.leads.discard / discardAndRender disponíveis'); } catch (_e) {}
})();
