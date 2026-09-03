# RELATORIO-FIX-ANALYTICS-PERIODO-INICIAL-20260830

## Bug

Na tela de Analytics, os números mostrados logo ao abrir a tela
estavam errados — não batiam com o período que a aba "Hoje" (já
marcada como selecionada) deveria representar. Reportado com uma
captura de tela mostrando 196 "Leads Adicionados" com "Hoje" ativo —
um número claramente alto demais pra um único dia.

## Causa raiz

A aba "Hoje" já vem marcada como selecionada visualmente desde o
HTML (`<button class="pb on" onclick="setPer('hoje',this)">Hoje</button>`),
mas a variável que efetivamente controla qual período é usado no
cálculo (`_per`, em `js/dashboard.js`) começava com o valor `'mes'`
(mês) — um descompasso direto entre o que a tela **mostra** como
escolhido e o que o código **realmente calcula**.

Resultado: ao abrir a tela de Analytics pela primeira vez (antes de
clicar em qualquer aba), todas as métricas — Leads Adicionados, Leads
Agendados, Negócios Fechados, Comparecimento, Taxa de Conversão, o
funil por etapa e a distribuição — mostravam o total do **mês
inteiro**, mesmo com "Hoje" aparecendo escolhido. Só depois de clicar
em outra aba e voltar pra "Hoje" (o que dispara `setPer('hoje',...)`
e corrige `_per` corretamente) os números passavam a bater.

Conferi que todas as métricas citadas (Leads Agendados, Negócios
Fechados, Comparecimento) já usam o mesmo mecanismo central de
cálculo de período (`_analyticsDateRange`, baseado em `_per`) — não
havia bug separado em cada uma, era um único ponto de causa
compartilhado por todas.

Também conferi a tela "Time" (aba separada, usa `_timePer`
independente) — lá o valor padrão (`'mes'`) já batia corretamente com
o botão "Mês" marcado como ativo, então não tinha o mesmo problema.

## Estratégia

`js/dashboard.js`: valor inicial de `_per` corrigido de `'mes'` para
`'hoje'`, batendo com o botão que já vem marcado como selecionado.
Como todas as métricas do Analytics passam pelo mesmo mecanismo de
período, uma única correção resolve todas de uma vez — Leads
Agendados, Negócios Fechados, Comparecimento, Taxa de Conversão,
funil e distribuição.

## Fluxos cobertos

- Abrir a tela de Analytics pela primeira vez: mostra os números de
  **hoje**, batendo com a aba marcada.
- Trocar entre Hoje/Semana/Mês/Tudo/Período: já funcionava
  corretamente antes (o bug era só no valor inicial, antes de
  qualquer clique) — continua funcionando.

## Observação, não uma correção

O filtro "Semana" conta os últimos 7 dias corridos a partir de agora
(janela rolante), não necessariamente a semana civil (segunda a
domingo). Não mudei esse comportamento por não ter certeza de qual
definição você espera — se quiser que "Semana" signifique
especificamente "esta semana civil", me avisa que ajusto.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/dashboard.js` | valor inicial de `_per`: `'mes'` → `'hoje'` |

## Verificação

```
node --check js/dashboard.js     → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
```

## Como validar manualmente

1. Recarregar a página e ir direto pra Analytics (sem clicar em
   nenhuma aba de período antes).
2. Conferir que os números batem com "hoje" (compare com o total
   real de leads/negócios criados/fechados no dia).
3. Clicar em Semana/Mês/Tudo e voltar pra Hoje — os números devem
   mudar corretamente a cada troca.

## Reversão

Reversível — mudança de uma única linha, sem migração de dado.
