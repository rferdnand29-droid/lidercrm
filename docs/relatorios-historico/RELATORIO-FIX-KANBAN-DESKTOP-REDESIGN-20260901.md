# RELATORIO-FIX-KANBAN-DESKTOP-REDESIGN-20260901

## Pedido

Aplicar o visual do mockup fornecido (`kanban-lider-crm.html`) somente
na versão de PC, de forma limpa, sem erros, mantendo as movimentações
(drag-and-drop) e tudo mais funcionando; adicionar a possibilidade de
rolar a coluna com o mouse pra baixo enquanto se está arrastando um
card.

## Investigação — achado importante sobre o segundo pedido

Antes de implementar, investiguei se a rolagem durante o arraste já
existia. **Já existe, de uma correção anterior** (2026-08-21,
comentário no próprio código: *"rolinha do mouse durante o arraste —
pedido explícito"*): há dois mecanismos já funcionando —

1. Auto-scroll ao chegar perto da borda de cima/baixo da coluna
   enquanto arrasta (`_kbDragColAutoScrollMaybe`).
2. Rolagem manual pela roda do mouse funcionando normalmente mesmo
   com um arraste em andamento (`.kb-cards` escuta `wheel` e chama
   `scrollBy` manualmente, contornando uma inconsistência do
   navegador nesse cenário específico).

Não recriei isso do zero — só me certifiquei de **não quebrar**
nenhum dos dois ao aplicar o novo visual (nenhuma dessas classes ou
comportamento foi tocado).

## Estratégia — o redesign em si

Criado **um único arquivo CSS novo**
(`css/lf-kanban-desktop-redesign-v1-20260901.css`), carregado depois
de `css/style.css`. Nenhum arquivo `.js` foi tocado — confirmado por
comparação direta com a entrega anterior (`kanban.js` idêntico).
Nenhuma classe foi renomeada, nenhuma estrutura HTML mudou — só
propriedades visuais (cor, fonte, espaçamento, sombra, borda) nas
classes que já existem e que o JS já usa pra tudo (arraste, cliques,
seleção em massa).

Trazido do mockup:
- Título da coluna em serifa itálica (reaproveitei a fonte
  "Cormorant Garamond", já carregada pelo resto do app, em vez de
  adicionar a fonte nova do mockup — evita mais uma dependência
  externa e mantém consistência visual com o resto do CRM).
- Losango colorido antes do nome de cada etapa ("thread").
- "Lombada" colorida na lateral esquerda de cada card, com cor
  específica por etapa.
- Números de ID e telefone em fonte monoespaçada (usei a fonte
  monoespaçada do sistema, sem carregar mais uma fonte externa).
- Botões de Ligar/WhatsApp em formato de "pílula" com borda.
- Efeito de elevação suave ao passar o mouse sobre o card.

**Escopo, garantido em duas camadas:**
- `@media(min-width:769px)` — mesmo corte já usado no resto do app
  pra "não é mobile". Zero efeito na versão mobile/Capacitor.
- `body.theme-classic` em todo seletor — o mockup é um visual
  inerentemente escuro; sem essa segunda camada, o redesign
  colidiria com as regras específicas do tema claro (que também usam
  `!important`) e quebraria o tema claro. Com ela, o tema claro fica
  100% intocado.

Testei visualmente com o CSS real antes de entregar (renderização
anexada nesta conversa).

## Fluxos cobertos

- Kanban de Leads e Negócios no PC, tema escuro: visual novo.
- Kanban no celular/Capacitor: sem nenhuma mudança visual.
- Tema claro no PC: sem nenhuma mudança visual.
- Arrastar um card entre colunas: funciona exatamente como antes
  (nenhum JS tocado).
- Rolar a coluna com o mouse (perto da borda ou com a roda) durante
  um arraste: já funcionava, continua funcionando.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `css/lf-kanban-desktop-redesign-v1-20260901.css` | novo |
| `index.html`, `app.html`, `www/*` | tag `<link>` registrada; versão de cache/build-id atualizada |

## Verificação

```
node --check                     → n/a (só CSS/HTML nesta entrega)
diff kanban.js (entrega anterior) → idêntico, confirmado
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados
```

## Como validar manualmente

1. Abrir o Kanban de Leads ou Negócios no PC, tema escuro — conferir
   o visual novo (lombada colorida, título em itálico, pílulas de
   ação).
2. Arrastar um card entre colunas — deve funcionar normalmente.
3. Arrastar um card e levar o mouse perto da borda de baixo da coluna
   — deve rolar sozinho. Soltar e usar a roda do mouse durante outro
   arraste — deve rolar manualmente também.
4. Conferir no celular (ou reduzindo a janela do navegador) — visual
   deve continuar o de sempre, sem nenhuma mudança.
5. Trocar pro tema claro — visual do Kanban deve continuar o de
   sempre, sem nenhuma mudança.

## Reversão

Reversível — remover a tag `<link>` (raiz + www) e apagar o arquivo
CSS. Nenhum outro arquivo foi alterado.
