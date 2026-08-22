// =====================================================================
// crypto.js
// Wrappers sobre WebCrypto (disponível no runtime do Workers) para:
//   - assinar/verificar JWT HS256
//   - hash SHA-256 (para ETag e chaves de rate-limit)
//   - HMAC-SHA256 hex (para a ponte de sessão legada — Fase 3.2)
// Sem dependências externas — 100% edge-compatible.
// =====================================================================

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(bytesOrString) {
  let bytes = bytesOrString;
  if (typeof bytesOrString === 'string') bytes = encoder.encode(bytesOrString);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeToBytes(input) {
  let str = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeToString(input) {
  return decoder.decode(base64UrlDecodeToBytes(input));
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function signJwtHS256(payload, secret, expiresInSeconds = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { iat: now, exp: now + expiresInSeconds, ...payload };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const bodyB64 = base64UrlEncode(JSON.stringify(body));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(headerB64 + '.' + bodyB64));
  const sigB64 = base64UrlEncode(new Uint8Array(sig));
  return headerB64 + '.' + bodyB64 + '.' + sigB64;
}

export async function verifyJwtHS256(token, secret) {
  if (!token || typeof token !== 'string') throw new Error('JWT_MISSING');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('JWT_MALFORMED');
  const [headerB64, bodyB64, sigB64] = parts;
  const key = await importHmacKey(secret);
  const sigBytes = base64UrlDecodeToBytes(sigB64);
  const valid = await crypto.subtle.verify(
    'HMAC', key, sigBytes, encoder.encode(headerB64 + '.' + bodyB64)
  );
  if (!valid) throw new Error('JWT_INVALID_SIGNATURE');
  const payload = JSON.parse(base64UrlDecodeToString(bodyB64));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('JWT_EXPIRED');
  return payload;
}

export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const arr = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
  return hex;
}

// Fase 3.2 — HMAC-SHA256 em hex, usado na ponte de sessão legada.
export async function hmacSha256Hex(secret, message){
  const key = await importHmacKey(String(secret || ''));
  const bytes = typeof message === 'string' ? encoder.encode(message) : message;
  const sig = await crypto.subtle.sign('HMAC', key, bytes);
  const arr = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
  return hex;
}
