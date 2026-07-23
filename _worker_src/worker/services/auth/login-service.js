// =====================================================================
// login-service.js — Fase 1 relacional (2026-07-19)
// -----------------------------------------------------------------------
// Ordem de tentativa de autenticação:
//   1) public.users (tabela relacional)   [PREFERIDO]
//   2) fs_documents (config/users, legacy) [fallback — mantém patches]
//   3) Supabase Auth (auth.users)          [para o dia em que migrarmos]
//
// Se qualquer camada falhar (tabela não existe, key sem permissão),
// SILENCIA e passa para a próxima. NUNCA quebra o login por causa
// de uma camada ausente.
// =====================================================================

import { signInWithPassword } from '../../lib/supabase-rest.js';
import { UnauthorizedError } from '../../errors/http-errors.js';
import { loadLegacyUsers, findLegacyUserByEmail } from './legacy-users.js';
import { verifyLegacyPassword } from './password.js';
import { buildJwtPayloadFromLegacy, buildJwtPayloadFromSupabase, issueToken } from './tokens.js';
import {
  findUserByEmail as relFindUserByEmail,
  findRoleBySlug as relFindRoleBySlug,
  updateLastLogin as relUpdateLastLogin,
  relationalToLegacy,
} from '../../repositories/users-relational-repository.js';
import { selectFrom } from '../../lib/supabase-rest.js';

async function resolveRoleSlug(cfg, roleId) {
  if (!roleId) return 'user';
  try {
    const { rows } = await selectFrom(cfg, 'roles', {
      filters: { id: 'eq.' + roleId },
      select: 'slug',
      limit: 1,
    });
    return (rows && rows[0] && rows[0].slug) || 'user';
  } catch (_e) {
    return 'user';
  }
}

export async function loginService(cfg, email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new UnauthorizedError('Preencha e-mail e senha.');
  }

  // ------- 1) RELACIONAL (public.users) -------
  let relationalUser = null;
  try {
    relationalUser = await relFindUserByEmail(cfg, cleanEmail);
  } catch (_e) {
    relationalUser = null;
  }
  if (relationalUser && relationalUser.password_hash) {
    const roleSlug = await resolveRoleSlug(cfg, relationalUser.role_id);
    const asLegacy = relationalToLegacy(relationalUser, roleSlug);
    const ok = await verifyLegacyPassword(asLegacy, password);
    if (ok) {
      // Marca último login (best-effort, não bloqueia)
      relUpdateLastLogin(cfg, relationalUser.id).catch(() => {});
      return issueToken(cfg, Object.assign(
        buildJwtPayloadFromLegacy(asLegacy),
        { auth_source: 'relational' }
      ));
    }
    // Hash está lá mas não bate → tenta fs_documents antes de dar 401
  }

  // ------- 2) FS_DOCUMENTS (legado / compat com patches) -------
  let legacyLookupError = null;
  let legacyUsers = [];
  try {
    legacyUsers = await loadLegacyUsers(cfg);
  } catch (error) {
    legacyLookupError = error;
  }

  const legacyUser = findLegacyUserByEmail(legacyUsers, cleanEmail);
  if (legacyUser) {
    const ok = await verifyLegacyPassword(legacyUser, password);
    if (ok) {
      return issueToken(cfg, buildJwtPayloadFromLegacy(legacyUser));
    }
    throw new UnauthorizedError('E-mail ou senha inválidos.');
  }

  // Se o relacional achou o usuário mas a senha não bateu, e o fs_documents
  // não tem nada, então é senha errada mesmo.
  if (relationalUser) {
    throw new UnauthorizedError('E-mail ou senha inválidos.');
  }

  // ------- 3) SUPABASE AUTH (para migração futura) -------
  try {
    const auth = await signInWithPassword(cfg, email, password);
    return issueToken(cfg, buildJwtPayloadFromSupabase(auth, email));
  } catch (error) {
    if (legacyLookupError) {
      throw new UnauthorizedError(
        'Não foi possível validar o login (falha ao consultar o Supabase — verifique SUPABASE_URL/SUPABASE_ANON_KEY do Cloudflare Pages, veja /api/v1/health).',
        { legacyError: String((legacyLookupError && legacyLookupError.message) || legacyLookupError) }
      );
    }
    if (error && error.status === 401) {
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }
    throw new UnauthorizedError('E-mail ou senha inválidos.');
  }
}
