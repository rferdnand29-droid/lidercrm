// =====================================================================
// auth-controller.js — Fase 3.2
// -----------------------------------------------------------------------
// Controllers de autenticação/sessão do Worker.
//
// Rotas cobertas:
//   POST /api/v1/login                       -> loginController
//   POST /api/v1/logout                      -> logoutController
//   GET  /api/v1/session                     -> sessionController
//   POST /api/v1/session/refresh             -> refreshSessionController
//   GET  /api/v1/session/legacy-nonce        -> legacyNonceController
//   POST /api/v1/session/legacy-bridge       -> legacyBridgeController
// =====================================================================

import { validate, readJsonBody } from '../validators/validate.js';
import { loginSchema, legacyBridgeSchema, changePasswordSchema } from '../schemas/index.js';
import {
  loginService,
  issueLegacySessionToken,
  legacyBridgeNonce,
  changePasswordService,
} from '../services/auth-service.js';
import { signJwtHS256 } from '../utils/crypto.js';
import { ok } from '../utils/response.js';

export async function loginController(request, ctx) {
  const body = await readJsonBody(request);
  const data = validate(body, loginSchema);
  const result = await loginService(ctx.cfg, data.email, data.password);
  return ok(result, { endpoint: '/api/v1/login' }, ctx.headers);
}

// Logout é intencionalmente stateless — o Worker não mantém sessão do
// lado servidor (JWT stateless). O endpoint existe pra o frontend poder
// invalidar caches próprios e pra registrar no header a intenção. O
// próprio httpClient já limpa localStorage no 401.
export async function logoutController(request, ctx){
  return ok({ loggedOut: true }, { endpoint: '/api/v1/logout' }, ctx.headers);
}

// Retorna os claims da sessão atual (útil pro frontend confirmar quem
// está autenticado sem precisar re-decodificar o JWT).
export async function sessionController(request, ctx){
  const u = ctx.user || {};
  return ok({
    authenticated: true,
    user: {
      id: u.sub || null,
      email: u.email || null,
      role: u.role || 'user',
      nome: (u.raw && u.raw.nome) || null,
      cargo: (u.raw && u.raw.cargo) || null,
      source: (u.raw && u.raw.auth_source) || 'unknown',
    },
    exp: (u.raw && u.raw.exp) || null,
    iat: (u.raw && u.raw.iat) || null,
  }, { endpoint: '/api/v1/session' }, ctx.headers);
}

// Refresh silencioso: re-emite um JWT com o mesmo payload se o atual
// ainda é válido. Permite estender sessão sem re-login e sem precisar
// da senha. Usado pelo httpClient quando faltam < 5min pra expirar.
export async function refreshSessionController(request, ctx){
  const u = ctx.user || {};
  const raw = u.raw || {};
  const payload = {
    sub: u.sub,
    email: u.email,
    role: u.role,
    nome: raw.nome || null,
    cargo: raw.cargo || null,
    auth_source: raw.auth_source || 'refresh',
  };
  const token = await signJwtHS256(payload, ctx.cfg.JWT_SECRET, ctx.cfg.JWT_EXPIRES_SECONDS);
  return ok({
    token,
    expiresIn: ctx.cfg.JWT_EXPIRES_SECONDS,
    user: {
      id: payload.sub, email: payload.email, role: payload.role,
      nome: payload.nome, cargo: payload.cargo, source: payload.auth_source,
    },
  }, { endpoint: '/api/v1/session/refresh' }, ctx.headers);
}

// GET /api/v1/session/legacy-nonce
// Rota PÚBLICA — devolve o timestamp servidor + as instruções pro cliente
// montar o HMAC da ponte legada.
export async function legacyNonceController(request, ctx){
  const url = new URL(request.url);
  const uid = url.searchParams.get('uid') || '';
  const email = url.searchParams.get('email') || '';
  const info = await legacyBridgeNonce(ctx.cfg, { uid, email });
  return ok(info, { endpoint: '/api/v1/session/legacy-nonce' }, ctx.headers);
}

// POST /api/v1/session/legacy-bridge
// Rota PÚBLICA — recebe a assinatura HMAC assinada pelo cliente com o
// material (uid|email|ts|ph) e devolve um JWT do Worker sem exigir
// re-digitar senha. Fecha a "ponte de autenticação" mencionada na
// documentação da Fase 3.1.
export async function legacyBridgeController(request, ctx){
  const body = await readJsonBody(request);
  const data = validate(body, legacyBridgeSchema);
  const result = await issueLegacySessionToken(ctx.cfg, data);
  return ok(result, { endpoint: '/api/v1/session/legacy-bridge' }, ctx.headers);
}

// POST /api/v1/usuarios/change-password
// Rota AUTENTICADA (o middleware auth já exige Bearer). Troca o hash
// da senha (campo `ph`) no fs_documents. Substitui completamente o
// fluxo antigo em que o frontend gerava o hash localmente e gravava em
// lf6_u — esse fluxo não funciona mais desde a remoção da seed ADM.
//
// Ver changePasswordService (services/auth-service.js) pra regras de
// autorização (dono vs. ADM) e formato do hash gravado.
export async function changePasswordController(request, ctx){
  const body = await readJsonBody(request);
  const data = validate(body, changePasswordSchema);
  const result = await changePasswordService(ctx.cfg, ctx.user, data);
  return ok(result, { endpoint: '/api/v1/usuarios/change-password' }, ctx.headers);
}
