# RELATÓRIO — Redesign da lista de Leads/Negócios (mobile)

**Data:** 22/08/2026
**Pedido:** reorganizar a lista de leads/negócios seguindo o mockup de
referência, mantendo 100% da funcionalidade existente.

---

## 1. Investigação prévia (antes de mexer em qualquer coisa)

**Tela encontrada:** `js/kanban.js` → `renderKBMobile()` (card), `renderStageSummaryBar()`
(faixa Etapa/Valor), `openStagePicker()` (seletor de etapa),
`openKBAdvFilter()` (Filtros), `openKBNew()` (Criar Lead). HTML em
`index.html`/`app.html`.

**Stack:** confirmado — mesma stack HTML/CSS/JS puro do redesign do
detalhe do lead (sessão anterior), reaproveitando os mesmos tokens.

**Achado extra (reportado antes de implementar):** não existia
**nenhuma busca visível no mobile** — ficava escondida junto com o
resto da barra de ações do desktop (`display:none!important` numa
media query mobile). Só dava pra buscar abrindo o modal de Filtros
Avançados.

**Confirmação sobre "Dono":** já existia com o comportamento exato do
mockup (seleção em massa, não agrupamento) — só reorganizei o visual
pra parecer uma 3ª aba de verdade.

---

## 2. O que mudou — mapeado item a item do pedido

| Pedido | Implementado |
|---|---|
| Busca fixa no topo | Campo novo, sempre visível, acima dos filtros — preenche uma lacuna real (não existia antes no mobile). |
| Card compacto ~2 linhas | Linha 1: avatar + nome/ID + status. Linha 2: telefone + dono (esquerda), ligar/WhatsApp/menu (direita). |
| Etapa/Valor como 2 chips | Mesma faixa, agora com cada metade em seu próprio contorno — só CSS, sem tocar HTML/JS. |
| Seletor de etapa em grade 2 col. | Grade com contagem por etapa — cabem várias por tela, sem rolar. |
| Botão Filtros com painel único + selo | Nicho e Responsável viram chips; selo no botão mostra a **contagem** de filtros ativos (antes era só um pontinho on/off). |
| Criar Lead em seções nomeadas | 3 seções: Cliente, Classificação, Notas — mesmos campos, mesma validação. |
| Aba "Dono" | Confirmado com você — comportamento inalterado, só virou visualmente uma 3ª aba, com indicador de checkbox nos cards durante a seleção. |

---

## 3. Duas decisões que tomei — sinalizadas, não improvisadas

### "Etapa" não entra no painel de Filtros
O mockup mostra Etapa como chip de **múltipla escolha** dentro de
Filtros. Hoje a Etapa já tem seu próprio mecanismo dedicado (chip bar
+ seletor em grade), com **seleção única** — uma variável separada
(`_mbStageFilter`), não parte de `_kbFilter`. Colocar Etapa como
multi-seleção ali dentro seria mudar o comportamento do filtro (poder
ver várias etapas ao mesmo tempo), não só reorganizar visualmente.
Deixei de fora — a Etapa continua filtrando normalmente pelo lugar que
já existe.

### "Período" continua sendo "criado há mais de N dias"
O mockup mostra um intervalo De/Até (datas). O campo atual é um número
("dias atrás") — são conceitos de filtro diferentes, e trocar um pelo
outro exigiria lógica de comparação nova. Mantive o campo como já
era, só reorganizado dentro da seção "Período" do painel novo.

---

## 4. Funcionalidade preservada — nada de lógica reescrita

- Todos os `onclick` continuam chamando as mesmas funções
  (`openKBDet`, `openStagePicker`, `callClient`, `openWhatsApp`,
  `_openCtx`, `assumeLead`, `moveCard`, `saveKBCard`, `bulkResp`,
  `bulkConvert`) com os mesmos argumentos.
- `filterKB()` ganhou um parâmetro opcional (valor explícito) — sem
  parâmetro, comportamento idêntico ao de antes; o parâmetro novo só
  existe pra alimentar o campo de busca mobile que não existia.
- Nenhuma classe compartilhada com outras telas foi alterada.

---

## 5. Testado visualmente antes de entregar

Renderizei o card mobile, a faixa Etapa/Valor e o painel de Filtros
com o CSS real do projeto — a primeira tentativa saiu com cores
erradas (o tema escuro depende de uma classe que a JS aplica no
`<body>`, ausente no meu teste isolado); corrigido e confirmado
visualmente antes de fechar.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `index.html`, `app.html` | busca mobile, seções de Filtros/Criar Lead, grade de etapa |
| `css/style.css` | chips de etapa/valor, grade do seletor, seções/chips de Filtros, selo de contagem, indicador de seleção no modo Dono |
| `css/lf-mobile-leads-compact-v1.css` | reescrito (v3) — card em 2 linhas |
| `js/kanban.js` | `renderKBMobile()`, `filterKB()`, `openKBAdvFilter()`/`applyKBAdvFilter()`/`clearKBAdvFilter()`, `_advFilterPickChip()` (novo), `_syncFilterActiveBadge()` (novo) |

## Verificação

```
node --check js/kanban.js       → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Na lista de Leads/Negócios (mobile), conferir a busca fixa no topo.
2. Conferir o card compacto (2 linhas) e testar ligar/WhatsApp/menu.
3. Tocar em "Etapa atual" — grade 2 colunas com contagem.
4. Tocar em "Filtros" — chips de Nicho/Responsável; aplicar um e
   conferir o selo com o número no botão.
5. Tocar em "+ Criar Lead" — seções Cliente/Classificação/Notas.
6. Tocar em "Dono" — parece uma 3ª aba; selecionar alguns leads e
   conferir a barra de atribuição no rodapé.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
