# diagnostics/

Ferramentas de observação — **nenhuma delas é carregada por
`index.html`/`app.html` hoje**, e nenhuma modifica comportamento
existente até alguém decidir ativar. "Prontas para uso futuro", como
pedido.

| Arquivo | O que faz | Precisa de `.enable()`? |
|---|---|---|
| `logger.js` | Buffer circular de logs por área, com espelho opcional no console | Não — ativo assim que carregado |
| `performance.js` | Mede duração de operações nomeadas (`start()`/`stop()`), guarda histórico | Não |
| `network-monitor.js` | Estatística de sucesso/falha/latência de `fetch` | **Sim**, manual — não envolve `fetch` sozinho (o projeto já tem um wrap de fetch em `lf-fix-raiz-token-quota-v1`; empilhar mais um automaticamente seria mudança de comportamento) |
| `sync-monitor.js` | Snapshot periódico de `window.RetryQueue`/`SyncManager` já existentes — só lê, nunca escreve | `.startWatch()` pra ligar o snapshot periódico |
| `duplicate-detector.js` | Acha IDs de DOM duplicados, `<script src>` carregado 2x, e lista as flags `__LF_*`/`__lf*` já ativas | Não — `.scan()` roda na hora |
| `crash-reporter.js` | Captura `error`/`unhandledrejection` num buffer, **sem nunca sobrescrever `window.onerror`** (o projeto já tem um em index.html/app.html — ver comentário no topo do arquivo) | **Sim**, manual |

## Por que não estão ligadas

O pedido original foi "prontos pra uso futuro" — carregar automaticamente
todos os seis no boot do CRM real, mesmo sendo só observacionais, ainda
é uma mudança (mais 6 `<script>`, mais processamento em toda página,
mais uma coisa rodando o tempo todo). Preferi entregar testado e
funcionando, e deixar a decisão de ativar — e onde — com vocês.

## Como ativar, se/quando quiserem

Adicionar as tags em `index.html` **e** `app.html`, sem `defer`, numa
posição parecida com `shared/utils/` (perto do início, com os outros
módulos de base). Todos os arquivos são idempotentes e não dependem de
ordem entre si.
