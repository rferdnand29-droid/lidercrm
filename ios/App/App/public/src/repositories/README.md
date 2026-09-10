# `src/repositories/` — acesso a dado (client, camada transversal)

Namespace: `window.LiderCRM.repositories`. Conectado em `index.html` e
`app.html`. Ver `docs/modules.md` (Geração 2.5) — **não confundir com**
`_worker_src/worker/repositories/` (backend, camada completamente
separada, ver `docs/worker.md`).

Padrão: cada entidade herda de `BaseRepository` via
`BaseRepository.call(this, '<nome-da-tabela>')` (herança clássica em
JS, sem `class`).

| Arquivo | Entidade |
|---|---|
| `base-repository.js` | Classe base — tem feature flag própria (conferir no arquivo) |
| `clientes-repository.js` | Clientes (Bingo) |
| `dashboard-repository.js` | Dashboard/agregados |
| `documentos-repository.js` | Documentos |
| `financeiro-repository.js` | Financeiro |
| `leads-repository.js` | Leads |
| `storage-repository.js` | Storage/upload |
| `usuarios-repository.js` | Usuários |

Consumidos por `src/services/*-service.js` correspondentes (nunca
diretamente pela UI) — ver `src/services/README.md`.
