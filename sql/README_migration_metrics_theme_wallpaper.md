# SQL — Correção de Métricas + Tema/Papel de Parede
**Arquivo:** `migration_metrics_theme_wallpaper_20260723.sql`
**Data:** 2026-07-23

## Por que este SQL existe

O usuário reportou:
> *"Erro em todas as métricas do CRM e tema/papel de parede — ajuste um SQL perfeito mantendo login atual, não mexa em nada que possa afetar o login."*

O lado **front-end** já foi corrigido nas sessões anteriores:
- `js/dashboard.js:282/291` → guards em `getActivities()` / `getFeed()` (marcadores: `mdash-getactivities-undef-guard`, `mdash-getfeed-undef-guard`)
- `js/patches/lf-wallpaper-transparency-v1-20260720.js` → guards de dupla aplicação + versão canônica imutável (marcadores: `wallpaper-double-apply-guard`, `wallpaper-canonical-transp-guard`, `__lfCanonical`, `__lfOrigHandlesTransp`)

Este SQL **espelha essas correções no banco**, garantindo que a persistência de tema/wallpaper (`fs_documents` em `config/theme_<uid>`, `config/bg_<uid>`, `config/bgphoto_<uid>`) e as queries de métricas (`leads`, `business`, `activities`, `clients`) tenham índices adequados e consistência.

## Como aplicar

1. Abra o SQL Editor do seu projeto Supabase (`xwajiwjpecanxaqlxzkt.supabase.co`).
2. Cole o conteúdo de `migration_metrics_theme_wallpaper_20260723.sql`.
3. Clique **RUN**. Deve terminar com `Success. No rows returned` (mais os 4 selects de verificação).
4. Rode os blocos **V1 a V4** de verificação (comentados no rodapé do arquivo) para confirmar.

## Blindagem de login — o que **NÃO** foi tocado

- ❌ `public.users` (nenhuma coluna, PK, seed do admin)
- ❌ `public.roles` / `permissions` / `role_permissions`
- ❌ `fs_documents` com path `config/users/*` (guarda hash da senha e role do admin — o `auth-controller` lê exatamente esse path)
- ❌ Nenhuma policy de RLS existente foi alterada
- ❌ `login_history` / `device_sessions` / `audit_logs`
- ❌ Zero comandos destrutivos (validado: `DROP TABLE=0`, `DELETE=0`, `TRUNCATE=0`, `ALTER TABLE users/fs_documents=0`)

## O que o SQL faz (resumo)

### Parte A — Métricas (8 índices, todos `CREATE INDEX IF NOT EXISTS`)
| Índice | Tabela | Uso na UI |
|---|---|---|
| `idx_leads_owner_status` | leads | "Meus" desktop — filtro composto |
| `idx_leads_owner_open` (parcial) | leads | Leads ainda não fechados |
| `idx_business_owner_stage` | business | Kanban por consultor |
| `idx_business_owner_closed` (parcial) | business | KPI "Fechamentos" (won) |
| `idx_clients_owner_status` | clients | Contadores `cnt-normal/atendido/remarcar/noshow` |
| `idx_activities_owner_pending` (parcial) | activities | KPI "Pendências" mobile |
| `idx_activities_owner_created` | activities | Feed `mdash-recent` |
| `idx_fs_documents_theme_wallpaper` (parcial) | fs_documents | Boot rápido do tema/wallpaper |

### Parte B — Tema/Wallpaper
- Índice parcial em `fs_documents` para os paths `config/theme_%`, `config/bg_%`, `config/bgphoto_%`, `config/logo`, `config/crmname`
- Duas views de diagnóstico (**read-only**): `v_user_theme_state` e `v_user_wallpaper_state`

### Parte C — Sanidade
- Garante que o `UNIQUE(scope, scope_id, key)` de `public.settings` existe (idempotente)
- Garante extensão `pgcrypto` + função `set_updated_at` (idempotente)

## Idempotência
Todos os comandos usam `IF NOT EXISTS` / `IF EXISTS` / `ON CONFLICT` / `CREATE OR REPLACE`. **Pode rodar N vezes sem quebrar nada.**

## Rollback
Bloco pronto no rodapé do arquivo `.sql` — só remove os 8 índices e 2 views criados aqui. Nunca toca em dados.
