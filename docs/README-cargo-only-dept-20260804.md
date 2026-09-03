# 🎯 LiderCRM — Correção Definitiva: cargo só ganha função extra via Departamento

**Data:** 2026-08-04
**Versão:** v1
**Escopo:** remoção completa da promoção automática de `gerente/gestor/representante/master`
para função de ADM/Supervisor. A partir de agora, esses cargos só ganham escopo além do próprio
usuário se o **ADM Hudson** os colocar num departamento.

---

## 📁 Conteúdo do pacote

```
lidercrm-fix-cargo-somente-departamento-20260804/
├── README.md                                                    ← este arquivo
├── docs/
│   └── RELATORIO-CACADOR-ERRO-CARGO-DEPARTAMENTO-20260804.md    ← diagnóstico forense + plano
├── js/
│   └── scope/lf-cargo-only-via-departamento-v1-20260804.js       ← patch frontend (aditivo)
├── _worker_src/worker/middlewares/
│   └── authz-cargo-only-dept-patch.js                           ← patch backend (aditivo)
└── sql/migrations/
    └── migration_cargo_only_dept_20260804.sql                    ← migration idempotente
```

---

## 🚀 Como aplicar (passo a passo)

### 1) Banco (Supabase / PostgreSQL) — 30 segundos
```bash
psql "$LIDER_DB_URL" -f sql/migrations/migration_cargo_only_dept_20260804.sql
```
Ou colar o conteúdo no Supabase → SQL Editor → Run. É idempotente.

### 2) Backend Worker
Copiar `_worker_src/worker/middlewares/authz-cargo-only-dept-patch.js` para o mesmo caminho no projeto e adicionar **uma única linha** em `_worker_src/worker/middlewares/authz.js`, dentro da função `resolveUserCaps`, logo antes do `return base;` final:

```js
import { applyCargoOnlyDeptRule } from './authz-cargo-only-dept-patch.js';
// ...
return applyCargoOnlyDeptRule(base, raw, dbRow);
```

Depois rebuildar/deploy do Worker normalmente (`wrangler deploy` ou seu pipeline).

### 3) Frontend
O patch vive em `js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js`
e é registrado somente em `index.html`, logo após `js/auth.js`; `app.html`
é gerado automaticamente:

```html
<script src="js/auth.js"></script>
<!-- ...outros scripts... -->
<script src="js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js"></script>
```

Não precisa mexer no restante do código — o patch envelopa `getCargoCaps`, `hasAdminAccess`, `hasSupervisorAccess`, `canEditForeign` e `getCargoNivel`, e todo o resto do app já usa essas funções.

---

## ✅ Validação rápida

Depois de aplicar, no console do navegador:

```js
// Logado como um gerente SEM departamento:
hasAdminAccess()                            // false   ✅
hasSupervisorAccess()                       // false   ✅
getCargoCaps().adminUI                      // false   ✅
getCargoCaps().escopo                       // 'self'  ✅

// Logado como um gerente COM departamento (após Hudson atribuir):
hasAdminAccess()                            // false   ✅ (Painel ADM segue bloqueado)
hasSupervisorAccess()                       // true    ✅ (aba Time liberada)
getCargoCaps().escopo                       // 'team'  ✅
getCargoCaps().foreign                      // 'edit'  ✅
```

---

## ↩️ Rollback

### Frontend
```js
localStorage.setItem('lf_cargo_only_dept_disabled','1');
location.reload();
```
Ou, sem reload:
```js
window.__lfRollbackCargoOnlyDept();
```

### Backend
Remover a linha `return applyCargoOnlyDeptRule(...)` do `authz.js` e redeploy.

### Banco
SQL de rollback está comentado no cabeçalho de `migration_cargo_only_dept_20260804.sql`.

---

## 📖 Detalhes técnicos

Ver [`docs/RELATORIO-CACADOR-ERRO-CARGO-DEPARTAMENTO-20260804.md`](docs/RELATORIO-CACADOR-ERRO-CARGO-DEPARTAMENTO-20260804.md) para o diagnóstico forense completo com todas as ocorrências encontradas e por que cada uma precisa ser tratada.
