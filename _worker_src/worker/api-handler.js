// =====================================================================
// api-handler.js
// Ponto de entrada de toda a API /api/*. É invocado pelo worker.js
// original (que continua sendo o `main` do wrangler.toml). Aqui montamos
// o pipeline: CORS -> RateLimit -> Auth -> Router -> Controller -> JSON.
// =====================================================================

import { corsHeaders, handlePreflight } from './middlewares/cors.js';
import { enforceRateLimit, getClientIp } from './middlewares/rate-limit.js';
import { authenticate, isPublicPath } from './middlewares/auth.js';
import { authorize } from './middlewares/authz.js';
import { readEnv } from './utils/env.js';
import { logger, newRequestId } from './utils/logger.js';
import { fromHttpError, ok } from './utils/response.js';
import { HttpError } from './errors/http-errors.js';
import { resolveRoute, routeNotFound, listRoutes } from './routes/router.js';
import { recordForbiddenChatGroupEvent, SECURITY_EVENT_CODES } from './services/security-events-service.js';
import { selectFrom } from './lib/supabase-rest.js'; // AUDITORIA-FINAL-10 item 3.9 — health check real

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

export async function handleApi(request, env, url, waitUntil) {
  const requestId = newRequestId();
  const started = Date.now();
  const cfg = readEnv(env);
  const productionConfigErrors = cfg._productionConfigErrors || [];
  const normalized = normalizeApiUrl(request, url);
  request = normalized.request;
  url = normalized.url;
  const baseHeaders = Object.assign({}, corsHeaders(request, cfg), {
    'x-request-id': requestId,
    'x-api-requested-version': normalized.requestedVersion,
    'x-api-version': normalized.normalizedVersion,
  });

  // Preflight CORS
  const preflight = handlePreflight(request, cfg);
  if (preflight) {
    Object.keys(baseHeaders).forEach((k) => preflight.headers.set(k, baseHeaders[k]));
    return preflight;
  }

  const pathname = url.pathname;
  const method = request.method;

  // Health-check público - mantém o formato antigo mas usa envelope novo
  // R5-1: aplica rate-limit antes de executar o health check para evitar DoS.
  // O endpoint era o único que escapava do rate-limit aplicado dentro do
  // bloco try{} principal (linhas ~136-138).
  if (pathname === '/api/v1/health' && method === 'GET') {
    try {
      const rlKeyHealth = getClientIp(request) + ':/api/v1/health';
      const rlHeadersHealth = enforceRateLimit(request, rlKeyHealth, cfg);
      Object.assign(baseHeaders, rlHeadersHealth);
    } catch (rlErr) {
      // 429 Too Many Requests
      const httpErr429 = rlErr instanceof HttpError ? rlErr : Object.assign(new HttpError(429, 'RATE_LIMIT', 'Muitas requisições.'), { cause: rlErr, headers: rlErr && rlErr.headers });
      return fromHttpError(httpErr429, Object.assign({}, baseHeaders, httpErr429.headers || {}));
    }
    const routes = listRoutes();
    // AUDITORIA-FINAL-10 (2026-08-01, item 3.9 — Observabilidade): antes,
    // "supabaseConfigured" só checava se a URL estava setada (string não-vazia),
    // não se o Supabase está de fato alcançável. supabaseReachable faz uma
    // leitura real (barata, tabela settings, limit 1) e reporta latência —
    // é o sinal que um monitor externo (UptimeRobot/cron) deveria checar pra
    // saber que o sistema caiu, em vez de descobrir só quando um usuário reclama.
    let supabaseReachable;
    try {
      const _t0 = Date.now();
      await selectFrom(cfg, 'settings', { limit: 1 });
      supabaseReachable = { ok: true, latencyMs: Date.now() - _t0 };
    } catch (healthErr) {
      supabaseReachable = { ok: false, error: healthErr && healthErr.message ? healthErr.message : 'falha desconhecida' };
    }
    return ok({
      version: normalized.normalizedVersion,
      service: 'lidercrm-worker',
      compatibilityDate: '2026-07-16',
      assetsBinding: !!env.ASSETS,
      supabaseConfigured: !!cfg.SUPABASE_URL,
      supabaseReachable,
      // CERT-16: Avisos de segurança no health check
      securityWarnings: {
        jwtSecretIsDefault: !!cfg._jwtSecretIsDefault,
        corsIsWildcard: !!cfg._corsIsWildcard,
        supabaseUrlIsPlaceholder: !cfg.SUPABASE_URL || cfg.SUPABASE_URL.indexOf('REPLACE_ME') >= 0,
        anonKeyIsPlaceholder: !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.indexOf('REPLACE_ME') >= 0,
      },
      archVersion: 'phase3.3-direct-login-20260722-loginfix',
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

  // Não permitir que produção opere com segredo JWT ou origem CORS padrão.
  // O health check acima continua acessível para revelar apenas os nomes dos
  // checks pendentes, sem expor valores de configuração.
  if (productionConfigErrors.length) {
    return fromHttpError(new HttpError(
      503,
      'PRODUCTION_MISCONFIGURED',
      'Serviço temporariamente indisponível: configuração de produção incompleta.',
      { missingOrUnsafe: productionConfigErrors }
    ), baseHeaders);
  }

  // BUG FIX (step5.3): user declarado FORA do try para que o catch
  // possa acessá-lo ao gravar a telemetria de CHAT_GROUP_FORBIDDEN.
  // Antes estava como `let user = null` dentro do try - causava
  // ReferenceError no catch, impedindo a resposta 403 de ser enviada.
  let user = null;

  try {
    // Rate limit por IP + rota (janela em memória do isolate)
    const rlKey = getClientIp(request) + ':' + pathname;
    const rlHeaders = enforceRateLimit(request, rlKey, cfg);
    Object.assign(baseHeaders, rlHeaders);

    // Autenticação (exceto rotas públicas)
    let caps = null;
    if (!isPublicPath(pathname, method)) {
      user = await authenticate(request, cfg);
      // Autorização — Etapa 6 (hierarquia 2026-07-23). Camada de defesa em
      // profundidade: se o cargo do usuário não tem capacidade na rota,
      // recusa com 403 antes mesmo de bater no controller. Falha operacional
      // (banco/timeout) NUNCA vira 403 — cai em null e delega ao controller.
      const authzCtx = { cfg, user, pathname, method };
      caps = await authorize(request, authzCtx);
    }

    // Roteamento
    const handler = resolveRoute(pathname, method);
    if (!handler) routeNotFound(pathname, method);

    const ctx = { cfg, user, caps, headers: baseHeaders, requestId, waitUntil: (typeof waitUntil === 'function' ? waitUntil : function(p){ return p; }) };
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
    // CORREÇÃO (2026-07-22 login-fix): AbortError / TypeError de fetch
    // vazavam como 500 opaco. Agora normalizamos qualquer DOMException/
    // TypeError conhecido para UpstreamError(502) antes de virar
    // WORKER_ERROR - só cai em 500 genuíno em bug de lógica.
    let httpErr;
    if (err instanceof HttpError) {
      httpErr = err;
    } else {
      const errName = err && err.name ? String(err.name) : '';
      const errMsg  = err && err.message ? String(err.message) : 'Erro interno.';
      if (errName === 'AbortError' || /aborted|timeout/i.test(errMsg)) {
        httpErr = Object.assign(new HttpError(502, 'UPSTREAM_TIMEOUT', 'Tempo esgotado ao consultar Supabase.'), { cause: err });
      } else if (errName === 'TypeError' && /fetch|network/i.test(errMsg)) {
        httpErr = Object.assign(new HttpError(502, 'UPSTREAM_NETWORK', 'Falha de rede ao consultar Supabase: ' + errMsg), { cause: err });
      } else {
        httpErr = Object.assign(new HttpError(500, 'WORKER_ERROR', errMsg || 'Erro interno.'), { cause: err });
      }
    }
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