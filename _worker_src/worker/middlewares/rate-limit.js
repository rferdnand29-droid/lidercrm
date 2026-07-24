// =====================================================================
// rate-limit.js
// Rate-limiter simples baseado em memória local do isolate. É uma
// primeira barreira anti-abuso — quando um KV/D1 for anexado, basta
// injetá-lo aqui. Chave = ip + rota (ou userId se autenticado).
// Cloudflare já mata isolates ociosos; o mapa é auto-limitado.
// =====================================================================

import { RateLimitedError } from '../errors/http-errors.js';

const BUCKETS = new Map();
const MAX_BUCKETS = 5000;

function pruneIfNeeded(now) {
  if (BUCKETS.size <= MAX_BUCKETS) return;
  for (const [k, v] of BUCKETS) {
    if (v.resetAt <= now) BUCKETS.delete(k);
    if (BUCKETS.size <= MAX_BUCKETS) return;
  }
}

export function getClientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown';
}

// R5: perfis de rate-limit por tipo de rota
const LOGIN_WINDOW_S = 60;
const LOGIN_MAX = 10; // 10 req/min para login (anti-brute-force)
const DEFAULT_WINDOW_S = 60;
const DEFAULT_MAX = 120;

function getLimitsForPath(pathname, cfg) {
  const isLogin = pathname && pathname.indexOf('/login') >= 0;
  if (isLogin) {
    return {
      windowMs: LOGIN_WINDOW_S * 1000,
      max: LOGIN_MAX,
    };
  }
  return {
    windowMs: (cfg && cfg.RATE_LIMIT_WINDOW_SECONDS ? cfg.RATE_LIMIT_WINDOW_SECONDS : DEFAULT_WINDOW_S) * 1000,
    max: cfg && cfg.RATE_LIMIT_MAX ? cfg.RATE_LIMIT_MAX : DEFAULT_MAX,
  };
}

export function enforceRateLimit(request, key, cfg, pathname) {
  const now = Date.now();
  const limits = getLimitsForPath(pathname, cfg);
  const windowMs = limits.windowMs;
  const max = limits.max;

  pruneIfNeeded(now);
  let bucket = BUCKETS.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    BUCKETS.set(key, bucket);
  }
  bucket.count += 1;
  const remaining = Math.max(0, max - bucket.count);
  const resetSec = Math.ceil((bucket.resetAt - now) / 1000);
  const headers = {
    'x-ratelimit-limit': String(max),
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-reset': String(resetSec),
  };
  if (bucket.count > max) {
    throw Object.assign(new RateLimitedError('Limite de requisições excedido.'), { headers });
  }
  return headers;
}
