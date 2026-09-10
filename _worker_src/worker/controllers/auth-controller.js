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
import { loginSchema, legacyBridgeSchema, changePasswordSchema, adminResetPasswordSchema } from '../schemas/index.js';
import {
  loginService,
  issueLegacySessionToken,
  legacyBridgeNonce,
  changePasswordService,
  adminResetPasswordService,
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
//
// Etapa 6.1 (2026-07-23): passamos `cargoCodigo` e `admExtra` também
// no /session, espelhando o que sai em /login e /refresh — o front
// pode confiar em uma única fonte para as caps do usuário.
export async function sessionController(request, ctx){
  const u = ctx.user || {};
  const raw = u.raw || {};
  return ok({
    authenticated: true,
    user: {
      id: u.sub || null,
      email: u.email || null,
      role: u.role || 'user',
      nome: raw.nome || null,
      cargo: raw.cargo || null,
      cargoCodigo: raw.cargo_codigo || null,
      admExtra: raw.adm_extra === true,
      teamId: raw.team_id || null,
      departamentoId: raw.departamento_id || null,
      source: raw.auth_source || 'unknown',
    },
    exp: raw.exp || null,
    iat: raw.iat || null,
  }, { endpoint: '/api/v1/session' }, ctx.headers);
}

// Refresh silencioso: re-emite um JWT com o mesmo payload se o atual
// ainda é válido. Permite estender sessão sem re-login e sem precisar
// da senha. Usado pelo httpClient quando faltam < 5min pra expirar.
//
// Etapa 6.1 (2026-07-23): o payload novo precisa preservar
// `cargo_codigo` e `adm_extra` — caso contrário, cada refresh apagaria
// silenciosamente esses claims e o middleware authz.js voltaria a
// depender do fallback textual. Puramente aditivo: campos ausentes no
// token antigo (usuário logou antes desta versão) permanecem null e o
// authz cai no fallback normalizeCargoCode(cargo) — sem regressão.
export async function refreshSessionController(request, ctx){
  const u = ctx.user || {};
  const raw = u.raw || {};
  const payload = {
    sub: u.sub,
    email: u.email,
    role: u.role,
    nome: raw.nome || null,
    cargo: raw.cargo || null,
    cargo_codigo: raw.cargo_codigo || null,
    adm_extra: raw.adm_extra === true,
    // FIX (2026-08-03): sem preservar estes dois aqui, eles some
    // silenciosamente no primeiro refresh (token reemitido só com os
    // campos abaixo) — mesmo risco que o comentário acima já descrevia
    // pra cargo_codigo/adm_extra antes da correção da Etapa 6.1.
    team_id: raw.team_id || null,
    departamento_id: raw.departamento_id || null,
    auth_source: raw.auth_source || 'refresh',
  };
  const token = await signJwtHS256(payload, ctx.cfg.JWT_SECRET, ctx.cfg.JWT_EXPIRES_SECONDS);
  return ok({
    token,
    expiresIn: ctx.cfg.JWT_EXPIRES_SECONDS,
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      nome: payload.nome,
      cargo: payload.cargo,
      cargoCodigo: payload.cargo_codigo,
      admExtra: payload.adm_extra,
      teamId: payload.team_id,
      departamentoId: payload.departamento_id,
      source: payload.auth_source,
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

// POST /api/v1/usuarios/admin-reset-password
// Rota AUTENTICADA (middleware auth exige Bearer). Permite que um ADM
// resete a senha de qualquer usuário SEM conhecer a senha atual —
// necessário quando o hash está acima do cap do workerd
// (HashIterCapExceededError impede a verificação de currentPassword no
// fluxo normal de change-password). O hash novo é gerado no servidor
// por hashPasswordS2() (pbkdf2$, 100k iterações). O service verifica
// que o caller tem role='adm' no JWT — não confia apenas no schema.
export async function adminResetPasswordController(request, ctx){
  const body = await readJsonBody(request);
  const data = validate(body, adminResetPasswordSchema);
  const result = await adminResetPasswordService(ctx.cfg, ctx.user, data);
  return ok(result, { endpoint: '/api/v1/usuarios/admin-reset-password' }, ctx.headers);
}
