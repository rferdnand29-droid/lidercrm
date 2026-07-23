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
import { BadRequestError } from '../errors/http-errors.js';

const ATIVIDADES_LIST_PARENT = 'atividades/list';

function docPath(uid) {
  return ATIVIDADES_LIST_PARENT + '/' + uid;
}

// Mesmo trust model das outras rotas de documento: exige JWT válido,
// sem checagem de propriedade — o Painel ADM (loadAllActivitiesAdmin)
// e a atribuição de lembrete a outro consultor (agdDoSave/quick-act)
// precisam ler/gravar a lista de qualquer consultor, não só a própria.
export async function getAtividadesListDoc(request, ctx) {
  const url = new URL(request.url);
  const uid = sanitizeString(url.searchParams.get('uid'), 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  const doc = await getFsDocument(ctx.cfg, docPath(uid));
  return ok(doc || null, { endpoint: '/api/v1/atividades/list', uid }, ctx.headers);
}

export async function putAtividadesListDoc(request, ctx) {
  const url = new URL(request.url);
  const body = await readJsonBody(request);
  const uid = sanitizeString(url.searchParams.get('uid'), 120) || sanitizeString(body.uid, 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  const list = Array.isArray(body.list) ? body.list : [];
  const payload = { list, ts: Date.now() };
  await setFsDocument(ctx.cfg, docPath(uid), payload);
  return ok(payload, { endpoint: '/api/v1/atividades/list', uid }, ctx.headers);
}
