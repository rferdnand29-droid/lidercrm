/* DEPRECATED: use src/core/offline/retry-queue.js */
(function(){
  if (typeof document === 'undefined') return;
  var s = document.createElement('script');
  s.src = 'src/core/offline/retry-queue.js';
  s.async = false;
  var cur = document.currentScript;
  if (cur && cur.parentNode) cur.parentNode.insertBefore(s, cur.nextSibling);
  else document.head.appendChild(s);
})();
