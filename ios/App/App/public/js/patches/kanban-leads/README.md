# Mapa dos patches de Kanban/Leads (Quadro, Bingo, Ligações)

Reorganização de 2026-08-01 — só reposicionamento de arquivo, **ordem de
carregamento inalterada** (mesmo princípio de `chat/README.md`). 11
arquivos.

## Cadeia de dependência de carregamento (importante!)

Vários destes patches envelopam a MESMA função em sequência —
`lf-bugs-4fixes` → `lf-bugs-5fixes` → `lf-bingo-strict-source` →
`lf-livre-reason-required-v2` todos tocam `_kbMoveCard`/
`syncNegocioToBingo` em cadeia. `lf-livre-reason-required-v2.js`
documenta explicitamente no próprio cabeçalho que a v1 tinha um bug por
chamar a função ORIGINAL capturada antes dos wrappers, em vez da
versão já envelopada — ou seja, a ORDEM relativa destes arquivos
específicos não é cosmética, é funcional. Não reordenar sem ler os
cabeçalhos de todos os envolvidos.

## Bingo (sincronização Negócios ↔ Clientes/Dashboard)
- `lf-bingo-sync-v1-20260722.js` — camada base: cria/atualiza o registro
  correspondente no Bingo (`lf6_c_<uid>`) quando um card muda em
  Negócios (`kb_negocios_<uid>`), que antes eram mundos totalmente
  separados.
- `lf-bingo-strict-source-v1-20260729.js` — endurece a regra: impede
  entrada indevida no Bingo vinda de etapas não-operacionais
  (retag/cart/fich/aprov/fecham/fechado), intercepta
  `syncNegocioToBingo` por cima do patch acima.

## Contador de ligações
- `lf-lig-counter-rounds-v1-20260728.js` — bug original: o contador
  somava só a rodada atual (0..10), não o acumulado do dia; corrige o
  cálculo e o reset.
- `lf-lig-counter-sync-cloud-v1-20260728.js` — o contador só vivia em
  `localStorage` (perdia ao trocar de aparelho); envelopa
  `window.saveLigToday` pra também persistir na nuvem.
- `lf-fix-rolante-order-adm-lig-total-v1-20260728.js` — dois bugs:
  ordenação de leads nas colunas (`_sortCardsForColumn` em
  `js/kanban.js`) e total de ligações no painel ADM.

## Fluidez / regras de fluxo do drag
- `lf-kanban-fluidity-v1-20260730.js` — corrige duplo redraw no drop
  (desktop/touch) causado por `_kbMoveCard` + `renderKBLocal` chamados
  duas vezes em sequência via os wrappers de bugs-4fixes/5fixes.
- `lf-flow-hardening-v1-20260728.js` — 3 bugs: exigir board+etapa ao
  transferir responsável; forçar modal de conversão em qualquer fluxo
  Lead→Negócio; presença do chat iniciando no boot.
- `lf-livre-reason-required-v2-20260730.js` — substitui a v1 (removida).
  Exige motivo ao mover card para "Livre", chamando a versão já
  envelopada da função de mover (ver nota de dependência acima).

## Bugs consolidados / mobile
- `lf-bugs-4fixes-v1-20260729.js` — Bingo recebendo leads do
  supervisor, UI sem mover ↑↓ dentro da coluna, scroll resetando ao
  mover card entre etapas, usuário excluído reaparecendo.
- `lf-bugs-5fixes-v1-20260729.js` — consolida os 4 acima + fix #5
  mobile-CSS (já entregue via `css/lf-mobile-leads-list-fix.css`).

## Outro
- `lf-adm-feed-datepick-v1-20260728.js` — painel ADM de ligações
  (`js/relatorios.js`) só lia o dia de hoje; adiciona seletor de data.

Todos idempotentes e aditivos (guarda de instalação única, não
reescrevem função original — envelopam). Ver `docs/coding-standards.md`.
