// =====================================================================
// login-service.js - Fase 1 relacional (2026-07-19)
// ---------------------------------------------------------------------
// CORREÇÃO (2026-07-27 iter-cap): captura HashIterCapExceededError
//   lançado por password.js para hashes armazenadas com iterações
//   acima do cap do runtime Cloudflare Workers (100000). Marca o
//   usuário como needs_password_reset, registra security event e
//   devolve 401 tipado em vez de 401 opaco "Senha inválida".
// =====================================================================

import { signInWithPassword } from '../../lib/supabase-rest.js';
import { UnauthorizedError } from '../../errors/http-errors.js';
import { loadLegacyUsers, findLegacyUserByEmail } from './legacy-users.js';
import { verifyLegacyPassword, HashIterCapExceededError } from './password.js';
import { markUserNeedsPasswordReset } from './iter-cap-recovery.js';
import { buildJwtPayloadFromLegacy, buildJwtPayloadFromSupabase, issueToken } from './tokens.js';
import {
  findUserByEmail as relFindUserByEmail,
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

// FIX (2026-08-03) — resolve o departamento do time no momento do
// login, pra poder embutir no JWT (payload.departamento_id) e o
// front não precisar de uma consulta extra pra saber se o usuário
// está num departamento. Fail-safe: qualquer erro retorna null (cai
// em "sem departamento", nunca quebra o login).
async function resolveDepartamentoIdFromTeam(cfg, teamId) {
  if (!teamId) return null;
  try {
    const { rows } = await selectFrom(cfg, 'teams', {
      filters: { id: 'eq.' + teamId },
      select: 'departamento_id',
      limit: 1,
    });
    return (rows && rows[0] && rows[0].departamento_id) || null;
  } catch (_e) {
    return null;
  }
}

async function findRelationalUserByEmailLoose(cfg, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;
  try {
    const { rows } = await selectFrom(cfg, 'users', {
      filters: { email: 'eq.' + target },
      select: '*',
      limit: 1,
    });
    return (rows && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

export async function loginService(cfg, email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    throw new UnauthorizedError('Preencha e-mail e senha.');
  }

  let upstreamErrors = [];

  // ------- 1) RELACIONAL (public.users) -------
  let relationalUser;
  try {
    relationalUser = await relFindUserByEmail(cfg, cleanEmail);
  } catch (err) {
    upstreamErrors.push('relFindUserByEmail: ' + ((err && err.message) || String(err)));
    relationalUser = null;
  }
  if (!relationalUser) {
    try {
      const loose = await findRelationalUserByEmailLoose(cfg, cleanEmail);
      if (loose && loose.active !== false) relationalUser = loose;
    } catch (err) {
      upstreamErrors.push('findLoose: ' + ((err && err.message) || String(err)));
    }
  }
  if (relationalUser && relationalUser.password_hash) {
    let roleSlug = 'user';
    try { roleSlug = await resolveRoleSlug(cfg, relationalUser.role_id); }
    catch (err) { upstreamErrors.push('resolveRoleSlug: ' + ((err && err.message) || String(err))); }
    const asLegacy = relationalToLegacy(relationalUser, roleSlug);
    // FIX (2026-08-03): resolve departamento_id via team_id ANTES de
    // montar o JWT — sem isso, o front nunca sabe se o usuário está
    // num departamento (necessário pra aba Time e pro LF_SCOPE_V2).
    try { asLegacy.departamento_id = await resolveDepartamentoIdFromTeam(cfg, asLegacy.team_id); }
    catch (err) { upstreamErrors.push('resolveDepartamentoId: ' + ((err && err.message) || String(err))); }
    // FIX (2026-08-22) — CAUSA RAIZ de "usuário criado, depois de um
    // deploy a senha passou a dar 'incorreta', e nem resetar a senha
    // pelo ADM resolvia": quando o hash relacional está acima do cap de
    // iterações do runtime (ex.: criado antes de um deploy que mudou a
    // constante de iterações), verifyLegacyPassword lança
    // HashIterCapExceededError. Antes, esse erro era relançado NA HORA,
    // encerrando toda a função loginService — o código NUNCA chegava a
    // checar o fs_documents (passo 2, logo abaixo), mesmo que o
    // fs_documents tivesse a senha certa (ex.: acabou de ser
    // redefinida por um ADM, que grava nos dois lugares). Um reset de
    // senha pelo ADM que tenha atualizado o fs_documents corretamente
    // mas falhado — mesmo que silenciosamente — em atualizar o
    // relacional (updateUserPasswordHash engole exceção e devolve null
    // sem avisar ninguém) deixava o usuário PERMANENTEMENTE travado:
    // nenhuma senha nova, de nenhum admin, jamais teria efeito, porque
    // o relacional "envenenado" sempre travava o login antes mesmo de
    // tentar o legado. Agora: guarda o erro, mas SEGUE pro passo 2 em
    // vez de abortar — dá ao fs_documents a chance real de resolver o
    // login, exatamente como já acontece quando a senha relacional
    // simplesmente não bate (fluxo normal, sem exceção, já cai pro
    // fs_documents desde sempre).
    let relIterCapError = null;
    try {
      const ok = await verifyLegacyPassword(asLegacy, password);
      if (ok) {
        try { relUpdateLastLogin(cfg, relationalUser.id).catch(() => {}); } catch (_e) {}
        return issueToken(cfg, Object.assign(
          buildJwtPayloadFromLegacy(asLegacy),
          { auth_source: 'relational' }
        ));
      }
    } catch (err) {
      if (err instanceof HashIterCapExceededError) {
        relIterCapError = err;
        upstreamErrors.push('verifyLegacyPassword(rel): hash_iter_cap_exceeded (tentando fs_documents antes de desistir)');
      } else {
        upstreamErrors.push('verifyLegacyPassword(rel): ' + ((err && err.message) || String(err)));
      }
    }

    // Se o relacional bateu na trava de iterações, tenta o fs_documents
    // ANTES de desistir — só marca needs_password_reset (e devolve o
    // 401 tipado, orientando a redefinir a senha) se o fs_documents
    // TAMBÉM não resolver o login (não existe, senha errada, ou também
    // está com hash acima do cap).
    if (relIterCapError) {
      let legacyUsersForCap = [];
      try { legacyUsersForCap = await loadLegacyUsers(cfg); } catch (_e) { /* segue com lista vazia */ }
      const legacyUserForCap = findLegacyUserByEmail(legacyUsersForCap, cleanEmail);
      if (legacyUserForCap) {
        try {
          const okLegacy = await verifyLegacyPassword(legacyUserForCap, password);
          if (okLegacy) return issueToken(cfg, buildJwtPayloadFromLegacy(legacyUserForCap));
        } catch (errLegacy) {
          if (!(errLegacy instanceof HashIterCapExceededError)) {
            upstreamErrors.push('verifyLegacyPassword(fs, fallback do cap): ' + ((errLegacy && errLegacy.message) || String(errLegacy)));
          }
          // Se o legado TAMBÉM está acima do cap, não tem mais fallback
          // — cai no needs_password_reset abaixo mesmo.
        }
      }
      try { await markUserNeedsPasswordReset(cfg, relationalUser, relIterCapError); } catch (_e) {}
      throw new UnauthorizedError(
        'Sua senha precisa ser redefinida por um administrador.',
        { code: relIterCapError.code, storedIters: relIterCapError.storedIters, cap: relIterCapError.cap }
      );
    }
  }

  // ------- 2) FS_DOCUMENTS (legado / compat com patches) -------
  let legacyLookupError = null;
  let legacyUsers = [];
  try {
    legacyUsers = await loadLegacyUsers(cfg);
  } catch (error) {
    legacyLookupError = error;
    upstreamErrors.push('loadLegacyUsers: ' + ((error && error.message) || String(error)));
  }

  const legacyUser = findLegacyUserByEmail(legacyUsers, cleanEmail);
  if (legacyUser) {
    try {
      const ok = await verifyLegacyPassword(legacyUser, password);
      if (ok) {
        return issueToken(cfg, buildJwtPayloadFromLegacy(legacyUser));
      }
      throw new UnauthorizedError('E-mail ou senha invalidos.', { upstreamErrors });
    } catch (err) {
      // Mesmo tratamento para fs_documents: tipa o 401 quando o hash
      // está acima do cap.
      if (err instanceof HashIterCapExceededError) {
        try { await markUserNeedsPasswordReset(cfg, legacyUser, err); } catch (_e) {}
        throw new UnauthorizedError(
          'Sua senha precisa ser redefinida por um administrador.',
          { code: err.code, storedIters: err.storedIters, cap: err.cap }
        );
      }
      if (err && err.name === 'UnauthorizedError') throw err;
      upstreamErrors.push('verifyLegacyPassword(fs): ' + ((err && err.message) || String(err)));
      throw new UnauthorizedError('E-mail ou senha invalidos.', { upstreamErrors });
    }
  }

  if (relationalUser) {
    throw new UnauthorizedError('E-mail ou senha invalidos.', { upstreamErrors });
  }

  // ------- 3) SUPABASE AUTH (para migracao futura) -------
  try {
    const auth = await signInWithPassword(cfg, email, password);
    return issueToken(cfg, buildJwtPayloadFromSupabase(auth, email));
  } catch (error) {
    upstreamErrors.push('signInWithPassword: ' + ((error && error.message) || String(error)));
    if (legacyLookupError) {
      throw new UnauthorizedError(
        'Nao foi possivel validar o login (falha ao consultar o Supabase - verifique SUPABASE_URL/SUPABASE_ANON_KEY do Cloudflare Pages, veja /api/v1/health).',
        { legacyError: String((legacyLookupError && legacyLookupError.message) || legacyLookupError), upstreamErrors }
      );
    }
    if (error && error.status === 401) {
      throw new UnauthorizedError('E-mail ou senha invalidos.', { upstreamErrors });
    }
    throw new UnauthorizedError('E-mail ou senha invalidos.', { upstreamErrors });
  }
}
