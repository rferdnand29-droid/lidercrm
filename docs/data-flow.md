# Fluxo de dados

## 1. Requisição HTTP `/api/*` — pipeline completo

```
Navegador (ou app Capacitor)
   │  fetch('/api/v1/...')
   ▼
Cloudflare Pages — roteamento estático
   │  pathname começa com /api/ → não é arquivo estático
   ▼
functions/[[path]].js  (onRequest, catch-all)
   │  • OPTIONS → responde 204 direto (preflight CORS), sem entrar no handler
   │  • rota POST-only chamada com outro método → 405 direto (guardrail)
   ▼
_worker_src/worker/api-handler.js  (handleApi)
   │  normaliza /api/v2/* → /api/v1/* (compat de versão, ver código)
   ▼
middlewares/cors.js        → valida Origin, monta headers CORS
   ▼
middlewares/rate-limit.js  → limite em memória do isolate (chave ip+rota ou userId)
   ▼
middlewares/auth.js        → extrai Bearer JWT, verifica HS256, popula ctx.user
   │                          (rotas públicas pulam isso — /health, /login, etc.)
   ▼
middlewares/authz.js       → decide caps (CARGO_CAPS) via ROUTE_MATRIX,
   │                          nega 403 se o método/rota exigir mais do que o cargo permite
   ▼
routes/router.js           → resolve pathname+método → controller
   ▼
controllers/<recurso>-controller.js
   │  valida payload (validators/validate.js + schemas/)
   │  chama services/ e/ou repositories/ (que falam com lib/supabase-rest.js)
   ▼
utils/response.js          → envelope padrão { ok, data|error, meta } + ETag quando aplicável
   ▼
Resposta JSON  (sempre com x-request-id, útil pra achar a linha no log via `wrangler tail`)
```

Ver `docs/worker.md` para o catálogo de controllers/rotas e
`docs/permissions.md` para o que exatamente `authz.js` decide.

## 2. Autenticação — dois JWTs coexistindo

Login moderno (`POST /api/v1/login`) e uma **ponte legada**
(`GET /api/v1/session/legacy-nonce` + `POST /api/v1/session/legacy-bridge`,
implementada em `middlewares/auth.js`/`auth-controller.js` no backend e em
`js/patches/usuarios-auth/lf-legacy-auth-bridge-v1-20260717.js` no client)
coexistem — o sistema de login antigo (pré-Worker) ainda existe e é
"traduzido" para um JWT válido via essa ponte. Ao investigar um bug de
sessão, checar qual dos dois caminhos o usuário realmente percorreu
antes de assumir qual código está em jogo. Ver `docs/troubleshooting.md`
e `docs/database.md` (tabela de tradução de nomes de coluna).

## 3. Leitura de dados — dual-source (relacional + `fs_documents`)

Vários domínios (usuários, dashboard) fazem **dual-read**: tentam a
tabela relacional (`public.users`, `public.leads`, etc.) primeiro; se
vier vazio, caem no formato legado `fs_documents` (um "Firestore-like"
sobre Supabase, ver `lib/fs-documents.js` e
`src/modules/storage/runtime/fs-compat-engine.js`). Isso é uma
migração gradual em andamento, não um bug — ver cabeçalho de
`dashboard-controller.js` e `usuarios-controller.js`
(`_worker_src/worker/controllers/`). Ao adicionar um campo novo, checar
se ele precisa existir nas DUAS fontes durante a transição.

Alguns recursos (agenda_slots, kanban por board, contador de ligações,
feed de atividades) usam um padrão diferente: **um único documento
compartilhado por toda a equipe** em vez de um registro por item — ver
cabeçalho de `agenda-slots-controller.js`/`kanban-controller.js` para o
raciocínio (substitui o `onSnapshot` em tempo real do Firestore legado
por polling, já que o Workers não tem push nativo).

## 4. Offline / sync — fila única com compatibilidade legada

Os dois runtimes mantêm APIs diferentes por compatibilidade com o
frontend legado, mas compartilham uma única fila persistente:

| | `src/core/offline/retry-queue.js` | `src/modules/sync/runtime/retry-queue-sync.js` |
|---|---|---|
| Chave de storage | `lidercrm_retry_queue_v1` | `lidercrm_retry_queue_v1` |
| Namespace | `LiderCRM.offline.RetryQueue` | `RetryQueue`/`SyncManager` próprios do módulo |
| Escopo | Genérico (camada `src/core/offline/`, junto de `backoff.js`, `offline-manager.js`, `sync-manager.js`) | Específico de atividades/ligações (extraído de `js/patches/lf-retryqueue-sync-v1-20260717.js`) |
| Trigger de drain | Ver `sync-manager.js` (camada core) | ~15s / evento `online` / `visibilitychange` / boot |

O runtime modular migra a chave antiga `lf_retry_q_v1` para
`lidercrm_retry_queue_v1` sem descartar itens. Itens novos devem sempre
entrar na chave canônica; o campo `path|url` é aceito para que as
operações antigas e novas possam ser drenadas pelo mesmo mecanismo.

## 5. Branding / config em tempo real — ETag polling

`branding-controller.js` (fonte: `public.settings`, scope global) é o
modelo de referência de "tempo real via polling barato" deste projeto:
gera ETag determinístico, cliente manda `If-None-Match`, servidor
responde 304 sem corpo se nada mudou. Usado por
`js/patches/lf-brand-realtime-v1-20260730.js`. O mesmo padrão está
disponível para qualquer endpoint que precise de atualização quase-real-time
sem WebSocket. Ver `docs/database.md` § ETag.

## 6. Upload de arquivo binário — chave nunca chega ao client

`POST /api/v1/upload/binary` → `upload-binary-controller.js` → Backblaze
B2 direto do servidor (as chaves do B2 ficam em `env` do Worker,
nunca no `env` do client/HTML). Ver `docs/dependencies.md`.
