// =====================================================================
// etag.js
// Gera ETag (SHA-256 dos bytes serializados) e aplica cabeçalhos
// Cache-Control para respostas GET. Se o cliente enviar `If-None-Match`
// e bater, respondemos 304 Not Modified.
// =====================================================================

import { sha256Hex } from './crypto.js';
import { json } from './response.js';
import { documentEtag, versionHeaders } from './document-version.js';

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

// Versão estável para documentos mutáveis. Ao contrário do hash do envelope
// inteiro, esta ETag permanece igual enquanto o documento não muda e pode ser
// enviada de volta em If-Match no próximo write.
export function respondWithVersionedDocument(
  request,
  data,
  meta = {},
  version,
  extraHeaders = {},
  status = 200,
) {
  const etag = documentEtag(version);
  const headers = Object.assign({}, extraHeaders, versionHeaders(version));
  if (etag && request && request.headers.get('If-None-Match') === etag) {
    return new Response(null, { status: 304, headers: new Headers(headers) });
  }
  return json({ ok: true, data, meta: Object.assign({}, meta, { version: version || null }) }, {
    status,
  }, headers);
}
