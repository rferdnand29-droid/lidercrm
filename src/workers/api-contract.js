/* =====================================================================
 * DEPRECATED: use src/core/contracts/api-contract.js
 * Este arquivo é apenas um re-export para preservar compatibilidade
 * com <script src="src/workers/api-contract.js"> ainda referenciado
 * em app.html/index.html até que o próximo build faça a atualização.
 * ===================================================================== */
(function(){
  var s = document.createElement('script');
  s.src = 'src/core/contracts/api-contract.js';
  s.async = false;
  document.currentScript && document.currentScript.parentNode
    ? document.currentScript.parentNode.insertBefore(s, document.currentScript.nextSibling)
    : document.head.appendChild(s);
})();
