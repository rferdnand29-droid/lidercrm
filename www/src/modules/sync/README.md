# `src/modules/sync/` — Sync (modularização parcial)

Namespace: `window.LiderCRM.modules.sync.runtime` (mais os globais
próprios `RetryQueue`/`SyncManager`/`LF.fetchAndCacheActivities` — ver
abaixo). Conectado em `index.html` e `app.html`. Ver `docs/modules.md`
(Geração 2).

| Arquivo | Papel |
|---|---|
| `runtime/retry-queue-sync.js` | Runtime compatível do retry + sync manager. Usa a chave canônica `localStorage['lidercrm_retry_queue_v1']` e migra itens antigos de `lf_retry_q_v1`. Drena a cada ~15s / evento `online` / `visibilitychange` / boot. |

Os dois módulos compartilham a mesma fila e o mesmo formato de item
(`{ id, method, path|url, body, attempts, nextAt, meta }`). O nome
`lf_retry_q_v1` continua apenas como chave de migração para instalações
antigas.

O que fica de propósito em `js/patches/lf-retryqueue-sync-v1-20260717.js`
e NÃO foi movido pra cá: a parte que depende de `window.saveActivities`/
`window.syncErr` já estarem carregados (integração com o boot legado,
não lógica pura) — ver cabeçalho do próprio arquivo para a lista exata.
