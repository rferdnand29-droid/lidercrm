# `src/core/contracts/` — contrato de rotas da API

Conectado em `index.html` e `app.html`. Ver `docs/modules.md`
(Geração 2.5).

| Arquivo | Papel |
|---|---|
| `api-contract.js` | Mapa de rotas — cada chave aponta pro path exato usado por `_worker_src/worker/routes/router.js`. Consumido por `src/shared/http/worker-client.js`. Última atualização registrada no cabeçalho: auditoria "step5.3", adicionou rotas das Fases 3.x que faltavam no mapa original (Fase 2). |

**Se você adicionar uma rota nova no backend (`routes/router.js`) e o
client vai chamá-la via `worker-client.js`, ela também precisa entrar
aqui** — senão o client não tem como montar a URL certa. Ver
`docs/worker.md` §"Como adicionar uma rota nova".
