# `src/shared/config/` — configuração de runtime (ambiente/deploy)

Conectado em `index.html` e `app.html`. Ver `docs/modules.md`
(Geração 2.5).

| Arquivo | Papel |
|---|---|
| `runtime-config.js` | Lê config via `<meta>` tags injetadas no HTML no momento do deploy (endurecido em auditoria de segurança 2026-07-17). Fallback preserva os defaults antigos pra modo dev/local, quando as `<meta>` tags não existem. |

Não confundir com `src/modules/configuracoes/` (preferências do
USUÁRIO dentro do app) — este arquivo é config de AMBIENTE/deploy.
