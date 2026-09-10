# Worker — catálogo completo do backend

> Visão geral de infraestrutura (deploy, `_headers`/`_redirects`) já
> está em `docs/cloudflare.md`. Este documento é o mergulho no CÓDIGO
> de dentro de `_worker_src/worker/` — pipeline, camadas e a tabela de
> rotas completa (77 rotas, extraída direto de `routes/router.js` em
> 2026-08-01).

## As 10 camadas (cada uma com seu próprio README em `_worker_src/worker/<camada>/README.md`)

| Camada | Responsabilidade |
|---|---|
| `controllers/` | Um arquivo por recurso REST. Recebe request já autenticado/autorizado, valida payload, chama services/repositories, devolve resposta padronizada. |
| `middlewares/` | `cors.js`, `rate-limit.js`, `auth.js` (autenticação), `authz.js` (autorização) — nessa ordem no pipeline. |
| `services/` | Lógica de orquestração (ex.: `crud-service.js` genérico, `auth-service.js` — este delega pra subpasta `services/auth/`). |
| `repositories/` | Acesso a dado via `lib/supabase-rest.js`. `repositories/index.js` = instâncias por domínio. |
| `routes/` | `router.js` — tabela `[path, método, handler]`, ver catálogo completo abaixo. |
| `schemas/` + `validators/` | `schemas/index.js` define forma esperada do payload por rota; `validators/validate.js` (estilo Zod, sem dependência) aplica. |
| `errors/` | `http-errors.js` — hierarquia de erro HTTP central. |
| `lib/` | Clientes de baixo nível: `supabase-rest.js` (PostgREST/Auth/Storage via fetch puro), `fs-documents.js` (adaptador Firestore-like). |
| `utils/` | `crypto.js` (JWT/hash via WebCrypto), `env.js`, `etag.js`, `logger.js`, `response.js`. |

## Pipeline de request — ver `docs/data-flow.md` §1 para o diagrama completo

`functions/[[path]].js` → `api-handler.js` (`handleApi`) → CORS →
rate-limit → auth (autenticação) → authz (autorização) → router →
controller → resposta padronizada.

## Catálogo completo de rotas (`/api/v1/*`)

### Auth / Sessão
| Rota | Método | Controller |
|---|---|---|
| `/login` | POST | `loginController` |
| `/logout` | POST | `logoutController` |
| `/session` | GET | `sessionController` |
| `/session/refresh` | POST | `refreshSessionController` |
| `/session/legacy-nonce` | GET | `legacyNonceController` |
| `/session/legacy-bridge` | POST | `legacyBridgeController` |

### Clientes (BINGO/negócios)
| Rota | Método | Controller |
|---|---|---|
| `/clientes` | GET/POST/PUT/PATCH/DELETE | `listClientes` / `createCliente` / `updateCliente` (PUT e PATCH) / `deleteCliente` |
| `/clientes/list` | GET/PUT | `getClientesListDoc` / `putClientesListDoc` |

### Kanban, ligações, atividades, agenda
| Rota | Método | Controller |
|---|---|---|
| `/kanban/list` | GET/PUT | `getKanbanListDoc` / `putKanbanListDoc` |
| `/ligacoes/list` | GET/PUT | `getLigacoesListDoc` / `putLigacoesListDoc` |
| `/atividades/list` | GET/PUT | `getAtividadesListDoc` / `putAtividadesListDoc` |
| `/agenda-slots` | GET/POST/PUT/DELETE | `listAgendaSlots` / `createAgendaSlot` / `updateAgendaSlot` / `deleteAgendaSlot` |

### Leads, dashboard, financeiro
| Rota | Método | Controller |
|---|---|---|
| `/leads` | GET/POST/PUT/PATCH/DELETE | `listLeads` / `createLead` / `updateLead` (PUT e PATCH) / `deleteLead` |
| `/dashboard` | GET | `getDashboard` |
| `/financeiro` | GET | `listFinanceiro` (exige `caps.adminUI`) |

### Usuários
| Rota | Método | Controller |
|---|---|---|
| `/usuarios` | GET/POST/PUT/DELETE | `listUsuarios` / `createOrUpsertUsuario` (POST e PUT) / `deleteUsuario` |
| `/usuarios/bulk` | POST | `bulkUpsertUsuarios` |
| `/usuarios/legacy` | GET | `getLegacyUsuarios` |
| `/usuarios/config` | GET/PUT/DELETE | `getUsuarioConfig` / `putUsuarioConfig` / `deleteUsuarioConfig` |
| `/usuarios/change-password` | POST | `changePasswordController` |
| `/usuarios/admin-reset-password` | POST | `adminResetPasswordController` |

### Documentos, notificações, feed
| Rota | Método | Controller |
|---|---|---|
| `/documentos` | GET/POST | `listDocumentos` / `createDocumento` |
| `/documentos/adm` | GET/PUT | `getAdmDocumentos` / `putAdmDocumentos` |
| `/notificacoes` | GET/POST | `listNotificacoes` / `createNotificacao` |
| `/notificacoes/inbox` | GET/PUT/POST | `getInboxNotificacoes` / `putInboxNotificacoes` / `postInboxNotificacao` |
| `/notificacoes/rules` | GET/PUT | `getAutomationRules` / `putAutomationRules` |
| `/feed` | GET/POST | `listFeed` / `createFeedEvento` |

### Upload
| Rota | Método | Controller |
|---|---|---|
| `/upload` (legado, base64 via JSON) | POST/DELETE | `uploadController` / `deleteUploadController` |
| `/upload/binary` (multipart/octet-stream) | POST/DELETE | `uploadBinaryController` / `deleteBinaryController` |

### Presença, push, roles, branding, settings, saúde
| Rota | Método | Controller |
|---|---|---|
| `/users/heartbeat` | POST | `heartbeatController` |
| `/users/last-seen` | POST | `lastSeenController` |
| `/users/online` | GET | `onlineUsersController` |
| `/push/register` | POST/DELETE | `registerDeviceController` / `unregisterDeviceController` |
| `/push/devices` | GET | `listDevicesController` |
| `/roles` | GET | `listRoles` |
| `/roles/permissions` | GET | `listRolePermissions` |
| `/permissions/me` | GET | `listMyPermissions` |
| `/branding` | GET/PUT/DELETE | `getBrandingCtrl` / `putBrandingCtrl` / `deleteBrandingCtrl` |
| `/settings` | GET/PUT/DELETE | `getSettingCtrl` / `putSettingCtrl` / `deleteSettingCtrl` |
| `/settings/list` | GET | `listSettingsCtrl` |
| `/health/authz-cache` | GET | `authzCacheHealthController` (exige `caps.adminUI`) |

**Fonte da verdade**: `_worker_src/worker/routes/router.js`, array
`ROUTES`. Se este catálogo e o arquivo divergirem no futuro, o arquivo
está certo — atualizar esta tabela.

## Como adicionar uma rota nova (checklist)

1. Controller em `controllers/<recurso>-controller.js` (novo ou existente).
2. Schema em `schemas/index.js` se o payload precisar validação.
3. Entrada em `ROUTES` (`routes/router.js`).
4. Se a rota precisa ser restrita além do padrão: entrada em
   `ROUTE_MATRIX` (`middlewares/authz.js`) — ver `docs/permissions.md`.
5. Se a rota só aceita POST e precisa do guardrail de método amigável:
   adicionar em `_ROUTES_POST_ONLY` (`functions/[[path]].js`).
6. Rodar `node --check` nos arquivos tocados antes de considerar pronto.

## `financeiroRepo` — problema conhecido, não corrigido aqui

`repositories/index.js` documenta que `financeiroRepo` aponta para uma
tabela que **não existe** no banco atual — achado da auditoria técnica
existente (`docs/AUDITORIA-TECNICA-20260801.md`), não desta
reorganização, e fora de escopo corrigir aqui (Regra nº 6/7 da missão
de arquitetura: não mexer em banco/queries). Mantido documentado, não
alterado.
