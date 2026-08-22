/* =====================================================================
 * shared/utils/telefone.js
 * ---------------------------------------------------------------------
 * Formatação/validação de telefone brasileiro (fixo e celular, com ou
 * sem DDI 55). Biblioteca nova, aditiva. Não substitui nenhuma
 * formatação de telefone que já exista espalhada no projeto (ex.:
 * callClient/openWhatsApp em kanban.js continuam como estão).
 *
 * Uso:
 *   LiderCRM.utils.telefone.format('11987654321')   -> '(11) 98765-4321'
 *   LiderCRM.utils.telefone.isValid('11987654321')  -> true
 *   LiderCRM.utils.telefone.strip('(11) 98765-4321') -> '11987654321'
 *   LiderCRM.utils.telefone.toE164('11987654321')   -> '+5511987654321'
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var utils = root.utils = root.utils || {};
  if (utils.telefone) return;

  function strip(v) { return String(v == null ? '' : v).replace(/[^\d]/g, ''); }

  // Remove DDI 55 se presente e o número resultante ainda bater com
  // 10 ou 11 dígitos (DDD + número).
  function localDigits(v) {
    var s = strip(v);
    if (s.length > 11 && s.slice(0, 2) === '55') s = s.slice(2);
    return s;
  }

  function isValid(v) {
    var s = localDigits(v);
    if (s.length !== 10 && s.length !== 11) return false;
    var ddd = parseInt(s.slice(0, 2), 10);
    if (ddd < 11 || ddd > 99) return false;
    // celular tem 9 dígitos e começa com 9 depois do DDD
    if (s.length === 11 && s[2] !== '9') return false;
    return true;
  }

  function format(v) {
    var s = localDigits(v);
    if (s.length === 11) return '(' + s.slice(0, 2) + ') ' + s.slice(2, 7) + '-' + s.slice(7);
    if (s.length === 10) return '(' + s.slice(0, 2) + ') ' + s.slice(2, 6) + '-' + s.slice(6);
    return v == null ? '' : String(v); // não reconhecido: devolve como veio
  }

  function toE164(v) {
    var s = localDigits(v);
    if (s.length !== 10 && s.length !== 11) return null;
    return '+55' + s;
  }

  utils.telefone = { strip: strip, isValid: isValid, format: format, toE164: toE164 };
})(typeof window !== 'undefined' ? window : this);
