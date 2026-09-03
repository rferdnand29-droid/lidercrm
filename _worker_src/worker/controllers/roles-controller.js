// =====================================================================
// roles-controller.js — Fase 1 (2026-07-19)
// -----------------------------------------------------------------------
// Novos endpoints para o sistema de permissões relacional:
//   GET  /api/v1/roles                 -> lista papéis (roles)
//   GET  /api/v1/roles/permissions?slug -> permissões do papel
//   GET  /api/v1/permissions/me        -> permissões do usuário logado
// Só existem quando o SQL de bootstrap foi executado. Se a tabela não
// existir, retornam array vazio (nunca 500).
// =====================================================================

import { ok } from '../utils/response.js';
import { BadRequestError, UnauthorizedError } from '../errors/http-errors.js';
import {
  listAllRoles,
  listPermissionsByRoleSlug,
} from '../repositories/users-relational-repository.js';

// AUDITORIA-FINAL-10 (2026-08-01, item 3.1): checagem explícita de ctx.user
// como defesa em profundidade — estas rotas já não estão na lista de rotas
// públicas de middlewares/auth.js (autenticação já é exigida antes de chegar
// aqui), então isto não muda comportamento pra nenhum usuário autenticado
// hoje; só evita que um bug futuro de roteamento exponha estes dados sem
// autenticação. NÃO restringi listRolePermissions a caps.adminUI — a
// auditoria original marcou isso como decisão do time (pode haver uso
// legítimo de consultor consultando permissões do próprio cargo por slug),
// não uma correção que se aplica sem confirmar a intenção de produto.
function _assertAuthenticated(ctx) {
  if (!ctx || !ctx.user) {
    throw new UnauthorizedError('Autenticação necessária.');
  }
}

export async function listRoles(request, ctx) {
  _assertAuthenticated(ctx);
  const rows = await listAllRoles(ctx.cfg);
  const items = (rows || []).map(r => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description || null,
    is_system: r.is_system === true,
  }));
  return ok(items, { endpoint: '/api/v1/roles', count: items.length }, ctx.headers);
}

export async function listRolePermissions(request, ctx) {
  _assertAuthenticated(ctx);
  const url = new URL(request.url);
  const slug = String(url.searchParams.get('slug') || '').trim().toLowerCase();
  if (!slug) throw new BadRequestError('slug é obrigatório.');
  const perms = await listPermissionsByRoleSlug(ctx.cfg, slug);
  const items = (perms || []).map(p => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category || null,
    description: p.description || null,
  }));
  return ok(items, { endpoint: '/api/v1/roles/permissions', role: slug, count: items.length }, ctx.headers);
}

export async function listMyPermissions(request, ctx) {
  const user = ctx.user || {};
  const roleSlug = String(user.role || 'user').toLowerCase();
  const perms = await listPermissionsByRoleSlug(ctx.cfg, roleSlug);
  const items = (perms || []).map(p => p.slug);
  return ok({
    role: roleSlug,
    permissions: items,
    count: items.length,
  }, { endpoint: '/api/v1/permissions/me' }, ctx.headers);
}
