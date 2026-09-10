# RELATÓRIO — Botão "Dono" no mobile (seleção múltipla + transferir responsável)

**Data:** 20/08/2026
**Pedido:** botão "Dono" ao lado das abas Leads/Negócios no mobile —
seleciona vários leads por toque, transfere o responsável pra outro
usuário, e escolhe se continua Lead ou vira Negócio.

## O que já existia (reaproveitado, não recriado)

O desktop **já tinha esse recurso completo e testado** — seleção
múltipla, transferir responsável e converter em Negócio, tudo
funcionando via clique nos cards do quadro Kanban desktop
(`_bulkSelected`, `bulkResp`/`applyBulkResp`, `bulkConvert`,
`_kbTransferCard`). O problema: a visão **mobile** (`renderKBMobile`,
os cards `.mb-card` que aparecem na lista vertical) é uma renderização
totalmente separada da desktop, sem nenhum gancho de seleção — por
isso esse recurso nunca aparecia lá, mesmo já existindo por baixo.

## O que foi implementado

Só o **gatilho mobile** — nenhuma lógica de negócio nova:

1. **Botão "👤 Dono"** ao lado de Leads/Negócios, nas duas páginas
   (Leads e Negócios), nos dois HTMLs (raiz + Capacitor). Ao tocar,
   liga um modo de seleção só pra aquele board.
2. **Toque no card seleciona** (em vez de abrir o detalhe) — um
   card selecionado ganha uma borda/destaque roxo. Toque de novo
   desmarca.
3. **Barrinha de ação** aparece com 1+ selecionados:
   - **👤 Transferir** — abre a mesma janela de escolher usuário que o
     desktop já usa (`bulkResp`), transfere todos os selecionados de
     uma vez.
   - **✨ → Negócio** — só na aba Leads, converte os selecionados em
     Negócio (`bulkConvert`, mesma função do desktop).
   - **✕ Cancelar** — sai do modo sem fazer nada.

## Sobre "escolher será Lead ou Negócio"

Isso funciona como **duas ações que podem ser usadas em sequência**
(igual já é no desktop), não uma única caixa combinada: você pode
Transferir e, se quiser, também Converter os mesmos itens selecionados
— nessa ordem ou só uma das duas. Segui o mesmo padrão que já existe e
funciona no desktop, em vez de inventar um fluxo novo. Se você
preferir uma tela única que já pergunte "pra quem?" e "Lead ou
Negócio?" ao mesmo tempo, me avise que eu construo — foi uma escolha
consciente de reaproveitar o que já é testado.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | cards mobile ganham `data-board`/`data-owner` (só isso — nenhum comportamento existente mudou) |
| `js/patches/kanban-leads/lf-mobile-owner-bulk-v1-20260820.js` | novo — toda a lógica do gatilho mobile |
| `index.html`, `app.html` | botão "Dono" + barrinha de ação (2 páginas × 2 arquivos) |
| `css/style.css` | visual do botão, da barra e do card selecionado |

## Verificação

```
node --check js/kanban.js js/patches/kanban-leads/lf-mobile-owner-bulk-v1-20260820.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. No celular, abrir Leads → tocar em "👤 Dono".
2. Tocar em 2-3 cards → devem ficar com borda roxa, e a barrinha "N
   selecionado(s)" deve aparecer embaixo dos filtros.
3. Tocar em "👤 Transferir" → escolher um usuário → conferir que os
   cards mudaram de responsável.
4. Repetir tocando em "✨ → Negócio" pra conferir a conversão.

## Reversão

Reversível removendo a tag `<script>` do novo patch (4 HTMLs) e os
botões/barrinhas adicionados. O `data-board`/`data-owner` a mais nos
cards mobile é inofensivo mesmo sem o patch — só fica sem uso.
