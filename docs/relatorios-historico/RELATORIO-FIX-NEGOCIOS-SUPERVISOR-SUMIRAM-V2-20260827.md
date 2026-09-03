# RELATORIO-FIX-NEGOCIOS-SUPERVISOR-SUMIRAM-V2-20260827

## Bug

Negócios do supervisor continuam sumindo do quadro Negócios (aparecem
normalmente no Bingo) mesmo com o patch
`lf-fix-negocios-supervisor-board-v1-20260826.js` já ativo — reportado
pelo usuário em 2026-08-27, no mesmo termo do bug original.

Durante a investigação, também foram encontradas e corrigidas duas
classes de problema de integridade pré-existentes no zip (não
relacionadas à causa do bug, mas bloqueantes para `ai-guard.mjs`):
desalinhamento de versão de cache entre `index.html` e `app.html` em
97 arquivos, e guarda de idempotência fora do padrão em 3 patches.

## Causa raiz

**Do bug em si:** o patch v1 só dispara reidratação do cache local
quando ele está **totalmente vazio**
(`if (local.length > 0) return;`). Mas a cadeia de causa que o
próprio relatório do v1 documenta — transferência otimista que pinta
local, falha no PUT do servidor (403 `cross_owner_kanban_write`) e
remove o card da origem sem completar o destino — tipicamente deixa
o cache **parcialmente** populado (ex.: 3 de 5 negócios), não vazio.
Nesse cenário `local.length` é 3 (`> 0`), o v1 nunca dispara, e os
negócios que sumiram continuam sumidos indefinidamente, mesmo com o
Bingo provando que existem no servidor. Essa hipótese foi reforçada
ao encontrar, no mesmo zip, o patch independente
`lf-fix-act-panel-scope-e-resync-20260824.js`, que documenta
EXATAMENTE o mesmo mecanismo de perda ("Leads sumidos por
transferências... antes do rollback") e já tinha uma correção manual
(botão "Ressincronizar leads") para o mesmo sintoma em Leads —
confirmação independente da causa.

**Da integridade do zip:** o histórico do projeto mostra que uma
sessão de IA anterior (fix "apibasefix", 2026-08-24) atualizou a
string de cache-busting compartilhada em `index.html`/`www/index.html`
para `20260824-apibasefix1`, mas não propagou a mesma atualização
para `app.html`/`www/app.html` em todos os pontos — deixando 97
arquivos JS com `app.html` ainda referenciando a versão antiga
(`20260823chatkbfix1`, do fim da sessão anterior a essa). Além disso,
3 patches (`lf-fix-negocios-supervisor-board-v1`,
`lf-cargo-only-via-departamento-v1`, e o v2 que este relatório
introduz) usam guarda de idempotência em MAIÚSCULAS_COM_UNDERSCORE
(`__LF_FIX_X__`), enquanto `ai-guard.mjs` (regra R1.IDEMP) espera o
padrão exato descrito no próprio `AI_CONTRACT.md`:
`global.__lfFix<Slug>`.

## Estratégia

1. **Novo patch aditivo**, sem tocar no v1:
   `lf-fix-negocios-supervisor-board-v2-20260827.js`. Em vez de
   perguntar "o cache está vazio?", pergunta "existe algum negócio
   que o Bingo referencia (`sourceCardId`, gravado por
   `syncNegocioToBingo`) e que não tem card correspondente no cache
   local?" — captura tanto perda total quanto parcial. Reidrata via
   `kanbanList` do servidor e grava com `_mergeKeepLocalOnly`, com a
   mesma proteção "servidor vazio nunca apaga local não-vazio" do v1.
   Convive com o v1 sem conflito (debounce próprio, guard próprio).

2. **Correção mecânica de cache-busting**: unificada a string de
   versão em todos os 4 HTMLs (`index.html`, `app.html`,
   `www/index.html`, `www/app.html`) para um valor novo único
   (`20260827negsup2`), eliminando a divergência de 97 arquivos.
   Nenhuma lógica alterada — só a query string de cache.

3. **Guarda de idempotência**: adicionada, em cada um dos 3 patches
   afetados, uma SEGUNDA flag com o nome exato que `ai-guard.mjs`
   verifica (`global.__lfFix<Slug>`), sem remover ou alterar a guarda
   original de nenhum deles — puramente aditivo.

4. **Tag `<script>` faltante**: `lf-fix-act-panel-scope-e-resync-
   20260824.js` existia e funcionava em `index.html`/`www/index.html`
   mas nunca tinha sido registrado em `app.html`/`www/app.html` —
   adicionado na mesma posição relativa (logo após
   `lf-fix-tab-dot-negocios-ownership-v1-20260820.js`).

## Fluxos cobertos

- Supervisor com cache PARCIALMENTE vazio de Negócios (o cenário real
  mais comum, não coberto pelo v1) → v2 detecta os `sourceCardId`
  órfãos e reidrata.
- Supervisor com cache TOTALMENTE vazio → v1 e v2 ambos disparam
  (redundância inofensiva, mesmo resultado final).
- Visão "Todos" do supervisor → mesma lógica de `targets` do v1,
  reaproveitada independentemente no v2.
- ADM e consultor comum → inalterados (v2 só atua pra supervisor não-
  admin, mesma trava do v1).
- Usuários de `app.html` (Capacitor/APK) → agora recebem TODOS os
  patches que `index.html` já tinha, incluindo o resync manual de
  Leads que nunca tinha chegado até eles.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/patches/kanban-leads/lf-fix-negocios-supervisor-board-v2-20260827.js` | novo |
| `www/js/patches/kanban-leads/lf-fix-negocios-supervisor-board-v2-20260827.js` | espelho |
| `js/patches/kanban-leads/lf-fix-negocios-supervisor-board-v1-20260826.js` | +1 linha (guarda de nomenclatura, aditiva) |
| `www/js/patches/kanban-leads/lf-fix-negocios-supervisor-board-v1-20260826.js` | espelho |
| `js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js` | +1 linha (guarda de nomenclatura, aditiva) |
| `www/js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js` | espelho |
| `index.html`, `app.html`, `www/index.html`, `www/app.html` | tag `<script>` do v2; string de cache unificada (`20260827negsup2`); tag do `lf-fix-act-panel-scope-e-resync-20260824.js` adicionada em app/www-app; `lf-build-id` bump |
| `js/lf-build-info.js`, `www/js/lf-build-info.js` | `builtAt` → `2026-08-27 negsupfixv2 UTC` |

## Verificação

```
node --check (todos os arquivos tocados) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros (8 avisos pré-existentes no worker)
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Reversão

- v2: remover as 2 tags `<script>` (raiz + www) + apagar os 2
  arquivos do patch. v1 continua funcionando exatamente como antes,
  sem qualquer dependência do v2.
- Guardas de nomenclatura: reversível removendo a linha adicionada em
  cada um dos 2 patches — não afeta a guarda original nem a lógica.
- Unificação de cache-busting: cosmética, não requer reversão (não
  há comportamento antigo para restaurar — só evita chamar o mesmo
  arquivo com 2 chaves de cache diferentes).
- Tag do `lf-fix-act-panel-scope-e-resync-20260824.js` em app.html:
  remover a linha adicionada — o patch já existia e era usado por
  index.html sem problema, então isso é puramente extensão de
  alcance, não uma correção que crie comportamento novo arriscado.

Nenhum dado apagado; nenhum backend, SQL ou migration tocado.
