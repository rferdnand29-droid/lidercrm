// =====================================================================
// change-password-service.js — Fase 1 relacional (2026-07-19)
// -----------------------------------------------------------------------
// Dual-write: quando o usuário troca senha, gravamos em:
//   • public.users  (fonte relacional, prioritária)
//   • fs_documents  (fonte legada — mantém patches e módulos antigos)
// A verificação da senha atual tenta primeiro relacional; se não achar,
// cai no fs_documents.
// =====================================================================

import { BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError } from '../../errors/http-errors.js';
import { verifyLegacyPassword, hashPasswordS2 } from './password.js';
import { loadLegacyUserById, writeBackNewPh } from './legacy-users.js';
import {
  findUserByEmail as relFindUserByEmail,
  findUserById as relFindUserById,
  findUserByLegacyId as relFindUserByLegacyId,
  updateUserPasswordHash as relUpdatePasswordHash,
  relationalToLegacy,
} from '../../repositories/users-relational-repository.js';

async function findRelationalUser(cfg, targetUid, sessionEmail) {
  // Tenta por legacy_id, depois por uuid, depois por email
  let u = await relFindUserByLegacyId(cfg, targetUid);
  if (!u) u = await relFindUserById(cfg, targetUid);
  if (!u && sessionEmail) u = await relFindUserByEmail(cfg, sessionEmail);
  return u;
}

export async function changePasswordService(cfg, sessionUser, params) {
  const currentPassword = String((params && params.currentPassword) || '');
  const newPassword = String((params && params.newPassword) || '');
  const requestedTarget = String((params && params.targetUserId) || '').trim();

  if (!currentPassword) throw new BadRequestError('currentPassword é obrigatória.');
  if (!newPassword || newPassword.length < 8) throw new BadRequestError('A nova senha precisa ter pelo menos 8 caracteres.');
  if (newPassword === currentPassword) throw new BadRequestError('A nova senha não pode ser igual à senha atual.');

  const sessionUid = String((sessionUser && sessionUser.sub) || '').trim();
  const sessionRole = String((sessionUser && sessionUser.role) || '').toLowerCase();
  const sessionEmail = String((sessionUser && sessionUser.email) || '').trim().toLowerCase();
  if (!sessionUid) throw new UnauthorizedError('Sessão inválida.');

  const targetUid = requestedTarget || sessionUid;
  const isSelf = targetUid === sessionUid;
  const isAdm = sessionRole === 'adm';
  if (!isSelf && !isAdm) {
    throw new ForbiddenError('Apenas o próprio usuário ou um ADM pode trocar a senha desta conta.');
  }

  // Gera novo hash uma única vez
  const newPh = await hashPasswordS2(newPassword);
  const now = new Date().toISOString();

  // ------- Tenta caminho RELACIONAL -------
  const relUser = await findRelationalUser(cfg, targetUid, isSelf ? sessionEmail : null);
  if (relUser && relUser.password_hash) {
    const asLegacy = relationalToLegacy(relUser, sessionRole);
    const okCurrent = await verifyLegacyPassword(asLegacy, currentPassword);
    if (okCurrent) {
      // Atualiza no relacional
      await relUpdatePasswordHash(cfg, relUser.id, newPh);
      // Também tenta espelhar no fs_documents (best-effort, não bloqueia)
      try {
        const found = await loadLegacyUserById(cfg, relUser.legacy_id || targetUid);
        if (found && found.user) await writeBackNewPh(cfg, found, newPh);
      } catch (_e) { /* silencioso */ }
      return {
        id: relUser.legacy_id || relUser.id,
        email: relUser.email || null,
        role: sessionRole || null,
        passwordUpdatedAt: now,
        storage: 'relational+fs',
      };
    }
    // Se relacional achou mas a senha atual não bate, ainda pode ser que o
    // fs_documents tenha um hash diferente (histórico). Tenta o legacy.
  }

  // ------- Caminho LEGADO (fs_documents) -------
  const found = await loadLegacyUserById(cfg, targetUid);
  if (!found || !found.user) {
    // Se nem relacional nem fs_documents têm esse uid, 404
    if (!relUser) throw new NotFoundError('Usuário não encontrado.');
    // Se o relacional tem mas o legado não, e a senha atual não bate → 401
    throw new UnauthorizedError('Senha atual incorreta.');
  }

  const okCurrent = await verifyLegacyPassword(found.user, currentPassword);
  if (!okCurrent) throw new UnauthorizedError('Senha atual incorreta.');

  const updated = await writeBackNewPh(cfg, found, newPh);

  // Também tenta espelhar no relacional (best-effort)
  if (relUser) {
    try { await relUpdatePasswordHash(cfg, relUser.id, newPh); } catch (_e) {}
  }

  return {
    id: String(updated.id || updated.uid || targetUid),
    email: updated.email || null,
    role: updated.role || null,
    passwordUpdatedAt: updated.passwordUpdatedAt || now,
    storage: found.storage + (relUser ? '+relational' : ''),
  };
}
