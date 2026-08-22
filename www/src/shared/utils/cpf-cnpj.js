/* =====================================================================
 * shared/utils/cpf-cnpj.js
 * ---------------------------------------------------------------------
 * Validação e formatação de CPF/CNPJ. Biblioteca nova, aditiva —
 * NENHUM código existente foi alterado pra usar isto. Namespace
 * isolado (window.LiderCRM.utils.*) pra não colidir com nada global que já
 * existe no projeto (ex.: não criamos uma função solta `validar()`).
 *
 * Uso (quando algum patch futuro quiser):
 *   LiderCRM.utils.cpf.isValid('123.456.789-09')   -> true/false
 *   LiderCRM.utils.cpf.format('12345678909')       -> '123.456.789-09'
 *   LiderCRM.utils.cpf.strip('123.456.789-09')     -> '12345678909'
 *   LiderCRM.utils.cnpj.isValid(...) / .format(...) / .strip(...)
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var utils = root.utils = root.utils || {};
  if (utils.cpf && utils.cnpj) return; // idempotente

  function strip(v) { return String(v == null ? '' : v).replace(/[^\d]/g, ''); }

  function cpfIsValid(v) {
    var s = strip(v);
    if (s.length !== 11 || /^(\d)\1{10}$/.test(s)) return false;
    var sum = 0, i;
    for (i = 0; i < 9; i++) sum += parseInt(s[i], 10) * (10 - i);
    var d1 = (sum * 10) % 11; if (d1 === 10) d1 = 0;
    if (d1 !== parseInt(s[9], 10)) return false;
    sum = 0;
    for (i = 0; i < 10; i++) sum += parseInt(s[i], 10) * (11 - i);
    var d2 = (sum * 10) % 11; if (d2 === 10) d2 = 0;
    return d2 === parseInt(s[10], 10);
  }

  function cpfFormat(v) {
    var s = strip(v).slice(0, 11);
    return s.replace(/(\d{3})(\d)/, '$1.$2')
             .replace(/(\d{3})(\d)/, '$1.$2')
             .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  function cnpjIsValid(v) {
    var s = strip(v);
    if (s.length !== 14 || /^(\d)\1{13}$/.test(s)) return false;
    var calc = function (base) {
      var weights = base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      var sum = 0;
      for (var i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * weights[i];
      var r = sum % 11;
      return r < 2 ? 0 : 11 - r;
    };
    var d1 = calc(s.slice(0, 12));
    if (d1 !== parseInt(s[12], 10)) return false;
    var d2 = calc(s.slice(0, 13));
    return d2 === parseInt(s[13], 10);
  }

  function cnpjFormat(v) {
    var s = strip(v).slice(0, 14);
    return s.replace(/(\d{2})(\d)/, '$1.$2')
             .replace(/(\d{3})(\d)/, '$1.$2')
             .replace(/(\d{3})(\d)/, '$1/$2')
             .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }

  utils.cpf = { isValid: cpfIsValid, format: cpfFormat, strip: strip };
  utils.cnpj = { isValid: cnpjIsValid, format: cnpjFormat, strip: strip };
})(typeof window !== 'undefined' ? window : this);
