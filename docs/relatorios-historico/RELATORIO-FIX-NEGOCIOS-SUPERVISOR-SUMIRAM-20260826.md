# RELATORIO-FIX-NEGOCIOS-SUPERVISOR-SUMIRAM-20260826

## Sintoma (grave)
Os **Negócios do supervisor sumiram do quadro Negócios**, mas os mesmos
clientes **continuam aparecendo no Bingo** (Dashboard/Clientes). Na captura
enviada, as colunas AG Vídeo / Presencial / Reagendar aparecem zeradas
mesmo havendo negócios ativos do usuário.

## Causa raiz (cadeia completa)

1. **O supervisor NÃO usa o render padrão do kanban.** O patch
   `js/patches/usuarios-auth/lf-supervisor-teamview-readonly-v1-20260722.js`
   envelopa `renderKBLocal` e manda o supervisor para `renderTeamBoard()`,
   que pinta **exclusivamente o cache local** `getKBFor('negocios', uid)`
   (chave `lf6_kb_negocios_<uid>`).

2. **Esse cache local estava vazio/incompleto sem perda real de dados.**
   O histórico do próprio projeto documenta como isso aconteceu:
   transferências otimistas (pinta local → PUT falha com 403
   `cross_owner_kanban_write` no worker) removiam o card da origem local
   sem gravar no destino — ver `LF-KB-TRANSFER-ROLLBACK-20260824`, cujo
   próprio relatório admite: *"o rollback só protege operações NOVAS;
   cards que sumiram ANTES do patch não voltam sozinhos"*. O documento
   real no servidor (`kanban/list/negocios/<uid>`) permanece intacto.

3. **O Bingo é a prova de que os dados existem.** Ele é alimentado por
   fonte própria (`lf6_c_<uid>` via `syncNegocioToBingo` +
   reconciliação de boot do `lf-bingo-sync` / `lf-bingo-strict-source`),
   que **não depende do cache do kanban**. Por isso "sumiu de Negócios
   mas aparece no Bingo": o negócio existe no servidor; só o board não
   foi repintado a partir dele.

4. **O background-sync do supervisor não curava o estado.** O
   `_syncKBRemoteBG` envelopado no patch teamview até busca o servidor,
   mas (a) se o fetch falha/403, nada reidrata; e (b)
   `_mergeKeepLocalOnly` (server-first) podia devolver lista vazia quando
   o servidor respondia vazio por falha transitória — e esse vazio era
   regravado no cache, **"selando" o sumiço**.

   No console enviado confirma-se o contexto: sessão do supervisor sem
   departamento resolvido (`cache team->departamento atualizado: 0
   time(s)`, `refresh OK — 0 departamento(s)`), que é justamente o
   cenário em que o pool de sync se reduz e o cache local passa a ser a
   única fonte pintada.

## Correção aplicada

### Novo patch: `js/patches/kanban-leads/lf-fix-negocios-supervisor-board-v1-20260826.js`
Três frentes, todas aditivas e idempotentes (guard
`__LF_FIX_NEG_SUP_BOARD_V1__`):

- **A) Reidratação forçada** — envelopa `renderKBLocal`: ao pintar o
  board de um supervisor (visão própria ou "Todos"), se o cache local de
  um uid-alvo estiver **vazio** mas houver **evidência no Bingo** de que
  existem negócios daquele uid (`sourceCardId`/`sourceOriginalLeadId`/
  `sourceBoard==='negocios'` em `getCliLocal(uid)`), dispara UM fetch
  fresco de `kanbanList(board, uid)` no servidor e repinta ao chegar.
  Debounce de 8s por (board,uid) para não martelar o endpoint.

- **B) Merge seguro** — na reidratação, um server-list **não-vazio nunca
  é sobrescrito por um local vazio**; e um server vazio só é aceito se o
  local também estiver vazio (caso contrário mantém o local e tenta
  depois). Impede que uma falha transitória "sele" o quadro vazio.

- **C) "Todos" sempre inclui o próprio supervisor** — envelopa
  `getDepartmentVisibleUsers`: se a lista de escopo omitir o próprio
  supervisor (edge de escopo sem departamento), ele é reinserido no
  início — a visão consolidada nunca renderiza sem os cards do próprio
  usuário.

### Inclusão + cache-busting
| Ponto | Antes | Agora |
|---|---|---|
| tag `<script>` nos 4 HTMLs | — | `lf-fix-negocios-supervisor-board-v1-20260826.js?v=20260826negsup1` (logo após o self-default) |
| `<meta name="lf-build-id">` | `20260824-apibasefix` / `20260824-bundlefix` | `20260826-negsupfix` |
| `js/lf-build-info.js` → `builtAt` | `2026-08-20 sinofix UTC` | `2026-08-26 negsupfix UTC` |
| espelho `www/js/patches/kanban-leads/` | — | novo arquivo copiado |

O `app-update-checker` detecta o `lf-build-id` novo e força reload limpo
nas abas abertas; o `?v=` novo fura o `Cache-Control: immutable`.

## Fluxo esperado pós-deploy
1. Supervisor abre Negócios → cache local vazio + Bingo com evidência →
   reidratação automática baixa o doc real do servidor e repinta.
2. Os negócios reaparecem nas colunas corretas (Retornar/AG Vídeo/
   Presencial/Reagendar/Cartela) — sem recriar nada por adivinhação:
   a fonte é o documento real do worker.
3. A visão "Todos" volta a incluir o próprio supervisor.
4. ADM e consultor comum: comportamento inalterado.

## Reversibilidade
Remover a tag `<script>` do patch nos 4 HTMLs + bump de `?v=`/build-id.
Nenhum dado apagado; nenhum backend, SW ou migration tocado.

## Arquivos alterados
- `js/patches/kanban-leads/lf-fix-negocios-supervisor-board-v1-20260826.js` (novo)
- `www/js/patches/kanban-leads/lf-fix-negocios-supervisor-board-v1-20260826.js` (espelho)
- `index.html`, `app.html`, `www/index.html`, `www/app.html` (tag script + build-id)
- `js/lf-build-info.js`, `www/js/lf-build-info.js` (builtAt)
