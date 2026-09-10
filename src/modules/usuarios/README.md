# `src/modules/usuarios/` — Usuários (modularização parcial)

Namespace: `window.LiderCRM.modules.usuarios.runtime`. Conectado em
`index.html` e `app.html`. Ver `docs/modules.md` (Geração 2).

| Arquivo | Papel |
|---|---|
| `runtime/users-store.js` | Store de usuários — expõe também `usuarios._crmEvtTimers` (timers de evento do CRM) |

Complementa `_worker_src/worker/controllers/usuarios-controller.js`
(backend, dual-write relacional+legado) e
`js/patches/usuarios-auth/README.md` (patches de auth/permissão).
