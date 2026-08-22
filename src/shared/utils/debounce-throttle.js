/* =====================================================================
 * shared/utils/debounce-throttle.js
 * ---------------------------------------------------------------------
 * Versões genéricas (padrão da indústria: recebem uma função, devolvem
 * uma função). NÃO SÃO a mesma coisa que o `debounce(key, fn, wait)`
 * de js/utils.js — aquela é por-chave (usada em ~20 lugares do projeto
 * pra debounce de auto-save) e continua exatamente como está. Esta
 * biblioteca é aditiva, pra quem quiser um debounce/throttle "normal"
 * de JS daqui pra frente, sem precisar inventar uma chave.
 *
 * Uso:
 *   var buscar = LiderCRM.utils.debounceFn(function(q){ ... }, 300);
 *   input.addEventListener('input', function(e){ buscar(e.target.value); });
 *
 *   var onScroll = LiderCRM.utils.throttleFn(function(){ ... }, 100);
 *   window.addEventListener('scroll', onScroll);
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var utils = root.utils = root.utils || {};
  if (utils.debounceFn && utils.throttleFn) return;

  function debounceFn(fn, wait) {
    var t = null;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 150);
    };
  }

  function throttleFn(fn, wait) {
    var last = 0, timer = null;
    return function () {
      var ctx = this, args = arguments;
      var now = Date.now();
      var remaining = (wait || 150) - (now - last);
      if (remaining <= 0) {
        clearTimeout(timer); timer = null;
        last = now;
        fn.apply(ctx, args);
      } else if (!timer) {
        timer = setTimeout(function () {
          last = Date.now(); timer = null;
          fn.apply(ctx, args);
        }, remaining);
      }
    };
  }

  utils.debounceFn = debounceFn;
  utils.throttleFn = throttleFn;
})(typeof window !== 'undefined' ? window : this);
