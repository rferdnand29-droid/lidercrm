# Relatório — Fix Supervisor Bingo (agregação) + Tremelique de etapas rolantes

**Data:** 2026-08-18
**Patches:**
- `js/patches/kanban-leads/lf-fix-supervisor-bingo-aggregate-v1-20260818.js` (novo)
- `js/patches/kanban-leads/lf-fix-rolante-order-adm-lig-total-v1-20260728.js` (comparador atualizado)

---

## Bug 1 — Bingo não mostra o total de clientes do supervisor

### Causa raiz
1. **Fonte de dados errada no Dashboard** (`js/dashboard.js:19`) — `renderDash()` chama `loadCli(S.userId, ...)`, que devolve **só** `getCliLocal(S.userId)` = `lf6_c_<supervisor>`. O supervisor só via os clientes lançados na própria "chave", nunca a soma dos subordinados. O índice de Negócios em `renderTable()` (`js/clientes.js:195`) já era montado com `getDepartmentVisibleUsers()` — a estrutura de filtro conhecia os cartões dos subordinados, mas a lista exibida não os agregava.

2. **`toggleStep` / `openDelCli` / `confirmDC` ignoravam o dono real** — usavam `getCliLocal(S.userId)` hardcoded. As demais operações (`setCliStatus`, `autoSaveObs`, `changeResponsible`, `openTimeline`) já usavam `_tlOwnerUid || S.userId`.

### Correção
Novo patch **`lf-fix-supervisor-bingo-aggregate-v1-20260818.js`** aplicado como wrap cirúrgico, sem tocar `js/dashboard.js` nem `js/clientes.js`:

- `renderTable()` → quando supervisor, injeta lista agregada (com cache curto de 700ms para não pesar a busca por tecla digitada).
- `toggleStep(cid, idx)` → resolve dono real via `_find(cid)`, salva na chave do dono.
- `openDelCli(id)` / `openTimeline(cid)` → definem `_tlOwnerUid` no dono real.
- `confirmDC()` → reimplementado com resolução de dono, mantendo compatibilidade com `_bingoRecordDismissal` e com o índice de negócios via `getDepartmentVisibleUsers()`.

**Idempotência:** guard `__LF_SUPERVISOR_BINGO_AGG_V1__` + flags `__lfAggWrapped` por função.
**Não regride consultor comum:** se `_visibleUids()` retornar só o próprio uid, o comportamento é idêntico ao anterior.

> Observação: o contador `mytot` ("Meu total") continua refletindo apenas o supervisor, conforme escopo do relatório original. Se quiser somar subordinados no `mytot` também, é ajuste extra.

---

## Bug 2 — "Tremelique" / etapas rolantes

### Causa raiz
Comparador instalado por `lf-fix-rolante-order-adm-lig-total-v1-20260728.js` usava, no ramo sem `manualOrder`:

```js
var at = new Date((a && (a.createdAt || a.updatedAt)) || 0).getTime();
var bt = new Date((b && (b.createdAt || b.updatedAt)) || 0).getTime();
return bt - at;
```

Qualquer operação que bumpava `updatedAt` (marcar bolinha, atividade, observação, mudança de etapa) mudava a posição do cartão na coluna a cada re-render — visualmente o cartão "pulava" e a coluna oscilava em loop (render → sort → save → render sem estabilizar). Cartões com `createdAt` idênticos (import em lote) empatavam com `return 0`, reforçando reordenação instável.

### Correção
Bloco do comparador substituído por (nos dois arquivos, `js/` e `www/js/`):

```js
global._sortCardsForColumn = function(cards){
  return (cards||[]).slice().sort(function(a,b){
    var am = Number.isFinite(a && a.manualOrder) ? a.manualOrder : null;
    var bm = Number.isFinite(b && b.manualOrder) ? b.manualOrder : null;
    if (am!==null && bm!==null && am!==bm) return am - bm;   // ordem manual quando ambos têm
    if (am!==null && bm===null) return 1;                    // novo (sem manualOrder) vai pra cima
    if (am===null && bm!==null) return -1;

    // NUNCA usar updatedAt — toda edição reordenaria o card (tremelique)
    var at = new Date((a && a.createdAt) || 0).getTime();
    var bt = new Date((b && b.createdAt) || 0).getTime();
    if (at !== bt) return bt - at;                            // mais recente primeiro

    // tiebreak ESTÁVEL por id (elimina troca de posição em empate de timestamp)
    var ai = String(a && a.id || '');
    var bi = String(b && b.id || '');
    return ai<bi ? -1 : (ai>bi ? 1 : 0);
  });
};
```

**Mudanças:**
1. Remoção do fallback `updatedAt` — toda edição deixa de reordenar.
2. Desempate estável por `id` — cartões com `createdAt` idênticos não trocam mais de posição entre renders.

> Observação: se persistir sensação de "coluna travada" no scroll horizontal do kanban, isso é outro caminho (patches `lf-fix-scroll-reset-lead-move`, `lf-fix-scroll-lock`), independente do comparador — o "tremelique" em si fica coberto por esta correção.

---

## Arquivos modificados / adicionados

| Arquivo | Ação |
|---|---|
| `js/patches/kanban-leads/lf-fix-supervisor-bingo-aggregate-v1-20260818.js` | **novo** |
| `www/js/patches/kanban-leads/lf-fix-supervisor-bingo-aggregate-v1-20260818.js` | **novo** (espelho) |
| `js/patches/kanban-leads/lf-fix-rolante-order-adm-lig-total-v1-20260728.js` | comparador reescrito |
| `www/js/patches/kanban-leads/lf-fix-rolante-order-adm-lig-total-v1-20260728.js` | comparador reescrito |
| `index.html` | `<script>` do patch novo (após `js/clientes.js`, `js/dashboard.js`, `js/relatorios.js`) + bump de `?v=` no rolante |
| `app.html` | idem |
| `www/index.html` / `www/app.html` | idem (espelhos) |

## Validações
- `node --check` OK nos 4 arquivos JS.
- Ordem `<script>` verificada: novo patch carrega **depois** de `js/clientes.js`, `js/dashboard.js` e `js/relatorios.js` nos 4 HTMLs.
- Nenhuma alteração em `js/kanban.js`, `js/relatorios.js`, `js/agenda.js`, `js/dashboard.js` ou `js/clientes.js` — patches puramente aditivos (padrão da pasta `js/patches/`).
