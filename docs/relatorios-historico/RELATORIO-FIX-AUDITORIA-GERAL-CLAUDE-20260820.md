# RELATÓRIO — Auditoria geral e correções (Claude, sessão única)

**Data:** 2026-08-20
**Pedido original:** "Analise esse CRM que eu fui melhorando com Lovable e
Genspark, veja se precisa de correções e melhorias e faça esse serviço."
**Método:** rodei as próprias ferramentas de verificação que o projeto já
tinha (`npm run lint`, `npm test`, `node scripts/ai-guard.mjs`,
`node scripts/verify-mirror.mjs`) e corrigi cirurgicamente o que elas
apontaram, em vez de reescrever ou "melhorar" código por opinião pessoal —
conforme a regra de ouro do `AI_CONTRACT.md` (§0).

---

## 1. Diagnóstico inicial

| Verificação | Estado antes | Estado depois |
|---|---|---|
| `npm test` | **quebrado no boot** (0 de 8 arquivos rodava) | 8/8 arquivos, 43/43 testes ✅ |
| `node scripts/ai-guard.mjs` | 44 violações **bloqueantes** | 0 bloqueantes ✅ |
| `npm run lint` | 37 erros, 9 avisos | 0 erros, 8 avisos (não bloqueantes) |
| `node scripts/verify-mirror.mjs` | não chegava a rodar (ai-guard falhava antes) | `www/` e raiz idênticos ✅ |

---

## 2. `npm test` — suíte inteira não rodava

**Causa raiz:** `vite.config.ts` importa `@lovable.dev/vite-tanstack-config`
(pacote privado do editor Lovable). Esse pacote não está em
`package.json` porque o app real deste projeto é um site estático
multi-página (Cloudflare Pages + Capacitor), não o esqueleto TanStack
Start que o Lovable gera por padrão — mas o `vite.config.ts` desse
esqueleto ficou no repo. O Vitest carrega `vite.config.ts` por padrão
mesmo para os testes de `tests/*.test.js`, que não têm nenhuma relação
com TanStack/React, e a suíte inteira falhava no boot antes de rodar um
teste sequer — incluindo os testes que provam os invariantes de negócio
do §4 do `AI_CONTRACT.md` (escopo de leads, RLS, race de ligações).

**Correção:** criado `vitest.config.ts` na raiz (Vitest dá prioridade a
esse arquivo sobre `vite.config.ts` quando ambos existem). Configura só
`environment: 'happy-dom'`, que é o que `tests/retry-queue-cross-tab.test.js`
já esperava (comentário no próprio arquivo). **`vite.config.ts` não foi
tocado** — zero risco pro fluxo do editor Lovable.

**Arquivos:** `vitest.config.ts` (novo).

---

## 3. `ai-guard.mjs` — 44 violações bloqueantes

### 3.1 Bug real encontrado: patch só existia no mobile, nunca no site

`lf-consultor-clickable-lig-v1-20260819` (card do consultor clicável em
ADM/Time > Ligações, com modal de histórico) tinha o `.js` e o `.css`
**só dentro de `www/`** — nunca foram criados na pasta canônica
(`js/patches/kanban-leads/` e `css/`). Isso viola a regra #1 do próprio
`AI_CONTRACT.md` ("`www/` é espelho gerado, nunca edite à mão") e tinha
duas consequências práticas:

1. A funcionalidade só funcionava no app mobile (Capacitor) — nunca
   chegou ao site web de verdade, mesmo os HTMLs de `www/` referenciando
   o arquivo.
2. Rodar `npm run cap:www` (o build normal, que reconstrói `www/` do
   zero a partir da raiz) **apagaria o patch do mobile também**, porque
   a raiz nunca teve o arquivo-fonte.

**Correção:** arquivos portados para `js/patches/kanban-leads/` e
`css/` (fonte canônica), guarda de idempotência padronizada adicionada,
e `<script>`/`<link>` registrados nos 4 HTMLs (`index.html`, `app.html`,
`www/index.html`, `www/app.html`).

### 3.2 `app.html` sem 4 scripts que só existiam em `index.html`

`app.html` estava sem `lf-fix-worker-auth-gate-v1`,
`lf-fix-auth-gate-definitivo-v2`, `lf-when-worker-auth-v1` e
`lf-bootstrap-fn-aliases-v1`. O último caso é o mais sério: o próprio
comentário já presente no HTML diz que
`lf-fix-lead-refresh-nav-aliases-v1` **depende** de
`lf-bootstrap-fn-aliases-v1` carregar antes, e `app.html` carregava a
dependente sem o pré-requisito.

**Correção:** os 4 `<script>` adicionados em `app.html`, na mesma
posição relativa usada em `index.html`/`www/`.

### 3.3 `lf-administrativo-hide-tabs-v1` faltando em `index.html`

Presente em `app.html` e nos dois HTMLs de `www/`, ausente em
`index.html` — ou seja, o bloqueio de abas Bingo/Leads/Agenda para o
cargo ADMINISTRATIVO não valia no site principal. Adicionado.

### 3.4 `lf-fix-logout-wallpaper-reset-v2` faltando nos HTMLs de `www/`

Corrigido automaticamente ao reconstruir `www/` a partir da raiz (que já
tinha o `<script>` correto) via `npm run cap:www`.

### 3.5 Query-string de cache-bust inconsistente

`lf-fix-logout-video-restore-v1` tinha `?v=20260819leadchat1` nos HTMLs
de `www/` mas **não** nos HTMLs da raiz — ou seja, o site web (raiz) não
tinha cache-busting nesse arquivo especificamente, risco real de servir
uma cópia velha após deploy. Padronizado com `?v=20260819leadchat1` nos
4 HTMLs.

### 3.6 12 patches recentes (18–20/08) sem guarda de idempotência / IIFE

Patches escritos nos últimos dias (`lf-fix-logout-video-restore-v1`,
`lf-fix-logout-wallpaper-reset-v2`, `lf-departments-crud-v1`,
`lf-adm-feed-datepick-v1`, `lf-bingo-strict-source-v1`,
`lf-fix-rolante-order-adm-lig-total-v1`,
`lf-fix-supervisor-bingo-aggregate-v1`,
`lf-fix-tab-dot-negocios-ownership-v1`,
`lf-administrativo-hide-tabs-v1`, `lf-fix-auth-gate-definitivo-v2`,
`lf-fix-worker-auth-gate-v1`, `lf-hide-bingo-tab-toggle-v1`) ainda não
seguiam o padrão `global.__lfFix<Slug>` de idempotência exigido pelo
`AI_CONTRACT.md` §2.1, e 3 deles não eram IIFE `(function(global){...})`.
Sem isso, se o script for injetado duas vezes (ex.: navegação SPA entre
`index.html`/`app.html` sem reload completo, ou um futuro patch que
recarregue módulos), os listeners/wrappers desses patches duplicam.

**Correção:** guarda `if (global.__lfFix<Slug>) return; global.__lfFix<Slug> = true;`
adicionada logo após `'use strict'` em cada um, e IIFE corrigido nos 3
que faltava — **sem alterar nenhuma lógica de negócio**, só a casca de
carregamento. Guardas antigas específicas de cada patch (ex.:
`window.__LF_HIDE_BINGO_TAB_V1__`) foram mantidas intactas ao lado da
nova, por segurança.

### 3.7 Efeito colateral: 3 patches perderam o "grandfathering" do allowlist

O `scripts/ai-guard-legacy-allowlist.json` tolera violações antigas por
hash SHA-256 do arquivo. Ao editar 3 patches legados só para corrigir um
`no-useless-assignment` do ESLint (§4 abaixo), o hash mudou e eles
deixaram de ser "legado tolerado" — passando a exigir o padrão atual.
Mesma correção do item 3.6 aplicada a:
`lf-fix-adm-password-reset-logout-v1-20260803.js`,
`lf-livre-reason-required-v2-20260730.js`,
`lf-users-persist-cloudfirst-v1-20260728.js`.

**Arquivos:** 15 patches em `js/patches/**` (espelhados em `www/js/patches/**`
via `npm run cap:www`) + `css/lf-consultor-clickable-lig-v1-20260819.css`
(novo) + `index.html` + `app.html`.

---

## 4. `npm run lint` — 37 erros

Praticamente todos do mesmo padrão: `var x = null;` seguido de um
`try/catch` (ou `if/else`) que **sempre** reatribui `x` antes de
qualquer leitura — a regra `no-useless-assignment` do ESLint 10 pegou
esse padrão em ~25 lugares. Correção mecânica em todos: troca `var x = null;`
por `var x;` (mesmo comportamento, já que toda leitura de `x` acontece
depois da reatribuição garantida). Também corrigidos:

- 4 regexes com `\/`, `\(`, `\)`, `\"`, `\-` escapados dentro de character
  class ou fora de string — desnecessário, sem efeito no match
  (`no-useless-escape`).
- 2 regexes com emoji `👁` (par substituto/astral) dentro de character
  class **sem** a flag `u` — bug real de match (a classe tratava o
  emoji como 2 "caracteres" separados, os dois halves do surrogate pair,
  em vez de 1). Corrigido com `/u` — `js/patches/chat/nucleo/lf-attachments-newtab-v1-20260721.js`.
- 1 `hasOwnProperty` chamado direto no objeto-alvo → trocado por
  `Object.prototype.hasOwnProperty.call(...)` (`no-prototype-builtins`) —
  `js/agenda.js`.
- 1 setter que fazia `return origSetter.call(...)` → setters não podem
  retornar valor em JS (o `return` é ignorado pelo engine de qualquer
  forma); removido o `return`, mantida a chamada (`no-setter-return`) —
  `js/patches/lf-fix-console-errors-v1-20260818.js`.
- 1 `try{...}catch(e){throw e;}finally{...}` → o `catch` só re-lançava
  sem fazer nada, redundante com o próprio `try/finally` (`no-useless-catch`) —
  `js/patches/notificacoes/lf-overdue-activity-notif-fix-20260729.js`.
- 1 variável `extra` calculada duas vezes em `kanban-helpers.js`
  (primeira fórmula nunca lida, uma segunda fórmula corrigida —
  comentário `// Corrigido:` já indicava isso — logo abaixo a
  sobrescrevia sempre) — removida a primeira, mantida só a segunda.
- 3 variáveis/imports não usados em `tests/*.test.js` (`url`,
  `beforeEach`) — removidos.
- `window`/`localStorage` "não definidos" em
  `tests/retry-queue-cross-tab.test.js` — o `eslint.config.js` só dava
  `globals.node` pros testes, mas esse arquivo roda sob `happy-dom`
  (`// @vitest-environment happy-dom` no topo) e usa `window` de
  propósito. Config ajustada para `{ ...globals.node, ...globals.browser }`
  nos testes.

**Não alterado (fora de escopo):** 8 avisos de `no-unused-vars` no
worker (`SERVER_MARKER_R4`, `findUserByEmail`, `scrubUserForClient`,
`deleteWhere`, `_warnWildcardCors`, `noContent`, `saved`) — são warnings,
não bloqueiam CI, e alguns parecem ser exports de API pública de
repositório/controller mantidos de propósito. Tocar neles seria "reforma",
não "cirurgia" — fica registrado aqui como sugestão de faxina futura, não
como bug.

**Arquivos:** ~20 arquivos em `_worker_src/worker/**`, `js/**`, `src/**`,
`tests/**`, `eslint.config.js`.

---

## 5. O que NÃO foi mexido (de propósito)

- Nenhuma regra de negócio, cálculo, RLS, ou fluxo de UI foi alterado —
  só infraestrutura de build/teste/lint e sincronização entre arquivos
  que já deveriam ser idênticos.
- `vite.config.ts` (gerenciado pelo Lovable) não foi tocado.
- Nenhum patch antigo foi reescrito ou deletado; guardas foram
  **adicionadas ao lado** das existentes, nunca substituindo.
- `package.json` não ganhou nenhuma dependência nova.
- Os 8 avisos de `no-unused-vars` do worker foram deixados como estão
  (ver §4).

---

## 6. Verificação final (rodado nesta ordem, como o §5 do AI_CONTRACT pede)

```
npm run lint             → 0 erros, 8 avisos
npm test                 → 8/8 arquivos, 43/43 testes
node scripts/ai-guard.mjs → 0 violações bloqueantes
node scripts/verify-mirror.mjs → www/ e raiz idênticos
```

## 7. Reversão

Todas as mudanças estão em arquivos de texto simples, sem migração de
banco nem mudança de schema. Para reverter: restaurar o zip original
enviado (`lidercrm-remodel-multi-supervisor-KPI-FILTROS.zip`) ou remover
individualmente `vitest.config.ts` e reverter os arquivos listados nas
seções 3 e 4 pelo diff.
