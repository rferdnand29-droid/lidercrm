# RELATÓRIO — FIX vídeo de login ausente em app.html

**Data:** 2026-08-20
**Bug reportado:** "vídeo de login não aparece mais".

## Causa-raiz

O vídeo de fundo da tela de login (`assets/videos/lf-auth-bg-desktop.mp4` /
`-mobile.mp4`) depende de 3 peças que precisam existir juntas na mesma
página:

1. `<link rel="stylesheet" href="css/login/lf-auth-bg-animation.css">`
2. O bloco `<div id="lf-auth-bg-anim">` com os dois `<video>` (desktop/mobile)
3. `<script src="js/lf-auth-bg-controller.js">` (liga `.lf-auth-bg-on` no
   `<body>` conforme `#splash`/`#login-screen`/`#app` ficam visíveis)

**`index.html` tem as 3 peças — `app.html` nunca teve nenhuma das 3.**
Isso não é regressão desta sessão: conferi no zip original enviado e o
gap já existia lá. O relatório antigo
`RELATORIO-FIX-LOGOUT-VIDEO-RESTORE-20260819.md` registrou a tag do
patch `lf-fix-logout-video-restore-v1` em `app.html` (script que *restaura*
o vídeo após logout), mas esse patch pressupõe que o vídeo já esteja na
página — e nunca esteve, em `app.html`. Ou seja: `app.html` sempre exibiu
só o fundo estático (jpg institucional / gradiente), nunca o vídeo, em
qualquer fluxo (boot, login, logout).

Isso é o mesmo padrão do bug do `lf-consultor-clickable-lig-v1` corrigido
na sessão anterior: uma peça só foi adicionada a `index.html`, nunca
espelhada em `app.html`, violando a regra do `AI_CONTRACT.md` de manter
os 4 HTMLs (`index.html`, `app.html`, `www/index.html`, `www/app.html`)
sincronizados.

## Correção aplicada

Portado para `app.html` o mesmo bloco que já existia em `index.html`,
byte-a-byte:

- CSS `css/login/lf-auth-bg-animation.css` registrado no `<head>`.
- `<div id="lf-auth-bg-anim">` com os dois `<video class="lf-auth-bg-video">`
  (fonte `assets/videos/lf-auth-bg-desktop.mp4` / `-mobile.mp4`) logo
  após `#bg-orbs`, antes do `<!-- SPLASH -->`.
- `<script defer src="js/lf-auth-bg-controller.js">`.
- `www/app.html` sincronizado via `npm run cap:www` (mirror gerado, não
  editado à mão).

Nada em `js/lf-auth-bg-controller.js`, `css/login/lf-auth-bg-animation.css`
ou no patch `lf-fix-logout-video-restore-v1` foi alterado — o problema era
só a ausência da peça base em `app.html`, não a lógica dela.

## Validação

- `node scripts/ai-guard.mjs` → 0 violações bloqueantes.
- `node scripts/verify-mirror.mjs` → `www/` e raiz idênticos.
- `npm run lint` → 0 erros.
- `npm test` → 43/43 testes.
- Balanceamento de tags `<div>`/`</div>` em `app.html` conferido
  (655/655) após a edição.

## Como validar manualmente

1. Abrir `app.html` diretamente (ou qualquer fluxo que caia nele, ex.:
   abrir uma página específica em nova aba).
2. Vídeo de fundo deve tocar em loop atrás da tela de splash/login —
   igual ao comportamento já correto de `index.html`.

## Reversão

Remover o bloco `#lf-auth-bg-anim` + `<script>` do controller +
`<link>` do CSS em `app.html` (3 blocos, marcados com os mesmos
comentários usados em `index.html`).
