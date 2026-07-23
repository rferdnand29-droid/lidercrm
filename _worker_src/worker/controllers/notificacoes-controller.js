import { validate, readJsonBody, sanitizeString } from '../validators/validate.js';
import { notificacaoCreateSchema } from '../schemas/index.js';
import { listService } from '../services/crud-service.js';
import { notificacoesRepo } from '../repositories/index.js';
import { ok, created } from '../utils/response.js';
import { getFsDocument, setFsDocument } from '../lib/fs-documents.js';
import { BadRequestError, UnauthorizedError } from '../errors/http-errors.js';

const ALLOWED_FILTERS = ['destinatario_id', 'lida', 'tipo'];
const AUTOMATION_RULES_PATH = 'config/automation_rules';

function inboxPath(uid) {
  return 'notifications/' + String(uid || '').replace(/^\/+|\/+$/g, '');
}

function canAccessInbox(ctx, uid) {
  const me = ctx.user && ctx.user.sub;
  const role = ctx.user && ctx.user.role;
  return !!uid && (uid === me || role === 'adm' || role === 'gestor' || role === 'admin');
}

export async function listNotificacoes(request, ctx) {
  const url = new URL(request.url);
  if (ctx.user && ctx.user.sub && !url.searchParams.get('destinatario_id')) {
    url.searchParams.set('destinatario_id', ctx.user.sub);
  }
  const result = await listService(ctx.cfg, notificacoesRepo, url, ALLOWED_FILTERS);
  return ok(result.items, { endpoint: '/api/v1/notificacoes', pagination: result.meta }, ctx.headers);
}

export async function createNotificacao(request, ctx) {
  const body = await readJsonBody(request);
  const data = validate(body, notificacaoCreateSchema);
  data.titulo   = sanitizeString(data.titulo, 200);
  data.mensagem = sanitizeString(data.mensagem, 2000);
  data.remetente_id = ctx.user && ctx.user.sub;
  data.created_at = new Date().toISOString();
  data.lida = false;
  const row = await notificacoesRepo.insert(ctx.cfg, data);
  return created(row, { endpoint: '/api/v1/notificacoes' }, ctx.headers);
}

export async function getInboxNotificacoes(request, ctx) {
  const url = new URL(request.url);
  const uid = url.searchParams.get('uid') || (ctx.user && ctx.user.sub);
  if (!canAccessInbox(ctx, uid)) throw new UnauthorizedError('Sem acesso à inbox solicitada.');
  const doc = await getFsDocument(ctx.cfg, inboxPath(uid));
  const list = doc && Array.isArray(doc.list) ? doc.list : [];
  return ok(list, { endpoint: '/api/v1/notificacoes/inbox', uid }, ctx.headers);
}

export async function putInboxNotificacoes(request, ctx) {
  const url = new URL(request.url);
  const uid = url.searchParams.get('uid') || (ctx.user && ctx.user.sub);
  if (!canAccessInbox(ctx, uid)) throw new UnauthorizedError('Sem acesso à inbox solicitada.');
  const body = await readJsonBody(request);
  const list = Array.isArray(body && body.list) ? body.list.slice(0, 150) : [];
  await setFsDocument(ctx.cfg, inboxPath(uid), { list, ts: Date.now(), updatedBy: ctx.user && ctx.user.sub });
  return ok(list, { endpoint: '/api/v1/notificacoes/inbox', uid }, ctx.headers);
}

export async function postInboxNotificacao(request, ctx) {
  const body = await readJsonBody(request);
  const toUid = sanitizeString(body && body.toUid, 120);
  if (!toUid) throw new BadRequestError('toUid é obrigatório.');
  const text = sanitizeString(body && body.text, 2000);
  if (!text) throw new BadRequestError('text é obrigatório.');
  const entry = {
    id: sanitizeString(body && body.id, 120) || ('ntf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)),
    type: sanitizeString(body && body.type, 40) || 'activity',
    text,
    ts: sanitizeString(body && body.ts, 80) || new Date().toISOString(),
    lida: !!(body && body.lida),
    cardId: sanitizeString(body && body.cardId, 120) || null,
    board: sanitizeString(body && body.board, 80) || null,
    by: ctx.user && ctx.user.sub,
  };
  const doc = await getFsDocument(ctx.cfg, inboxPath(toUid));
  const list = doc && Array.isArray(doc.list) ? doc.list.slice() : [];
  list.unshift(entry);
  const trimmed = list.slice(0, 200);
  await setFsDocument(ctx.cfg, inboxPath(toUid), { list: trimmed, ts: Date.now(), updatedBy: ctx.user && ctx.user.sub });
  return created(entry, { endpoint: '/api/v1/notificacoes/inbox', uid: toUid }, ctx.headers);
}

export async function getAutomationRules(request, ctx) {
  const doc = await getFsDocument(ctx.cfg, AUTOMATION_RULES_PATH);
  const list = doc && Array.isArray(doc.list) ? doc.list : [];
  return ok(list, { endpoint: '/api/v1/notificacoes/rules' }, ctx.headers);
}

export async function putAutomationRules(request, ctx) {
  const body = await readJsonBody(request);
  const list = Array.isArray(body && body.list) ? body.list : [];
  await setFsDocument(ctx.cfg, AUTOMATION_RULES_PATH, { list, ts: Date.now(), updatedBy: ctx.user && ctx.user.sub });
  return ok(list, { endpoint: '/api/v1/notificacoes/rules' }, ctx.headers);
}
