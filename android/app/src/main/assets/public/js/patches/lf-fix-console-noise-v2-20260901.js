/* =====================================================================
 * lf-fix-console-noise-v2-20260901.js
 * ---------------------------------------------------------------------
 * OBJETIVO
 *   Silenciar warns/erros de origem JÁ DIAGNOSTICADA como não-acionável,
 *   preservando 100% dos erros reais do CRM. Console limpo = bugs reais
 *   visíveis.
 *
 * O QUE SUPRIME (e por quê)
 *   1) Erros de scripts injetados por extensão do navegador
 *      (assinatura "VM###" / chrome-extension: / moz-extension:).
 *      Confirmado: o "et.reportAllChanges / startTime" é da lib web-vitals
 *      do Google, injetada por extensões de SEO/performance — não existe
 *      no nosso código-fonte (grep em js/, src/, www/, *.html = 0 hits).
 *      Ver docs/relatorios-historico/RELATORIO-CORRECAO-ERROS-CONSOLE-404-VIDEO-20261010.md
 *   2) O warn do safety-net de 12s QUANDO o watchdog de 10s
 *      (lf-splash-unstuck) já forçou a saída — mesmo evento, dois logs.
 *   3) Repetições do warn de supressão destravada — o hotfix v1 já tem
 *      dedup interno de 10s; aqui é uma segunda camada de segurança.
 *
 * O QUE NÃO TOCA
 *   - console.error de código do CRM (src real, com arquivo/linha)
 *   - console.warn de eventos novos/únicos
 *   - qualquer lógica de negócio (é só filtro de LOG)
 *
 * ORDEM DE CARGA
 *   Deve carregar DEPOIS de lf-fix-safety-net-diag-v1-20260804.js
 *   (que já instala o primeiro wrap de console.warn — este aqui
 *   envolve o wrap dele, na camada mais externa).
 *
 * ROLLBACK: remover a linha <script> em app.html / index.html.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_CONSOLE_NOISE_V2__) return;
  global.__LF_FIX_CONSOLE_NOISE_V2__ = true;

  /* ---------- 1) Filtro de console.warn / console.error -------------- */
  var _origWarn  = console.warn.bind(console);
  var _origError = console.error.bind(console);

  /* Warns redundantes de sistemas que já têm dedup próprio — segunda
     camada de segurança caso o dedup interno falhe por race. */
  var NOISE_WARN_PATTERNS = [
    /^\[safety-net\] forçando saída da splash/,   // dedup via flag abaixo
    /^\[lf-notif-sound-stuck-fix\] supressão travada/,  // watchdog removido; se algum build antigo sobrar no cache, engole
    /^\[lf-hotfix-notif-ativ-v1\] supressão travada/    // dedup interno 10s; aqui: 30s
  ];

  var _lastNoiseAt = {}; // tag -> ts do último log permitido

  console.warn = function () {
    try {
      var a0 = String(arguments[0] || '');

      /* 2) safety-net de 12s depois do unstuck de 10s → silêncio total */
      if (NOISE_WARN_PATTERNS[0].test(a0)) {
        if (global.__LF_SPLASH_UNSTUCK_FIRED__ || global.__LF_SAFETYNET_WARNED__) return;
        /* senão, deixa o safetynet-diag tratar (ele marca a flag) */
        return _origWarn.apply(console, arguments);
      }

      /* 3) warns de supressão: segunda camada de dedup (30s) */
      if (NOISE_WARN_PATTERNS[1].test(a0)) return; // watchdog antigo desativado
      if (NOISE_WARN_PATTERNS[2].test(a0)) {
        var now = Date.now();
        if (_lastNoiseAt['sup'] && (now - _lastNoiseAt['sup']) < 30000) return;
        _lastNoiseAt['sup'] = now;
        return _origWarn.apply(console, arguments);
      }
    } catch (_e) {}
    return _origWarn.apply(console, arguments);
  };

  /* ---------- 1b) Erros de extensão (VM###) no console.error --------- */
  console.error = function () {
    try {
      /* O window.onerror do safetynet-diag já retorna true p/ VM*,
         mas alguns browsers logam "Uncaught ..." via console.error
         independentemente. Se a mensagem é a assinatura conhecida da
         web-vitals injetada por extensão, engole. */
      var a0 = String(arguments[0] || '');
      if (/reportAllChanges|web-vitals|Cannot read properties of undefined \(reading 'startTime'\)/.test(a0)) {
        var stack = (arguments[0] && arguments[0].stack) ? String(arguments[0].stack) : a0;
        if (/VM\d+|chrome-extension:|moz-extension:|safari-web-extension:/.test(stack) || stack.indexOf('.js') === -1) {
          return; // extensão — não é nosso código
        }
      }
    } catch (_e) {}
    return _origError.apply(console, arguments);
  };

  /* ---------- Diagnóstico manual ------------------------------------ */
  global.LF_CONSOLE_NOISE_V2 = {
    version: 'v2-20260901',
    /* No console do usuário: LF_CONSOLE_NOISE_V2.stats() mostra o que foi suprimido */
    _suppressed: { vmErrors: 0, splashDup: 0, supWarnDup: 0 },
    stats: function () { return JSON.parse(JSON.stringify(this._suppressed)); }
  };

  /* Contadores reais (os returns acima são early-exit silencioso; aqui
     contamos para o stats() sem spammar o console) — implementado via
     wrapper leve de performance.now-free. */
  var _stats = global.LF_CONSOLE_NOISE_V2._suppressed;
  var _w = console.warn, _e2 = console.error;
  console.warn = function () {
    try {
      var a0 = String(arguments[0] || '');
      if (NOISE_WARN_PATTERNS[0].test(a0) && (global.__LF_SPLASH_UNSTUCK_FIRED__ || global.__LF_SAFETYNET_WARNED__)) { _stats.splashDup++; return; }
      if (NOISE_WARN_PATTERNS[1].test(a0)) { _stats.supWarnDup++; return; }
    } catch (_e) {}
    return _w.apply(console, arguments);
  };
  console.error = function () {
    try {
      var a0 = String(arguments[0] || '');
      if (/reportAllChanges|web-vitals|reading 'startTime'/.test(a0)) {
        var stack = (arguments[0] && arguments[0].stack) ? String(arguments[0].stack) : a0;
        if (/VM\d+|chrome-extension:|moz-extension:|safari-web-extension:/.test(stack) || stack.indexOf('.js') === -1) {
          _stats.vmErrors++; return;
        }
      }
    } catch (_e) {}
    return _e2.apply(console, arguments);
  };
})(window);
