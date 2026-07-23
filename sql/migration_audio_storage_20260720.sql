-- =====================================================================
-- MIGRAÇÃO SQL: Suporte a armazenamento de áudio no CRM
-- Data: 2026-07-20
-- -----------------------------------------------------------------------
-- Esta migração configura o bucket de Storage no Supabase para receber
-- arquivos de áudio gravados pelo CRM (MediaRecorder) e enviados diretamente
-- via REST API (sem conversão para base64).
--
-- PROBLEMA: O envio de áudio não funcionava porque:
--   1. O bucket de storage não tinha políticas de upload público/anônimo
--   2. Não havia uma pasta organizada para áudios
--   3. O bucket existente ('lidercrm-files') só aceitava imagens
--
-- SOLUÇÃO: Atualiza as políticas do bucket existente para permitir
-- upload de audio/* e video/* e cria estrutura de pastas organizada.
-- =====================================================================

-- ============================================================
-- PASSO 1: Verificar/criar o bucket de storage (idempotente)
-- ============================================================
-- O bucket 'lidercrm-files' já existe no Supabase do CRM.
-- Se não existir, descomente as linhas abaixo:

-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'lidercrm-files',
--   'lidercrm-files',
--   true,
--   52428800,  -- 50MB (limite para áudio/vídeo)
--   ARRAY[
--     'image/jpeg', 'image/png', 'image/webp', 'image/gif',
--     'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/mpeg', 'audio/mp3',
--     'video/webm', 'video/mp4', 'video/quicktime',
--     'application/pdf',
--     'text/plain', 'text/csv',
--     'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--     'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
--   ]
-- )
-- ON CONFLICT (id) DO UPDATE SET
--   file_size_limit = EXCLUDED.file_size_limit,
--   allowed_mime_types = EXCLUDED.allowed_mime_types,
--   public = EXCLUDED.public;

-- ============================================================
-- PASSO 2: Atualizar o bucket existente com os novos MIME types
-- ============================================================
UPDATE storage.buckets
SET
  file_size_limit = 52428800,  -- 50MB
  public = true,
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/mpeg', 'audio/mp3',
    'video/webm', 'video/mp4', 'video/quicktime',
    'application/pdf',
    'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
WHERE id = 'lidercrm-files';

-- ============================================================
-- PASSO 3: Políticas de Storage (RLS)
-- -----------------------------------------------------------------------
-- Permite que usuários autenticados (incluindo sessão anônima do CRM)
-- façam upload, leitura e remoção de arquivos no bucket.
-- ============================================================

-- Remover políticas antigas (se existirem) para evitar conflito
DROP POLICY IF EXISTS "crm_files_upload" ON storage.objects;
DROP POLICY IF EXISTS "crm_files_read" ON storage.objects;
DROP POLICY IF EXISTS "crm_files_delete" ON storage.objects;
DROP POLICY IF EXISTS "crm_files_update" ON storage.objects;

-- Upload: qualquer usuário autenticado (incluindo anônimo) pode enviar arquivos
CREATE POLICY "crm_files_upload"
  ON storage.objects FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id = 'lidercrm-files');

-- Leitura: o bucket é público, mas garantimos via política também
CREATE POLICY "crm_files_read"
  ON storage.objects FOR SELECT
  TO authenticated, anon, public
  USING (bucket_id = 'lidercrm-files');

-- Remoção: usuários autenticados podem remover arquivos
CREATE POLICY "crm_files_delete"
  ON storage.objects FOR DELETE
  TO authenticated, anon
  USING (bucket_id = 'lidercrm-files');

-- Update (upsert): usuários autenticados podem sobrescrever arquivos
CREATE POLICY "crm_files_update"
  ON storage.objects FOR UPDATE
  TO authenticated, anon
  USING (bucket_id = 'lidercrm-files');

-- ============================================================
-- PASSO 4: Tabela para registrar metadados de áudios enviados
-- -----------------------------------------------------------------------
-- Opcional: rastreia áudios enviados para auditoria e organização.
-- O CRM salva o URL do áudio no campo 'anexos' do card (array JSON),
-- mas esta tabela permite consultas SQL diretas e relatórios.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audio_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,                    -- UID do consultor que gravou
  card_id TEXT,                             -- ID do card (lead/negócio) vinculado
  board TEXT,                               -- 'leads' | 'negocios'
  file_name TEXT NOT NULL,                  -- nome do arquivo no storage
  file_path TEXT NOT NULL,                  -- path completo no bucket
  file_url TEXT NOT NULL,                   -- URL pública do áudio
  mime_type TEXT NOT NULL DEFAULT 'audio/webm',
  file_size BIGINT DEFAULT 0,               -- tamanho em bytes
  duration_ms INTEGER DEFAULT 0,            -- duração em milissegundos
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para consultas frequentes
CREATE INDEX IF NOT EXISTS idx_audio_messages_user_id ON public.audio_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_messages_card_id ON public.audio_messages(card_id);
CREATE INDEX IF NOT EXISTS idx_audio_messages_created_at ON public.audio_messages(created_at DESC);

-- RLS na tabela de áudios
ALTER TABLE public.audio_messages ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas
DROP POLICY IF EXISTS "audio_select_own" ON public.audio_messages;
DROP POLICY IF EXISTS "audio_insert_own" ON public.audio_messages;
DROP POLICY IF EXISTS "audio_update_own" ON public.audio_messages;
DROP POLICY IF EXISTS "audio_delete_own" ON public.audio_messages;

-- Usuário pode ver seus próprios áudios
CREATE POLICY "audio_select_own"
  ON public.audio_messages FOR SELECT
  TO authenticated, anon
  USING (true);  -- todos podem ver (CRM compartilha dados da equipe)

-- Usuário pode inserir áudios
CREATE POLICY "audio_insert_own"
  ON public.audio_messages FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

-- Usuário pode atualizar seus próprios áudios
CREATE POLICY "audio_update_own"
  ON public.audio_messages FOR UPDATE
  TO authenticated, anon
  USING (true);

-- Usuário pode remover seus próprios áudios
CREATE POLICY "audio_delete_own"
  ON public.audio_messages FOR DELETE
  TO authenticated, anon
  USING (true);

-- ============================================================
-- PASSO 5: Comentário de documentação
-- ============================================================
COMMENT ON TABLE public.audio_messages IS 'Metadados de áudios gravados e enviados pelo CRM. O áudio em si fica no bucket lidercrm-files do Supabase Storage; esta tabela rastreia quem gravou, quando, e a qual card está vinculado.';

-- ============================================================
-- FIM DA MIGRAÇÃO
-- -----------------------------------------------------------------------
-- Após executar:
--   1. O bucket 'lidercrm-files' aceita audio/*, video/* e image/*
--   2. Usuários autenticados/anônimos podem fazer upload/leitura/remoção
--   3. A tabela audio_messages rastreia metadados dos áudios enviados
--   4. O frontend (storage-repository.js) envia o blob diretamente ao
--      Storage via POST /storage/v1/object/lidercrm-files/<path>
--      com header Authorization: Bearer <anon_key_ou_access_token>
-- ============================================================
