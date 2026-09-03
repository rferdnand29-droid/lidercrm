/* =====================================================================
 * lf-fix-cards-missing-own-board-v2-20260903.js
 * ---------------------------------------------------------------------
 * patch-id: lf-fix-cards-missing-own-board-v2-20260903
 *
 * SINTOMA (reportado 2026-09-03, DEPOIS do deploy que já incluía o
 * v1-20260901): "Agendados" do Bingo continuam sem o Negócio
 * correspondente aparecendo no quadro, mesmo com o fix anterior já
 * no ar.
 *
 * CAUSA RAIZ DA LACUNA NO v1: o v1 só verifica card faltando
 * DENTRO do wrapper de `renderKBLocal` — ou seja, só roda quando essa
 * função é efetivamente chamada. Se o PRIMEIRO render do quadro de
 * Negócios acontecer ANTES dos dados do Bingo terminarem de carregar
 * (corrida bem plausível no boot — Bingo e Kanban carregam de fontes
 * separadas), a checagem roda "cedo demais", não encontra nenhuma
 * referência do Bingo ainda (porque o Bingo em si ainda está vazio
 * localmente) e conclui erroneamente que não falta nada. Como depois
 * disso pode não haver NENHUM outro `renderKBLocal('negocios')`
 * durante a sessão (a pessoa só olha o quadro uma vez, ou o
 * sync de 15s só re-renderiza quando detecta mudança — e aqui não
 * detecta nenhuma, já que o problema é justamente a ausência), a
 * checagem nunca mais roda de novo sozinha.
 *
 * CORREÇÃO (aditiva, não mexe no v1): adiciona uma verificação
 * PERIÓDICA PRÓPRIA (independente de qualquer render acontecer) e uma
 * função utilitária pra forçar a checagem na hora — cobre tanto quem
 * já tem o problema agora (roda sozinho a cada 20s, e também um
 * pouco depois do boot) quanto serve de ferramenta de diagnóstico
 * manual (`window.lfFixMissingCardsNow()` no console).
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixCardsMissingOwnBoardV2) return;
  global.__lfFixCardsMissingOwnBoardV2 = true;

  var TAG = '[lf-fix-cards-missing-own-board-v2]';
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

  function _rehydrate(board, uid, force) {
    if (!uid) return Promise.resolve(false);
    var wc = _wc(); if (!wc || typeof wc.kanbanList !== 'function') return Promise.resolve(false);
    var key = board + '|' + uid;
    var now = Date.now();
    if (!force && _inflight[key] && (now - _inflight[key]) < MIN_INTERVAL_MS) return Promise.resolve(false);

    var missing = _missingIds(board, uid);
    if (!missing.length) return Promise.resolve(false);

    _inflight[key] = now;
    _log('checagem periódica: cache de ' + board + ' está sem ' + missing.length + ' card(s) referenciado(s) pelo Bingo — reidratando');
    return Promise.resolve(wc.kanbanList(board, uid)).then(function (doc) {
      var server = (doc && doc.list) || [];
      var local = _localList(board, uid);
      if (!server.length && local.length) {
        _warn('server vazio mas local tem ' + local.length + ' cards — mantendo local');
        return false;
      }
      var merged = (typeof global._mergeKeepLocalOnly === 'function')
        ? global._mergeKeepLocalOnly(server, local, board, uid)
        : (server.length ? server : local);
      if (!Array.isArray(merged)) return false;
      try {
        if (typeof global.ss === 'function' && typeof global.kbKeyFor === 'function') {
          global.ss(global.kbKeyFor(board, uid), merged);
        }
      } catch (_e) {}
      _log('reidratado ' + board + ' — ' + merged.length + ' card(s) no total');
      try { if (typeof global.renderKBLocal === 'function') global.renderKBLocal(board); } catch (_e) {}
      return true;
    }).catch(function (err) {
      _warn('reidratação periódica falhou', err);
      return false;
    });
  }

  // Checagem periódica própria — não depende de renderKBLocal ser
  // chamado. Roda a cada 20s (deslocado do poll de 15s do Kanban pra
  // não competir), só quando a aba está visível e há sessão ativa.
  function _tick() {
    try {
      if (document.hidden) return;
      var uid = _me(); if (!uid) return;
      _rehydrate('leads', uid, false);
      _rehydrate('negocios', uid, false);
    } catch (_e) {}
  }
  if (!global.__lfCardsMissingPollInstalled) {
    global.__lfCardsMissingPollInstalled = true;
    setInterval(_tick, 20000);
    // Primeira checagem um pouco depois do boot — dá tempo do Bingo
    // carregar antes da primeira tentativa (raiz da lacuna do v1).
    setTimeout(_tick, 6000);
  }

  // Ferramenta manual — força a checagem AGORA, ignorando o
  // intervalo mínimo entre tentativas. Útil pra conferir/corrigir na
  // hora sem esperar o próximo ciclo automático.
  global.lfFixMissingCardsNow = function () {
    var uid = _me();
    if (!uid) { console.warn(TAG, 'sem sessão ativa'); return; }
    try { if (typeof global.toast === 'function') global.toast('Verificando cards ausentes...'); } catch (_e) {}
    console.info(TAG, 'forçando verificação agora para', uid, '...');
    Promise.all([
      _rehydrate('leads', uid, true),
      _rehydrate('negocios', uid, true)
    ]).then(function (results) {
      console.info(TAG, 'concluído — leads reidratado:', results[0], '| negócios reidratado:', results[1]);
      try {
        if (typeof global.toast === 'function') {
          var achou = results[0] || results[1];
          global.toast(achou ? '✅ Card(s) recuperado(s)! A tela foi atualizada.' : 'Tudo certo — nenhum card ausente encontrado.');
        }
      } catch (_e) {}
    });
  };

  _log('v2-20260903 ativo — checagem periódica própria + window.lfFixMissingCardsNow() disponível no console');
})(window);
