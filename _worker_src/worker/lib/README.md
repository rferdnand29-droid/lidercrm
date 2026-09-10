# `lib/` — clientes de baixo nível

| Arquivo | Papel |
|---|---|
| `supabase-rest.js` | Cliente REST minimalista pro Supabase (PostgREST + Auth + Storage) via `fetch` puro — decisão deliberada de NÃO usar o SDK oficial (não é 100% edge-friendly em algumas versões). Inclui tratamento de timeout que converte `AbortError`/`DOMException` em erro HTTP tratável (ver correção "login-fix" no cabeçalho do arquivo). |
| `fs-documents.js` | Adaptador "Firestore-like" sobre o Supabase — implementa o padrão `collection('x').doc(uid).{get,set}()` do sistema legado, usado pelos recursos que ainda não migraram pro modelo relacional puro. Ver `docs/data-flow.md` §3. |

Estes são os únicos dois pontos do Worker que falam HTTP com serviços
externos diretamente. Qualquer mudança de comportamento aqui (timeout,
retry, formato de erro) se propaga pra TODOS os repositories/controllers
que dependem deles — tratar como código crítico compartilhado.
