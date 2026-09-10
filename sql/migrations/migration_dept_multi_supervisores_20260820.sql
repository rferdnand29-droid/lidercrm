-- =====================================================================
-- LIDER CRM — MIGRATION: multi-supervisores por departamento (2026-08-20)
-- ---------------------------------------------------------------------
-- PEDIDO: "Ao criar departamentos deve ser possível colocar mais de 1
-- supervisor e mais de 1 supervisor adjunto no mesmo departamento."
--
-- O QUE MUDA NO BANCO:
--   departamentos ganha DUAS colunas JSONB novas:
--     supervisor_uids  JSONB NOT NULL DEFAULT '[]'  — lista de user ids
--     adjunto_uids     JSONB NOT NULL DEFAULT '[]'  — lista de user ids
--   e faz BACKFILL a partir das colunas escalares antigas:
--     supervisor_uid -> supervisor_uids[0]
--     adjunto_uid    -> adjunto_uids[0]
--
-- POR QUE AS COLUNAS ANTIGAS NÃO SÃO REMOVIDAS:
--   As colunas escalares supervisor_uid/adjunto_uid CONTINUAM existindo
--   e continuam sendo escritas pelo backend (1º da lista) — há índices
--   (idx_departamentos_supervisor), RLS/consumidores legados e o
--   próprio cache local antigo que ainda as leem. Elas viram um
--   "espelho" do primeiro elemento, mantendo 100% de retrocompatibili-
--   dade sem nenhuma janela de quebra.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS + UPDATE só onde falta).
-- Aditiva: nenhuma coluna/tabela é removida. Segue a regra do projeto
-- de nunca editar migrations antigas — só adicionar.
-- =====================================================================

ALTER TABLE departamentos
  ADD COLUMN IF NOT EXISTS supervisor_uids JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE departamentos
  ADD COLUMN IF NOT EXISTS adjunto_uids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: quem já tinha 1 supervisor/adjunto ganha a lista de 1 item.
UPDATE departamentos
SET supervisor_uids = jsonb_build_array(supervisor_uid::text)
WHERE supervisor_uid IS NOT NULL
  AND (supervisor_uids IS NULL OR supervisor_uids = '[]'::jsonb);

UPDATE departamentos
SET adjunto_uids = jsonb_build_array(adjunto_uid::text)
WHERE adjunto_uid IS NOT NULL
  AND (adjunto_uids IS NULL OR adjunto_uids = '[]'::jsonb);

-- Índices GIN pra consultas "em quais departamentos o usuário X é
-- supervisor?" usando o operador de contenção do JSONB
-- (supervisor_uids @> '["<uid>"]'), usados pelas telas de escopo.
CREATE INDEX IF NOT EXISTS idx_departamentos_supervisor_uids
  ON departamentos USING GIN (supervisor_uids);
CREATE INDEX IF NOT EXISTS idx_departamentos_adjunto_uids
  ON departamentos USING GIN (adjunto_uids);

-- Confirmação (rode depois pra conferir):
--   SELECT id, nome, supervisor_uid, supervisor_uids, adjunto_uid, adjunto_uids
--   FROM departamentos;
--   -- para cada linha com supervisor_uid preenchido, supervisor_uids
--   -- deve ser um array de 1 elemento com o MESMO uid.
