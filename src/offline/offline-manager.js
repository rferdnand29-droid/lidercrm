/* DEPRECATED: use src/core/offline/offline-manager.js */
(function(){
  if (typeof document === 'undefined') return;
  var s = document.createElement('script');
  s.src = 'src/core/offline/offline-manager.js';
  s.async = false;
  var cur = document.currentScript;
  if (cur && cur.parentNode) cur.parentNode.insertBefore(s, cur.nextSibling);
  else document.head.appendChild(s);
})();
