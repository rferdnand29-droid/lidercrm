# RELATORIO-FIX-DUPLICADOS-CROSSBOARD-HISTORICO-MESCLA-20260907

## Pedido

Ajustar o sistema de duplicados — nem todos os leads apareciam como
deveriam; focar mais no telefone do que no nome (um lead sem nome
mas com o mesmo telefone de outro já cadastrado deve ser detectado);
e permitir mesclar duplicados como no Bitrix24, unindo o histórico
dos dois registros num só.

## Causa raiz

**1 (leads não aparecendo como duplicados):** achei o motivo exato —
o código **pulava explicitamente** qualquer comparação entre um Lead
e um Negócio de boards diferentes (`if(xa.board!==xb.board)continue`),
com um comentário dizendo "fica pra uma fase futura". Isso deixava
passar batido o caso mais comum de duplicado real: um Lead novo
chegando com o mesmo telefone de um Negócio já em andamento — o
cenário exato que você descreveu (lead sem nome, mas telefone já
existe em outro registro com nome).

A regra de telefone em si (focar no número, não no nome) já tinha
sido implementada numa correção anterior — confirmei que continua
correta, só a comparação cruzada entre boards estava faltando.

**2 (histórico não unificado na mesclagem):** a mesclagem já existia
(sistema completo, estilo Bitrix24, de uma sessão anterior), mas na
hora de unir os dois registros só adicionava **uma linha resumida**
("Mesclado com registro de X") — o histórico detalhado de quem foi
mesclado (todas as movimentações, mudanças de etapa, atividades
concluídas etc.) era descartado, não aparecia em lugar nenhum.

## Estratégia

1. Removida a restrição que pulava pares de boards diferentes no
   escaneamento de duplicados. A proteção contra falso-positivo
   (Lead sendo comparado com o próprio Negócio que ele gerou na
   conversão) já existe separadamente e continua funcionando —
   agora só pega duplicados de verdade entre boards diferentes.
2. `_dupFieldsMatch` ajustada para checar a configuração de telefone
   dos dois boards envolvidos (podem ser diferentes agora).
3. Mesclagem (`_mergeExecuteCore`): as duas listas de histórico são
   combinadas numa timeline só, ordenada por data — cada entrada que
   veio do registro mesclado fica marcada visualmente ("de 'Fulano'
   (mesclado)"), então dá pra ver a origem sem misturar sem indicação
   nem perder nada.

## Fluxos cobertos

- Lead novo com o mesmo telefone de um Negócio já existente: agora
  aparece no escaneamento de duplicados.
- Lead convertido no próprio Negócio dele: continua NÃO aparecendo
  como duplicado (relação normal de conversão, não um erro).
- Mesclar dois registros: o histórico final mostra a timeline
  completa dos dois, com marcação de origem.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | escaneamento permite Lead×Negócio; `_dupFieldsMatch` com 2 boards; mesclagem une o histórico |
| `src/modules/documentos/runtime/attachments-helpers.js` | marcação visual de entrada vinda de registro mesclado |
| `css/style.css` | estilo da marcação |

## Verificação

```
node --check (todos os arquivos tocados) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados
```

## Como validar manualmente

1. Criar um Lead sem nome com o telefone de um Negócio já existente
   — deve aparecer no "🔍 Duplicatas".
2. Mesclar dois registros de teste com histórico em ambos — abrir o
   registro resultante e conferir que a timeline mostra os eventos
   dos dois, com a marcação de origem no que veio do mesclado.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
