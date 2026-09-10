/* =====================================================================
 * lf-fix-bulk-stage-popover-definitivo-v2-20260908.js
 * ---------------------------------------------------------------------
 * FIX DEFINITIVO — "Selecionar por etapa" (seta ▾ ao lado de "✅ Todos").
 * Data: 2026-09-08. Cobre Leads, Negocios, desktop e mobile.
 *
 * CAUSA RAIZ (confirmada): o patch v1
 * (lf-fix-negocios-bulk-stage-popover-v1-20260907.js) rodava UMA unica
 * vez no DOMContentLoaded. Nesse momento o botao ▾ estava dentro de
 * #pg-negocios (display:none). Dependendo da ordem dos scripts/cache,
 * o handler nao era reanexado e o botao ficava "morto" — sem nenhum
 * erro no console. Somente Negocios tinha esse patch; Leads nunca teve
 * protecao nenhuma.
 *
 * O QUE ESTE PATCH FAZ (tudo defensivo, nao altera nenhum arquivo
 * existente):
 *   1. SUBSTITUI o patch v1 (respeita a guarda __lfNegBulkPatchApplied):
 *      se o v1 ja rodou, este patch neutraliza o listener dele para
 *      nao disparar em dobro.
 *   2. Reanexa os handlers TODA VEZ que a aba fica visivel (MutationObserver
 *      em #pg-leads/#pg-negocios), eliminando a dependencia do timing do
 *      DOMContentLoaded.
 *   3. Idempotente: 1 listener por botao (guarda __lfPatchedV2 no
 *      elemento) e onclick inline neutralizado (so o listener dispara).
 *   4. Funciona em mobile: os chips de etapa (mb-chips) continuam
 *      intactos — este patch so cuida do botao ▾ do desktop.
 *   5. Nao toca em js/kanban.js, css, nem em nenhum outro patch.
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__lfBulkStageDefV2) return; /* idempotente global */
  window.__lfBulkStageDefV2 = true;

  /* Se o patch v1 (Negocios) ja aplicou seu listener, neutralizamos o
     efeito dele para este novo patch ser o UNICO caminho (evita toggle
     duplo: abre+fecha no mesmo clique). */
  if (window.__lfNegBulkPatchApplied) {
    try {
      var _oldBtn = document.querySelector('#bulk-stage-wrap-negocios .bulk-stage-arrow');
      if (_oldBtn) {
        _oldBtn.onclick = null;
        _oldBtn.removeAttribute('onclick');
        /* remove o listener do v1 clonando o no (sem copiar listeners) */
        var _clone = _oldBtn.cloneNode(true);
        _oldBtn.parentNode.replaceChild(_clone, _oldBtn);
        delete _clone.__lfPatched;
      }
    } catch (_e) { /* silencioso */ }
  }

  function _lfAttachArrow(board) {
    var btn = document.querySelector('#bulk-stage-wrap-' + board + ' .bulk-stage-arrow');
    if (!btn || btn.__lfPatchedV2) return;
    btn.__lfPatchedV2 = true;
    /* neutraliza onclick inline: o listener passa a ser o UNICO caminho */
    btn.onclick = null;
    btn.removeAttribute('onclick');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (typeof window.toggleBulkStagePopover === 'function') {
        window.toggleBulkStagePopover(board);
      }
    });
  }

  function _lfAttachBoth() {
    _lfAttachArrow('leads');
    _lfAttachArrow('negocios');
  }

  /* Reanexa quando a aba fica visivel (classe .on) — cobre o caso de o
     DOMContentLoaded ter rodado com a aba oculta (display:none). */
  function _lfObservePg(pgId) {
    var pg = document.getElementById(pgId);
    if (!pg || pg.__lfBulkObsV2) return;
    pg.__lfBulkObsV2 = true;
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].attributeName === 'class' && pg.classList.contains('on')) {
          _lfAttachBoth();
        }
      }
    });
    obs.observe(pg, { attributes: true });
  }

  function _lfInit() {
    _lfAttachBoth();
    _lfObservePg('pg-leads');
    _lfObservePg('pg-negocios');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _lfInit, { once: true });
  } else {
    _lfInit();
  }
})();
