// =====================================================================
// clientes-controller.js — server-side ESCOPE ENFORCEMENT (rodada 3 / 2026-07-29)
//
// Companheiro server-side dos patches r1 (cliente, 5fixes) e r2 (server
// leads). Esta camada é ADITIVA sobre authz.js — assim como o leads, não
// substitui, é a 3ª camada (authenticate → authorize → controller).
//
// O BINGO grava em dois lugares:
//   (a) tabela `clientes`  (clientesRepo)   — CRUD REST normal (Fase 2)
//   (b) doc  `clientes/list/<uid>`           — bingo em si (Fase 3.3)
//
// (a) já tinha risk de cross-owner via query/body. (b) estava
// INTEIRAMENTE ABERTO: qualquer uid no query sobrescrevia o bingo
// do outro consultor sem validação nenhuma (era "Mesmo trust model
// já usado por /api/v1/usuarios/config" — a aposta da Fase 3.3 não
// sobreviveu a esta auditoria).
//
// Esta rodada fecha AMBOS os vetores.
//
// Decisão de produto pendente (rodada 4+): workflow "transferir
// cliente entre consultores" exigirá endpoint dedicado. Por ora
// bloqueamos writes cross-owner.
//
// Não toca em routes/router.js. Idempotente: rodar 2x = no-op.
// Marcador r3: "escopo=global (gerente+/master)" — busca compartilhada
// com leads-controller.js; segura que ambos foram patcheados.
// =====================================================================

import { validate, readJsonBody, sanitizeString } from '../validators/validate.js';
import { clienteCreateSchema, clienteUpdateSchema } from '../schemas/index.js';
import { listService } from '../services/crud-service.js';
import { clientesRepo } from '../repositories/index.js';
import { ok, created, noContent } from '../utils/response.js';
import { respondWithCache } from '../utils/etag.js';
import { getFsDocument, setFsDocument } from '../lib/fs-documents.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../errors/http-errors.js';

const ALLOWED_FILTERS = ['status', 'origem', 'owner_id'];

const CLIENTES_LIST_PARENT = 'clientes/list';

// Marcador r3 — idempotência do aplicador
const SERVER_MARKER_R3 = 'BINGO_LIST_R3_OWNERSHIP_LOCK';

// ----------------------------- helpers -----------------------------------
function actionRank(a) {
  return { none: 0, remind: 1, read: 2, crud: 3 }[a] ?? 0;
}

function assertCanMutate(caps) {
  // Cliente tabela (clientesRepo): `negocios: 'crud'` no cargo conservador;
  // `administrativo` é `negocios: 'crud'` mas `leads: 'none'`. Para o
  // bingo / clientes-list, 'none' != 'crud' → bloqueado.
  if (!caps) return; // falha operacional — defesa em profundidade
  const boardCaps = caps.negocios; // bingo == negocios no schema de caps
  if (actionRank(boardCaps) < actionRank('crud')) {
    throw new ForbiddenError('Cargo sem permissão de mutação em clientes/negocios.', {
      code: 'AUTHZ_FORBIDDEN',
      reason: 'insufficient_action',
      board: 'negocios',
      need: 'crud',
      have: boardCaps,
    });
  }
}

function enforceScopeOnUrl(url, user, caps) {
  try { url.searchParams.delete('owner_id'); } catch (_e) {}
  if (!user || !user.sub) return;
  if (caps && caps.escopo === 'global') return;
  url.searchParams.set('owner_id', String(user.sub));
}

async function fetchOwnedCliente(cfg, id, userSub, caps) {
  if (!id) return null;
  const isGlobal = caps && caps.escopo === 'global';
  try {
    if (isGlobal) return await clientesRepo.findOne(cfg, { id: 'eq.' + id }, '*');
    return await clientesRepo.findOne(cfg, { id: 'eq.' + id, owner_id: 'eq.' + userSub }, '*');
  } catch (_e) {
    return null;
  }
}

// --- BINGO LIST — fecha cross-owner read/write ------------------------
// O bingo é o vetor MAIS perigoso: até a Fase 3.3 (sem esta rodada) um
// consultor logado podia fazer GET /api/v1/clientes/list?uid=QUALQUER
// OU PUT /api/v1/clientes/list?uid=QUALQUER com sua lista, sobrescrevendo
// o bingo de outrem.
//
// Nova política:
//   - GET: escopo=self/team → uid DEVE ser o próprio. escopo=global →
//     qualquer uid (gerente auditando).
//   - PUT: SOMENTE o próprio uid. Workflow de transferência fica fora
//     de escopo (endpoint dedicado; decisão de produto pendente).
function assertDocOwner(uid, user, caps) {
  const sub = user && user.sub;
  if (!sub) throw new UnauthorizedSelfError();
  if (caps && caps.escopo === 'global') return true; // gerente/gestor/master
  if (String(uid) !== String(sub)) {
    throw new ForbiddenError('Acesso ao bingo de outro consultor bloqueado.', {
      code: 'BINGO_LIST_R3_OWNERSHIP_LOCK',
      reason: 'cross_owner_bingo_access',
      required_uid: sub,
      attempted_uid: uid,
    });
  }
  return true;
}

function assertDocWriteOwner(uid, user, caps) {
  const sub = user && user.sub;
  if (!sub) throw new UnauthorizedSelfError();
  // PUT é estritamente self — não abrimos pra escopo=global sem endpoint
  // dedicado de transferência (decisão de produto pendente).
  if (String(uid) !== String(sub)) {
    throw new ForbiddenError('Escrita no bingo de outro consultor bloqueada. Transferência de cliente exige endpoint dedicado (pendente de produto).', {
      code: 'BINGO_LIST_R3_OWNERSHIP_LOCK',
      reason: 'cross_owner_bingo_write',
      required_uid: sub,
      attempted_uid: uid,
    });
  }
  return true;
}

class UnauthorizedSelfError extends Error {
  constructor() {
    super('Sessão sem `sub` — bingo/list requer usuário autenticado.');
    this.name = 'UnauthorizedSelfError';
    this.status = 401;
    this.code = 'UNAUTHORIZED';
  }
}

// =====================================================================
// CRUD clientes (REST `clientesRepo`)
//
// Idêntico ao leads-controller r2 em forma; apenas troca o repositório.
// =====================================================================
export async function listClientes(request, ctx) {
  const url = new URL(request.url);
  enforceScopeOnUrl(url, ctx && ctx.user, ctx && ctx.caps);
  const result = await listService(ctx.cfg, clientesRepo, url, ALLOWED_FILTERS);
  return respondWithCache(request, result.items, {
    endpoint: '/api/v1/clientes', pagination: result.meta,
  }, { maxAge: ctx.cfg.CACHE_DEFAULT_MAX_AGE, extraHeaders: ctx.headers });
}

export async function createCliente(request, ctx) {
  assertCanMutate(ctx && ctx.caps);
  const body = await readJsonBody(request);
  const data = validate(body, clienteCreateSchema);
  data.nome = sanitizeString(data.nome, 200);
  if (data.observacoes) data.observacoes = sanitizeString(data.observacoes, 4000);
  data.created_at = new Date().toISOString();
  data.created_by = ctx.user && ctx.user.sub;

  const isGlobal = ctx && ctx.caps && ctx.caps.escopo === 'global';
  const sub = ctx.user && ctx.user.sub;
  if (sub) {
    if (isGlobal) {
      if (data.owner_id !== undefined && data.owner_id !== null) {
        const v = String(data.owner_id);
        if (!v || v.length > 200) {
          throw new BadRequestError('owner_id inválido.');
        }
      }
    } else {
      data.owner_id = sub; // FORÇA dono = sessão
    }
  }
  const row = await clientesRepo.insert(ctx.cfg, data);
  return created(row, { endpoint: '/api/v1/clientes' }, ctx.headers);
}

export async function updateCliente(request, ctx) {
  assertCanMutate(ctx && ctx.caps);
  const url = new URL(request.url);
  const body = await readJsonBody(request);
  const id = url.searchParams.get('id') || body.id;
  if (!id) throw new BadRequestError('id do cliente é obrigatório.');
  const data = validate(Object.assign({}, body, { id }), clienteUpdateSchema);
  delete data.id;

  const sub = ctx.user && ctx.user.sub;
  const isGlobal = ctx && ctx.caps && ctx.caps.escopo === 'global';
  if (sub && !isGlobal) {
    const owned = await fetchOwnedCliente(ctx.cfg, id, sub, ctx.caps);
    if (!owned) throw new NotFoundError('Cliente não encontrado.');
  }
  data.updated_at = new Date().toISOString();
  data.updated_by = ctx.user && ctx.user.sub;
  if (sub && !isGlobal) data.owner_id = sub;

  const row = await clientesRepo.update(ctx.cfg, { id: 'eq.' + id }, data);
  if (!row) throw new NotFoundError('Cliente não encontrado.');
  return ok(row, { endpoint: '/api/v1/clientes' }, ctx.headers);
}

export async function deleteCliente(request, ctx) {
  assertCanMutate(ctx && ctx.caps);
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) throw new BadRequestError('id do cliente é obrigatório.');

  const sub = ctx.user && ctx.user.sub;
  const isGlobal = ctx && ctx.caps && ctx.caps.escopo === 'global';
  if (sub && !isGlobal) {
    const owned = await fetchOwnedCliente(ctx.cfg, id, sub, ctx.caps);
    if (!owned) throw new NotFoundError('Cliente não encontrado.');
  }
  await clientesRepo.remove(ctx.cfg, { id: 'eq.' + id });
  return noContent(ctx.headers);
}

// =====================================================================
// Bingo list (`clientes/list/<uid>`) — endpoints da Fase 3.3
//
// Esta é a parte NOVA da rodada 3. As anotações da Fase 3.3 diziam
// "Mesmo trust model já usado por /api/v1/usuarios/config" — esse
// modelo era informado (não restritivo). Esta rodada troca.
//
// getClientesListDoc:
//   - escopo=self/team → uid SÓ PODE ser o próprio (`ctx.user.sub`)
//   - escopo=global    → qualquer uid (gerente/gestor/master auditando)
//
// putClientesListDoc:
//   - SEMPRE uid === ctx.user.sub
//   - transfer workflow fica em endpoint dedicado (decisão de produto)
// =====================================================================
export async function getClientesListDoc(request, ctx) {
  const url = new URL(request.url);
  const uid = sanitizeString(url.searchParams.get('uid'), 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  assertDocOwner(uid, ctx && ctx.user, ctx && ctx.caps);
  const doc = await getFsDocument(ctx.cfg, CLIENTES_LIST_PARENT + '/' + uid);
  return ok(doc || null, { endpoint: '/api/v1/clientes/list', uid }, ctx.headers);
}

export async function putClientesListDoc(request, ctx) {
  const url = new URL(request.url);
  const body = await readJsonBody(request);
  const uid = sanitizeString(url.searchParams.get('uid'), 120) || sanitizeString(body.uid, 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  assertDocWriteOwner(uid, ctx && ctx.user, ctx && ctx.caps);
  const list = Array.isArray(body.list) ? body.list : [];
  // tamanho máximo defensivo: evita OVERFLOW no doc storage. O bingo
  // histórico fica em ~3k clientes no pior caso; 20k é margem
  // saudável. Se um único cliente json > 200kb, refusa.
  if (list.length > 20000) {
    throw new BadRequestError('Lista do bingo excede 20000 itens.');
  }
  const payload = { list, uid, ts: Date.now() };
  await setFsDocument(ctx.cfg, CLIENTES_LIST_PARENT + '/' + uid, payload);
  return ok(payload, { endpoint: '/api/v1/clientes/list', uid }, ctx.headers);
}
