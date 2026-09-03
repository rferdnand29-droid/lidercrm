# `src/core/bridge/` — ponte com o CRM legado

Namespace: `window.LiderCRM.meta`. Conectado em `index.html` e
`app.html`. Ver `docs/modules.md` (Geração 2.5).

| Arquivo | Papel |
|---|---|
| `legacy-crm-bridge.js` | Marca `LiderCRM.meta.loadedAt` e `LiderCRM.meta.compatibilityMode = 'legacy-global-bridge'` — sinaliza que este código roda em modo de compatibilidade sobre o CRM legado baseado em globais (`js/*.js`), não como app isolado. |

Não confundir com `js/patches/usuarios-auth/lf-legacy-auth-bridge-v1-20260717.js`
(ponte de AUTENTICAÇÃO especificamente) — este arquivo aqui é sobre
compatibilidade geral de runtime, não login.
