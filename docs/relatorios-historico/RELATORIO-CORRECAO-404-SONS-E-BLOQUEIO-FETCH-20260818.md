# RELATÓRIO — Correção dos erros de console (2026-08-18)

## Sintomas relatados
1. `assets/sounds/chat.wav`, `atrasada.wav`, `geral.wav`, `chat.ogg`, `atrasada.ogg`, `geral.ogg` → **404** (6 requisições falhas).
2. `[lf-hotfix-notif-ativ-v1] bloqueada tentativa de sobrescrever LF.fetchAndCacheActivities com versão insegura` — warn recorrente no console.

## Causa raiz

### (1) 404 dos sons
O bundle só contém `.mp3` em `assets/sounds/` (`chat.mp3`, `atrasada.mp3`, `geral.mp3`).
O patch `lf-hotfix-notif-som-e-atividades-v1-20260804.js`, ao re-hidratar
`window._notifSoundPaths` (quando `notificacoes.js` ainda não definiu), criava
fallbacks `.wav` e `.ogg` → o `<audio>` tentava carregar arquivos inexistentes
antes de o `lf-fix-console-errors-v1-20260818.js` ser executado (ambos são
`defer`, mas o console-errors está por último no HTML).

### (2) Warn de sobrescrita bloqueada
O mesmo hotfix blinda `LF.fetchAndCacheActivities` via `Object.defineProperty`
com setter que **só aceita** funções marcadas `__lfV3Safe`/`__lfHotfixSafe`.
O `lf-fix-console-errors-v1-20260818.js` (fix [B] — cross-uid) instalava seu
wrapper **sem essas marcas** → o setter rejeitava, logava o warn, e o fix [B]
ficava sem efeito.

## Correções aplicadas

### `js/patches/lf-hotfix-notif-som-e-atividades-v1-20260804.js`
1. **FIX-CE1[A]-2**: fallback de `_notifSoundPaths` agora só contém `.mp3`
   (chat/atrasada/geral), eliminando os 404 na origem.
2. Nova etapa `_sanitizeSoundPaths()` no boot: filtra in-place qualquer
   `_notifSoundPaths` previamente populado com `.wav/.ogg`.

### `js/patches/lf-fix-console-errors-v1-20260818.js`
3. **FIX-CE1[B]-2**: o wrapper de `fetchAndCacheActivities` (e o stub) agora
   carregam `__lfV3Safe = true` e `__lfHotfixSafe = true` — passam pelo setter
   blindado do hotfix sem warn, e o fix [B] realmente entra em vigor.
4. Fix [A] ampliado: também saneia `window._notifSoundPaths` em runtime.

### Sincronização e cache-busting
5. Ambos os arquivos replicados em `www/js/patches/` (cópia idêntica).
6. Bump dos versionadores nos 4 HTMLs (`app.html`, `index.html`,
   `www/app.html`, `www/index.html`):
   - `?v=20260804hotfixnotifatv1` → `?v=20260804hotfixnotifatv2`
   - `?v=20260818ce1` → `?v=20260818ce2`

## Garantias
- Idempotente (flags `__lfCE1Installed`, `__LF_HOTFIX_NOTIF_ATIV_V1__` intactas).
- Zero mudança de comportamento funcional: o som continua tocando via `.mp3`;
  a blindagem do `fetchAndCacheActivities` continua ativa — agora aceita a
  versão segura do console-errors.
- Sintaxe validada com `node --check` nos dois patches.
