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
  clearPasswordResetFlags as relClearPasswordResetFlags,
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

// =====================================================================
// adminResetPasswordService (2026-07-27)
// ---------------------------------------------------------------------
// Permite que um ADM redefina a senha de qualquer usuário SEM conhecer
// a senha atual. Necessário quando o hash armazenado está acima do cap
// do runtime Cloudflare Workers (ex.: 210k > 100k) — nesse caso,
// verifyLegacyPassword lança HashIterCapExceededError antes de poder
// validar currentPassword, tornando o fluxo normal de change-password
// inutilizável para destravar o usuário.
//
// Segurança:
//   • O hash novo é gerado NO SERVIDOR por hashPasswordS2() (pbkdf2$,
//     100k iterações) — o cliente nunca manipula nem recebe o hash.
//   • Apenas role='adm' (verificado no JWT) pode chamar este endpoint.
//   • As flags needs_password_reset e iter_cap_exceeded_reason são
//     limpas no relacional (best-effort) — o usuário está destravado.
//   • Dual-write: atualiza relacional (public.users) E fs_documents
//     (config/users/items/<uid>), igual ao changePasswordService.
// =====================================================================
export async function adminResetPasswordService(cfg, sessionUser, params) {
  const newPassword = String((params && params.newPassword) || '');
  const targetUid = String((params && params.targetUserId) || '').trim();

  if (!newPassword || newPassword.length < 8)
    throw new BadRequestError('A nova senha precisa ter pelo menos 8 caracteres.');
  if (!targetUid)
    throw new BadRequestError('targetUserId é obrigatório.');

  const sessionRole = String((sessionUser && sessionUser.role) || '').toLowerCase();
  const sessionUid = String((sessionUser && sessionUser.sub) || '').trim();
  const sessionSource = String(
    (sessionUser && sessionUser.raw && sessionUser.raw.auth_source)
    || (sessionUser && sessionUser.auth_source)
    || ''
  ).toLowerCase();

  // PATCH (2026-07-29 post-update-recovery): mantém o reset administrativo
  // clássico, mas abre uma exceção ESTRITAMENTE controlada para o próprio
  // usuário destravar a conta quando o login falhou por iter-cap e ele
  // comprovou, no MESMO aparelho, que conhece a senha atual via
  // legacy-bridge. Sem essa exceção, o fluxo "Trocar agora" do modal
  // pós-login seria impossível sem intervenção do ADM.
  const isAdm = sessionRole === 'adm';
  const isSelfLegacyRecovery = (
    sessionSource === 'legacy-bridge' &&
    sessionUid &&
    targetUid &&
    sessionUid === targetUid
  );

  if (!isAdm && !isSelfLegacyRecovery)
    throw new ForbiddenError('Apenas ADM pode resetar a senha de outro usuário.');

  // Gera hash pbkdf2$ no servidor — nasce em 100k iterações, dentro do cap.
  const newPh = await hashPasswordS2(newPassword);
  const now = new Date().toISOString();

  // ------- Relacional (public.users) -------
  const relUser = await findRelationalUser(cfg, targetUid, null);
  // FIX (2026-08-22): antes, este bloco só registrava "tentei" — nunca
  // conferia se a gravação REALMENTE aconteceu. updateUserPasswordHash
  // (repositório) já engole qualquer exceção e devolve null nesse caso,
  // então um erro de rede/RLS/constraint fazia o reset "funcionar" pro
  // ADM (sem nenhum aviso) enquanto o hash antigo continuava valendo no
  // relacional — e como o login checa o relacional primeiro (e, antes
  // da correção acima em loginService, travava ali sem tentar o
  // fs_documents), isso deixava a conta destrancada só na aparência.
  let relWriteOk = false;
  if (relUser) {
    try {
      const result = await relUpdatePasswordHash(cfg, relUser.id, newPh);
      relWriteOk = !!result;
      if (relWriteOk) await relClearPasswordResetFlags(cfg, relUser.id);
    } catch (_e) { relWriteOk = false; /* fs_documents ainda é tentado abaixo */ }
  }

  // ------- fs_documents (legado) -------
  let fsUpdated = false;
  try {
    const found = await loadLegacyUserById(cfg, targetUid);
    if (found && found.user) {
      await writeBackNewPh(cfg, found, newPh);
      fsUpdated = true;
    }
  } catch (_e) { /* best-effort */ }

  if (!relUser && !fsUpdated)
    throw new NotFoundError('Usuário não encontrado em nenhuma fonte (relacional nem fs_documents).');

  // FIX (2026-08-22): se o usuário EXISTE em algum lugar mas a gravação
  // da senha nova falhou nos dois — não reporta sucesso. Antes disso, a
  // única forma de "success:false" era o usuário não existir em
  // nenhuma fonte; um usuário que existe mas cuja senha não foi
  // atualizada em lugar nenhum sempre "funcionava" do ponto de vista do
  // ADM, mesmo sem ter mudado nada de verdade.
  if (relUser && !relWriteOk && !fsUpdated) {
    throw new Error('A senha não pôde ser gravada em nenhum armazenamento (relacional nem fs_documents) — tente novamente em instantes. Se persistir, contate o suporte técnico.');
  }

  return {
    id: (relUser && (relUser.legacy_id || relUser.id)) || targetUid,
    email: (relUser && relUser.email) || null,
    passwordUpdatedAt: now,
    storage: (relWriteOk ? 'relational' : '') + (relWriteOk && fsUpdated ? '+' : '') + (fsUpdated ? 'fs' : '') || 'fs_documents',
  };
}
