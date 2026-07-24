# Relatório de Arquitetura — Refatoração Profissional

## Escopo executado
- Reorganização arquitetural sem troca intencional de comportamento funcional.
- Entrega do projeto atualizado em ZIP.
- Geração de relatório de arquitetura e scripts de auditoria/validação.

## Diagnóstico encontrado
- Projeto com **147 arquivos** no pacote analisado.
- Entrypoints `index.html` e `app.html` carregavam **73 scripts** cada, com forte acoplamento por ordem de carga.
- Arquivos legados grandes e com responsabilidades misturadas identificados na camada `js/`:
  - `js/kanban.js` — 2487 linhas
  - `js/chat.js` — 1915 linhas
  - `js/chat-fixes.js` — 1428 linhas
  - `js/agenda.js` — 1408 linhas
  - `js/documentos.js` — 818 linhas
  - `js/supabase.js` — 727 linhas
  - `js/relatorios.js` — 675 linhas
  - `js/usuarios.js` — 673 linhas
- Funções longas relevantes identificadas pela auditoria:
  - `js/kanban.js` → `_makeCard` com 114 linhas
  - `js/chat.js` → `_chatOpenCtxMenu` com 88 linhas
  - `js/chat-fixes.js` → `fenceMenuStrict` com 48 linhas
  - `js/agenda.js` → `agdDoSave` com 102 linhas
  - `js/documentos.js` → `processAttFiles` com 66 linhas
  - `js/supabase.js` → `initDB` com 163 linhas
- Worker backend com **45 arquivos JS**, **125 arestas de import** e **0 dependências circulares detectadas**.

## Problemas arquiteturais atacados
- **Permissões acopladas ao fluxo de autenticação**: regras de acesso estavam concentradas em `js/auth.js` e consumidas transversalmente por vários módulos.
- **Resolução de runtime duplicada**: padrões de fallback para `getUser/getUsers/loadUsersDB/loadDepartmentsRemote` estavam espalhados.
- **Navegação hardcoded**: tabs e páginas de deep-link estavam montadas diretamente em `js/app.js`.
- **Carga síncrona sensível à ordem**: a aplicação dependia fortemente da sequência de `<script src>` dos entrypoints.

## Refatoração aplicada
### 1) Permissions
- Criado `src/shared/permissions/access-control.js`.
- Extraídas para módulo dedicado as regras e helpers: `getCargoNivel`, `hasSupervisorAccess`, `hasOrientadorAccess`, `getOrientadosIds`, `filterItemsForOrientador`, `hasAdminAccess`, `toggleAdminNote`.
- As mesmas funções continuam expostas em `window`, preservando compatibilidade com o legado.

### 2) Runtime resolver
- Criado `src/shared/runtime/legacy-runtime-resolver.js`.
- Centralizado o fallback de runtime para funções legadas e runtime de usuários.
- `js/auth.js` e `js/app.js` passaram a delegar resolução segura para esse módulo compartilhado.

### 3) Navigation/constants
- Criado `src/shared/constants/navigation.js`.
- Centralizadas as tabs da navegação e a whitelist de deep-link (`DEEP_LINK_PAGES`).
- `js/app.js` passou a consumir `navigation.getNavTabs(...)` e `navigation.DEEP_LINK_PAGES`.

### 4) Entrypoints
- `index.html` e `app.html` foram atualizados para carregar, antes do consumo em `auth.js/app.js`, os novos módulos compartilhados:
  - `src/shared/runtime/legacy-runtime-resolver.js`
  - `src/shared/permissions/access-control.js`
  - `src/shared/constants/navigation.js`

### 5) Auditoria e validação
- Criado `scripts/architecture-audit.js` para mapear arquivos grandes e funções extensas.
- Criado `scripts/validate-architecture.js` para validar wiring, delegações e artefatos da refatoração.
- Adicionado script NPM: `audit:architecture`.
- Gerado artefato `architecture-audit.json`.

## O que foi preservado para não alterar comportamento
- Mantida a exposição global das funções de permissão (`window.*`).
- Mantida a navegação por `goPage(...)` e os IDs originais das páginas/tabs.
- Mantida a estratégia de carregamento por scripts síncronos nos entrypoints; apenas inseridos módulos compartilhados antes do consumo.
- Mantidos os arquivos legados grandes intactos, exceto os pontos mínimos necessários para delegação arquitetural.

## Arquivos adicionados
- `src/shared/permissions/access-control.js`
- `src/shared/runtime/legacy-runtime-resolver.js`
- `src/shared/constants/navigation.js`
- `scripts/architecture-audit.js`
- `scripts/validate-architecture.js`
- `architecture-audit.json`

## Arquivos alterados
- `js/auth.js`
- `js/app.js`
- `index.html`
- `app.html`
- `package.json`

## Recomendações para próxima etapa
- Extrair próximos blocos de alta criticidade: `js/kanban.js`, `js/agenda.js`, `js/chat.js` e `js/documentos.js` por feature slices.
- Migrar handlers globais para módulos menores (state/hooks/helpers/validators) por domínio.
- Reduzir a dependência de ordem de `<script src>` com uma etapa de build quando houver janela segura para isso.

## Validação executada
- Wiring dos novos módulos em `index.html` e `app.html`: **OK**.
- Consumo de navegação compartilhada em `js/app.js`: **OK**.
- Delegação de runtime compartilhado em `js/auth.js`: **OK**.
- Constantes de permissão removidas de `js/auth.js` como fonte primária: **OK**.
- Script `audit:architecture` presente no `package.json`: **OK**.
