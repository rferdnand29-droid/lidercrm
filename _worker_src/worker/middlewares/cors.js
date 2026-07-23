// =====================================================================
// cors.js
// Validação de CORS com suporte a Capacitor (capacitor://localhost, ionic://)
// e lista de origens permitidas via ALLOWED_ORIGINS no env.
// =====================================================================

const DEFAULT_ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'Content-Type, Authorization, X-Requested-With, X-Api-Key, If-None-Match';
const DEFAULT_EXPOSE_HEADERS  = 'ETag, X-Request-Id, X-RateLimit-Remaining, X-RateLimit-Limit, X-RateLimit-Reset';

// Origens sempre permitidas (app nativo Capacitor/Ionic + localhost dev)
const ALWAYS_ALLOWED = [
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'http://127.0.0.1',
];

function isOriginAllowed(origin, cfg) {
  if (!origin) return false;
  // App nativo Capacitor/Ionic sempre permitido
  for (const allowed of ALWAYS_ALLOWED) {
    if (origin === allowed || origin.startsWith(allowed + ':')) return true;
  }
  // Em desenvolvimento (sem ALLOWED_ORIGINS configurado ou '*'), permite tudo
  const raw = (cfg && cfg.ALLOWED_ORIGINS) || '*';
  if (raw === '*') return true;
  // Lista explícita de origens
  return raw.split(',').map(s => s.trim()).some(o => o && origin === o);
}

// CERT-15: Validação extra — se ALLOWED_ORIGINS for '*' e a origem
// não for localhost/Capacitor, loga um warning (não bloqueia, pois
// o deploy pode não ter configurado ainda — mas avisa).
function _warnWildcardCors(cfg, origin) {
  if (cfg && cfg._corsIsWildcard && origin && origin.indexOf('localhost') === -1
      && origin.indexOf('capacitor') === -1 && origin.indexOf('ionic') === -1) {
    console.warn('[CRM CORS] ALLOWED_ORIGINS está como "*" — origem externa:', origin, '— configure ALLOWED_ORIGINS em produção.');
  }
}

export function corsHeaders(request, cfg) {
  const origin = (request && request.headers && request.headers.get('Origin')) || '';
  const allowed = isOriginAllowed(origin, cfg);
  const effectiveOrigin = allowed ? (origin || '*') : 'null';
  return {
    'access-control-allow-origin': effectiveOrigin,
    'access-control-allow-methods': DEFAULT_ALLOWED_METHODS,
    'access-control-allow-headers': DEFAULT_ALLOWED_HEADERS,
    'access-control-expose-headers': DEFAULT_EXPOSE_HEADERS,
    'access-control-max-age': '86400',
    'access-control-allow-credentials': allowed ? 'true' : 'false',
    'vary': 'Origin',
  };
}

export function handlePreflight(request, cfg) {
  if (request.method !== 'OPTIONS') return null;
  const headers = new Headers(corsHeaders(request, cfg));
  return new Response(null, { status: 204, headers });
}
