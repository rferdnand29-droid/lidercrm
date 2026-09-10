// =====================================================================
// ligacoes-controller.js — Fase 3.3 (parte 4) + P1 nuvem (2026-07-28)
// -----------------------------------------------------------------------
// Mesmo raciocínio das partes 2 e 3: contador de ligações do dia por
// consultor é um documento único por uid+data (formato { list, ts }),
// não um registro por ligação. Espelha
// db.collection('ligacoes').doc(uid+'_'+data).{get,set}() do adaptador
// legado de js/supabase.js.
//
// P1 nuvem (2026-07-28): além da lista da rodada atual, o PUT agora
// também aceita (e persiste) `total`, `rounds` e `device` — isso é
// o que faltava para que o bingo (que acumula rodadas no dia com
// lf-lig-counter-rounds-v1-20260728.js + lf-lig-counter-sync-cloud)
// sobrevivesse à troca de celular: cada aparelho grava o que acha
// que tem, e na próxima leitura o cliente faz merge por max().
//
// Rotas:
//   GET  /api/v1/ligacoes/list?uid=<uid>&date=<yyyy-mm-dd>
//   PUT  /api/v1/ligacoes/list?uid=<uid>&date=<yyyy-mm-dd>
// =====================================================================

import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { getFsDocument } from '../lib/fs-documents.js';
import { ok } from '../utils/response.js';
import { BadRequestError, ForbiddenError } from '../errors/http-errors.js';
import { canAccessUid } from '../utils/team-scope.js';
import { expectedDocumentVersion, saveVersionedDocument } from '../utils/document-version.js';
import { respondWithVersionedDocument } from '../utils/etag.js';

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

// AUDITORIA-FINAL-10 (2026-08-01, decisão confirmada) — mesma regra de
// utils/team-scope.js aplicada em atividades-controller.js: dono
// sempre; gerente pra cima vê/edita qualquer um (Painel ADM);
// orientador/supervisor só do próprio time; consultor comum, só o
// próprio contador.
export async function getLigacoesListDoc(request, ctx) {
  const url = new URL(request.url);
  const { uid, date } = parseUidDate(url);
  if (!(await canAccessUid(ctx.cfg, ctx, uid))) {
    throw new ForbiddenError('Sem permissão para ver o contador de ligações deste usuário.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'ligacoes_cross_user_denied',
    });
  }
  const doc = await getFsDocument(ctx.cfg, docPath(uid, date));
  return respondWithVersionedDocument(
    request,
    doc || null,
    { endpoint: '/api/v1/ligacoes/list', uid, date },
    doc && doc.__meta && doc.__meta.version,
    ctx.headers,
  );
}

export async function putLigacoesListDoc(request, ctx) {
  const url = new URL(request.url);
  const { uid, date } = parseUidDate(url);
  if (!(await canAccessUid(ctx.cfg, ctx, uid))) {
    throw new ForbiddenError('Sem permissão para editar o contador de ligações deste usuário.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'ligacoes_cross_user_denied',
    });
  }
  const body = await readJsonBody(request);

  // --- campos básicos (mantidos do esquema original) ---
  const list = Array.isArray(body.list) ? body.list : [];

  // --- P1 nuvem: total/rounds sobrevivem ao reset ---
  // Aceita numbers do body se válidos e >=0; senão faz fallback seguro
  // para a lista atual — assim chamadas legadas (que só mandam list)
  // continuam funcionando idênticas a antes.
  const totalRaw = body.total;
  const roundsRaw = body.rounds;
  const bodyTotal = (typeof totalRaw === 'number' && Number.isFinite(totalRaw) && totalRaw >= 0)
    ? Math.floor(totalRaw)
    : list.length;
  const bodyRounds = (typeof roundsRaw === 'number' && Number.isFinite(roundsRaw) && roundsRaw >= 0)
    ? Math.floor(roundsRaw)
    : 0;

  // ------------------------------------------------------------------
  // CORREÇÃO (2026-08-04) — "métricas somem após atualizações":
  // Antes, este handler gravava `total`/`rounds` cegamente via
  // setFsDocument (sem merge nenhum). Como existem MÚLTIPLOS chamadores
  // fazendo PUT pro MESMO uid+date sem fila/serialização nenhuma no
  // cliente (saveLigToday a cada clique — que nem manda total/rounds,
  // o patch de cloud-sync, e o watcher de 5s), a requisição que
  // simplesmente responder por último "vencia" — mesmo carregando um
  // valor mais VELHO. Um PUT legado sem `total` (comum: acontece a
  // cada toggle de célula) calculava total=list.length (0..10, só a
  // rodada atual) e apagava o acumulado do dia inteiro se chegasse
  // depois de um PUT mais completo.
  //
  // Fix: lê o documento já gravado e nunca deixa total/rounds
  // REGREDIREM — o valor final é sempre o maior já visto pelo
  // servidor para este uid+date, não importa a ordem de chegada dos
  // PUTs concorrentes. `list` continua sendo substituída pelo valor
  // recebido (ela representa a rodada atual, que legitimamente reseta
  // para vazia quando o consultor fecha o bingo — só o acumulado
  // precisa ser protegido).
  // ------------------------------------------------------------------
  let existingTotal = 0;
  let existingRounds = 0;
  try {
    const existing = await getFsDocument(ctx.cfg, docPath(uid, date));
    if (existing) {
      existingTotal = (typeof existing.total === 'number' && Number.isFinite(existing.total)) ? existing.total : 0;
      existingRounds = (typeof existing.rounds === 'number' && Number.isFinite(existing.rounds)) ? existing.rounds : 0;
    }
  } catch (_err) {
    // Se a leitura falhar, segue sem proteção extra pra esta gravação
    // específica (equivalente ao comportamento anterior) — não bloqueia
    // o consultor por causa de uma falha transitória de leitura.
  }

  const total = Math.max(existingTotal, bodyTotal);
  const rounds = Math.max(existingRounds, bodyRounds);

  // --- device: opcional, usado só para diagnóstico na auditoria ---
  const device = (typeof body.device === 'string' && body.device.length)
    ? body.device.slice(0, 80)
    : null;

  const payload = { list, total, rounds, uid, date, ts: Date.now() };
  if (device) payload.device = device;

  const saved = await saveVersionedDocument(ctx.cfg, docPath(uid, date), payload, {
    version: expectedDocumentVersion(request, body),
  });
  return respondWithVersionedDocument(
    request,
    payload,
    { endpoint: '/api/v1/ligacoes/list', uid, date },
    saved.version,
    ctx.headers,
  );
}
