// =====================================================================
// users-relational-repository.js - Fase 1 (2026-07-19)
// -----------------------------------------------------------------------
// Repositorio relacional para public.users + public.roles + public.role_permissions.
// Usado pelos servicos de autenticacao e usuarios DEPOIS que o SQL de
// bootstrap foi executado. NUNCA joga excecao fatal: se a tabela nao
// existir ou a Anon Key nao tiver acesso, retorna null/[] pra que o
// caller possa cair no fallback de fs_documents.
// =====================================================================

import { selectFrom, insertInto, updateWhere, deleteWhere } from '../lib/supabase-rest.js';

const USERS = 'users';
const ROLES = 'roles';
const ROLE_PERMISSIONS = 'role_permissions';
const PERMISSIONS = 'permissions';

function safeLower(s) {
  return String(s || '').trim().toLowerCase();
}

// ---------- users ----------

export async function findUserByEmail(cfg, email) {
  const target = safeLower(email);
  if (!target) return null;
  try {
    const { rows } = await selectFrom(cfg, USERS, {
      filters: { email: 'eq.' + target, active: 'eq.true' },
      select: '*',
      limit: 1,
    });
    return (rows && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

export async function findUserById(cfg, id) {
  const clean = String(id || '').trim();
  if (!clean) return null;
  try {
    const { rows } = await selectFrom(cfg, USERS, {
      filters: { id: 'eq.' + clean },
      select: '*',
      limit: 1,
    });
    return (rows && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

export async function findUserByLegacyId(cfg, legacyId) {
  const clean = String(legacyId || '').trim();
  if (!clean) return null;
  try {
    const { rows } = await selectFrom(cfg, USERS, {
      filters: { legacy_id: 'eq.' + clean },
      select: '*',
      limit: 1,
    });
    return (rows && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

export async function listAllUsers(cfg, opts = {}) {
  try {
    const filters = {};
    if (opts.activeOnly) filters.active = 'eq.true';
    if (opts.role) filters.role_id = 'eq.' + opts.role;
    const { rows } = await selectFrom(cfg, USERS, {
      filters,
      select: '*',
      order: 'full_name.asc',
      limit: opts.limit || 500,
    });
    return rows || [];
  } catch (_e) {
    return [];
  }
}

export async function upsertUser(cfg, payload) {
  const clean = Object.assign({}, payload || {});
  if (clean.email) clean.email = safeLower(clean.email);
  clean.updated_at = new Date().toISOString();
  try {
    // Tenta atualizar por email (unique), senao insere
    if (clean.email) {
      const existing = await findUserByEmail(cfg, clean.email);
      if (existing) {
        const patch = Object.assign({}, clean);
        delete patch.id;
        delete patch.created_at;
        return await updateWhere(cfg, USERS, { id: 'eq.' + existing.id }, patch);
      }
    }
    return await insertInto(cfg, USERS, clean);
  } catch (err) {
    // Repropaga so se o caller quiser tratar
    err.isRelational = true;
    throw err;
  }
}

export async function updateUserPasswordHash(cfg, userId, passwordHash) {
  try {
    return await updateWhere(cfg, USERS, { id: 'eq.' + userId }, {
      password_hash: passwordHash,
      updated_at: new Date().toISOString(),
    });
  } catch (_e) {
    return null;
  }
}

export async function clearPasswordResetFlags(cfg, userId) {
  try {
    return await updateWhere(cfg, USERS, { id: 'eq.' + userId }, {
      needs_password_reset: false,
      iter_cap_exceeded_reason: null,
      updated_at: new Date().toISOString(),
    });
  } catch (_e) {
    return null;
  }
}

export async function updateLastLogin(cfg, userId) {
  try {
    return await updateWhere(cfg, USERS, { id: 'eq.' + userId }, {
      last_login_at: new Date().toISOString(),
    });
  } catch (_e) {
    return null;
  }
}

export async function deactivateUser(cfg, userId) {
  try {
    return await updateWhere(cfg, USERS, { id: 'eq.' + userId }, {
      active: false, updated_at: new Date().toISOString(),
    });
  } catch (_e) {
    return null;
  }
}

// ---------- roles ----------

export async function listAllRoles(cfg) {
  try {
    const { rows } = await selectFrom(cfg, ROLES, {
      select: '*',
      order: 'name.asc',
      limit: 100,
    });
    return rows || [];
  } catch (_e) {
    return [];
  }
}

export async function findRoleBySlug(cfg, slug) {
  const clean = String(slug || '').trim().toLowerCase();
  if (!clean) return null;
  try {
    const { rows } = await selectFrom(cfg, ROLES, {
      filters: { slug: 'eq.' + clean },
      select: '*',
      limit: 1,
    });
    return (rows && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

// ---------- permissions ----------

export async function listPermissionsByRoleSlug(cfg, roleSlug) {
  const clean = String(roleSlug || '').trim().toLowerCase();
  if (!clean) return [];
  try {
    const role = await findRoleBySlug(cfg, clean);
    if (!role) return [];
    // role_permissions -> permissions (join via 2 selects - mais simples/estavel que embed)
    const { rows: rp } = await selectFrom(cfg, ROLE_PERMISSIONS, {
      filters: { role_id: 'eq.' + role.id },
      select: 'permission_id',
      limit: 500,
    });
    if (!rp || !rp.length) return [];
    const ids = rp.map(r => r.permission_id).filter(Boolean);
    if (!ids.length) return [];
    const inList = '(' + ids.join(',') + ')';
    const { rows: perms } = await selectFrom(cfg, PERMISSIONS, {
      filters: { id: 'in.' + inList },
      select: '*',
      limit: 500,
    });
    return perms || [];
  } catch (_e) {
    return [];
  }
}

// ---------- helpers ----------

export function scrubUserForClient(u) {
  if (!u) return null;
  const clone = Object.assign({}, u);
  delete clone.password_hash;
  delete clone.ph;
  delete clone.senha;
  delete clone.password;
  delete clone.hash;
  delete clone.reset_token;
  delete clone.refresh_token;
  return clone;
}

// Converte a linha da tabela relacional em um "user legacy" (com os
// campos que o resto do Worker/patches espera: id, email, role, ativo, ph...)
//
// Etapa 6.1 (2026-07-23): passamos adiante `cargo_codigo` e `adm_extra`
// vindos de `public.users` (colunas adicionadas em
// sql/migrations/migration_hierarquia_20260723.sql). Esses campos alimentam o
// payload do JWT (tokens.js) e permitem que o middleware authz.js
// resolva as caps SEM depender do fallback textual
// normalizeCargoCode(cargo). Mudança aditiva — clientes antigos que só
// leem `cargo` continuam funcionando; quem quiser precisão usa
// `cargo_codigo`.
export function relationalToLegacy(u, roleSlug) {
  if (!u) return null;
  return {
    id: u.legacy_id || u.id,
    uid: u.legacy_id || u.id,
    _uuid: u.id,
    nome: u.full_name || '',
    email: u.email || '',
    telefone: u.phone || '',
    role: roleSlug || 'user',
    ativo: u.active !== false,
    ph: u.password_hash || '',
    cargo: u.cargo || null,
    // Etapa 6.1 — código canônico do cargo + flag adm_extra (banco é
    // fonte de verdade quando ambos existem; senão fica null e o
    // authz cai na heurística textual antiga).
    cargo_codigo: u.cargo_codigo || null,
    cargoCodigo:  u.cargo_codigo || null, // alias camelCase para consumidores legados
    adm_extra:    u.adm_extra === true,
    admExtra:     u.adm_extra === true,   // alias camelCase para consumidores legados
    // FIX (2026-08-03) — necessário pra resolver departamento (via
    // teams.departamento_id) no login. Antes não existia aqui, então
    // o JWT nunca carregava o time do usuário.
    team_id:      u.team_id || null,
    // Etapa 6.2 — UUID relacional exposto também como user_uuid, para o
    // middleware authz.js poder consultar `v_user_caps.user_id` sem
    // precisar re-resolver e-mail->UUID em cada request. Já existia
    // como `_uuid` mas o alias public deixa a intenção clara e o
    // buildJwtPayloadFromLegacy pode lê-lo sem hack.
    user_uuid:    u.id || null,
    updatedAt: u.updated_at || null,
    last_login_at: u.last_login_at || null,
    _source: 'relational',
  };
}