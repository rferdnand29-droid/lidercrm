# Dependências

## Client (navegador) — zero dependências instaladas

> **Atualizado (2026-08-01, Rodada 3):** desde a auditoria final, `package.json`
> **tem** `devDependencies` — `vitest` (testes), `eslint`+`@eslint/js`+`globals`
> (lint), `prettier` (formatação). Todas são ferramentas de DESENVOLVIMENTO,
> baixadas via `npm install` localmente/no CI — **nenhuma delas vai pro
> deploy** (Cloudflare Pages serve o repo como está; `node_modules/` está no
> `.gitignore` novo, criado junto). O client (navegador) continua com **zero**
> dependência de runtime — nada disso é `import`ado nem carregado pelo app em
> produção. Ver `docs/AUDITORIA-FINAL-10-20260801-RODADA3.md` § Registro de
> aplicação.

`package.json` tinha, até a Rodada 3, **nem** `dependencies` nem
`devDependencies`. Não há
`node_modules/` no projeto entregue (se aparecer um depois de `npm
install`, é só o `wrangler`, baixado sob demanda pelos scripts abaixo —
não é uma dependência do app em si).

```json
"scripts": {
  "start":   "npx --yes wrangler pages dev . --port 8788",
  "dev":     "npm run start",
  "build":   "echo 'Static site — no build step needed...'",
  "preview": "npx --yes wrangler pages dev ."
}
```

`wrangler` é baixado via `npx --yes` na hora (CLI da Cloudflare para dev
local e deploy) — não é importado por nenhum código, só usado pela
linha de comando.

## Bibliotecas de terceiros carregadas via CDN (`<script>` direto no HTML)

Confirmado por inspeção direta do `<head>` (2026-08-01): hoje só há
**Google Fonts** (`Cormorant Garamond` + `Outfit`, via
`fonts.googleapis.com`/`fonts.gstatic.com`) — nenhum framework JS de
terceiros via CDN. Para a lista exata/versão exata pinada no futuro,
confira o `<head>` de `index.html`/`app.html` diretamente — este
documento não duplica isso porque HTML muda mais rápido que doc e a
fonte da verdade é o próprio arquivo. Ao adicionar uma nova lib via
CDN, lembrar do padrão do projeto (ver `docs/coding-standards.md` item
6): editar os dois entry points.

**Curiosidade histórica**: perto do topo de `index.html` existe um
bloco HTML comentado com instruções para descomentar 4 tags
`<script src="https://www.gstatic.com/...">` — vestígio de uma
integração Firebase/Firestore anterior à migração para Supabase (ver
também `_worker_src/worker/controllers/agenda-slots-controller.js`,
que menciona explicitamente o modelo Firestore legado). Não está
ativo hoje; não remover sem entender o motivo de ainda estar lá (Regra
nº 10 da missão de arquitetura).

## Backend (`_worker_src/worker/`) — zero dependências npm

O Worker também não importa nenhum pacote externo. `lib/supabase-rest.js`
fala HTTP puro com o Supabase (PostgREST + Auth + Storage) via `fetch`
nativo — **não usa o SDK oficial do Supabase** (decisão deliberada, ver
cabeçalho do arquivo: o SDK não é 100% edge-friendly em algumas
versões). `utils/crypto.js` usa `WebCrypto` nativo do runtime Workers
para JWT/hash — sem lib de JWT externa.

## Serviços externos (não são "dependência de código", mas o app não funciona sem eles)

| Serviço | Papel | Onde a integração mora |
|---|---|---|
| **Supabase** (Postgres + Auth + Storage) | Banco de dados relacional + auth | `_worker_src/worker/lib/supabase-rest.js`, `repositories/`. Ver `docs/supabase.md` |
| **Cloudflare Pages** | Hosting estático + Functions | `functions/[[path]].js`, `_headers`, `_redirects`. Ver `docs/cloudflare.md` |
| **Backblaze B2** | Storage de arquivo binário (uploads) | `_worker_src/worker/controllers/upload-binary-controller.js` — chaves nunca chegam ao client |
| **Capacitor** | Empacotamento nativo Android/iOS | `capacitor.config.json`. Ver `docs/mobile.md` |

## Por que documentar "zero dependências" explicitamente

Numa tarefa de manutenção via IA, é comum a tentação de "só adicionar
uma libzinha do npm pra isso" (ex.: date-fns, uuid, zod). **Isso muda a
arquitetura do projeto** (introduz a necessidade de bundler, porque
`import 'uuid'` não funciona num `<script>` solto sem resolução de
módulo) — é uma decisão de escopo maior que qualquer patch individual,
e não deve ser tomada silenciosamente dentro de uma tarefa que pedia
outra coisa. Ver `docs/ai-guide.md`.
