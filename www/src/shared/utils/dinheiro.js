/* =====================================================================
 * shared/utils/dinheiro.js
 * ---------------------------------------------------------------------
 * Formatação/parse de valores em Real. Biblioteca nova, aditiva.
 * NÃO substitui `fmtBRL()` (js/utils.js) — aquela função continua
 * sendo a usada por todo o app hoje. Esta é um superset opcional (tem
 * parse de volta pra número, que fmtBRL não tem) pra quem quiser usar
 * daqui pra frente.
 *
 * Uso:
 *   LiderCRM.utils.dinheiro.format(1234.5)         -> 'R$ 1.234,50'
 *   LiderCRM.utils.dinheiro.format(1234.5, {casas:0}) -> 'R$ 1.235' (igual fmtBRL)
 *   LiderCRM.utils.dinheiro.parse('R$ 1.234,50')   -> 1234.5
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var utils = root.utils = root.utils || {};
  if (utils.dinheiro) return;

  function format(v, opts) {
    opts = opts || {};
    var casas = opts.casas == null ? 2 : opts.casas;
    var n = parseFloat(v) || 0;
    return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  function parse(v) {
    if (typeof v === 'number') return v;
    var s = String(v == null ? '' : v).trim();
    s = s.replace(/^R\$\s?/, '').replace(/\./g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  utils.dinheiro = { format: format, parse: parse };
})(typeof window !== 'undefined' ? window : this);
