import { signJwtHS256 } from '../../utils/crypto.js';

export function buildJwtPayloadFromLegacy(user) {
  return {
    sub: String(user.id || user.uid || user.email),
    email: user.email || null,
    role: user.role || (user.admExtra ? 'adm' : (user.cargo || 'user')),
    nome: user.nome || null,
    cargo: user.cargo || null,
    auth_source: 'legacy',
  };
}

export function buildJwtPayloadFromSupabase(auth, email) {
  const user = (auth && auth.user) || {};
  return {
    sub: user.id || user.sub || email,
    email: user.email || email,
    role: (user.app_metadata && user.app_metadata.role) || 'user',
    supabase_access_token: (auth && auth.access_token) || null,
    auth_source: 'supabase',
  };
}

export async function issueToken(cfg, payload) {
  const token = await signJwtHS256(payload, cfg.JWT_SECRET, cfg.JWT_EXPIRES_SECONDS);
  return {
    token,
    expiresIn: cfg.JWT_EXPIRES_SECONDS,
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      nome: payload.nome || null,
      cargo: payload.cargo || null,
      source: payload.auth_source || 'unknown',
    },
  };
}
