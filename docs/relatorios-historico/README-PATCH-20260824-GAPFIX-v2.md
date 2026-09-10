# README-PATCH-20260824-GAPFIX-v2 — LiderCRM v3 (24/08/2026)

Etiqueta: LF-ACT-PANEL-SCOPE-20260824 + LF-KB-LOST-LEAD-RESYNC-20260824 (revisão b)
Build: lf-build-id = 20260824-gapsfix
Padrão aplicado: patch cirúrgico isolado (arquivo único), sem tocar os módulos originais.

## Auditoria da v4 → o que estava OK e o que faltava

Auditoria confirma que TODAS as correções documentadas em
`CORRECOES-APLICADAS-20260824.txt` estavam de fato aplicadas na v4:

- ✅ Patch JS GAP 1 + GAP 2 presente em `js/patches/agenda/` e espelho `www/` (idênticos).
- ✅ `index.html` e `www/index.html` com `<meta name="lf-build-id" content="20260824-gapsfix">`.
- ✅ `<script>` do patch na linha 2761 (ambos os index), após `lf-fix-tab-dot-negocios-ownership`.
- ✅ `capacitor.config.json` sem `server.url` (bundle local confirmado).
- ✅ Todos os símbolos públicos referenciados pelo patch existem e com assinatura compatível
  (`getDepartmentVisibleUsers`, `_mergeKeepLocalOnly(server, local)`, `getKBFor`, `kbKeyFor`,
  `_kbWorkerClient`, `renderKBLocal`, `hasAdminAccess`, `toast`).
- ✅ Ordem de carregamento correta: `src/modules/kanban/runtime/kanban-helpers.js` (L307)
  carrega ANTES de `js/kanban.js` (L308) e do patch (L2761).

## O gap encontrado e corrigido nesta v5

### GAP — Botão "♻ Ressincronizar leads" (GAP 2) nunca aparecia

**Causa raiz:** o seletor de âncora do botão procurava `#pg-leads .kb-cons-bar` ou
`#pg-leads .kb-toolbar` — classes que **não existem** no app. A barra real de filtro por
consultor do quadro de Leads usa a classe `kb-view-bar` com o id `leads-cons-bar`:

```
index.html:984 → <div class="kb-view-bar" id="leads-cons-bar"></div>
```

Sem casar nenhum dos dois seletores, o patch caía no fallback `#pg-leads` e o botão era
anexado **no fim da página** (depois do kanban e das barras móveis) — na prática invisível.

**Correção aplicada (somente no patch isolado, sem tocar módulos originais):**

1. Âncora corrigida para o id real, com fallbacks preservados:
   `leads-cons-bar` → `#pg-leads .kb-view-bar` → (antigos `.kb-cons-bar`/`.kb-toolbar`) → `#pg-leads`.

2. Re-injeção reforçada: o gatilho de clique antigo lia `data-nav`/`id` com regex
   `/pg-leads|leads/`, mas a navegação real usa `data-page="crm"` e `mobileGoPage('leads')`,
   então a re-injeção nunca disparava. Agora o gatilho:
   - casa `data-page`/`data-board`/`onclick` contendo `crm|leads|pg-leads`;
   - dispara duas re-tentativas (250ms e 600ms) para cobrir o render assíncrono da
     `leads-cons-bar`;
   - adiciona um `MutationObserver` em `#pg-leads` que re-injeta quando a página ganha
     a classe `.on` (cobre qualquer troca de aba).

**Arquivos alterados:**
- `js/patches/agenda/lf-fix-act-panel-scope-e-resync-20260824.js` (raiz)
- `www/js/patches/agenda/lf-fix-act-panel-scope-e-resync-20260824.js` (espelho — sincronizado, idêntico)

Sintaxe do patch validada (`node --check`). Nenhum outro arquivo foi modificado.

## Como validar a v5
1. ADM logado → aba **Leads** → o botão **♻ Ressincronizar leads** aparece agora
   na barra de filtro por consultor (`#leads-cons-bar`), logo acima do kanban.
2. Clicar no botão → toast com `checked / restored / divergent`.
3. Console: `[patch] LF-ACT-PANEL-SCOPE-20260824+LF-KB-LOST-LEAD-RESYNC-20260824 carregado`.
4. Supervisor (GAP 1, inalterado): painel do relógio não lista atrasadas de fora do departamento.
