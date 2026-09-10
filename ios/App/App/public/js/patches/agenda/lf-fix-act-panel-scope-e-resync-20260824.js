/* =====================================================================
 * LF-ACT-PANEL-SCOPE-20260824 + LF-KB-LOST-LEAD-RESYNC-20260824
 * ---------------------------------------------------------------------
 * Fecha os dois gaps restantes do diagnóstico de 24/08/2026, no padrão
 * cirúrgico do projeto (patch isolado, sem tocar os módulos originais):
 *
 * GAP 1 — Supervisor via atividades atrasadas DE FORA do departamento dele
 *   no painel do relógio/sino (renderActPanel, js/agenda.js).
 *   A proteção de órfãs (_isActivityOrphanOrInactive / _admAtivIsOrphan)
 *   já estava aplicada no painel — mas o painel mesclava atividades de
 *   TODOS os usuários ativos (loadAllActivitiesAdmin itera geral), sem
 *   passar pelo mesmo filtro de escopo (getDepartmentVisibleUsers) que
 *   renderTimeAtividades já usa. Resultado: supervisor via (e era
 *   notificado/badged por) atrasadas de consultores de outros
 *   departamentos, além de qualquer coisa vinculada a cards que não
 *   existem no quadro dele.
 *   Correção: envolve window.renderActPanel e window.updateActBadge para
 *   filtrar a lista mesclada pelo escopo do usuário logado:
 *     - ADM (hasAdminAccess) e visão Time ativa (window._timeViewUid ou
 *       _admViewUid / _kbViewUid)  -> comportamento anterior preservado;
 *     - demais cargos (supervisor/gerente/consultor) -> apenas uids
 *       retornados por getDepartmentVisibleUsers(S.userId).
 *   O filtro de órfãs continua rodando DENTRO das funções originais
 *   (já existia desde 20260820) — aqui só limitamos QUEM entra na mescla.
 *
 * GAP 2 — Leads "sumidos" por transferências feitas ANTES do patch
 *   LF-KB-TRANSFER-ROLLBACK-20260824 não voltavam sozinhos: o rollback
 *   só protege operações NOVAS. Para os cards que sumiram entre a
 *   pintura otimista (js/kanban.js -> applyBulkRespAndStage) e o 403 do
 *   worker (cross_owner_kanban_write no ADM namespaced), este patch
 *   adiciona uma auditoria retroativa NÃO-DESTRUTIVA:
 *     - Botão "Ressincronizar leads" na barra do quadro de Leads
 *       (visível apenas para ADM / quem tem getDepartmentVisibleUsers),
 *       e console helper window.lfResyncLostLeads([board]).
 *     - Para cada usuário do escopo, compara o estado real do worker
 *       (GET /api/v1/kanban/list via wc.kanbanList, já com o ADM raiz
 *       corrigido) contra o cache local (lf6_kb_<board>_<uid>): cards
 *       que existem NO SERVIDOR mas não no cliente são regravados via
 *       _mergeKeepLocalOnly + ss(kbKeyFor(...)) e o quadro é repintado.
 *     - Se o card também NÃO existe no servidor (PUT do destino falhou
 *       por 403), ele não é recriado por adivinhação — o helper apenas
 *       REPORTA no console/toast a lista de ids divergentes para
 *       reconstrução a partir do snapshot fs_documents
 *       (kanban/list/leads/<uid_origem>), exatamente como recomenda o
 *       diagnóstico. Nada é apagado nem sobrescrito.
 *
 * Idempotente: se já carregado, não reenvolve. Requer apenas símbolos
 * já públicos do app (S, getUsers, getKBFor, ss, kbKeyFor,
 * _kbWorkerClient, _mergeKeepLocalOnly, getDepartmentVisibleUsers,
 * hasAdminAccess, renderKBLocal) — todos com guarda typeof.
 * ===================================================================== */
(function () {
  'use strict';
  var TAG = 'LF-ACT-PANEL-SCOPE-20260824+LF-KB-LOST-LEAD-RESYNC-20260824';
  if (window.__lfActPanelScopeV20260824) return;
  window.__lfActPanelScopeV20260824 = true;

  function _me() { try { return (typeof S !== 'undefined' && S && S.userId) || null; } catch (_e) { return null; } }
  function _isAdm() {
    try { return typeof hasAdminAccess === 'function' && !!hasAdminAccess(); } catch (_e) { return false; }
  }
  function _timeViewActive() {
    // supervisor olhando o quadro de OUTRO consultor (visão Time / filtro de consultor)
    try {
      if (window._timeViewUid) return true;
      if (window._admViewUid) return true;
      if (typeof _kbViewUid !== 'undefined' && _kbViewUid && (_kbViewUid.leads || _kbViewUid.negocios)) return true;
    } catch (_e) {}
    return false;
  }
  // Conjunto de uids que o usuário logado pode ver no painel de atividades.
  // null = sem restrição (ADM ou fallback quando getDepartmentVisibleUsers
  // não existe — comportamento idêntico ao anterior).
  function _visibleUidSet() {
    var me = _me();
    if (!me) return null;
    if (_isAdm() || _timeViewActive()) return null;
    if (typeof getDepartmentVisibleUsers !== 'function') return null;
    try {
      var users = getDepartmentVisibleUsers(me) || [];
      if (!users.length) return null;
      var set = {};
      users.forEach(function (u) { if (u && u.id) set[u.id] = true; });
      set[me] = true; // nunca esconde as próprias atividades
      return set;
    } catch (_e) { return null; }
  }
  function _scopeFilter(list) {
    var set = _visibleUidSet();
    if (!set || !Array.isArray(list)) return list;
    return list.filter(function (a) {
      if (!a) return false;
      var owner = a._ownerId || a.userId;
      if (!owner) return true; // sem dono identificável: não esconde por segurança
      return !!set[owner];
    });
  }

  // --- Envelope 1: renderActPanel --------------------------------------
  var _origRenderActPanel = window.renderActPanel;
  if (typeof _origRenderActPanel === 'function') {
    window.renderActPanel = function () {
      // O painel original constrói a mescla a partir de getUsers() ativo.
      // Em vez de reescrever a função, limitamos a entrada: escondemos
      // temporariamente os usuários fora do escopo via wrapper de getUsers?
      // NÃO — isso afetaria outras telas. Abordagem escolhida: deixamos o
      // original montar _actPanelLastList e, em seguida, filtramos e
      // repintamos usando a própria função somente quando há restrição.
      // Implementação: interceptamos _actPanelLastList APÓS o render e,
      // se houve corte, redesenhamos o UL com os mesmos helpers públicos.
      var set = _visibleUidSet();
      if (!set) { return _origRenderActPanel.apply(this, arguments); }
      // Caminho com restrição: roda o original (que já aplica o filtro de
      // órfãs e pinta) e depois re-filtra o DOM seria frágil. Em vez disso,
      // substituímos getActivitiesLocalFor temporariamente durante a
      // chamada para que a mescla já nasça escopada — técnica reversível
      // e localizada, sem tocar js/agenda.js.
      var origGetLocal = window.getActivitiesLocalFor;
      if (typeof origGetLocal !== 'function') {
        return _origRenderActPanel.apply(this, arguments);
      }
      window.getActivitiesLocalFor = function (uid) {
        if (uid && !set[uid]) return [];
        return origGetLocal.apply(this, arguments);
      };
      try {
        return _origRenderActPanel.apply(this, arguments);
      } finally {
        window.getActivitiesLocalFor = origGetLocal;
      }
    };
  }

  // --- Envelope 2: updateActBadge --------------------------------------
  // O badge conta só getActivities() (as do próprio usuário) — mas o sino
  // visual ("ringing") e a notificação nativa (checkUpcomingActs ->
  // showActAlert) já operam sobre a lista do próprio usuário. O falso
  // positivo restante é quando uma atividade foi gravada com o userId do
  // supervisor "para" um consultor (bolinha acesa sem o card existir no
  // quadro dele). O filtro de órfãs já cobre isso via _isActivityOrphanOr-
  // Inactive; reforçamos exigindo que atividades de OUTRO dono (userId
  // diferente do logado) não contem no badge quando não há vínculo de
  // escopo.
  var _origUpdateActBadge = window.updateActBadge;
  if (typeof _origUpdateActBadge === 'function') {
    window.updateActBadge = function () {
      var set = _visibleUidSet();
      if (!set || typeof getActivities !== 'function') {
        return _origUpdateActBadge.apply(this, arguments);
      }
      var origGetActs = window.getActivities;
      window.getActivities = function () {
        var list = origGetActs.apply(this, arguments) || [];
        return list.filter(function (a) {
          if (!a) return false;
          var owner = a._ownerId || a.userId;
          return !owner || !!set[owner];
        });
      };
      try {
        return _origUpdateActBadge.apply(this, arguments);
      } finally {
        window.getActivities = origGetActs;
      }
    };
  }

  // --- GAP 2: auditoria + ressincronização de leads sumidos -------------
  function _kbKey(board, uid) {
    try {
      if (typeof kbKeyFor === 'function') return kbKeyFor(board, uid);
    } catch (_e) {}
    return 'lf6_kb_' + board + '_' + uid;
  }
  function _workerClient() {
    try { if (typeof _kbWorkerClient === 'function') return _kbWorkerClient(); } catch (_e) {}
    return null;
  }
  function _localList(board, uid) {
    try {
      if (typeof getKBFor === 'function') return getKBFor(board, uid) || [];
      var raw = localStorage.getItem(_kbKey(board, uid));
      return raw ? (JSON.parse(raw) || []) : [];
    } catch (_e) { return []; }
  }
  function _persistLocal(board, uid, list) {
    try {
      if (typeof ss === 'function') { ss(_kbKey(board, uid), list); return true; }
      localStorage.setItem(_kbKey(board, uid), JSON.stringify(list));
      return true;
    } catch (_e) { return false; }
  }
  function _toast(msg) {
    try { if (typeof toast === 'function') { toast(msg); return; } } catch (_e) {}
    try { console.log('[lf-resync]', msg); } catch (_e) {}
  }

  // Compara servidor x local para cada usuário do escopo; regrava o que
  // só existe no servidor. Retorna Promise<relatório>.
  window.lfResyncLostLeads = function (board) {
    board = board || 'leads';
    var me = _me();
    if (!me) { _toast('⚠️ Sessão não iniciada.'); return Promise.resolve(null); }
    var wc = _workerClient();
    if (!wc || typeof wc.kanbanList !== 'function') {
      _toast('⚠️ Worker indisponível — rode online com o build ≥20260824.');
      return Promise.resolve(null);
    }
    var pool;
    if (_isAdm() && typeof getUsers === 'function') {
      pool = getUsers().filter(function (u) { return u && u.ativo !== false; });
    } else if (typeof getDepartmentVisibleUsers === 'function') {
      pool = getDepartmentVisibleUsers(me) || [];
    } else {
      pool = [{ id: me }];
    }
    if (!pool.length) pool = [{ id: me }];
    var report = { board: board, checked: 0, restored: 0, divergent: [], errors: [] };
    var pending = pool.length;
    return new Promise(function (resolve) {
      pool.forEach(function (u) {
        var uid = u.id;
        wc.kanbanList(board, uid).then(function (doc) {
          var server = (doc && doc.list) || [];
          var local = _localList(board, uid);
          var localIds = {};
          local.forEach(function (c) { if (c && c.id != null) localIds[String(c.id)] = true; });
          var missingOnServer = local.filter(function (c) {
            return c && c.id != null && !server.some(function (s) { return s && String(s.id) === String(c.id); });
          });
          // Merge padrão do app: servidor manda, preserva cards locais ainda
          // não sincronizados (_mergeKeepLocalOnly já é a rotina oficial).
          var merged;
          try {
            merged = (typeof _mergeKeepLocalOnly === 'function')
              ? _mergeKeepLocalOnly(server, local)
              : server.concat(missingOnServer);
          } catch (_e) { merged = server; }
          var restoredCount = 0;
          try {
            var beforeIds = {}; local.forEach(function (c) { if (c && c.id != null) beforeIds[String(c.id)] = true; });
            restoredCount = merged.filter(function (c) { return c && c.id != null && !beforeIds[String(c.id)]; }).length;
          } catch (_e) {}
          _persistLocal(board, uid, merged);
          report.checked++;
          report.restored += restoredCount;
          // Divergência que NÃO dá pra resolver no cliente: cards que só
          // existem localmente num uid que NÃO é o dono esperado (sintoma
          // do PUT 403 do destino) — reporta pra reconstrução via snapshot.
          if (missingOnServer.length && uid !== me) {
            report.divergent.push({
              uid: uid,
              count: missingOnServer.length,
              ids: missingOnServer.slice(0, 20).map(function (c) { return c.id; })
            });
          }
        }).catch(function (e) {
          report.errors.push({ uid: u.id, error: String((e && e.message) || e) });
        }).then(function () {
          pending--;
          if (pending <= 0) {
            try {
              if (typeof renderKBLocal === 'function' &&
                  typeof board !== 'undefined' &&
                  document.getElementById(board === 'leads' ? 'leads-kanban' : 'negocios-kanban')) {
                renderKBLocal(board);
              }
            } catch (_e) {}
            var msg = '✅ Ressincronização (' + board + '): ' + report.checked +
              ' quadro(s) auditados, ' + report.restored + ' card(s) restaurado(s).';
            if (report.divergent.length) {
              msg += ' ⚠️ ' + report.divergent.length +
                ' usuário(s) com cards que NÃO existem no servidor — reconstruir a partir do snapshot fs_documents kanban/list/' + board + '/<uid_origem>.';
              try { console.warn('[lf-resync] divergências (reconstruir via snapshot):', report.divergent); } catch (_e) {}
            }
            _toast(msg);
            try { console.log('[lf-resync] relatório', report); } catch (_e) {}
            resolve(report);
          }
        });
      });
    });
  };

  // --- Botão na barra do quadro (somente ADM) ---------------------------
  function _injectResyncButton() {
    try {
      if (!_isAdm()) return;
      if (document.getElementById('lf-resync-leads-btn')) return;
      // Ancora na barra de filtro por consultor do kanban de Leads.
      // [FIX 20260824b] As classes .kb-cons-bar / .kb-toolbar NAO existem no
      // app: a barra real usa .kb-view-bar com id leads-cons-bar
      // (index.html ~L984). Sem este id, o seletor caia no fallback #pg-leads
      // e o botao ia parar escondido no fim da pagina, depois do kanban.
      var host = document.getElementById('leads-cons-bar') ||
                 document.querySelector('#pg-leads .kb-view-bar') ||
                 document.querySelector('#pg-leads .kb-cons-bar') ||
                 document.querySelector('#pg-leads .kb-toolbar') ||
                 document.querySelector('#pg-leads');
      if (!host) return;
      var btn = document.createElement('button');
      btn.id = 'lf-resync-leads-btn';
      btn.className = 'bc';
      btn.style.cssText = 'font-size:.68rem;padding:4px 10px;width:auto;border-color:var(--al);color:var(--al)';
      btn.title = 'Audita servidor x cache local e restaura cards que sumiram em transferências antigas (não-destrutivo)';
      btn.textContent = '♻ Ressincronizar leads';
      btn.onclick = function (ev) {
        try { ev && ev.stopPropagation && ev.stopPropagation(); } catch (_e) {}
        btn.disabled = true;
        window.lfResyncLostLeads('leads').then(function () {
          btn.disabled = false;
        });
      };
      host.appendChild(btn);
    } catch (_e) {}
  }
  // Injeta quando o DOM estiver pronto e re-tenta ao trocar de aba.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _injectResyncButton);
  } else {
    _injectResyncButton();
  }
  try {
    window.addEventListener('crm:users-updated', _injectResyncButton);
    // Re-tenta quando o usuario navega para a aba CRM/Leads (data-page=crm
    // e o botao mobile mobileGoPage('leads')). [FIX 20260824b] Antes o
    // gatilho lia data-nav/id com regex /leads/, mas a navegacao real usa
    // data-page="crm" — entao a re-injecao nunca disparava e o botao nao
    // reaparecia se o ADM ja estivesse logado antes do patch rodar.
    document.addEventListener('click', function (ev) {
      var t = ev && ev.target;
      if (!t) return;
      var el = (t.closest && t.closest('[data-page], [data-nav], [data-board], #pg-leads, [onclick*="leads"]')) || t;
      var sig = ((el.getAttribute && (el.getAttribute('data-page') || el.getAttribute('data-nav') || el.getAttribute('data-board') || el.getAttribute('onclick'))) || '') + ' ' + (el.id || '');
      if (/crm|leads|pg-leads/i.test(sig)) {
        setTimeout(_injectResyncButton, 250);
        setTimeout(_injectResyncButton, 600); // cobre render assincrono da leads-cons-bar
      }
    }, true);
    // Observa #pg-leads ficar visivel (classe .on) — cobre qualquer troca de
    // aba, mesmo as que nao passam pelos seletores acima.
    if (typeof MutationObserver !== 'undefined') {
      var _pg = document.getElementById('pg-leads');
      if (_pg) {
        var _mo = new MutationObserver(function () {
          if (_pg.classList.contains('on')) setTimeout(_injectResyncButton, 120);
        });
        _mo.observe(_pg, { attributes: true, attributeFilter: ['class'] });
      }
    }
  } catch (_e) {}

  try { console.log('[patch]', TAG, 'carregado'); } catch (_e) {}
})();
