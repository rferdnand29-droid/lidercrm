/* lf-dept-multi-supervisores-20260820
 * ---------------------------------------------------------------------
 * PEDIDO: "Ao criar departamentos deve ser possível colocar mais de 1
 * supervisor e mais de 1 supervisor adjunto no mesmo departamento."
 *
 * O QUE ESTE PATCH FAZ (camada de UX, aditivo — não reescreve lógica):
 *   - Os <select id="dept-sup"> e <select id="dept-sup-adj"> do modal
 *     #mo-dept agora chegam ao DOM como MÚLTIPLOS (atributo multiple,
 *     ver index.html / app.html). Este patch os re-estiliza como
 *     "checkbox-rows" (mesma linguagem visual da lista de Colaboradores,
 *     patch lf-fix-dept-members-multiselect-20260804): cada opção vira
 *     uma linha clicável, sem precisar de Ctrl/Cmd+clique (que ninguém
 *     descobre no mobile).
 *   - Adiciona uma busca acima de cada lista e um contador de
 *     selecionados.
 *   - NÃO muda ids, names nem o formato de leitura: saveDept()
 *     (js/usuarios.js) continua lendo select.selectedOptions — agora
 *     retornando N valores em vez de 1.
 *
 * COMPATIBILIDADE:
 *   - Se o HTML antigo (select simples) estiver em cache num cliente
 *     velho, o patch detecta !multiple e não aplica o re-estilo — o
 *     comportamento antigo (1 supervisor / 1 adjunto) continua
 *     funcionando até o cache expirar.
 *   - saveDept/_normalizeDeptRefsForUsers (js/usuarios.js, 2026-08-20)
 *     aceitam tanto o modelo novo (supervisorIds/supervisorAdjIds)
 *     quanto o legado (supervisorId/supervisorAdjId).
 * ---------------------------------------------------------------------
 */
(function (global) {
  'use strict';
  if (global.__LF_DEPT_MULTI_SUP_20260820__) return;
  global.__LF_DEPT_MULTI_SUP_20260820__ = true;

  var TAG = '[lf-dept-multi-sup]';
  function _warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  var CSS = ''
    + '.lf-msup-wrap{border:1.5px solid var(--b1);border-radius:8px;background:var(--bg3)}'
    + '.lf-msup-tools{display:flex;align-items:center;gap:6px;padding:6px;border-bottom:1px solid var(--b1)}'
    + '.lf-msup-search{flex:1 1 120px;min-width:100px;padding:7px 10px!important;min-height:32px!important;'
    + 'border-radius:8px;background:transparent;border:1px solid var(--b1);color:var(--tx);'
    + 'font-family:Outfit,sans-serif;font-size:.78rem;outline:none;width:auto!important;appearance:auto!important}'
    + '.lf-msup-search:focus{border-color:var(--amber,#E8B44F)}'
    + '.lf-msup-count{font-size:.68rem;color:var(--mu);white-space:nowrap;font-weight:600}'
    + '.lf-msup-list{max-height:150px;overflow-y:auto;padding:4px;overscroll-behavior:contain}'
    + '.lf-msup-row{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:8px;'
    + 'font-size:.78rem;cursor:pointer;user-select:none;-webkit-user-select:none;'
    + '-webkit-tap-highlight-color:transparent;min-height:36px}'
    + '.lf-msup-row:hover{background:rgba(255,255,255,.05)}'
    + '.lf-msup-row.on{background:rgba(232,180,79,.12)}'
    + '.lf-msup-row .lf-msup-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.lf-msup-row .lf-msup-cargo{font-size:.66rem;color:var(--mu);margin-left:6px;flex:0 0 auto}'
    + 'select.lf-msup-hidden{position:absolute!important;width:1px!important;height:1px!important;'
    + 'min-height:0!important;opacity:0!important;pointer-events:none!important;padding:0!important;'
    + 'border:none!important;appearance:auto!important;left:-9999px}';

  function injectCss() {
    if (document.getElementById('lf-msup-css')) return;
    var st = document.createElement('style');
    st.id = 'lf-msup-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* Esconde o <select multiple> nativo e monta a lista de linhas
     clicáveis ao lado. Seleção = marcar/desmarcar option.selected —
     saveDept() lê selectedOptions sem saber da diferença. */
  function skinSelect(sel, placeholder) {
    if (!sel || !sel.multiple) return;              // HTML antigo: não mexe
    if (sel.__lfMsupSkinned) { refreshRows(sel); return; }

    sel.__lfMsupSkinned = true;
    sel.classList.add('lf-msup-hidden');

    var wrap = document.createElement('div');
    wrap.className = 'lf-msup-wrap';
    wrap.innerHTML =
      '<div class="lf-msup-tools">'
      + '<input type="text" class="lf-msup-search" placeholder="' + (placeholder || 'Buscar...') + '">'
      + '<span class="lf-msup-count">0 selecionado(s)</span>'
      + '</div>'
      + '<div class="lf-msup-list"></div>';
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    sel.__lfMsupWrap = wrap;

    var search = wrap.querySelector('.lf-msup-search');
    search.addEventListener('input', function () {
      var q = norm(search.value);
      Array.prototype.forEach.call(wrap.querySelectorAll('.lf-msup-row'), function (row) {
        row.style.display = (!q || row.getAttribute('data-name').indexOf(q) >= 0) ? '' : 'none';
      });
    });
    /* Impede que Enter na busca submeta o modal/form */
    search.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });

    renderRows(sel);

    /* openDeptEditor() reescreve sel.innerHTML a cada abertura do modal —
       precisamos re-renderizar as linhas quando as options mudarem. */
    var mo = new MutationObserver(function () { renderRows(sel); });
    mo.observe(sel, { childList: true });
    sel.__lfMsupMo = mo;
  }

  function renderRows(sel) {
    var wrap = sel.__lfMsupWrap;
    if (!wrap) return;
    var list = wrap.querySelector('.lf-msup-list');
    var opts = Array.prototype.slice.call(sel.options);
    if (!opts.length) {
      list.innerHTML = '<div style="padding:10px 6px;text-align:center;color:var(--mu);font-size:.75rem">Nenhum usuário ativo encontrado.</div>';
    } else {
      list.innerHTML = '';
      opts.forEach(function (opt, i) {
        if (!opt.value) return; // option vazia (legado "Selecione.../Nenhum") não vira linha
        var row = document.createElement('label');
        row.className = 'lf-msup-row' + (opt.selected ? ' on' : '');
        row.setAttribute('data-name', norm(opt.textContent));
        row.setAttribute('data-idx', String(i));
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = opt.selected;
        var name = document.createElement('span');
        name.className = 'lf-msup-name';
        name.textContent = opt.textContent;
        row.appendChild(cb);
        row.appendChild(name);
        row.addEventListener('click', function (e) {
          e.preventDefault();
          opt.selected = !opt.selected;
          cb.checked = opt.selected;
          row.classList.toggle('on', opt.selected);
          updateCount(sel);
          /* dispara change pra qualquer listener existente */
          try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (_e) {}
        });
        list.appendChild(row);
      });
    }
    updateCount(sel);
  }

  function refreshRows(sel) { renderRows(sel); }

  function updateCount(sel) {
    var wrap = sel.__lfMsupWrap;
    if (!wrap) return;
    var n = Array.prototype.slice.call(sel.selectedOptions).filter(function (o) { return !!o.value; }).length;
    var c = wrap.querySelector('.lf-msup-count');
    if (c) c.textContent = n + ' selecionado' + (n === 1 ? '' : 's');
  }

  function install() {
    var sup = document.getElementById('dept-sup');
    var adj = document.getElementById('dept-sup-adj');
    if (!sup || !adj) return false;
    injectCss();
    skinSelect(sup, 'Buscar supervisor...');
    skinSelect(adj, 'Buscar adjunto...');
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
