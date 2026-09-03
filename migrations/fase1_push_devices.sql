-- =====================================================================
-- migrations/fase1_push_devices.sql
-- PATCH FASE 1 (2026-07-22) — Tabela de registro de devices push
-- -----------------------------------------------------------------------
-- Execute via Supabase SQL Editor ou psql antes de habilitar push.
-- A tabela é criada com IF NOT EXISTS — seguro para re-executar.
--
-- RLS: cada usuário enxerga apenas seus próprios devices.
-- ADM pode ver todos (útil para diagnóstico de entrega de push).
-- =====================================================================

-- 1. Criar tabela
CREATE TABLE IF NOT EXISTS public.push_devices (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       text        NOT NULL,
  token         text        NOT NULL,
  platform      text        NOT NULL DEFAULT 'web',    -- web | android | ios
  provider      text        NOT NULL DEFAULT 'fcm',    -- fcm | apns | web-push
  endpoint      text,                                  -- Web Push endpoint (VAPID)
  p256dh        text,                                  -- Web Push key
  auth_secret   text,                                  -- Web Push auth
  device_label  text,                                  -- ex: "Samsung Galaxy S24"
  app_version   text,
  active        boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

-- 2. Índice para listagem rápida por usuário
CREATE INDEX IF NOT EXISTS push_devices_user_active
  ON public.push_devices (user_id, active);

-- 3. Índice para limpeza de tokens expirados (Fase 2)
CREATE INDEX IF NOT EXISTS push_devices_updated_at
  ON public.push_devices (updated_at);

-- 4. Trigger: atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_devices_updated_at_trigger ON public.push_devices;
CREATE TRIGGER push_devices_updated_at_trigger
  BEFORE UPDATE ON public.push_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. RLS
ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;

-- Usuário enxerga apenas seus próprios devices
CREATE POLICY IF NOT EXISTS push_devices_owner
  ON public.push_devices
  FOR ALL
  USING (user_id = auth.uid()::text OR auth.role() = 'service_role');

-- 6. Permissão para service_role (Worker) ler/escrever todos os devices
GRANT ALL ON public.push_devices TO service_role;

-- =====================================================================
-- FASE 2 — CONCLUÍDA (2026-07-22):
-- Delivery tracking e push_queue agora estão em:
--   sql/migration_fase2_consolidated_20260722.sql
-- =====================================================================
--
-- As seguintes alterações foram incorporadas ao consolidado Fase 2:
--
-- ALTER TABLE public.push_devices
--   ADD COLUMN IF NOT EXISTS last_delivery_at timestamptz,
--   ADD COLUMN IF NOT EXISTS delivery_count    int DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS failure_count     int DEFAULT 0;
--
-- CREATE TABLE IF NOT EXISTS public.push_queue (...);
--
-- Veja sql/migration_fase2_consolidated_20260722.sql para o script
-- completo e idempotente com todas as tabelas Fase 1 + Fase 2.
-- =====================================================================
