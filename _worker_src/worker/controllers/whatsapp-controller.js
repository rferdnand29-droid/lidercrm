// =====================================================================
// whatsapp-controller.js
// Proxy server-side da Evolution API.
//
// A chave nunca deve chegar ao navegador: qualquer segredo colocado em
// meta tag, window ou bundle pode ser lido pelo usuário da aplicação.
// =====================================================================

import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { BadRequestError, HttpError, UpstreamError } from '../errors/http-errors.js';
import { ok } from '../utils/response.js';

const REQUEST_TIMEOUT_MS = 15000;

function evolutionConfig(cfg) {
  const base = String((cfg && cfg.EVOLUTION_BASE_URL) || '').replace(/\/+$/, '');
  const key = String((cfg && cfg.EVOLUTION_API_KEY) || '');
  const instance = String((cfg && cfg.EVOLUTION_INSTANCE) || 'lidercrm').trim();
  if (!base || !key || !instance) {
    throw new HttpError(503, 'EVOLUTION_NOT_CONFIGURED', 'Integração WhatsApp não configurada.');
  }
  return { base, key, instance };
}

function normalizeNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.indexOf('55') === 0 ? digits : '55' + digits;
}

async function callEvolution(cfg, path, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    try { ctrl.abort(); } catch (_e) {}
  }, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(cfg.base + path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        apikey: cfg.key,
        ...(init && init.headers ? init.headers : {}),
      },
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_e) { body = text; }
    if (!response.ok) {
      throw new UpstreamError('Evolution API recusou a operação.', {
        status: response.status,
        provider: body && body.message ? body.message : undefined,
      });
    }
    return body;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new UpstreamError('Falha ao consultar a Evolution API.', {
      cause: error && error.name ? error.name : 'NETWORK',
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function sendWhatsAppController(request, ctx) {
  const cfg = evolutionConfig(ctx && ctx.cfg);
  const body = await readJsonBody(request);
  const number = normalizeNumber(body && (body.number || body.telefone || body.tel));
  const text = String(sanitizeString(body && body.text, 4000) || '').trim();
  if (!number) throw new BadRequestError('Número de WhatsApp é obrigatório.');
  if (!text) throw new BadRequestError('Mensagem é obrigatória.');

  const providerBody = await callEvolution(cfg,
    '/message/sendText/' + encodeURIComponent(cfg.instance), {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    });

  return ok({ sent: true, number, provider: providerBody || null }, {
    endpoint: '/api/v1/whatsapp/send',
  }, ctx.headers);
}

export async function evolutionStatusController(_request, ctx) {
  const cfg = evolutionConfig(ctx && ctx.cfg);
  const providerBody = await callEvolution(cfg,
    '/instance/connectionState/' + encodeURIComponent(cfg.instance), {
      method: 'GET',
    });
  return ok({ connected: providerBody || null }, {
    endpoint: '/api/v1/whatsapp/status',
  }, ctx.headers);
}