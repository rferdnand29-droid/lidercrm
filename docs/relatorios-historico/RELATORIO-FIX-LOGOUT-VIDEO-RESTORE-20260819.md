# RELATÓRIO — FIX Logout Video Restore V1 (2026-08-19)

## Bug reportado
Após logar e depois sair do CRM, o vídeo de fundo animado da tela de login
(`assets/videos/lf-auth-bg-desktop.mp4` / `-mobile.mp4`) **some
permanentemente**. A tela de login volta com o fundo estático do jpg
institucional, e o vídeo em loop não retorna mais até um refresh completo.

## Causa-raiz (rastreada em código-fonte deste build)

O vídeo é renderizado em `<div id="lf-auth-bg-anim">` (index.html linhas 365–377)
e depende de duas condições CSS para ficar visível:

1. `body.lf-auth-bg-on` (define `#lf-auth-bg-anim { opacity: 1 }`) — ver
   `css/login/lf-auth-bg-animation.css` linha 38.
2. `#login-screen` translúcido por cima do vídeo (regra
   `body.lf-auth-bg-on #login-screen { background: linear-gradient(..., .55, .72) }`
   em `css/login/lf-auth-bg-animation.css` linhas 188+).

O controller `js/lf-auth-bg-controller.js` (linhas 108–118) liga
`.lf-auth-bg-on` sempre que `(#splash visível OU #login-screen.vis) && !#app.vis`.

**O que quebra o vídeo no logout:**

1. `js/auth.js -> _execLogout()` (linhas 711–730) esconde `#app` e mostra
   `#login-screen` — comportamento correto.
2. Em seguida, `js/patches/auth/lf-fix-logout-wallpaper-reset-v2-20260818.js`
   -> `_fullWallpaperCleanup()` faz cleanup do wallpaper do usuário (correto)
   **mas adiciona ao `<body>` as classes `view-login` e `lf-clean-bg` e o
   atributo `data-view="login"`** (linhas 125–127).
3. Isso ativa `css/lf-fix-login-bg-20260803.css`:
   ```css
   body.view-login,
   body.lf-clean-bg,
   body[data-view="login"]{
     background-image: url('/assets/login-bg.jpg') !important;
     background-size: cover !important; ...
   }
   ```
   O jpg estático assume o fundo do `<body>`, e o vídeo (que está por baixo
   com `pointer-events:none`, `z-index:1`) fica coberto/apagado visualmente.
4. Além disso, o cleanup do v2 reordena classes/atributos do body em tal
   sequência que, em alguns dispositivos, `.lf-auth-bg-on` fica dessincronizada
   com o estado real das telas — deixando o wrapper do vídeo em `opacity:0`.

Resultado: o video some no primeiro logout e não volta mais.

## Correção aplicada

**Arquivo novo:** `js/patches/auth/lf-fix-logout-video-restore-v1-20260819.js` (289 linhas)

**Registrado em:**
- `index.html` linha 2656 (após o v2 do wallpaper, defer, ordem preservada)
- `app.html` linha 2493 (idem)

### O que o patch faz

1. **Observer em `#login-screen`**: sempre que ele ganha `.vis` (logout normal,
   logout silencioso por `checkSes()`, kick por admin, sessão expirada, deep-link
   `#login`), dispara `_restoreLoginVideo()` em 4 ticks (0/60/250/900ms) para
   vencer as re-injeções do patch v2 do wallpaper (30/200/800ms).

2. **Observer no `<body>`**: sempre que `view-login`, `lf-clean-bg`,
   `data-view="login"` reaparecem — ou `.lf-auth-bg-on` é removida — enquanto
   o login está visível, reverte no mesmo tick.

3. **`_restoreLoginVideo()` — cirúrgico:**
   - Remove `body.classList` `view-login` e `lf-clean-bg` **apenas quando
     `#login-screen.vis` e `!#app.vis`** (não interfere com outras telas do CRM).
   - Remove `data-view="login"` (só esse valor exato; outros data-view do CRM
     ficam intactos).
   - Força `body.classList.add('lf-auth-bg-on')` e remove `.lf-auth-bg-off`.
   - Chama `window.LfAuthBg.refresh()` para o controller reavaliar dispositivo
     e estado (API pública já exposta pelo controller).
   - Chama `.play()` nos `<video class="lf-auth-bg-video">` (Chromium/iOS às
     vezes pausam após ficar em `opacity:0` prolongado).

4. **Wrappers redundantes** em `_execLogout / doLogout / logout / signOut /
   clearSession / resetSession` (defensivo, além dos observers).

5. **`hashchange`** → se URL virar `#login/#auth/#signin`, tenta restore.

6. **`visibilitychange`** → se o usuário volta pra aba com login visível,
   garante que o vídeo não ficou pausado em background.

7. **Retry de instalação por ~15s** (auth.js/controller são `defer`).

8. **API pública**: `window.LF_FIX_LOGOUT_VIDEO_RESTORE.restore()` no console
   força restore a qualquer momento.

### O que NÃO mexe (contrato preservado)

- ❌ Não altera `js/auth.js` (`_execLogout`, `doLogout`).
- ❌ Não altera `js/configuracoes.js` (`applyBG`).
- ❌ Não altera `js/lf-auth-bg-controller.js` nem
  `css/login/lf-auth-bg-animation.css`.
- ❌ Não altera `css/lf-fix-login-bg-20260803.css` (o fallback jpg continua
  funcionando quando o vídeo não puder carregar).
- ❌ Não altera os patches v1/v2 do wallpaper — o cleanup deles continua
  removendo `#lf-wallpaper-bg-wrap`, `#bg-style-el`, etc. exatamente como antes;
  só neutralizamos o efeito colateral (`view-login/lf-clean-bg`) que
  escondia o vídeo.
- ❌ Não toca em `lf13_bgphoto_*`, `lf13_bg_*`, `lf13_pic_*`, `lf6_s`.
- ❌ Não redefine nem renomeia funções existentes — apenas wrappers aditivos.
- ❌ Idempotente: guard `__LF_FIX_LOGOUT_VIDEO_RESTORE_V1__` — múltiplos
  carregamentos não duplicam efeito.
- ❌ Só age quando `#login-screen.vis && !#app.vis` — nunca interfere com
  navegação dentro do CRM logado.

## Como validar (checklist manual)

1. Carregar `index.html` — vídeo de login deve rodar no fundo (comportamento
   esperado, já funcionava).
2. Fazer login com qualquer usuário.
3. Confirmar que o CRM abre normalmente (`#app.vis`, vídeo escondido — OK).
4. Clicar em **Sair** → confirmar no toast "Sair da conta? [Sair]".
5. ✅ **Esperado:** tela de login volta com o **vídeo animado tocando em loop**
   por trás do formulário (antes do fix, o fundo ficava estático no jpg).
6. Repetir logout/login várias vezes → o vídeo deve voltar em toda saída.

### Cenários secundários cobertos

- **Sessão expirada** (`checkSes()` retorna false e cai pro login-screen sem
  passar por `_execLogout`) → observer de `#login-screen` dispara restore.
- **Kick por admin** (`LF_FIX_ADM_PW_RESET.forceLogout`) → observer + wrappers.
- **Deep-link `#login`** → hashchange dispara restore.
- **Tab em background** → visibilitychange re-empurra `.play()`.
- **Boot direto na tela de login** (recarregou logado, sessão inválida) →
  restore roda no `boot()`.

## Arquivos alterados

| Arquivo | Tipo |
|---|---|
| `js/patches/auth/lf-fix-logout-video-restore-v1-20260819.js` | **novo** (289 linhas) |
| `index.html` | +2 linhas (comentário + `<script defer>` na linha 2656) |
| `app.html` | +2 linhas (idem, linha 2493) |

Nenhum outro arquivo foi tocado. Nenhuma migração. Rollback = remover as 2
tags `<script>` novas + apagar o arquivo do patch.

## Validação de sintaxe

- `node --check js/patches/auth/lf-fix-logout-video-restore-v1-20260819.js` → OK
- Parse HTML de `index.html` e `app.html` → OK
