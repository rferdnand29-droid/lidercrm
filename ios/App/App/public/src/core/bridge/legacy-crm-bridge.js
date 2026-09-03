(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  root.meta = root.meta || {};
  root.meta.loadedAt = new Date().toISOString();
  root.meta.compatibilityMode = 'legacy-global-bridge';
  root.meta.notes = [
    'Camada de arquitetura adicionada sem remover os scripts globais legados.',
    'Services e Repositories delegam para as funções existentes para preservar compatibilidade.',
    'A API versionada do Worker começa em /api/v1 sem alterar o fluxo atual do app.'
  ];

  root.health = function(){
    var session = (root.store && typeof root.store.getSession === 'function') ? root.store.getSession() : null;
    return {
      ok: true,
      archVersion: root.config && root.config.archVersion,
      dbMode: root.store && root.store.getDbMode ? root.store.getDbMode() : 'unknown',
      hasSession: !!session,
      userId: session && session.userId ? session.userId : null
    };
  };
})(window);
