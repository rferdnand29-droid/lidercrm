import { validate, readJsonBody, sanitizeString } from '../validators/validate.js';
import { notificacaoCreateSchema } from '../schemas/index.js';
import { listService } from '../services/crud-service.js';
import { notificacoesRepo } from '../repositories/index.js';
import { ok, created } from '../utils/response.js';
import { getFsDocument } from '../lib/fs-documents.js';
import { BadRequestError, UnauthorizedError, ForbiddenError } from '../errors/http-errors.js';
import { resolveDepartmentMemberIds } from '../utils/team-scope.js';
import { expectedDocumentVersion, saveVersionedDocument } from '../utils/document-version.js';
import { respondWithVersionedDocument } from '../utils/etag.js';

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
  return respondWithVersionedDocument(
    request,
    list,
    { endpoint: '/api/v1/notificacoes/inbox', uid },
    doc && doc.__meta && doc.__meta.version,
    ctx.headers,
  );
}

export async function putInboxNotificacoes(request, ctx) {
  const url = new URL(request.url);
  const uid = url.searchParams.get('uid') || (ctx.user && ctx.user.sub);
  if (!canAccessInbox(ctx, uid)) throw new UnauthorizedError('Sem acesso à inbox solicitada.');
  const body = await readJsonBody(request);
  const list = Array.isArray(body && body.list) ? body.list.slice(0, 150) : [];
  const incomingClientTs = Number(body && body.clientTs);
  const current = await getFsDocument(ctx.cfg, inboxPath(uid)).catch(() => null);
  const currentClientTs = Number(current && current.clientTs);
  if (current
      && Number.isFinite(incomingClientTs)
      && Number.isFinite(currentClientTs)
      && incomingClientTs < currentClientTs) {
    return respondWithVersionedDocument(
      request,
      Array.isArray(current.list) ? current.list : [],
      { endpoint: '/api/v1/notificacoes/inbox', uid, stale: true },
      current.__meta && current.__meta.version,
      ctx.headers,
    );
  }
  const saved = await saveVersionedDocument(ctx.cfg, inboxPath(uid), {
    list,
    ts: Date.now(),
    clientTs: Number.isFinite(incomingClientTs) ? incomingClientTs : Date.now(),
    updatedBy: ctx.user && ctx.user.sub
  }, {
    version: expectedDocumentVersion(request, body),
  });
  return respondWithVersionedDocument(
    request,
    list,
    { endpoint: '/api/v1/notificacoes/inbox', uid },
    saved.version,
    ctx.headers,
  );
}

// SEC-09 (2026-10-05): mesma classe de risco já corrigida em
// push-send-controller.js (SEC-06) — inserir notificação com conteúdo
// totalmente livre na caixa de QUALQUER usuário, sem relação nenhuma
// exigida entre remetente e destinatário, abre espaço pra phishing/
// engenharia social interna (a notificação aparece como se fosse
// legítima, dentro do próprio app). Restringido ao mesmo departamento
// do remetente, salvo escopo global (gerência) — mesma lógica já
// auditada e testada.
export async function postInboxNotificacao(request, ctx) {
  const body = await readJsonBody(request);
  const toUid = sanitizeString(body && body.toUid, 120);
  if (!toUid) throw new BadRequestError('toUid é obrigatório.');
  const fromUid = ctx.user && ctx.user.sub;
  if (toUid !== fromUid && !(ctx.caps && ctx.caps.escopo === 'global')) {
    const deptIds = await resolveDepartmentMemberIds(ctx.cfg, fromUid);
    if (!deptIds || deptIds.indexOf(toUid) === -1) {
      throw new ForbiddenError('Só é possível notificar alguém do próprio departamento.', {
        code: 'AUTHZ_FORBIDDEN', reason: 'notification_target_out_of_department_scope',
      });
    }
  }
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
    convId: sanitizeString(body && body.convId, 120) || null,
    by: ctx.user && ctx.user.sub,
  };
  const doc = await getFsDocument(ctx.cfg, inboxPath(toUid));
  const list = doc && Array.isArray(doc.list) ? doc.list.slice() : [];
  list.unshift(entry);
  const trimmed = list.slice(0, 200);
  const saved = await saveVersionedDocument(ctx.cfg, inboxPath(toUid), {
    list: trimmed,
    ts: Date.now(),
    updatedBy: ctx.user && ctx.user.sub,
  }, {
    version: expectedDocumentVersion(request, body),
  });
  return respondWithVersionedDocument(
    request,
    entry,
    { endpoint: '/api/v1/notificacoes/inbox', uid: toUid },
    saved.version,
    ctx.headers,
  );
}

export async function getAutomationRules(request, ctx) {
  const doc = await getFsDocument(ctx.cfg, AUTOMATION_RULES_PATH);
  const list = doc && Array.isArray(doc.list) ? doc.list : [];
  return respondWithVersionedDocument(
    request,
    list,
    { endpoint: '/api/v1/notificacoes/rules' },
    doc && doc.__meta && doc.__meta.version,
    ctx.headers,
  );
}

export async function putAutomationRules(request, ctx) {
  // AUDITORIA-FINAL-10 (2026-08-01, decisão confirmada: gerente pra cima).
  // Regras de automação (ex.: lead parado 2 dias na etapa -> move pra
  // Livre) afetam o funil da empresa toda — só gerente/gestor/
  // representante/master podem editar. Leitura (getAutomationRules) não
  // foi restringida.
  if (!ctx.caps || !ctx.caps.adminUI) {
    throw new ForbiddenError('Editar regras de automação restrito a gerência.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'automation_rules_requires_admin',
    });
  }
  const body = await readJsonBody(request);
  const list = Array.isArray(body && body.list) ? body.list : [];
  const saved = await saveVersionedDocument(ctx.cfg, AUTOMATION_RULES_PATH, {
    list,
    ts: Date.now(),
    updatedBy: ctx.user && ctx.user.sub,
  }, {
    version: expectedDocumentVersion(request, body),
  });
  return respondWithVersionedDocument(
    request,
    list,
    { endpoint: '/api/v1/notificacoes/rules' },
    saved.version,
    ctx.headers,
  );
}
