# RELATÓRIO DE HOTFIX — 2026-08-04 (LOOPFIX → AUTHGATE)

Pacote: `lidercrm-patched-clean-20260804-hotfix-editleads-LOOPFIX.zip` → corrigido.

## Correções aplicadas (na ordem sugerida, por impacto)

### 1. Blocos de 401 na subida — patches aguardam `lf:worker-token-synced` ✅
**Arquivos tocados:**
- `js/patches/scope/lf-scope-v2-cargo-departamento-v1-20260803.js` — `_bootTeamDeptCache` agora chama `_refreshTeamDeptCache()` via gate.
- `js/patches/departments/lf-departments-crud-v1-20260803.js` — `_bootRefresh` agora chama `refresh()` via gate.
- `js/patches/users/lf-fix-zombie-users-v2-20260804.js` — `_syncCloud()` verifica `_hasWorkerAuth()` (novo) antes do `getConfig` inicial; sem JWT, reagenda em 500ms em vez de tomar 401.
- **NOVO** `js/patches/lf-when-worker-auth-v1-20260804.js` — helper `LF_WHEN_WORKER_AUTH(fn)` que adia a 1ª chamada autenticada até o evento `lf:worker-token-synced` (ou token já presente em `S._workerToken`/`S.token`/`__LF_WORKER_JWT`/sessão do httpClient), com polling de 300ms e timeout de segurança de 15s.

### 2. Loops de 40 tentativas — nomes reais do build + aliases globais ✅
**Arquivos tocados:**
- **NOVO** `js/patches/lf-bootstrap-fn-aliases-v1-20260804.js` — cria, no bootstrap:
  - `window.fetchLeads` → `_syncKBRemoteBG('leads')` + `renderKBConsBar` + `renderKBLocal` + `renderKB` (nomes reais de `js/kanban.js`/`js/auth.js`);
  - `window.completeActivity` → `actConfirmDone` (real, `js/agenda.js:395`);
  - `window.changePassword` → `changeMyPassword` (real, `js/configuracoes.js`) + `.adminReset` → `adminResetPassword` (real, `js/usuarios.js:694`).
- `js/patches/leads/lf-fix-lead-refresh-retornar-v1-20260803.js` — `names[]` ganhou os nomes reais (`renderKB`, `renderKBLocal`, `_syncKBRemoteBG`, `refreshKBAffected`, `loadCli`).
- `js/patches/activities/lf-fix-activity-done-persist-v1-20260803.js` — `fnNames` ganhou `actConfirmDone`, `markTlActDone`, `applyActBulkDone`; o aviso final de "40 tentativas" virou `console.debug` (fallback pending continua ativo).
- `js/patches/auth/lf-fix-adm-password-reset-logout-v1-20260803.js` — `fnNames` ganhou `changeMyPassword`; aviso final rebaixado para debug.

### 3. Boot lento (12s) — parcial ✅ (base para o ganho maior)
- Os 401 iniciais (fator de retries pré-JWT) foram eliminados pelo item 1 — cada 401 forçava retry/backoff antes do app destravar.
- Os 2 patches novos são leves e usam `defer`.
- **NÃO feito (risco alto de regressão):** consolidação física dos ~45 patches em 5–6 pacotes. Recomendado como etapa separada com teste de regressão — os hooks `_install`/`__lf*` de cada patch precisam ser preservados na fusão.

### 4. `[chat] Presence: Supabase indisponível` ✅
**Causa-raiz real encontrada:** `js/chat.js:_chatStartPresence` checava `window.supabase.channel()`, mas `window.supabase` é o **SDK** (só tem `createClient`); o **cliente** criado em `js/supabase.js:_connectSupabase` (`_sbClient`) nunca era exposto globalmente.
**Correção:**
- `js/supabase.js` — expõe `window.supabaseClient = _sbClient` logo após o `createClient`.
- `js/chat.js` — `_chatStartPresence` agora usa `window.supabaseClient` (com fallback para `window.supabase`) e **reagenda** nova tentativa em 3s se o initDB ainda não expôs o cliente (antes: desistiva após um único warn).
- CDN/CSP já estavam corretos: CSP `script-src ... https:` permite jsdelivr/unpkg e o fallback de CDN já existia no `index.html`.

### 5. `[DOM] Password field is not contained in a form` (×5) ✅
**Arquivos tocados:** `index.html` e `app.html`.
- `#np` (senha inicial, cadastro de usuário): envelopado em `<form onsubmit="return false;" style="display:contents">`, `autocomplete` corrigido para `new-password`.
- `#k-reset-senha` (reset ADM): envelopado em `<form ...>`, `autocomplete="new-password"`.
- `#cfg-pw-old`/`#cfg-pw-new`/`#cfg-pw-confirm` (troca de senha): bloco envelopado em `<form onsubmit="return false;">`; `cfg-pw-old` com `autocomplete="current-password"`.
- O campo `#lp` da tela de login **já estava** dentro de `<form id="login-form">` — sem alteração necessária.

### 7. `[lf-fix-definitivo-4bugs-r1]` log como aviso (linha 403) ✅
- `js/patches/lf-fix-definitivo-4bugs-r1-20260801.js` — log de instalação rebaixado de `console.warn` para `console.debug`. Comportamento funcional inalterado.

## Registro dos patches novos no `index.html`
Adicionados imediatamente **antes** do patch de leads (consumidores carregam depois), ambos com `defer`:
```html
<script src="js/patches/lf-when-worker-auth-v1-20260804.js?v=20260804authgate1" defer></script>
<script src="js/patches/lf-bootstrap-fn-aliases-v1-20260804.js?v=20260804aliases1" defer></script>
```

## Validação
- `node --check` OK em todos os 11 arquivos JS criados/editados.
- Parser HTML: `<form>` balanceadas em `index.html` (4) e `app.html` (3), zero erros críticos.
- Todas as edições são **aditivas** (wrappers/gates/aliases) — nenhuma função original foi removida ou reescrita, preservando os hooks `__lf*` existentes.

## Pendências recomendadas (próximos passos)
1. **Consolidação dos patches** (item 3 completo): fundir por domínio com suite de regressão; meta boot 12s → ~3s.
2. **Confirmar no servidor Supabase** que "Anonymous Sign-ins" está ativo e que a tabela `fs_documents` + policies RLS existem — o `_bootDiagMsg` já traduz esses erros se persistirem.
3. Testar em dispositivo real: presença do chat (lista "online"), auto-preenchimento de senha no modal Config, e ausência dos 3 blocos de 401 no console.
