-- =====================================================================
-- LiderCRM — Fase 1 (v2-20260803): schema de Departamentos
--
-- REESCRITO a partir do original depois do diagnóstico real do banco:
--   • O pacote original assumia tabelas leads/negocios/clientes com
--     coluna responsavel_id. O banco real tem leads/business/clients
--     com coluna owner_id.
--   • O pacote original criava departamento_id em CADA UMA das quatro
--     tabelas (users, leads, negocios, clientes), exigindo depois um
--     backfill em massa (a Fase 1.3 antiga) pra propagar o valor.
--   • Confirmado que "departamento" é um nível ACIMA de "team" no seu
--     negócio (departamento contém várias teams), e que teams/team_id
--     JÁ EXISTE e já está referenciado em users/leads/business/clients
--     — só ainda não está populado (banco de ambiente novo/vazio).
--
-- DESENHO NOVO: departamento_id mora numa ÚNICA coluna nova,
-- teams.departamento_id. O departamento de um lead/negócio/cliente/
-- usuário é DERIVADO via join: registro.team_id -> teams.id ->
-- teams.departamento_id. Nada duplicado, nada pra ficar dessincronizado,
-- nenhum backfill em massa necessário (não há dados legados: leads,
-- business e clients estão com 0 linhas neste ambiente).
--
-- Idempotente. Roda quantas vezes precisar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela departamentos
-- ---------------------------------------------------------------------
-- id continua TEXT de propósito: o CRUD (LF_DEPARTMENTS.create() no
-- console) gera ids como 'dept_xyz123_abc456', não uuids.
CREATE TABLE IF NOT EXISTS departamentos (
  id              TEXT        PRIMARY KEY,
  nome            TEXT        NOT NULL,
  descricao       TEXT,
  cor             TEXT        DEFAULT '#3b82f6',
  status          TEXT        NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  supervisor_uid  UUID        REFERENCES users(id) ON DELETE SET NULL,
  adjunto_uid     UUID        REFERENCES users(id) ON DELETE SET NULL,
  metas           JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_departamentos_status     ON departamentos(status);
CREATE INDEX IF NOT EXISTS idx_departamentos_supervisor ON departamentos(supervisor_uid);

-- ---------------------------------------------------------------------
-- 2. teams.departamento_id — a ÚNICA coluna nova ligando team a depto
-- ---------------------------------------------------------------------
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS departamento_id TEXT REFERENCES departamentos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_teams_departamento ON teams(departamento_id);

-- ---------------------------------------------------------------------
-- 3. Helper — departamento de um team_id (usado pelo RLS na fase 2.5)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION lf_departamento_of_team(tid UUID) RETURNS TEXT
LANGUAGE SQL STABLE AS $$
  SELECT departamento_id FROM teams WHERE id = tid;
$$;

-- ---------------------------------------------------------------------
-- 4. Log de segurança (mantido do pacote original)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_uid   TEXT,
  action      TEXT        NOT NULL,
  data        JSONB       NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_ts     ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON audit_log(actor_uid);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);

-- ---------------------------------------------------------------------
-- NOTA — coluna legada users.department_id (TEXT, sem FK)
-- ---------------------------------------------------------------------
-- Já existe no seu banco, confirmada 100% NULL (0 de 7 usuários com
-- valor). Não faz parte deste desenho novo (departamento agora vive em
-- teams.departamento_id, não em users diretamente) e este script NÃO
-- mexe nela — nem apaga, nem popula. Se em algum momento vocês
-- confirmarem que ela é resíduo de uma tentativa anterior e não é
-- usada por nenhum código, pode ser um DROP COLUMN separado, decisão
-- de vocês, fora do escopo deste pacote.

-- ---------------------------------------------------------------------
-- PRÓXIMO PASSO (decisão de negócio, fora do SQL):
--   1. Criar os departamentos reais: INSERT INTO departamentos (id, nome) VALUES (...);
--   2. Criar as teams (ainda não existem nenhuma: 0 linhas confirmadas)
--      e já atribuir teams.departamento_id na criação.
--   3. Atribuir users.team_id (hoje 100% NULL) a cada um dos 7 usuários.
--   4. Leads/business/clients futuros nascem com team_id preenchido
--      pela aplicação (não é backfill, é o fluxo normal de criação) —
--      não há necessidade de nenhum script de migração em massa, já
--      que as três tabelas estão vazias hoje.
-- ---------------------------------------------------------------------
