-- =====================================================================
-- Passo 5.3 — telemetria do gate CHAT_GROUP_FORBIDDEN
-- Data: 2026-07-21
-- Objetivo: contar tentativas 403 por ctx.user.sub sem alterar a
--           semântica do gate 5.2 (best-effort / fail-open).
-- =====================================================================

create table if not exists public.security_events (
  id                uuid primary key default gen_random_uuid(),
  user_sub          text not null,
  event_code        text not null,
  count             integer not null default 0 check (count >= 0),
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  last_reason       text,
  last_path         text,
  last_method       text,
  sample_name       text,
  sample_request_id text,
  payload           jsonb not null default '{}'::jsonb,
  unique (user_sub, event_code)
);

create index if not exists idx_security_events_user
  on public.security_events (user_sub);

create index if not exists idx_security_events_event_last_seen
  on public.security_events (event_code, last_seen_at desc);
