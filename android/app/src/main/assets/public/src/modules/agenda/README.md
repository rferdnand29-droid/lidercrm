# `src/modules/agenda/` — Agenda (modularização parcial)

Namespace: `window.LiderCRM.modules.agenda.runtime`. Conectado em
`index.html` e `app.html` (script tag), carregado depois de `js/agenda.js`.
Ver `docs/modules.md` (Geração 2) e `docs/architecture.md`.

| Arquivo | Extraído de | Papel |
|---|---|---|
| `runtime/activities-store.js` | `js/agenda.js` | Store de atividades/lembretes — leitura/gravação (local + sync remoto), sem DOM |
| `runtime/ligacoes-store.js` | `js/agenda.js` (bloco "LIGAÇÕES COUNTER"), rodada 7 | Store do contador de ligações do dia |
| `runtime/linked-activities-view.js` | `js/agenda.js` | View de atividades vinculadas |

Padrão comum: nenhum arquivo aqui toca DOM diretamente — só
estado/dado. A camada de renderização continua em `js/agenda.js`.
