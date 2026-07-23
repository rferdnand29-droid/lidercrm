import { validate, readJsonBody, sanitizeString } from '../validators/validate.js';
import { documentoCreateSchema } from '../schemas/index.js';
import { listService } from '../services/crud-service.js';
import { documentosRepo } from '../repositories/index.js';
import { ok, created } from '../utils/response.js';
import { respondWithCache } from '../utils/etag.js';
import { getFsDocument, setFsDocument } from '../lib/fs-documents.js';

const ALLOWED_FILTERS = ['tipo', 'cliente_id'];
const ADM_DOCS_PATH = 'config/adm_docs';

export async function listDocumentos(request, ctx) {
  const url = new URL(request.url);
  const result = await listService(ctx.cfg, documentosRepo, url, ALLOWED_FILTERS);
  return respondWithCache(request, result.items, {
    endpoint: '/api/v1/documentos',
    pagination: result.meta,
  }, {
    maxAge: ctx.cfg.CACHE_DEFAULT_MAX_AGE,
    extraHeaders: ctx.headers,
  });
}

export async function createDocumento(request, ctx) {
  const body = await readJsonBody(request);
  const data = validate(body, documentoCreateSchema);
  data.titulo = sanitizeString(data.titulo, 200);
  data.created_at = new Date().toISOString();
  data.created_by = ctx.user && ctx.user.sub;
  const row = await documentosRepo.insert(ctx.cfg, data);
  return created(row, { endpoint: '/api/v1/documentos' }, ctx.headers);
}

export async function getAdmDocumentos(request, ctx) {
  const doc = await getFsDocument(ctx.cfg, ADM_DOCS_PATH);
  const list = doc && Array.isArray(doc.list) ? doc.list : [];
  return respondWithCache(request, list, {
    endpoint: '/api/v1/documentos/adm',
  }, {
    maxAge: 15,
    extraHeaders: ctx.headers,
  });
}

export async function putAdmDocumentos(request, ctx) {
  const body = await readJsonBody(request);
  const list = Array.isArray(body && body.list) ? body.list : [];
  const payload = {
    list,
    ts: Date.now(),
    updatedBy: ctx.user && ctx.user.sub,
  };
  await setFsDocument(ctx.cfg, ADM_DOCS_PATH, payload);
  return ok(payload.list, { endpoint: '/api/v1/documentos/adm' }, ctx.headers);
}
