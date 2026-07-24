// =====================================================================
// feed-controller.js — Fase 3.4 (feed compartilhado de atividades)
// -----------------------------------------------------------------------
// Substitui firebase.firestore.FieldValue.arrayUnion (config/feed) sem
// precisar de uma RPC Postgres nem de tabela SQL nova. Em vez de UM
// documento com um array de até 200 entradas (que exigia arrayUnion pra
// não perder eventos quando dois consultores gravavam quase ao mesmo
// tempo — ver comentário original em js/relatorios.js/logFeedEvent),
// cada evento agora é o SEU PRÓPRIO documento em fs_documents, path
// feed/<id> — exatamente o padrão que agenda_slots já usa pra resolver
// o mesmo tipo de problema (registro único, compartilhado por toda a
// equipe, sem dono). Ver agenda-slots-controller.js.
//
// Por que isso já resolve a concorrência sem RPC: cada POST cria um
// path novo (id gerado no servidor, nunca reaproveitado), então
// setFsDocument() sempre cai no ramo de INSERT (nunca precisa ler e
// mesclar o que outro consultor acabou de gravar). Dois eventos
// simultâneos de consultores diferentes viram duas linhas diferentes —
// nenhum sobrescreve o outro. É a mesma garantia que o arrayUnion
// dava, só que por linha em vez de por elemento de array.
//
// Rotas:
//   GET  /api/v1/feed?limit=200
//   POST /api/v1/feed
// =====================================================================

import { readJsonBody, sanitizeString, validate } from '../validators/validate.js';
import { setFsDocument, listFsChildren } from '../lib/fs-documents.js';
import { ok, created } from '../utils/response.js';
import { feedEventoCreateSchema } from '../schemas/index.js';

const FEED_PARENT = 'feed';

function genId() {
  return 'f' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
}

function feedPath(id) {
  return FEED_PARENT + '/' + id;
}

// listFsChildren devolve { ...data, __meta:{ path, parent_path, updated_at } }.
// O documento já guarda seu próprio "id" (ver createFeedEvento) — só
// removemos o __meta interno antes de devolver ao cliente.
function toEvent(doc) {
  if (!doc) return doc;
  const rest = Object.assign({}, doc);
  delete rest.__meta;
  return rest;
}

export async function listFeed(request, ctx) {
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 200)));
  // listFsChildren já ordena por updated_at desc; reordenamos por "ts" (o timestamp
  // do próprio evento) igual ao que renderAdmFeed() já fazia com o array do Firestore,
  // pra não depender de updated_at bater exatamente com o ts do evento.
  const docs = await listFsChildren(ctx.cfg, FEED_PARENT);
  const items = docs
    .map(toEvent)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts))
    .slice(0, limit);
  return ok(items, { endpoint: '/api/v1/feed' }, ctx.headers);
}

export async function createFeedEvento(request, ctx) {
  const body = await readJsonBody(request);
  validate(body || {}, feedEventoCreateSchema); // R5: input validation
  const id = genId();
  const entry = {
    id,
    type: sanitizeString(body && body.type, 40) || 'create',
    // byId vem do JWT, não do body — mesmo modelo de confiança usado em
    // postInboxNotificacao (notificacoes-controller.js): não confiamos em
    // quem o cliente diz que é o autor do evento. Na prática é sempre o
    // mesmo valor que o app já envia (logFeedEvent sempre usa S.userId,
    // o próprio usuário logado), então não muda nenhum comportamento real.
    byId: (ctx.user && ctx.user.sub) || sanitizeString(body && body.byId, 120),
    byName: sanitizeString(body && body.byName, 120),
    byCor: Number.isFinite(Number(body && body.byCor)) ? Number(body.byCor) : 0,
    itemName: sanitizeString(body && body.itemName, 300),
    detail: sanitizeString(body && body.detail, 500),
    board: sanitizeString(body && body.board, 80) || null,
    canal: sanitizeString(body && body.canal, 40) || null,
    ts: sanitizeString(body && body.ts, 80) || new Date().toISOString(),
  };
  await setFsDocument(ctx.cfg, feedPath(id), entry);
  return created(entry, { endpoint: '/api/v1/feed' }, ctx.headers);
}
