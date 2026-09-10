import { validate, readJsonBody, sanitizeString } from '../validators/validate.js';
import { documentoCreateSchema } from '../schemas/index.js';
import { listService } from '../services/crud-service.js';
import { documentosRepo } from '../repositories/index.js';
import { ok, created } from '../utils/response.js';
import { respondWithCache, respondWithVersionedDocument } from '../utils/etag.js';
import { getFsDocument } from '../lib/fs-documents.js';
import { ForbiddenError } from '../errors/http-errors.js';
import { expectedDocumentVersion, saveVersionedDocument } from '../utils/document-version.js';

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
  return respondWithVersionedDocument(
    request,
    list,
    { endpoint: '/api/v1/documentos/adm' },
    doc && doc.__meta && doc.__meta.version,
    ctx.headers,
  );
}

export async function putAdmDocumentos(request, ctx) {
  // AUDITORIA-FINAL-10 (2026-08-01, decisão confirmada: gerente pra cima).
  // "Documentos ADM" é o repositório compartilhado visível a todos, mas só
  // devia ser EDITÁVEL por gerente/gestor/representante/master. GET não foi
  // restringido — a pasta continua visível pra todo mundo, só a escrita
  // passou a exigir admin.
  if (!ctx.caps || !ctx.caps.adminUI) {
    throw new ForbiddenError('Editar documentos administrativos restrito a gerência.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'documentos_adm_write_requires_admin',
    });
  }
  const body = await readJsonBody(request);
  const list = Array.isArray(body && body.list) ? body.list : [];
  const payload = {
    list,
    ts: Date.now(),
    updatedBy: ctx.user && ctx.user.sub,
  };
  const saved = await saveVersionedDocument(ctx.cfg, ADM_DOCS_PATH, payload, {
    version: expectedDocumentVersion(request, body),
  });
  return respondWithVersionedDocument(
    request,
    payload.list,
    { endpoint: '/api/v1/documentos/adm' },
    saved.version,
    ctx.headers,
  );
}
