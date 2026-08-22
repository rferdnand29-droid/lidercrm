# FIX — KPIs da Agenda passam a respeitar os filtros de Consultor e Status
Data: 2026-08-20

## Problema
Os cards de métricas do topo da agenda (**Hoje**, **Últimos 7 dias**, **7 dias anteriores**, **Este mês**) sempre contavam o cache inteiro `_agdCache`, ignorando os dois selects do topo (`agd-filter-cons` = "Todos os consultores" e `agd-filter-status` = "Todos os status"). Ex.: ao filtrar por "Rhuan" + "Atendido", só a lista de agendamentos do dia mudava — os cards continuavam mostrando o total da equipe.

## Correção
1. `agdRenderKPIs()` (arquivos `www/js/agenda.js` e `js/agenda.js`) agora lê os dois filtros do DOM e aplica um `filter()` **antes** de calcular Hoje / Últimos 7 dias / 7 dias anteriores / Este mês. Sem filtro selecionado, o comportamento é idêntico ao anterior (conta tudo).
2. Os handlers `onchange` dos dois selects (`agd-filter-cons`, `agd-filter-status`) em **todos** os HTMLs (`app.html`, `www/app.html`, `www/index.html`, `src/index.html`, `index.html`) passam a chamar `agdRenderKPIs()` além do que já faziam, para que os cards recalculem em tempo real ao trocar de consultor/status.

## Escopo cirúrgico
- **Nada mais foi alterado**. Só a função `agdRenderKPIs` e os dois atributos `onchange` dos filtros da agenda.
- Comportamento antigo é preservado quando nenhum filtro está selecionado.

## Testes (simulação Node)
Cache com 8 agendamentos e "hoje" = 2026-08-20:

| Filtro | Hoje | Últ.7d | 7d ant. | Mês | Resultado |
|---|---|---|---|---|---|
| Rhuan + Atendido | 1 | 3 | 1 | 5 | ✅ |
| (nenhum) | 2 | 4 | 2 | 8 | ✅ preserva antigo |
| Só João | 0 | 0 | 1 | 1 | ✅ |
| Só status = No-show | 0 | 0 | 0 | 1 | ✅ |
| Só Rhuan | 2 | 4 | 1 | 7 | ✅ |
