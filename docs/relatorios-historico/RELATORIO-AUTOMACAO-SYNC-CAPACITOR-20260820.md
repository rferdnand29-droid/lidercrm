# RELATÓRIO — Sync definitivo pro Capacitor + automação pra sempre

**Data:** 2026-08-20
**Pedido:** "Sincronize as melhorias recentes pro Capacitor em
definitivo e coloque um sistema que sempre que algo novo for
incrementado ou bug resolvido aja a sincronia pro Capacitor logo em
seguida."

## 1. Sync "em definitivo" (rodado agora, uma vez)

```bash
npm run cap:www     # reconstrói www/ a partir de index.html/app.html/js/src/css/assets
npx cap sync         # copia www/ pros projetos nativos android/ e ios/
```

Resultado:

- `www/` 100% idêntico à raiz (`node scripts/verify-mirror.mjs` → OK).
- `android/app/src/main/assets/public/*` e `ios/App/App/public/*`
  atualizados e conferidos byte-a-byte contra `www/` (incluindo os
  vídeos de login, o fix de `app.html` da sessão anterior, e todos os
  patches corrigidos hoje).
- `npx cap sync` completou nas duas plataformas **sem precisar de
  Android Studio/Xcode** — a etapa de sync é só cópia de arquivo +
  atualização de metadado de plugin (`Package.swift` no iOS,
  `capacitor.config.json` nos dois), não envolve compilar nada. Gerar
  o `.apk`/`.ipa` de verdade continua exigindo os toolchains nativos
  (isso não mudou — ver `docs/CAPACITOR-BUILD-SETUP-20260804.md`,
  seção "O que NÃO deu pra fazer neste ambiente").

## 2. O sistema permanente

**Arquivos novos:**

| Arquivo | Papel |
|---|---|
| `githooks/pre-commit` | Hook versionado (fica no git, todo mundo recebe) |
| `scripts/install-git-hooks.mjs` | Copia `githooks/*` → `.git/hooks/*` |
| `package.json` | `"prepare": "node scripts/install-git-hooks.mjs"` + `"hooks:install"` |

**Por que via `"prepare"` e não husky/simple-git-hooks:** o
`AI_CONTRACT.md` proíbe adicionar dependência nova sem confirmação
humana (§3). `"prepare"` é um script de ciclo de vida do **npm**
(nenhum pacote novo) — o npm já roda ele sozinho depois de todo
`npm install`/`npm ci`. Resultado prático idêntico ao de uma lib de
hooks, zero dependência nova.

### O que o hook faz em todo commit

1. Se o commit tocar `js/`, `src/`, `css/`, `assets/` ou os HTMLs raiz
   → roda `node scripts/build-capacitor-www.mjs`, confere com
   `verify-mirror.mjs`, e inclui `www/` **no mesmo commit** via
   `git add www`. (Precisa rodar isso ANTES do `ai-guard`, porque o
   próprio `ai-guard` recusa commit com `www/` desatualizado —
   ordem errada faria todo commit em front-end falhar até alguém
   sincronizar a mão, o oposto do pedido.)
2. Roda `node scripts/ai-guard.mjs --staged` (a trava semântica que já
   existia como script npm, mas não estava instalada como hook de
   verdade neste export).
3. Se `android/`/`ios/` existirem, tenta `npx cap sync` — **best-effort**,
   nunca bloqueia o commit se o toolchain nativo não estiver disponível
   na máquina de quem está commitando.

### Validação (rodada nesta sessão, num repo git de teste)

- Commit tocando `js/app.js` sem rodar `cap:www` a mão → hook
  reconstruiu `www/js/app.js` sozinho e incluiu no mesmo commit
  (`2 files changed`: o arquivo editado + o espelho). `ai-guard` passou
  porque a paridade já estava garantida pelo próprio hook.
- Commit tocando só `docs/*.md` → hook pulou o rebuild (nenhum arquivo
  de front-end no diff), só rodou o `ai-guard` — sem overhead
  desnecessário.
- `android/.gitignore`/`ios/.gitignore` (gerados pelo próprio
  `cap add` original do projeto) já excluem `assets/public`/`App/public`
  — confirmado que `git add android ios` no hook nunca duplica os
  vídeos/assets binários no histórico; só pega metadado real do
  projeto nativo quando existe (ex.: `Package.swift`).

### O que NÃO muda

- `npm run cap:android` / `npm run cap:ios` continuam sendo o passo
  manual pra efetivamente abrir Android Studio/Xcode e gerar um build
  — o hook só garante que `www/` (e os projetos nativos, quando possível)
  nunca ficam desatualizados esperando alguém lembrar.
- Nenhuma lógica de negócio, patch ou arquivo canônico foi alterado
  além do sistema de automação em si.
- `git commit --no-verify` continua disponível pra pular o hook em
  situação excepcional (documentado no topo do próprio hook).

## 3. Documentação atualizada

- `AI_CONTRACT.md` §5 — nota sobre o hook automático.
- `docs/CAPACITOR-BUILD-SETUP-20260804.md` — seção nova explicando o
  sistema (mesmo padrão de "Atualização (data)" que o resto do arquivo
  já usa).

## 4. Verificação final

```
npm run lint                    → 0 erros, 8 avisos (pré-existentes)
npm test                        → 8/8 arquivos, 43/43 testes
node scripts/ai-guard.mjs       → 0 violações bloqueantes
node scripts/verify-mirror.mjs  → www/ e raiz idênticos
```

## 5. Reversão

Sistema é 100% aditivo (2 arquivos novos + 2 blocos de script em
`package.json` + notas em 2 docs). Para reverter: apagar
`githooks/pre-commit`, `scripts/install-git-hooks.mjs`, remover as
entradas `"prepare"`/`"hooks:install"` do `package.json`, e rodar
`rm .git/hooks/pre-commit` em qualquer clone que já tenha instalado o
hook.
