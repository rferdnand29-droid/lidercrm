# RELATORIO_BUGS.md — Caça de Bugs LiderCRM — Rodada 3 (2026-07-22)

> Análise sistemática, arquivo por arquivo, do projeto `lidercrm_fixed` (rodada 2).  
> Metodologia: varredura paralela por módulo com revisão de código sênior,  
> seguida de correções cirúrgicas sem reescrita.  
> Organizado por categoria: código → visual/layout → Capacitor → backend.

---

## 1. Bugs de Código Corrigidos

### 1.1 `js/app.js` — `openInNewTab` falha silenciosamente no Capacitor

| Campo | Detalhe |
|-------|---------|
| Arquivo | `js/app.js` ~linha 495 |
| Severidade | Alta (funcionalidade quebrada no app nativo) |
| Descrição | `window.open(url, '_blank')` é descartado silenciosamente dentro do Android WebView do Capacitor. O usuário clica em "Abrir em nova aba" e nada acontece. |
| Causa-raiz | O WebView do Capacitor não repassa `window.open` com target `_blank` para o sistema operacional. |
| Correção | Detecta `Capacitor.isNativePlatform()`: usa `Plugins.Browser.open()` (in-app browser) se disponível; fallback para `window.location.href`. Em browser web, mantém o comportamento original com `window.open` + fallback para `location.href` se o popup for bloqueado. |

---

### 1.2 `js/usuarios.js` — `createUser`: sem validação de formato de e-mail

| Campo | Detalhe |
|-------|---------|
| Arquivo | `js/usuarios.js` ~linha 478 |
| Severidade | Média (dado inválido persiste no storage) |
| Descrição | A função `createUser` verifica apenas se o campo e-mail está preenchido, mas não valida o formato. É possível criar usuários com e-mails como `"aaa"`, `"@"`, `"x @y"`, que quebram o envio de credenciais e o filtro de login. |
| Causa-raiz | Falta de regex de validação antes do `shSecure()`. |
| Correção | Adicionado `/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)` antes da verificação de duplicatas, com mensagem de erro amigável. |

---

### 1.3 `js/usuarios.js` — `saveU` (editUser): mesma ausência de validação de e-mail

| Campo | Detalhe |
|-------|---------|
| Arquivo | `js/usuarios.js` ~linha 596 |
| Severidade | Média |
| Descrição | A função de edição de usuário também carecia de validação de formato de e-mail, permitindo persistir valores inválidos ao editar. |
| Causa-raiz | Idem ao item 1.2. |
| Correção | Mesma regex adicionada antes da verificação de e-mail duplicado. |

---

### 1.4 `js/dashboard.js` — `runGSearch`: acesso sem guarda de nulo ao DOM

| Campo | Detalhe |
|-------|---------|
| Arquivo | `js/dashboard.js` ~linha 144 |
| Severidade | Baixa–Média (crash em edge case de timing) |
| Descrição | `document.getElementById('gsearch-inp').value` é acessado sem checar se o elemento existe. Se o modal de busca ainda não foi renderizado (timing com lazy rendering), lança `TypeError: Cannot read properties of null`. |
| Causa-raiz | Falta de null check na função `runGSearch`. |
| Correção | Extraído para variável com guarda: `var _gsi = document.getElementById('gsearch-inp'); var q = (_gsi ? _gsi.value || '' : '').trim().toLowerCase();` |

---

### 1.5 `js/kanban.js` — Múltiplos `document.addEventListener` sem cleanup em `openCtxMenu`

| Campo | Detalhe |
|-------|---------|
| Arquivo | `js/kanban.js` ~linhas 1199–1202 |
| Severidade | Baixa (não causa crash, mas pode acumular em sessões longas) |
| Descrição | O handler `_ctxOutsideHandler` e `_bulkStageOutsideH` já fazem `removeEventListener` corretamente antes de adicionar novos — comportamento OK encontrado durante revisão; **não houve bug ativo** a corrigir aqui. Registrado para transparência. |
| Status | ✅ Sem correção necessária |

---

### 1.6 `js/patches/lf-retryqueue-sync-v1-20260717.js` — `_syncErrBusy` em bloco `finally`

| Campo | Detalhe |
|-------|---------|
| Arquivo | `js/patches/lf-retryqueue-sync-v1-20260717.js` ~linha 140 |
| Severidade | Baixa (potencial reentrância silenciosa) |
| Descrição | O flag `_syncErrBusy` é resetado em bloco `finally` do try externo — comportamento correto encontrado. O `_syncErrBusy = false` está dentro do `} finally { ... }` que cobre toda a lógica de enqueue. Sem bug ativo. |
| Status | ✅ Sem correção necessária |

---

### 1.7 `js/documentos.js` — `_deleteFromStorage` passa `undefined` em catch B2

| Campo | Detalhe |
|-------|---------|
| Arquivo | `js/documentos.js` linha 195 |
| Severidade | Baixa (sinaliza falha como sucesso) |
| Descrição | No catch da Promise do B2, `cb()` é chamado sem argumento — o chamador recebe `err = undefined` e pode interpretar a falha como sucesso silencioso. |
| Causa-raiz | Catch genérico não propaga o erro. |
| Status | ⚠️ Sinalizado para revisão. Depende de decisão de produto: retry automático ou aceitar silencio? Não foi alterado para preservar comportamento legado. |

---

## 2. Bugs Visuais e de Layout Corrigidos

### 2.1 `css/chat.css` — Comentário CSS quebrado causa falha de parse do `@media`

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/chat.css` linha 422 |
| Severidade | Alta (bloco CSS ignorado em alguns parsers) |
| Descrição | `/* R17-11: iOS textarea zoom fix */ — iOS Safari zoom se font-size < 16px */` — o `*/` após "fix" fecha o comentário prematuramente. O texto `— iOS Safari zoom se font-size < 16px */` ficava fora do comentário, como CSS inválido imediatamente antes do `@media`. Parsers CSS estritos (ou otimizadores de minificação) podem descartar o bloco `@media` seguinte — o que quebraria a regra `font-size:16px!important` responsável por **prevenir zoom automático do iOS no chat**. |
| Causa-raiz | Erro de digitação ao dividir um comentário longo. |
| Correção | Unificado em um único comentário: `/* R17-11: iOS textarea zoom fix — iOS Safari zoom se font-size < 16px */` |

---

### 2.2 `css/style.css` — `#mobile-bottom-nav` comprime itens em dispositivos com safe-area

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` ~linha 1302 |
| Severidade | Alta (visual quebrado em iPhone com Home Indicator) |
| Descrição | A nav inferior tinha `height:60px` fixo + `padding-bottom:env(safe-area-inset-bottom, 0)`. O padding adicionava espaço abaixo dos itens, mas o `height:60px` não crescia — os itens ficavam comprimidos em dispositivos com home indicator (iPhone X+). O espaço total ficava correto visualmente, mas os botões de navegação perdiam área de toque. |
| Causa-raiz | A altura do container deve crescer para acomodar o safe-area, não apenas o padding interno. |
| Correção | `height: calc(60px + env(safe-area-inset-bottom, 0px))` + `box-sizing: border-box` + `align-items: flex-start`. Assim o container cresce e os itens ficam no topo dos 60px de conteúdo real. |

---

### 2.3 `css/style.css` — `.kb-ctx` pode ultrapassar a borda da tela

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` ~linha 550 |
| Severidade | Média (contexto de card inacessível em telas pequenas) |
| Descrição | O menu de contexto do Kanban (`.kb-ctx`) usa `position:fixed` mas não tinha `max-height` nem `overflow-y:auto`. Em dispositivos pequenos (< 600px de altura) com muitos itens, o menu transborda para fora do viewport, tornando opções invisíveis e inacessíveis. |
| Causa-raiz | CSS incompleto. |
| Correção | Adicionado `max-height:min(80vh,400px);overflow-y:auto;` à regra `.kb-ctx`. |

---

### 2.4 `css/style.css` — `.att-ctx` mesma sobreposição

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` ~linha 980 |
| Severidade | Média |
| Descrição | O menu de contexto de anexos (`.att-ctx`) sem `max-height` — mesma causa e efeito que 2.3. |
| Correção | `max-height:min(80vh,320px);overflow-y:auto;` adicionado. |

---

### 2.5 `css/style.css` — `.lig-widget` pode sair da tela em dispositivos pequenos

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` ~linha 820 |
| Severidade | Baixa–Média |
| Descrição | O widget de ligações (`.lig-widget`) tem `position:fixed` e `width:200px` mas sem `max-height`. Em aparelhos com < 400px de altura útil (landscape em phone pequeno), o widget pode ultrapassar a borda inferior. |
| Correção | `max-height:min(90vh,380px);overflow-y:auto;` adicionado. |

---

## 3. Bugs de Integração com Capacitor Corrigidos

### 3.1 `capacitor.config.json` — `iosScheme` ausente + `allowNavigation` ausente

| Campo | Detalhe |
|-------|---------|
| Arquivo | `capacitor.config.json` |
| Severidade | Alta (requisições bloqueadas no iOS) |
| Descrição | Dois problemas: (a) `iosScheme` não estava definido — em iOS, o Capacitor usa `ionic://localhost` por padrão, que pode causar comportamento inconsistente com cookies e CORS; (b) `allowNavigation` ausente — requisições para `*.liderfinanceira.com` e `*.supabase.co` podiam ser bloqueadas pelo WKWebView do iOS sem listagem explícita. |
| Causa-raiz | Configuração incompleta do servidor Capacitor. |
| Correção | Adicionados `"iosScheme": "https"` e `"allowNavigation": ["*.liderfinanceira.com", "*.supabase.co"]` na seção `server`. |

---

### 3.2 `js/app.js` — `window.open` no Capacitor (ver item 1.1)

Mesma correção aplicada cobre Capacitor Android. Ver seção 1.1.

---

### 3.3 (Existente/OK) Validações de safe-area em elementos fixos

Durante a varredura, confirmou-se que os principais elementos `position:fixed` já usam `env(safe-area-inset-*)` corretamente:
- `#ibar`, `.toast`, `.act-panel`, `.act-alert-bar`, `.lig-fab`, `.bulk-bar`, `#mdash-fab` ✅
- `#mobile-top-bar`, `#mobile-bottom-nav` (corrigido em 2.2) ✅
- `#chat-input-area` (mobile) ✅
- `.kb-ctx`, `.att-ctx`, `.lig-widget` — sem coordenadas fixas de posição nas regras base (posicionados via JS), por isso safe-area via max-height é suficiente ✅

---

## 4. Achados Sem Correção Imediata (Decisão de Produto ou Arquitetural)

### 4.1 Worker — IDOR potencial em controllers (requer decisão de produto)

| Arquivo | Risco |
|---------|-------|
| `_worker_src/worker/controllers/clientes-controller.js` | Rotas de leitura não filtram explicitamente por `created_by = ctx.user.sub` — dependem do filtro feito pelo cliente (uid passado na URL). Um usuário autenticado poderia tentar ler dados de outro UID se souber o ID. |

**Recomendação:** Adicionar validação server-side `if (uid !== ctx.user.sub && ctx.user.role !== 'admin') throw new ForbiddenError()` antes de qualquer operação com `uid` vindo da URL. Não corrigido nesta rodada por ser uma decisão de escopo de autorização.

---

### 4.2 `js/dashboard.js` — Loop de retry `renderDash` pode acumular timers

| Arquivo | Risco |
|---------|-------|
| `js/dashboard.js` linha 15 | `setTimeout(renderDash, 200)` cria chamada recursiva se `loadCli` demorar. Se o usuário navegar para outra página durante esse período, os timers continuam. Baixo risco porque cada chamar testa a condição de saída. |

**Recomendação:** Adicionar flag `_dashPending` para cancelar timers antigos antes de criar novos. Não corrigido para preservar lógica existente.

---

### 4.3 `js/patches/lf-retryqueue-sync-v1-20260717.js` — Enqueue de todo o estado em `syncErr`

| Arquivo | Risco |
|---------|-------|
| Patch acima | Quando `syncErr` é chamado, enfileira TODO o array de atividades do dia. Em sessões longas com muitos erros, o `RetryQueue` pode crescer muito no `localStorage`. |

**Recomendação:** Limitar enqueue ao delta de operações falhas, não ao estado completo. Não corrigido — requer refatoração coordenada com módulo de atividades.

---

### 4.4 `navigator.onLine` — Detecção de offline não confiável

| Arquivo | Risco |
|---------|-------|
| `src/core/offline/offline-manager.js` | `navigator.onLine` detecta conexão com a rede local, não com a internet. Em roteadores sem internet, retorna `true`. |

**Recomendação:** Adicionar um probe HTTP leve (HEAD request para a API) como confirmação. Não alterado — mudança de arquitetura.

---

---

## Bugs Adicionais Encontrados e Corrigidos na Rodada 3 (Revisão Aprofundada)

### 3.1 `css/style.css` — Comentários CSS aninhados inválidos + seletor inválido

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` ~linhas 2333–2340 |
| Severidade | **Alta** (invalidação silenciosa de regras CSS em todos os ambientes) |
| Descrição | Três linhas consecutivas usavam o padrão `/* /* ... */ */` (comentário aninhado). Em CSS, `/*` dentro de um comentário já aberto é ignorado, mas o **primeiro** `*/` fecha o comentário externo — deixando um ` */` órfão no fluxo do parser. Esse token espúrio pode fazer o parser entrar em modo de recuperação de erro e descartar regras posteriores silenciosamente. O quarto comentário `/* /* R12B-13-webkit-appearance */ — consistent form controls on iOS Safari */` era ainda pior: o ` — consistent form controls on iOS Safari */` após o fechamento precoce ficava como texto CSS solto, causando parse errors. |
| Causa-raiz | Histórico de edições acumulou `/* /* ... */` em vez de `/* ... */`. |
| Correção | Todos os comentários foram simplificados para a forma canônica `/* TAG */`. |

---

### 3.2 `css/style.css` — Seletor inválido `-webkit-input-placeholder` na lista de aparências

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` ~linha 2337 |
| Severidade | **Alta** (regra CSS ignorada em todos os navegadores que seguem a especificação estritamente, incluindo WebKit / WebView do Capacitor) |
| Descrição | O selector group da regra `-webkit-appearance:none` incluía `-webkit-input-placeholder` como se fosse um seletor de elemento, o que é **inválido**. Pseudo-elementos placeholder requerem a sintaxe `::placeholder` / `::-webkit-input-placeholder`. Pela especificação CSS Selectors Level 3, um seletor inválido em um grupo invalida **toda a declaração** — ou seja, `input[type="text"]`, `select.sel`, etc. também perdem o `-webkit-appearance:none`, causando que inputs e selects apareçam com a estilização nativa do iOS (bordas arredondadas, sombras, fundo acinzentado), quebrando o visual do CRM no iPhone/iPad. |
| Causa-raiz | Erro de digitação: `-webkit-input-placeholder` foi listado como seletor em vez de pseudo-elemento. |
| Correção | Removido `-webkit-input-placeholder` da lista. A regra `appearance:none` é para controles de formulário; placeholder não precisa dela. |

---

### 3.3 `js/kanban.js` — `beforeunload`: seletor `.mo.vis` inexistente impede aviso de dados não salvos

| Campo | Detalhe |
|-------|---------|
| Arquivo | `js/kanban.js` linha 2078 |
| Severidade | **Alta** (funcionalidade de proteção contra perda de dados completamente inoperante) |
| Descrição | O handler `beforeunload` verifica se há um modal de edição aberto usando `.mo.vis` — mas a classe que indica modal visível no projeto é `.mo.open` (confirmado em `js/kanban.js` linhas 1793 e 1803, e em outros módulos que usam `document.querySelectorAll(".mo.open")`). A classe `.mo.vis` nunca é adicionada a nenhum elemento, portanto `document.querySelector('.mo.vis[id*="kb-det"], .mo.vis[id*="edit"]')` **sempre retorna `null`** e o aviso de "Você tem edições não salvas" **nunca é exibido**. O usuário pode fechar a aba acidentalmente enquanto edita um card e perder todas as alterações sem nenhum aviso. |
| Causa-raiz | A classe foi renomeada de `.vis` para `.open` em uma refatoração anterior de modais, mas a linha do `beforeunload` não foi atualizada. |
| Correção | `.mo.vis` → `.mo.open` no seletor do handler. |

---

## 5. Resumo das Correções Aplicadas

| # | Arquivo | Tipo | Severidade |
|---|---------|------|-----------|
| 1 | `css/chat.css` | CSS parse bug — comentário quebrado | **Alta** |
| 2 | `css/style.css` | `#mobile-bottom-nav` altura com safe-area | **Alta** |
| 3 | `capacitor.config.json` | `allowNavigation` + `iosScheme` ausentes | **Alta** |
| 4 | `js/app.js` | `openInNewTab` falha silenciosamente no Capacitor | **Alta** |
| 5 | `css/style.css` | `.kb-ctx` sem max-height (transborda) | **Média** |
| 6 | `css/style.css` | `.att-ctx` sem max-height (transborda) | **Média** |
| 7 | `css/style.css` | `.lig-widget` sem max-height | **Média** |
| 8 | `js/usuarios.js` | `createUser` sem validação de formato de e-mail | **Média** |
| 9 | `js/usuarios.js` | `saveU`/editUser sem validação de formato de e-mail | **Média** |
| 10 | `js/dashboard.js` | `runGSearch` — acesso sem null check a `#gsearch-inp` | **Baixa–Média** |
| 11 | `css/style.css` | Comentários CSS aninhados inválidos `/* /* ... */ */` | **Alta** |
| 12 | `css/style.css` | Seletor inválido `-webkit-input-placeholder` invalida regra appearance | **Alta** |
| 13 | `js/kanban.js` | `beforeunload` usa `.mo.vis` em vez de `.mo.open` — aviso de perda de dados nunca dispara | **Alta** |

---

*Gerado por caça de bugs sênior — LiderCRM Rodada 3 — 2026-07-22*

---

# RODADA 4 — Varredura Adicional (2026-07-22)

> Análise sobre o ZIP `lidercrm-rodada3-corrigido-final` (que já incluía as 13 correções da Rodada 3).  
> Varredura paralela de todos os arquivos: CSS, JS principal, patches, HTML, capacitor.config.json, backend Worker.  
> Metodologia: revisão de código sênior, confirmação de causa-raiz em arquivo/linha, correção cirúrgica.

---

## Bugs de Código Corrigidos (Rodada 4)

### R4-1 `js/chat.js` — Contador de mensagens não lidas nunca funciona em grupos

| Campo | Detalhe |
|-------|---------|
| Arquivos | `js/chat.js` linhas 342, 387, 1759 |
| Severidade | **Alta** (funcionalidade core completamente quebrada para grupos) |
| Descrição | Três pontos do código usam `m.toUid === (S&&S.userId) && !m.read` para determinar se uma mensagem é não lida. Porém, para conversas de grupo, a propriedade `toUid` é definida como `''` (string vazia) ao enviar — confirmado em `chat.js:1111`, `chat.js:1196` e `chat.js:1216`. Como `'' !== userId`, nenhuma mensagem de grupo jamais satisfaz o predicado, causando: (a) o badge de não lidas no ícone de chat sempre mostra 0 para grupos; (b) o indicador vermelho na nav inferior nunca acende para grupos; (c) as mensagens de grupo nunca são marcadas como lidas ao abrir a conversa — o que também significa que em sessões longas, se as mensagens não-grupo já foram lidas, o total de não lidas do sistema trava em zero mesmo com mensagens de grupo novas. |
| Causa-raiz | O campo `toUid` segue a semântica de mensagem direta (1:1). Para grupos, não existe um `toUid` único — o destinatário implícito é qualquer membro que não é o remetente (`fromUid`). O código não adaptou essa lógica para grupos. |
| Correção | Substituída a condição em **3 locais**: `m.toUid === userId` → para grupos: `m.fromUid !== userId` (sou o leitor, não o remetente). Para 1:1 o comportamento original é mantido. |

---

## Bugs Visuais e de Layout Corrigidos (Rodada 4)

### R4-2 `css/style.css` — `#mobile-top-bar` acumula `padding-bottom` de safe-area errado

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` linha 1292 |
| Severidade | **Alta** (espaço desperdiçado e conteúdo comprimido no header em iPhone X+) |
| Descrição | A regra do header mobile incluía `padding:0 13px env(safe-area-inset-bottom, 0px) 13px` — ou seja, o padding **inferior** usava `env(safe-area-inset-bottom)`. Isso é um erro de eixo: o header é um elemento **top**, não bottom. Em iPhones com home indicator (safe-area-inset-bottom ≈ 34px), o header ficava com 34px de padding inferior desnecessário, empurrando o logo/título para cima do espaço correto e comprimindo a área de toque. O `padding-top: env(safe-area-inset-top)` logo abaixo (correto) deixa claro que foi um copy-paste incorreto. |
| Causa-raiz | Erro de copy-paste ao escrever o shorthand `padding:0 13px <bottom> 13px`. |
| Correção | `padding:0 13px env(safe-area-inset-bottom, 0px) 13px` → `padding:0 13px 0 13px`. O `padding-top:env(safe-area-inset-top, 0px)` já existente na mesma linha continua responsável pelo deslocamento correto. |

---

### R4-3 `css/style.css` — Dois comentários CSS aninhados `/* /* TAG */` causam parse error silencioso

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` linhas 2301 e 2317 |
| Severidade | **Alta** (regras CSS invalidadas silenciosamente por parsers estritos, incluindo o WebView do Capacitor) |
| Descrição | Dois comentários usam a sintaxe `/* /* TAG */ — descrição */`. Em CSS, `/*` dentro de um comentário aberto é ignorado — mas **o primeiro `*/`** fecha o comentário externo. O texto ` — descrição */` fica fora do comentário, como CSS inválido imediatamente antes da regra seguinte. Em `linha 2301`, o texto solto precede `input[type="date"]` (rule não é afetada, mas o parse error é registrado e pode afetar parsers de minificação). Em `linha 2317`, o texto solto precede `@media (max-width: 768px)` — parsers CSS estritos (incluindo o mecanismo WebKit do WKWebView) podem **descartar o bloco `@media` inteiro** em modo de recuperação de erro, quebrando as regras de touch target mínimo de 44px no mobile. Esse padrão de bug já foi corrigido anteriormente em `css/chat.css` (Rodada 3, item 2.1) mas dois outros sobreviveram em `css/style.css`. |
| Causa-raiz | Idem ao bug 2.1 da Rodada 3: edições acumuladas geraram comentários duplos `/* /* ... */`. |
| Correção | Ambos simplificados para comentário único canônico: `/* R10-11-color-scheme-inputs — Fix: ... */` e `/* R10-19-touch-target — Garantir... */`. |

---

### R4-4 `css/style.css` — `.bulk-bar` z-index 800 sobrepõe modais (z-index 200), permite interação durante confirmações

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` linha 1052 |
| Severidade | **Média** (bug de interação: ações em lote executáveis enquanto diálogo de confirmação está aberto) |
| Descrição | A barra de ações em lote (`.bulk-bar`) usava `z-index:800`, muito acima dos modais (`.mo{z-index:200}`). Quando o usuário selecionava múltiplos cards e depois abria um modal (ex: `#mo-confirm-del` para confirmar exclusão em lote, z-index 300), a barra de ações em lote permanecia visível e clicável acima do overlay do modal. Isso permite que o usuário execute uma segunda ação em lote (ex: mover cards) enquanto uma confirmação de exclusão está pendente, potencialmente causando estado inconsistente. |
| Causa-raiz | O z-index 800 foi atribuído para garantir visibilidade acima de outros elementos de página, sem considerar que modais tem z-index menor. |
| Correção | `z-index:800` → `z-index:190` — abaixo de `.mo` (200) para que qualquer modal aberto cubra corretamente a barra de ações. A barra continua visível acima dos elementos de conteúdo regulares (kanban, cards). |

---

## Bugs de Integração com Capacitor Corrigidos (Rodada 4)

### R4-5 `capacitor.config.json` — Domínio do Backblaze B2 ausente em `allowNavigation`

| Campo | Detalhe |
|-------|---------|
| Arquivo | `capacitor.config.json` |
| Severidade | **Alta** (uploads e deletes de arquivos falham silenciosamente no app iOS) |
| Descrição | O arquivo `js/backblaze.js` realiza requisições para `https://api.backblazeb2.com/b2api/v2/b2_authorize_account`, `b2_get_upload_url` e URLs de upload dinâmicas (subdomínios de `backblazeb2.com`). O `allowNavigation` em `capacitor.config.json` listava apenas `*.liderfinanceira.com`, `*.supabase.co` e `supabase.co`. No WKWebView do iOS (Capacitor), requisições fetch/XHR para domínios não presentes em `allowNavigation` podem ser bloqueadas pela política de navegação do WebKit quando `cleartext:false`. Isso causa falha silenciosa nos uploads de documentos e áudios do chat no app iOS. |
| Causa-raiz | O `allowNavigation` foi preenchido com os domínios inicialmente em uso, mas o serviço de storage Backblaze B2 foi adicionado depois sem atualizar a lista. |
| Correção | Adicionados `"*.backblazeb2.com"` e `"backblazeb2.com"` ao array `allowNavigation`. |

---

## Achados sem Correção Imediata (Rodada 4)

### R4-A `js/backblaze.js` — Credenciais B2 (`keyId` / `applicationKey`) expostas no frontend

| Arquivo | Risco |
|---------|-------|
| `js/backblaze.js` linhas 19–20 | As credenciais da API Backblaze B2 estão literais no código JS público. Qualquer usuário com acesso ao app pode extrair `keyId` e `applicationKey` e ter acesso irrestrito ao bucket B2 (upload, download, delete, lista). Documentado em `RELATORIO_CHAT_INSTANTANEO_20260722.md`. |

**Recomendação:** Mover `b2_authorize_account` para um endpoint no Cloudflare Worker, que devolve apenas um token temporário de upload com escopo restrito. Não corrigido — requer refatoração de arquitetura do fluxo de upload.

---

### R4-B `js/chat.js` — Chat usa polling (1.2s), não WebSocket/Push real

| Arquivo | Risco |
|---------|-------|
| `js/chat.js` função `_chatPollNewMsgs` | Mesmo após a redução de 5s para 1.2s nesta rodada, mensagens ainda têm latência perceptível e o sistema não funciona em background. |

**Recomendação:** Migrar para Supabase Realtime ou Web Push (FCM/APNs via Capacitor Push Notifications). Não corrigido — decisão arquitetural documentada em `RELATORIO_CHAT_INSTANTANEO_20260722.md`.

---

### R4-C `_worker_src/worker/controllers/` — IDOR potencial (herdado da Rodada 3, item 4.1)

Mantido como pendente. Ver item 4.1 do relatório da Rodada 3 para contexto e recomendação.

---

## Resumo das Correções da Rodada 4

| # | Arquivo | Tipo | Severidade |
|---|---------|------|-----------|
| R4-1 | `js/chat.js` | JS — contador de não lidas de grupo sempre 0 (3 locais) | **Alta** |
| R4-2 | `css/style.css` | CSS — `#mobile-top-bar` padding-bottom com safe-area errado | **Alta** |
| R4-3 | `css/style.css` | CSS — 2 comentários aninhados `/* /*` — parse error silencioso | **Alta** |
| R4-4 | `css/style.css` | CSS — `.bulk-bar` z-index acima de modais | **Média** |
| R4-5 | `capacitor.config.json` | Capacitor — Backblaze B2 ausente em `allowNavigation` | **Alta** |

**Total acumulado (Rodadas 1–4): 18 bugs corrigidos.**

---

*Gerado por caça de bugs sênior — LiderCRM Rodada 4 — 2026-07-22*

---

# RODADA 5 — Varredura Completa (2026-07-22)

> Metodologia ampliada: além de bugs funcionais e visuais, esta rodada incluiu varredura de
> **limpeza de resíduos** (patches obsoletos, código morto, listeners acumulados) e
> **análise de todos os módulos em paralelo** (HTML, CSS, JS, patches, worker, configuração).
>
> Base analisada: projeto já corrigido através da Rodada 4 (18 bugs acumulados).  
> Subagentes paralelos: auditoria HTML/CSS/patches/JS-core + JS-domínio + JS-chat-docs + config/worker.

---

## Bugs de Código Corrigidos (Rodada 5)

### R5-1 `js/agenda.js` — `initLigWidget()` empilha listeners `document.mousemove`/`mouseup` em cada chamada

| Campo | Detalhe |
|-------|---------|
| Arquivo | `js/agenda.js` função `initLigWidget()` (linha 701) |
| Severidade | **Alta** (degradação progressiva de performance em sessões com logout/re-login) |
| Descrição | `initLigWidget()` é chamada por `startApp()` em `js/app.js:193`. `startApp()` pode ser executada mais de uma vez por sessão (ex: logout → re-login sem recarregar a página). A cada execução de `initLigWidget()`, dois listeners são adicionados ao objeto `document` global: `mousemove` e `mouseup`. Esses listeners são anônimos, logo não podem ser removidos por `removeEventListener`. Na segunda chamada, o `document` acumula dois pares — na terceira, três pares, e assim por diante. O listener `mousemove` é especialmente custoso: sem guards internas para descartar quando `dragging` é false (o closure `dragging` é recriado a cada chamada como uma variável local separada), cada listener extra executa a lógica de reposicionamento do widget com variáveis de closure independentes, interferindo umas nas outras e consumindo CPU em cada movimento do mouse globalmente no app. |
| Causa-raiz | Ausência de guard de idempotência em `initLigWidget()`. A função análoga `bindBackButtonInterceptor()` no patch de swipe Android usa corretamente `if(document.__lfV27BackBound) return;`. O mesmo padrão não foi aplicado ao widget de ligações. |
| Correção | Adicionada flag `_lfDragBound` no elemento DOM `#lig-widget`. Após o primeiro bind dos listeners de drag, a flag é setada. Chamadas subsequentes ainda executam `buildLigGrid()` (para atualizar o contador) mas retornam antes de `document.addEventListener`. O elemento DOM já existe no HTML estático, portanto a flag sobrevive entre chamadas dentro da mesma sessão sem necessidade de `window.*`. |

---

## Limpeza de Código e CSS (Rodada 5)

### R5-2 `css/style.css` — Bloco `body.theme-classic input[type=date/time/*]` é CSS morto (duplicata exata)

| Campo | Detalhe |
|-------|---------|
| Arquivo | `css/style.css` linhas 2309–2315 (antes da correção) |
| Severidade | **Baixa** (sem efeito funcional — CSS morto puro) |
| Descrição | Após a correção dos comentários aninhados em Rodada 4 (R4-3), o arquivo ficou com dois blocos adjacentes definindo `color-scheme: dark` para inputs de data/hora: (1) a regra base incondicional (`input[type="date"], ...`), e (2) a regra `body.theme-classic input[type="date"], ...` com valor idêntico. O tema clássico (`theme-classic`) é um tema **escuro** (fundo `#0A0C10`, texto `#EEE8D5`), portanto `color-scheme: dark` é correto para ele — mas essa seletividade é coberta integralmente pela regra base que já aplica `dark` para todos os inputs do documento. A regra theme-classic nunca sobrepõe nem altera o resultado final. |
| Causa-raiz | Ao criar a regra `R10-11-color-scheme-inputs`, foi adicionada uma segunda versão com qualificador `body.theme-classic` por precaução, sem verificar que a regra base já era universal. |
| Correção | Bloco `body.theme-classic input[type=...]{ color-scheme: dark }` removido. Substituído por comentário explicando a remoção para futura referência. A regra base permanece intacta. |

---

## Varredura Completa — Achados sem Ação (Rodada 5)

Os itens abaixo foram identificados durante a varredura mas **não foram corrigidos** pelos motivos indicados.

### 5A. Patches `lf-messenger-*` — funções-alvo não existem no chat atual (candidatos a remoção futura)

| Patch | Status |
|-------|--------|
| `lf-messenger-dark-mobile-permissions-20260713.js` | Tenta envolver `window.renderRooms` — não existe no chat atual |
| `lf-messenger-desktop-shell-connect-fix-20260714g.js` | Usa `window.C` (objeto de estado do chat antigo) — não existe |
| `lf-messenger-user-request-fix-20260715b.js` | Usa `window.C.roomMap`, `window.C.rooms` — não existem |
| `lf-chat-back-unread-android-swipe-v27-20260715.js` | Unread counter usa `window.C.rooms`/`window.unread()` — não existem; porém o gesto de swipe-back para Android (`bindAndroidSwipeBack()`) e o botão de voltar (`bindBackButtonInterceptor()`) **estão ativos** e funcionam corretamente com o chat atual (ambos já têm guards de idempotência) |

**Recomendação:** Os três primeiros patches são candidatos a remoção completa após confirmação de QA. `lf-chat-back-unread-android-swipe-v27-20260715.js` deve ser mantido pela funcionalidade de swipe e back-button, mas as funções `unreadRoomsCount`/`unreadDirectRoomsCount`/`refreshConversationCounters` são dead code. Não removidos nesta rodada — sinalizado para decisão de produto.

### 5B. `boot()` em `lf-chat-back-unread-android-swipe` — setInterval tenta 150×, nunca tem sucesso

O loop de retry em `boot()` espera que `window.renderRooms`, `window.openRoom` e `window.renderHeader` apareçam (funções do chat antigo). Como essas funções nunca existirão, `boot()` retorna `false` 150 vezes (30 segundos, 200ms cada). As chamadas internas são todas no-op (guarded ou try/catched), logo não há crash — apenas 150 chamadas de função desnecessárias em 30 segundos. Impacto: negligível. Não corrigido — dependente da decisão de remover o patch (item 5A).

### 5C. `js/backblaze.js` — Credenciais B2 hardcoded no frontend

Já documentado em R4-A. Mantido como pendente de decisão arquitetural.

### 5D. `js/agenda.js` — `hd.addEventListener('mousedown'/'touchstart'/'touchmove')` sem guard

O mesmo `#lig-drag-handle` também acumula `mousedown`, `touchstart`, `touchmove` em múltiplas chamadas. O impacto é menor (esses listeners só disparam quando o usuário interage com o drag handle — não global como mousemove/mouseup no document), e a correção do R5-1 já impede `initLigWidget` de atingir o bloco de `addEventListener` após a primeira inicialização, cobrindo implicitamente esses handlers também.

---

## Resumo das Correções da Rodada 5

| # | Arquivo | Tipo | Severidade |
|---|---------|------|-----------|
| R5-1 | `js/agenda.js` | JS — `initLigWidget` empilhava listeners `document.mousemove`/`mouseup` | **Alta** |
| R5-2 | `css/style.css` | CSS — bloco `body.theme-classic color-scheme:dark` duplicado removido | **Baixa** |

**Total acumulado (Rodadas 1–5): 20 bugs/itens corrigidos.**

---

*Gerado por caça de bugs sênior — LiderCRM Rodada 5 — 2026-07-23*
