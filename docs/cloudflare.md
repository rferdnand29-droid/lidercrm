# Cloudflare Pages

## Estrutura

- Site estático servido direto (sem build).
- `functions/[[path]].js` — rota "catch-all" do Cloudflare Pages
  Functions; toda URL que não bate com um arquivo estático cai aqui e
  é delegada pro código em `_worker_src/worker/`.
- `_worker_src/worker/` — o backend de verdade, organizado por
  camada:
  - `controllers/` — um por recurso (branding, presence, usuarios...)
  - `middlewares/` — auth/autorização (`authz.js`)
  - `repositories/` — acesso a dados (ex.:
    `users-relational-repository.js`, que faz a tradução de nomes de
    coluna — ver `docs/database.md`)
  - `services/`, `schemas/`, `validators/`, `errors/`, `lib/`,
    `utils/`, `routes/` — camadas de apoio padrão.
- `_headers` / `_redirects` — configuração de headers/redirecionamento
  do Cloudflare Pages, ficam na raiz do projeto (obrigatório pra serem
  reconhecidos no deploy).

## Deploy

Conectado via GitHub — push em `main` publica automaticamente. Ver
`docs/deployment.md` pro passo a passo completo usado neste projeto.

## Cuidado com CSS/manifest servidos via `blob:`

O manifest do PWA (`<link rel="manifest" id="pwa-manifest">`, sem
`href` fixo no HTML) é montado em runtime via `URL.createObjectURL()`
em `js/supabase.js` e em
`js/patches/lf-brand-realtime-v1-20260730.js` (pra permitir
nome/ícone dinâmico por branding). Isso é uma particularidade real
deste projeto: `start_url`/`scope` relativos (`'/'`) não resolvem
corretamente contra uma base `blob:` — sempre usar `location.origin +
'/'` (absoluto) nesse contexto específico. Detalhes completos em
`docs/troubleshooting.md`.
