/* =====================================================================
 * lf-fix-leads-bulk-stage-popover-v1-20260910.js
 * ---------------------------------------------------------------------
 * FIX — "Selecionar por etapa" (seta ▾ ao lado de "✅ Todos") na aba
 * LEADS (#pg-leads). Data: 2026-09-10.
 *
 * SINTOMA: na aba Leads o ▾ não abre o popover ao clicar; na aba
 * Negócios abre normalmente.
 *
 * CAUSA RAIZ (confirmada por leitura de código):
 *   O botão ▾ de Leads em index.html/app.html tem onclick INLINE
 *   (toggleBulkStagePopover('leads')). O patch definitivo v2
 *   (lf-fix-bulk-stage-popover-definitivo-v2-20260908.js) anexa um
 *   addEventListener com a MESMA chamada e só neutraliza o onclick
 *   inline quando window.__lfNegBulkPatchApplied está setado — caminho
 *   que só roda para o botão de NEGÓCIOS. O botão de LEADS nunca passa
 *   por essa neutralização (o v1, que fazia isso, é exclusivo de
 *   Negócios). Resultado: stopPropagation() NÃO impede outros listeners
 *   no MESMO elemento — onclick inline + listener do v2 disparam juntos:
 *   a 1ª chamada ABRE o popover e a 2ª FECHA (toggle duplo no mesmo
 *   clique). A seta parece "morta", sem nenhum erro no console.
 *   (Em Negócios o próprio patch v1 já tinha corrigido exatamente esse
 *   toggle duplo — ver comentário BUGFIX 20260907 naquele arquivo.)
 *
 * O QUE ESTE PATCH FAZ (defensivo, não altera nenhum arquivo existente):
 *   1. CLONA o botão ▾ de Leads (cloneNode não copia listeners) —
 *      elimina de uma vez o onclick inline E o listener do patch v2.
 *   2. Marca o clone com __lfPatchedV2 = true para que o MutationObserver
 *      do patch v2 NÃO reanexe o listener dele quando a aba ficar
 *      visível (isso recriaria o toggle duplo).
 *   3. Anexa UM único listener que chama toggleBulkStagePopover('leads').
 *   4. Idempotente (guard global + guard no elemento) e reanexa se a
 *      aba Leads ficar visível depois (MutationObserver em #pg-leads),
 *      cobrindo re-renders que substituam o botão.
 *   5. Não toca em Negócios (já corrigido), nem em js/kanban.js.
 *
 * OBS: a parte CSS do problema (overflow:hidden em .bulk-stage-wrap de
 * Leads cortando o popover, mesmo bug que Negócios teve) está corrigida
 * em css/lf-fix-leads-popover-light-cards-v1-20260910.css (Seção A).
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__lfLeadsBulkPopFixV1) return; /* idempotente global */
  window.__lfLeadsBulkPopFixV1 = true;

  function _lfAttachLeadsArrow() {
    var btn = document.querySelector('#bulk-stage-wrap-leads .bulk-stage-arrow');
    if (!btn || btn.__lfLeadsPopFixV1) return;

    /* Clona o nó: cloneNode(true) NÃO copia listeners — remove de uma vez
       o listener do patch v2 e qualquer outro handler herdado. */
    var clone = btn.cloneNode(true);
    clone.onclick = null;
    clone.removeAttribute('onclick');
    /* Mantém a bandeira do v2 SETADA de propósito: o MutationObserver do
       patch v2 testa __lfPatchedV2 antes de reanexar — com ela presente,
       o v2 nunca recoloca o listener dele neste botão (evita toggle duplo). */
    clone.__lfPatchedV2 = true;
    clone.__lfPatched = true;
    clone.__lfLeadsPopFixV1 = true;
    btn.parentNode.replaceChild(clone, btn);

    clone.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (typeof window.toggleBulkStagePopover === 'function') {
        window.toggleBulkStagePopover('leads');
      }
    });
  }

  /* Reanexa quando a aba fica visível (classe .on) — cobre re-render que
     substitua o botão depois do DOMContentLoaded. */
  function _lfObserveLeadsPg() {
    var pg = document.getElementById('pg-leads');
    if (!pg || pg.__lfLeadsPopObs) return;
    pg.__lfLeadsPopObs = true;
    var obs = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].attributeName === 'class' && pg.classList.contains('on')) {
          _lfAttachLeadsArrow();
        }
      }
    });
    obs.observe(pg, { attributes: true });
  }

  function _lfInit() {
    _lfAttachLeadsArrow();
    _lfObserveLeadsPg();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _lfInit, { once: true });
  } else {
    _lfInit();
  }
})();
