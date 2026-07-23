import { listService } from '../services/crud-service.js';
import { financeiroRepo } from '../repositories/index.js';
import { respondWithCache } from '../utils/etag.js';

const ALLOWED_FILTERS = ['tipo', 'status', 'cliente_id'];

export async function listFinanceiro(request, ctx) {
  const url = new URL(request.url);
  const result = await listService(ctx.cfg, financeiroRepo, url, ALLOWED_FILTERS);
  return respondWithCache(request, result.items, {
    endpoint: '/api/v1/financeiro', pagination: result.meta,
  }, { maxAge: ctx.cfg.CACHE_DEFAULT_MAX_AGE, extraHeaders: ctx.headers });
}
