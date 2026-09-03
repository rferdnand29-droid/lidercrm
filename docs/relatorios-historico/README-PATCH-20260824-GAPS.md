# README-PATCH-20260824-GAPS — LiderCRM v3 (24/08/2026)

Etiqueta: **LF-ACT-PANEL-SCOPE-20260824 + LF-KB-LOST-LEAD-RESYNC-20260824**
Build: `lf-build-id = 20260824-gapsfix`
Padrão aplicado: patch cirúrgico isolado (arquivo único), sem tocar os módulos originais.

## Arquivos alterados
| Arquivo | Alteração |
|---|---|
| `js/patches/agenda/lf-fix-act-panel-scope-e-resync-20260824.js` | **NOVO** — fecha os gaps 1 e 2 |
| `index.html` | `<meta name="lf-build-id">` → `20260824-gapsfix`; nova tag `<script>` após `lf-fix-tab-dot-negocios-ownership` (linha ~2761) |
| `www/index.html` + `www/js/patches/agenda/…` | Espelho sincronizado (bundle Capacitor) |

## GAP 1 — Supervisor via atrasadas de fora do departamento (painel do relógio)
**Causa:** `renderActPanel` (js/agenda.js) mesclava atividades de TODOS os usuários
ativos sem passar por `getDepartmentVisibleUsers` — o mesmo escopo que
`renderTimeAtividades` já usa. O filtro de órfãs (`_isActivityOrphanOrInactive`)
já existia no painel, mas só escondia card excluído/terminal; não limitava QUEM entrava na mescla.

**Correção (envelope reversível):** o patch envolve `window.renderActPanel` e
`window.updateActBadge`. Quando o logado NÃO é ADM e NÃO está em visão Time
(`_timeViewUid`/`_admViewUid`/`_kbViewUid` ativos), o conjunto visível passa a ser
`getDepartmentVisibleUsers(S.userId)` (com o próprio uid sempre incluído).
A restrição é aplicada envolvendo temporariamente `getActivitiesLocalFor` /
`getActivities` **somente durante a chamada** (try/finally) — nada é reescrito
em js/agenda.js, js/relatorios.js ou js/utils.js. ADM e visão Time mantêm o
comportamento anterior (sem restrição).

## GAP 2 — Leads sumidos antes do patch 20260824 (ressincronização retroativa)
**Causa:** o rollback (LF-KB-TRANSFER-ROLLBACK-20260824) só protege operações
novas; cards que sumiram entre a pintura otimista e o 403 do worker continuavam
perdidos no localStorage do antigo responsável.

**Correção (não-destrutiva):**
- Novo helper global `window.lfResyncLostLeads(board)` (padrão `'leads'`).
- Novo botão **"♻ Ressincronizar leads"** na barra do quadro de Leads, visível só para ADM.
- Para cada usuário do escopo (ADM → todos ativos; demais → `getDepartmentVisibleUsers`):
  1. Lê o estado real do worker (`wc.kanbanList(board, uid)` — já funciona com o ADM raiz corrigido);
  2. Compara com o cache local (`getKBFor` / `lf6_kb_<board>_<uid>`);
  3. Cards que existem NO SERVIDOR mas não no cliente são restaurados via
     `_mergeKeepLocalOnly` (rotina oficial de merge) + `ss(kbKeyFor(...))`, e o quadro repinta com `renderKBLocal`.
  4. Cards que NÃO existem no servidor (PUT do destino falhou por 403) **não são
     recriados por adivinhação** — são reportados em `report.divergent` (console +
     toast) para reconstrução manual a partir do snapshot `fs_documents`
     `kanban/list/leads/<uid_origem>`, conforme o diagnóstico.
- Nada é apagado nem sobrescrito além do merge oficial. Idempotente.

## GAP resolvido por processo (não por código)
- **APK antigo / login:** `capacitor.config.json` já está sem `server.url` (bundle local)
  e o build foi batido para `20260824-gapsfix`. Resta apenas:
  `node scripts/release-and-sync.mjs && npx cap sync` → recompilar APK/AAB no
  Android Studio → publicar → usuário desinstalar/reinstalar. Verificar no WebView:
  `document.querySelector('meta[name=lf-build-id]').content` deve ser ≥ `20260824-gapsfix`.

## Como validar
1. Supervisor logado: abrir o painel do relógio (sino) → não deve listar atrasadas
   de consultores fora do departamento dele; badge só conta o escopo.
2. ADM: abrir aba Leads → botão "♻ Ressincronizar leads" → conferir toast/console
   com `checked / restored / divergent`.
3. Console: `[patch] LF-ACT-PANEL-SCOPE-20260824+LF-KB-LOST-LEAD-RESYNC-20260824 carregado`.
