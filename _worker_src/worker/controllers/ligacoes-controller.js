// =====================================================================
// ligacoes-controller.js — Fase 3.3 (parte 4)
// -----------------------------------------------------------------------
// Mesmo raciocínio das partes 2 e 3: contador de ligações do dia por
// consultor é um documento único por uid+data (formato { list, ts }),
// não um registro por ligação. Espelha
// db.collection('ligacoes').doc(uid+'_'+data).{get,set}() do adaptador
// legado de js/supabase.js.
//
// Só o GET está sendo usado nesta parte (por js/relatorios.js, no
// Painel ADM). O PUT já fica pronto porque a escrita real
// (saveLigToday, em js/agenda.js) é o próximo módulo do roadmap e vai
// precisar do mesmo par de rotas — sem isso o Painel ADM passaria a
// ler do Worker enquanto agenda.js continuaria escrevendo só no
// Firestore legado, o que quebraria a leitura em vez de corrigi-la.
//
// Rotas:
//   GET  /api/v1/ligacoes/list?uid=<uid>&date=<yyyy-mm-dd>
//   PUT  /api/v1/ligacoes/list?uid=<uid>&date=<yyyy-mm-dd>
// =====================================================================

import { readJsonBody, sanitizeString, validate } from '../validators/validate.js';
import { getFsDocument, setFsDocument } from '../lib/fs-documents.js';
import { ok } from '../utils/response.js';
import { BadRequestError } from '../errors/http-errors.js';
import { ligacoesListPutSchema } from '../schemas/index.js';

const LIGACOES_LIST_PARENT = 'ligacoes/list';

function docPath(uid, date) {
  return LIGACOES_LIST_PARENT + '/' + uid + '_' + date;
}

function parseUidDate(url) {
  const uid = sanitizeString(url.searchParams.get('uid'), 120);
  const date = sanitizeString(url.searchParams.get('date'), 20);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  if (!date) throw new BadRequestError('date é obrigatório.');
  return { uid, date };
}

// Mesmo trust model das outras rotas de documento (clientes/list,
// kanban/list): exige JWT válido, sem checagem de propriedade — o
// Painel ADM precisa ler o contador de qualquer consultor.
export async function getLigacoesListDoc(request, ctx) {
  const url = new URL(request.url);
  const { uid, date } = parseUidDate(url);
  const doc = await getFsDocument(ctx.cfg, docPath(uid, date));
  return ok(doc || null, { endpoint: '/api/v1/ligacoes/list', uid, date }, ctx.headers);
}

export async function putLigacoesListDoc(request, ctx) {
  const url = new URL(request.url);
  const { uid, date } = parseUidDate(url);
  const body = await readJsonBody(request);
  validate(Object.assign({}, body, { uid }), ligacoesListPutSchema); // R5: input validation
  const list = Array.isArray(body.list) ? body.list : [];
  const payload = { list, uid, date, ts: Date.now() };
  await setFsDocument(ctx.cfg, docPath(uid, date), payload);
  return ok(payload, { endpoint: '/api/v1/ligacoes/list', uid, date }, ctx.headers);
}
