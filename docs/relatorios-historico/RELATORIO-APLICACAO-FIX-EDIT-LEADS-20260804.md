# Relatório — Aplicação do fix "edit leads" (20260804)

## Escopo
Aplicado o patch `apply-fix-crm-edit-leads-20260804.sh` de forma limpa sobre o
bundle `lidercrm-patched-clean-20260804-hotfix.zip`, alterando apenas os dois
arquivos canônicos previstos:

1. `js/kanban.js`
2. `_worker_src/worker/controllers/kanban-controller.js`

Backups originais foram gerados pelo próprio script como
`*.bak-20260804` e mantidos no ZIP para permitir rollback.

## Causa raiz corrigida
O travamento/403 ao editar leads não vinha do editor em si — vinha de dois
descasamentos entre o front canônico e o worker após a regra
**cargo + departamento**:

- **A. Fan-out indevido no Kanban de leads.** `_kbAllVisibleUserPool()`
  percorria *todos* os usuários ativos quando o perfil não era ADM global.
  Isso disparava `GET /kanban/list` para owners fora do escopo do usuário,
  gerando cascata de 403 e travamento visual (o app ficava aguardando N
  requisições que nunca completavam com sucesso).
- **B. Gate errado no card/detalhe.** `hasAdminAccess()` deixou de significar
  "pode editar foreign" depois da regra cargo+departamento; mesmo assim ainda
  era usado como *gate* nos ramos de leitura/edição de card alheio, marcando
  como read-only leads que o usuário tinha permissão legítima de editar.
- **C. Worker desalinhado.** `assertKanbanReadOwner` / `assertKanbanWriteOwner`
  só aceitavam `escopo=global` para cross-owner. Como o front canônico já
  gravava leads foreign quando o usuário tinha `foreign='edit'` +
  `escopo != 'self'`, o app produzia falso-sucesso local + 403 remoto.

## O que o patch faz

### `js/kanban.js` (5 marcadores)
| Marcador | Efeito |
|---|---|
| `LF-KB-SCOPED-POOL-20260804` | `_kbAllVisibleUserPool()` passa a derivar o pool de `getDepartmentVisibleUsers()`, deduplica por id, garante que o próprio usuário está no pool e ignora usuários inativos. Elimina o fan-out. |
| `LF-KB-FOREIGN-EDIT-GATE-20260804` | Introduz `_kbCanEditOwner(board, ownerUid)` como fonte única de verdade para editar card de outro owner (`hasAdminAccess` OU `canEditForeign`). |
| `LF-KB-SYNC-SCOPED-20260804` | Ramo de sync do "livre pool" agora só faz `saveKBFor` remoto quando `_kbCanEditOwner` autoriza aquele owner. Fim da tempestade de 403. |
| `LF-KB-CARD-RO-20260804` | Card no board de leads só cai em read-only quando `_kbCanEditOwner` disser que não pode. |
| `LF-KB-DET-RO-20260804` | Detalhe do lead usa o mesmo gate; `limitedForeignAccess` deixa de depender de `hasAdminAccess`. |

### `_worker_src/worker/controllers/kanban-controller.js` (4 marcadores)
| Marcador | Efeito |
|---|---|
| `LF-KANBAN-CROSS-OWNER-20260804` | Novo helper `canCrossOwnerKanban(caps)` — `foreign === 'edit' && escopo !== 'self'`. |
| `LF-KANBAN-READ-GATE-20260804` | `assertKanbanReadOwner` aceita cross-owner por `escopo=global` **OU** `canCrossOwnerKanban(caps)`. |
| `LF-KANBAN-WRITE-GATE-20260804` | `assertKanbanWriteOwner` passa a receber `caps` e libera escrita cross-owner quando `canCrossOwnerKanban(caps)`. Sem endpoint dedicado de transferência ainda; o gate replica o contrato já usado pelo front. |
| `LF-KANBAN-PUT-CAPS-20260804` | `PUT /kanban/...` propaga `ctx.caps` para o gate de escrita. |

## Verificações realizadas
- `node --check js/kanban.js` → **OK**
- `node --check _worker_src/worker/controllers/kanban-controller.js` → **OK**
- Contagem de marcadores aplicados: **5 em `kanban.js`**, **4 em `kanban-controller.js`** (todos os 9 esperados).
- Idempotência: o próprio script pula qualquer bloco cujo marcador já esteja
  presente, então rodar de novo não duplica os patches.

## Rollback
O script `_patch-meta/rollback-fix-crm-edit-leads-20260804.sh` restaura
os arquivos originais a partir dos `*.bak-20260804` gerados no momento da
aplicação (que estão preservados dentro do ZIP):

```bash
bash _patch-meta/rollback-fix-crm-edit-leads-20260804.sh .
```

## Observação de hardening
O gate de escrita cross-owner no Worker replica hoje **a mesma semântica que
o front já pratica** (`foreign='edit'` + `escopo != 'self'`). Um passo
seguinte recomendado — quando o projeto expuser a relação
usuário↔departamento de forma autoritativa no servidor — é restringir esse
gate também por departamento, para deixar o servidor mais estrito que o
cliente.
