# RELATÓRIO — Fix Force Clean Refresh (botão 🔄) — 2026-08-20

## Contexto do pedido

Hoje o botão 🔄 (`nav-update-btn`, ao lado do sino/Atividades) executa
`window.lfCheckForUpdateNow(true)`, definido em `js/app-update-checker.js`.
O comportamento vigente é:

1. Buscar `/index.html` com `cache:'no-store'`.
2. Ler o `<meta name="lf-build-id">` local e o do servidor.
3. Se **diferente** → agenda reload com `?_upd=<ts>` + `caches.keys().delete()`.
4. Se **igual** → mostra "✅ Você já está na versão mais recente" e **NÃO
   faz mais nada**.

Sessões longas acumulam lixo mesmo sem novo deploy — mapas em memória
dessincronizados, sessionStorage entulhado, caches técnicos em
localStorage, workbox órfão em IndexedDB. O usuário pediu:
mesmo com build-id igual, o clique manual deve forçar uma limpeza
profunda desse lixo e recarregar.

## Solução — patch cirúrgico

Um único arquivo novo em `js/patches/`:
`lf-force-clean-refresh-v1-20260820.js`. Ele faz **monkey-patch** de
`window.lfCheckForUpdateNow`, **sem tocar** em `js/app-update-checker.js`
(mantém a política de núcleo somente leitura).

- **`manual === true`** → dispara a rotina de limpeza profunda + hard reload.
- **automático** → delega ao original intacto (nada muda no ciclo leve).

### O que a limpeza profunda faz (nessa ordem)

| Etapa | Alvo | Detalhe |
|---|---|---|
| 1 | Toast informativo | `🧹 Limpeza profunda — recarregando…` |
| 2 | `localStorage` seletivo | Ver classificação abaixo |
| 3 | `sessionStorage` | `.clear()` total (escopo de aba, volátil) |
| 4 | Buffers em memória | Reseta `window.__LF_CACHE__`, `__LF_LEADS_CACHE__`, `__LF_CHAT_CACHE__`, `__LF_NOTIF_CACHE__`, `__LF_FEED_CACHE__`, `__LF_KANBAN_CACHE__` (só se existirem — sem criar) |
| 5 | Cache Storage API | `caches.delete()` em todas as chaves |
| 6 | Service Workers | `unregister()` em todos (defensivo) |
| 7 | IndexedDB órfão | Só bancos de cache técnico (whitelist) — nunca bancos de aplicação |
| 8 | Hard reload | `location.replace(?_upd=<ts>&_hardclean=1)` |

**Fail-safe**: se qualquer promise não resolver em até 3s, o reload
acontece de qualquer jeito. Cada etapa em `try/catch` — nada pode
bloquear o botão.

### Classificação de `localStorage` (confirmada com o dono do produto)

**Preservado** (sessão / preferências / identidade):
- `sb-*` — tokens Supabase auth
- `lf-user-pref-*`
- `lf-wallpaper-*`
- `lf-theme-*`
- `lf-scope-*`

**Removido** (cache técnico volátil):
- `lf-cache-*`
- `lf-tmp-*`
- `_cache_*`
- `lf-feed-cache-*`
- `lf-kanban-cache-*`

Em caso de conflito, **preserve vence**.

### Classificação de IndexedDB (confirmada)

Apagados apenas bancos cujo nome bate em:
- `^workbox-` (i)
- `^lf-cache-` (i)
- `^lf-tmp-` (i)
- `^_cache_` (i)
- `^lf-feed-cache` (i)
- `^lf-kanban-cache` (i)

Bancos de aplicação (mensageiro offline, rascunhos de leads, filas
pendentes) **nunca** são tocados aqui — rascunhos do usuário preservados.

Em navegadores que não expõem `indexedDB.databases()` (Firefox antigo,
alguns Safari), a etapa é pulada silenciosamente — preservar >
vazar.

## Arquivos afetados

| Arquivo | Tipo | Mudança |
|---|---|---|
| `js/patches/lf-force-clean-refresh-v1-20260820.js` | **NOVO** | Patch principal |
| `www/js/patches/lf-force-clean-refresh-v1-20260820.js` | **NOVO** | Espelho www/ |
| `index.html` | Alterado | +1 tag `<script>` (linha 129) após `app-update-checker.js` |
| `app.html` | Alterado | +1 tag `<script>` (linha 128) idem |
| `www/index.html` | Alterado | +1 tag `<script>` (linha 129) idem |
| `www/app.html` | Alterado | +1 tag `<script>` (linha 128) idem |
| `RELATORIO-FIX-FORCE-CLEAN-REFRESH-20260820.md` | **NOVO** | Este documento |
| `_patch-meta/APLICADO-FORCE-CLEAN-REFRESH-20260820.txt` | **NOVO** | Meta |

Nenhum arquivo do núcleo (`js/app-update-checker.js` inclusive) foi
tocado. Nenhum outro patch existente foi alterado.

## Idempotência

Bandeira `window.__LF_FORCE_CLEAN_REFRESH_V1__` — se por acaso o patch
carregar duas vezes (dupla-injeção acidental), a segunda execução sai
imediatamente. O wrapper também usa `wrapped.__LF_FORCE_CLEAN_WRAPPED__`
pra não empilhar em cima de si mesmo.

## Rollback

Basta comentar (ou remover) as 4 tags `<script>` novas em:
- `index.html:129`
- `app.html:128`
- `www/index.html:129`
- `www/app.html:128`

Núcleo intacto — nada precisa ser revertido além disso.

## Verificação manual sugerida

1. Abrir o CRM, aguardar boot completo.
2. Clicar no 🔄 sem novo deploy → esperar toast
   `🧹 Limpeza profunda — recarregando…` → página recarrega com URL
   contendo `?_upd=<ts>&_hardclean=1`.
3. Após reload, conferir que **login continua** (Supabase preservado),
   **papel de parede continua**, **tema continua**.
4. Conferir no DevTools que `sessionStorage` está vazio e que chaves
   `lf-cache-*` / `lf-tmp-*` do `localStorage` sumiram.
5. Simular novo deploy (mudar `<meta name="lf-build-id">`) → ciclo
   automático deve continuar detectando e recarregando normalmente
   (comportamento original preservado).
