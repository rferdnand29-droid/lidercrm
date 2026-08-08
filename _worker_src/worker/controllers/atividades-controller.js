// =====================================================================
// atividades-controller.js — Fase 3.3 (parte 6)
// -----------------------------------------------------------------------
// Mesmo raciocínio de clientes-controller.js / kanban-controller.js:
// a lista de atividades (lembretes/tarefas) é UM documento por
// consultor ({ list, ts }), não um registro por atividade. Espelha
// db.collection('activities').doc(uid).{get,set}() do adaptador legado
// de js/supabase.js.
//
// Rotas:
//   GET  /api/v1/atividades/list?uid=<uid>
//   PUT  /api/v1/atividades/list?uid=<uid>
// =====================================================================

import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { getFsDocument, setFsDocument } from '../lib/fs-documents.js';
import { ok } from '../utils/response.js';
import { BadRequestError, ForbiddenError } from '../errors/http-errors.js';
import { canAccessUid } from '../utils/team-scope.js';

const ATIVIDADES_LIST_PARENT = 'atividades/list';

function docPath(uid) {
  return ATIVIDADES_LIST_PARENT + '/' + uid;
}

// AUDITORIA-FINAL-10 (2026-08-01, decisão confirmada): antes, qualquer
// autenticado lia/gravava a lista de QUALQUER consultor — sem checagem.
// Agora: dono sempre pode; gerente pra cima (adminUI) continua podendo
// ler/gravar de qualquer um (mantém o Painel ADM — loadAllActivitiesAdmin
// — funcionando); orientador/supervisor (supervisorUI) só do próprio
// time (atribuição de lembrete pra colega de time — agdDoSave/quick-act);
// consultor/funcionário comuns, só a própria lista. Ver utils/team-scope.js.
export async function getAtividadesListDoc(request, ctx) {
  const url = new URL(request.url);
  const uid = sanitizeString(url.searchParams.get('uid'), 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  if (!(await canAccessUid(ctx.cfg, ctx, uid))) {
    throw new ForbiddenError('Sem permissão para ver as atividades deste usuário.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'atividades_cross_user_denied',
    });
  }
  const doc = await getFsDocument(ctx.cfg, docPath(uid));
  return ok(doc || null, { endpoint: '/api/v1/atividades/list', uid }, ctx.headers);
}

export async function putAtividadesListDoc(request, ctx) {
  const url = new URL(request.url);
  const body = await readJsonBody(request);
  const uid = sanitizeString(url.searchParams.get('uid'), 120) || sanitizeString(body.uid, 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  if (!(await canAccessUid(ctx.cfg, ctx, uid))) {
    throw new ForbiddenError('Sem permissão para editar as atividades deste usuário.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'atividades_cross_user_denied',
    });
  }
  const list = Array.isArray(body.list) ? body.list : [];
  const payload = { list, ts: Date.now() };
  await setFsDocument(ctx.cfg, docPath(uid), payload);
  return ok(payload, { endpoint: '/api/v1/atividades/list', uid }, ctx.headers);
}
