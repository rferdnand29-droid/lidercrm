// =====================================================================
// routes/router.js — Fase 3.2 + PATCH FASE 1 (2026-07-22)
// -----------------------------------------------------------------------
// Novas rotas adicionadas no patch:
//   POST   /api/v1/upload/binary   — upload binário seguro via Worker (B2/Supabase)
//   DELETE /api/v1/upload/binary   — remove arquivo (B2/Supabase)
//   POST   /api/v1/push/register   — registra device push token
//   DELETE /api/v1/push/register   — remove device push token
//   GET    /api/v1/push/devices    — lista devices do usuário (debug)
// =====================================================================

import {
  loginController,
  logoutController,
  sessionController,
  refreshSessionController,
  legacyNonceController,
  legacyBridgeController,
  changePasswordController,
  adminResetPasswordController,
} from '../controllers/auth-controller.js';
import {
  listClientes, createCliente, updateCliente, deleteCliente,
  getClientesListDoc, putClientesListDoc,
} from '../controllers/clientes-controller.js';
import {
  getKanbanListDoc, putKanbanListDoc, getKanbanLivrePool, claimLivreLead,
} from '../controllers/kanban-controller.js';
import { kanbanStreamController } from '../controllers/kanban-stream-controller.js';
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
import {
  listDepartamentos, createDepartamento, updateDepartamento, deleteDepartamento,
  listTeams, assignDepartamentoMembers, removeDepartamentoMember, listDepartamentoMembers,
} from '../controllers/departamentos-controller.js';
import { getDashboard }    from '../controllers/dashboard-controller.js';
import { listFinanceiro }  from '../controllers/financeiro-controller.js';
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
import {
  listClientErrors, createClientError,
} from '../controllers/client-errors-controller.js';
import { uploadController, deleteUploadController } from '../controllers/upload-controller.js';

// ── PATCH FASE 1 (2026-07-22) ─────────────────────────────────────────
import {
  uploadBinaryController, deleteBinaryController,
} from '../controllers/upload-binary-controller.js';
import {
  heartbeatController, lastSeenController, onlineUsersController,
} from '../controllers/presence-controller.js';
import {
  registerDeviceController, unregisterDeviceController, listDevicesController,
} from '../controllers/device-push-controller.js';
import {
  sendPushController, pushSelfTestController,
} from '../controllers/push-send-controller.js';
// ─────────────────────────────────────────────────────────────────────

import {
  listRoles, listRolePermissions, listMyPermissions,
} from '../controllers/roles-controller.js';
import {
  getSettingCtrl, putSettingCtrl, deleteSettingCtrl, listSettingsCtrl,
} from '../controllers/settings-controller.js';
// Op-5 (2026-07-23) — métricas do cache in-memory de v_user_caps.
import { authzCacheHealthController } from '../controllers/authz-health-controller.js';
import {
  sendWhatsAppController,
  evolutionStatusController,
} from '../controllers/whatsapp-controller.js';
import {
  getBrandingCtrl,
  putBrandingCtrl,
  deleteBrandingCtrl,
} from '../controllers/branding-controller.js';
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
  ['/api/v1/kanban/stream',                 'GET',    kanbanStreamController],
  ['/api/v1/kanban/list',                   'PUT',    putKanbanListDoc],
  ['/api/v1/kanban/livre-pool',             'GET',    getKanbanLivrePool],
  ['/api/v1/kanban/livre-claim',            'POST',   claimLivreLead],
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

  ['/api/v1/departamentos',                 'GET',    listDepartamentos],
  ['/api/v1/departamentos',                 'POST',   createDepartamento],
  ['/api/v1/departamentos',                 'PUT',    updateDepartamento],
  ['/api/v1/departamentos',                 'PATCH',  updateDepartamento],
  ['/api/v1/departamentos',                 'DELETE', deleteDepartamento],
  ['/api/v1/departamentos/teams',           'GET',    listTeams],
  ['/api/v1/departamentos/members',         'GET',    listDepartamentoMembers],
  ['/api/v1/departamentos/members',         'POST',   assignDepartamentoMembers],
  ['/api/v1/departamentos/members',         'DELETE', removeDepartamentoMember],
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
  ['/api/v1/usuarios/change-password',      'POST',   changePasswordController],
  ['/api/v1/usuarios/admin-reset-password', 'POST',   adminResetPasswordController],
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
  ['/api/v1/client-errors',                 'GET',    listClientErrors],
  ['/api/v1/client-errors',                 'POST',   createClientError],
  // Upload legado (base64 via JSON) — mantido para compatibilidade
  ['/api/v1/upload',                        'POST',   uploadController],
  ['/api/v1/upload',                        'DELETE', deleteUploadController],

  // PATCH FASE 1 (2026-07-22) — Upload binário seguro via Worker (B2 / Supabase)
  ['/api/v1/upload/binary',                 'POST',   uploadBinaryController],
  ['/api/v1/upload/binary',                 'DELETE', deleteBinaryController],
  ['/api/v1/users/heartbeat',          'POST',   heartbeatController],
  ['/api/v1/users/last-seen',          'POST',   lastSeenController],
  ['/api/v1/users/online',             'GET',    onlineUsersController],

  // PATCH FASE 1 (2026-07-22) — Registro de device push (esqueleto Fase 2)
  ['/api/v1/push/register',                 'POST',   registerDeviceController],
  ['/api/v1/push/register',                 'DELETE', unregisterDeviceController],
  ['/api/v1/push/devices',                  'GET',    listDevicesController],
  // FASE 2 (2026-08-05) — envio de verdade via FCM HTTP v1
  ['/api/v1/push/send',                     'POST',   sendPushController],
  // DIAGNÓSTICO TEMPORÁRIO (2026-08-05) — remover quando push estiver
  // confirmado funcionando em produção.
  ['/api/v1/push/selftest',                 'POST',   pushSelfTestController],

  // WhatsApp — a chave da Evolution API fica exclusivamente no Worker.
  ['/api/v1/whatsapp/send',                'POST',   sendWhatsAppController],
  ['/api/v1/whatsapp/status',              'GET',    evolutionStatusController],

  // FASE 1 relacional — sistema de permissões/roles
  ['/api/v1/roles',                         'GET',    listRoles],
  ['/api/v1/roles/permissions',             'GET',    listRolePermissions],
  ['/api/v1/permissions/me',                'GET',    listMyPermissions],

  // Identidade visual global do CRM (logo/nome/fonte/cor/favicon)
  ['/api/v1/branding',                       'GET',    getBrandingCtrl],
  ['/api/v1/branding',                       'PUT',    putBrandingCtrl],
  ['/api/v1/branding',                       'DELETE', deleteBrandingCtrl],

  // FASE 1 relacional — settings
  ['/api/v1/settings',                      'GET',    getSettingCtrl],
  ['/api/v1/settings',                      'PUT',    putSettingCtrl],
  ['/api/v1/settings',                      'DELETE', deleteSettingCtrl],
  ['/api/v1/settings/list',                 'GET',    listSettingsCtrl],

  // Op-5 (2026-07-23) — saúde do cache authz (autenticada, adminUI).
  ['/api/v1/health/authz-cache',            'GET',    authzCacheHealthController],
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

export function listRoutes() {
  return ROUTES.map(([p, m]) => ({ path: p, method: m }));
}
