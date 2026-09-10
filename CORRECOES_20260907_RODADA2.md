# Correções aplicadas — 2026-09-07 (Rodada 2)

Continuação de `CORRECOES_20260907.md`. A rodada 1 (front-end, #1/#2/#5/#6)
já estava presente no código. Esta rodada aplica o que faltava: **#3, #4, #7**
e as duas pendências finais (propagação de exclusões multi-dispositivo via
`deletedIds` e Causa 2.4). Também sincroniza as cópias empacotadas
(`www/`, `android/`, `ios/`), que estavam DESATUALIZADAS em relação à fonte
(não tinham nem as correções da rodada 1), e repara o vídeo
`lf-auth-bg-desktop.mp4` que corrompia a extração do zip anterior
("Erro dos dados / dados após o fim da carga").

---

## #4 — Worker: merge por id com `updatedAt` (causa raiz do multi-dispositivo)

`_worker_src/worker/controllers/atividades-controller.js` — `putAtividadesListDoc`

O `PUT /api/v1/atividades/list` deixou de ser sobrescrita total
("último escritor ganha") e agora faz **merge por id** contra o documento
atual do servidor:

- Conflito de id → vence o `updatedAt` mais novo (fallbacks: `doneAt` →
  `createdAt`), com parsing tanto de número quanto de ISO string;
- Empate de timestamp → `done:true` é **monotônico** — conclusão nunca é
  desfeita pelo merge;
- Itens que só existem no servidor (criados em outro dispositivo) são
  **preservados** — "sumiu da lista" é ambíguo num modelo de merge, então o
  merge é conservador e **não deleta por omissão**;
- Remoções só acontecem via **`deletedIds` explícito** (ver seção tombstones);
- Escape hatch: `body.mode === 'replace'` mantém o comportamento legado de
  sobrescrita total para scripts/clientes antigos;
- A proteção por `clientTs` (stale → devolve doc atual sem gravar) continua
  como primeira linha de defesa.

⚠️ **Requer redeploy do Worker** para valer em produção. O caminho Firebase
(`DB_MODE==='firebase'` em activities-store.js) grava direto no Firestore sem
merge — recomendado roteá-lo pelo Worker em rodada futura.

## #3 — Retry ilimitado após as 5 tentativas rápidas (Causa 1.3)

`src/modules/agenda/runtime/activities-store.js` — `_schedulePendingRetry`

Antes: backoff 3s/6s/9s/12s/15s e **desistia** — offline prolongado deixava
`_pending:true` eterno no cache e a conclusão nunca confirmava no servidor.
Agora:

- As 5 tentativas rápidas continuam iguais;
- Ao esgotar, enfileira em `LF.enqueueActivities` — o SyncManager
  (retry-queue-sync.js) drena a cada ~15s / em `online` / em
  `visibilitychange`, com até 30 tentativas e backoff exponencial próprio;
- E continua re-tentando localmente a cada 60s, **sem teto**, até
  `_hasPending(uid)` ficar falso. O laço para sozinho quando a fila esvazia.

## Propagação de exclusões multi-dispositivo (`deletedIds`)

O merge por id (#4) não remove por omissão — então a exclusão precisava de um
canal explícito:

- `js/agenda.js` — `deleteActBulk` agora chama
  `window._lfMarkRecentlyDeleted(id)` para cada atividade excluída
  (mapa compartilhado de 7 dias, chave `lf_recently_deleted_ids_v1`, já
  existente em js/utils.js);
- `src/modules/agenda/runtime/activities-store.js` — novos helpers
  `_actTombstones()` / `_unmarkActTombstone()` / `_syncActTombstones()`:
  coletam os tombstones de atividade (prefixo `a_`, para não vazar ids de
  leads/cards) e removem automaticamente o tombstone de qualquer id que
  volte a existir na lista local (auto-limpeza — evita que o próximo PUT
  apague um item recriado com o mesmo id);
- `src/shared/http/worker-client.js` — `saveAtividadesList` aceita o 4º
  parâmetro `extra` e inclui `deletedIds` no body do PUT;
- O Worker (#4) remove do documento os ids listados em `deletedIds`
  (um id presente na lista enviada nunca é apagado por tombstone).

## #7 — "Assumir Lead" migra as atividades vinculadas (Causa 2.3)

`js/kanban.js` — `assumeLead`

Após o `kanbanClaimLivre` confirmar: lê a loja de atividades do dono anterior
(`getActivitiesLocalFor`), separa as que têm `clientId === cardId`, regrava a
loja antiga sem elas (`lfSaveActivitiesFor`) e anexa cópias na loja do novo
dono com `userId` atualizado, `updatedAt` novo e flags transitórias
(`_pending`, `_doneLocalAt`) removidas. Best-effort: se a loja antiga não
estiver em cache neste dispositivo, o merge por id do Worker (#4) converge na
próxima sync.

## Causa 2.4 — refresh do cache de colegas ao ativar o filtro "Atrasadas"

`js/kanban.js` — `toggleKBLateFilter`

O cache local das atividades dos colegas só era atualizado ao abrir o painel
ADM — entre atualizações, conclusões feitas por colegas não chegavam e o card
aparecia atrasado sem atividade real atrasada. Agora, ao **ativar** o filtro,
chama `loadAllActivitiesAdmin` (que já respeita a guarda de permissão: sem
visão global, só recarrega a própria lista) e re-renderiza ao concluir. Com o
filtro desligado, comportamento inalterado.

## Cópias empacotadas sincronizadas

`www/js/`, `android/app/src/main/assets/public/` e `ios/App/App/public/`
continham cópias **desatualizadas** de `agenda.js` e `kanban.js` (sem nem as
correções da rodada 1). Todos os arquivos tocados nesta rodada
(`js/agenda.js`, `js/kanban.js`,
`src/modules/agenda/runtime/activities-store.js`,
`src/shared/http/worker-client.js`) foram copiados para `www/`, `android/` e
`ios/` e validados com `node --check` em todas as 4 localizações.

## Reparo do vídeo que corrompia o zip

`assets/videos/lf-auth-bg-desktop.mp4` (www/ + android/ + ios/) era o ponto de
falha na extração do zip anterior ("Início não confirmado do arquivo
compactado / dados após o fim da carga / Erro dos dados"). As 3 cópias foram
remuxadas com `ffmpeg -c copy -movflags +faststart` (streams idênticos,
container reescrito íntegro — hash das 3 cópias igual após o remux). O vídeo
mobile também foi remuxado preventivamente.

---

## Validação

```
node --check js/agenda.js                                     ✓
node --check js/kanban.js                                     ✓
node --check src/modules/agenda/runtime/activities-store.js   ✓
node --check src/shared/http/worker-client.js                 ✓
node --check _worker_src/worker/controllers/atividades-controller.js  ✓ (ESM)
+ todas as cópias em www/, android/, ios/                     ✓ (17 arquivos)
zip -T (teste de integridade do arquivo final)                ✓
```

## Estado das causas após as duas rodadas

| Causa | Status |
|---|---|
| 1.1 Bulk/timeline sem `_lfMarkRecentlyDone` | ✅ Fechada (rodada 1) |
| 1.2 PUT de lista inteira multi-dispositivo | ✅ Fechada na raiz (#4 — **requer redeploy do Worker**) |
| 1.3 Retry desiste após 5 tentativas | ✅ Fechada (#3) |
| 1.4 Espelho do card ao concluir atividade de outro usuário | ✅ Mitigada (#5 rodada 1: espelho legado irrelevante no filtro; #4 evita a regressão no servidor) |
| 2.1 Fallback legado com dados velhos | ✅ Fechada (rodada 1) |
| 2.2 Atividade sem `board` casando com qualquer quadro | ✅ Fechada (rodada 1) |
| 2.3 Troca de dono não movia atividades | ✅ Fechada (#7) |
| 2.4 Cache de colegas desatualizado | ✅ Fechada (refresh ao ativar o filtro) |
| Exclusões não propagavam entre dispositivos | ✅ Fechada (`deletedIds` + merge) |

## Ressalva restante

- Caminho Firebase (`DB_MODE==='firebase'`) continua com sobrescrita total
  direto no Firestore. Se o projeto ainda opera em modo Firebase em algum
  ambiente, rotear gravações de atividades pelo Worker fecha essa brecha.
