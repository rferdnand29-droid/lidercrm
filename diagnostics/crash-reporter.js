/* =====================================================================
 * diagnostics/crash-reporter.js
 * ---------------------------------------------------------------------
 * ATENÇÃO — antes de mexer aqui: o projeto JÁ TEM um handler de erro
 * em `window.onerror = function(...)` (index.html/app.html, perto do
 * boot) e mais dois em js/app.js via addEventListener('error'/
 * 'unhandledrejection'). Por isso este arquivo:
 *   - NUNCA atribui `window.onerror = ...` (isso SOBRESCREVERIA o
 *     handler que já existe — mudança de comportamento real).
 *   - Só usa addEventListener('error'/'unhandledrejection', ...), que
 *     empilha SEM remover os handlers existentes — todos continuam
 *     disparando normalmente, este é só mais um observador.
 *   - Nunca chama preventDefault()/stopPropagation() nesses eventos.
 *
 * Pronto pra uso futuro; não carregado por index.html/app.html hoje.
 *
 * Uso:
 *   LiderCRM.diagnostics.crashReporter.enable()
 *   LiderCRM.diagnostics.crashReporter.report()   // erros capturados até agora
 *   LiderCRM.diagnostics.crashReporter.disable()
 * ===================================================================== */
(function (global) {
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var diag = root.diagnostics = root.diagnostics || {};
  if (diag.crashReporter) return;

  var MAX = 200;
  var buffer = [];
  var enabled = false;
  var onError, onRejection;

  /* ADIÇÃO 2026-08-05: persistência em localStorage, além do buffer em
     memória. Motivo: investigando fechamento total do app Capacitor ao
     entrar na aba Papo — se o processo morrer de verdade (não só um
     erro JS capturável), o buffer em memória some junto. Gravando cada
     entrada também em localStorage (com limite curto, 30 entradas),
     dá pra abrir o app de novo depois do fechamento e ainda ler o que
     aconteceu logo antes, via:
       JSON.parse(localStorage.getItem('lf_crash_log')||'[]')
     Mantém tudo mais: nunca sobrescreve window.onerror, nunca chama
     preventDefault, só mais um observer empilhado. */
  var LS_KEY = 'lf_crash_log';
  var LS_MAX = 30;
  function persist(entry) {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      arr.push(entry);
      if (arr.length > LS_MAX) arr = arr.slice(arr.length - LS_MAX);
      global.localStorage.setItem(LS_KEY, JSON.stringify(arr));
    } catch (_e) { /* localStorage indisponível/cheio — não é crítico */ }
  }

  function push(entry) {
    buffer.push(entry);
    if (buffer.length > MAX) buffer.shift();
    persist(entry);
  }

  function enable() {
    if (enabled) return false;
    onError = function (ev) {
      push({
        tipo: 'error',
        msg: ev.message || String(ev.error || ''),
        arquivo: ev.filename || '',
        linha: ev.lineno || 0,
        coluna: ev.colno || 0,
        stack: (ev.error && ev.error.stack) || null,
        ts: Date.now()
      });
      // NÃO chama preventDefault — deixa o handler existente do projeto agir normalmente.
    };
    onRejection = function (ev) {
      var reason = ev.reason;
      push({
        tipo: 'unhandledrejection',
        msg: (reason && reason.message) || String(reason),
        stack: (reason && reason.stack) || null,
        ts: Date.now()
      });
    };
    global.addEventListener('error', onError);
    global.addEventListener('unhandledrejection', onRejection);
    enabled = true;
    return true;
  }

  function disable() {
    if (!enabled) return false;
    global.removeEventListener('error', onError);
    global.removeEventListener('unhandledrejection', onRejection);
    enabled = false;
    return true;
  }

  diag.crashReporter = {
    enable: enable,
    disable: disable,
    report: function () { return buffer.slice(); },
    clear: function () {
      buffer.length = 0;
      try { global.localStorage.removeItem(LS_KEY); } catch (_e) {}
    },
    /* ADIÇÃO 2026-08-05: marcador de "aconteceu isso, agora" — pra
       investigar fechamento total do app (sem erro JS nenhum antes,
       o que aconteceria num crash nativo/OOM real). Chamado manualmente
       em pontos de interesse (ver js/chat.js initChatPage). Persiste
       igual aos erros — dá pra ver depois "a última coisa que
       aconteceu foi X, e o app nunca gravou mais nada depois disso",
       que já é evidência (aponta pro trecho entre X e o próximo passo
       esperado). */
    breadcrumb: function (label, extra) {
      push({ tipo: 'breadcrumb', msg: String(label || ''), extra: extra || null, ts: Date.now() });
    },
    reportPersisted: function () {
      try {
        var raw = global.localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch (_e) { return []; }
    }
  };
})(typeof window !== 'undefined' ? window : this);
