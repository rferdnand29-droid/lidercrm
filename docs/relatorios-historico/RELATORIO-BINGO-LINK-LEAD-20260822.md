# RELATÓRIO — Clicar no nome do cliente no Bingo abre o Lead/Negócio

**Data:** 22/08/2026
**Pedido:** clicar no nome do cliente no Bingo não deve mais abrir o
menu próprio do Bingo — deve direcionar pro Lead desse cliente, já
dentro dos detalhes, mesma função usada ao clicar numa notificação de
Lead.

## Investigação

Confirmei um detalhe importante da estrutura de dados: todo registro
do Bingo nasce vinculado a um **Negócio** (`sourceCardId`), não direto
a um Lead. Quando esse Negócio veio de converter um Lead, o registro
também guarda `sourceOriginalLeadId` — o Lead original.

## O que mudou

Clicar no nome do cliente agora:

1. **Se o Negócio veio de um Lead** (`sourceOriginalLeadId` existe):
   abre o **Lead original**, direto nos detalhes — exatamente o que
   foi pedido.
2. **Se não veio de um Lead** (Negócio criado direto, sem Lead de
   origem): abre o **Negócio** vinculado — não existe Lead pra abrir
   nesse caso, então usei o registro mais próximo disponível.
3. **Se o cliente foi lançado manualmente no Bingo** (sem vínculo
   nenhum): mostra um aviso claro em vez de não fazer nada.

Reaproveita exatamente `openKBDet()` — a mesma função que já abre o
detalhe ao clicar numa notificação de Lead, incluindo a mesma
verificação de "o registro ainda existe?" antes de abrir.

## O que NÃO mudou

`openTimeline()` (o menu antigo) e o modal `#mo-tl` continuam
existindo intactos — são usados em outros lugares (Busca Global, ao
clicar num resultado tipo "cliente"). Só o clique **nesta tabela
específica** do Bingo foi trocado.

## Arquivo

| Arquivo | Mudança |
|---|---|
| `js/clientes.js` | novo `openCliLinkedLead()`; clique do nome na tabela do Bingo trocado |

## Verificação

```
node --check js/clientes.js      → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. No Bingo, clicar no nome de um cliente que veio de um Lead
   convertido — deve abrir o Lead original.
2. Clicar num cliente cujo Negócio não veio de Lead — deve abrir o
   Negócio.
3. Clicar num cliente lançado manualmente (se houver) — deve mostrar
   o aviso.

## Reversão

Reversível — é uma troca pontual de `onclick` mais uma função nova,
sem migração de dado.
