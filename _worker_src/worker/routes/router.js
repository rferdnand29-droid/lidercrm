// =====================================================================
// routes/router.js — Fase 3.2
// -----------------------------------------------------------------------
// Tabela de rotas do Worker. Adicionadas na Fase 3.2:
//   POST /api/v1/logout
//   GET  /api/v1/session
//   POST /api/v1/session/refresh
//   GET  /api/v1/session/legacy-nonce      (público — bridge legado)
//   POST /api/v1/session/legacy-bridge     (público — bridge legado)
// =====================================================================

import {
  loginController,
  logoutController,
  sessionController,
  refreshSessionController,
  legacyNonceController,
  legacyBridgeController,
  changePasswordController,
} from '../controllers/auth-controller.js';
import {
  listClientes, createCliente, updateCliente, deleteCliente,
  getClientesListDoc, putClientesListDoc,
} from '../controllers/clientes-controller.js';
import {
  getKanbanListDoc, putKanbanListDoc,
} from '../controllers/kanban-controller.js';
import {
  getLigacoesListDoc, putLigacoesListDoc,
} from '../controllers/ligacoes-controller.js';
import {
  getAtividadesListDoc, putAtividadesListDoc,
} from '../controllers/atividades-controller.js';
import {
  listAgendaSlots, createAgendaSlot, updateAgendaSlot, deleteAgendaSlot,
} from '../controllers/agenda-slots-controller.js';
import {
  listLeads, createLead, updateLead, deleteLead,
} from '../controllers/leads-controller.js';
import { getDashboard } from '../controllers/dashboard-controller.js';
import { listFinanceiro } from '../controllers/financeiro-controller.js';
import {
  listUsuarios, createOrUpsertUsuario, deleteUsuario,
  bulkUpsertUsuarios, getLegacyUsuarios, getUsuarioConfig, putUsuarioConfig, deleteUsuarioConfig,
} from '../controllers/usuarios-controller.js';
import {
  listDocumentos, createDocumento, getAdmDocumentos, putAdmDocumentos,
} from '../controllers/documentos-controller.js';
import {
  listNotificacoes, createNotificacao, getInboxNotificacoes,
  putInboxNotificacoes, postInboxNotificacao, getAutomationRules, putAutomationRules,
} from '../controllers/notificacoes-controller.js';
import {
  listFeed, createFeedEvento,
} from '../controllers/feed-controller.js';
import { uploadController, deleteUploadController } from '../controllers/upload-controller.js';
// FASE 1 relacional (2026-07-19) — novas rotas relacionais
import {
  listRoles, listRolePermissions, listMyPermissions,
} from '../controllers/roles-controller.js';
import {
  getSettingCtrl, putSettingCtrl, deleteSettingCtrl, listSettingsCtrl,
} from '../controllers/settings-controller.js';
import { NotFoundError } from '../errors/http-errors.js';

const ROUTES = [
  // Auth / Sessão
  ['/api/v1/login',                         'POST',   loginController],
  ['/api/v1/logout',                        'POST',   logoutController],
  ['/api/v1/session',                       'GET',    sessionController],
  ['/api/v1/session/refresh',               'POST',   refreshSessionController],
  ['/api/v1/session/legacy-nonce',          'GET',    legacyNonceController],
  ['/api/v1/session/legacy-bridge',         'POST',   legacyBridgeController],
  // Domínio
  ['/api/v1/clientes',                      'GET',    listClientes],
  ['/api/v1/clientes',                      'POST',   createCliente],
  ['/api/v1/clientes',                      'PUT',    updateCliente],
  ['/api/v1/clientes',                      'PATCH',  updateCliente],
  ['/api/v1/clientes',                      'DELETE', deleteCliente],
  ['/api/v1/clientes/list',                 'GET',    getClientesListDoc],
  ['/api/v1/clientes/list',                 'PUT',    putClientesListDoc],
  ['/api/v1/kanban/list',                   'GET',    getKanbanListDoc],
  ['/api/v1/kanban/list',                   'PUT',    putKanbanListDoc],
  ['/api/v1/ligacoes/list',                 'GET',    getLigacoesListDoc],
  ['/api/v1/ligacoes/list',                 'PUT',    putLigacoesListDoc],
  ['/api/v1/atividades/list',               'GET',    getAtividadesListDoc],
  ['/api/v1/atividades/list',               'PUT',    putAtividadesListDoc],
  ['/api/v1/agenda-slots',                  'GET',    listAgendaSlots],
  ['/api/v1/agenda-slots',                  'POST',   createAgendaSlot],
  ['/api/v1/agenda-slots',                  'PUT',    updateAgendaSlot],
  ['/api/v1/agenda-slots',                  'DELETE', deleteAgendaSlot],
  ['/api/v1/leads',                         'GET',    listLeads],
  ['/api/v1/leads',                         'POST',   createLead],
  ['/api/v1/leads',                         'PUT',    updateLead],
  ['/api/v1/leads',                         'PATCH',  updateLead],
  ['/api/v1/leads',                         'DELETE', deleteLead],
  ['/api/v1/dashboard',                     'GET',    getDashboard],
  ['/api/v1/financeiro',                    'GET',    listFinanceiro],
  ['/api/v1/usuarios',                      'GET',    listUsuarios],
  ['/api/v1/usuarios',                      'POST',   createOrUpsertUsuario],
  ['/api/v1/usuarios',                      'PUT',    createOrUpsertUsuario],
  ['/api/v1/usuarios',                      'DELETE', deleteUsuario],
  ['/api/v1/usuarios/bulk',                 'POST',   bulkUpsertUsuarios],
  ['/api/v1/usuarios/legacy',               'GET',    getLegacyUsuarios],
  ['/api/v1/usuarios/config',               'GET',    getUsuarioConfig],
  ['/api/v1/usuarios/config',               'PUT',    putUsuarioConfig],
  ['/api/v1/usuarios/config',               'DELETE', deleteUsuarioConfig],
  // Fase 3.5 — troca autenticada de senha (JWT obrigatório; ADM pode
  // trocar senha de terceiros, dono só troca a própria — currentPassword
  // sempre exigida).
  ['/api/v1/usuarios/change-password',      'POST',   changePasswordController],
  ['/api/v1/documentos',                    'GET',    listDocumentos],
  ['/api/v1/documentos',                    'POST',   createDocumento],
  ['/api/v1/documentos/adm',                'GET',    getAdmDocumentos],
  ['/api/v1/documentos/adm',                'PUT',    putAdmDocumentos],
  ['/api/v1/notificacoes',                  'GET',    listNotificacoes],
  ['/api/v1/notificacoes',                  'POST',   createNotificacao],
  ['/api/v1/notificacoes/inbox',            'GET',    getInboxNotificacoes],
  ['/api/v1/notificacoes/inbox',            'PUT',    putInboxNotificacoes],
  ['/api/v1/notificacoes/inbox',            'POST',   postInboxNotificacao],
  ['/api/v1/notificacoes/rules',            'GET',    getAutomationRules],
  ['/api/v1/notificacoes/rules',            'PUT',    putAutomationRules],
  ['/api/v1/feed',                          'GET',    listFeed],
  ['/api/v1/feed',                          'POST',   createFeedEvento],
  ['/api/v1/upload',                        'POST',   uploadController],
  ['/api/v1/upload',                        'DELETE', deleteUploadController],

  // FASE 1 relacional — sistema de permissões/roles (public.roles + public.permissions)
  ['/api/v1/roles',                         'GET',    listRoles],
  ['/api/v1/roles/permissions',             'GET',    listRolePermissions],
  ['/api/v1/permissions/me',                'GET',    listMyPermissions],

  // FASE 1 relacional — settings (public.settings)
  ['/api/v1/settings',                      'GET',    getSettingCtrl],
  ['/api/v1/settings',                      'PUT',    putSettingCtrl],
  ['/api/v1/settings',                      'DELETE', deleteSettingCtrl],
  ['/api/v1/settings/list',                 'GET',    listSettingsCtrl],
];

export function resolveRoute(pathname, method) {
  for (let i = 0; i < ROUTES.length; i++) {
    const [p, m, handler] = ROUTES[i];
    if (p === pathname && m === method) return handler;
  }
  return null;
}

export function methodsFor(pathname) {
  const set = new Set();
  ROUTES.forEach(([p, m]) => { if (p === pathname) set.add(m); });
  return Array.from(set);
}

export function routeNotFound(pathname, method) {
  const methods = methodsFor(pathname);
  if (methods.length) {
    const err = new NotFoundError('Método ' + method + ' não suportado em ' + pathname);
    err.status = 405;
    err.code = 'METHOD_NOT_ALLOWED';
    err.details = { allowed: methods };
    throw err;
  }
  throw new NotFoundError('Rota de API não encontrada.', { path: pathname });
}

// Fase 3.2 — usado por /api/v1/health e por diagnósticos.
export function listRoutes(){
  return ROUTES.map(([p, m]) => ({ path: p, method: m }));
}
