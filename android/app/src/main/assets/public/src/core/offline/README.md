# `src/core/offline/` — subsistema offline (genérico, transversal)

Namespace: `window.LiderCRM.offline`. Conectado em `index.html` e
`app.html`. Ver `docs/modules.md` (Geração 2.5).

| Arquivo | Papel |
|---|---|
| `offline-manager.js` | Observa `navigator.onLine` + eventos `online`/`offline` do browser, emite estado consumível pelo resto do app. |
| `retry-queue.js` | `LiderCRM.offline.RetryQueue` — fila persistente em `localStorage` (chave `lidercrm_retry_queue_v1`) de operações a re-tentar quando offline. Item = `{ id, method, path, body, attempts, nextAt, meta }`. |
| `backoff.js` | Backoff exponencial com jitter — usado por `retry-queue.js` e `sync-manager.js`. |
| `sync-manager.js` | Drena a `RetryQueue` quando o navegador volta a ficar online. |

⚠️ **Não é a única fila de retry do projeto.**
`src/modules/sync/runtime/retry-queue-sync.js` tem sua PRÓPRIA
`RetryQueue`/`SyncManager` independente (chave
`localStorage['lf_retry_q_v1']`, escopo: atividades/ligações). As duas
não se comunicam. Ver `docs/data-flow.md` §4 e
`src/modules/sync/README.md` antes de mexer em qualquer uma assumindo
que é "a" fila de retry do sistema.
