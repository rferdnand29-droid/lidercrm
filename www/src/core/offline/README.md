# `src/core/offline/` — subsistema offline (genérico, transversal)

Namespace: `window.LiderCRM.offline`. Conectado em `index.html` e
`app.html`. Ver `docs/modules.md` (Geração 2.5).

| Arquivo | Papel |
|---|---|
| `offline-manager.js` | Observa `navigator.onLine` + eventos `online`/`offline` do browser, emite estado consumível pelo resto do app. |
| `retry-queue.js` | `LiderCRM.offline.RetryQueue` — fila persistente em `localStorage` (chave `lidercrm_retry_queue_v1`) de operações a re-tentar quando offline. Item = `{ id, method, path, body, attempts, nextAt, meta }`. |
| `backoff.js` | Backoff exponencial com jitter — usado por `retry-queue.js` e `sync-manager.js`. |
| `sync-manager.js` | Drena a `RetryQueue` quando o navegador volta a ficar online. |

`src/modules/sync/runtime/retry-queue-sync.js` mantém a API legada para
atividades/ligações, mas lê a mesma chave canônica e migra a chave antiga
`lf_retry_q_v1`. Não crie uma nova chave de retry sem documentar uma
migração explícita.
