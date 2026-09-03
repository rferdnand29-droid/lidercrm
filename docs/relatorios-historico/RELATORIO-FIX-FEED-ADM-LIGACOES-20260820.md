# RELATÓRIO — FIX métricas de ligações não aparecem no Feed do ADM

**Data:** 20/08/2026
**Pedido:** ligações de dias atrás do supervisor Rhuan não aparecem no
Feed do ADM; achar causa, corrigir, e deixar um filtro funcionando
pra ligações por data anterior.

## Causa raiz — duas, não uma

### 1) O Feed só registrava a rodada de BINGO fechada (10/10), nunca a ligação avulsa

Cada vez que alguém marca uma ligação (grade de 10 células da aba
Agenda), o sistema **só grava um evento no Feed quando a 10ª célula
fecha a rodada** (`lig_bingo`). Ligações que não completam uma rodada
de 10 no dia — bem comum, ninguém faz múltiplos de 10 exatos todo dia
— **nunca geravam nenhum evento**. O contador em si (quantas ligações,
quantas rodadas) sempre existiu certinho por trás (é o que alimenta o
painel "Ligações por Consultor"), mas o **Feed** (histórico
consultável, com filtro de data) só sabia dos dias em que uma rodada
fechou exatamente.

Pra supervisor Rhuan (ou qualquer consultor), qualquer dia com
ligações "soltas" — sem fechar 10/10 — ficava invisível no Feed,
mesmo o filtro de data (que conferi e está correto) não tendo nada
pra mostrar naquele dia.

**Correção:** agora toda ligação marcada grava um evento leve no Feed
(`lig_call`), não só quando fecha rodada. Continua registrando também
o evento especial de bingo (`lig_bingo`) quando acontece — os dois
convivem.

### 2) O filtro por canal "Chamada" existia por dentro, mas não tinha botão nenhum na tela

Achei que a função `admFeedFilterCanal()` e toda a lógica de filtro
por canal (Chamada/WhatsApp/Ambos) já existiam prontas em
`js/relatorios.js` — inclusive os eventos de ligação já eram gravados
com `canal:'chamada'`. Só que **nunca existiu nenhum botão na tela**
chamando essa função — o contêiner (`adm-feed-canal-filters`) nem
existia no HTML. Ou seja: o filtro "pra ligação" que vocês pediam pra
deixar funcionando já estava construído, só nunca tinha ficado
visível/clicável.

**Correção:** adicionados os botões (Todos os canais / 📞 Chamada /
💬 WhatsApp / 🔀 Ambos) no Feed do ADM — em `index.html` e `app.html`
— e no Feed do Time (só existe em `index.html`; ver nota abaixo).
"Limpar filtros" agora também reseta esses botões visualmente.

## Bônus: painel Time (supervisor) ganhou busca + data também

Ao mexer nisso, notei que o Feed da aba **Time** (visão do supervisor,
escopada ao departamento) só tinha filtro por usuário — sem busca por
texto, sem intervalo de datas, sem canal. Aproveitei pra deixar
igual ao painel do ADM, já que é a mesma função por trás
(`_renderFeedCommon`) e o ganho é direto pra qualquer supervisor
revisando o histórico do próprio time.

**Nota:** a página "Time" do `app.html` é uma versão mais simples e
antiga (só KPIs + quadros de Leads/Negócios, sem essas sub-abas de
Ligações/Movimentações/Atividades) — isso já era assim antes, não é
algo que eu quebrei agora, e não mexi nisso porque é uma diferença de
estrutura bem maior que o que foi pedido. Se quiser que o Feed também
apareça lá, é um pedido à parte.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/agenda.js` | `toggleLig()` — grava evento no Feed a cada ligação, não só no bingo |
| `js/relatorios.js` | rótulo do novo tipo de evento; `renderTimeFeed()` ganha from/to/more/count; `admFeedClearFilters()` reseta os botões de canal |
| `index.html`, `app.html` | botões de filtro por canal (Feed ADM); `index.html` também ganha busca+data+canal no Feed Time |
| `css/style.css` | destaque visual do botão de canal ativo |

## Verificação

```
node --check js/agenda.js js/relatorios.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Nota sobre volume

Cada ligação agora gera um evento — em dia cheio (dezenas de
ligações por consultor), o Feed cresce mais rápido que antes. O Feed
já pagina de 100 em 100 com "Carregar mais", e agora com o filtro de
canal + data + usuário funcionando, dá pra isolar exatamente o que
precisa (ex.: só "Chamada" + Rhuan + intervalo de datas) sem se perder
no volume.

## Como validar manualmente

1. Marcar algumas ligações na Agenda sem fechar uma rodada de 10.
2. Ir no Feed do ADM (ou Time) → filtrar por canal "📞 Chamada" e pelo
   usuário → conferir que as ligações aparecem, mesmo sem ter fechado
   bingo.
3. Usar "De"/"Até" pra restringir a um intervalo de dias anteriores.

## Reversão

Tudo reversível arquivo por arquivo, sem migração de dado — os
eventos `lig_call` já gravados continuam no Feed mesmo se reverter (só
deixam de ser gerados novos).
