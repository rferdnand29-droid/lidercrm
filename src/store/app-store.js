/* DEPRECATED: use src/shared/state/app-store.js */
(function(){
  if (typeof document === 'undefined') return;
  var s = document.createElement('script');
  s.src = 'src/shared/state/app-store.js';
  s.async = false;
  var cur = document.currentScript;
  if (cur && cur.parentNode) cur.parentNode.insertBefore(s, cur.nextSibling);
  else document.head.appendChild(s);
})();
