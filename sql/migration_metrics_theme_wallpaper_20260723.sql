-- =====================================================================
-- MIGRAÇÃO SQL: Correção de Métricas + Tema/Papel de Parede
-- Arquivo:  migration_metrics_theme_wallpaper_20260723.sql
-- Data:     2026-07-23
-- Autor:    Caçador de Bugs — sessão de correção do reporte:
--           "erro em todas as métricas do CRM e tema/papel de parede"
-- ---------------------------------------------------------------------
-- OBJETIVO
--   Espelhar no banco Supabase o que o front-end já foi corrigido para
--   consumir (guards em dashboard.js:274/291 + wallpaper canônico do
--   patch lf-wallpaper-transparency-v1-20260720.js), garantindo:
--
--     (A) Métricas do CRM leem dados consistentes de:
--           • public.leads      (Total / novos)
--           • public.business   (Fechamentos — col='fechado')
--           • public.activities (Pendências — done=false / status)
--           • public.clients    (Fonte legada 'cli/steps' — quando usada)
--         Todas com índices adequados aos filtros usados pelas telas
--         "Meu Painel" (mobile) e "Meus" (desktop) — Math.max entre
--         cli/steps e kb/negocios, ver renderDash / renderMobileDash.
--
--     (B) Persistência de Tema + Papel de parede:
--           • fs_documents em config/theme_<uid>   (light | classic)
--           • fs_documents em config/bg_<uid>      (id do bg)
--           • fs_documents em config/bgphoto_<uid> (foto quando bg=photo)
--           • fs_documents em config/logo          (global)
--           • fs_documents em config/crmname       (global)
--         Sem colidir com config/users/* (usado pelo LOGIN — INTOCÁVEL).
--
-- ---------------------------------------------------------------------
-- ⚠️  BLINDAGEM DE LOGIN — LEIA ANTES DE RODAR
-- ---------------------------------------------------------------------
--   Este script FOI ESCRITO para NÃO tocar em nada do login:
--
--     ❌ NÃO altera public.users     (colunas, PK, dados, seed do admin)
--     ❌ NÃO altera public.roles / permissions / role_permissions
--     ❌ NÃO deleta / altera linhas em fs_documents com path
--        começando por 'config/users/'  (isso guarda a senha e o role
--        do admin — o auth-controller lê exatamente esse path)
--     ❌ NÃO altera policy nenhuma de fs_documents (o Worker autoriza
--        via JWT; RLS já é permissivo com using(true) por design)
--     ❌ NÃO altera public.login_history / device_sessions / audit_logs
--     ❌ NÃO desativa RLS em nenhuma tabela existente
--
--   Rodar este SQL com login funcionando o mantém funcionando. Rodar
--   com login quebrado NÃO conserta login — mas também NÃO piora.
--
-- ---------------------------------------------------------------------
-- IDEMPOTÊNCIA
-- ---------------------------------------------------------------------
--   Todos os comandos usam IF NOT EXISTS / IF EXISTS / ON CONFLICT.
--   Pode rodar N vezes sem quebrar nada.
--
-- =====================================================================

begin;

-- =====================================================================
-- 0) Sanidade: garante extensões e função set_updated_at (do bootstrap)
--    NÃO recria a função se ela já estiver na forma correta — o
--    "create or replace" é seguro (função só troca o corpo, triggers
--    continuam apontando para ela).
-- =====================================================================
create extension if not exists pgcrypto;

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
-- PARTE A — MÉTRICAS
-- =====================================================================
-- As telas renderDash (desktop) e renderMobileDash (mobile) fazem:
--
--     tot   = Math.max(clientes_do_usuario, leads_do_usuario)
--     fech  = Math.max(clientes.steps[6]=true, business.col='fechado')
--     ag    = clientes.steps[0]=true
--     tx    = fech/ag
--     pend  = activities.filter(a => !a.done)
--
-- Portanto os índices abaixo sustentam esses filtros em ambas as
-- fontes (cli/steps legado + kanban relacional), evitando full-scan
-- quando a base cresce e o dashboard fica com aparência de "zerado"
-- porque a query estava demorando demais e o front-end abortava.
-- =====================================================================

-- A.1) LEADS ---------------------------------------------------------
--     Já tem idx_leads_owner e idx_leads_status pelo bootstrap.
--     Adicionamos um índice composto para o filtro comum
--     (owner_id, status) usado na tela "Meus" (desktop) — sem esse
--     composto, o planner escolhe idx_leads_owner e depois filtra
--     status na memória.
create index if not exists idx_leads_owner_status
  on public.leads (owner_id, status);

-- Índice parcial para leads "abertos" (o filtro de Pendências no
-- desktop conta leads não fechados). WHERE parcial mantém o índice
-- pequeno mesmo com histórico grande.
create index if not exists idx_leads_owner_open
  on public.leads (owner_id)
  where status is distinct from 'closed'
    and status is distinct from 'lost';


-- A.2) BUSINESS ------------------------------------------------------
--     "Fechamentos" = business.col='fechado' (kanban). Existe
--     idx_business_owner e idx_business_status. Adicionamos composto
--     para acelerar (owner, stage) que é o filtro real usado pelo
--     Math.max dos fechamentos.
create index if not exists idx_business_owner_stage
  on public.business (owner_id, stage_id);

-- Índice parcial: só negócios fechados (status='won' ou stage='fechado').
-- O front usa a coluna "col" do documento kanban (fs_documents), mas o
-- Worker já espelha esse estado no relacional via stage_id/status —
-- então esse índice é útil para o dashboard-controller relacional.
create index if not exists idx_business_owner_closed
  on public.business (owner_id)
  where status = 'won';


-- A.3) CLIENTS (fonte legada 'cli/steps') ----------------------------
--     A tela usa clientes.steps[0..6]. Isso hoje mora em fs_documents
--     (path clientes/list/<uid>), mas a versão relacional é usada pelo
--     dashboard-controller quando ele consulta agregados. Índices já
--     existem por owner/email/phone. Só falta um índice para o
--     campo "status" (normal/atendido/remarcar/noshow) que aparece
--     nos contadores cnt-normal / cnt-atendido / cnt-remarcar /
--     cnt-noshow em renderDash.
create index if not exists idx_clients_owner_status
  on public.clients (owner_id, status);


-- A.4) ACTIVITIES ---------------------------------------------------
--     "Pendências" = activities.filter(a => !a.done). Existe
--     idx_activities_owner + idx_activities_status pelo bootstrap.
--     Adicionamos parcial para pendentes (status <> 'done') —
--     essa é a query mais frequente da agenda + do KPI de mobile
--     ("mdash-kpi-pend"). Sem esse parcial o count() do KPI faz
--     seq-scan em toda a agenda quando o usuário tem muitas
--     atividades históricas concluídas.
create index if not exists idx_activities_owner_pending
  on public.activities (owner_id)
  where status is distinct from 'done';

-- Índice para "atividades recentes" (feed do mdash-recent):
-- ordena por created_at DESC, filtra por owner. O bootstrap já tem
-- idx_activities_due (por due_at); acrescentamos o de created_at
-- para o feed usar diretamente.
create index if not exists idx_activities_owner_created
  on public.activities (owner_id, created_at desc);


-- =====================================================================
-- PARTE B — TEMA + PAPEL DE PAREDE
-- =====================================================================
-- O front grava via /api/v1/usuarios/config?name=<name> os documentos:
--
--     config/theme_<uid>     { mode: 'light'|'classic', ts }
--     config/bg_<uid>        { id: 'default'|'navy'|...|'photo', ts }
--     config/bgphoto_<uid>   { url: '<data-url>|<https-url>', ts }
--     config/logo            { url: '...' }     (global, admin)
--     config/crmname         { name: '...' }    (global, admin)
--
-- Esses paths caem em public.fs_documents. NÃO alteramos a tabela
-- nem as policies dela (o Worker autoriza). O que fazemos aqui:
--
--   1. Garantir que existe um índice de prefixo por path (o bootstrap
--      já cria `idx_fs_documents_path_prefix` — mantido). Adicionamos
--      um índice de prefixo específico para os 3 paths mais lidos no
--      boot ("theme_", "bg_", "bgphoto_"), para o Worker não fazer
--      LIKE scan em toda a tabela quando 100+ usuários logam junto.
--
--   2. Nada mais. NÃO seedamos config/theme_<uid> nem config/bg_<uid>
--      por usuário — o padrão é fallback local ('light' + 'default')
--      até o usuário salvar preferência; forçar seed sobreporia
--      preferências já salvas em produção.
-- =====================================================================

-- B.1) Índice específico para os paths de tema/wallpaper -------------
--     Predicate parcial mantém o índice enxuto — só as ~3N linhas
--     de config/theme_*/bg_*/bgphoto_* + logo + crmname, não a
--     tabela inteira (que também guarda kanban, atividades, chat).
create index if not exists idx_fs_documents_theme_wallpaper
  on public.fs_documents (path text_pattern_ops)
  where path like 'config/theme_%'
     or path like 'config/bg_%'
     or path like 'config/bgphoto_%'
     or path = 'config/logo'
     or path = 'config/crmname';


-- B.2) View de conveniência (READ-ONLY) para diagnóstico rápido -----
--     Permite ao operador conferir no SQL Editor quais usuários já
--     salvaram tema/wallpaper e qual estado é o vigente. NÃO é usada
--     pelo app — é só telemetria para suporte.
--     drop-and-create para permitir mudar colunas sem migração.
drop view if exists public.v_user_theme_state;
create view public.v_user_theme_state as
select
  substring(path from 'config/theme_(.*)$')       as user_id_text,
  (data ->> 'mode')                                as theme_mode,
  to_timestamp(((data ->> 'ts')::bigint) / 1000)   as saved_at
from public.fs_documents
where path like 'config/theme_%';

drop view if exists public.v_user_wallpaper_state;
create view public.v_user_wallpaper_state as
select
  substring(path from 'config/bg_(.*)$')           as user_id_text,
  (data ->> 'id')                                  as bg_id,
  to_timestamp(((data ->> 'ts')::bigint) / 1000)   as saved_at
from public.fs_documents
where path like 'config/bg_%';


-- =====================================================================
-- PARTE C — SETTINGS relacional (não bloqueante, complementar)
-- =====================================================================
-- A tabela public.settings existe desde o bootstrap. Ela é usada
-- pelo settings-controller relacional (/api/v1/settings) para chaves
-- globais (app.name, app.version, timezone). O front-end atual guarda
-- tema/wallpaper em fs_documents (config/*), não aqui — deixamos os
-- índices/policies em paz.
--
-- Só GARANTIMOS: se a unique (scope, scope_id, key) por acaso foi
-- perdida numa restauração parcial, ela volta. NÃO altera dados.
-- =====================================================================
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid  = 'public.settings'::regclass
       and conname   = 'settings_scope_scope_id_key_key'
  ) then
    -- se por qualquer motivo o unique sumiu, recria; caso contrário,
    -- não faz nada (evita erro em ambientes onde o unique já existe
    -- com outro nome).
    begin
      alter table public.settings
        add constraint settings_scope_scope_id_key_key
        unique (scope, scope_id, key);
    exception when duplicate_table or duplicate_object then
      null;
    end;
  end if;
end $$;


commit;

-- =====================================================================
-- VERIFICAÇÃO (rode DEPOIS de aplicar em produção — read-only, seguro)
-- =====================================================================

-- (V1) Confere que os índices novos foram criados
select indexname, tablename
  from pg_indexes
 where schemaname = 'public'
   and indexname in (
     'idx_leads_owner_status',
     'idx_leads_owner_open',
     'idx_business_owner_stage',
     'idx_business_owner_closed',
     'idx_clients_owner_status',
     'idx_activities_owner_pending',
     'idx_activities_owner_created',
     'idx_fs_documents_theme_wallpaper'
   )
 order by tablename, indexname;

-- Resultado esperado: 8 linhas, uma por índice acima.


-- (V2) Confere que o login continua íntegro — usuário admin acessível
--      (leitura pura, não altera nada)
select
  (select count(*) from public.users
      where email = 'admin@lidercrm.com') as admin_relacional,
  (select count(*) from public.fs_documents
      where path   = 'config/users/items/adm') as admin_fs_documents,
  (select count(*) from public.roles
      where slug   = 'adm') as role_adm;

-- Resultado esperado: 1 | 1 | 1  (se qualquer valor for 0, o login
-- pode estar quebrado — mas NÃO por causa desta migração, é pré-existente).


-- (V3) Snapshot das métricas atuais para o admin (rápido, use LIMIT)
--      Ajuda a validar que os dados ESTÃO no banco (se este SELECT
--      retorna zeros mas a UI mostra zeros, o problema é backend/RLS;
--      se este retorna valores mas a UI mostra zeros, o problema é
--      front-end — que já foi corrigido nas sessões anteriores).
with admin as (
  select id from public.users where email = 'admin@lidercrm.com' limit 1
)
select
  (select count(*) from public.leads      l where l.owner_id = admin.id) as leads_do_admin,
  (select count(*) from public.business   b where b.owner_id = admin.id) as negocios_do_admin,
  (select count(*) from public.business   b where b.owner_id = admin.id and b.status = 'won') as fechamentos_do_admin,
  (select count(*) from public.activities a where a.owner_id = admin.id and a.status is distinct from 'done') as pendencias_do_admin,
  (select count(*) from public.clients    c where c.owner_id = admin.id) as clientes_do_admin
  from admin;


-- (V4) Tema/wallpaper: quantos usuários já persistiram preferência
select
  (select count(*) from public.v_user_theme_state)     as usuarios_com_tema_salvo,
  (select count(*) from public.v_user_wallpaper_state) as usuarios_com_wallpaper_salvo,
  (select count(*) from public.fs_documents where path = 'config/logo')    as tem_logo_customizada,
  (select count(*) from public.fs_documents where path = 'config/crmname') as tem_nome_customizado;


-- =====================================================================
-- ROLLBACK (se, por qualquer motivo, você precisar reverter)
-- =====================================================================
-- Cada comando abaixo é individualmente seguro. Não afetam dados —
-- só removem os índices e views que ESTE script criou.
--
--   drop index if exists public.idx_leads_owner_status;
--   drop index if exists public.idx_leads_owner_open;
--   drop index if exists public.idx_business_owner_stage;
--   drop index if exists public.idx_business_owner_closed;
--   drop index if exists public.idx_clients_owner_status;
--   drop index if exists public.idx_activities_owner_pending;
--   drop index if exists public.idx_activities_owner_created;
--   drop index if exists public.idx_fs_documents_theme_wallpaper;
--   drop view  if exists public.v_user_theme_state;
--   drop view  if exists public.v_user_wallpaper_state;
--
-- Os dados de tema/wallpaper (fs_documents) e as tabelas relacionais
-- ficam intactos — este script nunca faz DELETE / UPDATE / TRUNCATE.
-- =====================================================================
