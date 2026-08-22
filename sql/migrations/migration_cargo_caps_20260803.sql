-- =====================================================================
-- LIDER CRM — MIGRATION: ajustes de cargo_caps (2026-08-03)
-- ---------------------------------------------------------------------
-- Consolida dois ajustes de cargo_caps.public decididos nesta sessão:
--
-- 1) ORIENTADOR — rebaixado. Não deve mais ter visão de equipe (nem
--    antes, nem depois de estar num departamento) — passa a se
--    comportar exatamente como consultor (escopo self, sem foreign,
--    sem aba Time). Espelhos em js/auth.js e
--    _worker_src/worker/middlewares/authz.js já corrigidos — esta
--    migration alinha a fonte real (tabela).
--
-- 2) SUPERVISOR — foreign_acao 'read' -> 'edit'. Decisão confirmada:
--    supervisor DEVE poder editar leads/negócios de quem o ADM colocou
--    no mesmo departamento — não é mais só leitura. O que continua
--    controlando QUEM ele vê/edita é o departamento
--    (getDepartmentVisibleUsers/team_id), não este campo — este campo
--    só diz "se ele vê alguém do departamento, pode editar ou só
--    olhar". Espelhos em js/auth.js e authz.js já corrigidos.
--
-- ⚠️ Se você já rodou uma migration anterior só para o orientador
-- (migration_orientador_demotion_20260803.sql), o UPDATE dele aqui é
-- idempotente — rodar de novo não causa problema.
--
-- Aditiva/idempotente: só UPDATE em linhas já existentes, nenhuma
-- criação de tabela/coluna. Segue a regra do projeto de nunca editar
-- migrations antigas — só adicionar.
-- =====================================================================

UPDATE public.cargo_caps
SET escopo        = 'self',
    foreign_acao  = 'none',
    supervisor_ui = false,
    updated_at    = now()
WHERE cargo_codigo = 'orientador';

UPDATE public.cargo_caps
SET foreign_acao  = 'edit',
    updated_at    = now()
WHERE cargo_codigo = 'supervisor';

-- Confirmação (rode depois pra conferir):
--   SELECT cargo_codigo, escopo, foreign_acao, supervisor_ui
--   FROM public.cargo_caps
--   WHERE cargo_codigo IN ('orientador','consultor','supervisor','gerente');
--   -- orientador deve ter os mesmos valores de consultor;
--   -- supervisor deve ter foreign_acao='edit' (igual gerente agora).
