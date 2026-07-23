// =====================================================================
// kanban-controller.js — Fase 3.3 (parte 3)
// -----------------------------------------------------------------------
// Mesmo raciocínio do clientes-controller.js (parte 2): a tela de
// Kanban guarda UMA LISTA INTEIRA de cards por board ('leads' ou
// 'negocios') + consultor, não um registro por card — não existia
// (nem faria sentido criar agora) um recurso REST genérico pra isso, é
// puramente um documento (mesmo formato que
// db.collection('kb_'+board).doc(uid).{get,set}() do adaptador legado
// de js/supabase.js: { list, ts }).
//
// Rotas:
//   GET  /api/v1/kanban/list?board=<leads|negocios>&uid=<uid>
//   PUT  /api/v1/kanban/list?board=<leads|negocios>&uid=<uid>
// =====================================================================

import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { getFsDocument, setFsDocument } from '../lib/fs-documents.js';
import { ok } from '../utils/response.js';
import { BadRequestError } from '../errors/http-errors.js';

const KANBAN_LIST_PARENT = 'kanban/list';
const ALLOWED_BOARDS = new Set(['leads', 'negocios']);

function boardPath(board, uid) {
  return KANBAN_LIST_PARENT + '/' + board + '/' + uid;
}

function parseBoard(url) {
  const board = sanitizeString(url.searchParams.get('board'), 40);
  if (!board || !ALLOWED_BOARDS.has(board)) {
    throw new BadRequestError("board é obrigatório e deve ser 'leads' ou 'negocios'.");
  }
  return board;
}

// GET — mesmo trust model de /api/v1/clientes/list e /api/v1/usuarios/config:
// exige JWT válido, mas não restringe uid ao dono da sessão. Necessário
// porque gestores/admins visualizam o board de vários consultores ao
// mesmo tempo (ver _syncKBRemoteBG em js/kanban.js, ramo hasAdminAccess()).
export async function getKanbanListDoc(request, ctx) {
  const url = new URL(request.url);
  const board = parseBoard(url);
  const uid = sanitizeString(url.searchParams.get('uid'), 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  const doc = await getFsDocument(ctx.cfg, boardPath(board, uid));
  return ok(doc || null, { endpoint: '/api/v1/kanban/list', board, uid }, ctx.headers);
}

export async function putKanbanListDoc(request, ctx) {
  const url = new URL(request.url);
  const board = parseBoard(url);
  const body = await readJsonBody(request);
  const uid = sanitizeString(url.searchParams.get('uid'), 120) || sanitizeString(body.uid, 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  const list = Array.isArray(body.list) ? body.list : [];
  const payload = { list, ts: Date.now() };
  await setFsDocument(ctx.cfg, boardPath(board, uid), payload);
  return ok(payload, { endpoint: '/api/v1/kanban/list', board, uid }, ctx.headers);
}
