-- =====================================================================
-- MIGRAÇÃO SQL: Policy RLS para edição de leads apenas pelo dono
-- Data: 2026-07-23
-- -----------------------------------------------------------------------
-- Objetivo:
--   Substituir a policy permissiva atual (`using (true)`) de UPDATE em
--   public.leads por uma policy que só permite ao usuário editar leads
--   onde ele é o dono (owner_id = usuário logado).
--
-- Contexto do schema (confirmado em lidercrm_supabase_bootstrap.sql):
--   • Tabela public.leads tem coluna `owner_id uuid` referenciando
--     public.users(id). Índice idx_leads_owner já criado.
--   • Tabela public.users tem coluna `id uuid` (PK). O auth JWT emitido
--     pelo Worker do CRM coloca o id do usuário legado no claim `sub`
--     (padrão jwt.claims.sub), então usamos `(auth.jwt() ->> 'sub')::uuid`
--     como referência do usuário logado.
--   • As policies atuais do CRM são permissivas propositalmente porque
--     TODA a lógica de autorização passa pelo Worker (que valida sessão
--     legada + roles). Esta policy adiciona uma segunda camada de
--     defesa NO BANCO: mesmo se o Worker for burlado ou um token
--     escapar para outro contexto, o UPDATE só afeta linhas próprias.
--
-- Estratégia:
--   1. DROP POLICY IF EXISTS + CREATE POLICY (incremental, não recria
--      tabela, não perde dados, não desativa RLS).
--   2. Mantém as policies de SELECT / INSERT / DELETE inalteradas
--      (fora do escopo deste bug).
--   3. Se em produção você usa `authenticated` como role, a policy é
--      atribuída a esse role. Se usa `public` (default do Supabase
--      para clientes anônimos com anon-key), troque o TO conforme
--      necessário — o comentário no CREATE POLICY explica.
--
-- SEGURANÇA:
--   • Não altera a policy do Worker: o Worker continua sendo o gate
--     principal. Esta policy é backup.
--   • Não afrouxa nada: leads de OUTROS usuários ficam bloqueados
--     para UPDATE por não-owners — exatamente o comportamento pedido.
--   • Se você quiser permitir supervisores/gestores editarem leads de
--     subordinados, o Worker continua fazendo isso via service-role
--     key (que ignora RLS por design no Supabase). Nada muda para eles.
-- =====================================================================

begin;

-- (1) Garante que RLS está ativo na tabela.
alter table public.leads enable row level security;

-- (2) Remove a policy permissiva antiga de UPDATE, se existir.
--     O bootstrap cria essa policy dinamicamente para todas as tabelas
--     via loop (linha 726: create policy "%I_update_all" ... using (true)).
drop policy if exists "leads_update_all"      on public.leads;
drop policy if exists "leads_update_own"      on public.leads;

-- (3) Nova policy: só permite UPDATE quando o usuário logado é o dono.
--     • USING: filtra QUAIS linhas o UPDATE enxerga (owner tem que
--       bater com o sub do JWT).
--     • WITH CHECK: garante que o UPDATE não pode transferir a linha
--       para outro dono (owner_id continua sendo o próprio usuário
--       após o update). Se você QUER permitir transferência via
--       Worker mas não via cliente direto, deixe o Worker usar
--       service-role key — ela ignora RLS.
--
--     Comentário em português: "o usuário logado (auth.jwt() sub)
--     tem que ser o dono do lead antes E depois do update".
create policy "leads_update_own" on public.leads
  for update
  to authenticated
  using      ( owner_id = (auth.jwt() ->> 'sub')::uuid )
  with check ( owner_id = (auth.jwt() ->> 'sub')::uuid );

-- (4) Reforça permissão de SELECT permissivo (não muda semântica,
--     só garante que a leitura continua funcionando — fica explícito
--     que o único fechamento é no UPDATE).
--     Não recria se já existir com essa forma.
drop policy if exists "leads_read_all" on public.leads;
create policy "leads_read_all" on public.leads
  for select
  using (true);

commit;

-- =====================================================================
-- VERIFICAÇÃO (execute em staging antes de aplicar em produção)
-- =====================================================================
-- (A) Lista as policies ativas em public.leads. Deve mostrar:
--     • leads_read_all      | SELECT | using: true
--     • leads_update_own    | UPDATE | using/check: owner_id = jwt.sub
--     + as policies de INSERT/DELETE que já existiam antes.
select
  polname                                            as policy_name,
  case polcmd
    when 'r' then 'SELECT'
    when 'a' then 'INSERT'
    when 'w' then 'UPDATE'
    when 'd' then 'DELETE'
    when '*' then 'ALL'
  end                                                as command,
  pg_get_expr(polqual,      polrelid)                as using_expr,
  pg_get_expr(polwithcheck, polrelid)                as with_check_expr
from pg_policy
where polrelid = 'public.leads'::regclass
order by policy_name;

-- (B) Confere que RLS está mesmo ativo:
select
  relname,
  relrowsecurity   as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where relname = 'leads'
  and relnamespace = 'public'::regnamespace;

-- (C) Simulação: pega um lead de amostra + owner, útil para o operador
--     conferir manualmente se algum dado inconsistente (owner_id NULL,
--     por exemplo) vai ser afetado.
--     ATENÇÃO: lead com owner_id NULL fica INEDITÁVEL por qualquer
--     usuário via anon-key (só service-role no Worker consegue).
--     Se isso for problema, rode um UPDATE de saneamento definindo
--     um owner padrão ANTES de aplicar em produção.
select
  count(*) filter (where owner_id is null)     as leads_sem_dono,
  count(*) filter (where owner_id is not null) as leads_com_dono,
  count(*)                                     as total
from public.leads;
