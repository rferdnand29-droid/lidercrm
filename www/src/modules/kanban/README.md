# `src/modules/kanban/` — Kanban (modularização parcial)

Namespace: `window.LiderCRM.modules.kanban.runtime`. Conectado em
`index.html` e `app.html`. Ver `docs/modules.md` (Geração 2).

| Arquivo | Papel |
|---|---|
| `runtime/kanban-helpers.js` | Helpers do board — estado/transformação, sem DOM |

Para o board em si (drag/drop, renderização), ver `js/kanban.js` e
`js/patches/kanban-leads/README.md`. Para o endpoint, ver
`_worker_src/worker/controllers/kanban-controller.js`.
