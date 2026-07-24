# LiderCRM — Arquitetura Final (R5)

## Status
**Refatoração final concluída.** Pasta `js/patches/` eliminada. Todos os 14 patches
incorporados ao código principal como módulos permanentes.

---

## Estrutura de arquivos JS (`js/`)

| Arquivo | Responsabilidade | Origem |
|---|---|---|
| `utils.js` | Utilitários globais, formatadores, helpers de DOM | Core + BUG 2 do v39 |
| `storage.js` | Wrappers de localStorage (`sg`/`ss`/`sr`) | Core |
| `api.js` | Cliente HTTP e configuração do worker-client | Core |
| `auth.js` | Autenticação, permissões, roles, login/logout | Core + legacy-bridge + consultant-guard |
| `supabase.js` | Adaptador Supabase → API Firestore compat | Core |
| `sync.js` | Hook de saveActivities/saveLigToday + RetryQueue boot | Promovido de patch |
| `usuarios.js` | CRUD de usuários, cache local | Core |
| `configuracoes.js` | Preferências e configurações do sistema | Core |
| `notificacoes.js` | Notificações push, badge, alertas | Core |
| `agenda.js` | Atividades, ligações, calendário | Core |
| `kanban.js` | Quadros Leads e Negócios + supervisor-readonly | Core + teamview-readonly |
| `leads.js` | Dicionário de objeções, runtime de leads | Core |
| `clientes.js` | Clientes (Bingo), lista, filtros | Core |
| `documentos.js` | Gestão de documentos e uploads | Core |
| `relatorios.js` | Analytics, feed, relatórios | Core |
| `chat.js` | Chat corporativo (Papo da Empresa) | Core |
| `dashboard.js` | Dashboard principal, KPIs | Core |
| `app.js` | Boot, navegação, SPA router, goPage() | Core |
| `backblaze.js` | Upload para Backblaze B2 | Core |
| `whatsapp.js` | Integração WhatsApp | Core |
| `display.js` | Calibração de display por aparelho (zoom/density/offsets) | Promovido de patch |
| `performance.js` | Robustez de login, drag guard, pausa em background, resize debounce | Promovido de patch |
| `chat-fixes.js` | Botões flutuantes, segurança de msgs, som real, pin/presença, poll consolidado | Consolidado (5 patches) |
| `attachments.js` | Lightbox de mídia, menu "Abrir em nova guia" no chat/nav/kanban | Promovido de patch |
| `bingo-sync.js` | Sincronização Negócios (Kanban) → Bingo (Clientes) | Promovido de patch |

---

## O que foi incorporado (antes em `js/patches/`)

| Patch original | Destino na R5 |
|---|---|
| `lf-mobile-display-calibration-20260713f.js` | `js/display.js` |
| `lf-v39-critical-fixes-20260716.js` (BUG 2) | `js/utils.js` (append) |
| `lf-retryqueue-sync-v1-20260717.js` | `js/sync.js` |
| `lf-legacy-auth-bridge-v1-20260717.js` | `js/auth.js` (append) |
| `lf-chat-nav-menu-v1-20260720.js` | `js/chat-fixes.js` |
| `lf-chat-permissions-fix-v1-20260720.js` | `js/chat-fixes.js` |
| `lf-chat-ctx-sound-fix-v1-20260720.js` | `js/chat-fixes.js` |
| `lf-chat-pin-presence-active-fix-v1-20260721.js` | `js/chat-fixes.js` |
| `lf-attachments-newtab-v1-20260721.js` | `js/attachments.js` |
| `lf-supervisor-teamview-readonly-v1-20260722.js` | `js/kanban.js` (append) |
| `lf-bingo-sync-v1-20260722.js` | `js/bingo-sync.js` |
| `lf-perf-drag-login-fix-20260723.js` | `js/performance.js` |
| `lf-leads-edit-consultant-guard-v1-20260723.js` | `js/auth.js` (append) |
| `lf-chat-poll-consolidated-v1-20260723.js` | `js/chat-fixes.js` |

---

## Ordem de carregamento (index.html / app.html)

```
vendor/supabase.umd.js        ← lib externa
storage.js
utils.js
src/modules/storage/...       ← runtime Supabase
supabase.js
src/modules/sync/retry-queue-sync.js  ← runtime RetryQueue/SyncManager
sync.js                       ← hook layer sobre saveActivities
api.js
auth.js                       ← inclui legacy-bridge + consultant-guard
src/modules/usuarios/...
usuarios.js
src/modules/configuracoes/...
configuracoes.js
notificacoes.js
src/modules/agenda/...
agenda.js
src/modules/kanban/...
kanban.js                     ← inclui supervisor-readonly
src/modules/leads/...
leads.js
clientes.js
src/modules/documentos/...
documentos.js
whatsapp.js
src/modules/relatorios/...
relatorios.js
backblaze.js
chat.js
app.js
dashboard.js
src/shared/...                ← infraestrutura (http-client, worker-client, repos, services)

-- diferido (defer) --
display.js
performance.js
chat-fixes.js                 ← carrega depois de chat.js
attachments.js
bingo-sync.js
```

---

## Deploy

O projeto é implantado em **Cloudflare Pages** com Cloudflare Workers:

```bash
# Deploy via Wrangler
wrangler pages deploy . --project-name lidercrm

# Ou via GitHub Actions (CI já configurado)
```

Variáveis de ambiente necessárias (Cloudflare Pages > Settings > Variables):
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `BACKBLAZE_KEY_ID`
- `BACKBLAZE_APP_KEY`

---

## Adicionar novas funcionalidades

1. **Nova correção pontual** → integre diretamente no arquivo JS correspondente.
   NÃO crie mais arquivos em `js/patches/`. A pasta foi eliminada.

2. **Novo módulo de negócio** → crie `js/<nome>.js` + adicione `<script src>` no
   `index.html` e `app.html` na posição correta da cadeia de dependências.

3. **Mudança no worker** → edite em `_worker_src/`, compile com `wrangler`.

4. **Runtime compartilhado** → adicione em `src/modules/<domínio>/runtime/`.

---

## Manutenção

- Qualquer desenvolvedor pode entrar em qualquer arquivo `js/*.js` e entender
  sua responsabilidade pelo nome + comentário de cabeçalho.
- Buscar por função global: `grep -r "function nomeFuncao" js/`
- Buscar consumidores: `grep -r "nomeFuncao(" js/ index.html app.html`
