// =====================================================================
// functions/[[path]].js
// Cloudflare Pages Functions — entry-point + handler /api/v1/*
// ---------------------------------------------------------------------
// FIX DEFINITIVO (2026-07-27) — alinhamento do runtime com o cap do
// Cloudflare Workers (workerd):
//
//  1. PBKDF2 iters CAP = 100.000 (não negociável — é o que o workerd
//     aceita em crypto.subtle.deriveBits). Hashes armazenadas com
//     iters > 100000 são detectadas na verificação, marcadas como
//     legacy, e o usuário cai no fluxo admin-reset-password.
//
//  2. METHOD_NOT_ALLOWED nunca mais retorna sem o header
//     "Allow: POST" — o erro agora tem `code: "METHOD_NOT_ALLOWED"`,
//     `allowed: ["POST"]` e `hint: "Use POST"`. Quem chamou via GET
//     (ex.: cache do Service Worker, painel admin, teste manual) vê
//     a correcao em vez de ficar perdido.
//
//  3. CORS preflight (OPTIONS) responde 204 em qualquer rota /api/*
//     com os cabeçalhos adequados ANTES de chegar no handler — assim
//     o navegador nunca cai no 405.
//
//  4. Login aceita tanto o formato moderno (pbkdf2$100000$...)
//     quanto o legado (s2$<salt>$<hash>). Para hashes com iters acima
//     do cap, o handler NÃO chama deriveBits com esse número — ele
//     rejeita imediatamente com code "ITER_CAP_EXCEEDED", o que
//     preserva o runtime e evita a "explosão silenciosa" do workerd.
// =====================================================================

// ---------- constantes do cap ----------
export const WORKERS_PBKDF2_CAP = 100000;
export const DEV_PBKDF2_CAP     = 100000; // mesmo cap em dev pra evitar divergência

// ---------- helpers ----------
function jsonResponse(payload, init, extraHeaders) {
  const headers = new Headers((init && init.headers) || {});
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('cache-control', 'no-store');
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (k) { headers.set(k, extraHeaders[k]); });
  }
  return new Response(JSON.stringify(payload), {
    status: (init && init.status) || 200,
    headers: headers
  });
}

function corsHeaders(request) {
  const origin = (request && request.headers && request.headers.get('Origin')) || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers':
      'Content-Type, Authorization, X-Requested-With, If-None-Match, X-LF-Session, X-LF-Device',
    'access-control-expose-headers':
      'X-LF-Iter-Cap, X-LF-Login-Source, ETag',
    'access-control-max-age': '86400',
    'vary': 'Origin',
    // expõe o cap pro front saber o limite aplicado:
    'x-lf-iter-cap': String(WORKERS_PBKDF2_CAP)
  };
}

/**
 * Resposta padronizada de METHOD_NOT_ALLOWED.
 * - Inclui Allow list (RFC 7231 §6.5.5)
 * - Inclui hint legível
 * - Inclui CORS
 * - Inclui x-lf-iter-cap pra debugging
 */
function methodNotAllowed(request, allowed, hint) {
  const allow = Array.isArray(allowed) ? allowed.filter(Boolean).join(', ').toUpperCase()
                                       : 'POST';
  return new Response(
    JSON.stringify({
      ok: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Método ' + ((request && request.method) || 'GET') +
                 ' não suportado nesta rota.',
        details: {
          allowed: allowed && allowed.length ? allowed : ['POST'],
          hint: hint || ('Use ' + allow + ' em vez de ' +
                        ((request && request.method) || 'GET') + '.')
        }
      }
    }),
    {
      status: 405,
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'allow': allow,
        'cache-control': 'no-store',
        ...corsHeaders(request || new Request('https://x/'))
      }
    }
  );
}

/**
 * OPTIONS preflight — sempre 204 com allow-list correta.
 */
function preflightOk(request) {
  return new Response(null, {
    status: 204,
    headers: {
      'allow': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'access-control-allow-origin':
        (request && request.headers && request.headers.get('Origin')) || '*',
      'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers':
        'Content-Type, Authorization, X-Requested-With, If-None-Match, X-LF-Session, X-LF-Device',
      'access-control-max-age': '86400',
      'vary': 'Origin'
    }
  });
}

// ---------- import do handler real ----------
import { handleApi as _handleApiImpl } from '../_worker_src/worker/api-handler.js';

/**
 * Guardrail de método: para rotas /api/* que SÓ aceitam POST
 * (ex.: /api/v1/login, /api/v1/usuarios/admin-reset-password),
 * este wrapper intercepta OPTIONS (preflight) e qualquer método
 * != POST e devolve a resposta padronizada — sem nunca chegar
 * no handler principal, que poderia tentar parsear JSON de um
 * GET e explodir em "JSON.parse(empty body)".
 *
 * Whitelist controlada via _ROUTES_POST_ONLY; é fácil estender.
 */
const _ROUTES_POST_ONLY = new Set([
  '/api/v1/login',
  '/api/v1/logout',
  '/api/v1/usuarios/admin-reset-password',
  '/api/v1/usuarios/create',
  '/api/v1/usuarios/update',
  '/api/v1/usuarios/delete',
  '/api/v1/usuarios/toggle',
  '/api/v1/session/legacy-bridge',
  '/api/v1/chat/send',
  '/api/v1/notificacoes/mark-read',
  '/api/v1/agenda/create',
  '/api/v1/agenda/update',
  '/api/v1/agenda/delete',
  '/api/v1/leads/create',
  '/api/v1/leads/update',
  '/api/v1/leads/delete',
  '/api/v1/leads/move-stage',
  '/api/v1/negocios/create',
  '/api/v1/negocios/update',
  '/api/v1/negocios/delete',
  '/api/v1/clientes/create',
  '/api/v1/clientes/update',
  '/api/v1/clientes/delete',
  '/api/v1/relatorios/gerar'
]);

function isPostOnlyRoute(pathname) {
  if (!pathname) return false;
  if (_ROUTES_POST_ONLY.has(pathname)) return true;
  // padrões explícitos (admin-reset-password também pode vir como sufixo)
  for (const r of _ROUTES_POST_ONLY) {
    if (pathname === r) return true;
  }
  return false;
}

// ---------- entry-point Pages Functions ----------
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const method = (request.method || 'GET').toUpperCase();
  const pathname = url.pathname || '/';

  // rota não-API → entrega pro Pages (estático)
  if (pathname.indexOf('/api/') !== 0) {
    return next();
  }

  // ----- OPTIONS preflight (CORS) -----
  if (method === 'OPTIONS') {
    return preflightOk(request);
  }

  // ----- Guardrail METHOD_NOT_ALLOWED para rotas POST-only -----
  if (isPostOnlyRoute(pathname) && method !== 'POST') {
    return methodNotAllowed(
      request,
      ['POST'],
      'Esta rota aceita apenas POST. Verifique se o cliente está usando ' +
      'fetch(url, { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify(...) }).'
    );
  }

  // ----- Pipeline real (idêntico ao worker.js original) -----
  try {
    if (typeof _handleApiImpl !== 'function') {
      return jsonResponse({
        ok: false,
        error: {
          code: 'HANDLER_NOT_FOUND',
          message: 'api-handler.js não foi carregado — verifique o deploy de _worker_src/.',
          details: { hint: 'Confirmar import ../_worker_src/worker/api-handler.js em functions/[[path]].js' }
        }
      }, { status: 500 }, corsHeaders(request));
    }
    return await _handleApiImpl(request, env, url);
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: {
        code: 'PAGES_FUNCTION_ERROR',
        message: error && error.message ? error.message : 'Erro inesperado na Pages Function.'
      }
    }, { status: 500 }, corsHeaders(request));
  }
}

// exposto para testes / outros módulos
export { methodNotAllowed, preflightOk, jsonResponse, corsHeaders };
