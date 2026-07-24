// =====================================================================
// settings-controller.js — Fase 1 (2026-07-19)
// -----------------------------------------------------------------------
// Endpoints da tabela relacional public.settings.
//   GET    /api/v1/settings?scope=global&key=app.name
//   PUT    /api/v1/settings?scope=global&key=app.name    body: { value }
//   DELETE /api/v1/settings?scope=global&key=app.name
//   GET    /api/v1/settings/list?scope=global
//
// Coexiste com /api/v1/usuarios/config (fs_documents). Novos módulos
// usam settings; módulos antigos continuam em fs_documents.
// =====================================================================

import { ok } from '../utils/response.js';
import { readJsonBody, sanitizeString, validate } from '../validators/validate.js';
import { BadRequestError } from '../errors/http-errors.js';
import {
  getSetting, setSetting, deleteSetting, listSettings,
} from '../repositories/settings-relational-repository.js';
import { settingPutSchema } from '../schemas/index.js';

function readParams(request) {
  const url = new URL(request.url);
  const scope = sanitizeString(url.searchParams.get('scope') || 'global', 40);
  const scopeIdRaw = url.searchParams.get('scope_id');
  const scopeId = scopeIdRaw ? sanitizeString(scopeIdRaw, 100) : null;
  const key = sanitizeString(url.searchParams.get('key'), 200);
  return { scope, scopeId, key };
}

export async function getSettingCtrl(request, ctx) {
  const { scope, scopeId, key } = readParams(request);
  if (!key) throw new BadRequestError('key é obrigatório.');
  const row = await getSetting(ctx.cfg, scope, scopeId, key);
  return ok(row ? row.value : null, {
    endpoint: '/api/v1/settings', scope, scope_id: scopeId, key,
  }, ctx.headers);
}

export async function putSettingCtrl(request, ctx) {
  const { scope, scopeId, key } = readParams(request);
  if (!key) throw new BadRequestError('key é obrigatório.');
  const body = await readJsonBody(request);
  const value = (body && (body.value !== undefined)) ? body.value : body;
  // R5: input validation
  validate({ key, value }, settingPutSchema);
  const row = await setSetting(ctx.cfg, scope, scopeId, key, value);
  return ok(row ? row.value : value, {
    endpoint: '/api/v1/settings', scope, scope_id: scopeId, key,
  }, ctx.headers);
}

export async function deleteSettingCtrl(request, ctx) {
  const { scope, scopeId, key } = readParams(request);
  if (!key) throw new BadRequestError('key é obrigatório.');
  const removed = await deleteSetting(ctx.cfg, scope, scopeId, key);
  return ok({ deleted: removed, scope, scope_id: scopeId, key }, {
    endpoint: '/api/v1/settings',
  }, ctx.headers);
}

export async function listSettingsCtrl(request, ctx) {
  const { scope, scopeId } = readParams(request);
  const rows = await listSettings(ctx.cfg, scope, scopeId);
  const items = (rows || []).map(r => ({ key: r.key, value: r.value, updated_at: r.updated_at }));
  return ok(items, {
    endpoint: '/api/v1/settings/list', scope, scope_id: scopeId, count: items.length,
  }, ctx.headers);
}
