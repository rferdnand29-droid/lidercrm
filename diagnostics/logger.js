/* =====================================================================
 * diagnostics/logger.js
 * ---------------------------------------------------------------------
 * Logger central opcional. Pronto pra uso futuro — hoje NÃO é
 * carregado por index.html/app.html, então não muda nada em produção
 * até alguém decidir incluir a tag <script>.
 *
 * Guarda os últimos N logs em memória (buffer circular) pra poder
 * inspecionar depois de um bug acontecer, sem precisar já ter o
 * DevTools aberto no momento exato — é só rodar
 * window.LiderCRM.diagnostics.logger.dump() no console depois.
 *
 * Uso:
 *   LiderCRM.diagnostics.logger.info('chat', 'conversa aberta', {convId});
 *   LiderCRM.diagnostics.logger.warn('kanban', 'card sem board', {cardId});
 *   LiderCRM.diagnostics.logger.error('sync', 'falha ao salvar', err);
 *   LiderCRM.diagnostics.logger.dump()              // devolve o buffer inteiro
 *   LiderCRM.diagnostics.logger.dump('chat')        // só logs da área 'chat'
 *   LiderCRM.diagnostics.logger.setConsoleEcho(false) // para de espelhar no console
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var diag = root.diagnostics = root.diagnostics || {};
  if (diag.logger) return;

  var MAX = 500;
  var buffer = [];
  var echo = true; // por padrão também espelha no console, igual ao app já faz

  function push(level, area, msg, data) {
    var entry = { ts: Date.now(), level: level, area: area || 'geral', msg: msg, data: data };
    buffer.push(entry);
    if (buffer.length > MAX) buffer.shift();
    if (echo) {
      try {
        var fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
        fn.call(console, '[' + area + ']', msg, data !== undefined ? data : '');
      } catch (_e) {}
    }
    return entry;
  }

  diag.logger = {
    debug: function (area, msg, data) { return push('debug', area, msg, data); },
    info:  function (area, msg, data) { return push('info', area, msg, data); },
    warn:  function (area, msg, data) { return push('warn', area, msg, data); },
    error: function (area, msg, data) { return push('error', area, msg, data); },
    dump: function (areaFilter) {
      if (!areaFilter) return buffer.slice();
      return buffer.filter(function (e) { return e.area === areaFilter; });
    },
    clear: function () { buffer.length = 0; },
    setConsoleEcho: function (v) { echo = !!v; }
  };
})(typeof window !== 'undefined' ? window : this);
