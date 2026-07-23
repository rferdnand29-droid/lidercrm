(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  // ATUALIZADO (step5.3 audit): adicionadas todas as rotas incluídas
  // nas Fases 3.x que estavam faltando no mapa original (Fase 2).
  // Cada chave mapeia para o path exato usado pelo router.js do Worker.
  root.workerContract = {
    v1: {
      // Auth / Sessão
      health:                 '/api/v1/health',
      login:                  '/api/v1/login',
      logout:                 '/api/v1/logout',
      session:                '/api/v1/session',
      sessionRefresh:         '/api/v1/session/refresh',
      sessionLegacyNonce:     '/api/v1/session/legacy-nonce',
      sessionLegacyBridge:    '/api/v1/session/legacy-bridge',
      // Clientes
      clientes:               '/api/v1/clientes',
      clientesList:           '/api/v1/clientes/list',
      // Kanban
      kanbanList:             '/api/v1/kanban/list',
      // Ligações
      ligacoesList:           '/api/v1/ligacoes/list',
      // Atividades
      atividadesList:         '/api/v1/atividades/list',
      // Agenda
      agendaSlots:            '/api/v1/agenda-slots',
      // Leads
      leads:                  '/api/v1/leads',
      // Dashboard
      dashboard:              '/api/v1/dashboard',
      // Financeiro
      financeiro:             '/api/v1/financeiro',
      // Usuários
      usuarios:               '/api/v1/usuarios',
      usuariosBulk:           '/api/v1/usuarios/bulk',
      usuariosLegacy:         '/api/v1/usuarios/legacy',
      usuariosConfig:         '/api/v1/usuarios/config',
      usuariosChangePassword: '/api/v1/usuarios/change-password',
      // Documentos
      documentos:             '/api/v1/documentos',
      documentosAdm:          '/api/v1/documentos/adm',
      // Notificações
      notificacoes:           '/api/v1/notificacoes',
      notificacoesInbox:      '/api/v1/notificacoes/inbox',
      notificacoesRules:      '/api/v1/notificacoes/rules',
      // Feed
      feed:                   '/api/v1/feed',
      // Upload
      upload:                 '/api/v1/upload',
      // Roles / Permissões (Fase 1 relacional)
      roles:                  '/api/v1/roles',
      rolesPermissions:       '/api/v1/roles/permissions',
      permissionsMe:          '/api/v1/permissions/me',
      // Settings (Fase 1 relacional)
      settings:               '/api/v1/settings',
      settingsList:           '/api/v1/settings/list'
    },
    v2: {
      base: '/api/v2'
    }
  };
})(window);
