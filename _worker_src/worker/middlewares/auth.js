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
//   • GET /api/v1/branding                  (branding global antes do login)
// =====================================================================

import { verifyJwtHS256, verifyJwtSignatureHS256 } from '../utils/crypto.js';
import { UnauthorizedError } from '../errors/http-errors.js';

const PUBLIC_PATHS = new Set([
  '/api/v1/health',
  '/api/v1/login',
  '/api/v1/session/legacy-nonce',
  '/api/v1/session/legacy-bridge',
]);

// [FIX 20260903] Janela de graça do refresh.
// -------------------------------------------------------------------
// Sintoma corrigido: quando o app ficava fechado/suspenso além da
// validade do JWT (8h), o token expirava e NADA conseguia renovar a
// sessão — /session/refresh exigia token válido, e a ponte legada só
// funciona se o registro local do usuário ainda tiver `ph` (a cópia
// vinda da nuvem é higienizada e não tem). Resultado: enxurrada de 401
// em /users/last-seen e /kanban/stream, AUTH_PENDING em cascata e o app
// preso em dados locais até o usuário digitar a senha de novo.
//
// Agora — e SOMENTE em POST /api/v1/session/refresh — um token expirado
// é aceito se a assinatura HS256 continuar válida e a expiração tiver
// ocorrido há menos de REFRESH_GRACE_SECONDS. Nenhuma outra rota muda:
// token expirado segue 401 em todo o resto da API.
const REFRESH_PATH = '/api/v1/session/refresh';
const REFRESH_GRACE_SECONDS = 7 * 24 * 60 * 60; // 7 dias

export function isPublicPath(pathname, method) {
  if (method === 'OPTIONS') return true;
  if (pathname === '/api/v1/branding' && method === 'GET') return true;
  return PUBLIC_PATHS.has(pathname);
}

function graceSeconds(cfg) {
  const raw = Number(cfg && cfg.REFRESH_GRACE_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : REFRESH_GRACE_SECONDS;
}

function toUser(payload, extra) {
  return {
    sub: payload.sub || payload.user_id || payload.id || null,
    email: payload.email || null,
    role: payload.role || 'user',
    raw: payload,
    ...(extra || {}),
  };
}

export async function authenticate(request, cfg) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  let token = match ? match[1].trim() : null;
  let pathname = '';
  try { pathname = new URL(request.url).pathname; } catch (_e) {}
  if (!token) {
    // [FIX 20260926] EventSource (usado pelo streaming de tempo real)
    // não consegue enviar cabeçalhos customizados — é uma limitação da
    // própria API do navegador, não deste projeto. Fallback restrito
    // EXCLUSIVAMENTE a essa rota — todas as outras continuam exigindo
    // o header Authorization normalmente, sem exceção.
    if (pathname === '/api/v1/kanban/stream') {
      try {
        const qToken = new URL(request.url).searchParams.get('token');
        if (qToken) token = qToken;
      } catch (_e) {}
    }
  }
  if (!token) throw new UnauthorizedError('Bearer token ausente.');
  try {
    const payload = await verifyJwtHS256(token, cfg.JWT_SECRET);
    return toUser(payload);
  } catch (err) {
    const msg = String((err && err.message) || 'JWT_INVALID');
    if (msg === 'JWT_EXPIRED') {
      const renewed = await tryExpiredRefreshGrace(token, cfg, pathname, request.method);
      if (renewed) return renewed;
      throw new UnauthorizedError('Sessão expirada.');
    }
    throw new UnauthorizedError('Token inválido: ' + msg);
  }
}

async function tryExpiredRefreshGrace(token, cfg, pathname, method) {
  if (pathname !== REFRESH_PATH || String(method || '').toUpperCase() !== 'POST') return null;
  let payload;
  try {
    payload = await verifyJwtSignatureHS256(token, cfg.JWT_SECRET);
  } catch (_e) {
    return null; // assinatura inválida — nunca renova
  }
  const exp = Number(payload && payload.exp);
  if (!Number.isFinite(exp)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (exp >= now) return null;
  if (now - exp > graceSeconds(cfg)) return null; // fora da janela de graça
  return toUser(payload, { renewedFromExpired: true });
}
