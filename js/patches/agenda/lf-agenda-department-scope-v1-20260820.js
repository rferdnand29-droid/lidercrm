/* =====================================================================
 * lf-agenda-department-scope-v1-20260820.js
 * ---------------------------------------------------------------------
 * PEDIDO: quem está num departamento específico (qualquer cargo, exceto
 * quem tem TODAS as funções do ADM) só pode ver, na Agenda, os
 * agendamentos daquele departamento. Quem tem acesso total de ADM
 * (hasAdminAccess) continua vendo todos os departamentos de uma vez, e
 * ganha um filtro pra restringir a um departamento por vez — com a
 * última escolha salva: se ele sair da Agenda (ou do CRM) e voltar, o
 * filtro continua no departamento que ele tinha escolhido por último.
 *
 * [FIX 20260820b] Cargo Administrativo tratado como "departamento
 * virtual": Administrativo tinha a aba Agenda escondida por completo
 * (lf-administrativo-hide-tabs-v1-20260820.js). Agora ela volta, mas
 * com o MESMO princípio de escopo já usado pra departamento de verdade
 * — um Administrativo só vê agendamentos de OUTROS Administrativos
 * (nunca de departamentos/cargos normais), e ADM total ganha uma opção
 * "🗂️ Administrativo" no mesmo seletor de departamento, como se fosse
 * mais um departamento na lista. Reaproveita 100% do mecanismo que já
 * existia — só ensina _deptOfUser()/_populateDeptFilter() a reconhecer
 * esse "departamento" adicional (cargo, não vínculo formal de
 * Estrutura/team_id).
 *
 * ANTES: js/agenda.js carrega TODOS os agendamentos da equipe inteira
 * pra QUALQUER usuário logado ("Agendamentos de toda a equipe, em tempo
 * real" — ver agdSetLiveDot) e nunca filtra por departamento. Não tem
 * bug nenhum aqui — é assim que foi construído; este patch ADICIONA a
 * regra de departamento por cima, sem tocar em agenda.js.
 *
 * COMO FUNCIONA (sem reescrever agenda.js — só envelopa):
 *   1) js/agenda.js NÃO é um módulo (script global concatenado, sem
 *      IIFE) — _agdCache é um `var` de topo de arquivo, ou seja, é
 *      literalmente window._agdCache. Isso permite trocar o conteúdo
 *      dele TEMPORARIAMENTE, só durante a chamada de cada função de
 *      render, sem alterar a fonte de dados real (usada por
 *      salvar/editar/checar conflito de horário, que continuam vendo
 *      TUDO — só a EXIBIÇÃO é filtrada).
 *   2) agdRenderStrip/agdRenderKPIs/agdRenderList/agdRenderFreeSlots
 *      são envelopadas: troca window._agdCache pela versão filtrada
 *      por departamento, chama a função original, e RESTAURA o valor
 *      completo logo em seguida (try/finally). Como JS é
 *      single-thread e essas funções são 100% síncronas, não existe
 *      janela de corrida — nenhum outro código consegue ler o valor
 *      trocado no meio do caminho.
 *   3) agdFillConsultorFilter/agdFillConsultorSelect (dropdowns de
 *      consultor) recebem o mesmo tratamento em cima de getUsers(),
 *      pra nunca oferecer, no seletor, um consultor de fora do
 *      departamento visível.
 *   4) agdOpen é envelopada só pra popular/restaurar o filtro de
 *      departamento ANTES da primeira renderização.
 *
 * DEPARTAMENTO DE UM USUÁRIO: cargo Administrativo checado PRIMEIRO
 * (vira o "departamento" __lf_cargo_administrativo__, independente de
 * qualquer vínculo formal de Estrutura/team_id que a pessoa também
 * tenha) — senão, mesma prioridade já usada por
 * getDepartmentVisibleUsers(): LF_SCOPE_V2.departamentoOfUser() (fonte
 * nova, via team_id, a mesma que protege dados de verdade no banco)
 * primeiro; getDepartments()/_deptUserBelongs (Estrutura manual) como
 * fallback. Reaproveita as duas, não duplica a lógica.
 *
 * CASO SEM DEPARTAMENTO ATRIBUÍDO (não-ADM): em vez de "sem filtro =
 * vê tudo" (que seria um vazamento de dados), cai pro mínimo seguro —
 * só os próprios agendamentos. Mesmo princípio de "least privilege"
 * que getDepartmentVisibleUsers() já usa noutros lugares do app.
 *
 * PERSISTÊNCIA: localStorage por uid (lf_agd_dept_filter_<uid>) — sobrevive
 * a trocar de aba, fechar o CRM e voltar depois, exatamente como pedido.
 *
 * Idempotente: guard global.__lfFixAgendaDepartmentScopeV1.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixAgendaDepartmentScopeV1) return;
  global.__lfFixAgendaDepartmentScopeV1 = true;

  var LS_PREFIX = 'lf_agd_dept_filter_';
  // [FIX 20260820b] "departamento" virtual do cargo Administrativo — string
  // improvável de colidir com qualquer id real de departamento (que vêm de
  // LF_DEPARTMENTS/Estrutura, sempre uuid/slug curto).
  var ADM_VDEPT_ID = '__lf_cargo_administrativo__';
  var ADM_VDEPT_LABEL = '🗂️ Administrativo';

  function _esc(s) {
    if (typeof global._agdEsc === 'function') return global._agdEsc(s);
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function _isAdmin() {
    try { return !!(typeof global.hasAdminAccess === 'function' && global.hasAdminAccess()); }
    catch (_e) { return false; }
  }

  function _myUid() {
    return (global.S && global.S.userId) || null;
  }

  /* [FIX 20260820b] Mesma assinatura de detecção já usada e validada em
     assertNotAdministrativo (Worker) e lf-administrativo-hide-tabs-v1 —
     leads:'none' + negocios:'crud' é única do cargo Administrativo na
     tabela CARGO_CAPS (conferido nas duas sessões anteriores). Nunca
     diverge do que o resto do app já considera "é Administrativo". */
  function _isOwnerAdministrativo(uid) {
    if (!uid) return false;
    try {
      if (typeof global.getCargoCaps !== 'function') return false;
      var caps = global.getCargoCaps(uid);
      return !!(caps && caps.leads === 'none' && caps.negocios === 'crud');
    } catch (_e) { return false; }
  }

  /* Departamento de um usuário qualquer — cargo Administrativo primeiro
     (vira o departamento virtual), depois mesma prioridade de
     getDepartmentVisibleUsers(): LF_SCOPE_V2 (novo, via team_id) primeiro,
     Estrutura manual (supervisorIds/adjuntoIds/memberIds) como fallback. */
  function _deptOfUser(uid) {
    if (!uid) return null;
    if (_isOwnerAdministrativo(uid)) return ADM_VDEPT_ID;
    try {
      if (typeof global.LF_SCOPE_V2 !== 'undefined' && typeof global.LF_SCOPE_V2.departamentoOfUser === 'function') {
        var d = global.LF_SCOPE_V2.departamentoOfUser(uid);
        if (d) return d;
      }
    } catch (_e) { /* segue pro fallback */ }
    try {
      var depts = (typeof global.getDepartments === 'function') ? (global.getDepartments() || []) : [];
      for (var i = 0; i < depts.length; i++) {
        if (depts[i] && typeof global._deptUserBelongs === 'function' && global._deptUserBelongs(depts[i], uid)) {
          return depts[i].id;
        }
      }
    } catch (_e2) { /* sem departamento resolvido */ }
    return null;
  }

  function _lsKey() {
    return LS_PREFIX + (_myUid() || 'anon');
  }
  function _loadPersistedDept() {
    try { return localStorage.getItem(_lsKey()) || ''; } catch (_e) { return ''; }
  }
  function _savePersistedDept(v) {
    try { localStorage.setItem(_lsKey(), v || ''); } catch (_e) { /* ignora — pior caso, não persiste entre sessões */ }
  }

  /* Departamento "efetivo" pro filtro atual:
     - ADM: o que estiver selecionado no <select> (ou o persistido, se o
       select ainda não foi populado) — '' = todos.
     - Não-ADM: SEMPRE o próprio departamento (nunca lê o <select> —
       usuário comum não tem esse controle, é travado). */
  function _effectiveDeptFilter() {
    if (_isAdmin()) {
      var sel = document.getElementById('agd-filter-dept');
      var v = sel ? sel.value : '';
      if (!v) v = _loadPersistedDept();
      return v || '';
    }
    return _deptOfUser(_myUid()) || '';
  }

  function _filterCacheByDept(cache) {
    cache = Array.isArray(cache) ? cache : [];
    var deptId = _effectiveDeptFilter();
    if (_isAdmin()) {
      if (!deptId) return cache; // ADM sem filtro = vê todos os departamentos de uma vez
      return cache.filter(function (a) { return a && _deptOfUser(a.consultorId) === deptId; });
    }
    if (deptId) {
      return cache.filter(function (a) { return a && _deptOfUser(a.consultorId) === deptId; });
    }
    // Não-ADM sem departamento atribuído: nunca cai pra "vê tudo" por
    // engano — mínimo seguro é só os próprios agendamentos.
    var myUid = _myUid();
    return cache.filter(function (a) { return a && a.consultorId === myUid; });
  }

  /* ---- envelopa as 4 funções de render em cima de window._agdCache ---- */
  function _wrapRenderFn(name) {
    var orig = global[name];
    if (typeof orig !== 'function' || orig.__lfDeptScopeWrapped) return false;
    var wrapped = function () {
      var full = global._agdCache;
      global._agdCache = _filterCacheByDept(full);
      try {
        return orig.apply(this, arguments);
      } finally {
        global._agdCache = full;
      }
    };
    wrapped.__lfDeptScopeWrapped = true;
    global[name] = wrapped;
    return true;
  }

  /* ---- envelopa os dois preenchedores de <select> de consultor em
     cima de getUsers(), pro dropdown nunca oferecer alguém de fora do
     departamento visível ---- */
  function _wrapFillConsultorFn(name) {
    var orig = global[name];
    if (typeof orig !== 'function' || orig.__lfDeptScopeWrapped) return false;
    var wrapped = function () {
      var fullGetUsers = global.getUsers;
      if (typeof fullGetUsers === 'function') {
        global.getUsers = function () {
          var all = fullGetUsers.apply(this, arguments);
          var deptId = _effectiveDeptFilter();
          if (_isAdmin() && !deptId) return all; // ADM sem filtro = todos os consultores
          if (!deptId) return all; // segurança: nunca restringe pra [] se não resolveu nada
          return (all || []).filter(function (u) { return u && _deptOfUser(u.id) === deptId; });
        };
      }
      try {
        return orig.apply(this, arguments);
      } finally {
        if (typeof fullGetUsers === 'function') global.getUsers = fullGetUsers;
      }
    };
    wrapped.__lfDeptScopeWrapped = true;
    global[name] = wrapped;
    return true;
  }

  /* ---- popula/mostra o <select> de departamento (só ADM) ---- */
  function _populateDeptFilter() {
    var sel = document.getElementById('agd-filter-dept');
    if (!sel) return;
    if (!_isAdmin()) {
      sel.style.display = 'none';
      sel.value = '';
      return;
    }
    sel.style.display = '';
    var depts = [];
    try {
      if (typeof global.LF_DEPARTMENTS !== 'undefined' && typeof global.LF_DEPARTMENTS.list === 'function') {
        depts = global.LF_DEPARTMENTS.list() || [];
      } else if (typeof global.getDepartments === 'function') {
        depts = global.getDepartments() || [];
      }
    } catch (_e) { depts = []; }

    var persisted = _loadPersistedDept();
    var current = sel.value || persisted;

    var opts = '<option value="">Todos os departamentos</option>'
      + '<option value="' + _esc(ADM_VDEPT_ID) + '">' + _esc(ADM_VDEPT_LABEL) + '</option>'
      + depts.map(function (d) {
      var id = d && d.id;
      var nome = (d && (d.nome || d.name)) || '?';
      if (!id) return '';
      return '<option value="' + _esc(id) + '">' + _esc(nome) + '</option>';
    }).join('');
    sel.innerHTML = opts;

    var stillExists = current === ADM_VDEPT_ID || depts.some(function (d) { return d && d.id === current; });
    sel.value = stillExists ? current : '';
  }

  /* Chamado pelo onchange do <select id="agd-filter-dept"> (ver
     index.html/app.html) — salva a escolha e re-renderiza tudo. */
  global._agdOnDeptFilterChange = function () {
    var sel = document.getElementById('agd-filter-dept');
    var v = sel ? sel.value : '';
    _savePersistedDept(v);
    try { if (typeof global.agdFillConsultorFilter === 'function') global.agdFillConsultorFilter(); } catch (_e) {}
    try { if (typeof global.agdRenderStrip === 'function') global.agdRenderStrip(); } catch (_e) {}
    try { if (typeof global.agdRenderKPIs === 'function') global.agdRenderKPIs(); } catch (_e) {}
    try { if (typeof global.agdRenderList === 'function') global.agdRenderList(); } catch (_e) {}
    try { if (typeof global.agdRenderFreeSlots === 'function') global.agdRenderFreeSlots(); } catch (_e) {}
  };

  /* ---- envelopa agdOpen só pra popular/restaurar o filtro ANTES da
     primeira renderização da Agenda ---- */
  function _wrapAgdOpen() {
    var orig = global.agdOpen;
    if (typeof orig !== 'function' || orig.__lfDeptScopeWrapped) return false;
    var wrapped = function () {
      _populateDeptFilter();
      return orig.apply(this, arguments);
    };
    wrapped.__lfDeptScopeWrapped = true;
    global.agdOpen = wrapped;
    return true;
  }

  /* Nome de um departamento pelo id (pra compor o texto abaixo do
     título da Agenda). */
  function _deptName(id) {
    if (!id) return null;
    if (id === ADM_VDEPT_ID) return 'Administrativo';
    var depts = [];
    try {
      if (typeof global.LF_DEPARTMENTS !== 'undefined' && typeof global.LF_DEPARTMENTS.list === 'function') {
        depts = global.LF_DEPARTMENTS.list() || [];
      } else if (typeof global.getDepartments === 'function') {
        depts = global.getDepartments() || [];
      }
    } catch (_e) { depts = []; }
    var d = depts.filter(function (x) { return x && x.id === id; })[0];
    return d ? (d.nome || d.name || null) : null;
  }

  /* Envelopa agdSetLiveDot só pra trocar o texto genérico "toda a
     equipe" (que hoje é sempre exibido, mesmo já filtrado por
     departamento) por um texto que reflete o escopo atual. Mensagens
     de erro/offline (qualquer outro texto) passam intactas — isso
     troca só a mensagem de sucesso padrão. */
  function _wrapSetLiveDot() {
    var orig = global.agdSetLiveDot;
    if (typeof orig !== 'function' || orig.__lfDeptScopeWrapped) return false;
    var GENERIC = 'Agendamentos de toda a equipe (atualiza a cada 6s)';
    var wrapped = function (ok, label) {
      if (ok && (!label || label === GENERIC)) {
        var deptId = _effectiveDeptFilter();
        if (_isAdmin() && !deptId) {
          label = 'Agendamentos de todos os departamentos (atualiza a cada 6s)';
        } else if (deptId) {
          var nome = _deptName(deptId);
          label = nome
            ? 'Agendamentos do departamento ' + nome + ' (atualiza a cada 6s)'
            : 'Agendamentos do seu departamento (atualiza a cada 6s)';
        } else {
          label = 'Agendamentos — só os seus (sem departamento atribuído)';
        }
      }
      return orig.call(this, ok, label);
    };
    wrapped.__lfDeptScopeWrapped = true;
    global.agdSetLiveDot = wrapped;
    return true;
  }

  function _install() {
    var ok = true;
    ok = _wrapRenderFn('agdRenderStrip') && ok;
    ok = _wrapRenderFn('agdRenderKPIs') && ok;
    ok = _wrapRenderFn('agdRenderList') && ok;
    ok = _wrapRenderFn('agdRenderFreeSlots') && ok;
    ok = _wrapFillConsultorFn('agdFillConsultorFilter') && ok;
    ok = _wrapFillConsultorFn('agdFillConsultorSelect') && ok;
    ok = _wrapAgdOpen() && ok;
    ok = _wrapSetLiveDot() && ok;
    return ok;
  }

  var _tries = 0;
  function _boot() {
    if (_install()) return;
    _tries++;
    if (_tries < 40) setTimeout(_boot, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

})(window);
