// =====================================================================
// auth.js — middleware de autenticação (Fase 3.2)
// -----------------------------------------------------------------------
//   - Extrai o Bearer <jwt> do Authorization
//   - Verifica assinatura HS256 usando JWT_SECRET do env
//   - Anexa `ctx.user` = { sub, email, role, raw, ... }
//
// Rotas públicas (não exigem Bearer):
//   • /api/v1/health
//   • /api/v1/login
//   • /api/v1/session/legacy-nonce       (Fase 3.2 — nonce do bridge)
//   • /api/v1/session/legacy-bridge      (Fase 3.2 — emite JWT via HMAC)
// =====================================================================

import { verifyJwtHS256 } from '../utils/crypto.js';
import { UnauthorizedError } from '../errors/http-errors.js';

const PUBLIC_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/login',
  '/api/v1/session/legacy-nonce',
  '/api/v1/session/legacy-bridge',
]);

export function isPublicPath(pathname, method) {
  if (method === 'OPTIONS') return true;
  return PUBLIC_PATHS.has(pathname);
}

export async function authenticate(request, cfg) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new UnauthorizedError('Bearer token ausente.');
  const token = match[1].trim();
  try {
    const payload = await verifyJwtHS256(token, cfg.JWT_SECRET);
    return {
      sub: payload.sub || payload.user_id || payload.id || null,
      email: payload.email || null,
      role: payload.role || 'user',
      raw: payload,
    };
  } catch (err) {
    const msg = String((err && err.message) || 'JWT_INVALID');
    if (msg === 'JWT_EXPIRED') throw new UnauthorizedError('Sessão expirada.');
    throw new UnauthorizedError('Token inválido: ' + msg);
  }
}
