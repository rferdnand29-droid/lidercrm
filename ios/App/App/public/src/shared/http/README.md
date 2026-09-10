# `src/shared/http/` — clientes HTTP do frontend

Conectado em `index.html` e `app.html`. Ver `docs/modules.md`
(Geração 2.5).

| Arquivo | Papel |
|---|---|
| `http-client.js` | Cliente HTTP genérico — sessão JWT persistida em `localStorage`, `Content-Type: application/json` só quando o body é JSON. Camada mais baixa. |
| `worker-client.js` | Cliente de alto nível pra API v1 do Worker (usa `http-client.js` + `src/core/contracts/api-contract.js` pra montar URLs). Encapsula: auth (login/logout/session/refresh) e a ponte de sessão legada (`legacyNonce`+`legacyBridge`, Fase 3.2). |

`src/services/*.js` usa `worker-client.js`; raramente algo deveria
chamar `http-client.js` direto sem passar por ele.
