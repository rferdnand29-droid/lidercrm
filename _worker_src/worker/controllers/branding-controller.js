// =====================================================================
// branding-controller.js  (2026-07-30)
// ---------------------------------------------------------------------
// Endpoint GLOBAL de identidade visual do CRM (logo, nome, fonte, cor,
// favicon, imagem do nome). Fonte da verdade: public.settings
//   (scope='global', scope_id=NULL, key='brand').
//
// Rotas expostas:
//   GET    /api/v1/branding           → público (qualquer usuário logado ou não);
//                                        devolve ETag + Cache-Control:no-store para
//                                        detectar mudança via polling barato.
//   PUT    /api/v1/branding           → restrito a ADM/Gestor (authz-check).
//   DELETE /api/v1/branding           → restrito a ADM/Gestor (reset).
//
// Por que existe:
//   Antes, o cliente chamava wc.putConfig('logo', …) e wc.putConfig('crmname', …).
//   Essas chamadas caíam em /api/v1/usuarios/config (fs_documents), que é
//   POR USUÁRIO — ou seja, a "logo global" era gravada só na conta do ADM.
//   Nenhum outro usuário via a mudança. Esta rota corrige o escopo:
//   'global' sem scope_id, uma única linha, versionada por `ver` (epoch).
// =====================================================================

import { ok } from '../utils/response.js';
import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { BadRequestError, ForbiddenError } from '../errors/http-errors.js';
import {
  getSetting, setSetting, deleteSetting,
} from '../repositories/settings-relational-repository.js';

const SCOPE = 'global';
const KEY   = 'brand';

// Defaults que garantem que a resposta NUNCA seja null (evita boot em branco).
const DEFAULT_BRAND = {
  name:    'LIDER CRM',
  logo:    null,
  icon:    null,
  font:    null,
  color:   '#0A0C10',
  nameImg: null,
  ver:     0,
};

function mergeBrand(existing, patch) {
  const base = Object.assign({}, DEFAULT_BRAND, existing || {});
  const next = Object.assign({}, base);
  const allowed = ['name', 'logo', 'icon', 'font', 'color', 'nameImg'];
  for (const k of allowed) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, k)) next[k] = patch[k];
  }
  // Cada mutação vira uma "versão" — o cliente detecta mudança comparando `ver`.
  next.ver = Math.floor(Date.now() / 1000);
  return next;
}

function etagOf(brand) {
  // ETag baseado no `ver` (monotônico) — permite If-None-Match no polling.
  return '"brand-' + (brand && brand.ver ? brand.ver : '0') + '"';
}

// ---------- GET (público) ----------
export async function getBrandingCtrl(request, ctx) {
  const row = await getSetting(ctx.cfg, SCOPE, null, KEY);
  const brand = Object.assign({}, DEFAULT_BRAND, (row && row.value) || {});
  const et = etagOf(brand);

  // Suporte a If-None-Match — devolve 304 sem body (polling barato).
  const inm = request.headers.get('If-None-Match');
  if (inm && inm === et) {
    return new Response(null, {
      status: 304,
      headers: Object.assign({}, ctx.headers || {}, {
        'ETag': et,
        'Cache-Control': 'no-store',
      }),
    });
  }

  return ok(brand, { endpoint: '/api/v1/branding' }, Object.assign({}, ctx.headers || {}, {
    'ETag': et,
    'Cache-Control': 'no-store',
  }));
}

// ---------- PUT (restrito a ADM/Gestor) ----------
export async function putBrandingCtrl(request, ctx) {
  // Gate autoritativo: authz-middleware já resolve o cargo (ctx.user.role),
  // mas reforçamos aqui — a rota nunca deve ficar "aberta" por engano.
  const role = String((ctx && ctx.user && ctx.user.role) || '').toLowerCase();
  if (role !== 'adm' && role !== 'admin' && role !== 'gestor') {
    throw new ForbiddenError('Apenas ADM/Gestor pode alterar a identidade do CRM.');
  }

  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new BadRequestError('payload inválido');

  // Sanitização defensiva de strings de tamanho pequeno; data-urls (logo/icon/nameImg)
  // são payloads grandes — validamos só o prefixo pra recusar coisas tipo "javascript:".
  const patch = {};
  if ('name' in body) patch.name = sanitizeString(body.name || '', 120);
  if ('font' in body) patch.font = sanitizeString(body.font || '', 80);
  if ('color' in body) patch.color = sanitizeString(body.color || '#0A0C10', 24);
  for (const k of ['logo', 'icon', 'nameImg']) {
    if (k in body) {
      const v = body[k];
      if (v === null || v === '') patch[k] = null;
      else if (typeof v === 'string' && /^data:image\//i.test(v)) patch[k] = v;
      else throw new BadRequestError(k + ' deve ser data-url image/* ou null');
    }
  }

  const existingRow = await getSetting(ctx.cfg, SCOPE, null, KEY);
  const merged = mergeBrand(existingRow && existingRow.value, patch);

  await setSetting(ctx.cfg, SCOPE, null, KEY, merged);

  return ok(merged, { endpoint: '/api/v1/branding', updated: true }, Object.assign({}, ctx.headers || {}, {
    'ETag': etagOf(merged),
    'Cache-Control': 'no-store',
  }));
}

// ---------- DELETE (reset — restrito a ADM/Gestor) ----------
export async function deleteBrandingCtrl(request, ctx) {
  const role = String((ctx && ctx.user && ctx.user.role) || '').toLowerCase();
  if (role !== 'adm' && role !== 'admin' && role !== 'gestor') {
    throw new ForbiddenError('Apenas ADM/Gestor pode resetar a identidade do CRM.');
  }
  await deleteSetting(ctx.cfg, SCOPE, null, KEY);
  const reset = Object.assign({}, DEFAULT_BRAND, { ver: Math.floor(Date.now() / 1000) });
  await setSetting(ctx.cfg, SCOPE, null, KEY, reset);
  return ok(reset, { endpoint: '/api/v1/branding', reset: true }, Object.assign({}, ctx.headers || {}, {
    'ETag': etagOf(reset),
    'Cache-Control': 'no-store',
  }));
}
