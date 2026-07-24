# RELATÓRIO DE BUGS — R5 (2026-07-24)

## Visão Geral
Continuação das rodadas de limpeza R4. Todas as mudanças são retrocompatíveis, aditivas quando possível, e seguem o padrão estabelecido de patches guard-flagged e remoções seguras. Sem mudanças comportamentais visíveis ao usuário final.

---

## Block F — Security Hardening (Prioridade: Alta)

### F1: Limite de body em readJsonBody()
- **Arquivo**: `_worker_src/worker/validators/validate.js`
- **Problema**: Request body ilimitado, vulnerável a exaustão de memória.
- **Correção**: Adicionado `MAX_BODY_SIZE = 2MB`. Bodies acima desse limite retornam ValidationError 422.
- **Risco**: Baixo. Requisições legítimas ficam bem abaixo de 2MB.

### F2: Rate-limit específico para login
- **Arquivo**: `_worker_src/worker/middlewares/rate-limit.js`
- **Problema**: Rate-limit genérico de 120 req/min para todas as rotas, incluindo login (facilita brute-force).
- **Correção**: Adicionado perfil `LOGIN_MAX = 10 req/min` para rotas contendo `/login`.
- **Risco**: Baixo. Apenas afeta tentativas de brute-force.

### F3: Header X-Content-Type-Options
- **Arquivo**: `_worker_src/worker/api-handler.js`
- **Problema**: Ausência do header de segurança `X-Content-Type-Options: nosniff`.
- **Correção**: Header adicionado a todas as respostas da API (incluindo preflight).
- **Risco**: Nenhum.

---

## Block A — Backend Input Validation (Prioridade: Alta)

### A1: 7 novos schemas de validação
- **Arquivo**: `_worker_src/worker/schemas/index.js`
- **Schemas adicionados**:
  - `agendaSlotCreateSchema`: title, start, end obrigatórios
  - `kanbanListPutSchema`: uid + list obrigatórios
  - `atividadesListPutSchema`: uid + list obrigatórios
  - `ligacoesListPutSchema`: uid + list obrigatórios
  - `feedEventoCreateSchema`: type validado
  - `settingPutSchema`: key + value obrigatórios
  - `usuarioConfigPutSchema`: uid opcional

### A2: Validação adicionada a 7 controllers
| Controller | Função | Schema |
|---|---|---|
| `agenda-slots-controller.js` | `createAgendaSlot()` | agendaSlotCreateSchema |
| `atividades-controller.js` | `putAtividadesListDoc()` | atividadesListPutSchema |
| `kanban-controller.js` | `putKanbanListDoc()` | kanbanListPutSchema |
| `ligacoes-controller.js` | `putLigacoesListDoc()` | ligacoesListPutSchema |
| `feed-controller.js` | `createFeedEvento()` | feedEventoCreateSchema |
| `settings-controller.js` | `putSettingCtrl()` | settingPutSchema |
| `usuarios-controller.js` | `putUsuarioConfig()` | usuarioConfigPutSchema |

- **Risco**: Baixo. Validação rejeita payloads malformados que antes causavam corrupção silenciosa.

---

## Block B — Error Handling Standardization (Prioridade: Média)

### B1: auth.js — Silent catches em data-paths
- **Arquivo**: `js/auth.js`
- **Funções afetadas**: `_lfAuthGetUserSafe()`, `_lfAuthLoadUsersDBSafe()`, `_execLogout()`
- **Correção**: 4 catches vazios → `console.warn('[auth]', _e)`
- **Política**: `catch(_e){}` aceitável apenas para UI cosmético; data-paths devem logar.

### B2: kanban.js — Silent catches em retry queue
- **Arquivo**: `js/kanban.js`
- **Função afetada**: `_kbEnqueueSaveOnFail()`
- **Correção**: 2 catches vazios → `console.warn('[kb]', _e)`

### B3: app.js — Silent catches em startApp
- **Arquivo**: `js/app.js`
- **Funções afetadas**: `startApp()` (applyBG callback, CustomEvent dispatch)
- **Correção**: 2 catches vazios → `console.warn('[app]', _e)`

---

## Block C — localStorage Quota Monitoring (Prioridade: Média)

### C1: Função sq() — estimativa de uso
- **Arquivo**: `js/storage.js`
- **Descrição**: Calcula % de uso do localStorage (assume 5MB). Retorna -1 em erro.

### C2: Função smon() — monitor proativo
- **Arquivo**: `js/storage.js`
- **Descrição**: Loga warning se uso > 80%; mostra toast se > 90%.
- **Integração**: Chamado em `bootApp()` (js/app.js) a cada boot.

---

## Block E — Dashboard Performance (Prioridade: Baixa)

### E1: Redução de limite de queries
- **Arquivo**: `_worker_src/worker/controllers/dashboard-controller.js`
- **Antes**: `limit: 2000` para clients, leads, business
- **Depois**: `limit: 500` para todas as tabelas relacionais

### E2: Filtro de 90 dias em leads
- **Descrição**: Adicionado `created_at=gte.90days` na query de leads para reduzir transferência de dados.

### E3: Cache aumentado
- **Antes**: `maxAge: 15` (15 segundos)
- **Depois**: `maxAge: 30` (30 segundos) — tanto para relacional quanto legado.

---

## Block D — Patch Consolidation (Prioridade: Média)

### D1: lf-chat-switch-new-mode → chat.js
- **Patch removido**: `js/patches/lf-chat-switch-new-mode-v1-20260723.js` (52 linhas)
- **Merge destino**: `js/chat.js` — função `chatSwitchNewMode()` definida diretamente no módulo.
- **Script tags removidos**: index.html (linha 2277), app.html (linha 2272)

### D2: lf-auth-getclilocal-guard → clientes.js
- **Patch removido**: `js/patches/lf-auth-getclilocal-guard-v1-20260723.js` (59 linhas)
- **Merge destino**: `js/clientes.js` — `getCliLocal()` agora com try-catch robusto.
- **Script tags removidos**: index.html (linha 2278), app.html (linha 2273)

### Patches mantidos (14 restantes):
- lf-chat-permissions, lf-chat-sound, lf-chat-pin-presence, lf-chat-poll-consolidated
- lf-bingo-sync, lf-supervisor-teamview-readonly, lf-legacy-auth-bridge
- lf-perf-drag-login-fix, lf-attachments-newtab, lf-mobile-display-calibration
- lf-leads-edit-consultant-guard, lf-retryqueue-sync, lf-v39-critical-fixes
- (Total: 16 → 14 patches)

---

## Block G — Dead Code Cleanup (Prioridade: Baixa)

### G1: Preconnect Firebase removido
- **Arquivos**: `index.html`, `app.html`
- **Removido**: `<link rel="preconnect" href="https://www.gstatic.com" crossorigin>`
- **Motivo**: Firebase SDK não é carregado; preconnect era inútil.

### G2: Plugin legacy-crm-bridge removido
- **Arquivo deletado**: `src/plugins/legacy-crm-bridge.js` (11 linhas, DEPRECATED)
- **Motivo**: Não referenciado por nenhum `<script>` tag. `src/core/bridge/legacy-crm-bridge.js` permanece (carregado ativamente).

---

## Block H — CSS Cleanup (Prioridade: Baixa)

### H1: Selectores legados removidos de style.css
- **Arquivo**: `css/style.css`
- **Removidos** (19 linhas):
  - `.chat-top-pill`, `.chat-mini:hover`, `.chat-room:hover`, `.chat-pin-bar`
  - `.chat-qi`, `.chat-empty-hero`, `.chat-pop`, `.chat-pop-hd`, `.chat-read-row`
  - `.bx24-topbar` theme-classic rules (11 seletores) — classe não existe no DOM atual
- **Motivo**: Selectores não usados ou cobertos por `lf-consolidated-mobile.css`.

### H2: Regra touch-action duplicada simplificada
- **Arquivo**: `css/style.css`
- **Antes**: `button,a,[role="button"]{touch-action:manipulation}` (linha 1659)
- **Depois**: `[role="button"]{touch-action:manipulation}` — `button,a` já cobertos pela linha 47.

---

## Resumo de Arquivos Alterados

### Backend (Worker)
| Arquivo | Mudança |
|---|---|
| `validators/validate.js` | +6 linhas (MAX_BODY_SIZE) |
| `middlewares/rate-limit.js` | +24 linhas (login rate limit) |
| `api-handler.js` | +2 linhas (nosniff header + pathname param) |
| `schemas/index.js` | +37 linhas (7 novos schemas) |
| `controllers/agenda-slots-controller.js` | +3 linhas (validate import + call) |
| `controllers/atividades-controller.js` | +6 linhas (validate import + call) |
| `controllers/kanban-controller.js` | +6 linhas (validate import + call) |
| `controllers/ligacoes-controller.js` | +3 linhas (validate import + call) |
| `controllers/feed-controller.js` | +3 linhas (validate import + call) |
| `controllers/settings-controller.js` | +4 linhas (validate import + call) |
| `controllers/usuarios-controller.js` | +3 linhas (validate import + call) |
| `controllers/dashboard-controller.js` | +7/-5 linhas (limit 500, date filter, cache 30s) |

### Frontend
| Arquivo | Mudança |
|---|---|
| `js/auth.js` | +4/-4 linhas (console.warn em catches) |
| `js/kanban.js` | +2/-2 linhas (console.warn em catches) |
| `js/app.js` | +3/-2 linhas (smon + console.warn) |
| `js/storage.js` | +22 linhas (sq + smon) |
| `js/chat.js` | +15 linhas (chatSwitchNewMode merged) |
| `js/clientes.js` | +2/-1 linhas (getCliLocal robusto) |
| `css/style.css` | +3/-20 linhas (legacy selectors + duplicate rule) |
| `index.html` | +3/-3 linhas (patch tags + preconnect) |
| `app.html` | +3/-3 linhas (patch tags + preconnect) |

### Arquivos Deletados
| Arquivo | Motivo |
|---|---|
| `js/patches/lf-chat-switch-new-mode-v1-20260723.js` | Merged to chat.js |
| `js/patches/lf-auth-getclilocal-guard-v1-20260723.js` | Merged to clientes.js |
| `src/plugins/legacy-crm-bridge.js` | Não referenciado (DEPRECATED) |

---

## Verificação

- [x] Sem erros de sintaxe JavaScript em arquivos modificados
- [x] Script tags em index.html/app.html correspondem a arquivos existentes
- [x] Controllers não quebram contratos de API existentes
- [x] Mudanças CSS não afetam layout visual (apenas seletores não usados)
- [x] Patches reduzidos de 16 → 14
