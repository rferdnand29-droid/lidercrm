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

export function enforceRateLimit(request, key, cfg) {
  const now = Date.now();
  const windowMs = (cfg && cfg.RATE_LIMIT_WINDOW_SECONDS ? cfg.RATE_LIMIT_WINDOW_SECONDS : 60) * 1000;
  const max = cfg && cfg.RATE_LIMIT_MAX ? cfg.RATE_LIMIT_MAX : 120;

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
