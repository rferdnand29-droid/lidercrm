# `utils/` — utilitários transversais do Worker

| Arquivo | Papel |
|---|---|
| `crypto.js` | Wrappers sobre WebCrypto (runtime nativo do Workers): assinar/verificar JWT HS256, hash SHA-256 (ETag, chaves de rate-limit), HMAC-SHA256 (ponte de sessão legada). Zero dependência externa. |
| `env.js` | Extrai config do binding `env` do Worker, com defaults seguros. **Chaves reais do Supabase foram removidas deste arquivo** (auditoria de segurança 2026-07-17) — configurar via `wrangler secret put` em produção, `.env.local` em dev. Nunca commitar chave real aqui. |
| `etag.js` | Gera ETag (SHA-256 do corpo serializado) + headers `Cache-Control`; responde 304 se `If-None-Match` bater. Ver `docs/data-flow.md` §5 (padrão de polling barato). |
| `logger.js` | Logger estruturado (JSON lines) via `console.log` — capturado pelo `wrangler tail`. Sem dependência externa. |
| `response.js` | Helpers de resposta padronizada — todo endpoint v1 responde `{ ok, data\|error, meta }`. |

Todos "sem dependência externa" por design — é o que mantém o deploy
sem build step (`package.json`: `"build": "echo ..."`) funcionando de
verdade. Ver `docs/dependencies.md`.
