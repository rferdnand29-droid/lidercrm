// =====================================================================
// functions/[[path]].js — Cloudflare Pages Functions entry-point
// -----------------------------------------------------------------------
// MIGRAÇÃO 2026-07-19:
//   • Este arquivo substitui o worker.js (Cloudflare Workers/Wrangler).
//   • Pages Functions usa a assinatura (context) — internamente
//     desempacotamos { request, env } e chamamos o mesmo handleApi()
//     que já existia em _worker_src/worker/api-handler.js.
//   • Rotas /api/* seguem o mesmo pipeline (CORS → RateLimit → Auth →
//     Router → Controller → JSON). Rotas não-/api caem no next(),
//     ou seja, o Pages serve o arquivo estático (index.html, app.html,
//     assets, etc.).
//   • Nada foi removido: jsonResponse/corsHeaders/endpointNotImplemented
//     permanecem exportados para compatibilidade.
// =====================================================================

import { handleApi } from '../_worker_src/worker/api-handler.js';

function jsonResponse(payload, init, extraHeaders) {
  var headers = new Headers((init && init.headers) || {});
  headers.set('content-type', 'application/json; charset=UTF-8');
  if (extraHeaders) {
    Object.keys(extraHeaders).forEach(function (key) {
      headers.set(key, extraHeaders[key]);
    });
  }
  return new Response(JSON.stringify(payload), {
    status: (init && init.status) || 200,
    headers: headers
  });
}

function corsHeaders(request) {
  var origin = request.headers.get('Origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization, X-Requested-With, If-None-Match',
    'access-control-max-age': '86400',
    'vary': 'Origin'
  };
}

// Pages Functions catch-all — recebe TODAS as requisições.
// Só interceptamos /api/*; o resto vai para o próximo handler
// (que serve os arquivos estáticos do projeto).
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Rotas não-API: entrega ao Pages (arquivos estáticos)
  if (url.pathname.indexOf('/api/') !== 0) {
    return next();
  }

  // Rotas /api/*: pipeline completo (idêntico ao worker.js original)
  try {
    return await handleApi(request, env, url);
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
