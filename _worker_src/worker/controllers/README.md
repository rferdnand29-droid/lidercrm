# `controllers/` — camada de entrada da API (backend)

Um arquivo por recurso REST. Recebe a request já autenticada
(`ctx.user`) e autorizada (ver `docs/permissions.md`), valida o
payload (via `validators/validate.js` + `schemas/`), chama
`services/`/`repositories/`, devolve resposta padronizada
(`utils/response.js`).

Catálogo completo de rotas → `docs/worker.md`. Pipeline completo →
`docs/data-flow.md` §1.

## Arquivos e recurso que cobrem

| Arquivo | Recurso |
|---|---|
| `auth-controller.js` | Login, logout, sessão, refresh, ponte legada |
| `agenda-slots-controller.js` | Agenda compartilhada da equipe (1 registro por agendamento, não por consultor) |
| `atividades-controller.js` | Lembretes/tarefas (documento único por consultor) |
| `authz-health-controller.js` | Métricas do cache de `v_user_caps` — exige `caps.adminUI` |
| `branding-controller.js` | Identidade visual global (logo/nome/cor) — usa ETag/304 |
| `clientes-controller.js` | CRUD relacional + doc "bingo" por consultor — tem escopo enforcement |
| `dashboard-controller.js` | Agregados; estratégia dual relacional→legado, nunca lança erro fatal |
| `device-push-controller.js` | Registro de device para push (esqueleto, fase 2 pendente) |
| `documentos-controller.js` | CRUD de documentos |
| `feed-controller.js` | Feed compartilhado de atividades (1 documento por evento, não array único) |
| `financeiro-controller.js` | Dado financeiro — exige `caps.adminUI` (endurecido em auditoria de segurança) |
| `kanban-controller.js` | Board por consultor — tem escopo enforcement |
| `leads-controller.js` | CRUD de leads — tem escopo enforcement |
| `ligacoes-controller.js` | Contador de ligações do dia por consultor |
| `notificacoes-controller.js` | Notificações + inbox + regras de automação |
| `presence-controller.js` | Heartbeat / last-seen / usuários online |
| `roles-controller.js` | Sistema de permissões relacional (roles/permissions) |
| `settings-controller.js` | `public.settings` genérico (scope/key/value) |
| `upload-binary-controller.js` | Upload binário direto pro Backblaze B2 (chaves nunca no client) |
| `upload-controller.js` | Upload legado via JSON/base64 (mantido por compatibilidade) |
| `usuarios-controller.js` | Dual-write relacional + `fs_documents` legado |

## Padrão comum a quase todos

Import de `validators/validate.js` + `schemas/index.js` +
`services/crud-service.js` (ou repo direto) + `utils/response.js`.
Vários têm comentário "ESCOPE ENFORCEMENT" — camada aditiva sobre
`authz.js` que valida que o `uid` do registro bate com
`ctx.user.sub`. Não remover essa checagem sem entender a vulnerabilidade
específica documentada no cabeçalho de cada um.
