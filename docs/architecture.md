# Arquitetura do LíderCRM

## O que este projeto É

Site estático servido pelo Cloudflare Pages, sem bundler e sem build
(`package.json`: `"build": "echo 'Static site — no build step needed.'"`).
Zero linha de `import`/`export` em todo o `js/`/`src/` client-side —
tudo roda em escopo global via `<script>` carregado em ordem manual
fixa, definida em `index.html` e `app.html`.

- **`index.html`** e **`app.html`** são duas cópias praticamente
  idênticas do mesmo app completo (login + CRM inteiro), cada uma com
  sua própria lista de `<script>`. Historicamente elas **não** são
  mantidas 100% em sincronia automaticamente — várias vezes neste
  projeto um patch foi aplicado só numa das duas (ver
  `js/patches/chat/README.md`, seção sobre divergências encontradas
  em 2026-08-01). Ao adicionar/remover um `<script>`, sempre editar as
  duas.
- **`app-lite.html`** é uma terceira variante, menor, propósito não
  totalmente mapeado — não foi tocada nas reorganizações de 2026-08.

## Como o carregamento funciona (e por que é frágil)

1. Módulos de base (`js/storage.js`, `js/api.js`, `js/auth.js`,
   `js/chat.js`, `js/kanban.js`, `js/leads.js` etc.) carregam primeiro,
   em ordem fixa, cada um definindo funções globais (`function
   renderChatList(){...}` no topo de um arquivo vira `window.renderChatList`
   automaticamente, por hoisting de script não-módulo).
2. Depois vêm ~100 arquivos em `js/patches/**` — cada um tipicamente
   **envelopa** (wrap) uma função global já existente:
   ```js
   var orig = global.algumaFuncao;
   global.algumaFuncao = function(){
     // ...faz algo antes/depois...
     return orig.apply(this, arguments);
   };
   ```
   Isso significa que **a ordem de carregamento define a ordem de
   envelopamento**, que por sua vez define QUAL patch roda primeiro
   quando a função é chamada. Trocar a ordem de dois `<script>` pode
   mudar o comportamento do app de forma sutil e sem erro visível.
3. `<script defer>` roda DEPOIS de todo script normal (não-defer),
   mesmo que apareça antes no HTML — isso já causou bug real (ver
   `docs/troubleshooting.md`, item "renderChatList perdia a flag de
   diagnóstico"). **Não misturar `defer`/não-`defer` sem entender a
   consequência.**

## Onde cada coisa mora

Ver `ESTRUTURA-DO-PROJETO.md` na raiz — é o índice de todas as pastas.
Resumo rápido:

- `js/*.js` — módulos "principais" (um por tela: leads, kanban, chat,
  agenda, financeiro via `clientes.js`, etc.)
- `src/modules/<área>/runtime/` — uma modularização PARCIAL e mais
  antiga, que usa o mesmo padrão de script global, só que pendurado em
  `window.LiderCRM.modules.<área>` em vez de globais soltas. **Não é
  um sistema de módulos real** (zero `import`/`export`) — é só uma
  convenção de namespace.
- `js/patches/{chat,kanban-leads,notificacoes,usuarios-auth}/` —
  patches organizados por assunto (reorganização de 2026-08-01).
- `js/patches/` (raiz) — patches que tocam mais de uma área ao mesmo
  tempo, ou infraestrutura geral (boot, manifest PWA, branding).
- `src/shared/utils/` (novos) e `diagnostics/` — bibliotecas novas, aditivas,
  **não conectadas** ao app hoje (ver READMEs de cada uma).
- `_worker_src/worker/` — backend (Cloudflare Pages Functions),
  bundlado indiretamente via `functions/[[path]].js`.

## Por que não existe (ainda) um sistema de componentes/módulos real

A UI é construída via concatenação de string HTML
(`el.innerHTML = '<div>...'+variavel+'...</div>'`), não JSX/templates
de framework. Introduzir um sistema de componentes de verdade (React,
Vue, ou mesmo Web Components) seria uma reescrita, não uma
reorganização — está fora do escopo do que foi feito em 2026-08-01.
