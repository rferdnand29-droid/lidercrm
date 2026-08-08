/* =====================================================================
 * shared/utils/datas.js
 * ---------------------------------------------------------------------
 * Formatação de datas. Biblioteca nova, aditiva. NÃO substitui
 * today()/_parseLocalDate()/_formatScheduledAt() de js/utils.js —
 * aquelas continuam em uso. Isto cobre o que faltava: label relativo
 * tipo "visto há 5 min" (o mesmo padrão que
 * js/patches/chat/presenca/lf-presence-group-login-final-20260730.js
 * já implementa por conta própria — aqui fica reutilizável pra
 * qualquer módulo futuro, sem duplicar a lógica de novo).
 *
 * Uso:
 *   LiderCRM.utils.datas.relativo('2026-08-01T10:00:00Z') -> 'há 5 min' / 'há 2 h' / '01/08 10:00'
 *   LiderCRM.utils.datas.brDate(new Date())                -> '01/08/2026'
 *   LiderCRM.utils.datas.brDateTime(new Date())             -> '01/08/2026 10:00'
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var utils = root.utils = root.utils || {};
  if (utils.datas) return;

  function pad2(n) { return String(n).padStart(2, '0'); }

  function brDate(v) {
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function brDateTime(v) {
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    return brDate(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function relativo(v) {
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    var diff = Date.now() - d.getTime();
    if (diff < 0) return brDateTime(d);
    if (diff < 60000) return 'agora mesmo';
    if (diff < 3600000) return 'há ' + Math.max(1, Math.floor(diff / 60000)) + ' min';
    if (diff < 86400000) return 'há ' + Math.max(1, Math.floor(diff / 3600000)) + ' h';
    if (diff < 172800000) return 'ontem às ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    return brDateTime(d);
  }

  utils.datas = { brDate: brDate, brDateTime: brDateTime, relativo: relativo };
})(typeof window !== 'undefined' ? window : this);
