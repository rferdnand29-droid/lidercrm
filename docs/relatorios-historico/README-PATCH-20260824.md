# PATCH LiderCRM — Fix 403 ADM raiz + Rollback de transferência (2026-08-24)

Este pacote corrige as duas causas-raiz identificadas no relatório:

1. **403 em massa em `GET/PUT /api/v1/kanban/list`** — o middleware
   `authz-cargo-only-dept-patch.js` rebaixava o `adm_root_2026` para
   `CAPS_BASIC_CONSULTOR` (`escopo:'self'`, `foreign:'none'`), porque
   `_isRootAdm()` só reconhecia `sub === 'adm'`. A guarda de propriedade do
   `kanban-controller.js` então bloqueava toda leitura/escrita cross-owner
   (`KANBAN_LIST_R4_OWNERSHIP_LOCK` / `cross_owner_kanban_read`).

2. **Leads "sumindo" após transferência em massa** — a pintura otimista em
   `js/kanban.js` gravava o localStorage ANTES da resposta do worker e não
   revertia em caso de falha. Com os PUTs voltando 403, o cartão era removido
   da origem local sem nunca chegar ao destino.

Os patches de 19/08 (`LF-KANBAN-PUT-MERGE-20260819`, `LF-KB-SAVE-RETRY-20260819`)
e de 21/08 (`_kbSeedLeadStageEnteredAt` / fix Livre automático) **já estavam
presentes** no pacote-base e foram preservados.

---

## O que foi alterado

### P1 — `_worker_src/worker/middlewares/authz-cargo-only-dept-patch.js` (BACKEND)
`_isRootAdm()` passa a reconhecer subs namespaced do ADM raiz:

```js
if(typeof raw.sub === 'string' && /^adm(_|$)/i.test(raw.sub)) return true; // adm_root_2026, adm_*, 'adm'
if(raw.adm_root === true) return true;                                     // flag explícita no JWT
```

Efeito: `applyCargoOnlyDeptRule()` retorna as caps originais do ADM
(`escopo:'global'`), eliminando TODOS os 403 de leitura/escrita cross-owner.

### P2 — Espelho no front (6 cópias idênticas)
- `js/lf-cargo-only-via-departamento-v1-20260804.js`
- `js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js`
- `www/js/lf-cargo-only-via-departamento-v1-20260804.js`
- `www/js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js`
- `android/app/src/main/assets/public/js/lf-cargo-only-via-departamento-v1-20260804.js`
- `ios/App/App/public/js/lf-cargo-only-via-departamento-v1-20260804.js`

`_isRootAdm(uid)` passa a reconhecer `/^adm(_|$)/i` — evita o rebaixamento de
`hasAdminAccess()` / `_patchedCanEditForeign` no cliente para `adm_root_2026`.

### P3 — `js/kanban.js` (+ espelhos `www/`, `android/`, `ios/`) — transferência individual
- Snapshot `_snapSrc` / `_snapDst` dos dois boards ANTES da pintura otimista.
- No callback de `_kbTransferCard`, se `res === false` (PUT falhou): rollback
  dos dois boards + toast `⚠️ Transferência falhou — nada foi movido`.

### P4 — `js/kanban.js` (+ espelhos) — `applyBulkRespAndStage` (em massa)
- Snapshot por item antes de cada `_kbTransferCard`.
- Se o item falhar: rollback local daquele card (origem + destino) antes de
  seguir a fila. O card não "some" mais da origem.

Tag de rastreio no código: `LF-AUTHZ-ROOTADM-FIX-20260824` (P1/P2) e
`LF-KB-TRANSFER-ROLLBACK-20260824` (P3/P4).

---

## Como aplicar

### Opção A — sobrescrever os arquivos (recomendado)
A estrutura de pastas deste ZIP espelha a raiz do projeto. No servidor:

```bash
cd /caminho/do/lidercrm
cp -r <pasta_destes_arquivos>/* .
# rebuild/deploy do worker (conforme seu pipeline, ex.: wrangler deploy)
```

### Opção B — aplicar os diffs manualmente
Os diffs unificados estão em `diffs/` (referência apenas aos arquivos-canônicos;
as cópias espelhadas de `www/`, `android/` e `ios/` devem receber a mesma
alteração — este pacote já as entrega prontas).

---

## Como validar

1. **Worker atualizado:**
   ```bash
   grep -c "adm(_|$)" _worker_src/worker/middlewares/authz-cargo-only-dept-patch.js   # >= 1
   grep -c "LF-AUTHZ-ROOTADM-FIX-20260824" js/lf-cargo-only-via-departamento-v1-20260804.js  # 1
   grep -c "LF-KB-TRANSFER-ROLLBACK-20260824" js/kanban.js   # 3
   node scripts/verify-mirror.mjs   # www/ e raiz idênticos
   ```
2. **Caps do ADM:** `GET /api/v1/permissions/me` autenticado como
   `adm_root_2026` deve voltar `escopo:'global'` (ou `team` + `adminUI:true`)
   — nunca mais `escopo:'self', foreign:'none'`.
3. **Transferência em massa:** DevTools → Rede — nenhum 403 em
   `/api/v1/kanban/list`; os leads aparecem no board do novo responsável.
4. **Rollback:** simulando falha de rede no PUT, o card permanece na origem e
   o toast de falha aparece.

### Alternativa sem deploy imediato do worker (mitigação por banco)
Marcar `public.users.adm_extra = true` no registro do `adm_root_2026` e garantir
`team_id`/`departamento_id` preenchidos — faz `applyCargoOnlyDeptRule` cair no
ramo "cargo alto COM departamento" (`foreign:'edit'`, `escopo:'team'`).
Não substitui o P1: sem ele, qualquer ADM raiz futuro com sub namespaced volta
a quebrar.

---

## Adendo de verificação (2026-08-24) — LF-AUTHZ-ROOTADM-FIX-20260824-MIRRORS

Auditoria pós-patch encontrou **2 cópias espelhadas que o pacote não tinha atualizado**:
`android/app/src/main/assets/public/js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js` e
`ios/App/App/public/js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js` — justamente os arquivos
referenciados pelos `app.html`/`index.html` dos apps nativos. Sem o fix, o ADM raiz namespaced
(`adm_root_2026`) continuava rebaixado no cliente Android/iOS. As duas cópias foram sincronizadas com a
versão canônica (`js/patches/scope/...`). Validação final: 8/8 cópias idênticas, sintaxe OK em todos os
arquivos alterados, `scripts/verify-mirror.mjs` ✅.
