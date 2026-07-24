// =====================================================================
// usuarios-controller.js — Fase 1 relacional (2026-07-19)
// -----------------------------------------------------------------------
// DUAL-WRITE:
//   • Lê primeiro de public.users + public.roles (relacional).
//   • Se vazio, faz fallback para fs_documents (legado).
//   • Ao criar/atualizar/excluir, grava nas DUAS fontes (best-effort).
//   • O formato de saída para o frontend é IDÊNTICO ao antigo, para
//     não quebrar layout, patches e módulos consumidores.
//
// [patch: chat-group-server-gate v1] (2026-07-21) — Passo 5.2.
// Gate autoritativo server-side em putUsuarioConfig() para os
// documentos de conversa em grupo (config/chat_conv_<id>). O gate
// cliente 5.1 já barra o botão "Novo Grupo" no front, mas qualquer
// requisição forjada com Bearer válido de consultor conseguiria
// gravar/sobrescrever config/chat_conv_grp_* diretamente na API,
// contornando a UI. Este gate espelha o predicado do cliente
// (hasAdminAccess: role ∈ {adm,gestor,admin} ∨ cargo ∈
// CARGOS_NIVEL_ADMIN ∨ admExtra=true), fail-closed: se qualquer
// parte do resolver falhar (sem sub, sem registro do usuário,
// upstream indisponível), NEGA — mesma filosofia do gate cliente.
// =====================================================================

import { listService } from '../services/crud-service.js';
import { usuariosRepo } from '../repositories/index.js';
import { respondWithCache } from '../utils/etag.js';
import { ok, created } from '../utils/response.js';
import { readJsonBody, sanitizeString, validate } from '../validators/validate.js';
import {
  getFsDocument, setFsDocument, deleteFsDocument,
  listFsChildren, upsertFsDocuments,
} from '../lib/fs-documents.js';
import { BadRequestError, ForbiddenError } from '../errors/http-errors.js';
import {
  listAllUsers, findUserByLegacyId, findUserByEmail,
  upsertUser, deactivateUser,
  findRoleBySlug, listAllRoles,
  relationalToLegacy, scrubUserForClient,
} from '../repositories/users-relational-repository.js';
import { usuarioConfigPutSchema } from '../schemas/index.js';

const ALLOWED_FILTERS = ['role', 'status', 'ativo'];
const USERS_PARENT = 'config/users/items';

// [patch: chat-group-server-gate v1] — espelho fiel do cliente
// (js/auth.js:70). Qualquer novo cargo "de nível admin" adicionado
// no cliente PRECISA ser refletido aqui também, senão o gate
// server-side fica mais restritivo que o cliente.
const CARGOS_NIVEL_ADMIN = ['gerente', 'gestor', 'representante', 'master'];
const ADMIN_ROLES = new Set(['adm', 'gestor', 'admin']);

// Detecta se o "name" do documento config/<name> é uma conversa
// em grupo do módulo de chat. O cliente sempre grava com prefixo
// "chat_conv_" + convId, e convId de grupo começa com "grp_"
// (ver _chatGetOrCreateConv em js/chat.js:255).
function isChatGroupConfigName(name) {
  const s = String(name || '');
  return s.indexOf('chat_conv_grp_') === 0;
}

// Também considera "grupo" quando o body sinaliza isGroup:true,
// mesmo que o name não bata com o prefixo (defesa em profundidade
// contra convId manualmente forjado que não use "grp_").
function bodyLooksLikeGroup(body) {
  if (!body || typeof body !== 'object') return false;
  if (body.isGroup === true) return true;
  if (Array.isArray(body.participants) && body.participants.length > 2) return true;
  return false;
}

// Resolve papel/cargo/admExtra do usuário autenticado consultando
// primeiro o relacional (public.users) e, em fallback, fs_documents
// (config/users/items/<uid>). Fail-closed: qualquer exceção ou
// registro ausente retorna { ok:false }.
async function resolveActorPrivilege(ctx) {
  const sub = ctx && ctx.user && ctx.user.sub;
  const jwtRole = String((ctx && ctx.user && ctx.user.role) || '').toLowerCase();
  if (!sub) return { ok: false, reason: 'NO_SUBJECT' };

  // Atalho: o JWT já carrega role='adm' emitido pelo login.
  if (ADMIN_ROLES.has(jwtRole)) {
    return { ok: true, source: 'jwt', role: jwtRole };
  }

  // 1) Relacional
  try {
    const relUser = await findUserByLegacyId(ctx.cfg, sub);
    if (relUser && relUser.role_id) {
      const roles = await listAllRoles(ctx.cfg).catch(() => []);
      const roleRow = (roles || []).find(r => r && r.id === relUser.role_id);
      const slug = String((roleRow && roleRow.slug) || '').toLowerCase();
      if (ADMIN_ROLES.has(slug)) {
        return { ok: true, source: 'relational', role: slug };
      }
    }
  } catch (_e) {
    // segue pro fallback fs_documents
  }

  // 2) fs_documents (config/users/items/<uid>)
  try {
    const fsUser = await getFsDocument(ctx.cfg, USERS_PARENT + '/' + sub);
    if (fsUser) {
      const role = String(fsUser.role || '').toLowerCase();
      if (ADMIN_ROLES.has(role)) {
        return { ok: true, source: 'fs_documents', role };
      }
      if (fsUser.admExtra === true) {
        return { ok: true, source: 'fs_documents', admExtra: true };
      }
      const cargo = String(fsUser.cargo || '').toLowerCase();
      if (cargo && CARGOS_NIVEL_ADMIN.some(k => cargo.indexOf(k) >= 0)) {
        return { ok: true, source: 'fs_documents', cargo };
      }
      return { ok: false, reason: 'NOT_ADMIN', source: 'fs_documents' };
    }
  } catch (_e) {
    return { ok: false, reason: 'RESOLVER_UNAVAILABLE' };
  }

  return { ok: false, reason: 'USER_NOT_FOUND' };
}

function scrubUser(u) {
  const clone = Object.assign({}, u || {});
  delete clone.senha; delete clone.password; delete clone.hash;
  delete clone.ph;
  delete clone.password_hash;
  delete clone.reset_token; delete clone.refresh_token;
  return clone;
}

function configPath(name) {
  return 'config/' + String(name || '').replace(/^\/+|\/+$/g, '');
}

// Cache local de roles por request (evita N+1 no listAllUsers)
async function buildRoleSlugMap(cfg) {
  const roles = await listAllRoles(cfg);
  const map = new Map();
  (roles || []).forEach(r => map.set(r.id, r.slug || 'user'));
  return map;
}

// ---------- LIST ----------
export async function listUsuarios(request, ctx) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');

  // Modo explícito: forçar fs_documents (para debug / patches antigos)
  if (mode === 'legacy-fs') {
    const list = await listFsChildren(ctx.cfg, USERS_PARENT);
    return respondWithCache(request, list.map(scrubUser), {
      endpoint: '/api/v1/usuarios', source: 'fs_documents',
    }, { maxAge: 15, extraHeaders: ctx.headers });
  }

  // Modo padrão: RELACIONAL primeiro, com fallback fs_documents
  const relRows = await listAllUsers(ctx.cfg, { limit: 500 });
  if (relRows && relRows.length) {
    const roleMap = await buildRoleSlugMap(ctx.cfg);
    const items = relRows.map(u => scrubUser(relationalToLegacy(u, roleMap.get(u.role_id) || 'user')));
    return respondWithCache(request, items, {
      endpoint: '/api/v1/usuarios', source: 'relational',
    }, { maxAge: 30, extraHeaders: ctx.headers });
  }

  // Fallback: listService legado (usuariosRepo) + scrub
  try {
    const result = await listService(ctx.cfg, usuariosRepo, url, ALLOWED_FILTERS);
    const scrubbed = (result.items || []).map(scrubUser);
    return respondWithCache(request, scrubbed, {
      endpoint: '/api/v1/usuarios', source: 'legacy-repo', pagination: result.meta,
    }, { maxAge: 30, extraHeaders: ctx.headers });
  } catch (_e) {
    // Último recurso: fs_documents children
    const list = await listFsChildren(ctx.cfg, USERS_PARENT).catch(() => []);
    return respondWithCache(request, list.map(scrubUser), {
      endpoint: '/api/v1/usuarios', source: 'fs_documents-fallback',
    }, { maxAge: 15, extraHeaders: ctx.headers });
  }
}

// ---------- CREATE / UPSERT ----------
export async function createOrUpsertUsuario(request, ctx) {
  const body = await readJsonBody(request);
  const uid = sanitizeString((body && (body.id || body.uid)), 120);
  if (!uid) throw new BadRequestError('id é obrigatório.');

  const now = new Date().toISOString();

  // 1) Escreve no fs_documents (mantém patches antigos funcionando)
  const current = await getFsDocument(ctx.cfg, USERS_PARENT + '/' + uid).catch(() => null);
  const nextFs = Object.assign({}, current || {}, body || {}, { id: uid, updatedAt: now });
  await setFsDocument(ctx.cfg, USERS_PARENT + '/' + uid, nextFs);

  // 2) Espelha no relacional (best-effort — não bloqueia)
  try {
    const roleSlug = String(body && (body.role || body.papel) || 'consultor').toLowerCase();
    const role = await findRoleBySlug(ctx.cfg, roleSlug);
    const email = String(body && body.email || '').trim().toLowerCase();
    if (email) {
      await upsertUser(ctx.cfg, {
        legacy_id: uid,
        email,
        full_name: (body && (body.nome || body.name || body.full_name)) || '',
        phone: (body && (body.telefone || body.phone)) || '',
        avatar_url: (body && (body.avatar_url || body.avatar)) || null,
        role_id: role ? role.id : null,
        active: (body && body.ativo !== false),
        password_hash: (body && body.ph) || undefined,
      });
    }
  } catch (_e) {
    // Relacional pode falhar (sem tabela, sem permissão) — não bloqueia
  }

  return created(scrubUser(nextFs), { endpoint: '/api/v1/usuarios' }, ctx.headers);
}

// ---------- DELETE ----------
export async function deleteUsuario(request, ctx) {
  const url = new URL(request.url);
  const uid = sanitizeString(url.searchParams.get('id'), 120);
  if (!uid) throw new BadRequestError('id é obrigatório.');

  // 1) fs_documents
  await deleteFsDocument(ctx.cfg, USERS_PARENT + '/' + uid).catch(() => {});

  // 2) Relacional: soft-delete (active = false) para não quebrar FKs de logs
  try {
    const relUser = await findUserByLegacyId(ctx.cfg, uid);
    if (relUser) await deactivateUser(ctx.cfg, relUser.id);
  } catch (_e) {}

  return ok({ id: uid, deleted: true }, { endpoint: '/api/v1/usuarios' }, ctx.headers);
}

// ---------- BULK ----------
export async function bulkUpsertUsuarios(request, ctx) {
  const body = await readJsonBody(request);
  const list = Array.isArray(body && body.list) ? body.list.filter(Boolean) : [];
  const entries = list.map((u) => {
    const id = sanitizeString(u && u.id, 120);
    if (!id) return null;
    return { path: USERS_PARENT + '/' + id, data: Object.assign({}, u, { id }) };
  }).filter(Boolean);

  // 1) fs_documents (batch)
  await upsertFsDocuments(ctx.cfg, entries);

  // 2) Espelha cada um no relacional (best-effort, sequencial)
  for (const entry of entries) {
    try {
      const u = entry.data || {};
      const email = String(u.email || '').trim().toLowerCase();
      if (!email) continue;
      const roleSlug = String(u.role || 'consultor').toLowerCase();
      const role = await findRoleBySlug(ctx.cfg, roleSlug);
      await upsertUser(ctx.cfg, {
        legacy_id: u.id,
        email,
        full_name: u.nome || u.name || '',
        phone: u.telefone || u.phone || '',
        role_id: role ? role.id : null,
        active: u.ativo !== false,
        password_hash: u.ph || undefined,
      });
    } catch (_e) { /* silencioso */ }
  }

  return ok(entries.map((x) => scrubUser(x.data)), {
    endpoint: '/api/v1/usuarios/bulk',
  }, ctx.headers);
}

// ---------- LEGACY DOC (config/users) ----------
export async function getLegacyUsuarios(request, ctx) {
  const doc = await getFsDocument(ctx.cfg, 'config/users');
  return ok(doc || null, { endpoint: '/api/v1/usuarios/legacy' }, ctx.headers);
}

// ---------- CONFIG (config/<name>) ----------
export async function getUsuarioConfig(request, ctx) {
  const url = new URL(request.url);
  const name = sanitizeString(url.searchParams.get('name'), 160);
  if (!name) throw new BadRequestError('name é obrigatório.');
  const doc = await getFsDocument(ctx.cfg, configPath(name));
  return ok(doc || null, { endpoint: '/api/v1/usuarios/config', name }, ctx.headers);
}

export async function putUsuarioConfig(request, ctx) {
  const url = new URL(request.url);
  const name = sanitizeString(url.searchParams.get('name'), 160);
  if (!name) throw new BadRequestError('name é obrigatório.');
  const body = await readJsonBody(request);
  validate(body || {}, usuarioConfigPutSchema); // R5: input validation

  // [patch: chat-group-server-gate v1] — Passo 5.2.
  // Se o documento representa uma conversa em grupo do chat
  // (config/chat_conv_grp_*) OU se o body sinaliza isGroup:true /
  // participants>2, exige privilégio de administrador. Fail-closed:
  // se o resolver não conseguir confirmar o privilégio (usuário
  // inexistente, relacional indisponível, sub ausente), NEGA.
  if (isChatGroupConfigName(name) || bodyLooksLikeGroup(body)) {
    const priv = await resolveActorPrivilege(ctx);
    if (!priv || !priv.ok) {
      throw new ForbiddenError(
        'Somente administradores podem criar ou atualizar conversas em grupo.',
        {
          code: 'CHAT_GROUP_FORBIDDEN',
          reason: (priv && priv.reason) || 'DENIED',
          name,
        }
      );
    }
  }

  await setFsDocument(ctx.cfg, configPath(name), Object.assign({}, body || {}, { ts: Date.now() }));
  return ok(body || {}, { endpoint: '/api/v1/usuarios/config', name }, ctx.headers);
}

export async function deleteUsuarioConfig(request, ctx) {
  const url = new URL(request.url);
  const name = sanitizeString(url.searchParams.get('name'), 160);
  if (!name) throw new BadRequestError('name é obrigatório.');

  // [patch: chat-group-server-gate v1] — mesma regra do PUT:
  // apagar uma conversa em grupo do chat exige privilégio admin.
  if (isChatGroupConfigName(name)) {
    const priv = await resolveActorPrivilege(ctx);
    if (!priv || !priv.ok) {
      throw new ForbiddenError(
        'Somente administradores podem apagar conversas em grupo.',
        {
          code: 'CHAT_GROUP_FORBIDDEN',
          reason: (priv && priv.reason) || 'DENIED',
          name,
        }
      );
    }
  }

  await deleteFsDocument(ctx.cfg, configPath(name));
  return ok({ name, deleted: true }, { endpoint: '/api/v1/usuarios/config', name }, ctx.headers);
}
