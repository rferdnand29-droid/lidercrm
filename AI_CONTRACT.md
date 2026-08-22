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
e **NA MESMA POSIÇÃO** em: `index.html`, `app.html`, `www/index.html`, `www/app.html`.

Se você adicionar em 1 e esquecer os outros 3, o `ai-guard.mjs` rejeita.

### 2.3. Relatório
Todo fix gera um `RELATORIO-FIX-<SLUG>-<YYYYMMDD>.md` na raiz, com seções:
`Bug`, `Causa raiz`, `Estratégia`, `Fluxos cobertos`, `Arquivos`, `Reversão`.

### 2.4. Rollback
Se o patch mexe em arquivos canônicos (fora de `js/patches/`), crie par:
- `_patch-meta/apply-<slug>-<data>.sh`
- `_patch-meta/rollback-<slug>-<data>.sh`

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

**Sincronia com `www/`/Capacitor agora é automática** (2026-08-20): um
hook de `pre-commit` (`githooks/pre-commit`, instalado sozinho em
`.git/hooks/` via `npm install` — script `prepare` do `package.json`)
reconstrói `www/` sozinho sempre que o commit toca `js/`, `src/`,
`css/`, `assets/` ou os HTMLs raiz, confere paridade com
`verify-mirror.mjs`, e ainda tenta `npx cap sync` pros projetos
`android/`/`ios/` (best-effort — não bloqueia se o toolchain nativo não
estiver instalado na máquina). Ver `docs/CAPACITOR-BUILD-SETUP-20260804.md`
para detalhes. Isso **não substitui** rodar os comandos abaixo você
mesmo antes de pedir revisão — só garante que ninguém esquece de
sincronizar `www/` no commit.

Rode localmente (o CI da Cloudflare Pages roda de novo, mas evita retrabalho):

```bash
npm run lint            # ESLint client + worker
npm test                # Vitest — invariantes
node scripts/ai-guard.mjs   # trava semântica (este projeto)
node scripts/verify-mirror.mjs   # www/ bate com js/ e src/
```

Se algum falhar, **não** faça commit — corrija ou reverta.

## 6. Prompt que você (IA) deve considerar recebido em toda tarefa

> "Fix cirúrgico. Menor diff possível. Não reescreva funções existentes;
> envelope-as com wrapper idempotente em `js/patches/`. Espelhe em `www/`.
> Gere relatório `.md`. Rode `ai-guard`. Se algo aqui bate de frente com o
> que o humano pediu, PARE e pergunte antes de escrever código."
