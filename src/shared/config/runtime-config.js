// AUDIT-HARDENED 2026-07-17 — leitura via <meta> injetada no HTML de deploy.
// Fallback preserva os defaults antigos para o modo dev/local.
(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  root.config = root.config || {};
  root.config.appName = 'Lider CRM';
  // Fase 3.3 — doLogin() do frontend chama POST /api/v1/login
  // diretamente (ver js/auth.js). A ponte legada (Fase 3.2) continua
  // ativa como rede de segurança para sessões que já estavam abertas
  // antes do deploy desta fase.
  root.config.archVersion = 'phase3.3-direct-login-20260717';
  root.config.workerBaseUrl = '/api';
  root.config.workerVersion = 'v1';
  root.config.workerHealthPath = '/api/v1/health';
  root.config.requestTimeoutMs = 15000;
  root.config.safeMode = true;
  root.config.apiReady = true;
  // Fase 2: a arquitetura nova passa a preferir a API do Worker por padrão.
  // O código legado continua disponível como fallback quando algum módulo
  // ainda não tiver sido migrado por completo.
  root.config.useWorkerApi = true;
  root.config.useWorkerUpload = true;
  root.config.useWorkerNotifications = true;
  // Fase 3.2 — ativa a ponte de sessão legada e o refresh silencioso.
  // Quando true, o frontend, ao detectar login legado (S/lf6_s) sem
  // JWT do Worker válido, chama /api/v1/session/legacy-bridge para
  // emitir um JWT sem exigir re-digitar senha.
  root.config.useLegacyAuthBridge = true;
  // Faz o httpClient renovar o token silenciosamente quando faltarem
  // menos que N segundos pra expirar (evita 401 no meio de uma request).
  root.config.sessionRefreshWindowSeconds = 5 * 60; // 5 min
})(window);

/* -------------------------------------------------------------------
 * Runtime overrides via <meta name="lf-supabase-url">, <meta name="lf-supabase-key">
 * O deploy do Cloudflare Pages injeta essas metas via _redirects/_headers ou
 * via um pequeno script inline (ver docs/DEPLOY.md).
 * Assim as chaves de dev nunca vazam no bundle público em produção.
 * ------------------------------------------------------------------- */
(function(global){
  'use strict';
  try {
    if (typeof document === 'undefined') return;
    var root = global.LiderCRM = global.LiderCRM || {};
    var cfg  = root.config     = root.config     || {};
    var m1 = document.querySelector('meta[name="lf-supabase-url"]');
    var m2 = document.querySelector('meta[name="lf-supabase-key"]');
    if (m1 && m1.content) cfg.supabaseUrl = m1.content;
    if (m2 && m2.content) cfg.supabaseKey = m2.content;
  } catch(e) { /* silencioso — dev não tem meta */ }
})(window);
