# RELATÓRIO — Recalibração das métricas do Analytics

**Data:** 21/08/2026
**Pedido:** trocar algumas métricas do Analytics por versões novas,
mais específicas do funil real do CRM.

## Layout final (8 cards, 2 linhas — igual antes, conteúdo novo)

### 1ª linha — com filtro de período (Hoje/Semana/Mês/Tudo/Período)

| Antes | Agora | O que mudou |
|---|---|---|
| Registros no Período | **Leads Adicionados** | Fonte de dado trocada: antes vinha do Bingo (tabela de clientes/ligações); agora conta Leads de verdade, criados no board de Leads, dentro do período. |
| Agendamentos | **Leads Agendados** | Mesmo cálculo de antes (Negócios que chegaram em AG Vídeo/Presencial ou etapa posterior) — só o nome ficou mais claro sobre o que representa. |
| Fechamentos | **Negócios Fechados** | Mesmo cálculo — Negócios que entraram na etapa Fechado no período. Antes existia um card com esse mesmo nome na 2ª linha, sem filtro de período — ficava confuso ter os dois. Agora só existe aqui, com o filtro valendo. |
| Taxa | **Taxa Conversão** | Redefinida: antes era Fechamentos ÷ Agendamentos. Agora é Leads Convertidos ÷ Leads Adicionados — a taxa de quantos Leads viram Negócio, exatamente como pedido. |

### 2ª linha — estado geral (sem filtro de período, como já era)

| Antes | Agora | O que mudou |
|---|---|---|
| Negócios Ativos | Negócios Ativos | Sem mudança. |
| Negócios Fechados | *(removido daqui)* | Ver nota acima — passou a existir só na 1ª linha, com filtro de período, pra não ficar duplicado. |
| Valor Fechado | Valor Fechado | Sem mudança. |
| No-Show/Desistência | No-Show/Desistência | Mesmo cálculo, tooltip mais claro: cobre quem não veio no AG Vídeo/Presencial **e** quem veio no Vídeo/Loja e não fechou — as duas coisas caem na mesma etapa "No-Show/Desistência" do board de Negócios (não existe uma etapa separada só pra "veio e desistiu"). |
| *(vazio, ex-Negócios Fechados)* | **Taxa Vídeo/Loja → Ficha** | Nova: Negócios que chegaram em Ficha (ou etapa posterior) ÷ Negócios que chegaram em Vídeo/Loja (ou etapa posterior) — a taxa pedida. |

## Decisões que tomei — registradas por transparência

1. **"Taxa" virou duas métricas separadas** (Conversão e Vídeo/Loja→Ficha)
   porque você descreveu dois conceitos diferentes de taxa no pedido —
   preferi não misturar os dois num só número.
2. **Mantive "Negócios Ativos"** mesmo não estando na sua lista — não
   foi pedido pra remover, e é um número útil (quantos negócios ainda
   estão em andamento agora).
3. A 2ª linha continua **sem filtro de período** (mostra o estado atual
   geral) — é assim que já funcionava antes para Negócios Ativos/Valor
   Fechado/No-Show, mantive a mesma lógica pra "Taxa Vídeo/Loja→Ficha"
   também, por consistência.
4. **Não toquei** no funil por etapa nem na Distribuição (donut) — só
   nos 8 cards de KPI do topo.
5. **Não toquei** no dashboard "Início" (o Bingo) — ele usa um cálculo
   parecido mas é uma tela diferente, com propósito diferente; não fazia
   parte do pedido.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/dashboard.js` | 3 funções de contagem novas + `drawAnal`/`drawNegKPIs` recalibradas |
| `js/patches/dashboard/lf-analytics-redesign-v1-20260820.js` | mapa de ícone/cor atualizado pros rótulos novos |

## Verificação

```
node --check js/dashboard.js js/patches/dashboard/lf-analytics-redesign-v1-20260820.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

Também renderizei os 8 cards com os rótulos novos pra conferir que
nenhum texto quebra ou estoura o card (o rótulo mais longo, "Taxa
Vídeo/Loja → Ficha", cabe certinho).

## Reversão

Reversível arquivo por arquivo, sem migração de dado — nenhum campo
novo foi adicionado nos registros, só a forma de contar/exibir mudou.
