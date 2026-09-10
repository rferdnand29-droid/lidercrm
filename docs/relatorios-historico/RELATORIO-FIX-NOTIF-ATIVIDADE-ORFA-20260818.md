# FIX — Notificação de atividade órfã (lead excluído) — 2026-08-18

## Sintoma
Notificações no sino apontando para leads/negócios que **não existem mais**.
Ao clicar, aparece “Esse card não está mais disponível”. Marcar como lida não resolve — a notificação volta sozinha em segundos (a cada foco, visibilidade ou tick de 60s da agenda).

## Causa raiz (3 frases)
1. `lf-overdue-activity-notif-fix-20260729.js` faz `_upsertOverdueNotif(a)` a partir de `getActivities()`, com id determinístico `ntf_act_<actId>`, olhando apenas `a.done` e `a.scheduledAt`. Nunca verifica se o card ainda existe no quadro.
2. `confirmDeleteKBReason` em `js/relatorios.js` remove o card do quadro (`saveKBFor`) mas **não** percorre `getActivities()` para eliminar as atividades vinculadas por `clientId` — elas continuam vivas, sem `done`, com `scheduledAt` no passado.
3. Todo tick de `checkUpcomingActs` / `_sweepOverdueOwn` (boot, foco, visibilitychange, 60s) reencontra a atividade órfã atrasada e reinsere a notificação — inclusive reabrindo `n.lida = false` se o usuário já tinha marcado como lida.

## Correção — 2 mudanças cirúrgicas + reforço de cache (r2)

### A) `js/relatorios.js` — purga atividades e notificações órfãs no ato da exclusão
Dentro de `confirmDeleteKBReason`, após o `saveKBFor` que remove o card, adicionado bloco `try{ ... }catch(_e){}` que:
- Filtra `getActivities()` removendo toda atividade com `a.clientId === item.id` e `a.board === board` (guarda tolerante quando `a.board` está ausente).
- Filtra `getNotifs(S.userId)` removendo toda notificação com `n.cardId === item.id` e mesmo board.
- Persiste via `saveActivities` / `saveNotifsFor` e chama `updateNotifBadge()`.

Idempotente: só grava se o array mudou de tamanho. Não toca backend, SW, migration.

### B) `js/patches/notificacoes/lf-overdue-activity-notif-fix-20260729.js` — guarda de card órfão
Dentro de `_upsertOverdueNotif(a)`, **antes** do upsert, adicionada guarda:
```js
if (a.clientId && a.board && typeof window.getKBFor === 'function') {
  var _arr = window.getKBFor(a.board, window.S.userId) || [];
  var _exists = _arr.some(function(x){ return x && x.id === a.clientId; });
  if (!_exists) return false; // card não existe mais → não recria a notif
}
```
Corta o loop de ressuscitação para qualquer atividade órfã histórica remanescente. Em erro do `try`, mantém fluxo original — a guarda nunca quebra o patch.

### C) Reforço de invalidação de cache no deploy
Como `/js/*` e `/js/patches/*` são servidos como `Cache-Control: public, max-age=31536000, immutable` no Cloudflare Pages, o único jeito de forçar o navegador a baixar as versões novas é (i) mudar a URL via `?v=` e (ii) fazer o `app-update-checker` disparar `_doCleanReload()`. Alterações neste deploy:

| Ponto | Antes | Agora |
|---|---|---|
| `<meta name="lf-build-id">` em `index.html`, `app.html`, `www/index.html`, `www/app.html` | `20260817-2311` | `20260818-orfanotif` |
| `js/lf-build-info.js` → `builtAt` | `2026-08-17 23:11 UTC` | `2026-08-18 00:00 UTC` |
| `?v=` em `js/relatorios.js` | `20260817rebuild1` | `20260818orfanotif` |
| `?v=` em `js/patches/notificacoes/lf-overdue-activity-notif-fix-20260729.js` | `20260729overduenotif` | `20260818orfanotif` |
| `?v=` em `js/lf-build-info.js` e `js/app-update-checker.js` | `20260817rebuild1` | `20260818orfanotif` |
| `_headers` — `/app-lite.html` e `/404.html` | (sem regra própria) | `Cache-Control: no-store, no-cache, must-revalidate` |
| `_headers` — cabeçalho de documentação | 2026-07-27 | 2026-08-18 (bloco de motivo do reforço) |

Efeitos combinados:
1. HTMLs `no-store` → toda visita busca `index.html`/`app.html` frescos → `lf-build-id` novo chega em milissegundos.
2. `app-update-checker.js` já em execução compara o `lf-build-id` da aba com o do servidor → detecta diferença → `_scheduleReloadWhenIdle()` → `_doCleanReload()` (que também limpa `caches.keys()` — para o dia em que o CRM passar a usar SW, já está blindado).
3. `?v=20260818orfanotif` muda a URL dos 4 scripts alterados → CDN + browser tratam como URL nova, ignorando o `immutable` da versão antiga.
4. Espelho `www/` foi sincronizado com `js/` para o wrapper Capacitor / PWA carregar exatamente os mesmos arquivos.

## Espelho `www/`
`js/relatorios.js`, `js/patches/notificacoes/lf-overdue-activity-notif-fix-20260729.js` e `js/lf-build-info.js` foram copiados para `www/js/**` (as três estavam divergentes no ZIP recebido). Confirmado por `diff -q`.

## Fluxo esperado pós-deploy
1. Usuário exclui lead `X` → `confirmDeleteKBReason` remove o card **e** todas as atividades com `clientId===X` **e** todas as notificações com `cardId===X`. Sino atualiza na hora (`updateNotifBadge`).
2. Se ainda existir alguma atividade órfã de antes do fix, no próximo tick `_upsertOverdueNotif` verifica `getKBFor` e devolve `false` sem escrever no feed — a notificação órfã **não** volta a aparecer.
3. Abas antigas de outros usuários rodando a versão anterior detectam `lf-build-id` novo em ≤ 4min (ou imediatamente ao focar a aba) e recarregam via `_doCleanReload()`.

## Reversibilidade
Cirúrgico e local. Para reverter basta:
- Remover o bloco `[FIX 20260818]` em `js/relatorios.js` (e cópia em `www/`).
- Remover o bloco `[FIX 20260818]` em `lf-overdue-activity-notif-fix-20260729.js` (e cópia em `www/`).
- Voltar `?v=` e `lf-build-id` para os valores anteriores.

Sem tocar backend, banco, service worker.

---

## ATUALIZAÇÃO r2 — 2026-08-18 12:40 UTC (reforço adicional de cache-busting)

Pedido explícito: "reforce a limpeza de caches antigos ao fazer deploy".

Além da limpeza r1 (já aplicada no ZIP-base), este r2 sobe o build-id e a querystring `?v=` uma segunda vez, para que **qualquer aba** que já tenha capturado o `lf-build-id=20260818-orfanotif` (r1) ainda seja forçada a recarregar via `_doCleanReload()`:

| Ponto | r1 | r2 |
|---|---|---|
| `<meta name="lf-build-id">` (`index.html`, `app.html`, `www/index.html`, `www/app.html`) | `20260818-orfanotif` | `20260818-orfanotif-r2` |
| `?v=` em `lf-build-info.js`, `app-update-checker.js`, `relatorios.js`, `lf-overdue-activity-notif-fix-20260729.js` | `20260818orfanotif` | `20260818orfanotifR2` |
| `js/lf-build-info.js` → `builtAt` | `2026-08-18 00:00 UTC` | `2026-08-18 12:40 UTC` |
| `_headers` — cabeçalho de documentação | (r1) | atualizado com o motivo do r2 |

Cadeia de invalidação ativada pelo r2 (mesma do r1, agora com URLs frescas):

1. `/index.html`, `/app.html`, `/app-lite.html`, `/404.html` continuam servidos como `Cache-Control: no-store, no-cache, must-revalidate` → toda visita busca o HTML novo → `<meta lf-build-id="20260818-orfanotif-r2">` chega imediatamente.
2. `js/app-update-checker.js` (já em execução em qualquer aba antiga, sob r1 ou anterior) faz `fetch('/index.html', {cache:'no-store'})`, extrai o `lf-build-id` do servidor, compara com o guardado na aba (`20260818-orfanotif`), vê diferença → `_scheduleReloadWhenIdle()` → `_doCleanReload()`.
3. `_doCleanReload()` chama `caches.keys().then(keys => keys.forEach(caches.delete))` — blindagem para o dia em que houver Service Worker/Cache API — e substitui a URL com `?_upd=<ts>` para saltar CDN + browser cache. `localStorage`/`sessionStorage` intactos: sessão e dados não se perdem.
4. Como `/js/*` e `/js/patches/*` continuam `Cache-Control: public, max-age=31536000, immutable`, o único caminho realista de forçar re-download é mudar a URL — feito via `?v=20260818orfanotifR2` nas 4 tags de `<script>` alteradas, em `index.html`, `app.html`, `www/index.html` e `www/app.html`.
5. Espelho `www/` sincronizado (`diff -q` = 0 nos 4 scripts críticos e 4 HTMLs).

Reversibilidade: mesma do r1 — remover os blocos `[FIX 20260818]` em `js/relatorios.js` e no patch de notificações, e reverter os valores de `lf-build-id` e `?v=`.
