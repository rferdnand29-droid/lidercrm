# Diagnóstico Forense — erro de exclusão de conversa entre Rhuan e Hudson

## Erro investigado
Quando o usuário **Rhuan** exclui a conversa com o admin **Hudson**, ao Hudson logar a conversa com Rhuan também some.

## Conclusão
A falha não estava no backend principal do chat em si, mas na **cadeia de patches tardios do front-end**, especialmente na sobrescrita repetida de `chatDeleteConv` e nos wrappers de sincronização/inbox. O projeto já tinha várias correções sobrepostas para grupos e exclusão de conversa, e isso deixou a exclusão de **DM** (conversa individual) sem uma camada canônica isolada.

O efeito colateral observado é compatível com esta arquitetura:

1. `chatDeleteConv` original de DM existe em `js/chat.js`, com intenção de remover só o inbox do usuário atual.
2. Depois disso, **vários patches** sobrescrevem `chatDeleteConv` para resolver problemas de **grupos**.
3. Como a função de exclusão passa a depender de uma cadeia de wrappers e referências `orig`, a DM fica sujeita a comportamento acidental e reidratação/purga por sync local/remoto.
4. O chat ainda possui mecanismos paralelos de inbox remoto (`chat_inbox_<uid>`), sincronização de índice de conversa e purga local, o que aumenta a chance de uma exclusão “local” vazar como efeito para o outro lado quando o fluxo não está isolado por tipo de conversa.

## Evidências principais

### 1) Exclusão base de DM
Arquivo: `js/chat.js`
- `chatDeleteConv()` remove localmente a conversa e chama `_chatRemoveInboxEntryForUsers(convId, [S.userId])`.
- A intenção original é clara: **remover apenas do inbox do usuário atual**.

### 2) Infra de inbox remoto por usuário
Arquivo: `js/chat.js`
- `_chatRemoveInboxEntryForUsers()` manipula `chat_inbox_<uid>`.
- `_chatSyncConvIndex()` reescreve o índice de conversa para os participantes.
- `_chatPullInboxConvs()` reidrata a lista local com base no inbox remoto.

Ou seja: qualquer bug na semântica de exclusão ou na cadeia de wrappers se propaga via sync.

### 3) Sobrescritas múltiplas de `chatDeleteConv`
Foram encontradas várias redefinições da mesma função, entre elas:
- `js/patches/chat/correcoes-acumuladas/lf-cacador-erro-especifico-v2-20260801.js`
- `js/patches/chat/correcoes-acumuladas/lf-fix-novaconv-e-ctxgrupo-v1-20260801.js`
- `js/patches/lf-cacador-erro-definitivo-v4-20260801.js`
- `js/patches/lf-fix-raiz-definitivo-v1-20260801.js`
- `js/patches/lf-fix-cancel-e-sair-grupo-v1-20260801.js`
- `js/patches/chat/grupos-admin/lf-chat-group-adm-actions-fix-v1-20260731.js`

Isso confirma que a mesma operação crítica foi sendo “corrigida” em camadas, principalmente para **grupos**, sem um isolamento robusto para **DM**.

### 4) Hotfixes antigos já mexiam no inbox/self-removal
Arquivos:
- `js/patches/chat/visual/lf-chat-hotfix-20260731.js`
- `js/patches/chat/correcoes-acumuladas/lf-cacador-4bugs-20260730.js`

Ambos filtram a remoção do próprio usuário em `_chatRemoveInboxEntryForUsers`, o que já mostra que o fluxo de inbox/removal estava frágil e sujeito a regressão.

## Causa raiz consolidada
A causa raiz é **acoplamento excessivo entre exclusão de DM e cadeia de patches de grupo**, somado à reidratação por inbox remoto e à ausência de um contrato canônico específico para exclusão de conversa individual.

Em termos práticos:
- o sistema tinha correções específicas para “sair/apagar grupo”,
- mas a exclusão de **DM** continuava dependendo de uma cadeia global de wrappers e fallback para funções já sobrescritas,
- então a exclusão individual podia deixar de ser estritamente “só para mim”.

## Correção implementada
Foi criado o patch:

`js/patches/chat/lf-fix-dm-delete-isolation-v1-20260804.js`

### O que ele faz
1. **Instala uma versão canônica de `chatDeleteConv` só para DM**.
   - Se a conversa for grupo, delega para o fluxo já existente.
   - Se for DM, usa um fluxo próprio e isolado.

2. **Ao excluir uma DM, remove apenas do inbox do usuário atual**.
   - Nunca toca o inbox do outro participante.

3. **Cria tombstone local por `convId`**.
   - Isso evita reidratação indevida da conversa logo após a exclusão.

4. **Filtra tombstones em `_chatSaveConvs`**.
   - Se a conversa voltar com `updatedAt` mais novo que a lápide, assume nova atividade legítima e derruba a lápide.

5. **Instala watchdog de reinstalação**.
   - Se outro patch tardio sobrescrever `chatDeleteConv` ou `_chatSaveConvs`, o patch se reinstala.

## Arquivos alterados
- `js/patches/chat/lf-fix-dm-delete-isolation-v1-20260804.js` — novo patch
- `index.html` — inclusão do patch
- `app.html` — inclusão do patch
- `tools/chat-fixes/apply-dm-delete-isolation-20260804.sh` — script de aplicação idempotente

## Resultado esperado após deploy
- Se **Rhuan** excluir a DM com **Hudson**, a conversa some **somente para Rhuan**.
- Ao **Hudson** logar, a conversa **continua existindo** para ele.
- Se depois houver mensagem nova, a DM pode reaparecer para quem a apagou, como uma nova atividade legítima.

## Observação importante
O projeto tem uma quantidade incomum de patches concorrentes para chat, especialmente em torno de grupos/context-menu/exclusão. Esta correção resolve o erro específico solicitado, mas o ideal de médio prazo é consolidar toda a lógica de exclusão de conversa em um único módulo autoritativo.
