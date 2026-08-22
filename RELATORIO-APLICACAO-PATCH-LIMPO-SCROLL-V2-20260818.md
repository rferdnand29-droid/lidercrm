# Relatório — Aplicação LIMPA do patch scroll-lock v2

**Data:** 2026-08-18
**Patch alvo:** `js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v2-20260818.js`
**SHA-256:** `45cac71589b2813a9b88f4370245e7fa6cbdf237ce970618d3bbb94e10533d11`

## Diagnóstico do estado anterior

O ZIP `lidercrm-scrolllock-v2-20260818.zip` já continha o arquivo do v2,
porém o **v1 obsoleto (20260804) continuava sendo carregado ANTES do v2**
em quatro HTMLs (`app.html`, `index.html`, `www/app.html`, `www/index.html`).

Consequências observadas no runtime:

1. Dupla instalação de listeners `wheel`/`touchstart`/`scroll` nos containers do Kanban.
2. `renderKBLocal` era envolvida pelo v1 primeiro, e o v2 então envolvia o
   wrapper do v1, criando uma cadeia frágil em que a política do v1
   (janela de ~48ms / 3 rAFs) podia "vencer" a política invariante do v2.
3. Ruído no console e uso de memória levemente maior.

## Correções aplicadas

- 🔻 **Removidas 4 tags `<script>`** do v1 obsoleto:
  - `app.html:2358`
  - `index.html:2524`
  - `www/app.html:2358`
  - `www/index.html:2524`
- 🗑️ **Removidos os arquivos do v1 obsoleto**:
  - `js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v1-20260804.js`
  - `www/js/patches/kanban-leads/lf-fix-scroll-reset-lead-move-v1-20260804.js`
- ✅ **Reafirmado o v2 como fonte única da verdade** em raiz e em `www/`
  (mesmo hash SHA-256 do arquivo enviado pelo usuário).
- 🧹 Backups `.bak-v2patch` gerados durante o processo foram descartados
  para não poluir o ZIP final.

## Estado final (verificado)

Somente 4 referências ao patch restam no projeto — todas apontando para o v2:

```
./app.html:2358         → v2
./index.html:2524       → v2
./www/app.html:2358     → v2
./www/index.html:2524   → v2
```

Nenhuma referência ao v1 permanece em HTML/JS/JSON.

## Regra invariante ativa (v2)

> "O SCROLL SÓ VOLTA A 0 SE O USUÁRIO ROLOU ATÉ 0 COM O DEDO OU MOUSE.
>  Qualquer reset provocado por render/sync é desfeito automaticamente."

Sentinela cobre `wheel`, `touchstart`, `touchmove`, `pointerdown`,
`mousedown` e `scroll` com `isTrusted`, e sobrevive ao ciclo completo
`renderKBLocal → _syncKBRemoteBG → renderKBLocal` (200–1500 ms).
