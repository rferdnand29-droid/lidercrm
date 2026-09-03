# `repositories/` — acesso a dado (backend)

| Arquivo | Papel |
|---|---|
| `base-repository.js` | Camada fina sobre `lib/supabase-rest.js` — o que toda entidade herda. |
| `index.js` | Instâncias por domínio (`usuariosRepo`, `leadsRepo`, `clientesRepo`, `financeiroRepo`, etc.). **Contém correção de 2026-08-01**: nomes de tabela que eram assumidos em português foram corrigidos pra inglês (nome real no banco) após confirmação via `information_schema`. `financeiroRepo` continua apontando pra uma tabela que **não existe** — problema conhecido, não corrigido aqui (fora do escopo de reorganização; ver `docs/AUDITORIA-TECNICA-20260801.md`). |
| `settings-relational-repository.js` | `public.settings` — nunca lança erro fatal, retorna `null` se a tabela não existir. |
| `users-relational-repository.js` | `public.users`+`roles`+`role_permissions`. Contém `relationalToLegacy()` — a função que traduz nomes de coluna reais (inglês) pros nomes usados pelo app (português). Ver `docs/database.md` antes de escrever SQL novo contra `public.users`. |

## Padrão de resiliência

Todos os repositories relacionais seguem o mesmo princípio: **nunca
lançar exceção fatal** se a tabela/coluna não existir (ambiente sem a
migração aplicada ainda) — retornam `null`/`[]` pra que o caller possa
cair no fallback `fs_documents` legado. Ver `docs/data-flow.md` §3.
