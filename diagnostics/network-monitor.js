/* =====================================================================
 * diagnostics/network-monitor.js
 * ---------------------------------------------------------------------
 * Estatística de sucesso/falha/latência de chamadas de rede.
 *
 * IMPORTANTE: por padrão isto NÃO envolve (wrap) window.fetch — só
 * fica pronto. Este projeto já tem pelo menos um wrap de fetch
 * (js/patches/lf-fix-raiz-token-quota-v1-20260801.js, pra garantir
 * Bearer token). Empilhar mais um wrap automático no boot seria
 * mudança de comportamento, então isso fica sob controle manual: só
 * ativa se alguém chamar LiderCRM.diagnostics.network.enable() explicitamente
 * (por exemplo, temporariamente, num console de produção, pra
 * investigar um problema pontual).
 *
 * Uso:
 *   LiderCRM.diagnostics.network.enable()   // liga o wrap (opt-in, manual)
 *   LiderCRM.diagnostics.network.disable()  // desliga, restaura fetch original
 *   LiderCRM.diagnostics.network.status()   // { total, ok, falhas, latenciaMediaMs }
 *   LiderCRM.diagnostics.network.recent(20) // últimas 20 chamadas
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var diag = root.diagnostics = root.diagnostics || {};
  if (diag.network) return;

  var MAX = 300;
  var calls = [];
  var origFetch = null;
  var enabled = false;

  function record(url, method, ok, ms, status) {
    calls.push({ url: String(url), method: method || 'GET', ok: !!ok, ms: Math.round(ms), status: status || 0, ts: Date.now() });
    if (calls.length > MAX) calls.shift();
  }

  function enable() {
    if (enabled || typeof global.fetch !== 'function') return false;
    origFetch = global.fetch;
    global.fetch = function (input, init) {
      var t0 = Date.now();
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var method = (init && init.method) || (input && input.method) || 'GET';
      return origFetch.apply(this, arguments).then(function (res) {
        record(url, method, res.ok, Date.now() - t0, res.status);
        return res;
      }, function (err) {
        record(url, method, false, Date.now() - t0, 0);
        throw err;
      });
    };
    enabled = true;
    return true;
  }

  function disable() {
    if (!enabled) return false;
    global.fetch = origFetch;
    enabled = false;
    return true;
  }

  function status() {
    var ok = 0, total = calls.length, sumMs = 0;
    calls.forEach(function (c) { if (c.ok) ok++; sumMs += c.ms; });
    return {
      total: total,
      ok: ok,
      falhas: total - ok,
      latenciaMediaMs: total ? Math.round(sumMs / total) : 0,
      ativo: enabled
    };
  }

  function recent(n) { return calls.slice(-1 * (n || 20)); }

  diag.network = { enable: enable, disable: disable, status: status, recent: recent, clear: function () { calls.length = 0; } };
})(typeof window !== 'undefined' ? window : this);
