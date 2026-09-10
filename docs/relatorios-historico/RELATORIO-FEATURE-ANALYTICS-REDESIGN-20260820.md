# RELATÓRIO — Redesign visual da Analytics (textura "premium")

**Data:** 2026-08-20
**Pedido:** deixar os cards de métricas da Analytics com a textura/
organização de uma imagem de referência (selos de ícone coloridos,
sparkline, funil em barras, rosca de distribuição) — **sem criar
nenhuma métrica nova**, só reestilizar o que já existe.

## O que é (e o que não é)

Isso é **decoração visual pura** por cima de `drawAnal()`/`drawNegKPIs()`
(`js/dashboard.js`) — **nenhuma das duas funções foi tocada**. Um novo
patch lê o que elas JÁ renderizaram no DOM (o texto de cada `.kv`/`.kl`,
a legenda `.pli` já montada) e só adiciona camada visual em cima — nunca
recalcula nem inventa nenhum número.

Cobre as 3 telas que já reusam essas mesmas funções (mesmo padrão "NADA
de métrica nova aqui" já documentado em `js/relatorios.js`): Analytics,
e Time → consultor selecionado.

## Arquivos novos

| Arquivo | Papel |
|---|---|
| `css/analytics/lf-analytics-redesign-v1-20260820.css` | reestiliza `.kc`/`.gc`/`.fi`/`.pw`/`.pb` etc. |
| `js/patches/dashboard/lf-analytics-redesign-v1-20260820.js` | decora o DOM já renderizado (ícone, sparkline, rosca) |

## O que mudou visualmente

- **Cards de KPI**: selo de ícone circular colorido (decidido pelo texto
  do rótulo já renderizado — "Total"→gráfico/dourado, "Agendamentos"→
  calendário/azul, "Fechamentos"→check/verde, "Taxa"→%/roxo, "Negócios
  Ativos"→maleta/azul, "Negócios Fechados"→alvo/verde, "Valor Fechado"→
  cifrão/dourado, "No-Show/Desistência"→alerta/vermelho) + sparkline
  decorativa (não representa histórico real — a página não guarda dado
  por período pra isso; é só textura visual, igual a maioria dos
  dashboards desse estilo usa).
- **Funil**: barras arredondadas com brilho na cor de cada etapa (a
  mesma cor que `drawAnal()` já define — só uma var CSS lendo o que já
  estava no `style="background:..."` de cada barra).
- **Distribuição**: virou uma **rosca de verdade** (miolo vazado) em vez
  da pizza cheia — mesmas categorias, cores e valores; só a técnica de
  desenho SVG mudou (círculos com `stroke-dasharray` no lugar de fatias
  cheias).
- **Abas de período** (Hoje/Semana/Mês/Tudo/Período): visual mais
  encorpado, ativa com destaque dourado.

## Único acréscimo visual (não é métrica nova — é declarado aqui de propósito)

A legenda da rosca ganhou a **porcentagem** ao lado da contagem (ex.:
"Agendado — 1 — 33%"). É a mesma informação que a rosca já representa
visualmente (fatia proporcional) — só expressa também em número, do
jeito que a imagem de referência mostra. Nenhum dado novo é buscado ou
calculado: é `valor / total dos 4 já mostrados`. Se preferir sem isso, é
uma linha pra remover — avise.

## Bug real encontrado e corrigido (pré-existente, fora do pedido original)

Testando visualmente, achei que o **rótulo da legenda da rosca
(Agendado/Compareceu/Fechou/Outros) nunca teve cor de texto própria** —
sempre dependeu de herdar a cor do `<body>`. Isso já era assim antes de
qualquer mudança minha. O problema: o app tem um tema claro "Bitrix24"
que é o **padrão atual em telas ≥769px** (`@media(min-width:769px)` em
`css/style.css`, força `body{color:#23354d}` — navy escuro), e o tema
escuro original só volta quando o usuário liga manualmente (classe
`body.theme-classic`). Como o card da rosca continua com fundo escuro
em qualquer tema, esse texto sem cor própria ficava **praticamente
invisível** (escuro sobre escuro) pra qualquer um vendo a Analytics no
tema claro padrão, em desktop — antes mesmo deste redesign.
Corrigido: `.pli span`/`.plv` agora têm `color:var(--tx)` explícito,
nunca mais dependem do que o `<body>` está fazendo.

## Validação

Sem browser real disponível neste ambiente, montei uma página de teste
com o CSS/JS reais + os mesmos dados de exemplo da imagem de
referência, renderizada via `wkhtmltoimage`. Isso pegou 2 bugs reais
antes de qualquer entrega:
1. Selo+sparkline duplicando (a decoração rodava 2x em sequência,
   corrigido pra ser idempotente).
2. O texto invisível da legenda descrito acima.

Depois de corrigidos, conferi visualmente que: 8 cards com selo+
sparkline únicos, cores corretas por métrica, funil com brilho na cor
certa, rosca vazada com legenda legível, abas de período com destaque.
(CSS Grid do layout de 4 colunas não renderiza nessa ferramenta de
teste específica — é uma limitação conhecida do motor usado por ela,
não do CSS; testei separadamente e confirmei que Grid puro também não
funciona nela nem em um exemplo isolado sem nenhum código deste
projeto — o app de verdade roda em Chromium/WebView moderno, que
suporta Grid integralmente.)

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Reversão

Remover as 2 tags (`<link>` + `<script>`) dos 4 HTMLs e apagar os 2
arquivos novos. Nada em `js/dashboard.js` foi alterado.
