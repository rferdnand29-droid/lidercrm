-- =====================================================================
-- LiderCRM — MIGRATION 2026-08-04
-- "Cargo alto só ganha função extra via departamento"
-- ---------------------------------------------------------------------
-- Alinha a fonte de verdade (tabela public.cargo_caps) com a regra
-- decidida em 2026-08-04:
--   • gerente/gestor/representante/master perdem o adminUI/supervisorUI
--     automático. Passam a nascer como consultor (escopo=self, foreign=
--     none, admin_ui=false, supervisor_ui=false).
--   • O ganho de escopo (team + foreign=edit + supervisor_ui) volta a
--     existir SOMENTE quando o ADM colocar o usuário num departamento
--     (via team_id -> teams.departamento_id). Esse ganho é resolvido
--     em tempo de request pelas policies RLS (30-rls-cargo-departamento
--     .sql) e pelo middleware authz (patch backend deste pacote), NÃO
--     por caps estáticas por cargo.
--   • adminUI (Painel ADM) só continua para:
--       - Hudson (users.role='adm'); e
--       - usuários com users.adm_extra=true marcado manualmente pelo
--         Hudson na tela de Credenciais/Editar usuário.
--
-- ⚠️ IDEMPOTENTE. Só UPDATE em linhas já existentes de public.cargo_caps.
--    Não recria coluna nem tabela. Rodar quantas vezes precisar.
--
-- ⚠️ REVERSÃO (rollback) — desfaz esta migration devolvendo os valores
--    anteriores (backup dos valores originais em RELATORIO-*.md deste
--    pacote):
--
--    UPDATE public.cargo_caps SET escopo='team', foreign_acao='edit',
--      admin_ui=true,  supervisor_ui=true, updated_at=now()
--      WHERE cargo_codigo IN ('gerente','gestor');
--    UPDATE public.cargo_caps SET escopo='global', foreign_acao='edit',
--      admin_ui=true,  supervisor_ui=true, updated_at=now()
--      WHERE cargo_codigo IN ('representante','master');
-- =====================================================================

BEGIN;

-- gerente / gestor -> caps básicas de consultor
UPDATE public.cargo_caps
SET escopo        = 'self',
    foreign_acao  = 'none',
    admin_ui      = false,
    supervisor_ui = false,
    updated_at    = now()
WHERE cargo_codigo IN ('gerente','gestor');

-- representante / master -> caps básicas de consultor
-- (o "acesso global" histórico era o principal vetor de "vazamento" —
-- agora só sobra via u.adm_extra=true marcado manualmente ou via
-- departamento, que é resolvido dinamicamente).
UPDATE public.cargo_caps
SET escopo        = 'self',
    foreign_acao  = 'none',
    admin_ui      = false,
    supervisor_ui = false,
    updated_at    = now()
WHERE cargo_codigo IN ('representante','master');

-- Supervisor mantém a correção anterior (2026-08-03): foreign_acao='edit'
-- para poder editar leads dos membros do MESMO departamento. Continua
-- SEM admin_ui (nunca teve, nada muda pra ele).
--
-- Consultor / funcionário / administrativo / orientador -> nada muda.

COMMIT;

-- Confirmação (rode depois pra conferir):
--   SELECT cargo_codigo, escopo, foreign_acao, admin_ui, supervisor_ui
--   FROM public.cargo_caps
--   ORDER BY cargo_codigo;
--
-- Resultado esperado:
--   administrativo | self   | none | false | false
--   consultor      | self   | none | false | false
--   funcionario    | self   | none | false | false
--   gerente        | self   | none | false | false   <-- ANTES: team/edit/true/true
--   gestor         | self   | none | false | false   <-- ANTES: team/edit/true/true
--   master         | self   | none | false | false   <-- ANTES: global/edit/true/true
--   orientador     | self   | none | false | false
--   representante  | self   | none | false | false   <-- ANTES: global/edit/true/true
--   supervisor     | team   | edit | false | true
