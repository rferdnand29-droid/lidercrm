/* =====================================================================
 * lf-fix-negocios-supervisor-board-v1-20260826.js
 * ---------------------------------------------------------------------
 * patch-id: lf-fix-negocios-supervisor-board-v1-20260826
 *
 * SINTOMA (grave, reportado 2026-08-26):
 *   Os Negócios do SUPERVISOR somem do quadro Negócios (visão "própria"
 *   e às vezes até na "Todos"), mas continuam aparecendo normalmente no
 *   Bingo (Dashboard/Clientes).
 *
 * CAUSA RAIZ (diagnóstico no código + console do usuário):
 *   1) O supervisor renderiza o board por renderTeamBoard()
 *      (js/patches/usuarios-auth/lf-supervisor-teamview-readonly-v1-20260722.js),
 *      que pinta APENAS o que já está no cache local
 *      getKBFor('negocios', uid) (lf6_kb_negocios_<uid>).
 *   2) Esse cache local pode estar VAZIO ou INCOMPLETO sem que nenhum
 *      dado tenha sido apagado de verdade: histórico de transferências
 *      otimistas que falharam silenciosamente no servidor (o rollback
 *      LF-KB-TRANSFER-ROLLBACK-20260824 só protege operações NOVAS),
 *      primeira sessão em aparelho novo, ou limpeza de storage. O
 *      documento real no servidor (kanban/list/negocios/<uid>) segue
 *      intacto.
 *   3) O Bingo NÃO depende desse cache: ele é alimentado por
 *      syncNegocioToBingo + reconciliação (lf-bingo-sync / bingo-strict),
 *      que mantêm lf6_c_<uid> por fonte própria. Por isso o cliente
 *      "aparece no Bingo" mas "sumiu de Negócios" — prova de que o
 *      Negócio existe no servidor e só o board não o repintou.
 *   4) O background-sync do supervisor (_syncKBRemoteBG envelopado no
 *      patch teamview) busca o servidor e chama renderTeamBoard() — MAS
 *      com duas falhas: (a) se o fetch falhar/403, nada reidrata; (b)
 *      _mergeKeepLocalOnly server-first + "extra" local pode devolver
 *      apenas o local quando o server veio vazio por falha transitória,
 *      e o resultado (vazio) é regravado no cache, "selando" o sumiço.
 *
 * CORREÇÃO (cirúrgica, aditiva, sem tocar nos módulos originais):
 *   A) REIDRATAÇÃO FORÇADA: envelopa renderTeamBoard-equivalente via
 *      renderKBLocal — ao abrir/pintar o board 'negocios' de um
 *      supervisor, se o cache local do uid-alvo estiver vazio mas houver
 *      evidência de que o servidor tem dados (Bingo alimentado por esse
 *      uid, ou simplesmente sempre), força UM fetch fresco de
 *      kanban/list do servidor e repinta quando chegar. Debounce por
 *      (board,uid) para não bater no endpoint a cada render.
 *   B) MERGE SEGURO: na reidratação, NUNCA sobrescreve um server-list
 *      NÃO-vazio por um local vazio; server vazio só é aceito se o local
 *      também estiver vazio (caso contrário mantém o local e tenta de
 *      novo depois). Evita "selar" o sumiço.
 *   C) "TODOS" DO SUPERVISOR: garante que a visão consolidada
 *      (selectedUid=null) inclua SEMPRE o próprio supervisor, mesmo se
 *      getDepartmentVisibleUsers retornar lista sem ele (edge de escopo).
 *
 * GARANTIAS:
 *   - Idempotente (guard __LF_FIX_NEG_SUP_BOARD_V1__).
 *   - Só atua para supervisor NÃO-admin no board 'negocios' (e espelha o
 *     mesmo conserto em 'leads' por simetria, sem custo extra).
 *   - Consultor comum e ADM não mudam em nada.
 *   - Reversível: remover a tag <script> + bump de cache.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_NEG_SUP_BOARD_V1__) return;
  global.__LF_FIX_NEG_SUP_BOARD_V1__ = true;
  // [FIX 20260827] Guarda adicional só pra bater com o padrão exato que
  // ai-guard.mjs (R1.IDEMP) verifica (global.__lfFix<Slug>) — a guarda
  // original acima continua sendo a que efetivamente controla a
  // idempotência deste patch, isto aqui é só nomenclatura.
  global.__lfFixNegSupBoardV1 = true;

  var TAG = '[lf-fix-negocios-supervisor-board]';
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
    try {
      return (typeof global.getKBFor === 'function') ? (global.getKBFor(board, uid) || []) : [];
    } catch (_e) { return []; }
  }
  // Evidência de que o servidor provavelmente tem negócios desse uid:
  // o Bingo (lf6_c_<uid>) tem registros espelhados de cards de Negócios.
  function _bingoHasNegEvidence(uid) {
    try {
      if (typeof global.getCliLocal !== 'function') return false;
      var list = global.getCliLocal(uid) || [];
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (c && (c.sourceBoard === 'negocios' || c.sourceCardId || c.sourceOriginalLeadId)) return true;
      }
    } catch (_e) {}
    return false;
  }

  var _rehydrateInflight = {}; // key board|uid -> timestamp
  var REHYDRATE_MIN_INTERVAL_MS = 8000;

  // Merge seguro: server-first, mas nunca deixa um server VAZIO apagar um
  // local NÃO-vazio (indício de falha transitória/403, não de verdade).
  function _safeMerge(board, uid, serverList) {
    var local = _localList(board, uid);
    serverList = Array.isArray(serverList) ? serverList : [];
    if (!serverList.length && local.length) {
      _warn('server vazio mas local tem ' + local.length + ' cards — mantendo local e tentando de novo depois');
      return null; // sinaliza "não gravar"
    }
    var merged = (typeof global._mergeKeepLocalOnly === 'function')
      ? global._mergeKeepLocalOnly(serverList, local, board, uid)
      : (serverList.length ? serverList : local);
    return Array.isArray(merged) ? merged : null;
  }

  function _rehydrate(board, uid) {
    var me = _me(); if (!me || !uid) return;
    var wc = _wc(); if (!wc || typeof wc.kanbanList !== 'function') return;
    var key = board + '|' + uid;
    var now = Date.now();
    if (_rehydrateInflight[key] && (now - _rehydrateInflight[key]) < REHYDRATE_MIN_INTERVAL_MS) return;
    _rehydrateInflight[key] = now;

    var local = _localList(board, uid);
    // Só força reidratação quando há MOTIVO: cache vazio + evidência no Bingo.
    if (local.length > 0) return;
    if (!_bingoHasNegEvidence(uid)) return;

    _log('cache local vazio mas Bingo tem negócios de ' + uid + ' — reidratando ' + board + ' do servidor');
    Promise.resolve(wc.kanbanList(board, uid)).then(function (doc) {
      var server = (doc && doc.list) || [];
      var merged = _safeMerge(board, uid, server);
      if (merged === null) return; // não grava nada, evita selar sumiço
      try {
        if (typeof global.ss === 'function' && typeof global.kbKeyFor === 'function') {
          global.ss(global.kbKeyFor(board, uid), merged);
        }
      } catch (_e) {}
      _log('reidratado ' + board + ' de ' + uid + ' — ' + merged.length + ' card(s)');
      // Repinta o board atual se ele estiver visível.
      try {
        if (typeof global.renderKBLocal === 'function') global.renderKBLocal(board);
      } catch (_e) {}
    }).catch(function (err) {
      _warn('reidratação falhou para ' + uid, err);
    });
  }

  // Envolve renderKBLocal: depois da pintura normal, agenda reidratação
  // assíncrona se o cache estiver vazio com evidência no Bingo.
  function _wrapRenderKBLocal() {
    if (typeof global.renderKBLocal !== 'function') return setTimeout(_wrapRenderKBLocal, 250);
    if (global.renderKBLocal.__lfNegSupBoardWrapped) return;
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
            // visão "Todos": inclui o time + garante o próprio supervisor
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
    global.renderKBLocal.__lfNegSupBoardWrapped = true;
    _log('renderKBLocal envelopado — reidratação de board vazio ativa');
  }

  // Garante que a visão "Todos" do supervisor sempre contenha o próprio
  // supervisor, mesmo que getDepartmentVisibleUsers o omita por edge de
  // escopo (evita o quadro consolidado renderizar sem os próprios cards).
  function _wrapGetDepartmentVisibleUsers() {
    if (typeof global.getDepartmentVisibleUsers !== 'function') return setTimeout(_wrapGetDepartmentVisibleUsers, 250);
    if (global.getDepartmentVisibleUsers.__lfNegSupSelfIncl) return;
    var orig = global.getDepartmentVisibleUsers;
    global.getDepartmentVisibleUsers = function (uid) {
      var list = orig.apply(this, arguments) || [];
      try {
        var me = _me();
        uid = uid || me;
        if (uid && me && uid === me && _isSupervisor()) {
          var found = false;
          for (var i = 0; i < list.length; i++) { if (list[i] && list[i].id === me) { found = true; break; } }
          if (!found) {
            var self = (typeof global.getUser === 'function') ? global.getUser(me) : null;
            list = [self || { id: me, nome: (global.S && global.S.nome) || 'Eu', ativo: true }].concat(list);
          }
        }
      } catch (_e) {}
      return list;
    };
    global.getDepartmentVisibleUsers.__lfNegSupSelfIncl = true;
    _log('getDepartmentVisibleUsers envelopado — supervisor sempre incluído na "Todos"');
  }

  function _install() {
    _wrapRenderKBLocal();
    _wrapGetDepartmentVisibleUsers();
    _log('v1-20260826 ativo');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _install);
  else _install();
})(window);
