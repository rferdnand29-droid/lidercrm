# `src/modules/storage/` — Storage (modularização parcial)

Namespace: `window.LiderCRM.modules.storage.runtime`. Conectado em
`index.html` e `app.html`. Ver `docs/modules.md` (Geração 2).

| Arquivo | Papel |
|---|---|
| `runtime/fs-compat-engine.js` | Motor puro do adaptador "Firestore-like" sobre Supabase (`fs_documents`) — sem dependência de estado/rede/DOM, só transformação de dado em memória. Extraído de `js/supabase.js`, rodada 2026-07-17 (parte 3) |
| `runtime/supabase-bootstrap.js` | Bootstrap da conexão Supabase no client |

Equivalente client-side de `_worker_src/worker/lib/fs-documents.js`
(mesmo padrão, lado servidor).
