/* =====================================================================
 * diagnostics/duplicate-detector.js
 * ---------------------------------------------------------------------
 * Somente-leitura. Varre o DOM e a página em busca de 3 sintomas que
 * já causaram bug real neste projeto (ver
 * docs/troubleshooting.md — overlay fantasma / interval órfão /
 * flag de diagnóstico perdida por reembrulho):
 *
 *   1) IDs de elemento duplicados no DOM (getElementById só acha o
 *      primeiro — o segundo fica "invisível" pra qualquer código que
 *      dependa de id único).
 *   2) A mesma URL de <script> carregada mais de uma vez na página.
 *   3) Lista todas as flags de guarda `window.__LF_*` / `window.__lf*`
 *      já ativas — útil pra conferir rapidinho se um patch específico
 *      realmente rodou, sem precisar rolar o console inteiro.
 *
 * Uso:
 *   LiderCRM.diagnostics.duplicateDetector.scan()   // roda tudo, devolve relatório
 *   LiderCRM.diagnostics.duplicateDetector.ids()    // só os ids duplicados
 *   LiderCRM.diagnostics.duplicateDetector.scripts()// só os scripts duplicados
 *   LiderCRM.diagnostics.duplicateDetector.flags()  // só as flags __LF_ / __lf
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var diag = root.diagnostics = root.diagnostics || {};
  if (diag.duplicateDetector) return;
  var D = global.document;

  function ids() {
    var seen = Object.create(null);
    var dup = Object.create(null);
    D.querySelectorAll('[id]').forEach(function (el) {
      var id = el.id;
      if (!id) return;
      seen[id] = (seen[id] || 0) + 1;
      if (seen[id] > 1) dup[id] = seen[id];
    });
    return Object.keys(dup).map(function (id) { return { id: id, ocorrencias: dup[id] }; });
  }

  function scripts() {
    var seen = Object.create(null);
    var dup = [];
    D.querySelectorAll('script[src]').forEach(function (s) {
      var src = s.getAttribute('src').split('?')[0]; // ignora cache-bust na comparação
      seen[src] = (seen[src] || 0) + 1;
      if (seen[src] === 2) dup.push(src); // reporta só uma vez por caminho
    });
    return dup;
  }

  function flags() {
    var out = [];
    try {
      Object.keys(global).forEach(function (k) {
        if (/^__[Ll]f/.test(k) && global[k] === true) out.push(k);
      });
    } catch (_e) {}
    return out.sort();
  }

  function scan() {
    return { ids: ids(), scripts: scripts(), flags: flags(), ts: Date.now() };
  }

  diag.duplicateDetector = { scan: scan, ids: ids, scripts: scripts, flags: flags };
})(typeof window !== 'undefined' ? window : this);
