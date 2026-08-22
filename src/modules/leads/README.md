# `src/modules/leads/` — Leads (modularização parcial)

Namespace: `window.LiderCRM.modules.leads.{runtime,data}`. Conectado
em `index.html` e `app.html`. Ver `docs/modules.md` (Geração 2).

| Arquivo | Papel |
|---|---|
| `runtime/objections-runtime.js` | Runtime de objeções (fluxo de tratamento de objeção do lead) |
| `data/objections-dictionary.js` | Dicionário estático de objeções — dado puro, sem lógica. Extraído de `objections-runtime.js` (rodada 2026-07-17, parte 2) |

Única área com subpasta `data/` além de `runtime/` — separação
deliberada entre dado estático e lógica.
