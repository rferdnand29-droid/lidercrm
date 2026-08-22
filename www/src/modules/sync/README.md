# `src/modules/sync/` — Sync (modularização parcial)

Namespace: `window.LiderCRM.modules.sync.runtime` (mais os globais
próprios `RetryQueue`/`SyncManager`/`LF.fetchAndCacheActivities` — ver
abaixo). Conectado em `index.html` e `app.html`. Ver `docs/modules.md`
(Geração 2).

| Arquivo | Papel |
|---|---|
| `runtime/retry-queue-sync.js` | Fila de retry + sync manager PRÓPRIOS deste módulo (chave `localStorage['lf_retry_q_v1']`) — extraído de `js/patches/lf-retryqueue-sync-v1-20260717.js`, rodada 8. Drena a cada ~15s / evento `online` / `visibilitychange` / boot. |

⚠️ **Não é a mesma fila** que `src/core/offline/retry-queue.js`
(chave `lidercrm_retry_queue_v1`, mais genérica). Duas filas de retry
paralelas e independentes coexistem no projeto — achado desta
auditoria, ver `docs/data-flow.md` §4 e `docs/ai-guide.md`.

O que fica de propósito em `js/patches/lf-retryqueue-sync-v1-20260717.js`
e NÃO foi movido pra cá: a parte que depende de `window.saveActivities`/
`window.syncErr` já estarem carregados (integração com o boot legado,
não lógica pura) — ver cabeçalho do próprio arquivo para a lista exata.
