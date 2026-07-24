// =====================================================================
// agenda-slots-controller.js — Fase 3.3 (parte 6)
// -----------------------------------------------------------------------
// Diferente de tudo migrado até aqui: agenda_slots NÃO é um documento
// único por consultor — é UM REGISTRO POR AGENDAMENTO, compartilhado
// por toda a equipe (qualquer consultor pode ver/criar/editar/excluir
// qualquer slot). No legado (js/agenda.js / js/supabase.js) isso é
// modelado como uma coleção Firestore com listener em tempo real
// (onSnapshot) — o Worker/Cloudflare não tem um equivalente nativo de
// push em tempo real, então o "tempo real" do legado vira POLLING no
// frontend (ver lf-agenda-worker-poll no patch/módulo js/agenda.js).
// Isso é uma degradação deliberada e documentada (latência de alguns
// segundos em vez de push instantâneo), não um bug.
//
// Reaproveita listFsChildren/getFsDocument/setFsDocument/deleteFsDocument
// (mesma lib usada por todas as partes anteriores), tratando
// 'agenda_slots' como uma "pasta" com um documento por slot
// (path agenda_slots/<id>), igual ao padrão já usado por
// documentos-controller (getAdmDocumentos) para listar filhos.
//
// Rotas:
//   GET    /api/v1/agenda-slots
//   POST   /api/v1/agenda-slots
//   PUT    /api/v1/agenda-slots?id=<id>
//   DELETE /api/v1/agenda-slots?id=<id>
// =====================================================================

import { readJsonBody, sanitizeString, validate } from '../validators/validate.js';
import {
  getFsDocument, setFsDocument, deleteFsDocument, listFsChildren,
} from '../lib/fs-documents.js';
import { ok, created, noContent } from '../utils/response.js';
import { BadRequestError } from '../errors/http-errors.js';
import { agendaSlotCreateSchema } from '../schemas/index.js';

const AGENDA_SLOTS_PARENT = 'agenda_slots';

function slotPath(id) {
  return AGENDA_SLOTS_PARENT + '/' + id;
}

function genId() {
  return 'slot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

// listFsChildren devolve { ...data, __meta:{ path, parent_path, updated_at } }.
// O frontend legado espera cada slot com um campo _id (era doc.id do
// Firestore) — extraímos de __meta.path e removemos o __meta antes de
// devolver, pra não vazar detalhe de armazenamento pro cliente.
function toSlot(doc) {
  if (!doc) return doc;
  const meta = doc.__meta;
  const rest = Object.assign({}, doc);
  delete rest.__meta;
  const id = meta ? meta.path.slice(AGENDA_SLOTS_PARENT.length + 1) : undefined;
  return Object.assign({ _id: id }, rest);
}

export async function listAgendaSlots(request, ctx) {
  const docs = await listFsChildren(ctx.cfg, AGENDA_SLOTS_PARENT);
  const items = docs.map(toSlot);
  return ok(items, { endpoint: '/api/v1/agenda-slots' }, ctx.headers);
}

export async function createAgendaSlot(request, ctx) {
  const body = await readJsonBody(request);
  validate(body, agendaSlotCreateSchema); // R5: input validation
  const id = genId();
  const payload = Object.assign({}, body, { ts: Date.now() });
  delete payload.id;
  delete payload._id;
  await setFsDocument(ctx.cfg, slotPath(id), payload);
  return created(Object.assign({ _id: id }, payload), { endpoint: '/api/v1/agenda-slots' }, ctx.headers);
}

export async function updateAgendaSlot(request, ctx) {
  const url = new URL(request.url);
  const id = sanitizeString(url.searchParams.get('id'), 120);
  if (!id) throw new BadRequestError('id é obrigatório.');
  const body = await readJsonBody(request);
  // merge:true no Firestore legado — lê o existente e mescla, em vez
  // de sobrescrever o documento inteiro (payload do PUT pode conter
  // só os campos alterados).
  const existing = await getFsDocument(ctx.cfg, slotPath(id));
  const base = existing ? Object.assign({}, existing) : {};
  delete base.__meta;
  const merged = Object.assign(base, body, { ts: Date.now() });
  delete merged.id;
  delete merged._id;
  await setFsDocument(ctx.cfg, slotPath(id), merged);
  return ok(Object.assign({ _id: id }, merged), { endpoint: '/api/v1/agenda-slots', id }, ctx.headers);
}

export async function deleteAgendaSlot(request, ctx) {
  const url = new URL(request.url);
  const id = sanitizeString(url.searchParams.get('id'), 120);
  if (!id) throw new BadRequestError('id é obrigatório.');
  await deleteFsDocument(ctx.cfg, slotPath(id));
  return noContent(ctx.headers);
}
