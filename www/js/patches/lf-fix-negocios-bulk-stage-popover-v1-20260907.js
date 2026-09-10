/* =====================================================================
 * lf-fix-negocios-bulk-stage-popover-v1-20260907.js
 * ---------------------------------------------------------------------
 * PATCH DEFENSIVO IDEMPOTENTE — popover "Selecionar por etapa" (▾ ao
 * lado de "✅ Todos") na aba Negócios (#pg-negocios).
 *
 * Contexto: o JS principal (js/kanban.js) já tem toggleBulkStagePopover
 * e selectAllKBCardsByStage corretos e compartilhados com Leads — em
 * Leads o popover abre normalmente. A causa raiz em Negócios é CSS
 * (overflow/z-index), já corrigida em
 * css/lf-negocios-visual-final-v1-20260907.css (seção 3b).
 *
 * Este patch é uma REDE DE SEGURANÇA: se por qualquer motivo o handler
 * inline onclick do botão ▾ for perdido/sobrescrito (ex.: re-render,
 * extensão, ordem de scripts), reanexamos UM listener de click que
 * chama toggleBulkStagePopover('negocios').
 *
 * Garantias:
 *   - Idempotente: roda no máximo 1x por página (guard global) e
 *     no máximo 1 listener por botão (guard __lfPatched no elemento).
 *   - Não altera js/kanban.js nem nenhuma outra lógica existente.
 *   - Não interfere em Leads (#pg-leads) nem em mobile.
 * ===================================================================== */
(function(){
  'use strict';
  if (window.__lfNegBulkPatchApplied) return;
  window.__lfNegBulkPatchApplied = true;

  function lfPatchNegBulkArrow(){
    var btn = document.querySelector('#bulk-stage-wrap-negocios .bulk-stage-arrow');
    if (!btn || btn.__lfPatched) return;
    btn.__lfPatched = true;
    // BUGFIX 20260907: o botao tem onclick INLINE (toggleBulkStagePopover('negocios'))
    // E este patch anexava um listener com a MESMA chamada. stopPropagation() NAO
    // impede outros listeners no MESMO elemento - as duas chamadas disparavam no
    // mesmo clique: a 1a ABRIA o popover e a 2a FECHAVA (toggle duplo). Resultado:
    // a setinha parecia "morta" so em Negocios. Correcao: o listener passa a ser o
    // UNICO caminho - neutralizamos o onclick inline antes de anexar.
    btn.onclick = null;
    btn.removeAttribute('onclick');
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      if (typeof window.toggleBulkStagePopover === 'function'){
        window.toggleBulkStagePopover('negocios');
      }
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', lfPatchNegBulkArrow, { once: true });
  } else {
    lfPatchNegBulkArrow();
  }
})();
