# Arquitetura do LíderCRM

## O que este projeto É

Site estático servido pelo Cloudflare Pages, sem bundler e sem build
(`package.json`: `"build": "echo 'Static site — no build step needed.'"`).
Zero linha de `import`/`export` em todo o `js/`/`src/` client-side —
tudo roda em escopo global via `<script>` carregado em ordem manual
fixa, definida em `index.html`.

- **`index.html` é a fonte oficial** do app completo (login + CRM
  inteiro).
- **`app.html` é um espelho gerado** por
  `scripts/sync-entry-html.mjs`. Ele existe para preservar links/rotas
  antigas, mas não deve receber edições manuais. O `build-capacitor-www`
  sincroniza esse arquivo antes de montar o bundle.
- Não há uma variante `app-lite.html` no fluxo de produção. Ela foi
  removida porque não tinha consumidores além de testes manuais e criava
  uma terceira entrada que podia ficar desatualizada.

## Como o carregamento funciona (e por que é frágil)

1. O entrypoint é dividido em blocos visíveis no próprio HTML:
   `bootstrap`, `core-legacy`, `screens`, `core-services` e `patches`.
   Os marcadores `LF-LOAD-GROUP` tornam a intenção explícita sem
   reordenar código legado que ainda depende da sequência atual.
2. Os módulos de base (`js/storage.js`, `js/api.js`, `js/auth.js`,
   `js/kanban.js`, `js/leads.js` etc.) definem funções globais
   (`function renderChatList(){...}` no topo de um arquivo vira
   `window.renderChatList` automaticamente, por hoisting de script
   não-módulo). `js/chat.js` é a exceção deliberada: fica no bloco
   `screen-chat-lazy`, no fim do body.
3. Depois vêm ~100 arquivos em `js/patches/**` — cada um tipicamente
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
4. `<script defer>` roda DEPOIS de todo script normal (não-defer),
   mesmo que apareça antes no HTML — isso já causou bug real (ver
   `docs/troubleshooting.md`, item "renderChatList perdia a flag de
   diagnóstico"). **Não misturar `defer`/não-`defer` sem entender a
   consequência.** `npm run check:load-order` valida essa ordem
   efetiva, as dependências declaradas e os wrappers conhecidos; o
   manifesto fica em `scripts/load-order-contract.json`. Detalhes em
   `docs/load-order.md`.

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
- `src/shared/utils/` — `namespace.js` ativo; helpers opcionais sem
  consumidores foram removidos. `diagnostics/` — somente
  `crash-reporter.js`, carregado no boot.
- `_worker_src/worker/` — backend (Cloudflare Pages Functions),
  bundlado indiretamente via `functions/[[path]].js`.

## Por que não existe (ainda) um sistema de componentes/módulos real

A UI é construída via concatenação de string HTML
(`el.innerHTML = '<div>...'+variavel+'...</div>'`), não JSX/templates
de framework. Introduzir um sistema de componentes de verdade (React,
Vue, ou mesmo Web Components) seria uma reescrita, não uma
reorganização — está fora do escopo do que foi feito em 2026-08-01.

## Sincronização de dados — 4 mecanismos que convivem (2026-09)

Não existe sincronização em tempo real (WebSocket/SSE) — o cliente
**adivinha** o estado do servidor por sondagem e reconcilia. Isso é a
causa raiz de praticamente todo bug de "sumiu"/"voltou" já corrigido
neste projeto. Enquanto essa mudança maior não acontece, quatro
mecanismos separados cobrem partes do problema — cada um foi
construído numa sessão diferente pra resolver um sintoma específico,
e **juntos** (não cada um sozinho) dão a experiência de sincronização
que existe hoje:

1. **Sondagem periódica** (`js/app.js`, `setInterval(...,15000)`) —
   a cada 15s, se a aba está visível e a página de Leads/Negócios
   está aberta, busca o servidor e comparara com o local
   (`_syncKBRemoteBG` em `js/kanban.js`). Só repinta a tela se algo
   realmente mudou — a comparação usa `_lfListsEqualById`
   (`js/utils.js`), por conteúdo, não por ordem (ver `tests/
   lf-lists-equal-by-id.test.js` — usar `JSON.stringify` de arrays
   direto aqui já causou um bug real de tela tremendo/rolando
   sozinha).

2. **`BroadcastChannel` entre abas** (`js/kanban.js` publica,
   `js/app.js` escuta) — quando uma aba salva algo, avisa as outras
   abas da MESMA origem na hora, sem esperar a próxima sondagem.
   Cobre só abas do mesmo navegador — não ajuda entre dispositivos
   diferentes (PC e celular, por exemplo), que dependem da sondagem
   normal.

3. **Fila de retentativas persistente** (`src/core/offline/
   retry-queue.js` + `sync-manager.js`) — quando uma gravação no
   servidor falha (rede instável), fica guardada em localStorage
   (sobrevive a fechar o app) e é reenviada automaticamente quando a
   conexão volta, ou pelo dreno periódico (ativado no boot, `js/
   app.js`). Sem isso, uma gravação que falhasse ficava só no
   dispositivo, perdida se o app fosse fechado antes de tentar de
   novo.

4. **Merge com proteção contra corrida** (`_mergeKeepLocalOnly` em
   `src/modules/kanban/runtime/kanban-helpers.js`) — toda vez que o
   cliente busca o servidor e reconcilia com o local, passa por aqui.
   Duas proteções centrais:
   - **Item excluído recentemente** (`_lfMarkRecentlyDeleted`/
     `_lfIsRecentlyDeleted`, `js/utils.js`) — se um item foi excluído
     há menos de 7 dias, uma resposta do servidor que ainda não
     processou essa exclusão NÃO traz o item de volta. **Isto já
     teve uma implementação duplicada** (outro arquivo redefinia a
     mesma função com um TTL de só 5 minutos, sobrescrevendo esta
     silenciosamente) — corrigido, mas é o tipo de bug que fica
     invisível até alguém notar o sintoma. Ver `tests/
     lf-recently-deleted-protection.test.js`, que tem um teste de
     regressão explícito contra exatamente esse cenário.
   - **`updatedAt` mais recente vence** — se o mesmo card existe nos
     dois lados com valores diferentes, o merge prefere quem tem o
     `updatedAt`/`createdAt` mais recente, não "sempre o servidor" ou
     "sempre o local".

### Se for mexer em algum destes 4

- Rodar `npm run typecheck` depois de qualquer mudança em `js/utils.
  js`, `js/kanban.js` ou `kanban-helpers.js` — a checagem de tipos
  incremental (item 7 do plano de estabilidade) já achou bug real
  aqui uma vez (`lfGetActivitiesFor`, função que nunca existiu, usada
  em 2 lugares).
- Antes de "só ajustar um número" (como um TTL), buscar em **todo o
  projeto** se existe uma segunda implementação da mesma coisa — não
  assumir que só tem uma. O comando usado pra achar a duplicação
  citada acima está documentado em
  `docs/relatorios-historico/RELATORIO-ARQUITETURA-DUPLICATAS-CI-TESTES-20260911.md`.
- Qualquer mudança nestes arquivos já tem teste automatizado rodando
  no CI (`.github/workflows/ci.yml`) — mas a cobertura ainda é
  parcial; um teste passando não significa "sem risco nenhum",
  significa "não quebrou o que já sabíamos testar".
