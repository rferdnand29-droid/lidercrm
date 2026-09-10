import { listService } from '../services/crud-service.js';
import { financeiroRepo } from '../repositories/index.js';
import { respondWithCache } from '../utils/etag.js';
import { ForbiddenError } from '../errors/http-errors.js';

const ALLOWED_FILTERS = ['tipo', 'status', 'cliente_id'];

export async function listFinanceiro(request, ctx) {
  // SEC-01 (2026-08-01, auditoria técnica): dado financeiro é sensível e
  // não tinha NENHUMA checagem de permissão — qualquer usuário autenticado
  // conseguia listar. Exige caps.adminUI (gerente/gestor/representante/
  // master no CARGO_CAPS atual). Default conservador: 'administrativo' NÃO
  // está incluído (adminUI:false no CARGO_CAPS de hoje) — se precisar dar
  // acesso a esse cargo também, é 1 linha pra trocar a condição abaixo por
  // uma capacidade dedicada (ex.: caps.financeiro) quando essa dimensão for
  // modelada no banco.
  if (!ctx.caps || !ctx.caps.adminUI) {
    throw new ForbiddenError('Acesso a dados financeiros restrito a administradores.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'financeiro_requires_admin',
    });
  }
  const url = new URL(request.url);
  const result = await listService(ctx.cfg, financeiroRepo, url, ALLOWED_FILTERS);
  return respondWithCache(request, result.items, {
    endpoint: '/api/v1/financeiro', pagination: result.meta,
  }, { maxAge: ctx.cfg.CACHE_DEFAULT_MAX_AGE, extraHeaders: ctx.headers });
}
