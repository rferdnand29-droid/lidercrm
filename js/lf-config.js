/* =====================================================================
 * js/lf-config.js — fonte única de configuração do Líder CRM
 * ---------------------------------------------------------------------
 * Este arquivo é carregado antes dos módulos do app e concentra valores
 * de ambiente, versão, cache e sincronização. Os módulos continuam
 * expondo os nomes globais legados, mas leem os valores daqui.
 *
 * Para alterar o comportamento do app, prefira editar este arquivo.
 * __LF_CONFIG_OVERRIDES__ pode ser definido antes dele em um deploy
 * específico, sem alterar a configuração padrão do produto.
 * ===================================================================== */
(function(global){
  'use strict';

  // Mantido como literal simples para o verificador de atualização poder
  // descobrir a versão remota sem executar um arquivo vindo da rede.
  global.LF_CONFIG_VERSION = '20260928-realtime3';

  var root = global.LiderCRM = global.LiderCRM || {};
  var overrides = global.__LF_CONFIG_OVERRIDES__ || {};

  function number(value, fallback){
    var parsed = Number(value);
    return isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function meta(name){
    try {
      var el = document.querySelector('meta[name="' + name + '"]');
      return el && el.getAttribute('content') ? el.getAttribute('content').trim() : '';
    } catch(_e) {
      return '';
    }
  }

  function pick(name, fallback, metaName){
    var override = overrides[name];
    if (override !== undefined && override !== null && override !== '') return override;
    var fromMeta = meta(metaName || ('lf-' + name.replace(/[A-Z]/g, function(c){ return '-' + c.toLowerCase(); })));
    return fromMeta || fallback;
  }

  var native = false;
  try {
    native = !!(global.Capacitor &&
      typeof global.Capacitor.isNativePlatform === 'function' &&
      global.Capacitor.isNativePlatform());
  } catch(_e) {}

  var cache = {
    anonymousSessionKey: pick('anonymousSessionKey', 'lf_sb_anon_cache_v2'),
    anonymousSessionTtlMs: number(pick('anonymousSessionTtlMs', 30 * 60 * 1000), 30 * 60 * 1000),
    apiDefaultTtlMs: number(pick('apiDefaultTtlMs', 15000), 15000),
    feedTtlMs: number(pick('feedTtlMs', 5000), 5000),
    notificationsTtlMs: number(pick('notificationsTtlMs', 4000), 4000),
    dashboardTtlMs: number(pick('dashboardTtlMs', 8000), 8000),
    feedMaxItems: number(pick('feedMaxItems', 20000), 20000)
  };

  var sync = {
    kanbanPollMs: number(pick('kanbanPollMs', 15000), 15000),
    agendaPollMs: number(pick('agendaPollMs', 6000), 6000),
    globalChatPollMs: number(pick('globalChatPollMs', 5000), 5000),
    globalInboxPollMs: number(pick('globalInboxPollMs', 15000), 15000),
    brandingPollMs: number(pick('brandingPollMs', 20000), 20000),
    brandingFastMs: number(pick('brandingFastMs', 1500), 1500),
    fetchTimeoutMs: number(pick('syncFetchTimeoutMs', 15000), 15000),
    retryMaxTries: number(pick('retryMaxTries', 30), 30),
    retryBackoffBaseMs: number(pick('retryBackoffBaseMs', 15000), 15000),
    retryBackoffMaxMs: number(pick('retryBackoffMaxMs', 960000), 960000),
    staleToLivreDays: number(pick('staleToLivreDays', 3), 3),
    realtimeRetryMinMs: number(pick('realtimeRetryMinMs', 10000), 10000),
    realtimeRetryMaxMs: number(pick('realtimeRetryMaxMs', 60000), 60000)
  };

  var config = {
    appName: String(pick('appName', 'Líder CRM', 'lf-app-name')),
    appShortName: String(pick('appShortName', 'LIDER CRM', 'lf-app-short-name')),
    appVersion: String(pick('appVersion', global.LF_CONFIG_VERSION, 'lf-app-version')),
    bundleVersion: String(pick('bundleVersion', 'arch-audit-20260717', 'lf-bundle-version')),
    apiBase: String(pick('apiBase', native ? 'https://liderfinanceira.com' : '', 'lf-api-base')).replace(/\/+$/, ''),
    apiPath: '/api',
    apiVersion: 'v1',
    workerBaseUrl: '/api',
    workerVersion: 'v1',
    workerHealthPath: '/api/v1/health',
    requestTimeoutMs: number(pick('requestTimeoutMs', 15000), 15000),
    safeMode: true,
    apiReady: true,
    useWorkerApi: true,
    useWorkerUpload: true,
    useWorkerNotifications: true,
    useLegacyAuthBridge: true,
    sessionRefreshWindowSeconds: 5 * 60,
    cache: cache,
    sync: sync,
    update: {
      checkIntervalMs: number(pick('updateCheckIntervalMs', 4 * 60 * 1000), 4 * 60 * 1000),
      maxWaitForIdleMs: number(pick('updateMaxWaitForIdleMs', 2 * 60 * 1000), 2 * 60 * 1000),
      initialDelayMs: number(pick('updateInitialDelayMs', 30000), 30000)
    },
    auth: {
      sdkPollLimitWeb: number(pick('sdkPollLimitWeb', 12), 12),
      sdkPollLimitNative: number(pick('sdkPollLimitNative', 40), 40),
      signInTimeoutMsWeb: number(pick('signInTimeoutMsWeb', 7000), 7000),
      signInTimeoutMsNative: number(pick('signInTimeoutMsNative', 18000), 18000)
    }
  };

  // Compatibilidade: o restante do app usa estes aliases históricos.
  root.config = config;
  root.apiBase = config.apiBase;
  global.LF_CONFIG = config;
  global.LF_APP_NAME = config.appName;
  global.__LF_API_BASE = config.apiBase;
})(window);