# Relatório — Fix definitivo: renomear lead revertendo + usuário excluído mantendo papo (2026-08-19)

## Bug 1 — Renomear lead "voltava" ao nome antigo após atualizar/deploy

### Cadeia causal (root cause)
1. `saveKBCard()` gravava primeiro no localStorage e mostrava "Atualizado!" medindo SÓ a gravação local — o PUT remoto rodava em `saveKBFor()` e, se falhasse (rede, sessão expirada, 403), caía em `syncErr()` **em silêncio**: nenhum aviso ao usuário, nenhum retry. No próximo reload/deploy, o sync remoto trazia de volta o quadro antigo do servidor.
2. O PUT `/api/v1/kanban/list` no Worker fazia **sobrescrita cega** (`setFsDocument` com a lista inteira, sem comparar). Qualquer aba antiga em cache (deploy trocou os arquivos, mas a aba aberta ainda rodava o JS anterior com a lista sem a edição) regravava o quadro inteiro por cima e **revertia o nome no servidor para todos**.
3. Coadjuvante: as URLs de script usam `Cache-Control: immutable` por 1 ano e dependem 100% do `?v=` — se a versão não muda, o JS antigo continua rodando e repetindo a sobrescrita.

### Correções (em defesa em profundidade — qualquer uma sozinha já impede o sintoma)
- **`js/kanban.js` — `LF-KB-SAVE-RETRY-20260819`**: `saveKB()` e `saveKBFor()` agora têm 1 retry automático (1,5s) na gravação remota e, se falhar de vez, mostram aviso visível ("⚠️ Não consegui salvar na nuvem...") em vez de fingir sucesso.
- **`_worker_src/worker/controllers/kanban-controller.js` — `LF-KANBAN-PUT-MERGE-20260819`**: o PUT agora faz merge por card: para ids presentes nas duas versões, vence o `updatedAt` mais novo — uma aba antiga não consegue mais reverter a edição. Ids ausentes no corpo continuam removidos (exclusões preservadas) e ids novos entram normalmente.
- **Cache-bust definitivo**: todas as 188/178/191/181 URLs `?v=` de `index.html`, `app.html`, `www/index.html` e `www/app.html` passam para `?v=20260819leadchat1`, e `lf-build-id` vira `20260819-leadchat-r1` — o app-update-checker detecta o deploy novo e recarrega as abas antigas sozinho.

## Bug 2 — Excluir usuário não removia conversas e mensagens do bate-papo

### Cadeia causal (root cause)
`confirmDU()` em `js/usuarios.js` removia apenas o cadastro (`deleteUserDoc`), as sessões e os vínculos de departamento. Nada tocava o Papo: os docs remotos `chat_conv_<id>` (mensagens + participantes) e `chat_inbox_<uid>` (caixa de entrada) continuavam no servidor, e os caches locais `lf13_chat_convs` / `lf13_chat_msgs_<id>` continuavam nos aparelhos — logo a conversa seguia aparecendo para os demais usuários.

### Correções
- **`js/chat.js` — `LF-CHAT-PURGE-USER-20260819`** (novo módulo global `window._chatPurgeUserEverywhere(uid)`):
  - Conversas 1:1 com o excluído: somem do `lf13_chat_convs` local, mensagens `lf13_chat_msgs_<id>` apagadas, doc remoto `chat_conv_<id>` recebe lápide `{deleted:true, msgs:[], participants:[]}` e a entrada é removida da inbox de CADA participante → o papo some para todos, sem ressuscitar no próximo pull.
  - Grupos: remove o excluído de `participants`/`admins` e sincroniza o doc remoto; grupo que sobrar com ≤1 pessoa é tratado como DM (eliminado). A inbox remota do excluído (`chat_inbox_<uid>`) é zerada.
  - Se a conversa apagada estiver aberta na tela, volta para a lista e re-renderiza.
- **`js/usuarios.js` — `confirmDU()`**: passa a chamar `window._chatPurgeUserEverywhere(delId)` junto com `deleteUserDoc` (best-effort, com try/catch e log).
- **Listener `crm:users-updated` no `js/chat.js`**: nos OUTROS dispositivos, quando a lista de usuários recarrega e alguém que existia sumiu (foi excluído em outro aparelho), as conversas 1:1 com o "fantasma" são purgadas localmente E a limpeza remota é refeita — cobre o caso de exclusão feita em outro aparelho.

## Arquivos alterados
| Arquivo | Marcador |
|---|---|
| `js/kanban.js` | `LF-KB-SAVE-RETRY-20260819` (saveKB + saveKBFor) |
| `www/js/kanban.js` | espelho idêntico (Capacitor) |
| `_worker_src/worker/controllers/kanban-controller.js` | `LF-KANBAN-PUT-MERGE-20260819` |
| `js/chat.js` (+ `www/js/chat.js`) | `LF-CHAT-PURGE-USER-20260819` + listener de users-updated |
| `js/usuarios.js` (+ `www/js/usuarios.js`) | chamada da purga no `confirmDU()` |
| `index.html`, `app.html`, `www/index.html`, `www/app.html` | `?v=20260819leadchat1` + build-id `20260819-leadchat-r1` |

## Verificações
- `node --check` OK em: `js/kanban.js`, `js/chat.js`, `js/usuarios.js`, `_worker_src/.../kanban-controller.js`, `www/js/kanban.js`, `www/js/chat.js`.
- Marcadores presentes: 2 em kanban.js, 1 no worker, 1 em chat.js, 1 em usuarios.js, build-id novo nos 4 HTMLs.

## Nota de implantação
O Worker (Pages Functions) precisa subir junto com o front neste deploy — o merge do PUT (`LF-KANBAN-PUT-MERGE-20260819`) é server-side.
