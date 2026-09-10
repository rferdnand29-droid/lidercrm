# 🎯 Relatório Forense — "Gerente/Representante só ganha função extra via Departamento"
**Data:** 2026-08-04
**Escopo:** `LiderCRM` (web/app/Capacitor + Cloudflare Worker + Supabase)
**Investigador:** Desenvolvedor(a) sênior — modo "caçador de erro específico"

---

## 🐞 1. Erro descrito pelo usuário
> "Atualmente existe os departamentos, que o ADM Hudson dá permissão pra um usuário ver leads de quem ele escolher. Só que antigamente quem era **gerente** ou **representante** já vinha essa função de ver e poder editar como ADM. Quero remover totalmente essa função. A partir de agora só terá essas funções extras se estiver num departamento que o ADM Hudson colocar. Então tanto gerente quanto representante, se não estiverem em departamento, não poderão ter essa função — terão funções básicas padrão de ver e mexer somente seus leads e ver suas próprias métricas."

---

## 🔬 2. Diagnóstico — causa raiz

O comportamento **não é um bug num único arquivo**. É uma **promoção automática de cargo hard-coded em 4 pontos que se reforçam mutuamente**:

| # | Camada    | Arquivo | Linha | Efeito |
|---|-----------|---------|-------|--------|
| A | Frontend legado | `js/auth.js` | 70 | `CARGOS_NIVEL_ADMIN=['gerente','gestor','representante','master']` → `hasAdminAccess()` retorna `true` só pelo texto do cargo. |
| B | Frontend novo (CARGO_CAPS) | `js/auth.js` | 124-128 | `gerente/gestor` nascem com `adminUI:true, supervisorUI:true, foreign:'edit', escopo:'team'`; `representante/master` com `escopo:'global'`. |
| C | Frontend hierarquia | `js/auth.js` | 350-355 | `CARGO_NIVEIS` mapeia esses cargos direto no nível 4/5 (`getCargoNivel()`), o que dispara `hasSupervisorAccess()`. |
| D | Backend Worker | `_worker_src/worker/middlewares/authz.js` | 47-53 | Espelho fiel do CARGO_CAPS do front — mesmo que o front seja corrigido, o Worker continua promovendo pelo JWT. |
| E | Banco (fonte de verdade nova) | `public.cargo_caps` (via `migration_hierarquia_20260723.sql`) | — | Linhas de `gerente/gestor/representante/master` com `admin_ui=true, supervisor_ui=true, foreign_acao='edit'`. |

**Consequência em cascata** (linha `js/usuarios.js:141`):
```js
if(hasAdminAccess&&hasAdminAccess(uid))return allUsers;      // <-- vaza aqui
if(!(hasSupervisorAccess&&hasSupervisorAccess(uid)))return allUsers.filter(...);
```
`getDepartmentVisibleUsers()` retorna **todos os usuários ativos** antes mesmo de consultar se o Hudson atribuiu um departamento. O mesmo padrão se repete em `js/relatorios.js` (7 chamadas), no Kanban (`js/kanban.js`) e no Painel ADM.

---

## ✅ 3. Regra nova (a partir de 2026-08-04)

| Situação | adminUI | supervisorUI | escopo | foreign | Vê métricas |
|----------|--------:|-------------:|--------|---------|-------------|
| Hudson (`role='adm'`) | ✅ | ✅ | global | edit | de todos |
| Qualquer cargo + `u.admExtra=true` (marcação manual do Hudson) | ✅ | ✅ | — | — | conforme escopo |
| **Gerente/Gestor/Repres./Master COM departamento atribuído** | ❌ | ✅ | department | edit | do departamento |
| **Gerente/Gestor/Repres./Master SEM departamento** | ❌ | ❌ | self | none | só as próprias |
| Supervisor COM departamento | ❌ | ✅ | department | edit | do departamento |
| Supervisor SEM departamento | ❌ | ❌ | self | none | só as próprias |
| Consultor/Funcionário/Administrativo/Orientador | ❌ | ❌ | self | none | só as próprias |

---

## 🛠️ 4. Correção definitiva — o que este pacote entrega

Correção em **defesa em profundidade** (front + backend + banco):

### 4.1 Frontend — `js/lf-cargo-only-via-departamento-v1-20260804.js`
Patch aditivo que **envelopa (wrap)** — sem editar — as 5 funções que decidem permissão:
- `getCargoCaps(uid)`
- `hasAdminAccess(uid)`
- `hasSupervisorAccess(uid)`
- `canEditForeign(uid,item)`
- `getCargoNivel(uid)`

Cada wrapper aplica a regra da tabela acima. Se `LF_SCOPE_V2` já está no ar, usa `LF_SCOPE_V2.departamentoOfUser(uid)` (a fonte real: `team_id → teams.departamento_id`). Senão, cai em `S.departamentoId`/`S.teamId` do JWT, depois em `u.departamentoId`, e por fim no cadastro manual de Departamentos (`Estrutura`). Nenhum patch antigo quebra — todos continuam chamando as mesmas funções.

**Rollback rápido:**
```js
localStorage.setItem('lf_cargo_only_dept_disabled','1'); location.reload();
// ou, sem reload:
window.__lfRollbackCargoOnlyDept();
```

### 4.2 Backend Worker — `_worker_src/worker/middlewares/authz-cargo-only-dept-patch.js`
Aplica a mesma regra no middleware `authz` (2ª barreira). Sem isso, um cliente adulterado bateria direto no Worker e as caps do JWT ainda promoveriam. O patch expõe:
- `applyCargoOnlyDeptRule(caps, raw, dbRow)` — chamar no final de `resolveUserCaps`.
- `wrapResolveUserCaps(fn)` — helper opcional pra envelopar em uma linha só.

### 4.3 Banco — `sql/migrations/migration_cargo_only_dept_20260804.sql`
Atualiza `public.cargo_caps` para que `gerente/gestor/representante/master` nasçam como consultor. Idempotente. Reversível (SQL de rollback comentado no cabeçalho).

---

## 🧪 5. Como validar

Depois de aplicar os 3 componentes, rodar (no console do navegador logado como cada perfil):

```js
// Como um GERENTE sem departamento:
S.userId                                  // <-- uid do gerente
getCargoCaps(S.userId)
// Esperado: {escopo:'self', leads:'crud', negocios:'crud', foreign:'none',
//            adminUI:false, supervisorUI:false, ...}
hasAdminAccess()       // false
hasSupervisorAccess()  // false
getDepartmentVisibleUsers(S.userId).length  // 1 (só ele mesmo)

// Como um GERENTE colocado num departamento pelo Hudson:
getCargoCaps(S.userId)
// Esperado: {escopo:'team', foreign:'edit', supervisorUI:true, adminUI:false, ...}
hasAdminAccess()       // false (Painel ADM continua bloqueado)
hasSupervisorAccess()  // true  (aba Time liberada)

// Hudson:
hasAdminAccess()       // true
```

Rota Worker (validação backend):

```bash
# JWT de um gerente sem departamento — GET /api/v1/admin deve retornar 403.
curl -H "Authorization: Bearer <jwt-gerente-sem-dept>" .../api/v1/admin
# HTTP/1.1 403 Forbidden

# Mesmo JWT — GET /api/v1/leads sem filtro deve devolver só leads em que owner_id = ele.
```

SQL:
```sql
SELECT cargo_codigo, escopo, foreign_acao, admin_ui, supervisor_ui
FROM public.cargo_caps
ORDER BY cargo_codigo;
-- gerente/gestor/representante/master devem estar com self/none/false/false.
```

---

## 📦 6. Ordem de aplicação recomendada

1. **Banco primeiro** (`migration_cargo_only_dept_20260804.sql`) — fonte de verdade primária.
2. **Worker depois** (`authz-cargo-only-dept-patch.js` + edição de 1 linha em `authz.js`).
3. **Frontend por último** (`lf-cargo-only-via-departamento-v1-20260804.js` incluído em `app.html`/`index.html` **logo após** `js/auth.js`).

Se aplicar em ordem inversa, nada quebra — só fica com barreiras redundantes por alguns minutos.

---

## ⚠️ 7. O que este pacote NÃO faz (de propósito)

- **Não remove** `CARGOS_NIVEL_ADMIN`, `CARGO_CAPS.gerente`, etc. do `auth.js`. Preservado para compatibilidade com patches antigos que fazem `typeof` checks. A regra nova roda por cima via wrapper.
- **Não altera** o esquema de departamentos (`sql/10-schema-departamentos.sql`) — a resolução `team_id → teams.departamento_id` já funciona e é reusada.
- **Não mexe** em `u.admExtra`. Esse continua sendo o único jeito de o Hudson dar Painel ADM manualmente a alguém — se ele quiser derrubar isso, é só desmarcar a caixa no cadastro do usuário.
