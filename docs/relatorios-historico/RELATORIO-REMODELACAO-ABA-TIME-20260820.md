# RELATÓRIO — Remodelação da Aba "Time" (2026-08-20)

## Objetivo
Remover as métricas agregadas que apareciam logo de cara na aba **Time** e
substituí-las por uma **lista rolável de todos os consultores do CRM**,
empilhados um em cima do outro. Ao clicar em um consultor, mostra o
analytics individual dele (mesmo comportamento que já acontecia ao clicar
nos cards do antigo "Ranking do time").

## O que mudou

### 1) HTML — `index.html` (e `www/index.html`)
- **Removido**: `<div class="adm-kpi-grid" id="time-kpis"></div>`
  — era o container das 5 caixas de topo (Total de Leads 191, Total de
  Negócios 94, Total de Fechamentos 0, e o breakdown "191 / 94 / 0" por
  consultor).
- **Substituído**: bloco "🏆 Ranking do time" com grade de 3 colunas
  (`.adm-kpi-grid`) → agora "👥 Consultores" com **lista vertical
  rolável** (`.time-cons-list`).
- **Mantido**: `#time-cons-bar` (chips "Seus / Todos / usuário X"),
  `#time-analytics-wrap` (analytics do consultor selecionado),
  sub-abas Atividades / Ligações / Movimentações.

### 2) CSS — `css/style.css` (e `www/css/style.css`)
Novo bloco `.time-cons-list` e `.time-cons-card`:
- **Lista rolável**: `max-height: calc(100vh - 260px)`, `overflow-y: auto`,
  scrollbar temática (dourada, fina).
- **Card do consultor** (empilhado, um em cima do outro, gap 8px):
  - Avatar circular com a inicial do nome (gradiente dourado).
  - Nome completo do consultor + medalha 🥇🥈🥉 nos 3 primeiros / posição
    (`4º`, `5º`…) nos demais.
  - Sub-linha: `X agend. · Y fech. · Z% · R$ valor`.
  - 3 métricas à direita: **Leads / Neg. / Fech.** (a coluna "Neg." é
    ocultada em telas < 380px pra caber).
  - Chevron `›` à direita indicando clicabilidade.
  - Hover: leve elevação + borda dourada + fundo suave.
- **Acessibilidade**: `role="button"`, `tabindex="0"` e ativação por
  `Enter` / `Espaço`.

### 3) JavaScript — `js/relatorios.js` (e `www/js/relatorios.js`)
- **`_drawTimeRanking(users)`** reescrita: em vez de gerar `.adm-kpi`
  numa grade de 3 colunas, agora gera `.time-cons-card` empilhados
  verticalmente com avatar + nome + métricas + chevron. O clique continua
  chamando `setTimeConsFilter(uid, null)`, que é exatamente a mesma rota
  que já abria o analytics individual antes.
- **`_timeKpisHTML(users)` REMOVIDA**: função que gerava as caixas
  agregadas de topo. Sua chamada em `renderTimePage()` foi trocada por
  uma guarda que apenas limpa `#time-kpis` se algum bundle antigo ainda
  o tiver em cache (à prova de bala pra usuários com JS/HTML cacheado).
- **Ordenação preservada**: fechamentos DESC → taxa DESC → valor DESC
  (mesma fórmula de reconciliação com `Math.max(fecCli, fecKB)` pra não
  duplicar fechamento entre `cli.steps[6]` e `neg.col === 'fechado'`).

## Comportamento agora

**Ao entrar em `Time → Equipe`:**
1. Chips de filtro "Seus / Todos / [usuário]" — inalterados.
2. **Direto** a lista "👥 Consultores" empilhada, rolável, com todos os
   consultores visíveis do departamento.
3. Sem mais linha de KPIs agregados de topo (191 / 94 / 0).

**Ao clicar em um card de consultor:**
- Abre o analytics completo dele (funil por etapa, distribuição,
  KPIs de negócios, valor fechado, no-show/desistência etc.) —
  exatamente o mesmo painel que já aparecia antes ao clicar nos cards
  do ranking.

**Ao selecionar "Ver todos" no chip do topo:**
- Volta para a lista rolável de consultores.

## Compatibilidade & regressões
- `#time-kpis` foi retirado do HTML — sem quebras: `renderTimePage()`
  agora chama `document.getElementById('time-kpis')` com guarda.
- `_timeKpisHTML` não é mais referenciada em nenhum outro lugar
  (grep global limpo).
- Rotina de filtro por período (`setTimePer`), analytics do consultor
  selecionado (`drawAnal` + `drawNegKPIs`), auto-refresh nos eventos
  `crm:users-updated` / `crm:departments-updated` — todos intactos.
- Mobile: `.time-cons-list` reduz altura e oculta a métrica "Neg." em
  breakpoints menores; a lista permanece rolável.

## Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `index.html` | Remove `#time-kpis`; troca grid de ranking por `.time-cons-list` |
| `www/index.html` | idem (mirror) |
| `css/style.css` | Adiciona bloco `.time-cons-list` / `.time-cons-card` |
| `www/css/style.css` | idem (mirror) |
| `js/relatorios.js` | Reescreve `_drawTimeRanking`; remove `_timeKpisHTML`; guarda em `renderTimePage` |
| `www/js/relatorios.js` | idem (mirror) |

## Verificações executadas
```
1. #time-kpis removido do HTML?                                  ✅ true
2. .time-cons-list existe no HTML?                               ✅ true
3. Título "👥 Consultores" existe?                               ✅ true
4. Bloco antigo "🏆 Ranking do time" removido?                   ✅ true
5. .time-cons-card CSS existe?                                   ✅ true
6. .time-cons-list CSS existe?                                   ✅ true
7. _drawTimeRanking gera time-cons-card?                         ✅ true
8. _timeKpisHTML foi neutralizado?                               ✅ true
9. renderTimePage não chama mais _timeKpisHTML?                  ✅ true
10. setTimeConsFilter ainda é chamado no clique?                 ✅ true
```
