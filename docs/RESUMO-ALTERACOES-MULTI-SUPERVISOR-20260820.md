# Resumo das Alterações — Múltiplos Supervisores e Adjuntos por Departamento

**Data:** 2026-08-20
**Pacote:** `lidercrm-remodel-multi-supervisor.zip` (derivado de `lidercrm-remodel-patched.zip`)

---

## 1. Pedido

> "Ao criar departamentos deve agora ser possível colocar mais de 1 supervisor e mais de 1 supervisor adjunto no mesmo departamento."

## 2. Causa raiz

Toda a cadeia de departamentos foi desenhada para **um único** supervisor e **um único** adjunto:

| Camada | Onde | Limitação original |
|---|---|---|
| UI | Modal `#mo-dept` nos HTMLs | `<select id="dept-sup">` e `<select id="dept-sup-adj">` simples (1 valor) |
| Front | `js/usuarios.js` (`saveDept`, `_normalizeDeptRefsForUsers`, `_deptUserBelongs`) | campos escalares `supervisorId` / `supervisorAdjId` |
| API client | `js/patches/departments/lf-departments-crud-v1-20260803.js` | payload com `supervisorUid` / `adjuntoUid` únicos |
| Backend | `_worker_src/worker/controllers/departamentos-controller.js` | `INSERT/UPDATE` gravando só `supervisor_uid` / `adjunto_uid` |
| Banco | tabela `departamentos` (`sql/10-schema-departamentos.sql`) | colunas escalares `supervisor_uid UUID` / `adjunto_uid UUID` |

## 3. Solução (modelo novo, 100% retrocompatível)

Modelo novo baseado em **arrays**:

- Front (objeto do departamento): `supervisorIds: []` e `supervisorAdjIds: []`
- API (payload): `supervisorUids: []` e `adjuntoUids: []`
- Banco (colunas novas JSONB): `supervisor_uids` e `adjunto_uids`

**Retrocompatibilidade:** os campos escalares antigos (`supervisorId`, `supervisor_uid`, etc.) **continuam sendo gravados** com o **primeiro** selecionado de cada grupo. Assim, todos os consumidores antigos (patches de escopo, RLS, cards da Estrutura, índices do banco) continuam funcionando sem nenhuma alteração e sem janela de quebra. Departamentos criados antes desta mudança são lidos normalmente (fallback automático do formato antigo para o novo).

## 4. Arquivos alterados

### 4.1 `js/usuarios.js`, `www/js/usuarios.js`, `src/usuarios.js` (3 cópias, mesma alteração)

1. **Novas funções `_deptSupIds(dept)` e `_deptAdjIds(dept)`** — leem os arrays novos (`supervisorIds`/`supervisorAdjIds`) com fallback para os escalares legados (`supervisorId`/`supervisorAdjId`). Deduplicam e removem vazios.
2. **`_deptUserBelongs()`** — passa a verificar pertencimento contra as listas (qualquer supervisor/adjunto da lista "pertence" ao departamento), em vez de comparar com um único id.
3. **`_normalizeDeptRefsForUsers()`** — normaliza as duas listas: remove ids inexistentes, impede a mesma pessoa como supervisor **e** adjunto, remove supervisores/adjuntos de `memberIds`, e grava os escalares legados como espelho do 1º de cada lista.
4. **`_cleanupDepartmentsForRemovedUser()`** — ao excluir um usuário, remove o id dele de **todas** as listas de todos os departamentos (antes só limpava o escalar).
5. **`_deptCardHtml()`** — card da Estrutura mostra o 1º supervisor com contador "+N" quando houver mais; chip de adjuntos no plural com contador.
6. **`deptSelectCard()`** — painel de detalhes lista **todos** os supervisores e **todos** os adjuntos (badge "Supervisor"/"Adjunto" por pessoa).
7. **`openDeptEditor()`** — preenche os selects marcando **todos** os pré-selecionados (arrays), mantendo fallback para o formato antigo.
8. **`saveDept()`** — lê `selectedOptions` (N valores) dos dois selects e salva o objeto com `supervisorIds`/`supervisorAdjIds`.

### 4.2 `src/modules/usuarios/runtime/users-store.js`, `www/src/modules/usuarios/runtime/users-store.js` (2 cópias)

9. **`saveDepartmentsList()`** — além do cache local (`lf_departments`) e do config-doc Firebase, agora sincroniza cada departamento com o backend real via `LF_DEPARTMENTS.create()/update()` (rota `/api/v1/departamentos`), enviando os arrays. Falhas são silenciosas (não quebram o fluxo local).

### 4.3 `js/patches/departments/lf-departments-crud-v1-20260803.js`, `www/js/patches/departments/...` (2 cópias)

10. **`_fromServerShape()`** — espelha as colunas JSONB novas (`supervisor_uids`/`adjunto_uids`) para `supervisorIds`/`supervisorAdjIds`, com fallback para as colunas escalares quando a migration ainda não tiver rodado.
11. **`create()`** — aceita `supervisorIds`/`adjuntoIds` (arrays) ou os escalares legados; envia `supervisorUids`/`adjuntoUids` + `supervisorUid`/`adjuntoUid` (1º da lista) e permite `id` vindo do chamador (mesmo id no backend e na Estrutura).
12. **`update()`** — mesma lógica de arrays no PATCH.
13. **`diagnostics()`** — contador `semSupervisor` considera tanto a coluna escalar quanto o array.

### 4.4 `_worker_src/worker/controllers/departamentos-controller.js`

14. **Nova função `sanitizeUidArray()`** — saneamento de listas de uids (strings não-vazias, dedup, teto de 100).
15. **`createDepartamento()`** — aceita `supervisorUids`/`adjuntoUids`; grava as colunas JSONB novas **e** as escalares legadas (1º da lista); aceita `id` do chamador.
16. **`updateDepartamento()`** — idem no PATCH (arrays novos ou escalar legado, mantendo os dois formatos sempre consistentes entre si).

### 4.5 `index.html`, `app.html`, `www/index.html`, `www/app.html` (4 arquivos)

17. Modal `#mo-dept`: `<select id="dept-sup">` e `<select id="dept-sup-adj">` viraram **múltiplos** (`multiple size="5"/"4"`), sem option vazia; rótulos atualizados ("Supervisores (1 ou mais)", "Supervisores adjuntos (opcional, 1 ou mais)").
18. Nova tag `<script>` incluída nos 4 HTMLs: `js/patches/departments/lf-dept-multi-supervisores-20260820.js` (logo após o patch de multiselect de colaboradores).

## 5. Arquivos novos

### 5.1 `js/patches/departments/lf-dept-multi-supervisores-20260820.js` (+ cópia em `www/js/patches/departments/`)

Patch de UX aditivo (flag de idempotência `__LF_DEPT_MULTI_SUP_20260820__`):

- Re-estiliza os selects múltiplos como **listas de checkbox clicáveis** (mesma linguagem visual da lista de Colaboradores) — sem depender de Ctrl/Cmd+clique, que não existe no mobile.
- Adiciona **busca** e **contador de selecionados** acima de cada lista.
- Não muda ids nem o formato de leitura: `saveDept()` continua lendo `select.selectedOptions`.
- **Graceful degradation:** se o HTML antigo (select simples) estiver em cache num cliente, o patch detecta a ausência do atributo `multiple` e não aplica o re-estilo — o comportamento antigo continua funcionando.
- CSS injetado em runtime (id `lf-msup-css`), re-render automático via `MutationObserver` quando `openDeptEditor()` reescreve as options.

### 5.2 `sql/migrations/migration_dept_multi_supervisores_20260820.sql`

Migration aditiva e idempotente:

- `ALTER TABLE departamentos ADD COLUMN IF NOT EXISTS supervisor_uids JSONB NOT NULL DEFAULT '[]'`
- `ALTER TABLE departamentos ADD COLUMN IF NOT EXISTS adjunto_uids JSONB NOT NULL DEFAULT '[]'`
- **Backfill:** quem já tinha supervisor/adjunto ganha a lista de 1 item.
- Índices GIN `idx_departamentos_supervisor_uids` / `idx_departamentos_adjunto_uids` (consultas "em quais departamentos X é supervisor?" via `@>`).
- As colunas antigas **não** são removidas (viram espelho do 1º elemento; índices e consumidores legados preservados).

### 5.3 `docs/RESUMO-ALTERACOES-MULTI-SUPERVISOR-20260820.md`

Este documento.

## 6. Validação executada

- **`node --check`**: OK nos 9 JS alterados + 2 novos (todas as cópias) e no controller do worker (ESM).
- **Consistência**: os 4 HTMLs têm exatamente 2 selects múltiplos + 1 inclusão do patch novo cada.
- **Teste funcional (Node)** das funções extraídas do `usuarios.js` alterado — **18/18 cenários passaram**, cobrindo: leitura de departamento legado, 2 supervisores + 2 adjuntos, espelho do legado (1º da lista), dedup supervisor↔adjunto, remoção de id inexistente, remoção de membro promovido a supervisor, normalização do formato antigo para arrays, e departamento sem supervisores.

## 7. Passo necessário no deploy

1. **Rodar a migration** `sql/migrations/migration_dept_multi_supervisores_20260820.sql` no Supabase (SQL Editor). Sem ela, o front continua funcionando, mas os arrays ficam só no cache/config-doc até a coluna existir.
2. Publicar o front (os 4 HTMLs + JS) e o worker (`departamentos-controller.js`) atualizados.
3. Recomendado: forçar refresh de cache dos clientes (os patches carregam com `defer`; a versão dos assets segue o padrão `?v=` já existente).

## 8. Rollback

- Comentar a linha do script `lf-dept-multi-supervisores-20260820.js` nos 4 HTMLs e apagar o arquivo do patch (2 cópias).
- Reverter `usuarios.js` (3 cópias), `users-store.js` (2 cópias), `lf-departments-crud-v1-20260803.js` (2 cópias) e `departamentos-controller.js` para as versões do pacote anterior.
- A migration é aditiva — não precisa de rollback (as colunas novas simplesmente ficam sem uso).
