# RELATÓRIO — FIX Logout Wallpaper V2 (2026-08-18)

## Bug reportado
Ao sair do CRM, a tela de login volta com a **foto de capa do usuário** aparecendo por trás do formulário, distorcendo a logo LF, o logo NOBLE e os campos de e-mail/senha (exatamente como no print enviado pelo usuário).

## Causa-raiz (rastreada em código)

O bug tem 3 origens que se somam:

### 1. `js/configuracoes.js` → `applyBG('photo')` (linhas 297–333)
Quando o usuário define uma foto de capa, essa função monta **3 artefatos globais no DOM**:

| Artefato | O que faz |
|---|---|
| `<div id="lf-wallpaper-bg-wrap">` | `position:fixed; inset:0; z-index:0; background:url(FOTO) center/cover` — a foto propriamente dita, "colada" à viewport |
| `<style id="bg-style-el">` | Força `body,#app{background:transparent!important}` e reposiciona `#app,.topbar,.pg,.mo,header` com `position:relative;z-index:1` |
| `<style id="lf-wallpaper-transp-el">` | Aplica `backdrop-filter:blur()` + `rgba` em modais, headers, cards |
| Classes em `<html>` | `.lf-has-wallpaper`, `.lf-theme-dark`/`.lf-theme-light` + vars `--lf-wallpaper-alpha`, `--lf-wallpaper-blur` |

### 2. `js/auth.js` → `_execLogout()` (linhas 711–730)
O logout real:
- Zera `S = null`
- Remove `lf6_s` do localStorage
- Esconde `#app` (`classList.remove('vis')`)
- Mostra `#login-screen` (`classList.add('vis')`)

**Mas NÃO desmonta nenhum dos 4 artefatos acima.** Resultado: o `#login-screen`, cujo CSS é `background:var(--bg)`, é sobrescrito pelo `bg-style-el` que continua forçando `body{background:transparent!important}`. A foto de capa (via `#lf-wallpaper-bg-wrap` com z-index 0) continua pintando o fundo, e o form de login flutua transparente por cima → visual quebrado do print.

### 3. Patch v1 (`lf-fix-logout-wallpaper-reset-v1-20260803.js`) — não cobre o caso
- Só wrapa `logout`, `doLogout`, `signOut`, `clearSession`, `resetSession`. **Não wrapa `_execLogout`**, que é a função que roda de verdade quando o usuário clica em "Sair" no toast de confirmação (`auth.js` linha 739).
- Mesmo se pegasse `doLogout`, o reset roda **antes** da confirmação no toast (com `#app` ainda visível), não depois do logout consumado.
- Limpa `body.style.backgroundImage` mas **não remove** `#lf-wallpaper-bg-wrap` nem os `<style>` culpados.

---

## Correção aplicada

Arquivo novo: **`js/patches/auth/lf-fix-logout-wallpaper-reset-v2-20260818.js`**
Registrado em: **`index.html` linha 2684** e **`app.html` linha 2501** (logo após o v1, defer, ordem preservada).

### O que faz

1. **Wrapa `_execLogout`** (a função real do logout) — além de manter os wrappers de `doLogout`/`logout`/`signOut`/`clearSession`/`resetSession` por compatibilidade.
2. **Cleanup completo pós-logout** (`_fullWallpaperCleanup`), executado múltiplas vezes (0ms, 30ms, 200ms, 800ms) pra vencer qualquer re-injeção assíncrona de `loadBGRemote`/`MutationObserver`:
   - Remove `<div id="lf-wallpaper-bg-wrap">`
   - Zera `<style id="bg-style-el">.textContent`
   - Zera `<style id="lf-wallpaper-transp-el">.textContent`
   - Tira de `<html>` as classes `.lf-has-wallpaper`/`.lf-theme-dark`/`.lf-theme-light` e as CSS vars `--lf-has-wallpaper`/`--lf-wallpaper-alpha`/`--lf-wallpaper-blur`
   - Zera `backgroundImage`/`background` inline em `html`/`body`/`#app`/`#login-screen`
   - Marca `<body data-view="login" class="view-login lf-clean-bg">`
3. **MutationObserver em `#login-screen`**: sempre que ganha `.vis` (logout silencioso, sessão expirada, `checkSes()` retornando false, kick por admin), o cleanup dispara automaticamente.
4. **Hook em `hashchange`** para `#login`/`#auth`/`#signin`.
5. **Hook opcional em `LF_FIX_ADM_PW_RESET.forceLogout`** (reset de senha por admin).
6. **Retry de instalação** por ~15s (auth.js é `defer`, algumas telas PWA sobem devagar).
7. **API de debug**: `window.LF_FIX_LOGOUT_WP_V2.reset()` no console força o cleanup a qualquer momento.

### O que NÃO mexe (contrato preservado)

- ❌ Não apaga `lf13_bgphoto_{uid}` — a foto continua salva pra próxima sessão do MESMO usuário.
- ❌ Não apaga `lf13_bg_{uid}` — o id do fundo escolhido é preservado.
- ❌ Não apaga `lf13_pic_{uid}` — foto de perfil do avatar intacta.
- ❌ Não redefine nem renomeia nenhuma função existente — só adiciona wrapper.
- ❌ Não mexe em `backgroundColor` do body (o tema `theme-classic`/`theme-light` continua responsável por isso via classe, e `#login-screen` já usa `var(--bg)`).
- ❌ Idempotente: guard `__LF_FIX_LOGOUT_WALLPAPER_V2__` — múltiplos carregamentos não duplicam efeito.
- ❌ Convive pacificamente com o v1 (v1 continua ativo, só fica redundante para o caso agora coberto).

---

## Como validar (checklist manual)

1. Login como qualquer usuário que tenha foto de capa configurada em Configurações > Aparência > Foto de fundo.
2. Confirmar que o wallpaper aparece dentro do CRM (esperado — comportamento normal).
3. Clicar em **Sair** (barra lateral, mobile-menu ou aba Configurações).
4. Confirmar no toast "Sair da conta? [Sair]".
5. ✅ **Esperado:** tela de login volta LIMPA — fundo sólido do tema (`var(--bg)`), form NOBLE nítido, sem sobreposição da foto de capa.
6. Fazer login novamente com o MESMO usuário.
7. ✅ **Esperado:** a foto de capa reaparece dentro do CRM (foi só limpa da tela de login, não do localStorage/Firestore).

### Cenários secundários também cobertos

- Kick por admin (`LF_FIX_ADM_PW_RESET.forceLogout`) → cleanup roda.
- Sessão expirada (`checkSes()` retorna false, app cai pro login-screen sem passar por `_execLogout`) → MutationObserver de `#login-screen` dispara o cleanup.
- URL `#login`/`#auth` acionada por deep-link → hashchange dispara o cleanup.

---

## Arquivos alterados

| Arquivo | Tipo de mudança |
|---|---|
| `js/patches/auth/lf-fix-logout-wallpaper-reset-v2-20260818.js` | **novo** (245 linhas) |
| `index.html` | +1 linha (`<script src="…v2…" defer>` após o v1, linha 2684) |
| `app.html` | +1 linha (idem, linha 2501) |

Nenhum outro arquivo foi tocado. Nenhuma migração de dados. Rollback = remover as 2 tags `<script>` novas.
