import { validate, readJsonBody, sanitizeString } from '../validators/validate.js';
import { leadCreateSchema } from '../schemas/index.js';
import { listService } from '../services/crud-service.js';
import { leadsRepo } from '../repositories/index.js';
import { ok, created, noContent } from '../utils/response.js';
import { respondWithCache } from '../utils/etag.js';
import { BadRequestError, NotFoundError } from '../errors/http-errors.js';

const ALLOWED_FILTERS = ['status', 'origem', 'atendente_id', 'interesse'];

export async function listLeads(request, ctx) {
  const url = new URL(request.url);
  const result = await listService(ctx.cfg, leadsRepo, url, ALLOWED_FILTERS);
  return respondWithCache(request, result.items, {
    endpoint: '/api/v1/leads', pagination: result.meta,
  }, { maxAge: ctx.cfg.CACHE_DEFAULT_MAX_AGE, extraHeaders: ctx.headers });
}

export async function createLead(request, ctx) {
  const body = await readJsonBody(request);
  const data = validate(body, leadCreateSchema);
  data.nome = sanitizeString(data.nome, 200);
  data.created_at = new Date().toISOString();
  data.created_by = ctx.user && ctx.user.sub;
  const row = await leadsRepo.insert(ctx.cfg, data);
  return created(row, { endpoint: '/api/v1/leads' }, ctx.headers);
}

export async function updateLead(request, ctx) {
  const url = new URL(request.url);
  const body = await readJsonBody(request);
  const id = url.searchParams.get('id') || body.id;
  if (!id) throw new BadRequestError('id do lead é obrigatório.');
  delete body.id;
  body.updated_at = new Date().toISOString();
  body.updated_by = ctx.user && ctx.user.sub;
  const row = await leadsRepo.update(ctx.cfg, { id: 'eq.' + id }, body);
  if (!row) throw new NotFoundError('Lead não encontrado.');
  return ok(row, { endpoint: '/api/v1/leads' }, ctx.headers);
}

export async function deleteLead(request, ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) throw new BadRequestError('id do lead é obrigatório.');
  await leadsRepo.remove(ctx.cfg, { id: 'eq.' + id });
  return noContent(ctx.headers);
}
