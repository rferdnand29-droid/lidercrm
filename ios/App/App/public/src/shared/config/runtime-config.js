// Compatibilidade para a modularização parcial do app.
// A fonte única agora é js/lf-config.js, carregada antes deste arquivo.
(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  root.config = root.config || {};
  var cfg = root.config;
  cfg.apiPath = cfg.apiPath || '/api';
  cfg.apiVersion = cfg.apiVersion || 'v1';
  cfg.workerBaseUrl = cfg.workerBaseUrl || cfg.apiPath;
  cfg.workerVersion = cfg.workerVersion || cfg.apiVersion;
  cfg.workerHealthPath = cfg.workerHealthPath || cfg.workerBaseUrl + '/' + cfg.workerVersion + '/health';
  cfg.requestTimeoutMs = Number(cfg.requestTimeoutMs) || 15000;
})(window);

/* Overrides de storage continuam opcionais e pertencem ao ambiente, não
 * à configuração de produto acima. */
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
