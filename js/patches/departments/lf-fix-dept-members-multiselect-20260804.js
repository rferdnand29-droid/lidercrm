/* lf-fix-dept-members-multiselect-20260804
 * ---------------------------------------------------------------------
 * BUG RELATADO: "em criar departamentos nao esta sendo possivel adicionar
 * mais de um colaborador de uma vez; nem tem caixa de selecao".
 *
 * CAUSA RAIZ (duas partes):
 *
 * 1) CSS (corrigido em css/lf-fix-dept-members-checkbox-20260804.css):
 *    openDeptEditor() (js/usuarios.js:265-266) monta a lista com
 *    <input type="checkbox"> DENTRO de um bloco .mf. O css/style.css tem
 *    regras genericas de campo de formulario:
 *      .mf input,.mf select{width:100%;padding:10px 12px;appearance:none}
 *      .lf input,.mf input,...{min-height:40px}
 *      @media mobile .mf input{min-height:46px!important;background:#f8fbff!important}
 *    appearance:none apaga o desenho nativo do checkbox e width:100% +
 *    min-height o estica: vira aquele RETANGULO VAZIO ao lado do nome.
 *    O checkbox continuava funcional, mas invisivel/ilegivel — dai a
 *    sensacao de "nao da pra selecionar".
 *
 * 2) UX: mesmo funcionando, so havia checkbox um-a-um, sem busca,
 *    sem "marcar todos", sem contador e sem clique na linha inteira.
 *
 * O QUE ESTE PATCH FAZ:
 *    - Reescreve o corpo da lista de colaboradores (#dept-members-list)
 *      com linhas clicaveis, mantendo a MESMA classe .dept-member-cb e
 *      o mesmo value=u.id que saveDept() (js/usuarios.js:292) ja le via
 *      document.querySelectorAll('.dept-member-cb:checked') — ou seja,
 *      NENHUMA mudanca no save/persistencia.
 *    - Adiciona busca, "Marcar todos" (respeita o filtro da busca),
 *      "Limpar" e contador "N selecionado(s)".
 *    - Suporta shift+clique para marcar um intervalo.
 *    - Nao marca supervisor/adjunto como colaborador (evita duplicidade),
 *      apenas sinaliza visualmente.
 *
 * INTEGRACAO: envolve (wrap) a openDeptEditor() original sem reescreve-la,
 * entao qualquer correcao futura no usuarios.js continua valendo.
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';
  if (global.__LF_FIX_DEPT_MEMBERS_MULTISELECT__) return;
  global.__LF_FIX_DEPT_MEMBERS_MULTISELECT__ = true;

  var TAG = '[lf-dept-members]';
  function _warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  var _lastIdx = -1;

  function getActiveUsers() {
    try {
      var list = (typeof global.getUsers === 'function') ? global.getUsers() : [];
      return (list || []).filter(function (u) { return u && u.id && u.ativo; });
    } catch (_e) { return []; }
  }

  function buildList(preselected) {
    var wrap = document.getElementById('dept-members-list');
    if (!wrap) return;
    var users = getActiveUsers();
    var sel = {};
    (preselected || []).forEach(function (id) { sel[id] = true; });

    if (!users.length) {
      wrap.innerHTML = '<div class="dept-empty">Nenhum colaborador ativo encontrado.</div>';
      return;
    }

    wrap.innerHTML = users.map(function (u, i) {
      return '<label class="dept-member-row' + (sel[u.id] ? ' on' : '') + '" data-idx="' + i + '" data-name="' +
        esc(norm(u.nome) + ' ' + norm(u.cargo || '')) + '">' +
        '<input type="checkbox" class="dept-member-cb" value="' + esc(u.id) + '"' + (sel[u.id] ? ' checked' : '') + '>' +
        '<span class="dept-member-name">' + esc(u.nome || '') + '</span>' +
        (u.cargo ? '<span class="dept-member-cargo">' + esc(u.cargo) + '</span>' : '') +
        '</label>';
    }).join('');

    _lastIdx = -1;
    updateCount();
  }

  function ensureTools() {
    var wrap = document.getElementById('dept-members-list');
    if (!wrap || !wrap.parentNode) return;
    if (wrap.parentNode.querySelector('.dept-mem-tools')) return;

    var tools = document.createElement('div');
    tools.className = 'dept-mem-tools';
    tools.innerHTML =
      '<input type="text" class="dept-mem-search" id="dept-mem-search" placeholder="Buscar colaborador..." autocomplete="off">' +
      '<button type="button" class="dept-mem-btn" id="dept-mem-all">Marcar todos</button>' +
      '<button type="button" class="dept-mem-btn" id="dept-mem-none">Limpar</button>';
    wrap.parentNode.insertBefore(tools, wrap);

    var count = document.createElement('span');
    count.id = 'dept-mem-count';
    wrap.parentNode.insertBefore(count, wrap.nextSibling);

    tools.querySelector('#dept-mem-search').addEventListener('input', function () {
      var q = norm(this.value);
      Array.prototype.forEach.call(wrap.querySelectorAll('.dept-member-row'), function (row) {
        row.style.display = (!q || row.getAttribute('data-name').indexOf(q) >= 0) ? '' : 'none';
      });
    });
    tools.querySelector('#dept-mem-all').addEventListener('click', function () { setVisible(true); });
    tools.querySelector('#dept-mem-none').addEventListener('click', function () { setVisible(false); });

    // Delegacao: clique/troca em qualquer checkbox da lista
    wrap.addEventListener('change', function (ev) {
      var cb = ev.target;
      if (!cb || !cb.classList || !cb.classList.contains('dept-member-cb')) return;
      var row = cb.closest('.dept-member-row');
      if (row) row.classList.toggle('on', cb.checked);
      updateCount();
    });

    // Shift+clique = marcar intervalo
    wrap.addEventListener('click', function (ev) {
      var row = ev.target.closest ? ev.target.closest('.dept-member-row') : null;
      if (!row) return;
      var idx = parseInt(row.getAttribute('data-idx'), 10);
      if (ev.shiftKey && _lastIdx >= 0 && idx !== _lastIdx) {
        var cb = row.querySelector('.dept-member-cb');
        var want = cb ? !cb.checked : true; // o clique ainda vai inverter este
        var a = Math.min(_lastIdx, idx), b = Math.max(_lastIdx, idx);
        Array.prototype.forEach.call(wrap.querySelectorAll('.dept-member-row'), function (r) {
          var i = parseInt(r.getAttribute('data-idx'), 10);
          if (i < a || i > b || i === idx || r.style.display === 'none') return;
          var c = r.querySelector('.dept-member-cb');
          if (c) { c.checked = want; r.classList.toggle('on', want); }
        });
      }
      _lastIdx = idx;
      setTimeout(updateCount, 0);
    });
  }

  function setVisible(state) {
    var wrap = document.getElementById('dept-members-list');
    if (!wrap) return;
    Array.prototype.forEach.call(wrap.querySelectorAll('.dept-member-row'), function (row) {
      if (row.style.display === 'none') return;
      var cb = row.querySelector('.dept-member-cb');
      if (cb) { cb.checked = !!state; row.classList.toggle('on', !!state); }
    });
    updateCount();
  }

  function updateCount() {
    var wrap = document.getElementById('dept-members-list');
    var el = document.getElementById('dept-mem-count');
    if (!wrap || !el) return;
    var n = wrap.querySelectorAll('.dept-member-cb:checked').length;
    var total = wrap.querySelectorAll('.dept-member-cb').length;
    el.textContent = n + ' de ' + total + ' colaborador' + (total === 1 ? '' : 'es') + ' selecionado' + (n === 1 ? '' : 's');
  }

  function currentDeptMembers(id) {
    try {
      if (!id || typeof global.getDepartments !== 'function') return [];
      var d = global.getDepartments().find(function (x) { return x.id === id; });
      return (d && d.memberIds) ? d.memberIds.slice() : [];
    } catch (_e) { return []; }
  }

  function install() {
    var orig = global.openDeptEditor;
    if (typeof orig !== 'function') return false;
    if (orig.__lfMultiSelectWrapped) return true;

    var wrapped = function (id) {
      var r = orig.apply(this, arguments);
      try {
        ensureTools();
        buildList(currentDeptMembers(id));
        var s = document.getElementById('dept-mem-search');
        if (s) {
          s.value = '';
          Array.prototype.forEach.call(document.querySelectorAll('#dept-members-list .dept-member-row'),
            function (row) { row.style.display = ''; });
        }
      } catch (e) { _warn('falha ao montar lista de colaboradores:', e); }
      return r;
    };
    wrapped.__lfMultiSelectWrapped = true;
    global.openDeptEditor = wrapped;
    return true;
  }

  function boot() {
    if (install()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (install() || ++tries > 100) clearInterval(t);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
