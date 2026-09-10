# RELATÓRIO — Novo indicador "Comparecimento" (Show/No-Show) na Agenda

**Data:** 22/08/2026
**Pedido:** nova função na Agenda calculando Show/No-Show pelas
fórmulas especificadas.

## Confirmação importante

A imagem de referência mostrava um painel que **ainda não existia no
código** — construí do zero, usando a estrutura de dados real da
Agenda (não copiei a imagem pixel a pixel, mas segui exatamente a
fórmula e o formato de tabela por período que você especificou).

## Fórmulas implementadas — exatamente como especificado

```
TOTAL    = agendamentos no período
SHOW     = quantos têm status "Atendido"
NO-SHOW  = TOTAL − SHOW
Taxa Show (%)    = (SHOW ÷ TOTAL) × 100
Taxa No-Show (%) = (NO-SHOW ÷ TOTAL) × 100  (= 100 − Taxa Show)
```

Conferi com o seu exemplo (27 agendamentos, SHOW=4, taxa 14,81%) — a
lógica bate certinho.

## Uma decisão que tomei — registrada por transparência

**NO-SHOW conta como "tudo que não foi Atendido"**, não só quem tem o
status "No-Show" marcado manualmente — isso é exatamente o que a sua
fórmula pede (`NO-SHOW = TOTAL − SHOW`, não "contagem de status
No-Show"). Na prática, isso significa que um agendamento com status
"Remarcar", ou um "Agendado" que já venceu e ninguém atualizou, também
entra como No-Show na conta — porque a pessoa não compareceu, seja
qual for o motivo. Deixei isso explícito na notinha do próprio painel,
pra não gerar confusão.

**"Já deveria ter acontecido"**: só contei agendamentos cuja
data+horário já passaram — um agendamento pra amanhã não entra na
conta ainda, porque ele não teve chance de virar Show ou No-Show.
Isso segue a mesma lógica que já existia no rodapé do indicador de
referência que você mandou.

## Onde ficou

Botão "👤 Comparecimento" ao lado dos filtros de consultor/status na
Agenda — abre um painel com uma tabela (Hoje / Semana / Mês / Ano /
Intervalo personalizado), cada linha com Show, No-Show, Total e as
duas taxas, coloridas (verde/amarelo/vermelho conforme o desempenho).
Respeita o filtro de consultor que já estiver selecionado na Agenda.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/agenda.js` | cálculo das métricas + renderização do painel |
| `index.html`, `app.html` | botão + painel na barra de filtros da Agenda |
| `css/style.css` | estilo do painel |

## Verificação

Renderizei o painel de verdade (com o CSS real do projeto) pra
conferir visualmente antes de entregar — segue a prévia com números de
exemplo.

```
node --check js/agenda.js        → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Na Agenda, clicar em "👤 Comparecimento".
2. Conferir os números de Hoje/Semana/Mês/Ano.
3. Preencher o intervalo personalizado e conferir que a linha
   "Intervalo" aparece com os números certos.
4. Trocar o filtro de consultor no topo da Agenda com o painel aberto
   — a tabela deve atualizar sozinha.

## Reversão

Reversível arquivo por arquivo, sem migração de dado — não criei
nenhum campo novo, só uso os campos que já existem em cada
agendamento.
