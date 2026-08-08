// =====================================================================
// etag.js
// Gera ETag (SHA-256 dos bytes serializados) e aplica cabeçalhos
// Cache-Control para respostas GET. Se o cliente enviar `If-None-Match`
// e bater, respondemos 304 Not Modified.
// =====================================================================

import { sha256Hex } from './crypto.js';
import { json } from './response.js';

export async function makeEtag(payload) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const hash = await sha256Hex(body);
  return 'W/"' + hash.slice(0, 32) + '"';
}

export function cacheHeaders(maxAgeSeconds, extra = {}) {
  return {
    'cache-control': 'public, max-age=' + Math.max(0, maxAgeSeconds | 0) + ', must-revalidate',
    ...extra,
  };
}

export async function respondWithCache(request, data, meta = {}, options = {}) {
  const maxAge = Number.isFinite(options.maxAge) ? options.maxAge : 30;
  const payload = { ok: true, data, meta };
  const etag = await makeEtag(payload);
  const ifNoneMatch = request.headers.get('If-None-Match');
  const extra = Object.assign({}, cacheHeaders(maxAge), { etag }, options.extraHeaders || {});
  if (ifNoneMatch && ifNoneMatch === etag) {
    const headers = new Headers();
    Object.keys(extra).forEach((k) => headers.set(k, extra[k]));
    return new Response(null, { status: 304, headers });
  }
  return json(payload, { status: 200 }, extra);
}
