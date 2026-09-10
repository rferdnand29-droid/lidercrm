# CORREÇÕES 2026-09-08 — Stage Picker (Leads) + Conversão Lead→Negócio

## Bug 1 — Botão "escolher etapa" não funcionava na aba Leads
Arquivo: `js/kanban.js` (propagado para www/, android/, ios/)

1. **`_spSelect` (modo filtro)** — antes só chamava `renderKBMobile(board)`; no desktop
   (a barra `.stage-summary-bar` existe em index.html #947 e #1042) clicar numa etapa não
   mudava nada na tela. Agora chama `renderKBLocal(board)` (que já cobre o mobile via
   `isMobileView()`) + `renderStageSummaryBar` + `renderMobileChips`.
2. **`openStagePicker`** — as opções agora vêm SEMPRE do pipeline do próprio board
   (`KB_LEADS_COLS` para leads, `KB_NEG_COLS` para negócios). Antes `kbCols('negocios')`
   podia herdar `_kbDetOwnerUid` de um detalhe aberto e, com dono Administrativo, gerar
   opções `adm_*` — ao escolher, o card ia para uma coluna inexistente e sumia.
3. **`_collectLivrePoolForUser`** — virou wrapper à prova de falha
   (`_collectLivrePoolForUserUnsafe`): se o cache do pool "livre" estiver ausente/corrompido
   (boot offline, storage cheio), a exceção não derruba mais o picker nem o render —
   devolve ao menos os leads do próprio usuário.

Arquivo: `src/modules/kanban/runtime/kanban-helpers.js`
4. **`kbCols`** — dupla proteção: contexto `_kbDetBoard/_kbDetOwnerUid` só é usado quando
   pertence ao board em questão, e o pipeline `adm_*` só se aplica a `board==='negocios'`.

## Bug 2 — Lead movido para "Convertido" não aparecia na aba Negócios
Arquivo: `js/relatorios.js` (`convertToNeg`, propagado para www/, android/, ios/)

1. **Falha de storage** — se `saveKBFor('negocios',...)` falha (localStorage cheio),
   a marcação `col='conv'` do lead é REVERTIDA e o negócio é desfeito, com toast claro.
   Antes: lead sumia de Leads e o negócio não existia em lugar nenhum.
2. **Push imediato** — após gravar, dispara `_kbRemoteEnqueue('negocios', uid, ...)`
   (mesma fila serial usada por `saveKBFor`/`kanbanClaimLivre`). Antes o card novo só
   subia no próximo ciclo (15–20s) e podia ser apagado por um poll do servidor nesse
   intervalo.
3. **Filtros residuais** — antes de renderizar, limpa `_mbStageFilter['negocios']`,
   `_kbFilter['negocios']` e `_kbOnlyLate['negocios']`. Antes, um filtro ativo
   (chip/etapa/valor mínimo) escondia o card recém-convertido (ex.: `valor:0` com
   `valorMin>0`), parecendo que a conversão falhou.

Validação: `node --check` OK nos 3 arquivos; cópias www/android/ios idênticas (md5).
