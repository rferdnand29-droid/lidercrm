# RELATORIO-FIX-LOGIN-CAPACITOR-APIBASE-20260824

Etiqueta: **LF-FIX-CAPACITOR-APIBASE-20260824**
Build: `lf-build-id = 20260824-apibasefix` | cache-bust `?v=20260824-apibasefix1`
Sintoma: no PC o login com e-mail/senha funciona; no APK (Capacitor) as MESMAS
credenciais falham ("Não foi possível entrar" / "Serviço de autenticação indisponível").

## Causa raiz
`doLogin()` (js/auth.js) chama `workerClient.login()` → `request('/api/v1/login')`
em js/api.js, que monta a URL como `LiderCRM.apiBase + path`. Como `apiBase`
nunca era definido em lugar nenhum do projeto, a base ficava VAZIA e o fetch
saía RELATIVO. No PC (site servido no mesmo domínio do Worker) isso funciona.
No app nativo a página roda em `https://localhost` (androidScheme https do
capacitor.config.json), então o login ia para `https://localhost/api/v1/login`
→ erro de rede/404 → login sempre falhava no APK.

Causas secundárias descartadas/verificadas:
- CSP: `connect-src 'self' https:` já libera o Worker (sem alteração).
- CORS do Worker: `_worker_src/worker/middlewares/cors.js` já permite
  `capacitor://localhost`, `ionic://localhost` e `http(s)://localhost` sempre
  (sem alteração). Se ALLOWED_ORIGINS estiver em modo restrito em produção,
  incluir `https://localhost` na lista.
- AndroidManifest já tem INTERNET; capacitor.config.json já está sem
  `server.url` (bundle local).

## Correção (cirúrgica, aditiva)
1. `js/api.js` (espelhado em `www/js/api.js`): nova função `_lfNativeApiBase()`
   — só em plataforma nativa (Capacitor.isNativePlatform) resolve a base:
   (a) origin real se não for localhost; (b) `LiderCRM.apiBase`/`__LF_API_BASE`
   injetado no index.html; (c) fallback derivado do ADM_EMAIL
   (`https://liderfinanceira.com`). Web desktop/mobile segue com base
   relativa — comportamento original intacto.
2. `index.html` + `www/index.html`: script inline ANTES de `js/api.js`
   definindo `window.LiderCRM.apiBase = 'https://liderfinanceira.com'`
   (ajuste se o Worker estiver em outro domínio, ex. `*.workers.dev`).
3. Build batido: `lf-build-id` = `20260824-apibasefix`; `?v=` = `20260824-apibasefix1`.

## Como validar
1. `node scripts/release-and-sync.mjs && npx cap sync` → rebuild do APK/AAB
   no Android Studio → reinstalar no aparelho (APK antigo continua quebrado).
2. No WebView do app: `document.querySelector('meta[name=lf-build-id]').content`
   deve ser `20260824-apibasefix`.
3. Login com e-mail/senha reais deve entrar. Se falhar com CORS, adicionar
   `https://localhost` em ALLOWED_ORIGINS no Cloudflare (Workers/Pages env).
