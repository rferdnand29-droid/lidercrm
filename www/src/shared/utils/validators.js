/* =====================================================================
 * shared/utils/validators.js
 * ---------------------------------------------------------------------
 * Validadores genéricos de formulário. Biblioteca nova, aditiva.
 *
 * Uso:
 *   LiderCRM.utils.validators.email('a@b.com')       -> true
 *   LiderCRM.utils.validators.required('')            -> false
 *   LiderCRM.utils.validators.minLength('abc', 5)      -> false
 *   LiderCRM.utils.validators.inRange(10, 1, 5)        -> false
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var utils = root.utils = root.utils || {};
  if (utils.validators) return;

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  utils.validators = {
    email: function (v) { return EMAIL_RE.test(String(v || '').trim()); },
    required: function (v) { return v != null && String(v).trim() !== ''; },
    minLength: function (v, n) { return String(v == null ? '' : v).length >= n; },
    maxLength: function (v, n) { return String(v == null ? '' : v).length <= n; },
    inRange: function (v, min, max) { var n = parseFloat(v); return !isNaN(n) && n >= min && n <= max; }
  };
})(typeof window !== 'undefined' ? window : this);
