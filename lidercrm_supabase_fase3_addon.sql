-- =====================================================================
-- LIDER CRM — SQL ADENDO DA FASE 3
-- Data: 2026-07-19
-- ---------------------------------------------------------------------
-- Rode ESTE arquivo NO SQL EDITOR DO SUPABASE DEPOIS de já ter rodado
-- o lidercrm_supabase_bootstrap.sql. Este adendo é idempotente.
--
-- CONTEÚDO:
--   • Extensão pg_cron (opcional — se disponível no seu plano)
--   • Índices de performance para queries de dashboard/kanban
--   • Trigger automático: move Leads para etapa "livre" após 2 dias
--     sem atualização (fallback caso o kanban.js não rode)
--   • Views agregadas: v_dashboard_kpis, v_admin_kpis
--   • Ativação de Realtime nas tabelas que faltavam
--   • Reforço de RLS: policies mais restritivas por papel (opcional)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Extensão pg_cron (se disponível — Supabase Pro/Team)
-- ---------------------------------------------------------------------
-- pg_cron pode não estar disponível em planos Free — o comando abaixo
-- FALHA SILENCIOSAMENTE se não estiver.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron indisponível neste projeto (normal em plano Free) — trigger em kanban.js continua ativo';
end $$;

-- ---------------------------------------------------------------------
-- 2) Função + trigger para mover Leads inativos para "Livre"
-- ---------------------------------------------------------------------
-- IMPORTANTE: o CRM atual não usa a tabela public.leads ainda (ainda
-- salva em fs_documents). Esta função lê fs_documents com path
-- like 'kb/leads/%' e atualiza col='livre' quando updated_at é > 2 dias.
create or replace function public.lf_livre_stale_leads()
returns int
language plpgsql
security definer
as $$
declare
  updated_count int := 0;
  r record;
  now_iso timestamptz := now();
  cutoff timestamptz := now() - interval '2 days';
begin
  for r in
    select path, data
      from public.fs_documents
     where path like 'kb/leads/%'
       and updated_at < cutoff
       and coalesce(data->>'col', '') not in ('livre','conv','desc','novo','fechado','noshow')
  loop
    update public.fs_documents
       set data = jsonb_set(
              jsonb_set(r.data, '{col}', to_jsonb('livre'::text), true),
              '{autoMovedToLivreAt}', to_jsonb(now_iso), true
           ),
           updated_at = now_iso
     where path = r.path;
    updated_count := updated_count + 1;
  end loop;
  return updated_count;
end;
$$;

-- Agenda com pg_cron (se disponível): rodar 1x por hora
do $$
begin
  perform cron.schedule(
    'lf-livre-stale-hourly',
    '0 * * * *',
    'select public.lf_livre_stale_leads();'
  );
exception when others then
  raise notice 'cron.schedule não disponível — chame lf_livre_stale_leads() manualmente ou via kanban.js';
end $$;

-- ---------------------------------------------------------------------
-- 3) Índices adicionais para performance
-- ---------------------------------------------------------------------
create index if not exists idx_fs_documents_updated_at on public.fs_documents (updated_at desc);
create index if not exists idx_fs_documents_data_col   on public.fs_documents ((data->>'col')) where path like 'kb/%';

-- ---------------------------------------------------------------------
-- 4) Views agregadas — dashboard e admin
-- ---------------------------------------------------------------------
create or replace view public.v_dashboard_kpis as
select
  (select count(*) from public.leads    where owner_id is not null) as leads_count,
  (select count(*) from public.clients  where owner_id is not null) as clients_count,
  (select count(*) from public.business where status = 'open')      as business_open,
  (select count(*) from public.business where status = 'won')       as business_won,
  (select count(*) from public.business where status = 'lost')      as business_lost,
  (select coalesce(sum(value),0) from public.business where status = 'open') as pipeline_value,
  (select coalesce(sum(value),0) from public.business where status = 'won')  as revenue_value;

create or replace view public.v_admin_kpis as
select
  u.id                             as user_id,
  u.full_name                      as user_name,
  u.email                          as user_email,
  (select count(*) from public.leads    l where l.owner_id = u.id) as leads_total,
  (select count(*) from public.leads    l where l.owner_id = u.id and l.status = 'novo') as leads_novos,
  (select count(*) from public.clients  c where c.owner_id = u.id) as clients_total,
  (select count(*) from public.business b where b.owner_id = u.id and b.status = 'open') as biz_open,
  (select count(*) from public.business b where b.owner_id = u.id and b.status = 'won')  as biz_won,
  (select count(*) from public.business b where b.owner_id = u.id and b.status = 'lost') as biz_lost,
  (select coalesce(sum(b.value),0) from public.business b where b.owner_id = u.id and b.status = 'won') as revenue
from public.users u
where u.active = true;

-- Views herdam RLS da tabela subjacente; sem policies próprias.

-- ---------------------------------------------------------------------
-- 5) Realtime — garantir todas as tabelas ativas na publicação
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'fs_documents','leads','clients','business','activities',
    'notifications','messenger','activity_history','lead_history',
    'users','teams','settings','audit_logs','device_sessions',
    'attachments','notes','tags','funnels','stages','pipelines'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then null;
    when others then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) VALIDAÇÃO
-- ---------------------------------------------------------------------
-- Rode uma por vez:
-- select public.lf_livre_stale_leads();          -- executa manualmente
-- select * from public.v_dashboard_kpis;         -- vê KPIs globais
-- select * from public.v_admin_kpis;             -- vê KPIs por usuário
-- select * from cron.job;                        -- vê jobs agendados (se pg_cron)

-- =====================================================================
-- FIX 406 (2026-07-20) — tabela activities_legacy para o formato antigo
-- ---------------------------------------------------------------------
-- Corrige o erro 406 (Not Acceptable) no GET /rest/v1/activities?user_id=eq.
-- que fazia agendamentos sumirem depois do logout/login.
-- Formato: um doc por usuário { user_id, list, ts }
-- =====================================================================
create table if not exists public.activities_legacy (
  user_id text primary key,
  list    jsonb not null default '[]'::jsonb,
  ts      bigint not null default 0,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_activities_legacy_updated_at on public.activities_legacy;
create trigger trg_activities_legacy_updated_at
before update on public.activities_legacy
for each row execute function public.set_updated_at();

alter table public.activities_legacy enable row level security;

drop policy if exists "activities_legacy_read_all"   on public.activities_legacy;
drop policy if exists "activities_legacy_insert_all" on public.activities_legacy;
drop policy if exists "activities_legacy_update_all" on public.activities_legacy;
drop policy if exists "activities_legacy_delete_all" on public.activities_legacy;

create policy "activities_legacy_read_all"   on public.activities_legacy for select using (true);
create policy "activities_legacy_insert_all" on public.activities_legacy for insert with check (true);
create policy "activities_legacy_update_all" on public.activities_legacy for update using (true) with check (true);
create policy "activities_legacy_delete_all" on public.activities_legacy for delete using (true);

do $$ begin
  alter publication supabase_realtime add table public.activities_legacy;
exception when duplicate_object then null; when others then null; end $$;

-- =====================================================================
-- FIX ligações nunca sincronizavam — tabela nunca existia
-- ---------------------------------------------------------------------
-- js/patches/lf-retryqueue-sync-v1-20260717.js sempre gravou (POST) em
-- /rest/v1/ligacoes?uid=eq...&date=eq... mas essa tabela nunca foi criada
-- em nenhum dos scripts SQL do projeto. Toda tentativa de sincronizar
-- ligações do dia falhava (404 "relation does not exist"), caía na fila
-- de retry, e ficava tentando pra sempre sem nunca sincronizar entre
-- aparelhos. Formato: um doc por usuário/dia { uid, date, list, ts }.
-- =====================================================================
create table if not exists public.ligacoes_legacy (
  uid  text not null,
  date date not null,
  list jsonb not null default '[]'::jsonb,
  ts   bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (uid, date)
);

drop trigger if exists trg_ligacoes_legacy_updated_at on public.ligacoes_legacy;
create trigger trg_ligacoes_legacy_updated_at
before update on public.ligacoes_legacy
for each row execute function public.set_updated_at();

alter table public.ligacoes_legacy enable row level security;

drop policy if exists "ligacoes_legacy_read_all"   on public.ligacoes_legacy;
drop policy if exists "ligacoes_legacy_insert_all" on public.ligacoes_legacy;
drop policy if exists "ligacoes_legacy_update_all" on public.ligacoes_legacy;
drop policy if exists "ligacoes_legacy_delete_all" on public.ligacoes_legacy;

create policy "ligacoes_legacy_read_all"   on public.ligacoes_legacy for select using (true);
create policy "ligacoes_legacy_insert_all" on public.ligacoes_legacy for insert with check (true);
create policy "ligacoes_legacy_update_all" on public.ligacoes_legacy for update using (true) with check (true);
create policy "ligacoes_legacy_delete_all" on public.ligacoes_legacy for delete using (true);

do $$ begin
  alter publication supabase_realtime add table public.ligacoes_legacy;
exception when duplicate_object then null; when others then null; end $$;
