// =====================================================================
// kanban-controller.js — server-side ESCOPE ENFORCEMENT (rodada 4 / 2026-07-29)
//
// Companheiro server-side dos patches r1 (cliente) + r2 (server leads) +
// r3 (server clientes). Esta camada é ADITIVA sobre authz.js.
//
// O KANBAN grava em `kanban/list/<board>/<uid>` — um documento singleton
// por (board, consultor). Mesma vulnerabilidade da Fase 3.3 vista em
// `clientes-controller.js` (r3): GET e PUT não validavam `ctx.user.sub`,
// permitindo qualquer consultor:
//
//   GET  /api/v1/kanban/list?board=leads&uid=OUTRO_UID  (le kanban alheio)
//   PUT  /api/v1/kanban/list?board=leads&uid=OUTRO_UID  (sobrescreve)
//
// O documento da Fase 3.3 dizia "Mesmo trust model de /usuarios/config"
// — inadequado. Esta rodada fecha o vetor.
//
// Diferença sutil em relação ao clientes-controller:
//   - Kanban tem 2 boards (leads|negocios), exige validar também.
//   - `assertCanRead` mais permissivo (gerente/gestor pode auditar) IS
//     usado em _syncKBRemoteBG em js/kanban.js no ramo hasAdminAccess().
//   - `assertCanWrite` continua estritamente self-only (transfer de kanban
//     entre consultores exige endpoint dedicado).
//
// Não toca em routes/router.js. Idempotente: rodar 2x = no-op.
// Marcador r4: "KANBAN_LIST_R4_OWNERSHIP_LOCK".
// =====================================================================

import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { getFsDocument } from '../lib/fs-documents.js';
import { callRpc } from '../lib/supabase-rest.js';
import { ok } from '../utils/response.js';
import { BadRequestError, ForbiddenError, ConflictError, HttpError } from '../errors/http-errors.js';
import { listAllUsers } from '../repositories/users-relational-repository.js';
import { resolveDepartmentMemberIds } from '../utils/team-scope.js';
import {
  expectedDocumentVersion,
  normalizeDocumentVersion,
  saveVersionedDocument,
} from '../utils/document-version.js';
import { respondWithVersionedDocument } from '../utils/etag.js';

const KANBAN_LIST_PARENT = 'kanban/list';
const ALLOWED_BOARDS = new Set(['leads', 'negocios']);

// Marcador r4 — idempotência do aplicador + auditoria futura
const SERVER_MARKER_R4 = 'KANBAN_LIST_R4_OWNERSHIP_LOCK';

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

// ------- helpers de ownership (espelha clientes-controller r3) ---------
/* LF-KANBAN-CROSS-OWNER-20260804
   Alinha o Worker ao contrato já usado pelo front canônico após a regra
   cargo+departamento: quem tem foreign='edit' e escopo != 'self' pode atuar
   em kanban de owner alheio. Observação: isso mantém a semântica já vigente
   no cliente; um hardening futuro pode restringir ainda mais por departamento
   no servidor, caso o projeto exponha essa relação de forma autoritativa aqui. */
export function canCrossOwnerKanban(caps) {
  return !!(caps && caps.foreign === 'edit' && caps.escopo && caps.escopo !== 'self');
}

export function assertKanbanReadOwner(uid, user, caps) {
  const sub = user && user.sub;
  if (!sub) throw new UnauthorizedSelfError();
  // LF-KANBAN-READ-GATE-20260804
  // Leitura cross-owner: global OU foreign-edit fora de self.
  if (caps && caps.escopo === 'global') return true;
  if (canCrossOwnerKanban(caps)) return true;
  if (String(uid) !== String(sub)) {
    throw new ForbiddenError('Leitura do kanban alheio bloqueada.', {
      code: 'KANBAN_LIST_R4_OWNERSHIP_LOCK',
      reason: 'cross_owner_kanban_read',
      required_uid: sub,
      attempted_uid: uid,
    });
  }
  return true;
}

export function assertKanbanWriteOwner(uid, user, caps) {
  const sub = user && user.sub;
  if (!sub) throw new UnauthorizedSelfError();
  // LF-KANBAN-WRITE-GATE-20260804
  // O front canônico já salva foreign leads quando o usuário tem
  // foreign='edit' + escopo != self. Sem alinhar o controller, o app
  // entra em falso-sucesso local + 403 remoto.
  if (String(uid) !== String(sub) && !canCrossOwnerKanban(caps)) {
    throw new ForbiddenError('Escrita no kanban alheio bloqueada. Transferência de board entre consultores exige endpoint dedicado (pendente de produto).', {
      code: 'KANBAN_LIST_R4_OWNERSHIP_LOCK',
      reason: 'cross_owner_kanban_write',
      required_uid: sub,
      attempted_uid: uid,
    });
  }
  return true;
}

class UnauthorizedSelfError extends Error {
  constructor() {
    super('Sessão sem `sub` — kanban/list requer usuário autenticado.');
    this.name = 'UnauthorizedSelfError';
    this.status = 401;
    this.code = 'UNAUTHORIZED';
  }
}

/* =====================================================================
   LF-KANBAN-LIVRE-POOL-20260817 (escopo por departamento, 20260817-2)
   -----------------------------------------------------------------------
   "Livre" (etapa 'livre', só existe no board 'leads') é, por definição de
   produto, um pool COMPARTILHADO — mas dentro do DEPARTAMENTO de quem
   está olhando, não a empresa toda (decisão confirmada 2026-08-17: cada
   departamento só vê/reivindica os leads livres uns dos outros).

   ESCOPO:
     - ADM/gerente (caps.escopo==='global') continua vendo TODOS os
       departamentos — comportamento idêntico ao que já tinham por outras
       telas, nenhuma restrição nova pra esse grupo.
     - Qualquer outro cargo (supervisor, consultor, etc.): escopo é o
       departamento de quem está pedindo, resolvido via
       resolveDepartmentMemberIds() (team_id -> teams.departamento_id ->
       todas as teams do departamento -> todos os usuários dessas teams).
       Sem departamento resolvido (usuário/time sem departamento
       cadastrado, ou erro): fail-closed pro PRÓPRIO uid só — nunca "sem
       filtro" (mesmo padrão já usado em dashboard-controller.js).

   Os dois pontos abaixo abrem uma exceção ESTREITA e ESPECÍFICA pra
   qualquer usuário autenticado (nenhuma capacidade especial exigida,
   só o filtro de departamento acima):

     1) GET  /api/v1/kanban/livre-pool
        Devolve SÓ os cards com col==='livre' dos usuários do MESMO
        departamento (ou todos, se ADM/gerente) — nunca o resto da lista
        de ninguém. Read-only.

     2) POST /api/v1/kanban/livre-claim  { cardId, fromUid }
        Operação atômica e autocontida: confirma primeiro que fromUid
        está no mesmo departamento (ou que quem pede é ADM/gerente), lê o
        board de origem SÓ no servidor (nunca devolve a lista alheia ao
        cliente), confirma que o card pedido está mesmo em 'livre' agora,
        move pra o board do PRÓPRIO requisitante (toUid é sempre
        ctx.user.sub — nunca um parâmetro do body, então não dá pra mover
        um lead pra conta de outra pessoa por aqui) e grava os dois
        documentos. Devolve só o card reivindicado, nada mais da lista de
        ninguém.

   Qualquer tentativa fora desse padrão exato continua caindo no bloqueio
   normal (assertKanbanReadOwner / assertKanbanWriteOwner). Nenhuma das
   duas rotas concede acesso de leitura ou escrita a cards fora da etapa
   'livre', nem a qualquer outro board (ambas são exclusivas de 'leads').
   ===================================================================== */

/* uids do "meu" pool de Livre: todos os ativos se ADM/gerente global,
   senão só o departamento de quem pediu (fail-closed pro próprio uid). */
async function _livrePoolScopeUids(ctx) {
  const sub = ctx && ctx.user && ctx.user.sub;
  const caps = ctx && ctx.caps;
  let activeIds;
  try {
    const rows = await listAllUsers(ctx.cfg, { limit: 500, activeOnly: true });
    activeIds = (rows || []).map((u) => String(u.legacy_id || u.id || '')).filter(Boolean);
  } catch (_e) {
    activeIds = [];
  }
  if (caps && caps.escopo === 'global') {
    return activeIds;
  }
  const deptIds = await resolveDepartmentMemberIds(ctx.cfg, sub);
  if (!deptIds || !deptIds.length) {
    return sub ? [sub] : [];
  }
  const activeSet = new Set(activeIds);
  const scoped = deptIds.filter((id) => activeSet.has(id));
  return scoped.length ? scoped : (sub ? [sub] : []);
}

export async function getKanbanLivrePool(request, ctx) {
  const sub = ctx && ctx.user && ctx.user.sub;
  if (!sub) throw new UnauthorizedSelfError();
  const board = 'leads';
  const uids = await _livrePoolScopeUids(ctx);
  if (!uids.length) {
    return ok([], { endpoint: '/api/v1/kanban/livre-pool', board, count: 0 }, ctx.headers);
  }
  const perUser = await Promise.all(uids.map(async (uid) => {
    try {
      const doc = await getFsDocument(ctx.cfg, boardPath(board, uid));
      const list = (doc && Array.isArray(doc.list)) ? doc.list : [];
      return list
        .filter((c) => c && c.col === 'livre')
        .map((c) => Object.assign({}, c, { _ownerUid: uid }));
    } catch (_e) {
      return [];
    }
  }));
  const pool = [].concat(...perUser);
  return ok(pool, { endpoint: '/api/v1/kanban/livre-pool', board, count: pool.length }, ctx.headers);
}

/* Reivindicar um lead da etapa "Livre" — operação ATÔMICA e AUTOCONTIDA
   no servidor: lê o board de origem, confirma que o card pedido está
   MESMO em 'livre' agora (não confia no que o cliente disse antes), move
   pra o board do próprio requisitante (nunca pra outra pessoa — toUid é
   sempre ctx.user.sub, nunca um parâmetro do body) e grava os dois
   documentos. O cliente nunca recebe o resto da lista de ninguém — só o
   card reivindicado, no final. Substitui a necessidade de uma exceção
   genérica de escrita cross-owner: é uma única ação, bem definida, sem
   abrir superfície nova de ataque. */
export async function claimLivreLead(request, ctx) {
  const sub = ctx && ctx.user && ctx.user.sub;
  if (!sub) throw new UnauthorizedSelfError();
  const body = await readJsonBody(request);
  const cardId = sanitizeString(body.cardId, 200);
  const fromUid = sanitizeString(body.fromUid, 120);
  if (!cardId || !fromUid) throw new BadRequestError('cardId e fromUid são obrigatórios.');
  if (String(fromUid) === String(sub)) {
    throw new BadRequestError('Você já é o responsável por este Lead.');
  }
  // Mesmo escopo do GET livre-pool: ADM/gerente (escopo global) pode
  // reivindicar de qualquer departamento; qualquer outro cargo só pode
  // reivindicar de quem está no MESMO departamento que ele.
  if (!(ctx.caps && ctx.caps.escopo === 'global')) {
    const deptIds = await resolveDepartmentMemberIds(ctx.cfg, sub);
    if (!deptIds || deptIds.indexOf(fromUid) < 0) {
      throw new ForbiddenError('Este Lead é de outro departamento — você só pode reivindicar leads livres do seu próprio departamento.', {
        code: 'KANBAN_LIVRE_CLAIM_WRONG_DEPARTMENT',
      });
    }
  }
  const board = 'leads';
  const bodyVersion = expectedDocumentVersion(request, body);
  const destinationVersion = normalizeDocumentVersion(body.toVersion || body.destinationVersion);
  let result;
  try {
    result = await callRpc(ctx.cfg, 'kanban_move_card', {
      p_from_path: boardPath(board, fromUid),
      p_to_path: boardPath(board, sub),
      p_card_id: cardId,
      p_to_user_id: sub,
      p_expected_from_version: bodyVersion,
      p_expected_to_version: destinationVersion,
    });
  } catch (error) {
    // A migration ausente não pode reabrir o antigo fluxo read+write: isso
    // voltaria a permitir que dois claims ganhassem o mesmo card.
    if (error && error.status === 404) {
      throw new HttpError(
        503,
        'KANBAN_ATOMIC_MOVE_UNAVAILABLE',
        'A operação atômica do Kanban ainda não foi habilitada no banco.',
        { migration: 'sql/migrations/etapa2_stabilizacao.sql' },
      );
    }
    throw error;
  }
  if (!result || result.ok === false) {
    const code = result && result.code;
    if (code === 'NOT_LIVRE') {
      throw new ForbiddenError('Este Lead não está (mais) na etapa Livre.', {
        code: 'KANBAN_LIVRE_CLAIM_NOT_LIVRE',
      });
    }
    if (code === 'VERSION_CONFLICT') {
      throw new ConflictError('O Kanban mudou enquanto o Lead era reivindicado. Atualize e tente novamente.', {
        code: 'DOCUMENT_VERSION_CONFLICT',
        serverVersion: result.server_version || null,
      });
    }
    throw new BadRequestError((result && result.message) || 'Não foi possível reivindicar o Lead.');
  }
  return ok(result.card || result, {
    endpoint: '/api/v1/kanban/livre-claim',
    board,
    version: result.destination_version || null,
  }, ctx.headers);
}

// =====================================================================
// Endpoints da Fase 3.3 (parte 3) — agora com ownership enforcement.
// =====================================================================
export async function getKanbanListDoc(request, ctx) {
  const url = new URL(request.url);
  const board = parseBoard(url);
  const uid = sanitizeString(url.searchParams.get('uid'), 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  assertKanbanReadOwner(uid, ctx && ctx.user, ctx && ctx.caps);
  const doc = await getFsDocument(ctx.cfg, boardPath(board, uid));
  return respondWithVersionedDocument(
    request,
    doc || null,
    { endpoint: '/api/v1/kanban/list', board, uid },
    doc && doc.__meta && doc.__meta.version,
    ctx.headers,
  );
}

export async function putKanbanListDoc(request, ctx) {
  const url = new URL(request.url);
  const board = parseBoard(url);
  const body = await readJsonBody(request);
  const uid = sanitizeString(url.searchParams.get('uid'), 120) || sanitizeString(body.uid, 120);
  if (!uid) throw new BadRequestError('uid é obrigatório.');
  /* LF-KANBAN-PUT-CAPS-20260804 */
  assertKanbanWriteOwner(uid, ctx && ctx.user, ctx && ctx.caps);
  const list = Array.isArray(body.list) ? body.list : [];
  // Limite defensivo idêntico ao clientes-controller r3 — kanban
  // histórico ~3k cards no pior caso conhecido; margem 20000 é saudável.
  if (list.length > 20000) {
    throw new BadRequestError('Lista do kanban excede 20000 itens.');
  }
  /* LF-KANBAN-PUT-MERGE-20260819: a sobrescrita cega permitia que uma aba
     antiga (lista em cache, sem a edição mais recente — ex.: lead
     renomeado segundos antes em outro dispositivo) regravasse o quadro
     inteiro e REVERTESSE a edição no servidor. Agora, para cards presentes
     nas duas versões, vence o updatedAt mais novo; ids ausentes no corpo
     continuam removidos (preserva exclusões) e ids novos entram normal. */
  const existing = await getFsDocument(ctx.cfg, boardPath(board, uid)).catch(() => null);
  const prevList = existing && Array.isArray(existing.list) ? existing.list : [];
  const prevById = new Map();
  for (const p of prevList) { if (p && p.id) prevById.set(String(p.id), p); }
  const mergedList = list.map((item) => {
    if (!item || !item.id) return item;
    const prev = prevById.get(String(item.id));
    if (!prev) return item;
    const iv = String(item.updatedAt || item.createdAt || '');
    const pv = String(prev.updatedAt || prev.createdAt || '');
    return iv >= pv ? item : prev;
  });
  const payload = { list: mergedList, ts: Date.now() };
  const saved = await saveVersionedDocument(ctx.cfg, boardPath(board, uid), payload, {
    version: expectedDocumentVersion(request, body),
  });
  return respondWithVersionedDocument(
    request,
    payload,
    { endpoint: '/api/v1/kanban/list', board, uid },
    saved.version,
    ctx.headers,
  );
}
