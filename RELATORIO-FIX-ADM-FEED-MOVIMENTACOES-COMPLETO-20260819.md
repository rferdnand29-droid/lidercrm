# RELATÓRIO — Feed ADM de Movimentações: histórico completo + filtros

**Data:** 2026-08-19
**Escopo:** ADM → aba "🔄 Movimentações da equipe"

## Problema

O painel exibia apenas as **200 últimas** movimentações (e ainda cortava
a renderização em 60 itens). Não era possível ver o histórico "de todo o
tempo" do CRM, nem pesquisar/filtrar movimentações específicas ou por
data.

## O que mudou

### 1. Limite de 200 removido (histórico completo)

- **`src/modules/relatorios/runtime/feed-runtime.js`** (+ cópia em `www/`)
  - `saveFeed`: deixou de aplicar `slice(0,200)`. Agora usa um teto de
    segurança bem alto (`FEED_CACHE_HARD_CAP = 20000`) só para não estourar
    o `sessionStorage` do navegador.
  - `logFeedEvent`: cache local passa a manter o histórico completo
    (mesma constante). Antes o próprio dispositivo perdia eventos mais
    antigos mesmo quando o backend ainda tinha tudo.

- **`_worker_src/worker/controllers/feed-controller.js`**
  - `listFeed`: teto do parâmetro `limit` ampliado de 200 → 20000 e o
    default também passa a ser 20000. Aceita `?from=YYYY-MM-DD&to=YYYY-MM-DD`
    para paginação/filtro server-side opcional.

- **`src/shared/http/worker-client.js`** (+ cópia em `www/`)
  - `feedList` agora aceita `{ limit, from, to }` (e mantém compat com
    `feedList(number)`).

- **`js/relatorios.js`** (+ cópia em `www/`)
  - `_renderFeedCommon`: pede `{ limit: FEED_CACHE_HARD_CAP }` ao worker
    (não mais `200`). No fallback Firebase, deixou de fazer `slice(0,200)`
    — grava o feed inteiro via `saveFeed`.
  - `_admFeedRenderList`: **removido o `slice(0,60)`**. Substituído por
    paginação incremental (100 itens por página + botão "Carregar mais").

### 2. Filtros novos no painel

Adicionados aos 4 HTMLs do painel (`index.html`, `app.html`,
`www/index.html`, `www/app.html`):

- **🔎 Busca por texto** (`#adm-feed-search`): pesquisa em nome do
  usuário, cliente/item, detalhe, canal, board **e no rótulo do tipo**
  (`"agendou"`, `"transferiu"`, `"moveu"` etc.). Debounce de 180ms.
- **📅 Intervalo de datas** (`#adm-feed-from` / `#adm-feed-to`):
  filtra por `ts` do evento. `De` sem `Até` (ou vice-versa) funciona
  como cota aberta.
- **Filtro por usuário**: mantido (já existia).
- **Contador** (`#adm-feed-count`): mostra "N movimentações encontradas"
  / "N movimentações no total".
- **Botão "Limpar filtros"**: reseta busca, datas, usuário e canal.
- **Botão "Carregar mais"** (`#adm-feed-more`): revela o próximo bloco
  de 100 eventos; some quando não há mais.

Handlers públicos adicionados em `js/relatorios.js`:
`admFeedSetSearch`, `admFeedSetFrom`, `admFeedSetTo`,
`admFeedClearFilters`, `admFeedMore`.

### 3. Correções de qualidade do feed (do zip original `fix-feed-adm-movimentacoes`)

Aplicadas de forma integral (antes estavam ausentes do CRM):

- **`js/agenda.js`** (+ cópia em `www/js/`): registra no feed ADM os
  eventos `act_create` / `act_edit` / `act_done` / `act_delete`
  (agendamentos, lembretes rápidos, exclusão em lote e exclusão de slot).
- **`js/relatorios.js`**:
  - Transferência de responsável agora usa tipo `transfer` (antes ia
    como `move` genérico) — o feed diferencia troca de responsável e
    mudança de etapa.
  - `delete` / `delete permanente` emitem `console.warn` quando a sessão
    está inativa (antes silenciava e perdia o evento).
  - Rótulos de tipo ampliados: `transfer`, `act_create`, `act_edit`,
    `act_done`, `act_delete`.
  - Data mostrada agora inclui o **ano** (`dd/mm/aa hh:mm`), essencial
    quando o feed passa a exibir eventos antigos.

### 4. Neutralização de patch conflitante

- **`js/patches/kanban-leads/lf-adm-feed-datepick-v1-20260728.js`**
  (+ cópia em `www/`): o wrap `_wrapRenderAdmFeed` foi transformado em
  no-op. Ele sobrescrevia o `_admFeedCache` filtrando por 1 único dia,
  o que anulava o novo controle "de/até". O wrap de `renderAdmLigacoes`
  (motivo original desse patch) foi preservado.

## Compatibilidade

- Sem alteração de contrato de dados: os eventos gravados continuam
  idênticos. O CRM antigo lendo o mesmo backend continua funcionando —
  apenas veria os 200 primeiros.
- API do worker: rota `GET /api/v1/feed?limit&from&to` — o parâmetro
  `limit` continua opcional e retrocompatível.
- Idempotente: se o patch `lf-adm-feed-datepick-v1` for revertido para
  a versão antiga, o novo painel continua funcionando (só volta a ter
  o conflito de cache).

## Arquivos alterados

```
js/relatorios.js
js/agenda.js
js/patches/kanban-leads/lf-adm-feed-datepick-v1-20260728.js
src/modules/relatorios/runtime/feed-runtime.js
src/shared/http/worker-client.js
_worker_src/worker/controllers/feed-controller.js
index.html
app.html
www/js/relatorios.js
www/js/agenda.js
www/js/patches/kanban-leads/lf-adm-feed-datepick-v1-20260728.js
www/src/modules/relatorios/runtime/feed-runtime.js
www/src/shared/http/worker-client.js
www/index.html
www/app.html
```
