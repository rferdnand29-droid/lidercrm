import { hmacSha256Hex } from '../../utils/crypto.js';
import { UnauthorizedError } from '../../errors/http-errors.js';
import { loadLegacyUsers, findLegacyUserByIdentity } from './legacy-users.js';
import { buildJwtPayloadFromLegacy, issueToken } from './tokens.js';

export async function issueLegacySessionToken(cfg, params) {
  const uid = String((params && params.uid) || '').trim();
  const email = String((params && params.email) || '').trim().toLowerCase();
  const ts = Number((params && params.ts) || 0);
  const sig = String((params && params.sig) || '');

  if (!uid || !email || !ts || !sig) {
    throw new UnauthorizedError('Assinatura de sessão incompleta.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 60) {
    throw new UnauthorizedError('Assinatura de sessão expirada.');
  }

  const users = await loadLegacyUsers(cfg);
  const user = findLegacyUserByIdentity(users, uid, email);
  if (!user) {
    throw new UnauthorizedError('Usuário legado não encontrado.');
  }

  const ph = String(user.ph || '');
  if (!ph) {
    throw new UnauthorizedError('Usuário sem credencial local para a ponte.');
  }

  const material = uid + '|' + email + '|' + String(ts) + '|' + ph;
  const expected = await hmacSha256Hex(ph, material);
  if (expected !== sig) {
    throw new UnauthorizedError('Assinatura de sessão inválida.');
  }

  const payload = buildJwtPayloadFromLegacy(user);
  payload.auth_source = 'legacy-bridge';
  return issueToken(cfg, payload);
}

export async function legacyBridgeNonce(cfg, params) {
  const uid = String((params && params.uid) || '').trim();
  const email = String((params && params.email) || '').trim().toLowerCase();

  if (!uid || !email) {
    throw new UnauthorizedError('uid e email são obrigatórios.');
  }

  const users = await loadLegacyUsers(cfg);
  const user = findLegacyUserByIdentity(users, uid, email);
  if (!user) {
    throw new UnauthorizedError('Usuário legado não encontrado.');
  }

  return {
    ts: Math.floor(Date.now() / 1000),
    ttlSeconds: 60,
    hmacFields: ['uid', 'email', 'ts', 'ph'],
    hmacSeparator: '|',
    algorithm: 'HMAC-SHA256-HEX',
  };
}
