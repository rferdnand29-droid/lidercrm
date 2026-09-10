# `middlewares/` — pipeline de entrada, nesta ordem

```
cors.js  →  rate-limit.js  →  auth.js  →  authz.js
```

| Arquivo | Papel |
|---|---|
| `cors.js` | Valida `Origin` (suporta `capacitor://localhost`, `ionic://` pro app nativo + `ALLOWED_ORIGINS` do env), monta headers CORS, responde preflight `OPTIONS`. |
| `rate-limit.js` | Limitador simples em memória do isolate (chave = ip+rota, ou userId se autenticado). Primeira barreira anti-abuso — comentário no arquivo já prevê anexar KV/D1 no futuro. |
| `auth.js` | **Autenticação.** Extrai `Bearer <jwt>`, verifica assinatura HS256 (`JWT_SECRET` do env), popula `ctx.user`. Lista de rotas públicas (sem Bearer) declarada no topo do arquivo. |
| `authz.js` | **Autorização.** Modelo Cargo×Escopo×Ação (`CARGO_CAPS`/`ROUTE_MATRIX`). 2ª barreira de defesa — a 1ª é o `CARGO_CAPS` do client (`js/auth.js`), que só esconde UI. Ver `docs/permissions.md` (documento dedicado, é a peça mais sensível do projeto). |

**Não confundir auth.js (autenticação = "quem é você") com authz.js
(autorização = "o que você pode fazer")** — nomes parecidos, arquivos
com responsabilidades bem diferentes.
