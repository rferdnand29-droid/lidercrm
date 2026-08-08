# Banco de dados (Supabase/Postgres)

## Armadilha #1: nomes de coluna reais vs. nomes "legado"

O app inteiro fala em português (`nome`, `telefone`, `ativo`) mas a
tabela `public.users` no Postgres usa nomes em inglês. A tradução
acontece em `_worker_src/worker/repositories/users-relational-repository.js`,
função `relationalToLegacy()`:

| Nome usado no app/JS | Coluna real no Postgres |
|---|---|
| `nome` | `full_name` |
| `telefone` | `phone` |
| `ativo` | `active` |
| `cargo` | `cargo` (esse é igual, sem tradução) |
| `ph` (hash de senha) | `password_hash` |

**Isso já causou erro real**: um SQL de migração (`fix_presence_500`)
tentou `select u.nome` direto na tabela e quebrou com `42703: column
u.nome does not exist`. Ao escrever SQL cru contra `public.users`,
sempre usar os nomes da coluna 2 (reais), nunca os da coluna 1.

## Migrações

`sql/migrations/` — rodar em ordem cronológica (nome do arquivo tem
data). Cada uma assume que as anteriores já rodaram. Não existe
ferramenta de migração automática (tipo Prisma/Knex) — é copiar e
colar manualmente no SQL Editor do Supabase, uma vez cada.

`sql/manutencao/` — scripts que você roda quando precisa (não fazem
parte da evolução do schema): aposentar usuário, resetar hash de senha
em massa.

## Padrão de ETag / polling barato

`_worker_src/worker/controllers/branding-controller.js` implementa
`If-None-Match`/304 de verdade — o cliente
(`js/patches/lf-brand-realtime-v1-20260730.js`) manda o ETag salvo e só
trata como "mudou" se receber 200 com corpo novo. Esse padrão pode ser
reaproveitado por outros endpoints que precisem de polling barato.

## RPCs conhecidas

- `public.lf_presence_online(p_window_sec)` — lista usuários com
  heartbeat recente. Criada por `sql/migrations/fix_presence_500_20260801.sql`.
- `public.lf_presence_beat` — grava heartbeat do usuário atual.

Se `[chat] Presence: Supabase indisponível` aparecer no console, é sinal
de que essas RPCs (ou as colunas que elas dependem) ainda não foram
criadas nesse ambiente — rodar a migração de presença resolve.
