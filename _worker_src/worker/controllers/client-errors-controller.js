// =====================================================================
// client-errors-controller.js — melhoria de arquitetura (2026-09,
// item 8 do plano de estabilidade): completa a "error boundary global"
// que já existia em js/app.js (CERT-12) — ela capturava erros do
// navegador corretamente, mas só mostrava um toast que sumia em 4s e
// um console.error que ninguém vê em produção. Sem persistir em
// lugar nenhum, um erro em produção só chegava até nós via print de
// tela de quem estava usando na hora.
//
// Mesmo padrão de armazenamento do feed-controller.js (cada erro é
// seu próprio documento em fs_documents, sem dono — path
// client_errors/<id> — evita qualquer corrida entre erros simultâneos
// de usuários diferentes). Mesmo padrão de permissão do
// financeiro-controller.js pra listagem (ctx.caps.adminUI).
//
// POST é aberto pra qualquer usuário autenticado — é o próprio erro
// dele sendo reportado, não faz sentido restringir quem pode avisar
// que algo quebrou. GET (ver os erros de todo mundo) é só admin.
//
// Rotas:
//   GET  /api/v1/client-errors?limit=100
//   POST /api/v1/client-errors
// =====================================================================

import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { setFsDocument, listFsChildren } from '../lib/fs-documents.js';
import { ok, created } from '../utils/response.js';
import { ForbiddenError } from '../errors/http-errors.js';

const CLIENT_ERRORS_PARENT = 'client_errors';
const MAX_LIST = 500; // trava alta só contra abuso — não é limite de uso normal

function genId() {
  return 'ce' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function errorPath(id) {
  return CLIENT_ERRORS_PARENT + '/' + id;
}

function toEntry(doc) {
  return doc && doc.data ? doc.data : doc;
}

export async function listClientErrors(request, ctx) {
  // Ver os erros de todo mundo é informação sensível (pode vazar
  // detalhe interno do sistema) — igual ao financeiro, restrito a
  // quem tem caps.adminUI.
  if (!ctx.caps || !ctx.caps.adminUI) {
    throw new ForbiddenError('Ver o registro de erros é restrito a administradores.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'client_errors_requires_admin',
    });
  }
  const url = new URL(request.url);
  let limit = parseInt(url.searchParams.get('limit') || '100', 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 100;
  limit = Math.min(limit, MAX_LIST);

  const docs = await listFsChildren(ctx.cfg, CLIENT_ERRORS_PARENT);
  const items = docs
    .map(toEntry)
    .sort((a, b) => new Date(b && b.ts) - new Date(a && a.ts))
    .slice(0, limit);
  return ok(items, { endpoint: '/api/v1/client-errors' }, ctx.headers);
}

export async function createClientError(request, ctx) {
  const body = await readJsonBody(request);
  const id = genId();
  const entry = {
    id,
    // byId vem do JWT, não do body — mesmo modelo de confiança do
    // feed-controller.js: não confiamos em quem o cliente diz que é.
    byId: (ctx.user && ctx.user.sub) || sanitizeString(body && body.byId, 120),
    byName: sanitizeString(body && body.byName, 120),
    message: sanitizeString(body && body.message, 500),
    stack: sanitizeString(body && body.stack, 3000),
    url: sanitizeString(body && body.url, 500),
    userAgent: sanitizeString(body && body.userAgent, 300),
    platform: sanitizeString(body && body.platform, 40) || 'web', // 'web' | 'capacitor'
    buildId: sanitizeString(body && body.buildId, 80),
    ts: sanitizeString(body && body.ts, 80) || new Date().toISOString(),
  };
  await setFsDocument(ctx.cfg, errorPath(id), entry);
  return created(entry, { endpoint: '/api/v1/client-errors' }, ctx.headers);
}
