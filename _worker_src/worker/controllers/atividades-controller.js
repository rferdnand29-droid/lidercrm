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
import { getFsDocument } from '../lib/fs-documents.js';
import { ok } from '../utils/response.js';
import { BadRequestError, ForbiddenError } from '../errors/http-errors.js';
import { canAccessUid } from '../utils/team-scope.js';
import { expectedDocumentVersion, saveVersionedDocument } from '../utils/document-version.js';
import { respondWithVersionedDocument } from '../utils/etag.js';

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
  return respondWithVersionedDocument(
    request,
    doc || null,
    { endpoint: '/api/v1/atividades/list', uid },
    doc && doc.__meta && doc.__meta.version,
    ctx.headers,
  );
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
  // Protege contra uma aba/dispositivo antigo que chega depois de uma
  // gravação mais nova. Antes, o último PUT sempre substituía a lista inteira
  // e fazia atividades novas/concluídas desaparecerem.
  const incomingClientTs = Number(body.clientTs);
  const current = await getFsDocument(ctx.cfg, docPath(uid)).catch(() => null);
  const currentClientTs = Number(current && current.clientTs);
  if (current
      && Number.isFinite(incomingClientTs)
      && Number.isFinite(currentClientTs)
      && incomingClientTs < currentClientTs) {
    return respondWithVersionedDocument(
      request,
      current,
      { endpoint: '/api/v1/atividades/list', uid, stale: true },
      current.__meta && current.__meta.version,
      ctx.headers,
    );
  }

  /* [FIX 20260907] Bug 1 causa 1.2 (raiz multi-dispositivo): o PUT deixou
     de ser sobrescrita total ("último escritor ganha") e agora faz MERGE
     POR ID contra o documento atual do servidor. Cenário que isso fecha:
     o dispositivo A conclui a atividade às 10h00 (PUT ok, servidor fica
     done:true); o dispositivo B tinha uma cópia das 09h59 e, no tick de
     60s do checkUpcomingActs, fazia PUT da lista velha inteira — o
     servidor voltava pra done:false e a atividade "ressuscitava" como
     pendente/atrasada pra todos os painéis. Regras do merge:
       - conflito de id: vence o updatedAt mais novo (fallbacks:
         doneAt → createdAt);
       - empate de timestamp: done:true é MONOTÔNICO — uma conclusão
         nunca é desfeita por merge;
       - itens que só existem no servidor (criados em outro dispositivo)
         são PRESERVADOS — "sumiu da lista" é ambíguo num modelo de
         merge (pode ser exclusão OU cópia local desatualizada), então
         o merge é conservador e NÃO deleta por omissão;
       - remoções só acontecem via deletedIds EXPLÍCITO (tombstones
         enviados pelo cliente — ver activities-store.js, que lê o mapa
         lf_recently_deleted_ids_v1 de js/utils.js);
       - escape hatch: body.mode === 'replace' mantém o comportamento
         legado de sobrescrita total pra scripts/clientes antigos. */
  const deletedIds = Array.isArray(body.deletedIds)
    ? body.deletedIds.filter(function(id){ return typeof id === 'string' && id; })
    : [];
  const replaceMode = body.mode === 'replace';

  function _tsOf(a) {
    if (!a || typeof a !== 'object') return 0;
    const cands = [a.updatedAt, a.doneAt, a.createdAt];
    for (let i = 0; i < cands.length; i++) {
      const v = cands[i];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') { const p = Date.parse(v); if (Number.isFinite(p)) return p; }
    }
    return 0;
  }

  let finalList = list;
  if (!replaceMode && current && Array.isArray(current.list) && current.list.length) {
    const byId = new Map();
    const order = [];
    const push = function(a) {
      if (a && typeof a === 'object' && a.id) { byId.set(String(a.id), a); order.push(String(a.id)); }
    };
    current.list.forEach(push);
    const tomb = new Set(deletedIds.map(String));
    list.forEach(function(incoming) {
      if (!incoming || typeof incoming !== 'object' || !incoming.id) return;
      const id = String(incoming.id);
      tomb.delete(id); // id presente na lista nunca é apagado por tombstone
      const existing = byId.get(id);
      if (!existing) { byId.set(id, incoming); order.push(id); return; }
      const tIn = _tsOf(incoming);
      const tEx = _tsOf(existing);
      if (tIn > tEx) { byId.set(id, incoming); return; }
      if (tIn < tEx) return; // servidor tem a versão mais nova — preserva
      // Empate de timestamp: done:true monotônico — conclusão nunca desfeita.
      if (incoming.done === true && existing.done !== true) {
        byId.set(id, Object.assign({}, incoming, { done: true }));
      }
    });
    finalList = [];
    order.forEach(function(id) {
      if (tomb.has(id)) return; // exclusão explícita via deletedIds
      finalList.push(byId.get(id));
    });
  }

  const payload = {
    list: finalList,
    ts: Date.now(),
    clientTs: Number.isFinite(incomingClientTs) ? incomingClientTs : Date.now()
  };
  const saved = await saveVersionedDocument(ctx.cfg, docPath(uid), payload, {
    version: expectedDocumentVersion(request, body),
  });
  return respondWithVersionedDocument(
    request,
    payload,
    { endpoint: '/api/v1/atividades/list', uid },
    saved.version,
    ctx.headers,
  );
}
