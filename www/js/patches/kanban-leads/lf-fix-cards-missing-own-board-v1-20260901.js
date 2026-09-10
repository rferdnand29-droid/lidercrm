/* =====================================================================
 * lf-fix-cards-missing-own-board-v1-20260901.js
 * ---------------------------------------------------------------------
 * patch-id: lf-fix-cards-missing-own-board-v1-20260901
 *
 * SINTOMA (reportado 2026-09-01, com prints comparando Bingo x
 * Negócios): clientes com etapa "Ag" (Agendado) marcada no Bingo
 * (ex.: Nando, Léo, Vanicleia, Ana Caroline) não aparecem em NENHUMA
 * coluna do quadro de Negócios — mesmo o Bingo provando, pela flag
 * de etapa, que o negócio existe. Outros clientes (ex.: Katia, Paulo)
 * aparecem certinho nos dois lugares. "Erro gravíssimo" — dados
 * reais somem da visão principal do usuário.
 *
 * CAUSA RAIZ — MESMO mecanismo já diagnosticado e corrigido em
 * lf-fix-negocios-supervisor-board-v1-20260826.js e
 * v2-20260827.js (ver relatórios), só que restrito demais:
 *
 *   var _isSupervisor = ... hasSupervisorAccess() && !hasAdminAccess();
 *   if (_isSupervisor() && (board==='negocios'||board==='leads')) { ... }
 *
 *   Essa condição (`_isSupervisor()`) bloqueia a reidratação pra
 *   QUALQUER PESSOA QUE NÃO SEJA SUPERVISOR — inclusive pra olhar o
 *   PRÓPRIO board. Um consultor comum (nem supervisor, nem admin)
 *   fica com ZERO proteção contra o mesmo problema de origem: uma
 *   transferência otimista (assumir lead, mesclagem trocando dono,
 *   conversão) que pinta o card local e falha no PUT remoto, deixando
 *   o cache local do PRÓPRIO usuário faltando card(s) que o Bingo já
 *   sincronizou.
 *
 * CORREÇÃO (aditiva, não mexe nos patches v1/v2, não duplica a lógica
 * deles pra supervisor — só fecha a lacuna pro caso "seu próprio
 * board", que faltava pra QUALQUER papel):
 *   Mesma técnica do v2 — compara os `sourceCardId`/
 *   `sourceOriginalLeadId` que o Bingo do usuário logado referencia
 *   contra os ids que existem de fato no cache local do board — sem
 *   nenhuma condição de papel/cargo. Se sobrar algum id "órfão"
 *   (existe no Bingo, não existe no local), busca a lista completa no
 *   servidor e mescla de volta, com a mesma proteção "servidor vazio
 *   nunca apaga local não-vazio".
 *
 * ESCOPO: sempre o board do PRÓPRIO usuário logado (nunca de outro
 * usuário) — não precisa e não faz nenhuma checagem de cargo, porque
 * "reidratar o meu próprio board com o que o servidor realmente tem"
 * é seguro pra qualquer pessoa. Convive sem conflito com v1/v2 (que
 * seguem cobrindo o caso adicional de supervisor olhando o time).
 *
 * GARANTIAS:
 *   - Idempotente (guard global.__lfFixCardsMissingOwnBoardV1).
 *   - Reaproveita _mergeKeepLocalOnly (já global).
 *   - Nunca mexe nos patches v1/v2 — convivência, não substituição.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixCardsMissingOwnBoardV1) return;
  global.__lfFixCardsMissingOwnBoardV1 = true;

  var TAG = '[lf-fix-cards-missing-own-board-v1]';
  function _log() { try { console.debug.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function _warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }

  function _me() { try { return (global.S && global.S.userId) || null; } catch (_e) { return null; } }
  function _wc() { try { return (typeof global._kbWorkerClient === 'function') ? global._kbWorkerClient() : null; } catch (_e) { return null; } }
  function _localList(board, uid) {
    try { return (typeof global.getKBFor === 'function') ? (global.getKBFor(board, uid) || []) : []; } catch (_e) { return []; }
  }

  function _bingoReferencedIds(board, uid) {
    var ids = [];
    try {
      if (typeof global.getCliLocal !== 'function') return ids;
      var list = global.getCliLocal(uid) || [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i]; if (!c) continue;
        if (board === 'negocios' && c.sourceBoard === 'negocios' && c.sourceCardId) ids.push(c.sourceCardId);
        if (board === 'leads' && c.sourceOriginalLeadId) ids.push(c.sourceOriginalLeadId);
      }
    } catch (_e) {}
    return ids;
  }

  function _missingIds(board, uid) {
    var refs = _bingoReferencedIds(board, uid);
    if (!refs.length) return [];
    var local = _localList(board, uid);
    var localSet = {};
    for (var i = 0; i < local.length; i++) { if (local[i] && local[i].id) localSet[local[i].id] = true; }
    var missing = [];
    for (var j = 0; j < refs.length; j++) { if (!localSet[refs[j]]) missing.push(refs[j]); }
    return missing;
  }

  var _inflight = {};
  var MIN_INTERVAL_MS = 8000;

  function _rehydrate(board, uid) {
    if (!uid) return;
    var wc = _wc(); if (!wc || typeof wc.kanbanList !== 'function') return;
    var key = board + '|' + uid;
    var now = Date.now();
    if (_inflight[key] && (now - _inflight[key]) < MIN_INTERVAL_MS) return;

    var missing = _missingIds(board, uid);
    if (!missing.length) return;

    _inflight[key] = now;
    _log('cache local (próprio board) está sem ' + missing.length + ' card(s) que o Bingo referencia — reidratando ' + board);
    Promise.resolve(wc.kanbanList(board, uid)).then(function (doc) {
      var server = (doc && doc.list) || [];
      var local = _localList(board, uid);
      if (!server.length && local.length) {
        _warn('server vazio mas local tem ' + local.length + ' cards — mantendo local, tenta de novo depois');
        return;
      }
      var merged = (typeof global._mergeKeepLocalOnly === 'function')
        ? global._mergeKeepLocalOnly(server, local, board, uid)
        : (server.length ? server : local);
      if (!Array.isArray(merged)) return;
      try {
        if (typeof global.ss === 'function' && typeof global.kbKeyFor === 'function') {
          global.ss(global.kbKeyFor(board, uid), merged);
        }
      } catch (_e) {}
      _log('reidratado ' + board + ' — ' + merged.length + ' card(s) no total');
      try { if (typeof global.renderKBLocal === 'function') global.renderKBLocal(board); } catch (_e) {}
    }).catch(function (err) {
      _warn('reidratação (próprio board) falhou', err);
    });
  }

  function _wrapRenderKBLocal() {
    if (typeof global.renderKBLocal !== 'function') return setTimeout(_wrapRenderKBLocal, 250);
    if (global.renderKBLocal.__lfCardsMissingOwnBoardV1Wrapped) return;
    var orig = global.renderKBLocal;
    global.renderKBLocal = function (board) {
      var out = orig.apply(this, arguments);
      try {
        if (board === 'negocios' || board === 'leads') {
          // Sempre o PRÓPRIO board — sem checagem de cargo, sem depender
          // de _kbViewUid (que só existe pra quem tem visão de time).
          _rehydrate(board, _me());
        }
      } catch (_e) {}
      return out;
    };
    global.renderKBLocal.__lfCardsMissingOwnBoardV1Wrapped = true;
    _log('renderKBLocal envelopado — reidratação do PRÓPRIO board ativa pra qualquer papel');
  }

  function _install() {
    _wrapRenderKBLocal();
    _log('v1-20260901 ativo — fecha a lacuna que v1/v2 (só supervisor) deixavam pro board do próprio usuário comum');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _install);
  else _install();
})(window);
