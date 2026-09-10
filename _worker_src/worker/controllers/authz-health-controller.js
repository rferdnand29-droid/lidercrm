// =====================================================================
// authz-health-controller.js — Op-5 (2026-07-23)
// ---------------------------------------------------------------------
// Endpoint de observabilidade do cache in-memory usado pelo middleware
// authz.js (v_user_caps). Expõe hits, misses, evictions, tamanho, hit
// rate e uptime do isolate.
//
// Rota:  GET /api/v1/health/authz-cache
// Auth:  Bearer JWT (rota autenticada — passa por authenticate()) +
//        authz decide caps. Aplicamos ainda uma checagem em nível de
//        controller para exigir `caps.adminUI` — pois métricas de
//        autorização não devem ser visíveis a usuários comuns.
//
// Princípio (regra 2 do prompt — aditivo antes de destrutivo): rota
// nova, controller novo. Nenhum arquivo antigo alterado além do router
// (uma linha).
// =====================================================================

import { ok } from '../utils/response.js';
import { ForbiddenError } from '../errors/http-errors.js';
import { getDbCapsCacheStats } from '../middlewares/authz.js';

export async function authzCacheHealthController(request, ctx) {
  // O middleware authz.js já decorou ctx.caps quando a rota é
  // atendida pelo pipeline normal. Se ainda assim vier undefined
  // (por qualquer motivo operacional), tratamos como sem permissão.
  const caps = ctx && ctx.caps;
  const isAdmin = !!(caps && caps.adminUI);

  // adm implícito (role=adm/sub=adm) já é master via resolveUserCaps,
  // então já cai em adminUI=true — sem case especial aqui.
  if (!isAdmin) {
    throw new ForbiddenError('Acesso restrito à administração.', {
      code: 'AUTHZ_FORBIDDEN',
      reason: 'authz_cache_admin_only',
      path: '/api/v1/health/authz-cache',
    });
  }

  const stats = getDbCapsCacheStats();
  const cfg = (ctx && ctx.cfg) || {};

  return ok({
    cache: stats,
    config: {
      useDbCaps: !!cfg.USE_DB_CAPS,
      dbCapsTtlSeconds: Number(cfg.DB_CAPS_TTL_SECONDS) || null,
      admExtraJwtPromotes: cfg.ADM_EXTRA_JWT_PROMOTES !== false,
      admExtraStaticPromotes: cfg.ADM_EXTRA_STATIC_PROMOTES !== false,
    },
    ts: new Date().toISOString(),
  }, { endpoint: '/api/v1/health/authz-cache' }, ctx.headers);
}
