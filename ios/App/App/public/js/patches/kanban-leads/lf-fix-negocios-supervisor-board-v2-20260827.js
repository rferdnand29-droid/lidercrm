/* =====================================================================
 * lf-fix-negocios-supervisor-board-v2-20260827.js
 * ---------------------------------------------------------------------
 * patch-id: lf-fix-negocios-supervisor-board-v2-20260827
 *
 * SINTOMA (reportado 2026-08-27, PERSISTE após o v1-20260826):
 *   Negócios do supervisor continuam sumindo do quadro (aparecem no
 *   Bingo normalmente) mesmo com o patch v1 já ativo.
 *
 * CAUSA RAIZ DA LACUNA NO v1:
 *   O v1 (lf-fix-negocios-supervisor-board-v1-20260826.js) só dispara
 *   reidratação quando o cache local está TOTALMENTE VAZIO
 *   (`if (local.length > 0) return;`, linha ~123 daquele arquivo).
 *
 *   Mas o próprio relatório do v1 já apontava que a causa da perda é
 *   uma transferência otimista que falha e remove APENAS UM card da
 *   origem local, sem apagar os demais — ou seja, o cenário real mais
 *   comum é cache PARCIAL (ex.: 3 de 5 negócios), não cache vazio.
 *   Nesse caso `local.length` é 3 (> 0), o v1 nunca dispara, e os 2
 *   negócios que sumiram continuam sumidos indefinidamente — mesmo
 *   com o Bingo provando que eles existem no servidor.
 *
 * CORREÇÃO (aditiva, não mexe no v1, não duplica lógica dele):
 *   Em vez de "local vazio?", compara CONJUNTOS: todo negócio que o
 *   Bingo referencia (`sourceBoard==='negocios'` + `sourceCardId`,
 *   gravado por syncNegocioToBingo em lf-bingo-sync-v1-20260722.js)
 *   DEVE ter um card com o MESMO id no cache local do board. Qualquer
 *   sourceCardId "órfão" (existe no Bingo, não existe no local) é
 *   evidência de perda PARCIAL — dispara reidratação mesmo com
 *   local.length > 0. Cobre o caso vazio também (superset do v1), mas
 *   o v1 continua ativo e intacto — coexistência inofensiva (o pior
 *   caso é 2 fetches em vez de 1 na primeira pintura de um board
 *   totalmente vazio, ambos convergindo pro mesmo resultado correto).
 *
 * ESCOPO: só supervisor não-admin, boards 'negocios' e 'leads' (mesma
 * simetria do v1). Consultor comum e ADM inalterados.
 *
 * GARANTIAS:
 *   - Idempotente (guard __lfFixNegSupBoardV2).
 *   - Reaproveita _mergeKeepLocalOnly (já global) — mesma política de
 *     merge server-first com proteção "servidor vazio não apaga local".
 *   - Nunca sobrescreve o v1; os dois convivem.
 *   - Reversível: remover a tag <script> + bump de cache.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixNegSupBoardV2) return;
  global.__lfFixNegSupBoardV2 = true;

  var TAG = '[lf-fix-negocios-supervisor-board-v2]';
  function _log() { try { console.debug.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function _warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }

  function _isSupervisor() {
    try {
      return (typeof global.hasSupervisorAccess === 'function' && global.hasSupervisorAccess()) &&
             !(typeof global.hasAdminAccess === 'function' && global.hasAdminAccess());
    } catch (_e) { return false; }
  }
  function _me() { try { return (global.S && global.S.userId) || null; } catch (_e) { return null; } }
  function _wc() { try { return (typeof global._kbWorkerClient === 'function') ? global._kbWorkerClient() : null; } catch (_e) { return null; } }
  function _localList(board, uid) {
    try { return (typeof global.getKBFor === 'function') ? (global.getKBFor(board, uid) || []) : []; } catch (_e) { return []; }
  }

  // Todo sourceCardId (negócios) ou sourceOriginalLeadId (leads) que o
  // Bingo desse uid referencia — é o conjunto de ids que DEVERIAM
  // existir no cache local do board correspondente.
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

  // Ids do Bingo que NÃO têm card correspondente no cache local —
  // evidência direta de perda (total OU parcial).
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
    var me = _me(); if (!me || !uid) return;
    var wc = _wc(); if (!wc || typeof wc.kanbanList !== 'function') return;
    var key = board + '|' + uid;
    var now = Date.now();
    if (_inflight[key] && (now - _inflight[key]) < MIN_INTERVAL_MS) return;

    var missing = _missingIds(board, uid);
    if (!missing.length) return; // nada faltando, nada a fazer

    _inflight[key] = now;
    _log('cache local de ' + uid + ' está sem ' + missing.length + ' card(s) que o Bingo referencia — reidratando ' + board);
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
      _log('reidratado ' + board + ' de ' + uid + ' — ' + merged.length + ' card(s) no total');
      try { if (typeof global.renderKBLocal === 'function') global.renderKBLocal(board); } catch (_e) {}
    }).catch(function (err) {
      _warn('reidratação (v2) falhou para ' + uid, err);
    });
  }

  function _wrapRenderKBLocal() {
    if (typeof global.renderKBLocal !== 'function') return setTimeout(_wrapRenderKBLocal, 250);
    if (global.renderKBLocal.__lfNegSupBoardV2Wrapped) return;
    var orig = global.renderKBLocal;
    global.renderKBLocal = function (board) {
      var out = orig.apply(this, arguments);
      try {
        if (_isSupervisor() && (board === 'negocios' || board === 'leads')) {
          var selected = (global._kbViewUid && global._kbViewUid[board]) || _me();
          var targets = [];
          if (selected) {
            targets = [selected];
          } else {
            try {
              if (typeof global.getDepartmentVisibleUsers === 'function') {
                (global.getDepartmentVisibleUsers(_me()) || []).forEach(function (u) { if (u && u.id) targets.push(u.id); });
              }
            } catch (_e) {}
            if (targets.indexOf(_me()) < 0) targets.push(_me());
          }
          targets.forEach(function (uid) { _rehydrate(board, uid); });
        }
      } catch (_e) {}
      return out;
    };
    global.renderKBLocal.__lfNegSupBoardV2Wrapped = true;
    _log('renderKBLocal envelopado (v2) — reidratação de card PARCIALMENTE ausente ativa');
  }

  function _install() {
    _wrapRenderKBLocal();
    _log('v2-20260827 ativo — cobre perda parcial (v1 cobria só cache totalmente vazio)');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _install);
  else _install();
})(window);
