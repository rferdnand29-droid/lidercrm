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
import { getFsDocument, setFsDocument } from '../lib/fs-documents.js';
import { ok } from '../utils/response.js';
import { BadRequestError, ForbiddenError } from '../errors/http-errors.js';

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
function canCrossOwnerKanban(caps) {
  return !!(caps && caps.foreign === 'edit' && caps.escopo && caps.escopo !== 'self');
}

function assertKanbanReadOwner(uid, user, caps) {
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

function assertKanbanWriteOwner(uid, user, caps) {
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
  return ok(doc || null, { endpoint: '/api/v1/kanban/list', board, uid }, ctx.headers);
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
  const payload = { list, ts: Date.now() };
  await setFsDocument(ctx.cfg, boardPath(board, uid), payload);
  return ok(payload, { endpoint: '/api/v1/kanban/list', board, uid }, ctx.headers);
}
