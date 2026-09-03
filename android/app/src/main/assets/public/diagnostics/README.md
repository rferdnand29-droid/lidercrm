# diagnostics/

`crash-reporter.js` é carregado e ativado no boot como rede de segurança.
As ferramentas observacionais sem consumidores foram removidas para que
este diretório represente somente código efetivamente mantido.

| Arquivo | O que faz | Precisa de `.enable()`? |
|---|---|---|
| `crash-reporter.js` | Captura `error`/`unhandledrejection` num buffer, **sem nunca sobrescrever `window.onerror`** (o projeto já tem um em `index.html`, que gera `app.html` — ver comentário no topo do arquivo) | Ativado no boot |

## Por que não estão ligadas

O crash reporter permanece ligado porque foi usado para investigar o
crash do Capacitor e funciona como rede de segurança.

Se uma nova ferramenta diagnóstica for realmente necessária, adicione
primeiro um consumidor, registre a tag no grupo correto de `index.html` e
documente qualquer dependência em `scripts/load-order-contract.json`.
