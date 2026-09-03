// =====================================================================
// kanban-stream-controller.js — Tempo real, Fases 1 + 1.5 + 1.6 (2026-09-27)
// -----------------------------------------------------------------------
// Implementa a Rota A recomendada em PLANO-TECNICO-TEMPO-REAL-LIDERCRM.md:
// Server-Sent Events (SSE) com sondagem interna no servidor, em vez de
// Durable Objects — mesma autorização de sempre (dono vê o próprio
// dado), sem infraestrutura nova, sem custo adicional.
//
// COMO FUNCIONA: o cliente abre uma conexão (GET /api/v1/kanban/stream)
// que fica aberta. O servidor consulta fs_documents a cada ~2s, olhando
// só a coluna updated_at (não o dado inteiro — barato) dos DOIS boards
// do PRÓPRIO usuário autenticado (leads, negocios), do documento de
// atividades (Fase 1.5) e do inbox de notificações (Fase 1.6) — tudo
// na MESMA conexão, mais eficiente que abrir uma pra cada. Se algum
// updated_at mudou desde a última checagem, empurra um evento —
// "changed" pros boards (o cliente dispara _syncKBRemoteBG, sem
// duplicar merge nenhum), "activities-changed" pra atividades
// (dispara fetchAndCacheActivities, já com toda a lógica protetiva de
// merge construída em sessões anteriores) ou "notifications-changed"
// pro inbox (dispara loadNotifsRemote + updateNotifBadge, a mesma
// sequência já usada pela sondagem de 60s existente) — nenhuma dessas
// 3 lógicas de busca/merge foi duplicada, só chamadas mais cedo.
//
// ESCOPO DESTA FASE (limitação conhecida, documentada): só observa os
// recursos do PRÓPRIO usuário conectado — não replica a lógica de
// "supervisor vê o time"/"admin vê todo mundo" que já existe em
// team-scope.js. Quem depende de ver dado de OUTRA pessoa em tempo
// real (ex.: admin auditando) continua exatamente como hoje — a
// sondagem de 15s/60s do cliente não muda em nada, nem é removida. Uma
// fase futura pode estender o escopo; não é regressão, é aditivo.
//
// A conexão se fecha sozinha depois de ~2 minutos (60 ciclos de 2s) —
// o EventSource do navegador reconecta automaticamente por padrão,
// então isso não é percebido pelo usuário. Evita ficar com invocações
// rodando indefinidamente no Cloudflare.
//
// Se o cliente desconectar (fechar aba, navegar), a escrita no stream
// falha e o laço para sozinho — não fica consumindo recurso à toa.
// =====================================================================

import { selectFrom } from '../lib/supabase-rest.js';

const POLL_INTERVAL_MS = 2000;
const MAX_CYCLES = 60; // ~2 minutos, depois o EventSource reconecta sozinho
const BOARDS = ['leads', 'negocios'];

function boardPath(board, uid) {
  return 'kanban/list/' + board + '/' + uid;
}

function activitiesPath(uid) {
  return 'atividades/list/' + uid;
}

function notificationsPath(uid) {
  return 'notifications/' + uid;
}

// ---------------------------------------------------------------------
// Função pura, testável sem precisar de um stream de verdade — só lê
// updated_at (não o dado inteiro) dos 2 caminhos de kanban do usuário,
// do documento de atividades E do inbox de notificações, e compara
// contra o que já era conhecido. Retorna a lista de recursos que
// mudaram (vazia se nada mudou) — "leads"/"negocios" pros boards,
// "activities" pra atividades, "notifications" pro inbox.
// ---------------------------------------------------------------------
export async function checkKanbanChanges(cfg, uid, knownUpdatedAt) {
  const paths = BOARDS.map((b) => boardPath(b, uid)).concat([activitiesPath(uid), notificationsPath(uid)]);
  const resourceNames = BOARDS.concat(['activities', 'notifications']);
  const { rows } = await selectFrom(cfg, 'fs_documents', {
    filters: { path: 'in.(' + paths.join(',') + ')' },
    select: 'path,updated_at',
  });
  const changed = [];
  const nextKnown = Object.assign({}, knownUpdatedAt);
  resourceNames.forEach((name, i) => {
    const row = rows.find((r) => r.path === paths[i]);
    const ts = row ? row.updated_at : null;
    if (ts !== (knownUpdatedAt && knownUpdatedAt[name])) {
      if (knownUpdatedAt && Object.prototype.hasOwnProperty.call(knownUpdatedAt, name)) {
        // só reporta "mudou" se já tínhamos um valor anterior pra comparar
        // (na primeira checagem, só grava a baseline, não dispara evento)
        changed.push(name);
      }
      nextKnown[name] = ts;
    }
  });
  return { changed, nextKnown };
}

function sseFormat(event, data) {
  return 'event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n';
}

// ---------------------------------------------------------------------
// GET /api/v1/kanban/stream
// ---------------------------------------------------------------------
export async function kanbanStreamController(request, ctx) {
  const uid = ctx.user && ctx.user.sub;
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  async function write(str) {
    await writer.write(encoder.encode(str));
  }

  const pump = (async () => {
    let known = {};
    try {
      // Baseline inicial — não dispara evento, só estabelece o "estado
      // conhecido" pra comparar nos próximos ciclos.
      const first = await checkKanbanChanges(ctx.cfg, uid, {});
      known = first.nextKnown;
      await write(sseFormat('ready', { ok: true }));
    } catch (_e) {
      // Se a checagem inicial falhar (Supabase fora do ar, etc.), ainda
      // assim mantém a conexão — o cliente continua com a sondagem de
      // 15s funcionando normalmente como já funciona hoje.
      await write(sseFormat('ready', { ok: false })).catch(() => {});
    }

    for (let i = 0; i < MAX_CYCLES; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const { changed, nextKnown } = await checkKanbanChanges(ctx.cfg, uid, known);
        known = nextKnown;
        if (changed.length) {
          const boardsChanged = changed.filter((n) => n !== 'activities' && n !== 'notifications');
          if (boardsChanged.length) await write(sseFormat('changed', { boards: boardsChanged }));
          if (changed.indexOf('activities') !== -1) await write(sseFormat('activities-changed', {}));
          if (changed.indexOf('notifications') !== -1) await write(sseFormat('notifications-changed', {}));
        } else {
          // Comentário SSE (linha começando com ':') a cada poucos ciclos
          // só pra manter a conexão viva em proxies intermediários —
          // não é um evento, o cliente ignora.
          if (i % 10 === 0) await write(': keep-alive\n\n');
        }
      } catch (_e) {
        // Falha pontual de rede/Supabase — não derruba a conexão, só
        // pula este ciclo e tenta de novo no próximo.
      }
    }
    try { await writer.close(); } catch (_e) {}
  })().catch(() => {
    // Escrita falhou (cliente desconectou) — encerra silenciosamente,
    // sem logar como erro real do sistema.
    try { writer.close(); } catch (_e2) {}
  });

  ctx.waitUntil(pump);

  return new Response(readable, {
    status: 200,
    headers: Object.assign({}, ctx.headers, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    }),
  });
}
