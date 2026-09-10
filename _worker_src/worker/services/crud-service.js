// =====================================================================
// crud-service.js
// Serviço CRUD genérico. Todos os controllers do worker o utilizam para
// falar com um BaseRepository. Isso concentra a lógica de listagem
// paginada, filtragem e ordenação usando os operadores do PostgREST.
// =====================================================================

export function buildFiltersFromUrl(url, allowedFields = []) {
  const filters = {};
  const search = url.searchParams;
  for (const [k, v] of search) {
    if (['limit', 'offset', 'page', 'order', 'select', 'q'].includes(k)) continue;
    if (allowedFields.length && !allowedFields.includes(k)) continue;
    // Por padrão convertemos para eq.<v>
    filters[k] = 'eq.' + v;
  }
  return filters;
}

export function buildPagination(url) {
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));
  const page  = Math.max(1, Number(url.searchParams.get('page') || 1));
  const offset = (page - 1) * limit;
  const order = url.searchParams.get('order') || 'created_at.desc';
  const select = url.searchParams.get('select') || '*';
  return { limit, offset, page, order, select };
}

export async function listService(cfg, repo, url, allowedFields = []) {
  const { limit, offset, page, order, select } = buildPagination(url);
  const filters = buildFiltersFromUrl(url, allowedFields);
  const { rows, total } = await repo.list(cfg, {
    filters, order, select, limit, offset, count: 'exact',
  });
  return {
    items: rows,
    meta: { total, page, limit, order, filters },
  };
}
