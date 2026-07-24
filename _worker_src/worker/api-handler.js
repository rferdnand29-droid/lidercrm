// =====================================================================
// api-handler.js
// Ponto de entrada de toda a API /api/*. É invocado pelo worker.js
// original (que continua sendo o `main` do wrangler.toml). Aqui montamos
// o pipeline: CORS -> RateLimit -> Auth -> Router -> Controller -> JSON.
// =====================================================================

import { corsHeaders, handlePreflight } from './middlewares/cors.js';
import { enforceRateLimit, getClientIp } from './middlewares/rate-limit.js';
import { authenticate, isPublicPath } from './middlewares/auth.js';
import { readEnv } from './utils/env.js';
import { logger, newRequestId } from './utils/logger.js';
import { fromHttpError, ok } from './utils/response.js';
import { HttpError } from './errors/http-errors.js';
import { resolveRoute, routeNotFound, listRoutes } from './routes/router.js';
import { getFsDocument } from './lib/fs-documents.js';
import { recordForbiddenChatGroupEvent, SECURITY_EVENT_CODES } from './services/security-events-service.js';

// DIAGNÓSTICO (2026-07-17c): faz uma leitura real (não simulada) do
// admin seedado, usando a config de runtime (cfg) que o Worker está
// USANDO DE VERDADE — não o que está escrito no wrangler.toml do zip.
// Se o Worker estiver com um secret antigo sobrescrevendo SUPABASE_URL/
// SUPABASE_ANON_KEY, isso aparece aqui como erro/"not_found", mesmo que
// uma consulta manual feita fora do Worker (com a chave certa) funcione.
async function probeAdminSeed(cfg) {
  try {
    const doc = await getFsDocument(cfg, 'config/users/items/adm_root_2026');
    if (!doc) return { ok: true, found: false };
    return {
      ok: true,
      found: true,
      email: doc.email || null,
      role: doc.role || null,
      ativo: doc.ativo !== false,
      phPrefix: doc.ph ? String(doc.ph).slice(0, 12) + '…' : null,
    };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

function normalizeApiUrl(request, url) {
  if (!url || !url.pathname || url.pathname.indexOf('/api/v2') !== 0) {
    return { request, url, requestedVersion: 'v1', normalizedVersion: 'v1' };
  }
  const normalizedUrl = new URL(url.toString());
  normalizedUrl.pathname = normalizedUrl.pathname.replace(/^\/api\/v2(?=\/|$)/, '/api/v1');
  const normalizedRequest = new Request(normalizedUrl.toString(), request);
  return {
    request: normalizedRequest,
    url: normalizedUrl,
    requestedVersion: 'v2',
    normalizedVersion: 'v1',
  };
}

export async function handleApi(request, env, url) {
  const requestId = newRequestId();
  const started = Date.now();
  const cfg = readEnv(env);
  const normalized = normalizeApiUrl(request, url);
  request = normalized.request;
  url = normalized.url;
  const baseHeaders = Object.assign({}, corsHeaders(request, cfg), {
    'x-request-id': requestId,
    'x-api-requested-version': normalized.requestedVersion,
    'x-api-version': normalized.normalizedVersion,
    'X-Content-Type-Options': 'nosniff', // R5: prevent MIME sniffing
  });

  // Preflight CORS
  const preflight = handlePreflight(request, cfg);
  if (preflight) {
    Object.keys(baseHeaders).forEach((k) => preflight.headers.set(k, baseHeaders[k]));
    return preflight;
  }

  const pathname = url.pathname;
  const method = request.method;

  // Health-check público — mantém o formato antigo mas usa envelope novo
  if (pathname === '/api/v1/health' && method === 'GET') {
    const routes = listRoutes();
    const adminSeedProbe = await probeAdminSeed(cfg);
    return ok({
      version: normalized.normalizedVersion,
      service: 'lidercrm-worker',
      compatibilityDate: '2026-07-16',
      assetsBinding: !!env.ASSETS,
      supabaseConfigured: !!cfg.SUPABASE_URL,
      // CERT-16: Avisos de segurança no health check
      securityWarnings: {
        jwtSecretIsDefault: !!cfg._jwtSecretIsDefault,
        corsIsWildcard: !!cfg._corsIsWildcard,
        supabaseUrlIsPlaceholder: !cfg.SUPABASE_URL || cfg.SUPABASE_URL.indexOf('REPLACE_ME') >= 0,
        anonKeyIsPlaceholder: !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.indexOf('REPLACE_ME') >= 0,
      },
      // DIAGNÓSTICO (2026-07-17c): mostra, de forma segura (sem vazar a
      // chave inteira), qual SUPABASE_URL / prefixo de chave o Worker
      // está realmente usando EM RUNTIME. Existe porque `wrangler secret
      // put` em deploys antigos tem prioridade sobre [vars] do
      // wrangler.toml e pode deixar o Worker apontando pra um projeto/
      // chave diferente do que está no arquivo — sem isso, não dá pra
      // saber de fora se é esse o problema.
      runtimeSupabaseDebug: {
        url: cfg.SUPABASE_URL || null,
        anonKeyPrefix: cfg.SUPABASE_ANON_KEY ? String(cfg.SUPABASE_ANON_KEY).slice(0, 24) + '…' : null,
        anonKeyLength: cfg.SUPABASE_ANON_KEY ? String(cfg.SUPABASE_ANON_KEY).length : 0,
        hasServiceRole: !!cfg.SUPABASE_SERVICE_ROLE,
      },
      adminSeedProbe: adminSeedProbe,
      archVersion: 'phase3.3-direct-login-20260717d',
      routeCount: routes.length,
      features: {
        legacyAuthBridge: true,
        sessionRefresh: true,
        supabaseAuthFallback: true,
        v2AliasToV1: true,
        directLoginFrontend: true,
      },
    }, {
      endpoint: '/api/v1/health',
      requestId,
      requestedVersion: normalized.requestedVersion,
      normalizedVersion: normalized.normalizedVersion,
    }, baseHeaders);
  }

  // BUG FIX (step5.3): user declarado FORA do try para que o catch
  // possa acessá-lo ao gravar a telemetria de CHAT_GROUP_FORBIDDEN.
  // Antes estava como `let user = null` dentro do try — causava
  // ReferenceError no catch, impedindo a resposta 403 de ser enviada.
  let user = null;

  try {
    // Rate limit por IP + rota (janela em memória do isolate)
    const rlKey = getClientIp(request) + ':' + pathname;
    const rlHeaders = enforceRateLimit(request, rlKey, cfg, pathname);
    Object.assign(baseHeaders, rlHeaders);

    // Autenticação (exceto rotas públicas)
    if (!isPublicPath(pathname, method)) {
      user = await authenticate(request, cfg);
    }

    // Roteamento
    const handler = resolveRoute(pathname, method);
    if (!handler) routeNotFound(pathname, method);

    const ctx = { cfg, user, headers: baseHeaders, requestId };
    const response = await handler(request, ctx);

    logger.info('api.ok', {
      requestId, method, path: pathname,
      requestedVersion: normalized.requestedVersion,
      normalizedVersion: normalized.normalizedVersion,
      status: response.status, ms: Date.now() - started,
      userId: user && user.sub,
    });
    return response;
  } catch (err) {
    const httpErr = err instanceof HttpError ? err : Object.assign(new HttpError(500, 'WORKER_ERROR', (err && err.message) || 'Erro interno.'), { cause: err });
    // Cabeçalhos anexados pelo rate-limit em erro 429
    const extra = Object.assign({}, baseHeaders, err && err.headers ? err.headers : {});

    const detailsCode = httpErr && httpErr.details && httpErr.details.code;
    if (httpErr.status === 403 && detailsCode === SECURITY_EVENT_CODES.CHAT_GROUP_FORBIDDEN) {
      await recordForbiddenChatGroupEvent({ cfg, user, requestId }, {
        path: pathname,
        method,
        reason: httpErr.details && httpErr.details.reason,
        name: httpErr.details && httpErr.details.name,
      });
    }

    logger.error('api.error', {
      requestId, method, path: pathname,
      requestedVersion: normalized.requestedVersion,
      normalizedVersion: normalized.normalizedVersion,
      status: httpErr.status, code: httpErr.code,
      message: httpErr.message, ms: Date.now() - started,
    });
    return fromHttpError(httpErr, extra);
  }
}
