# Módulos — catálogo completo

Este projeto tem **três gerações coexistentes** de organização de código
client-side (ver `docs/architecture.md` para o porquê). Este documento
cataloga os módulos de cada geração. Nenhuma delas usa `import`/`export`
real — "módulo" aqui significa "arquivo(s) com uma responsabilidade,
carregado(s) via `<script>`".

## Geração 1 — `js/*.js` (módulos originais, um por tela)

Cada arquivo expõe funções globais diretamente (`function renderChatList(){}`
vira `window.renderChatList`). Não têm README individual — são grandes o
bastante e antigos o bastante para já serem o "core" implícito do projeto.
Principais: `auth.js` (login + CARGO_CAPS), `kanban.js`, `leads.js`,
`chat.js`, `agenda.js`, `clientes.js` (financeiro), `supabase.js`
(adaptador de dados), `utils.js` (helpers gerais + escaping HTML),
`relatorios.js`, `documentos.js`.

## Geração 2 — `src/modules/<área>/` (modularização parcial, namespaced)

Extraído de dentro dos arquivos da Geração 1, mas SEM sistema de módulo
real — cada arquivo se registra em `window.LiderCRM.modules.<área>`.
Todos carregados em `index.html` **e** `app.html`, identicamente.

| Área | Pasta | Namespace | README |
|---|---|---|---|
| Agenda | `src/modules/agenda/runtime/` | `LiderCRM.modules.agenda.runtime` | `src/modules/agenda/README.md` |
| Configurações | `src/modules/configuracoes/runtime/` | `LiderCRM.modules.configuracoes.runtime` | `src/modules/configuracoes/README.md` |
| Documentos | `src/modules/documentos/runtime/` | `LiderCRM.modules.documentos.runtime` | `src/modules/documentos/README.md` |
| Kanban | `src/modules/kanban/runtime/` | `LiderCRM.modules.kanban.runtime` | `src/modules/kanban/README.md` |
| Leads | `src/modules/leads/{runtime,data}/` | `LiderCRM.modules.leads.{runtime,data}` | `src/modules/leads/README.md` |
| Relatórios | `src/modules/relatorios/runtime/` | `LiderCRM.modules.relatorios.runtime` | `src/modules/relatorios/README.md` |
| Storage | `src/modules/storage/runtime/` | `LiderCRM.modules.storage.runtime` | `src/modules/storage/README.md` |
| Sync | `src/modules/sync/runtime/` | `LiderCRM.modules.sync.runtime` | `src/modules/sync/README.md` |
| Usuários | `src/modules/usuarios/runtime/` | `LiderCRM.modules.usuarios.runtime` | `src/modules/usuarios/README.md` |

Cada pasta tem 1-3 arquivos. Todos foram extraídos incrementalmente de
`js/*.js` (ver cabeçalho de cada arquivo pra saber de qual arquivo
original e em qual "rodada"). Nenhum tem lógica de DOM — só
estado/transformação de dados, por design (ver `src/modules/*/README.md`
individuais).

## Geração 2.5 — `src/{core,repositories,services,shared}/` (camadas transversais)

Paralelo à Geração 2, mas organizado por **camada** (não por tela).
Também 100% carregado em ambos entry points:

- `src/core/bridge/` — ponte com o CRM legado.
- `src/core/contracts/` — mapa de rotas da API (`api-contract.js`), usado pelos clients HTTP.
- `src/core/offline/` — fila de retry, backoff, gerenciador offline, sync manager.
- `src/repositories/` — uma classe por entidade (clientes, leads, financeiro, dashboard, documentos, storage, usuarios) sobre `base-repository.js`.
- `src/services/` — orquestração por entidade sobre `base-service.js` (auth, cliente, lead, financeiro, dashboard, notification, storage, sync, upload).
- `src/shared/config/` — config runtime lida de `<meta>` tags injetadas no HTML de deploy.
- `src/shared/http/` — `http-client.js` (fetch genérico + sessão JWT) e `worker-client.js` (API v1 de alto nível).
- `src/shared/state/` — `app-store.js`, estado compartilhado do client.
- `src/shared/utils/` — `namespace.js` (ativo, base do padrão `LiderCRM.utils.*`) **+** 6 bibliotecas novas de 2026-08-01 (cpf-cnpj, telefone, dinheiro, datas, validators, debounce-throttle) — **estas 6 NÃO estão conectadas** a nenhum HTML ainda. Ver `src/shared/utils/README.md`.

Ver READMEs individuais de cada pasta pra lista exata de arquivos e propósito.

## Backend — `_worker_src/worker/` (10 camadas)

Não é "módulo" no sentido client — é o backend real, com import/export
ES module de verdade (roda no runtime Cloudflare Workers, não no
navegador). Ver `docs/worker.md` para o catálogo completo de
controllers/rotas, e os READMEs de cada subpasta
(`_worker_src/worker/<camada>/README.md`).

## Diagnóstico rápido: "esse módulo está realmente rodando?"

Não assuma. Confira:
```bash
grep -o 'src="[^"]*<caminho>[^"]*"' index.html app.html
```
Se não aparecer em nenhum dos dois, o arquivo existe no disco mas **não
está conectado** — como é o caso hoje de `src/shared/utils/{cpf-cnpj,
telefone,dinheiro,datas,validators,debounce-throttle}.js`,
`diagnostics/**` inteiro, e (achado desta auditoria) `js/hash.js`. Ver
`docs/ai-guide.md` § "Achados desta auditoria" para a lista completa e
o porquê disso importar antes de mexer em qualquer coisa.
