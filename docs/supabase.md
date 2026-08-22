# Supabase

## Nomenclatura de coluna — ver `docs/database.md` primeiro

O erro mais comum ao escrever SQL novo pra esse projeto é assumir que
o nome usado no app (`nome`, `telefone`, `ativo`) é o nome real da
coluna. Não é. Sempre conferir contra
`_worker_src/worker/repositories/users-relational-repository.js`
antes de escrever uma query nova contra `public.users`.

## ETag / 304 pra polling barato

`branding-controller.js` é a referência de como fazer polling client-side
sem sobrecarregar o banco: gera um ETag determinístico
(`etagOf(brand)`, baseado num campo `ver` monotônico), aceita
`If-None-Match` e devolve 304 sem corpo quando nada mudou. O cliente
correspondente (`lf-brand-realtime-v1-20260730.js`) manda o ETag salvo
a cada poll.

## RPCs de presença

`public.lf_presence_online(p_window_sec)` e `public.lf_presence_beat`
— criadas por `sql/migrations/fix_presence_500_20260801.sql`. Se
`_chatStartPresence()` (`js/chat.js`) logar "Presence: Supabase
indisponível", essa migração provavelmente ainda não rodou nesse
ambiente/projeto Supabase específico.

## Autenticação

`js/patches/usuarios-auth/lf-legacy-auth-bridge-v1-20260717.js` faz a
ponte entre o sistema de login antigo e um JWT válido do Supabase —
não mexer sem entender os dois lados (legado + Supabase Auth).

## Migrações pendentes / não confirmadas

Sempre que uma migração em `sql/migrations/` for aplicada, vale
registrar isso em algum lugar (não existe hoje uma tabela de controle
de migrações tipo `schema_migrations` neste projeto) — do jeito atual,
a única forma de saber se uma migração já rodou é tentar rodar de novo
e ver se dá erro de "já existe"/idempotência, ou perguntar pra quem
mantém o banco.
