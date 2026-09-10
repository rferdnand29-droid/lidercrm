# 🔒 Relatório — Fix Definitivo Scroll Reset (v2)

**Data:** 2026-08-18
**Bug:** "Ao mover lead entre etapas, o rolante volta ao início sozinho."
**Regra:** O scroll SÓ deve voltar ao início se o usuário rolar com mouse/dedo — NUNCA sozinho.

## Por que a v1 falhava
A v1 (20260804) restaurava a posição em apenas 3 rAFs (~48 ms). Mas o
`_syncKBRemoteBG` faz ida à nuvem (200–1500 ms) e, ao voltar, chama
`renderKBLocal(board)` novamente → `wrap.innerHTML=` recria os cards e o
scroll cai a 0. Como isso acontece MUITO depois dos 3 rAFs, a v1 não pegava.

## O que a v2 faz
1. **Sentinela de intenção do usuário** — wheel/touch/pointer/mouse/keydown
   com `isTrusted`. Só gesto real atualiza "posição confirmada".
2. **MutationObserver por container** — quando o DOM interno é recriado,
   reafirma a posição no microtask + 6 rAFs.
3. **Trava por 3 s após qualquer movimentação** (`_kbMoveCard`, `moveCard`,
   `mbReorderTap`, `setCardSub`, `applyBulkMove`, `assumeLead`, `_spSelect`).
   Cobre a latência do sync remoto.
4. **Suprime scroll não-confiável** (`isTrusted===false`) durante a trava.
5. **Neutraliza wrappers legados quebrados** (`lf-bugs-4fixes`, `lf-bugs-5fixes`).

## Fluxos cobertos
- Desktop drag & drop (L581)
- Touch drag & drop (L1604)
- Botão de etapa no card (moveCard L1148)
- Mobile chevron (`_spSelect` → moveCard)
- Mobile subir/descer (`mbReorderTap`)
- Mobile sub-etapa (`setCardSub`)
- Bulk move (`applyBulkMove`)
- Conversão Lead → Negócio
- Assumir Lead
- Sync remoto que roda depois (causa raiz do bug)

## Arquivos
- `js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v2-20260818.js` (novo)
- `www/js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v2-20260818.js` (espelho Capacitor)
- `index.html` — nova tag `<script>` após a v1
- `app.html` — idem
- `www/index.html`, `www/app.html` — idem

## Reversão
Basta remover as 4 tags `<script>` que apontam para `...v2-20260818.js`.
A v1 continua no lugar (só neutralizada em runtime), então não há downgrade.
