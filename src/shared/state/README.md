# `src/shared/state/` — estado compartilhado do client

Namespace: `window.LiderCRM.store`. Conectado em `index.html` e
`app.html`. Ver `docs/modules.md` (Geração 2.5).

| Arquivo | Papel |
|---|---|
| `app-store.js` | Store de estado do app — expõe `getSession()` e afins. |

Não é um sistema de state management de framework (Redux/Zustand/etc.)
— é um objeto global simples com getters/setters, consistente com o
resto do projeto (sem bundler, sem framework). Ver `docs/architecture.md`.
