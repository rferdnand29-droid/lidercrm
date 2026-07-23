-- =====================================================================
-- LIDER CRM — SQL de bootstrap completo para Supabase
-- Data de referência: 2026-07-19
-- Projeto: https://xwajiwjpecanxaqlxzkt.supabase.co
-- ---------------------------------------------------------------------
-- COMO USAR:
--   1) Abra o SQL Editor do seu projeto Supabase.
--   2) Cole TODO o conteúdo deste arquivo em um único bloco.
--   3) Clique em RUN. Deve terminar sem erros ("Success. No rows returned").
--   4) NENHUMA edição manual é necessária. O usuário admin já é criado.
--
-- CONTEÚDO:
--   • Extensões necessárias (pgcrypto)
--   • Tabela fs_documents (compat com o Worker atual — obrigatória)
--   • 25 tabelas relacionais (users, roles, permissions, teams, leads,
--     business, clients, activities, activity_history, lead_history,
--     notes, tags, notifications, messenger, attachments, settings,
--     audit_logs, login_history, device_sessions, custom_fields,
--     funnels, stages, pipelines + tabelas de junção)
--   • Índices, Foreign Keys e triggers de updated_at
--   • Row Level Security + policies (permissivas por padrão — o Worker
--     usa a Anon Key e faz a autorização no backend via JWT)
--   • Storage buckets (lidercrm-files, lidercrm-avatars)
--   • Realtime habilitado nas tabelas relevantes
--   • Seed: admin@lidercrm.com / Admin@2026! (em fs_documents + users)
--   • Dados iniciais: 5 roles, permissões, funil padrão, stages padrão
--
-- SEGURANÇA:
--   As policies RLS aqui são PERMISSIVAS (using true) porque o backend
--   do CRM (Cloudflare Pages Functions) é quem faz a autorização real
--   via JWT. Se um dia você migrar para chamar Supabase direto do
--   navegador, endureça essas policies com auth.uid() = user_id.
-- =====================================================================

-- ---------------------------------------------------------------------
-- EXTENSÕES
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------
-- FUNÇÃO utilitária: updated_at automático
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- 1) fs_documents — tabela usada pelo Worker atual (Firestore-emulado)
--    OBRIGATÓRIA. NÃO REMOVER.
-- =====================================================================
create table if not exists public.fs_documents (
  path text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_fs_documents_updated_at on public.fs_documents;
create trigger trg_fs_documents_updated_at
before update on public.fs_documents
for each row execute function public.set_updated_at();

alter table public.fs_documents enable row level security;

drop policy if exists "fs_documents_read_all"   on public.fs_documents;
drop policy if exists "fs_documents_insert_all" on public.fs_documents;
drop policy if exists "fs_documents_update_all" on public.fs_documents;
drop policy if exists "fs_documents_delete_all" on public.fs_documents;

create policy "fs_documents_read_all"   on public.fs_documents for select using (true);
create policy "fs_documents_insert_all" on public.fs_documents for insert with check (true);
create policy "fs_documents_update_all" on public.fs_documents for update using (true) with check (true);
create policy "fs_documents_delete_all" on public.fs_documents for delete using (true);

create index if not exists idx_fs_documents_path_prefix on public.fs_documents (path text_pattern_ops);

-- =====================================================================
-- 2) roles — 5 papéis pedidos
-- =====================================================================
create table if not exists public.roles (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  description  text,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_roles_updated_at on public.roles;
create trigger trg_roles_updated_at before update on public.roles
for each row execute function public.set_updated_at();

insert into public.roles (slug, name, description, is_system) values
  ('adm',           'Administrador', 'Acesso total ao sistema.',                     true),
  ('gerente',       'Gerente',       'Gerencia equipe, leads, funis e relatórios.',  true),
  ('administrativo','Administrativo','Acesso administrativo restrito.',              true),
  ('consultor',     'Consultor',     'Trabalha os leads e clientes atribuídos.',     true),
  ('visualizador',  'Visualizador',  'Somente leitura.',                             true)
on conflict (slug) do nothing;

-- =====================================================================
-- 3) permissions — cada permissão INDEPENDENTE
-- =====================================================================
create table if not exists public.permissions (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  category     text,
  description  text,
  created_at   timestamptz not null default now()
);

insert into public.permissions (slug, name, category, description) values
  ('leads.view',           'Ver leads',            'leads',        'Ver leads no sistema'),
  ('leads.create',         'Criar leads',          'leads',        'Cadastrar novos leads'),
  ('leads.update',         'Editar leads',         'leads',        'Alterar leads existentes'),
  ('leads.delete',         'Excluir leads',        'leads',        'Remover leads'),
  ('leads.assign',         'Atribuir leads',       'leads',        'Atribuir leads a consultores'),
  ('clients.view',         'Ver clientes',         'clients',      'Ver clientes'),
  ('clients.create',       'Criar clientes',       'clients',      'Cadastrar novos clientes'),
  ('clients.update',       'Editar clientes',      'clients',      'Alterar clientes'),
  ('clients.delete',       'Excluir clientes',     'clients',      'Remover clientes'),
  ('business.view',        'Ver negócios',         'business',     'Ver oportunidades/negócios'),
  ('business.create',      'Criar negócios',       'business',     'Cadastrar oportunidades'),
  ('business.update',      'Editar negócios',      'business',     'Alterar negócios'),
  ('business.delete',      'Excluir negócios',     'business',     'Remover negócios'),
  ('activities.view',      'Ver atividades',       'activities',   'Ver agenda/atividades'),
  ('activities.create',    'Criar atividades',     'activities',   'Cadastrar atividades'),
  ('activities.update',    'Editar atividades',    'activities',   'Alterar atividades'),
  ('activities.delete',    'Excluir atividades',   'activities',   'Remover atividades'),
  ('users.view',           'Ver usuários',         'users',        'Ver lista de usuários'),
  ('users.create',         'Criar usuários',       'users',        'Cadastrar novos usuários'),
  ('users.update',         'Editar usuários',      'users',        'Alterar usuários'),
  ('users.delete',         'Excluir usuários',     'users',        'Remover usuários'),
  ('teams.manage',         'Gerenciar equipes',    'teams',        'Criar/alterar equipes'),
  ('funnels.manage',       'Gerenciar funis',      'funnels',      'Criar/alterar funis e stages'),
  ('reports.view',         'Ver relatórios',       'reports',      'Acessar dashboards e relatórios'),
  ('settings.manage',      'Configurações',        'settings',     'Alterar configurações globais'),
  ('audit.view',           'Ver auditoria',        'audit',        'Ver logs de auditoria')
on conflict (slug) do nothing;

-- role_permissions (junção)
create table if not exists public.role_permissions (
  role_id       uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- Semeia relações role -> permissions (Administrador tem TUDO)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r cross join public.permissions p
 where r.slug = 'adm'
on conflict do nothing;

-- Gerente: quase tudo, menos users.delete e settings.manage
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.slug in (
    'leads.view','leads.create','leads.update','leads.delete','leads.assign',
    'clients.view','clients.create','clients.update','clients.delete',
    'business.view','business.create','business.update','business.delete',
    'activities.view','activities.create','activities.update','activities.delete',
    'users.view','users.create','users.update',
    'teams.manage','funnels.manage','reports.view')
 where r.slug = 'gerente'
on conflict do nothing;

-- Administrativo: cadastros e visão, sem excluir
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.slug in (
    'leads.view','leads.create','leads.update',
    'clients.view','clients.create','clients.update',
    'business.view','business.create','business.update',
    'activities.view','activities.create','activities.update',
    'users.view','reports.view')
 where r.slug = 'administrativo'
on conflict do nothing;

-- Consultor: trabalha o operacional
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.slug in (
    'leads.view','leads.create','leads.update',
    'clients.view','clients.create','clients.update',
    'business.view','business.create','business.update',
    'activities.view','activities.create','activities.update')
 where r.slug = 'consultor'
on conflict do nothing;

-- Visualizador: só leitura
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r
  join public.permissions p on p.slug in (
    'leads.view','clients.view','business.view','activities.view','reports.view')
 where r.slug = 'visualizador'
on conflict do nothing;

-- =====================================================================
-- 4) teams
-- =====================================================================
create table if not exists public.teams (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text unique,
  description  text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_teams_updated_at on public.teams;
create trigger trg_teams_updated_at before update on public.teams
for each row execute function public.set_updated_at();

-- =====================================================================
-- 5) users — espelha em relacional os usuários do CRM
--    (o login continua funcionando pelo Worker via fs_documents;
--     esta tabela existe para futuras integrações e para RLS relacional)
-- =====================================================================
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  email         text unique not null,
  full_name     text,
  phone         text,
  avatar_url    text,
  role_id       uuid references public.roles(id) on delete set null,
  team_id       uuid references public.teams(id) on delete set null,
  active        boolean not null default true,
  password_hash text,          -- formato pbkdf2$iters$salt$hash (compat Worker)
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at before update on public.users
for each row execute function public.set_updated_at();

create index if not exists idx_users_email    on public.users (lower(email));
create index if not exists idx_users_role     on public.users (role_id);
create index if not exists idx_users_team     on public.users (team_id);
create index if not exists idx_users_active   on public.users (active);

-- team_members (junção)
create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  is_leader boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- =====================================================================
-- 6) funnels, stages, pipelines
-- =====================================================================
create table if not exists public.funnels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  description text,
  is_default  boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_funnels_updated_at on public.funnels;
create trigger trg_funnels_updated_at before update on public.funnels
for each row execute function public.set_updated_at();

create table if not exists public.stages (
  id         uuid primary key default gen_random_uuid(),
  funnel_id  uuid not null references public.funnels(id) on delete cascade,
  name       text not null,
  slug       text,
  position   int  not null default 0,
  color      text,
  won        boolean not null default false,
  lost       boolean not null default false,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_stages_updated_at on public.stages;
create trigger trg_stages_updated_at before update on public.stages
for each row execute function public.set_updated_at();

create index if not exists idx_stages_funnel   on public.stages (funnel_id);
create index if not exists idx_stages_position on public.stages (funnel_id, position);

create table if not exists public.pipelines (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  funnel_id   uuid references public.funnels(id) on delete set null,
  team_id     uuid references public.teams(id)   on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_pipelines_updated_at on public.pipelines;
create trigger trg_pipelines_updated_at before update on public.pipelines
for each row execute function public.set_updated_at();

-- =====================================================================
-- 7) tags (globais, aplicáveis a leads/clients/business)
-- =====================================================================
create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique,
  color      text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 8) leads
-- =====================================================================
create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  full_name      text not null,
  email          text,
  phone          text,
  document       text,
  source         text,
  status         text default 'novo',
  stage_id       uuid references public.stages(id)  on delete set null,
  funnel_id      uuid references public.funnels(id) on delete set null,
  owner_id       uuid references public.users(id)   on delete set null,
  team_id        uuid references public.teams(id)   on delete set null,
  value          numeric(14,2) default 0,
  expected_close date,
  notes          text,
  extra          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at before update on public.leads
for each row execute function public.set_updated_at();

create index if not exists idx_leads_owner   on public.leads (owner_id);
create index if not exists idx_leads_stage   on public.leads (stage_id);
create index if not exists idx_leads_funnel  on public.leads (funnel_id);
create index if not exists idx_leads_status  on public.leads (status);
create index if not exists idx_leads_email   on public.leads (lower(email));
create index if not exists idx_leads_phone   on public.leads (phone);
create index if not exists idx_leads_created on public.leads (created_at desc);

-- lead_tags
create table if not exists public.lead_tags (
  lead_id uuid not null references public.leads(id) on delete cascade,
  tag_id  uuid not null references public.tags(id)  on delete cascade,
  primary key (lead_id, tag_id)
);

-- =====================================================================
-- 9) clients
-- =====================================================================
create table if not exists public.clients (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,
  full_name    text not null,
  email        text,
  phone        text,
  document     text,
  company      text,
  address      text,
  city         text,
  state        text,
  zip          text,
  owner_id     uuid references public.users(id) on delete set null,
  team_id      uuid references public.teams(id) on delete set null,
  lead_id      uuid references public.leads(id) on delete set null,
  extra        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at before update on public.clients
for each row execute function public.set_updated_at();

create index if not exists idx_clients_owner on public.clients (owner_id);
create index if not exists idx_clients_email on public.clients (lower(email));
create index if not exists idx_clients_phone on public.clients (phone);

-- client_tags
create table if not exists public.client_tags (
  client_id uuid not null references public.clients(id) on delete cascade,
  tag_id    uuid not null references public.tags(id)    on delete cascade,
  primary key (client_id, tag_id)
);

-- =====================================================================
-- 10) business (oportunidades / negócios)
-- =====================================================================
create table if not exists public.business (
  id             uuid primary key default gen_random_uuid(),
  legacy_id      text unique,
  title          text not null,
  description    text,
  lead_id        uuid references public.leads(id)    on delete set null,
  client_id      uuid references public.clients(id)  on delete set null,
  stage_id       uuid references public.stages(id)   on delete set null,
  funnel_id      uuid references public.funnels(id)  on delete set null,
  owner_id       uuid references public.users(id)    on delete set null,
  team_id        uuid references public.teams(id)    on delete set null,
  status         text default 'open',   -- open / won / lost
  value          numeric(14,2) default 0,
  probability    int default 0,         -- 0..100
  expected_close date,
  closed_at      timestamptz,
  extra          jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists trg_business_updated_at on public.business;
create trigger trg_business_updated_at before update on public.business
for each row execute function public.set_updated_at();

create index if not exists idx_business_owner   on public.business (owner_id);
create index if not exists idx_business_stage   on public.business (stage_id);
create index if not exists idx_business_funnel  on public.business (funnel_id);
create index if not exists idx_business_status  on public.business (status);
create index if not exists idx_business_client  on public.business (client_id);
create index if not exists idx_business_lead    on public.business (lead_id);

-- =====================================================================
-- 11) activities (agenda / tarefas / ligações)
-- =====================================================================
create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text unique,
  kind          text not null,              -- call, meeting, task, note, whatsapp, email
  title         text not null,
  description   text,
  status        text default 'pending',     -- pending, done, canceled
  due_at        timestamptz,
  completed_at  timestamptz,
  duration_min  int,
  owner_id      uuid references public.users(id)   on delete set null,
  lead_id       uuid references public.leads(id)   on delete cascade,
  client_id     uuid references public.clients(id) on delete cascade,
  business_id   uuid references public.business(id) on delete cascade,
  team_id       uuid references public.teams(id)   on delete set null,
  extra         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_activities_updated_at on public.activities;
create trigger trg_activities_updated_at before update on public.activities
for each row execute function public.set_updated_at();

create index if not exists idx_activities_owner    on public.activities (owner_id);
create index if not exists idx_activities_due      on public.activities (due_at);
create index if not exists idx_activities_status   on public.activities (status);
create index if not exists idx_activities_lead     on public.activities (lead_id);
create index if not exists idx_activities_client   on public.activities (client_id);
create index if not exists idx_activities_business on public.activities (business_id);

-- =====================================================================
-- 12) activity_history — histórico completo por atividade
-- =====================================================================
create table if not exists public.activity_history (
  id          uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  event       text not null,              -- created, updated, completed, canceled, note_added
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_activity_history_activity on public.activity_history (activity_id);
create index if not exists idx_activity_history_created  on public.activity_history (created_at desc);

-- =====================================================================
-- 13) lead_history — histórico por lead
-- =====================================================================
create table if not exists public.lead_history (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  user_id    uuid references public.users(id) on delete set null,
  event      text not null,               -- created, stage_changed, assigned, note, converted
  from_value text,
  to_value   text,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_history_lead    on public.lead_history (lead_id);
create index if not exists idx_lead_history_created on public.lead_history (created_at desc);

-- =====================================================================
-- 14) notes — notas genéricas
-- =====================================================================
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  entity_type text not null,              -- lead, client, business, activity
  entity_id   uuid not null,
  user_id     uuid references public.users(id) on delete set null,
  body        text not null,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_notes_updated_at on public.notes;
create trigger trg_notes_updated_at before update on public.notes
for each row execute function public.set_updated_at();

create index if not exists idx_notes_entity on public.notes (entity_type, entity_id);

-- =====================================================================
-- 15) notifications
-- =====================================================================
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade,
  kind       text not null,               -- info, warn, error, task, message
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user   on public.notifications (user_id);
create index if not exists idx_notifications_unread on public.notifications (user_id, read_at);
create index if not exists idx_notifications_created on public.notifications (created_at desc);

-- =====================================================================
-- 16) messenger — mensagens do chat interno (não substitui Backblaze)
-- =====================================================================
create table if not exists public.messenger (
  id            uuid primary key default gen_random_uuid(),
  thread_key    text not null,               -- ex: "u:{userA}:{userB}" ou "team:{teamId}"
  from_user_id  uuid references public.users(id) on delete set null,
  to_user_id    uuid references public.users(id) on delete set null,
  body          text,
  attachment_id uuid,
  read_at       timestamptz,
  extra         jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_messenger_thread  on public.messenger (thread_key, created_at desc);
create index if not exists idx_messenger_to_user on public.messenger (to_user_id, read_at);
create index if not exists idx_messenger_from    on public.messenger (from_user_id);

-- =====================================================================
-- 17) attachments — metadados de anexos (Backblaze OU Supabase Storage)
-- =====================================================================
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,               -- lead, client, business, activity, message, note
  entity_id    uuid,
  provider     text not null default 'backblaze', -- backblaze | supabase
  bucket       text,
  object_key   text not null,
  file_name    text,
  content_type text,
  size_bytes   bigint,
  uploaded_by  uuid references public.users(id) on delete set null,
  public_url   text,
  extra        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_attachments_entity   on public.attachments (entity_type, entity_id);
create index if not exists idx_attachments_provider on public.attachments (provider);

-- =====================================================================
-- 18) settings — chave/valor global e por usuário
-- =====================================================================
create table if not exists public.settings (
  id         uuid primary key default gen_random_uuid(),
  scope      text not null default 'global', -- global, user, team
  scope_id   uuid,                            -- user_id ou team_id (null se global)
  key        text not null,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (scope, scope_id, key)
);

drop trigger if exists trg_settings_updated_at on public.settings;
create trigger trg_settings_updated_at before update on public.settings
for each row execute function public.set_updated_at();

-- =====================================================================
-- 19) audit_logs
-- =====================================================================
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.users(id) on delete set null,
  action      text not null,                -- create, update, delete, login, logout, permission_change
  entity_type text,
  entity_id   uuid,
  ip          text,
  user_agent  text,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_user    on public.audit_logs (user_id);
create index if not exists idx_audit_entity  on public.audit_logs (entity_type, entity_id);
create index if not exists idx_audit_created on public.audit_logs (created_at desc);

-- =====================================================================
-- 20) login_history
-- =====================================================================
create table if not exists public.login_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.users(id) on delete cascade,
  email      text,
  success    boolean not null default true,
  ip         text,
  user_agent text,
  reason     text,
  created_at timestamptz not null default now()
);

create index if not exists idx_login_history_user on public.login_history (user_id);
create index if not exists idx_login_history_created on public.login_history (created_at desc);

-- =====================================================================
-- 21) device_sessions
-- =====================================================================
create table if not exists public.device_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  device_id     text,
  device_name   text,
  platform      text,                       -- web, android, ios
  push_token    text,
  ip            text,
  user_agent    text,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_device_sessions_user on public.device_sessions (user_id);
create index if not exists idx_device_sessions_last on public.device_sessions (last_seen_at desc);

-- =====================================================================
-- 22) custom_fields — campos dinâmicos por entidade
-- =====================================================================
create table if not exists public.custom_fields (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,               -- lead, client, business, activity
  slug         text not null,
  label        text not null,
  field_type   text not null default 'text',-- text, number, date, select, boolean
  options      jsonb,
  required     boolean not null default false,
  position     int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (entity_type, slug)
);

drop trigger if exists trg_custom_fields_updated_at on public.custom_fields;
create trigger trg_custom_fields_updated_at before update on public.custom_fields
for each row execute function public.set_updated_at();

-- =====================================================================
-- 23) VIEW útil: v_users_full (user + role + team)
-- =====================================================================
create or replace view public.v_users_full as
select
  u.id, u.legacy_id, u.email, u.full_name, u.phone, u.avatar_url, u.active,
  u.last_login_at, u.created_at, u.updated_at,
  r.slug as role_slug, r.name as role_name,
  t.name as team_name
from public.users u
left join public.roles r on r.id = u.role_id
left join public.teams t on t.id = u.team_id;

-- =====================================================================
-- RLS + policies permissivas (o Worker faz autorização real via JWT)
-- =====================================================================
do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'roles','permissions','role_permissions','teams','team_members',
      'users','funnels','stages','pipelines','tags',
      'leads','lead_tags','clients','client_tags','business',
      'activities','activity_history','lead_history','notes',
      'notifications','messenger','attachments','settings',
      'audit_logs','login_history','device_sessions','custom_fields'
    ])
  loop
    execute format('alter table public.%I enable row level security;', tbl);

    execute format('drop policy if exists "%I_read_all"   on public.%I;', tbl, tbl);
    execute format('drop policy if exists "%I_insert_all" on public.%I;', tbl, tbl);
    execute format('drop policy if exists "%I_update_all" on public.%I;', tbl, tbl);
    execute format('drop policy if exists "%I_delete_all" on public.%I;', tbl, tbl);

    execute format('create policy "%I_read_all"   on public.%I for select using (true);', tbl, tbl);
    execute format('create policy "%I_insert_all" on public.%I for insert with check (true);', tbl, tbl);
    execute format('create policy "%I_update_all" on public.%I for update using (true) with check (true);', tbl, tbl);
    execute format('create policy "%I_delete_all" on public.%I for delete using (true);', tbl, tbl);
  end loop;
end $$;

-- =====================================================================
-- STORAGE BUCKETS
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('lidercrm-files', 'lidercrm-files', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('lidercrm-avatars', 'lidercrm-avatars', true)
on conflict (id) do nothing;

drop policy if exists "lidercrm_files_read_all"   on storage.objects;
drop policy if exists "lidercrm_files_insert_all" on storage.objects;
drop policy if exists "lidercrm_files_update_all" on storage.objects;
drop policy if exists "lidercrm_files_delete_all" on storage.objects;

create policy "lidercrm_files_read_all"
  on storage.objects for select
  using (bucket_id in ('lidercrm-files','lidercrm-avatars'));

create policy "lidercrm_files_insert_all"
  on storage.objects for insert
  with check (bucket_id in ('lidercrm-files','lidercrm-avatars'));

create policy "lidercrm_files_update_all"
  on storage.objects for update
  using  (bucket_id in ('lidercrm-files','lidercrm-avatars'))
  with check (bucket_id in ('lidercrm-files','lidercrm-avatars'));

create policy "lidercrm_files_delete_all"
  on storage.objects for delete
  using (bucket_id in ('lidercrm-files','lidercrm-avatars'));

-- =====================================================================
-- REALTIME — habilitar publicação nas tabelas relevantes
-- =====================================================================
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'fs_documents','leads','clients','business','activities',
    'notifications','messenger','activity_history','lead_history'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception when duplicate_object then
      -- tabela já está na publicação
      null;
    when others then
      -- ignora se a publicação não existe (ex.: projetos sem realtime)
      null;
    end;
  end loop;
end $$;

-- =====================================================================
-- SEED: FUNIL PADRÃO + STAGES
-- =====================================================================
insert into public.funnels (name, slug, description, is_default)
values ('Funil Padrão', 'padrao', 'Funil de vendas inicial do CRM.', true)
on conflict (slug) do nothing;

insert into public.stages (funnel_id, name, slug, position, color, won, lost)
select f.id, s.name, s.slug, s.position, s.color, s.won, s.lost
from public.funnels f
cross join (values
  ('Novo Lead',      'novo',        0, '#60a5fa', false, false),
  ('Em Contato',     'contato',     1, '#a78bfa', false, false),
  ('Qualificado',    'qualificado', 2, '#facc15', false, false),
  ('Proposta',       'proposta',    3, '#fb923c', false, false),
  ('Negociação',     'negociacao',  4, '#f97316', false, false),
  ('Ganho',          'ganho',       5, '#22c55e', true,  false),
  ('Perdido',        'perdido',     6, '#ef4444', false, true)
) as s(name, slug, position, color, won, lost)
where f.slug = 'padrao'
and not exists (
  select 1 from public.stages st where st.funnel_id = f.id and st.slug = s.slug
);

-- =====================================================================
-- SEED: ADMINISTRADOR
--   1) em public.users (relacional, futuro)
--   2) em public.fs_documents (compatibilidade com o Worker atual)
--   Senha: Admin@2026!   (hash PBKDF2 SHA-256, 210.000 iterações)
-- =====================================================================

-- 1) users relacional
insert into public.users (legacy_id, email, full_name, role_id, active, password_hash)
select
  'adm_root_2026',
  'admin@lidercrm.com',
  'Administrador',
  (select id from public.roles where slug = 'adm'),
  true,
  'pbkdf2$210000$f4485a3435d401de78f0972e31aae1e7$cd6233fc6766256b0d4190944569cf7028156c524b5e4199987315b7a2c089ff'
on conflict (email) do update
  set password_hash = excluded.password_hash,
      role_id       = excluded.role_id,
      active        = true,
      updated_at    = now();

-- 2) fs_documents — formato que o Worker atual sabe ler
-- Estrutura: config/users -> { items: [ {id,email,role,ativo,ph,...} ], ts }
-- (o Worker consulta config/users e config/users/items/<id>)
insert into public.fs_documents (path, data)
values (
  'config/users',
  jsonb_build_object(
    'items', jsonb_build_array(
      jsonb_build_object(
        'id',    'adm_root_2026',
        'nome',  'Administrador',
        'email', 'admin@lidercrm.com',
        'role',  'adm',
        'ativo', true,
        'cor',   0,
        'ph',    'pbkdf2$210000$f4485a3435d401de78f0972e31aae1e7$cd6233fc6766256b0d4190944569cf7028156c524b5e4199987315b7a2c089ff'
      )
    ),
    'ts', floor(extract(epoch from now()) * 1000)
  )
)
on conflict (path) do update
set data       = excluded.data,
    updated_at = now();

-- Documento espelho: config/users/items/adm_root_2026
insert into public.fs_documents (path, data)
values (
  'config/users/items/adm_root_2026',
  jsonb_build_object(
    'id',    'adm_root_2026',
    'nome',  'Administrador',
    'email', 'admin@lidercrm.com',
    'role',  'adm',
    'ativo', true,
    'cor',   0,
    'ph',    'pbkdf2$210000$f4485a3435d401de78f0972e31aae1e7$cd6233fc6766256b0d4190944569cf7028156c524b5e4199987315b7a2c089ff'
  )
)
on conflict (path) do update
set data       = excluded.data,
    updated_at = now();

-- =====================================================================
-- SEED: CONFIGURAÇÕES PADRÃO
-- =====================================================================
insert into public.settings (scope, scope_id, key, value)
values
  ('global', null, 'app.name',                to_jsonb('Lider CRM'::text)),
  ('global', null, 'app.version',             to_jsonb('1.0.0'::text)),
  ('global', null, 'app.timezone',            to_jsonb('America/Sao_Paulo'::text)),
  ('global', null, 'features.realtime',       to_jsonb(true)),
  ('global', null, 'features.offline_queue',  to_jsonb(true))
on conflict (scope, scope_id, key) do nothing;

-- =====================================================================
-- VALIDAÇÃO (opcional — descomente se quiser conferir)
-- =====================================================================
-- select count(*) as total_tabelas from information_schema.tables where table_schema='public';
-- select slug, name from public.roles order by slug;
-- select count(*) as total_permissions from public.permissions;
-- select email, active from public.users;
-- select path from public.fs_documents order by path;
-- select id, name, public from storage.buckets where id like 'lidercrm-%';
