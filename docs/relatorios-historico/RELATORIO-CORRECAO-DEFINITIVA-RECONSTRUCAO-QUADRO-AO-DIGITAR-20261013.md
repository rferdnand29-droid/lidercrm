# RELATORIO-CORRECAO-DEFINITIVA-RECONSTRUCAO-QUADRO-AO-DIGITAR-20261013

## Pedido

Corrigir em definitivo a sensação de "etapas/rolante subindo e
descendo sozinho" ao usar o CRM, especificamente ao digitar
informações nos detalhes de um card.

## Investigação

Diferente do "tremor" já corrigido antes (comparação de JSON sensível
à ordem das chaves, causando repintura por falso positivo a cada
ciclo de sincronização de 15s) — esta é uma causa **completamente
diferente**, direta e imediata.

## Causa raiz encontrada

O campo **"Valor da Venda"**, dentro do modal de detalhe do card, está
ligado ao evento `oninput` — que dispara em **cada tecla digitada**,
não ao sair do campo. A função ligada a esse evento
(`autoSaveKBValor`) chamava `renderKBLocal(board)` **direto, sem
nenhum atraso** — e essa função reconstrói o quadro do Kanban
**inteiro, do zero**, recriando todos os cartões de todas as colunas.

Na prática: digitar um valor como "1500,50" (8 caracteres) reconstruía
o quadro inteiro **8 vezes em menos de um segundo**. Mesmo a lógica de
preservação de rolagem (que já existe e funciona bem, testada e
confirmada) não é desenhada pra aguentar dezenas de reconstruções por
segundo sem nenhum tremor visual perceptível.

O campo de anotações (textarea "Escreva observações...") **não** tem
esse problema — ele salva a cada tecla, mas não reconstrói o quadro.

## A correção

O salvamento do dado em si continua **imediato, a cada tecla** — a
garantia de nunca perder informação digitada não muda em nada. Só a
reconstrução visual do quadro (a parte cara) passa a esperar a
digitação **pausar por 600ms** antes de acontecer, usando o mesmo
utilitário de debounce que o projeto já usa nos campos de busca —
não criei um mecanismo novo, só reaproveitei o que já existe.

## Verificação

Escrevi um teste que simula exatamente o cenário real: digitar 8
teclas em sequência rápida (≈80ms entre cada uma, típico de digitação
normal). Confirmado: o dado é salvo 8 vezes (nunca perde nada), mas o
quadro só é reconstruído **1 vez**, depois que a digitação para —
exatamente o comportamento pretendido.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | `autoSaveKBValor` — reconstrução do quadro agora com debounce de 600ms |
| `tests/kb-autosave-valor-debounce.test.js` | novo — 5 testes |

## Checklist

```
node --check js/kanban.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 273/273 testes (268 + 5 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Como confirmar que resolveu

Abra o detalhe de qualquer negócio, clique no campo "Valor da Venda"
e digite um número. O quadro por trás do modal não deve mais
piscar/pular durante a digitação — só uma fração de segundo depois de
parar de digitar.

## Reversão

Reversível isoladamente — remover o `debounce(...)` e voltar à
chamada direta de `renderKBLocal(board)` — mas isso reabre o problema
confirmado. Não recomendo reverter.
