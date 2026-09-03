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
import { respondWithCache, respondWithVersionedDocument } from '../utils/etag.js';
import { ok, created } from '../utils/response.js';
import { readJsonBody, sanitizeString } from '../validators/validate.js';
import {
  getFsDocument, setFsDocument, deleteFsDocument,
  listFsChildren, upsertFsDocuments,
} from '../lib/fs-documents.js';
import { BadRequestError, ForbiddenError } from '../errors/http-errors.js';
import {
  listAllUsers, findUserByLegacyId, findUserById, findUserByEmail,
  upsertUser, deactivateUser,
  findRoleBySlug, listAllRoles,
  relationalToLegacy, scrubUserForClient,
} from '../repositories/users-relational-repository.js';
import {
  deleteVersionedDocument,
  expectedDocumentVersion,
  saveVersionedDocument,
} from '../utils/document-version.js';
import { recordSyncFailure } from '../services/sync-failure-service.js';

const ALLOWED_FILTERS = ['role', 'status', 'ativo'];
const USERS_PARENT = 'config/users/items';

// [patch: chat-group-server-gate v1] — espelho fiel do cliente
// (js/auth.js:70). Qualquer novo cargo "de nível admin" adicionado
// no cliente PRECISA ser refletido aqui também, senão o gate
// server-side fica mais restritivo que o cliente.
export const CARGOS_NIVEL_ADMIN = ['gerente', 'gestor', 'representante', 'master'];
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
export async function resolveActorPrivilege(ctx) {
  const sub = ctx && ctx.user && ctx.user.sub;
  const jwtRole = String((ctx && ctx.user && ctx.user.role) || '').toLowerCase();
  if (!sub) return { ok: false, reason: 'NO_SUBJECT' };

  // Atalho: o JWT já carrega role='adm' emitido pelo login.
  if (ADMIN_ROLES.has(jwtRole)) {
    return { ok: true, source: 'jwt', role: jwtRole };
  }

  // 1) Relacional
  // FIX (2026-08-03): mesmo bug de deleteUsuario() — buscar só por
  // legacy_id falha silenciosamente pra qualquer usuário criado só no
  // sistema novo (sem legacy_id), incluindo admins reais. Cai pra
  // busca por id relacional direto quando não encontra por legacy_id.
  try {
    let relUser = await findUserByLegacyId(ctx.cfg, sub);
    if (!relUser) relUser = await findUserById(ctx.cfg, sub);
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

export function scrubUser(u) {
  const clone = Object.assign({}, u || {});
  delete clone.senha; delete clone.password; delete clone.hash;
  delete clone.ph;
  delete clone.password_hash;
  delete clone.reset_token; delete clone.refresh_token;
  return clone;
}

export function configPath(name) {
  const clean = String(name || '').replace(/^\/+|\/+$/g, '');
  // SEC-08 (2026-10-03): sem esta checagem, name="users/items/<uid>"
  // resolvia pro MESMO caminho interno usado pelos registros de
  // usuário (USERS_PARENT em auth/constants.js) — incluindo o hash de
  // senha bruto (ph), material usado pela ponte de sessão legada.
  // Esta rota não tem restrição de cargo — qualquer autenticado
  // conseguia ler/sobrescrever/apagar o registro de QUALQUER pessoa.
  if (clean === 'users' || clean.indexOf('users/') === 0 || clean.indexOf('..') !== -1) {
    throw new ForbiddenError('Nome de configuração inválido.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'config_name_reaches_restricted_namespace',
    });
  }
  return 'config/' + clean;
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
  // activeOnly:true evita que usuários soft-deleted voltem a aparecer como ativos.
  const relRows = await listAllUsers(ctx.cfg, { limit: 500, activeOnly: true });
  if (relRows && relRows.length) {
    const roleMap = await buildRoleSlugMap(ctx.cfg);
    const fsList = await listFsChildren(ctx.cfg, USERS_PARENT).catch(() => []);
    const fsMap = new Map((fsList || []).filter(Boolean).map(u => [String(u.id || u.uid || ''), u]));
    const items = relRows.map(u => {
      const legacy = relationalToLegacy(u, roleMap.get(u.role_id) || 'user');
      const extra = fsMap.get(String(legacy.id || '')) || null;
      if (extra) {
        if (Array.isArray(extra.orientadosIds)) legacy.orientadosIds = extra.orientadosIds.filter(Boolean);
        if (extra.nome && !legacy.nome) legacy.nome = extra.nome;
        if (extra.telefone && !legacy.telefone) legacy.telefone = extra.telefone;
        if (extra.cor != null) legacy.cor = extra.cor;
        if (extra.cargo && !legacy.cargo) legacy.cargo = extra.cargo;
        if (extra.role && (!legacy.role || legacy.role === 'user')) legacy.role = extra.role;
      }
      return scrubUser(legacy);
    });
    return respondWithCache(request, items, {
      endpoint: '/api/v1/usuarios', source: 'relational+fs-merge',
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
  // AUDITORIA-FINAL-10 (2026-08-01, item confirmado de alta prioridade):
  // este endpoint aceita `role`/`papel` no body e grava direto em
  // public.users.role_id — sem esta checagem, qualquer usuário autenticado
  // podia chamar POST /api/v1/usuarios com o próprio id e um role mais
  // alto (ex.: 'master'), uma escalação de privilégio real, não teórica.
  // Mesmo mecanismo já usado em deleteUsuario() neste arquivo (fail-closed).
  const priv = await resolveActorPrivilege(ctx);
  if (!priv || !priv.ok) {
    throw new ForbiddenError('Apenas administradores podem criar ou editar usuários.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'usuarios_upsert_requires_admin',
    });
  }
  const body = await readJsonBody(request);
  const uid = sanitizeString((body && (body.id || body.uid)), 120);
  if (!uid) throw new BadRequestError('id é obrigatório.');

  const now = new Date().toISOString();

  let syncFailure = null;
  // public.users é a fonte principal do domínio de usuários. O documento
  // legado fica apenas como espelho temporário para os módulos antigos.
  let relationalRow = null;
  let roleSlug = String(body && (body.role || body.papel) || 'consultor').toLowerCase();
  const role = await findRoleBySlug(ctx.cfg, roleSlug);
  const email = String(body && body.email || '').trim().toLowerCase();
  if (email) {
    relationalRow = await upsertUser(ctx.cfg, {
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

  // Espelho legado: falhas são persistidas para reconciliação, nunca
  // descartadas em um catch vazio.
  const current = await getFsDocument(ctx.cfg, USERS_PARENT + '/' + uid).catch(() => null);
  const nextFs = Object.assign({}, current || {}, body || {}, { id: uid, updatedAt: now });
  try {
    await setFsDocument(ctx.cfg, USERS_PARENT + '/' + uid, nextFs);
  } catch (error) {
    syncFailure = await recordSyncFailure(ctx.cfg, {
      domain: 'usuarios',
      operation: 'mirror-relational-to-fs',
      primary: 'public.users',
      mirror: 'fs_documents',
      key: uid,
      payload: nextFs,
      error,
    });
  }

  return created(
    scrubUser(relationalRow ? Object.assign({}, nextFs, relationalToLegacy(relationalRow, roleSlug)) : nextFs),
    { endpoint: '/api/v1/usuarios', sync: syncFailure ? 'pending' : 'complete', failureId: syncFailure && syncFailure.id },
    ctx.headers,
  );
}

// ---------- DELETE ----------
export async function deleteUsuario(request, ctx) {
  const url = new URL(request.url);
  const uid = sanitizeString(url.searchParams.get('id'), 120);
  if (!uid) throw new BadRequestError('id é obrigatório.');

  const priv = await resolveActorPrivilege(ctx);
  if (!priv || !priv.ok) {
    throw new ForbiddenError('Apenas administradores podem excluir usuários.');
  }

  let syncFailure = null;

  // public.users é a fonte principal; só depois mantemos o espelho legado.
  // Relacional: soft-delete (active = false) para não quebrar FKs de logs
  //
  // FIX (2026-08-03): antes só buscava por legacy_id. Usuários criados
  // direto no sistema novo (sem legacy_id — ex.: qualquer conta criada
  // depois da migração para o relacional) nunca eram encontrados aqui:
  // a busca voltava vazia, deactivateUser nunca rodava, e o endpoint
  // ainda respondia {deleted:true} — exclusão "funcionava" sem nunca
  // desativar ninguém de verdade, e o usuário reaparecia no próximo
  // carregamento da lista. Agora cai para busca por id relacional
  // direto quando não encontra por legacy_id.
  try {
    let relUser = await findUserByLegacyId(ctx.cfg, uid);
    if (!relUser) relUser = await findUserById(ctx.cfg, uid);
    if (relUser) await deactivateUser(ctx.cfg, relUser.id);
  } catch (error) {
    throw error;
  }

  try {
    await deleteFsDocument(ctx.cfg, USERS_PARENT + '/' + uid);
  } catch (error) {
    syncFailure = await recordSyncFailure(ctx.cfg, {
      domain: 'usuarios',
      operation: 'mirror-relational-delete-to-fs',
      primary: 'public.users',
      mirror: 'fs_documents',
      key: uid,
      error,
    });
  }

  return ok({ id: uid, deleted: true }, {
    endpoint: '/api/v1/usuarios',
    sync: syncFailure ? 'pending' : 'complete',
    failureId: syncFailure && syncFailure.id,
  }, ctx.headers);
}

// ---------- BULK ----------
export async function bulkUpsertUsuarios(request, ctx) {
  // AUDITORIA-FINAL-10 (2026-08-01): mesmo risco de createOrUpsertUsuario,
  // em lote — sem esta checagem, qualquer usuário autenticado podia
  // sobrescrever qualquer registro de usuário via este endpoint.
  const priv = await resolveActorPrivilege(ctx);
  if (!priv || !priv.ok) {
    throw new ForbiddenError('Apenas administradores podem editar usuários em lote.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'usuarios_bulk_requires_admin',
    });
  }
  const body = await readJsonBody(request);
  const list = Array.isArray(body && body.list) ? body.list.filter(Boolean) : [];
  const entries = list.map((u) => {
    const id = sanitizeString(u && u.id, 120);
    if (!id) return null;
    return { path: USERS_PARENT + '/' + id, data: Object.assign({}, u, { id }) };
  }).filter(Boolean);

  const failures = [];
  // public.users é a fonte principal do lote; fs_documents é espelho.
  for (const entry of entries) {
    let relationalOk = false;
    try {
      const u = entry.data || {};
      const email = String(u.email || '').trim().toLowerCase();
      if (!email) {
        // Registros legados sem e-mail ainda podem existir no espelho; eles
        // ficam documentados como exceção até serem completados.
        relationalOk = true;
      } else {
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
        relationalOk = true;
      }
    } catch (error) {
      failures.push(await recordSyncFailure(ctx.cfg, {
        domain: 'usuarios',
        operation: 'relational-bulk-upsert',
        primary: 'public.users',
        mirror: 'fs_documents',
        key: entry.data && entry.data.id,
        payload: entry.data,
        error,
      }));
    }
    if (relationalOk) {
      try {
        await upsertFsDocuments(ctx.cfg, [entry]);
      } catch (error) {
        failures.push(await recordSyncFailure(ctx.cfg, {
          domain: 'usuarios',
          operation: 'mirror-relational-bulk-to-fs',
          primary: 'public.users',
          mirror: 'fs_documents',
          key: entry.data && entry.data.id,
          payload: entry.data,
          error,
        }));
      }
    }
  }

  return ok(entries.map((x) => scrubUser(x.data)), {
    endpoint: '/api/v1/usuarios/bulk',
    sync: failures.length ? 'pending' : 'complete',
    failureCount: failures.filter(Boolean).length,
  }, ctx.headers);
}

// ---------- LEGACY DOC (config/users) ----------
export async function getLegacyUsuarios(request, ctx) {
  const doc = await getFsDocument(ctx.cfg, 'config/users');
  // SEC-07 (2026-10-03): o documento tinha ph (hash de senha bruto) de
  // TODOS os usuários, sem nenhuma sanitização — mesmo sendo admin-only,
  // isso é grave: ph é exatamente o material usado pela ponte de sessão
  // legada (legacy-bridge-service.js) — conhecer o ph de outra pessoa
  // permite forjar uma sessão completa como ela, sem saber a senha real.
  const safeDoc = doc && Array.isArray(doc.list)
    ? Object.assign({}, doc, { list: doc.list.map(scrubUser) })
    : doc;
  return ok(safeDoc || null, { endpoint: '/api/v1/usuarios/legacy' }, ctx.headers);
}

// ---------- CONFIG (config/<name>) ----------
export async function getUsuarioConfig(request, ctx) {
  const url = new URL(request.url);
  const name = sanitizeString(url.searchParams.get('name'), 160);
  if (!name) throw new BadRequestError('name é obrigatório.');
  const doc = await getFsDocument(ctx.cfg, configPath(name));
  return respondWithVersionedDocument(
    request,
    doc || null,
    { endpoint: '/api/v1/usuarios/config', name },
    doc && doc.__meta && doc.__meta.version,
    ctx.headers,
  );
}

export async function putUsuarioConfig(request, ctx) {
  const url = new URL(request.url);
  const name = sanitizeString(url.searchParams.get('name'), 160);
  if (!name) throw new BadRequestError('name é obrigatório.');
  const body = await readJsonBody(request);

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

  const payload = Object.assign({}, body || {}, { ts: Date.now() });
  const saved = await saveVersionedDocument(ctx.cfg, configPath(name), payload, {
    version: expectedDocumentVersion(request, body),
  });
  return respondWithVersionedDocument(
    request,
    payload,
    { endpoint: '/api/v1/usuarios/config', name },
    saved.version,
    ctx.headers,
  );
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

  await deleteVersionedDocument(ctx.cfg, configPath(name), {
    version: expectedDocumentVersion(request),
  });
  return ok({ name, deleted: true }, { endpoint: '/api/v1/usuarios/config', name }, ctx.headers);
}
