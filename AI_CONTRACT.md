# 🔒 AI_CONTRACT.md — Contrato obrigatório para QUALQUER IA (Genspark, Lovable, Cursor, Copilot, Claude)

> **LEIA-ME ANTES DE ESCREVER UMA ÚNICA LINHA.**
> Este arquivo é a "trava" do repositório. Se a IA não cumprir, o `pre-commit`
> e o `ai-guard.mjs` **rejeitam o patch** — o build da Cloudflare Pages e o
> Capacitor sync não sobem código quebrado.

## 0. Regra de ouro — "cirurgia, não reforma"

> **Só toque no que o bug pede.** Se o usuário disse "conserte X", NÃO
> reescreva Y, Z, nem "aproveite pra melhorar". Um patch bom é o menor diff
> possível que resolve o bug. Se o diff passar de ~150 linhas líquidas fora
> de `js/patches/**`, você provavelmente está reescrevendo — PARE e peça
> confirmação ao humano.

## 1. Arquitetura que você NÃO pode mudar

O CRM tem **duas arquiteturas de módulo conviventes** — isso é deliberado:

| Pasta | Tipo | Regra |
|---|---|---|
| `_worker_src/worker/**`, `functions/**` | ES modules reais (`import/export`) | `no-undef: error`. Nunca use global implícito. |
| `js/**`, `src/**` | Scripts globais concatenados (SEM bundler) | Sem `import/export`. Ordem de carregamento vem do `<script>` no HTML. |
| `www/**` | **Espelho gerado** de `js/` e `src/` pelo `scripts/build-capacitor-www.mjs` | **NUNCA edite `www/` à mão** exceto quando o patch tem "espelho Capacitor" declarado. |

Se você tentar converter `js/kanban.js` para ES modules "porque é mais limpo",
o Capacitor Android/iOS quebra e o `_headers` da Cloudflare Pages para de
casar. **Não faça isso.**

## 2. Como se corrige bug neste projeto (fluxo obrigatório)

Todo bug fix segue este pipeline. IA que pular etapas tem o patch rejeitado
pelo `ai-guard.mjs`.

### 2.1. Patch como camada, não como reescrita
Bugs em runtime são corrigidos criando um arquivo novo em:

```
js/patches/<área>/lf-fix-<slug>-v<N>-<YYYYMMDD>.js
```

Regras do arquivo de patch:
- **IIFE** `(function(global){ 'use strict'; ... })(typeof window!=='undefined'?window:globalThis);`
- **Idempotente**: primeira linha útil é `if(global.__lfFix<Slug>V<N>) return; global.__lfFix<Slug>V<N> = true;`
- **Só client-side** (não puxa dependência nova).
- **Nunca** sobrescreve função original sem preservar referência (`var _orig = global.fn; global.fn = function(){ ... return _orig.apply(this,arguments); };`).
- **Envelopa** listeners com `try/catch` — patch nunca pode derrubar o app.
- Cabeçalho em comentário com: motivo, causa raiz, estratégia, escopo, data.

### 2.2. Registro no HTML
Adicione a tag `<script src="js/patches/...">` **DEPOIS** dos scripts base
somente em `index.html`, dentro do bloco `LF-LOAD-GROUP` correspondente,
e registre dependências novas em `scripts/load-order-contract.json`.
Depois rode `npm run check:load-order` e `npm run html:sync`; `app.html`,
`www/index.html` e `www/app.html` são espelhos gerados, não arquivos para
edição manual. O `ai-guard.mjs` e `verify-mirror.mjs` conferem essa
paridade.

### 2.3. Relatório
Todo fix gera um `RELATORIO-FIX-<SLUG>-<YYYYMMDD>.md` em
`docs/relatorios-historico/`, com seções: `Bug`, `Causa raiz`,
`Estratégia`, `Fluxos cobertos`, `Arquivos`, `Reversão`. (Convenção
atualizada em 2026-08-28 — antes ia na raiz; a raiz tinha acumulado 85
relatórios ao longo do projeto. Ver `docs/relatorios-historico/README.md`.)

### 2.4. Rollback
Se o patch mexe em arquivos canônicos (fora de `js/patches/`), crie par:
- `_patch-meta/apply-<slug>-<data>.sh`
- `_patch-meta/rollback-<slug>-<data>.sh`

## 2.5. Processo investigativo — o que nenhuma trava automática consegue verificar sozinha

**Leia isto com atenção**: as regras acima (§1-§4) e os scripts
(`ai-guard.mjs`, testes, lint) travam a FORMA do resultado — se o
patch é IIFE, se está espelhado, se os testes passam. Nenhum desses
consegue verificar se você **investigou direito antes de escrever
código**. Isso é sobre julgamento, não sobre sintaxe — mas é a parte
que mais separa um fix correto de um fix que parece correto.

### 2.5.1. Nunca confie cegamente num relatório de bug, mesmo detalhado

Se receber um documento de análise, um relatório de outra ferramenta,
ou até um relatório seu de uma sessão anterior, **verifique cada
afirmação contra o código real antes de agir**. Já aconteceu neste
projeto: um documento de análise técnica apontou a causa raiz de um
bug no lugar errado (`fetchAndCacheActivities`, quando a causa real
estava em `_mergeKeepLocalOnly`) — só foi descoberta investigando a
cadeia completa de patches que envolvia a função, não confiando na
descrição inicial. Trate documentos externos como PISTA, não como
verdade — grep, leia a função inteira, trace a cadeia de chamadas.

### 2.5.2. Rastreie a cadeia causal completa, não pare na primeira explicação plausível

Vários bugs reais neste projeto viviam numa função **A** que chamava
**B** que era envolvida por **C** (um "wrapper" que blinda contra
sobrescrita) que era envolvida por **D**. Corrigir só em **A** sem
entender **B**, **C** e **D** é como apostar que a correção sobrevive
— confirme lendo a cadeia inteira. Se uma função parece calculada mas
nunca usada (ex.: uma variável de resultado que ninguém lê depois), ou
uma classe CSS tem manipuladores de evento esperando por ela mas o
elemento nunca é criado no HTML — isso quase sempre indica uma quebra
silenciosa anterior, não uma feature que nunca existiu. Investigue a
"fiação" ao redor antes de presumir.

### 2.5.3. Nunca declare algo corrigido sem rodar de verdade

"Isso deveria funcionar" não é o mesmo que "eu rodei e confirmei que
funciona". Rode o teste, veja passar. Se a mudança é visual, renderize
com o CSS/HTML de produção de verdade (não uma reimplementação
aproximada) e confira. Se envolve um cálculo checável por outra
ferramenta (dimensão de imagem/vídeo, por exemplo), confirme contra
essa ferramenta antes de confiar no próprio código novo.

### 2.5.4. Escreva teste para TODA lógica nova ou corrigida — contra o código de produção real

Um teste que testa uma cópia reimplementada da lógica não pega
regressão nenhuma se o arquivo de produção divergir depois. Prefira
carregar o arquivo-fonte real (via `eval`/`import` direto do arquivo
em `js/`, `src/`, `_worker_src/`) e testar contra ele. Cubra o caminho
feliz **e** os casos de borda óbvios (entrada vazia, `undefined`,
objeto aninhado, dois lados divergindo de propósito) — um teste que só
cobre o caminho feliz não teria pego a maioria dos bugs reais já
encontrados aqui.

### 2.5.5. Ao editar um arquivo existente com `str_replace` (ou equivalente), releia a área antes E depois

É fácil, ao inserir um bloco novo, remover sem querer uma linha
vizinha que fazia parte da âncora de busca/substituição — isso já
aconteceu neste projeto (mais de uma vez) removendo uma linha de
configuração existente que quebrava uma feature diferente, sem gerar
erro de sintaxe (o arquivo continuava válido, só funcionalmente
errado). Depois de qualquer edição, releia a região afetada e rode os
testes daquela área especificamente antes de seguir para a próxima
mudança — não só no final.

### 2.5.6. Quando incerto entre duas correções, prefira a mais conservadora — e diga por quê

Se encontrar uma área com informação insuficiente pra ter certeza do
comportamento pretendido (ex.: uma rota sem uso confirmado por
nenhuma tela, um campo cujo propósito não está claro), não adivinhe.
Documente o que foi investigado, o que ficou incerto, e deixe como
está — ou aplique a correção mais restritiva/segura possível, sem
quebrar nada confirmadamente em uso. "Não sei e não vou arriscar" é
uma resposta válida e deve ser dita explicitamente, não escondida.

### 2.5.7. Seja honesto sobre erros cometidos durante o próprio trabalho

Se um patch seu quebrar algo (mesmo que você mesmo corrija antes de
entregar), diga isso no relatório — não apague o rastro. Isso já
aconteceu neste projeto (edições que removeram uma linha por engano,
pegas só porque a suíte de testes rodou depois). O valor de reportar
isso é justamente mostrar que a rede de segurança (testes + guard)
funciona — omitir dá a impressão falsa de que o processo foi perfeito
na primeira tentativa, quando na verdade foi a VERIFICAÇÃO que
salvou, não a ausência de erro.

## 3. O que a IA NÃO pode fazer (proibições duras)

| ❌ Proibido | 🔥 Por quê |
|---|---|
| Rodar `git rebase`, `git push --force`, `git commit --amend` já pushado | Lovable perde histórico do projeto |
| Editar `www/**` sem também editar o `js/` ou `src/` correspondente | `build-capacitor-www.mjs` sobrescreve na próxima sync |
| Converter script global para ES module | Quebra Capacitor + concatenação |
| Adicionar dependência nova em `package.json` sem confirmação humana | CRM roda em Cloudflare Pages estático + Supabase; deps novas quebram deploy |
| Renomear função exposta em `window.*` | Outros patches dependem por nome (dep. dinâmica sem tipos) |
| Remover `try/catch` "vazio" | Padrão deliberado documentado em `docs/coding-standards.md` |
| Sobrescrever patch antigo sem versionar (`-v2-`, `-v3-`) | Perde reversibilidade |
| Editar `sql/**` ou `migrations/**` sem migration reversa | Supabase RLS quebra |
| Trocar `var` por `let/const` em massa | Reescrita, não fix. ESLint aceita `var` de propósito |
| Deletar arquivo `lf-*.js` antigo sem prova de que ninguém depende | Vários patches se referenciam por `window.__lfFix*` |

## 4. Invariantes de negócio que NUNCA quebram

Estes comportamentos são leis. Testados em `tests/` e no `ai-guard.mjs`:

1. **Scroll do Kanban** — só volta a 0 se o usuário rolou com dedo/mouse.
   Nenhum render/sync remoto pode resetar. (Ver
   `lf-fix-scroll-reset-lead-move-v2-20260818.js`.)
2. **Escopo de leads** — o front nunca varre TODOS os usuários ativos quando
   o cargo não é ADM global. `canEditForeign()` é o único portão.
3. **Somatória de ligações** — race entre worker e UI resolvido em
   `lf-lig-counter-sync-cloud-v1`. Não reintroduzir contador local puro.
4. **RLS Supabase** — `cargo` e `departamento` decidem visibilidade. Nunca
   bypass no client.
5. **Notificação órfã de atividade** — corrigida em `RELATORIO-FIX-NOTIF-ATIVIDADE-ORFA-20260818`.
   Não reativar polling agressivo.

## 5. Antes de enviar o patch

**Sincronia com `www/`/Capacitor, lint e testes agora são automáticos**
(2026-08-20, reforçado em 2026-10-11): um hook de `pre-commit`
(`githooks/pre-commit`, instalado sozinho em `.git/hooks/` via
`npm install` — script `prepare` do `package.json`) faz, nesta ordem,
em TODO commit:

1. Reconstrói `www/` sozinho sempre que o commit toca `js/`, `src/`,
   `css/`, `assets/` ou os HTMLs raiz, e confere paridade com
   `verify-mirror.mjs`.
2. Roda `node scripts/check-load-order.mjs` e bloqueia dependências fora
   de ordem.
3. Roda `node scripts/ai-guard.mjs --staged` (trava semântica).
4. **Roda `npm run lint` e `npm test` de verdade — e BLOQUEIA o
   commit se qualquer um falhar.** Até 2026-10-11, isso era só um
   passo manual documentado abaixo — nada impedia automaticamente um
   commit com teste quebrado. Agora é bloqueante: não importa qual IA
   ou ferramenta escreveu o código, se os testes não passarem, o
   commit não entra.
5. Tenta `npx cap sync` pros projetos `android/`/`ios` (best-effort —
   não bloqueia se o toolchain nativo não estiver instalado).

Ver `docs/CAPACITOR-BUILD-SETUP-20260804.md` para detalhes. Isso
**não substitui** rodar os comandos abaixo você mesmo, ANTES de
tentar commitar — descobrir um teste quebrado só no momento do commit
custa mais tempo do que descobrir enquanto ainda está editando.

Rode localmente (o CI da Cloudflare Pages roda de novo, mas evita retrabalho):

```bash
npm run lint            # ESLint client + worker
npm test                # Vitest — invariantes
node scripts/ai-guard.mjs   # trava semântica (este projeto)
node scripts/check-load-order.mjs # ordem efetiva dos scripts
node scripts/verify-mirror.mjs   # www/ bate com js/ e src/
```

Se algum falhar, **não** faça commit — corrija ou reverta. (Se você
tentar mesmo assim, o hook do passo 3 acima recusa por você.)

## 6. Prompt que você (IA) deve considerar recebido em toda tarefa

> "Fix cirúrgico. Menor diff possível. Não reescreva funções existentes;
> envelope-as com wrapper idempotente em `js/patches/`. Espelhe em `www/`.
> Gere relatório `.md`. Rode `ai-guard`. Investigue a causa raiz de
> verdade antes de escrever código — ver §2.5. Escreva teste contra o
> código de produção real pra toda lógica nova ou corrigida. Rode tudo
> e confirme que passa antes de dizer que terminou. Se algo aqui bate
> de frente com o que o humano pediu, PARE e pergunte antes de
> escrever código."
