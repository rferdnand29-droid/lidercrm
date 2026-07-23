import { validate, readJsonBody, sanitizeString } from '../validators/validate.js';
import { clienteCreateSchema, clienteUpdateSchema } from '../schemas/index.js';
import { listService } from '../services/crud-service.js';
import { clientesRepo } from '../repositories/index.js';
import { ok, created, noContent } from '../utils/response.js';
import { respondWithCache } from '../utils/etag.js';
import { getFsDocument, setFsDocument } from '../lib/fs-documents.js';
import { NotFoundError, BadRequestError } from '../errors/http-errors.js';

const ALLOWED_FILTERS = ['status', 'origem', 'atendente_id'];

// Fase 3.3 (parte 2) — CLIENTES_LIST_PARENT guarda a lista completa de
// clientes por consultor como um único documento (mesmo formato que
// js/clientes.js e js/auth.js já usavam via
// db.collection('clientes').doc(uid).{get,set}() no adaptador legado
// de js/supabase.js). Isso é DIFERENTE do recurso REST `clientesRepo`
// acima (um registro por cliente) — esse recurso já existia da Fase 2
// mas tem um formato de campos que não cobre o modelo real usado pela
// tela de Clientes (steps, stepDates, nicho, obsHistory etc.), então
// não dava pra reaproveitar ele sem uma migração de dados maior. Isso
// fica documentado como próximo passo em
// docs/FASE3_3_LOGIN_DIRETO_E_ROADMAP_SUPABASE.md.
const CLIENTES_LIST_PARENT = 'clientes/list';

export async function listClientes(request, ctx) {
  const url = new URL(request.url);
  const result = await listService(ctx.cfg, clientesRepo, url, ALLOWED_FILTERS);
  return respondWithCache(request, result.items, {
    endpoint: '/api/v1/clientes', pagination: result.meta,
  }, { maxAge: ctx.cfg.CACHE_DEFAULT_MAX_AGE, extraHeaders: ctx.headers });
}

export async function createCliente(request, ctx) {
  const body = await readJsonBody(request);
  const data = validate(body, clienteCreateSchema);
  data.nome = sanitizeString(data.nome, 200);
  if (data.observacoes) data.observacoes = sanitizeString(data.observacoes, 4000);
  data.created_at = new Date().toISOString();
  data.created_by = ctx.user && ctx.user.sub;
  const row = await clientesRepo.insert(ctx.cfg, data);
  return created(row, { endpoint: '/api/v1/clientes' }, ctx.headers);
}

export async function updateCliente(request, ctx) {
  const url = new URL(request.url);
  const body = await readJsonBody(request);
  const id = url.searchParams.get('id') || body.id;
  if (!id) throw new BadRequestError('id do cliente é obrigatório.');
  const data = validate(Object.assign({}, body, { id }), clienteUpdateSchema);
  delete data.id;
  data.updated_at = new Date().toISOString();
  data.updated_by = ctx.user && ctx.user.sub;
  const row = await clientesRepo.update(ctx.cfg, { id: 'eq.' + id }, data);
  if (!row) throw new NotFoundError('Cliente não encontrado.');
  return ok(row, { endpoint: '/api/v1/clientes' }, ctx.headers);
}

export async function deleteCliente(request, ctx) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) throw new BadRequestError('id do cliente é obrigatório.');
  await clientesRepo.remove(ctx.cfg, { id: 'eq.' + id });
  return noContent(ctx.headers);
}

// GET /api/v1/clientes/list?uid=<uid>
// Mesmo trust model já usado por /api/v1/usuarios/config (exige JWT
// válido, mas não restringe uid ao dono da sessão) — consistente com o
// resto do app, que não tem checagem de propriedade granular hoje, e
// necessário porque a tela de Clientes tem uma função de transferir
// cliente entre consultores (saveCli chamado com o uid do destino).
export async function getClientesListDoc(request, ctx) {
  const url = new URL(request.url);
  const uid = sanitizeString(url.searchParams.get('uid'), 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  const doc = await getFsDocument(ctx.cfg, CLIENTES_LIST_PARENT + '/' + uid);
  return ok(doc || null, { endpoint: '/api/v1/clientes/list', uid }, ctx.headers);
}

export async function putClientesListDoc(request, ctx) {
  const url = new URL(request.url);
  const body = await readJsonBody(request);
  const uid = sanitizeString(url.searchParams.get('uid'), 120) || sanitizeString(body.uid, 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  const list = Array.isArray(body.list) ? body.list : [];
  const payload = { list, uid, ts: Date.now() };
  await setFsDocument(ctx.cfg, CLIENTES_LIST_PARENT + '/' + uid, payload);
  return ok(payload, { endpoint: '/api/v1/clientes/list', uid }, ctx.headers);
}
