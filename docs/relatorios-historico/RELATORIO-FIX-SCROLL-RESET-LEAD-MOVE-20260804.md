# 🔬 Relatório Forense — Fix Scroll Reset ao Mover Lead

**Data:** 2026-08-04
**Bug relatado:** "Rolantes retornam ao início se eu movimentar um lead pra outra etapa"
**Escopo:** corrigir em **todos os fluxos** onde o erro se manifesta.

---

## 1. Causa raiz (2-3 frases)

O CRM tem **três camadas concorrentes** de preservação de scroll (`_kbCaptureScrollState`/`_kbRestoreScrollState` em `renderKBLocal`, wrappers legados em `lf-bugs-4fixes` e `lf-bugs-5fixes`) que se atropelam. As duas legadas estão **quebradas** (seletores errados / container errado), e o `renderKBMobile` **nunca teve** preservação de scroll — todo `wrap.innerHTML = list.map(...)` zera o `scrollTop`. Somado ao coalesce em `requestAnimationFrame` do `lf-kanban-fluidity`, o timing do restore acabou caindo **antes** do redraw real → posição perdida.

## 2. Todas as ocorrências relacionadas

| # | Arquivo | Linha | Papel |
|---|---|---|---|
| 1 | `js/kanban.js` | 232-262 | Fonte da verdade (`_kbCaptureScrollState`/`_kbRestoreScrollState`) — correto, mas só cobre `renderKBLocal` |
| 2 | `js/kanban.js` | 394-419 | `renderKBLocal` chama capture/restore, mas o `renderKBMobile` dentro dele apaga |
| 3 | `js/kanban.js` | 417, 426 | `renderKBMobile` executado **depois** do restore |
| 4 | `js/kanban.js` | 421-430 | `refreshKBAffected` — mesmo padrão |
| 5 | `js/kanban.js` | 2216-2282 | `renderKBMobile` sem capture/restore próprio |
| 6 | `js/kanban.js` | 2370-2382 | `_spSelect` (etapa via mobile) chama `moveCard` |
| 7 | `js/kanban.js` | 2199-2210 | `mbReorderTap` chama `renderKBMobile` direto |
| 8 | `js/kanban.js` | 2400-2408 | `setCardSub` chama `renderKBMobile` direto |
| 9 | `js/kanban.js` | 581 | Drop desktop: `_kbMoveCard(...); renderKBLocal(board);` |
| 10 | `js/kanban.js` | 1604 | Drop touch: mesmo padrão |
| 11 | `js/kanban.js` | 1148 | `moveCard()` finaliza com `renderKBLocal(board)` |
| 12 | `js/patches/.../lf-bugs-4fixes-v1-20260729.js` | 131-176 | Wrapper com seletores errados (`data-col-id` que não existe, `#col-<id>` que não existe) |
| 13 | `js/patches/.../lf-bugs-5fixes-v1-20260729.js` | 122-148 | Wrapper que salva `scrollTop` do `.kb-scroll-wrap` (container ERRADO — esse rola horizontal) |
| 14 | `js/patches/.../lf-kanban-fluidity-v1-20260730.js` | 47-98 | Coalesce em rAF que descoordena o timing dos restores legados |
| 15 | `js/patches/.../lf-livre-reason-required-v2-20260730.js` | 320-380 | Wrapper de `_kbMoveCard` que chama a cadeia — funciona, mas apenas para o fluxo Livre |

## 3. Hipóteses descartadas (com evidência)

- ❌ **`_syncKBRemoteBG` recria os cards de forma assíncrona pela rede** — Descartada pelo comentário `js/kanban.js:385-393`: o move é síncrono via `saveKBFor` no cache local, o reset acontece **imediatamente**, não em await de fetch.
- ❌ **CSS `scroll-behavior: smooth` do `lf-kanban-fluidity`** — Descartada: `smooth` só afeta chamadas explícitas de `scrollTo/scrollBy`, não reset provocado por `innerHTML=`.
- ❌ **`_autoMoveStaleToLivre` movendo cards em background** — Descartada: só age em cards individuais quando estagnam por N dias, não altera `scrollTop`.
- ❌ **`scrollIntoView` da linha 2034 (`paginarKB`)** — Descartada: só roda no botão "Carregar mais", não no move.
- ❌ **Recriação total do DOM em `_buildKB`** — Descartada como causa **isolada**: a recriação em si é ok, o problema é ninguém restaurar depois no fluxo mobile.

## 4. Correção definitiva

**Estratégia:** **um único ponto** de captura/restore, envolvendo por fora **três funções** (`_kbMoveCard`, `renderKBLocal`, `renderKBMobile`), com capture ANTES do move e restore em **3 rAF sucessivos** (respeita coalesce de 24ms + rAF-duplo interno + folga para render mobile).

**Arquivos:**
- `js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v1-20260804.js` — novo patch (idempotente)
- `index.html`, `app.html` — recebem tag `<script>` do patch, **depois** de todos os outros patches
- `scripts/apply-fix-scroll-reset-lead-move-20260804.sh` — script que aplica tudo com backup
- `scripts/rollback-fix-scroll-reset-lead-move-20260804.sh` — script de rollback (auto-gerado)
- `.backups/fix-scroll-reset-<timestamp>/` — backup das versões originais

**O que o patch captura:**
1. `scrollLeft` do container horizontal `.kb-scroll-wrap` (leads e negócios)
2. `scrollTop` de cada `.kb-cards` por `data-col` (leads e negócios)
3. `scrollTop` do `#leads-mobile-list` / `#negocios-mobile-list`
4. `scrollTop` do `document.scrollingElement` (mobile scroll do body)

**Cobertura por fluxo:**

| Fluxo do bug | Ação disparadora | Ponto neutralizado pelo fix |
|---|---|---|
| Desktop — drag & drop | `L581` — `_kbMoveCard + renderKBLocal` | Wrapper de `_kbMoveCard` + shadow em `renderKBLocal` |
| Touch — drag & drop | `L1604` — mesmo padrão | Idem |
| Botão de etapa no detalhe do card | `moveCard()` L1133 | Idem |
| Mobile — chevron de etapa (`_spSelect`) | Chama `moveCard` | Idem |
| Mobile — subir/descer (`mbReorderTap`) | Chama `renderKBMobile` direto | Wrapper de `renderKBMobile` |
| Mobile — sub-etapa (`setCardSub`) | Chama `renderKBMobile` direto | Wrapper de `renderKBMobile` |
| Bulk move | `applyBulkMove` → múltiplos `_kbMoveCard` | Wrapper de `_kbMoveCard` (captura antes do lote todo) |
| Conversão Lead → Negócio | Wrapper `lf-flow-hardening` | Herda pelo shadow em `renderKBLocal` |
| Guard Livre (motivo obrigatório) | `lf-livre-reason-required-v2` | Herda pela cadeia — o novo wrapper vem por fora |

## 5. Verificação (teste mental por fluxo)

1. **Desktop, drag & drop na 3ª coluna, scroll no meio** → `_captureAll()` guarda `wraps.leads`, `cols['leads::col3']`. Após `_kbMoveCard` real terminar, os 3 rAFs restauram. ✅
2. **Mobile, chevron de etapa** → `_spSelect` chama `moveCard` → o wrapper externo captura o `scrollTop` do `document`. Após `renderKBLocal` (com `renderKBMobile` por dentro) reescrever tudo, os 3 rAFs restauram o `document.scrollTop`. ✅
3. **Mobile, subir/descer** → `mbReorderTap` chama `renderKBMobile` diretamente, mas ele agora está envolvido pelo wrapper — captura e restaura. ✅
4. **Compatibilidade Capacitor** — Nenhuma dependência de rede/plugin nativo. `safe-area-inset-*` continua funcionando (o restore só toca `scrollTop`, não muda layout). ✅
5. **Compatibilidade Cloudflare** — 100% client-side; nada a caching-invalidate no edge (o `?v=20260804fixscrollreset` já força reload do arquivo novo). ✅

## 6. Pontos observados fora de escopo

Estes NÃO foram corrigidos (fogem do bug relatado); apenas ficam registrados:

- Os wrappers legados `lf-bugs-4fixes` (#2b) e `lf-bugs-5fixes` (#2b) continuam **fisicamente presentes** e são carregados pelo HTML, apenas neutralizados na prática pelo novo wrapper externo. Poderiam ser **removidos** num commit de limpeza — mas isso é decisão de higienização de código, não do bug em si.
- `_kbCaptureScrollState` interno de `renderKBLocal` agora é redundante (o shadow já cobre). Manter por segurança (defesa em profundidade); só remover se for auditar completamente.
- `renderKBMobile` faz `wrap.innerHTML = list.map(...).join('')` — refatorar para `DocumentFragment` reduziria repintura, mas é otimização, não bug.

## 7. Como aplicar / reverter

**Aplicar:**
```bash
./scripts/apply-fix-scroll-reset-lead-move-20260804.sh
```

**Reverter (se necessário):**
```bash
./scripts/rollback-fix-scroll-reset-lead-move-20260804.sh
```
