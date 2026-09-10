# RELATORIO-FIX-ANALYTICS-CALIBRACAO-DRILLDOWN-20260906

## Pedido

Calibrar o Analytics: (1) importação em lote de leads pra outra
pessoa (ex.: ADM importando pro supervisor) não contava como
"adicionados hoje"; (2) Taxa de Conversão errada (mostrando 160%);
(3) poder clicar em qualquer cartão e ver a lista específica dos
leads/negócios daquele número.

## Causa raiz

**1 (importação em lote não contando):** a data de criação em si
estava correta — a importação em lote sempre grava `createdAt` como
"agora". A causa real é que a tela de Analytics **nunca forçava uma
sincronização fresca** do Kanban (Leads/Negócios) antes de calcular
os números — só lia o que já estava no cache local. Se alguém abre
Analytics logo depois de OUTRA pessoa criar/importar registros pra
ela, esses registros podem ainda não ter chegado no cache local de
quem está vendo a tela.

**2 (Taxa de Conversão em 160%):** o numerador (Leads Convertidos) e
o denominador (Leads Adicionados) filtravam por **datas diferentes**
para o mesmo período selecionado — o numerador usava a data em que o
lead **entrou na etapa Convertido**, o denominador usava a data em
que o lead **foi criado**. Se mais leads antigos convertessem dentro
de um período do que leads novos entrassem nesse mesmo período, a
taxa passava de 100% — exatamente o que a captura de tela mostrava.

**Achado adicional durante a calibração:** a segunda linha de
cartões (Negócios Ativos, Valor Fechado, No-Show/Desistência, Taxa
Vídeo/Loja → Ficha) **ignorava completamente o período
selecionado** — sempre mostrava o total de todo o histórico, não
importa se "Hoje" ou "Mês" estivesse marcado.

## Estratégia

1. `_countLeadsConvertidos` corrigida para usar a **mesma** data do
   denominador (`createdAt`) — agora mede exatamente o que foi
   pedido: "dos leads adicionados no período, quantos já foram
   convertidos".
2. Abrir a tela de Analytics agora força uma sincronização do Kanban
   em segundo plano, e recalcula os números automaticamente se algo
   novo chegar (sem precisar de F5).
3. `drawNegKPIs` (2ª linha de cartões) agora recebe e respeita o
   período selecionado em 3 dos 4 cartões (Valor Fechado, No-Show/
   Desistência, Taxa Vídeo/Loja → Ficha). "Negócios Ativos" continua
   sem filtro de período de propósito — é uma contagem do estado
   atual (quantos estão em aberto agora), não um evento datado.
4. **Nova funcionalidade**: todos os 8 cartões agora são clicáveis.
   Clicar abre uma lista com os leads/negócios específicos que
   compõem aquele número — nome, etapa, data e telefone — reaproveitando
   exatamente a mesma lógica de filtro de cada métrica, então a lista
   sempre bate com o número mostrado. Clicar num item da lista abre o
   card completo.

## Fluxos cobertos

- Importação em lote de um ADM pro supervisor: aparece em "Leads
  Adicionados" do supervisor assim que ele abre a tela de Analytics,
  sem precisar de F5.
- Taxa de Conversão: nunca mais passa de 100%, reflete exatamente a
  definição pedida.
- Todos os 8 cartões: clicáveis, mostrando a lista específica.
- 2ª linha de cartões: respeita o período selecionado (exceto
  Negócios Ativos, de propósito).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/dashboard.js` | Taxa de Conversão corrigida; `drawNegKPIs` com filtro de período; nova função de detalhamento (`openAnalyticsDrillDown`) e 8 cartões clicáveis |
| `js/app.js` | Analytics força sincronização ao abrir |
| `js/relatorios.js` | página Time passa período pro `drawNegKPIs` |
| `index.html`, `app.html`, `www/*` | modal `#mo-anal-drill` |
| `css/style.css` | estilo dos itens da lista e hover nos cartões |

## Verificação

```
node --check (todos os arquivos tocados) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados
```

Testado visualmente (renderização com o CSS real) — cartões e lista
de detalhamento aparecendo corretamente.

## Como validar manualmente

1. Importar leads em lote pra outra pessoa, logar como essa pessoa e
   abrir Analytics — deve contar como "adicionados hoje" sem F5.
2. Conferir a Taxa de Conversão — nunca deve passar de 100%.
3. Clicar em qualquer um dos 8 cartões — deve abrir a lista
   correspondente, com o mesmo total mostrado no cartão.
4. Trocar entre Hoje/Semana/Mês/Tudo — a 2ª linha de cartões (exceto
   Negócios Ativos) deve mudar junto.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
