# Correções aplicadas — 2026-09-07

Este documento resume as 4 correções (front-end, baixo risco) aplicadas para
fechar as brechas nos Bugs 1 e 2 diagnosticados na análise.

## Escopo

Correções aplicadas: **#1, #2, #5 e #6** do plano de correções recomendado.
Correções NÃO aplicadas (fora do escopo front-end / risco maior):
- **#3** (dreno periódico ilimitado via `LF.enqueueActivities` em vez do backoff
  de 5 tentativas em `activities-store.js`) — envolve reestruturar o SyncManager.
- **#4** (merge por id no Worker em vez de PUT de lista inteira) — mudança de
  servidor, exige deploy do Worker.
- **#7** (migrar atividades de dono no fluxo "Assumir Lead") — envolve
  reescrita de dados; recomendado tratar depois da #4.

---

## #1 & #2 — `applyActBulkDone` e `markTlActDone` agora usam o cinto de segurança

**Arquivo:** `js/agenda.js`

Antes, só `actConfirmDone` chamava `_lfMarkRecentlyDone` e marcava
`_doneLocalAt`. As outras duas rotas de conclusão (lote e timeline do cliente)
ficavam sem proteção, e qualquer ciclo de sync do kanban logo em seguida
podia trazer de volta uma cópia desatualizada (`done:false`) do espelho
`card.activities`, revivendo a atividade como "Atrasada".

### `markTlActDone` (js/agenda.js, ~linha 754)
- Passa a marcar `a.done`, `a.doneAt` e `a.updatedAt` de forma coerente.
- Chama `window._lfMarkRecentlyDone(actId)` (cinto de 7 dias em localStorage).
- Grava `a._doneLocalAt = Date.now()` (respeitado por `checkUpcomingActs` e
  `showActAlert` — ver comentários existentes em `agenda.js:635/689`).
- Propaga `doneAt`, `updatedAt` e `_doneLocalAt` para a cópia da lista global
  de atividades (`getActivities()` → `saveActivities`).

### `applyActBulkDone` (js/agenda.js, ~linha 866)
- Para cada atividade selecionada, adiciona as mesmas duas marcas
  (`_lfMarkRecentlyDone` + `_doneLocalAt`), imediatamente antes da lógica
  já existente que atualiza o espelho `card.activities` do card kanban.

---

## #5 — Endurece o fallback legado em `_kbHasOverdueLinkedActivity`

**Arquivo:** `js/kanban.js` (linhas ~1064–1108)

O filtro tinha duas fontes: a store central e, como fallback, o espelho
legado `card.activities`. O espelho legado é notoriamente desatualizado
(multi-dispositivo, conclusão de outro consultor, corridas de sync), e
disparava falso "Atrasada" mesmo quando a store central respondia
corretamente com "nada atrasado".

Mudanças:

1. **Curto-circuito principal:** se `getActivitiesLocalFor` existe e o `uid`
   está disponível, o fallback NÃO é usado — a store central é fonte única
   de verdade. Isso elimina a **Causa 2.1** na raiz.
2. **Guardas adicionais no fallback** (para o cenário raro em que a store
   central não está disponível):
   - `a._doneLocalAt` conta como concluído (defesa em profundidade);
   - `a._lfIsRecentlyDone` (7 dias);
   - `a.board` obrigatório — atividade sem board não casa mais com "qualquer
     quadro" (**Causa 2.2**);
   - `board && a.board !== board` filtra pelo quadro corrente;
   - `a.clientId === card.id` — impede que uma atividade "solta" no
     espelho legado dispare em outro card;
   - `_isActivityOrphanOrInactive` — cards descartados / em etapa terminal
     não disparam.

---

## #6 — `saveTlActivity` grava o campo `board`

**Arquivo:** `js/agenda.js` (função `saveTlActivity`, ~linha 739)

Atividades criadas pela timeline do Bingo/cliente eram gravadas SEM `board`.
Combinado com o guarda antigo `if(board && a.board && a.board !== board)`,
uma atividade sem board casava com qualquer quadro no filtro "Atrasadas" —
fazendo uma atividade vencida do Bingo "atrasar" cards nos Leads/Negócios.

Correção:
- Deriva o `board` do próprio registro do Bingo, usando a mesma precedência
  já aplicada em `clientes.js/openKBDet`:
  - `c.sourceOriginalLeadId` → `leads`
  - `c.sourceCardId` → `negocios`
  - senão, `null` (registro avulso do Bingo — o novo guarda em
    `_kbHasOverdueLinkedActivity` também impede match acidental)
- Deriva o `clientId` correto (`sourceOriginalLeadId || sourceCardId || _tlCid`)
  para que a atividade referencie o card kanban real, não o registro do Bingo.
- O campo `board` é gravado tanto no espelho `c.activities` quanto na lista
  global de atividades (`getActivities`).

---

## Arquivos alterados

| Arquivo                                             | Linhas afetadas       |
|-----------------------------------------------------|-----------------------|
| `js/agenda.js`                                      | ~739–790 (saveTlActivity + markTlActDone), ~899–920 (applyActBulkDone) |
| `js/kanban.js`                                      | ~1064–1108 (_kbHasOverdueLinkedActivity fallback) |

**Sem alterações em:** `js/utils.js`, `src/modules/agenda/runtime/activities-store.js`,
`src/modules/sync/runtime/retry-queue-sync.js`, backend/Worker.

---

## Compatibilidade / risco

- **Sintaxe validada** com `node --check` nos 4 arquivos JS relevantes.
- Não altera contratos de dados (apenas adiciona campos: `_doneLocalAt`, `board`).
- Nenhuma migração de dados necessária: as marcas novas são benignas
  em registros antigos (ausência é tratada como `undefined` e ignorada).
- Rollback: reverter estes 2 arquivos volta ao comportamento anterior sem
  nenhum side effect persistente (as marcas ficam apenas no localStorage).

---

## Próximos passos sugeridos

- **#3 e #4** juntas atacam a Causa 1.2/1.3 (multi-dispositivo + falha de rede
  prolongada). A #4 (merge por id no Worker) é a que fecha o problema na raiz —
  recomendo prioridade.
- **#7** (Assumir Lead migrar atividades de dono) só faz sentido depois da #4;
  antes disso, mover atividades de uma "lista inteira" para outra tem os
  mesmos riscos de sobrescrita.
