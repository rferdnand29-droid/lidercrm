# RELATÓRIO — Item 0 (prioridade máxima): conversão Lead→Negócio não gera mais falso duplicado

**Data:** 22/08/2026
**Fonte:** documento "Implementar sistema de duplicados (padrão
Bitrix24) + corrigir conversão Lead → Negócio"

---

## O que já existia (boa notícia)

Investigando `convertToNeg()` antes de mexer em qualquer coisa,
confirmei que boa parte do item 0 **já estava implementada
corretamente**, sem eu precisar tocar em nada:

| Item do documento | Situação |
|---|---|
| 0.1 — Lead convertido cria Negócio normalmente | ✅ já existia |
| 0.2 — Lead original não é apagado, muda pra etapa "Convertido" | ✅ já existia (`col='conv'`) |
| 0.3 — referência cruzada Negócio→Lead | ✅ já existia (`negócio.originalLeadId`, equivalente ao `source_lead_id` do documento) |
| 0.5 — registra a conversão nas duas timelines | ✅ já existia — Lead recebe "Convertido em Negócio", Negócio recebe "Negócio criado a partir do Lead" |

## O bug real — item 0.4/0.6

O motor de duplicados (`_collectAllCardsForDup`, usado pelo botão
"🔍 Duplicatas") juntava **todos** os cards de Leads e Negócios de
todo mundo, sem nenhuma exclusão. Como a conversão copia o telefone
pro Negócio novo, o Lead original (parado em "Convertido") e o
Negócio resultante caíam no mesmo grupo de telefone — e eram
marcados como duplicados um do outro, exatamente o bug descrito.

## Correção — duas camadas

1. **Leads com etapa "Convertido" saem da varredura** — a causa
   principal. Um Lead convertido não é mais "um registro ativo do
   funil" (item 0.6 do documento) — nem entra na comparação.
2. **Camada extra de segurança**: mesmo que um Lead convertido volte
   a aparecer por algum outro caminho no futuro, o agrupamento agora
   confere explicitamente `negócio.originalLeadId === lead.id` antes
   de fechar um grupo como duplicata — se dois itens do mesmo grupo
   tiverem essa relação, só esse par é removido, sem esconder outras
   duplicatas genuínas que porventura estejam no mesmo grupo de
   telefone.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/modules/kanban/runtime/kanban-helpers.js` | `_collectAllCardsForDup` exclui Leads convertidos |
| `js/kanban.js` | `openDuplicateScanner` remove pares ligados por conversão antes de decidir se é duplicata de verdade |

## Verificação

```
node --check js/kanban.js src/modules/kanban/runtime/kanban-helpers.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

---

## Sobre o resto do documento (itens 1–6)

Não tentei implementar o restante nesta resposta — é um projeto
grande de verdade (tela de configuração de campos por tipo de
registro, job agendado, mesclagem automática, mesclagem manual
campo-a-campo entre donos diferentes, conceito de Observador, flag de
"lead repetido"). Cada um desses é, sozinho, um trabalho de uma ou
mais sessões inteiras — tentar espremer tudo numa resposta só
resultaria em algo raso e arriscado de testar direito.

**Uma coisa que preciso que você decida antes de eu tocar nesses
itens**, porque o próprio documento sinaliza isso como decisão de
arquitetura: hoje este CRM já funciona no que o documento chama de
**"Modo clássico"** (Lead e Negócio são entidades separadas, ligadas
por referência — é exatamente o que confirmei acima). O documento
pergunta se você quer manter esse modo (e eu implemento a mesclagem
em cima dele) ou migrar pro **"Modo CRM Simples"** (sem conversão,
tudo nasce Negócio) — essa segunda opção seria uma reforma bem mais
profunda, reescrevendo o conceito de Lead inteiro.

**Minha recomendação, dado como o resto do app já está construído**
(times diferentes de pré-venda/venda, funil de Leads com etapas
próprias): manter o Modo clássico, que é o que já existe — só
completar com o motor de duplicados/mesclagem em cima dele, como o
próprio documento recomenda para esse cenário.

Se topar seguir assim, posso voltar numa próxima resposta com um
plano dividido em fases pros itens 1–6 (ex.: fase 1 = tela de
configuração + varredura manual; fase 2 = mesclagem manual; fase 3 =
automática/agendada; fase 4 = Observador + lead repetido), pra
avançar em pedaços testáveis em vez de uma reforma só.

## Reversão (do que foi implementado)

Reversível arquivo por arquivo, sem migração de dado.
