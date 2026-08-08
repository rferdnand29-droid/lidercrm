/* =====================================================================
 * diagnostics/performance.js
 * ---------------------------------------------------------------------
 * Marca operações lentas usando a Performance API do navegador.
 * Somente-leitura/observacional — não envolve (wrap) nenhuma função
 * existente automaticamente. Pronto pra uso futuro.
 *
 * Relevante pro tipo de bug que já apareceu neste projeto hoje: o
 * "[Violation] 'click' handler took 155ms" que o Chrome mesmo já
 * reporta é exatamente o tipo de coisa que isto ajuda a rastrear de
 * forma estruturada (guardando histórico), em vez de depender de
 * alguém estar de olho no console no momento exato.
 *
 * Uso:
 *   var fim = LiderCRM.diagnostics.performance.start('renderChatList');
 *   // ...trabalho...
 *   fim(); // registra a duração
 *
 *   LiderCRM.diagnostics.performance.report()      // últimas medições
 *   LiderCRM.diagnostics.performance.slowest(10)   // top 10 mais lentas
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var diag = root.diagnostics = root.diagnostics || {};
  if (diag.performance) return;

  var MAX = 300;
  var records = [];
  var hasPerf = !!(global.performance && typeof global.performance.now === 'function');
  function now() { return hasPerf ? global.performance.now() : Date.now(); }

  function start(label) {
    var t0 = now();
    var done = false;
    return function stop() {
      if (done) return; // idempotente — chamar stop() 2x não duplica registro
      done = true;
      var dur = now() - t0;
      records.push({ label: label, ms: Math.round(dur * 100) / 100, ts: Date.now() });
      if (records.length > MAX) records.shift();
      return dur;
    };
  }

  function report() { return records.slice(); }

  function slowest(n) {
    return records.slice().sort(function (a, b) { return b.ms - a.ms; }).slice(0, n || 10);
  }

  diag.performance = { start: start, report: report, slowest: slowest, clear: function () { records.length = 0; } };
})(typeof window !== 'undefined' ? window : this);
