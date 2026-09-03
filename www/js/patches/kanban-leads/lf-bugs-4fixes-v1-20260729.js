/* =====================================================================
 * lf-bugs-4fixes-v1-20260729.js
 * ---------------------------------------------------------------------
 * Patch aditivo — 4 bugs em produção (29/07/2026):
 *   #1 Bingo recebe leads do supervisor / não é possível excluí-los
 *   #2a UI sem mover ↑↓ de card dentro da mesma coluna
 *   #2b Mover card entre etapas reseta "rolante" (scrollTop) da coluna
 *   #3  Usuário excluído (ex.: Maria) volta a cada update do bundle
 *
 * REGRAS
 *   - NÃO reescreve nenhum código existente. Idempotente. Reversível
 *     removendo apenas este <script> do HTML.
 *   - Depende de: syncNegocioToBingo, getCliLocal, saveCli, confirmDC,
 *                 _kbMoveCard, getKBFor, loadUsersDB / getUsers.
 *   - Deve ser carregado DEPOIS de:
 *       lf-bingo-sync-v1-20260722.js
 *       lf-bingo-strict-source-v1-20260729.js
 *       lf-users-persist-cloudfirst-v1-20260728.js
 *       lf-post-update-recovery-v1-20260729.js
 *
 * DESCARTA-LIXO EMBUTIDO
 *   - reaproveita marca global (__LF_BUGS_4FIXES_V1_20260729) para
 *     evitar dupla instalação se o HTML por engano incluir 2x.
 *   - todos os wrappers marcam a função com sentinel (__lf4x*) —
 *     re-entrada não empilha wrappers.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (!global || !global.document) return;
  if (global.__LF_BUGS_4FIXES_V1_20260729) return;
  global.__LF_BUGS_4FIXES_V1_20260729 = true;

  var TAG = '[lf-bugs-4fixes]';
  function _log(){ try { if(global.console&&console.log) console.log.apply(console,[TAG].concat([].slice.call(arguments))); } catch(_e){} }
  function _warn(){ try { if(global.console&&console.warn) console.warn.apply(console,[TAG].concat([].slice.call(arguments))); } catch(_e){} }

  /* ── BUG #1 — Bingo: ingress guard + delete propagation ───────────── */
  function _installBug1_BingoIngressGuard() {
    var api  = (global.LiderCRM && global.LiderCRM.bingoSync) || {};
    var orig = api.syncNegocioToBingo || global.syncNegocioToBingo;
    if (!orig || orig.__lf4xBingoGuard) return;
    if (typeof global.getCliLocal !== 'function') return;

    function _ownerUid(card){ return (card && (card.sourceOwnerUid || card.userId)) || null; }

    var wrapped = function (card, ownerUid, newCol) {
      try {
        var uid = ownerUid || (card && card.userId) || (global.S && global.S.userId);
        var src = _ownerUid(card);
        if (src && uid && src !== uid) {
          try {
            if (!global.__lfBingoGuardLogged) {
              global.__lfBingoGuardLogged = true;
              _log('bloqueado: card de', src, 'não entra no bingo de', uid);
            }
          } catch(_e){}
          return null;
        }
        return orig.apply(this, arguments);
      } catch (e) { _warn('bug1 ingress', e); return null; }
    };
    wrapped.__lf4xBingoGuard = true;
    if (orig.__lfStrictWrapped)   wrapped.__lfStrictWrapped   = true;
    if (orig.__lfBingoSyncMarker) wrapped.__lfBingoSyncMarker = true;

    if (api.syncNegocioToBingo) api.syncNegocioToBingo = wrapped;
    global.syncNegocioToBingo = wrapped;
    _log('bug1: bingo ingress guard ativo');
  }

  function _installBug1_ConfirmDCPropagateDelete() {
    if (typeof global.confirmDC !== 'function') return;
    if (global.confirmDC.__lf4xConfirmDCWrapped) return;
    var orig = global.confirmDC;
    global.confirmDC = function () {
      var cid, uid, hit;
      try {
        cid = global._dcId;
        uid = (global.S && global.S.userId) || null;
        var beforeList = (typeof global.getCliLocal === 'function') ? (global.getCliLocal(uid) || []) : [];
        hit = null;
        for (var i = 0; i < beforeList.length; i++) {
          if (beforeList[i] && beforeList[i].id === cid) { hit = beforeList[i]; break; }
        }
      } catch(_e){}

      var ret = orig.apply(this, arguments);

      try {
        if (uid && cid) {
          var after = (typeof global.getCliLocal === 'function') ? (global.getCliLocal(uid) || []) : [];
          var stillThere = false;
          for (var j = 0; j < after.length; j++) if (after[j] && after[j].id === cid) { stillThere = true; break; }
          if (!stillThere && typeof global.saveCli === 'function') {
            global.saveCli(uid, after); // propaga DELETE ao Worker
            _log('bug1: DELETE propagado ao worker para cid=', cid);
          }
        }
      } catch (e) { _warn('bug1 confirmDC propagate', e); }
      return ret;
    };
    global.confirmDC.__lf4xConfirmDCWrapped = true;
  }

  /* ── BUG #2a — reorder helpers (move up/down) ─────────────────────── */
  function _installBug2_MoveHelpers() {
    if (typeof global._kbMoveCard !== 'function') return;
    if (typeof global.getKBFor !== 'function') return;

    function _locate(arr, id) {
      for (var i = 0; i < arr.length; i++) {
        var c = arr[i]; if (!c) continue;
        if ((c.id && c.id === id) || (c._id && c._id === id)) return i;
      }
      return -1;
    }
    function _move(id, board, uid, dir) {
      var arr = global.getKBFor(board, uid) || [];
      var idx = _locate(arr, id);
      if (idx < 0) return false;
      var col = arr[idx].col || arr[idx].etapa;
      if (!col) return false;
      var ni = (dir === 'down' || dir === -1) ? idx + 1 : idx - 1;
      if (ni < 0 || ni >= arr.length) return false;
      return !!global._kbMoveCard(id, board, uid, col, false, false, ni);
    }
    global.__lf4xMove = _move;
    _log('bug2a: window.__lf4xMove(cardId, board, uid, "up"|"down")');
  }

  /* ── BUG #2b — preservar scrollTop de coluna ao mover de etapa ───── */
  function _installBug2_ScrollPreserve() {
    if (typeof global._kbMoveCard !== 'function') return;
    if (global._kbMoveCard.__lf4xScrollWrapped) return;

    function _snapshotCols() {
      var snap = {};
      try {
        var nodes = document.querySelectorAll('.kb-cards, [data-col-id] .kb-cards');
        for (var i = 0; i < nodes.length; i++) {
          var el = nodes[i];
          var host = el.closest ? el.closest('[data-col-id]') : null;
          var col = host && host.dataset ? host.dataset.colId : (el.id || '').replace(/^col-/, '');
          if (col) snap[col] = el.scrollTop || 0;
        }
      } catch(_e){}
      return snap;
    }
    function _restoreCols(snap) {
      try {
        Object.keys(snap).forEach(function (col) {
          var el = document.querySelector('[data-col-id="' + col + '"] .kb-cards')
                || document.getElementById('col-' + col)
                || document.querySelector('.kb-col[data-col="' + col + '"] .kb-cards');
          if (el && snap[col] > 0 && el.scrollTop < 1) el.scrollTop = snap[col];
        });
      } catch(_e){}
    }

    var orig = global._kbMoveCard;
    var wrapped = function () {
      var pre = _snapshotCols();
      var ret;
      try { ret = orig.apply(this, arguments); }
      finally {
        // 3 tentativas em RAF/timers curtos (kanban.js redraws em RAF)
        setTimeout(function(){ _restoreCols(pre); }, 0);
        setTimeout(function(){ _restoreCols(pre); }, 32);
        setTimeout(function(){ _restoreCols(pre); }, 96);
      }
      return ret;
    };
    wrapped.__lf4xScrollWrapped = true;
    if (orig.__lfBingoSyncWrapped) wrapped.__lfBingoSyncWrapped = true;
    global._kbMoveCard = wrapped;
    _log('bug2b: scroll preservation ativo em _kbMoveCard');
  }

  /* ── BUG #3 — exclusão definitiva de usuário (vence rehydrate) ────── */
  var REMOVED_UIDS_KEY = 'lf4x_removed_uids_v1';

  function _bug3List() {
    try {
      var raw = global.localStorage.getItem(REMOVED_UIDS_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch(_e){ return []; }
  }
  function _bug3Remember(uid) {
    if (!uid) return;
    try {
      var arr = _bug3List();
      if (arr.indexOf(uid) < 0) {
        arr.push(uid);
        global.localStorage.setItem(REMOVED_UIDS_KEY, JSON.stringify(arr));
      }
    } catch(_e){}
  }

  function _installBug3_ExcludedAlwaysWins() {
    // 1) hook em loadUsersDB (cloud-first): filtra ao chegar da nuvem
    if (typeof global.loadUsersDB === 'function' && !global.loadUsersDB.__lf4xWrapped) {
      var orig = global.loadUsersDB;
      global.loadUsersDB = function (cb) {
        var wrappedCb = function (cloudList) {
          try {
            var removed = _bug3List();
            if (removed.length && Array.isArray(cloudList)) {
              cloudList = cloudList.filter(function (u) {
                return !u || removed.indexOf(u.id) < 0;
              });
            }
          } catch (e) { _warn('bug3 loadUsersDB', e); }
          if (typeof cb === 'function') cb(cloudList);
        };
        return orig.call(this, wrappedCb);
      };
      global.loadUsersDB.__lf4xWrapped = true;
    }
    // 2) hook em getUsers: filtra também na leitura local
    if (typeof global.getUsers === 'function' && !global.getUsers.__lf4xWrapped) {
      var origGet = global.getUsers;
      global.getUsers = function () {
        var arr = [];
        try { arr = origGet.call(this) || []; } catch(_e){}
        var rm = _bug3List();
        if (!rm.length || !arr.length) return arr;
        return arr.filter(function (u) { return !u || rm.indexOf(u.id) < 0; });
      };
      global.getUsers.__lf4xWrapped = true;
    }
    // 3) API pública para o ADM esquecer definitivamente
    global.__lf4xForgetUser = function (uid) {
      if (!uid) return;
      _bug3Remember(uid);
      try {
        if (typeof global.getUsers === 'function' && typeof global.ss === 'function') {
          var cur = [];
          try { cur = global.getUsers() || []; } catch(_e){}
          for (var i = 0; i < cur.length; i++) {
            if (cur[i] && cur[i].id === uid) cur[i].ativo = false;
          }
          global.ss('lf6_u', cur);
          if (typeof global.renderUsers === 'function') { try { global.renderUsers(); } catch(_e){} }
        }
      } catch(_e){}
      _log('bug3: usuário', uid, 'marcado como esquecido');
    };
    global.__lf4xListForgotten = _bug3List;
    global.__lf4xClearForgotten = function () {
      try { global.localStorage.removeItem(REMOVED_UIDS_KEY); } catch(_e){}
    };
  }

  /* ── boot ─────────────────────────────────────────────────────────── */
  function _deps() {
    return typeof global.syncNegocioToBingo === 'function'
        && typeof global.getCliLocal        === 'function'
        && typeof global.saveCli            === 'function'
        && typeof global._kbMoveCard        === 'function'
        && typeof global.getKBFor           === 'function'
        && typeof global.confirmDC          === 'function';
  }
  function _install() {
    if (!_deps()) return setTimeout(_install, 250);
    _installBug1_BingoIngressGuard();
    _installBug1_ConfirmDCPropagateDelete();
    _installBug2_MoveHelpers();
    _installBug2_ScrollPreserve();
    _installBug3_ExcludedAlwaysWins();
    _log('4 fixes instalados. Reversível: remover este <script>.');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _install, { once: true });
  } else {
    _install();
  }
})(window);
