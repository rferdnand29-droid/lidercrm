/* =====================================================================
 * diagnostics/sync-monitor.js
 * ---------------------------------------------------------------------
 * Só LÊ o estado do RetryQueue/SyncManager que já existem
 * (src/modules/sync/runtime/retry-queue-sync.js) — não escreve, não
 * envolve (wrap) nenhum método deles, não muda o comportamento de
 * sincronização em nada. Serve pra ter um snapshot histórico de "quantos
 * itens pendentes tinha em cada momento", útil pra depurar relatos tipo
 * "ficou sem sincronizar".
 *
 * Uso:
 *   LiderCRM.diagnostics.sync.snapshot()   // { pendentes, itens, ts }
 *   LiderCRM.diagnostics.sync.startWatch(30000) // snapshot a cada 30s
 *   LiderCRM.diagnostics.sync.stopWatch()
 *   LiderCRM.diagnostics.sync.history()    // snapshots guardados
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var diag = root.diagnostics = root.diagnostics || {};
  if (diag.sync) return;

  var MAX = 200;
  var history = [];
  var timer = null;

  function snapshot() {
    var rq = global.RetryQueue;
    var pendentes = (rq && typeof rq.pending === 'function') ? rq.pending() : null;
    var itens = (rq && typeof rq.list === 'function') ? rq.list().map(function (o) { return { type: o.type, tries: o.tries, ts: o.ts }; }) : [];
    var entry = { ts: Date.now(), pendentes: pendentes, itens: itens };
    history.push(entry);
    if (history.length > MAX) history.shift();
    return entry;
  }

  function startWatch(everyMs) {
    stopWatch();
    timer = setInterval(snapshot, everyMs || 30000);
    snapshot();
    return true;
  }

  function stopWatch() {
    if (timer) { clearInterval(timer); timer = null; return true; }
    return false;
  }

  diag.sync = { snapshot: snapshot, startWatch: startWatch, stopWatch: stopWatch, history: function () { return history.slice(); } };
})(typeof window !== 'undefined' ? window : this);
