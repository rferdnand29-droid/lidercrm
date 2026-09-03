# Hotfix — 3 erros de console (20260804)

**Escopo:** exclusivamente aditivo. Nenhum arquivo-core (`chat.js`,
`app.js`, `leads.js`, `kanban.js`, `index.html`/`app.html` na parte
lógica) foi modificado. Apenas 3 arquivos JS novos e 3 tags `<script>`
adicionadas ao `index.html`/`app.html` (bloco de patches já
existente). Reverter = remover apenas as tags novas.

---

## Erros observados

```
(índice):382                                   [safety-net] forçando saída da splash após 12s
lf-fix-lead-refresh-retornar-v1-20260803.js:14 [lf-fix-lead-refresh] nenhuma função de navegação encontrada após 40 tentativas — o listener de botões ainda está ativo como fallback
chat.js?v=20260731_chatfix1:2385               [chat] Presence erro ao iniciar: cannot add `presence` callbacks for realtime:chat-presence after `subscribe()`.
```

---

## Erro 3 (o real bug) — Presence double-subscribe

### Causa-raiz
`_chatStartPresence()` em `chat.js` é chamada mais de uma vez na mesma
sessão do Realtime:

1. Primeira chamada cria o canal `chat-presence`, registra
   `.on('presence', 'sync'|'join'|'leave', …)` e invoca `.subscribe()`.
2. Uma segunda chamada (retry de 3s de `_chatPresenceWarnedNoSb`,
   reabertura do chat, `visibilitychange`, `resume` mobile, etc.) entra
   novamente no `try{}`. O guard `if(_chatPresenceChannel) return;` só
   protege contra a **variável local**, mas o cliente Realtime do
   Supabase mantém canais por *topic* (`realtime:chat-presence`) em uma
   tabela global. Quando `_sb.channel('chat-presence', …)` reaproveita
   esse topic **depois** de já ter tido `.subscribe()`, o
   `.on('presence', …)` subsequente é rejeitado com aquela mensagem
   literal e o canal fica sem os handlers `sync/join/leave` — a bolinha
   de "online" nunca aparece pra ninguém.

### Correção — `js/patches/chat/lf-fix-chat-presence-double-subscribe-v1-20260804.js`

Faz três coisas, todas via monkey-patch:

- **Purge:** antes de rodar o `_chatStartPresence` original, chama
  `supabaseClient.getChannels()` e remove todo canal cujo `topic`
  seja `realtime:chat-presence`, além de zerar
  `window._chatPresenceChannel`.
- **Lock reentrante:** flag `_lock` bloqueia chamadas em cascata
  (retry de 3s + heartbeat 30s + resume) enquanto o `.subscribe()`
  em andamento não termina. Libera após 500 ms.
- **Wrap `_chatStopPresence`:** ao parar, também purga qualquer
  duplicata remanescente pra a próxima abertura ser 100 % limpa.

Idempotente, guardado por `__LF_FIX_CHAT_PRESENCE_DOUBLE_V1__`.
API pública `window.LF_FIX_CHAT_PRESENCE.purge()` para debug manual.

---

## Erro 2 — "nenhuma função de navegação encontrada após 40 tentativas"

### Causa-raiz
O patch `lf-fix-lead-refresh-retornar-v1-20260803.js` procura por nomes
como `goBack`, `voltar`, `showLeads`, `renderLeadsView`,
`closeLeadDetail` em `window`. No build atual (rev. atual do
`app.html`), a navegação é **exclusivamente** feita por
`goPage(p)` (definida em `js/app.js:426`) e o detalhe/close pelas
funções `openKBDet` / `closeM('mo-kb-det')`. Nenhum dos nomes que o
patch procura existe em `window` → cai no fallback, loga o warn.

O fallback do listener de botões continua ativo, então o comportamento
funcional ainda está OK — mas o warn é ruído e o *wrapper de
navegação* dele (que marca cache stale ao sair da view de leads) fica
inativo.

### Correção — `js/patches/leads/lf-fix-lead-refresh-nav-aliases-v1-20260804.js`

Registra aliases globais que resolvem em **runtime** (não no bind):

| Grupo | Aliases | Mapeia para |
|---|---|---|
| Navegar para leads | `showLeads`, `showLeadList`, `backToLeads`, `returnToLeads`, … | `goPage('leads')` |
| Render da lista | `renderLeads`, `_renderLeads`, `renderLeadList`, `renderLeadsView`, `loadLeads`, `fetchLeads`, … | `renderKB('leads')` (fallback `renderKBLocal('leads')`) |
| Fechar detalhe | `closeLeadDetail`, `closeDetail`, `hideLeadDetail`, `closeLead`, … | `closeM('mo-kb-det')` |
| Voltar genérico | `goBack`, `back`, `voltar`, `retornar`, `backToList`, … | `goPage(<página ativa detectada via .pg.on>)` |
| showView genérico | `showView`, `navigateTo`, `navigate`, `setView`, `goTo`, `openView`, … | `goPage(name)` |

Cada alias é marcado com `__lfAlias=true`, e o helper `_alias()`
**nunca sobrescreve** função real que apareça depois — apenas suas
próprias marcações. Idempotente, guardado por
`__LF_FIX_LEAD_REFRESH_NAV_ALIASES_V1__`.

### Ordem obrigatória de carregamento

O nav-aliases **precisa** carregar antes de
`lf-fix-lead-refresh-retornar-v1-20260803.js`, senão
`_wrapNavFunction()` não encontra os aliases e o warn volta.
Isso já está garantido na sequência do `index.html`/`app.html`:

```html
<script src="js/patches/lf-when-worker-auth-v1-20260804.js" defer></script>
<script src="js/patches/lf-bootstrap-fn-aliases-v1-20260804.js" defer></script>
<script src="js/patches/leads/lf-fix-lead-refresh-nav-aliases-v1-20260804.js" defer></script>  <!-- NOVO -->
<script src="js/patches/leads/lf-fix-lead-refresh-retornar-v1-20260803.js" defer></script>
```

---

## Erro 1 — safety-net disparando aos 12s

### Diagnóstico
`(índice):382` é o `setTimeout` do safety-net original (versão v15,
12 s web / 60 s Capacitor) declarado dentro do `<script>` inline do
`index.html`. Não é bug — é a rede de segurança contra splash
infinita. Ela só dispara se `initDB()` / `bootApp()` não terminarem
dentro do prazo, o que geralmente é consequência dos outros dois erros
(quando o Presence explode ou o Realtime derruba a chain, o boot pode
não fechar as promises antes dos 12 s).

Com os erros 2 e 3 resolvidos, este warn tende a sumir por si. Como
**não conseguimos comprovar isso sem rodar o app em produção**, foi
adicionado um patch de diagnóstico (não altera o timeout).

### Correção observacional — `js/patches/lf-fix-safety-net-diag-v1-20260804.js`

- Marca *breadcrumbs* nos marcos do boot (`initDB:start/ok/fail`,
  `bootApp:start/ok`, `doLogin:start/ok`, `usarLocal:start/ok`,
  `splash-hidden`, `window.onerror`, `unhandled-rejection`).
- Sobrescreve `console.warn` **só para** interceptar a mensagem
  `[safety-net] forçando saída da splash após …` e emitir logo depois
  um objeto com o snapshot:

  ```js
  {
    uptimeMs, hasSupabaseSdk, hasSupabaseCli, hasSession,
    onLine, lastErr, breadcrumbs: [...]
  }
  ```

  Todas as outras chamadas de `console.warn` passam intactas.
- API pública: `window.LF_SAFETYNET_DIAG.breadcrumbs()`.

Se o safety-net voltar a disparar depois dos hotfixes 2 e 3,
com este diagnóstico o próximo relatório terá o breadcrumb exato do
passo que travou o boot (rede, Supabase, patch subsequente, etc.).

---

## Arquivos adicionados

```
js/patches/chat/lf-fix-chat-presence-double-subscribe-v1-20260804.js   (5.4 KB)
js/patches/leads/lf-fix-lead-refresh-nav-aliases-v1-20260804.js        (5.8 KB)
js/patches/lf-fix-safety-net-diag-v1-20260804.js                       (5.4 KB)
```

## Arquivos alterados (apenas 3 tags <script> em cada)

```
index.html   (+3 tags — linhas 2643, 2679, 2686)
app.html     (+3 tags — linhas 2451, 2487, 2492)
```

Nenhum arquivo em `js/*.js` foi tocado. Nenhum arquivo em
`js/patches/*` já existente foi tocado. Reversão = deletar as 3 tags
novas em cada HTML (opcionalmente, deletar os 3 arquivos JS novos).

## Como validar em runtime

1. Abrir DevTools → Console e recarregar a página.
2. **Presence:** o warn `cannot add 'presence' callbacks …` **não**
   deve aparecer. Log esperado ao abrir o Chat:
   `[chat] Presence iniciado para <uid>` e, se houve reentrada,
   `[lf-fix-chat-presence] removidos N canais duplicados de
   realtime:chat-presence`.
3. **Lead refresh:** o warn `nenhuma função de navegação encontrada
   após 40 tentativas` **não** deve aparecer. Em `debug` do console:
   `[lf-fix-lead-refresh-nav-aliases] aliases registrados: N (goPage
   disponível: true)`.
4. **Safety-net:** com os outros dois corrigidos, o warn de 12s tende
   a não disparar em fluxo normal. Se ainda assim disparar em algum
   cenário, verá logo depois:
   `[lf-safetynet-diag] diagnóstico do boot: {…, breadcrumbs: […]}`
   e o último breadcrumb aponta a fase que travou.
