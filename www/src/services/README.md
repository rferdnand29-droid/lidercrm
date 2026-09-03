# `src/services/` — orquestração (client, camada transversal)

Namespace: `window.LiderCRM.services`. Conectado em `index.html` e
`app.html`. Ver `docs/modules.md` (Geração 2.5) — **não confundir com**
`_worker_src/worker/services/` (backend).

Padrão: cada entidade herda de `BaseService` via
`BaseService.call(this)`.

| Arquivo | Entidade |
|---|---|
| `base-service.js` | Classe base |
| `auth-service.js` | Autenticação (client) |
| `cliente-service.js` | Clientes |
| `dashboard-service.js` | Dashboard |
| `financeiro-service.js` | Financeiro |
| `lead-service.js` | Leads |
| `notification-service.js` | Notificações |
| `storage-service.js` | Storage/upload |
| `sync-service.js` | Sincronização |
| `upload-service.js` | Upload |

Cada service consome o repository correspondente
(`src/repositories/`) e/ou `src/shared/http/worker-client.js`
diretamente pra falar com a API v1.
