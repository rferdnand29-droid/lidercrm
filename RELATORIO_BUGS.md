# Relatório de Bugs — Bloco 1

**Projeto:** Lider CRM / merged_clean  
**Data:** 2026-07-24  
**Escopo desta entrega:** auditoria estática técnica, correções aplicadas diretamente no código, validações locais e empacotamento final desta rodada.  
**Fora do escopo nesta entrega:** QA E2E real com 5/20/100 usuários simultâneos, porque essa etapa depende de ambiente integrado (Worker/API + Supabase + credenciais B2) e foi explicitamente adiada para a próxima rodada.

---

## 1) Correções aplicadas por arquivo

### `src/shared/permissions/access-control.js`

**Linhas relevantes:** 53-89, 100-109  
**Problema:** a checagem de orientador estava desalinhada com a hierarquia real do projeto. O comportamento corrigido nesta base garante que o cargo textual seja lido de forma consistente (`cargo`, `role` ou `papel`), que admin/admExtra não recebam a regra errada de orientador e que cadastros legados com `orientadosIds` continuem funcionando.

**Correção aplicada:**
- centralização da leitura do cargo em `getCargoTexto(user)`;
- `hasOrientadorAccess()` passou a identificar corretamente `orientador`, bloquear `supervisor`/admin nessa regra específica e aceitar fallback por `orientadosIds` quando o cadastro estiver incompleto;
- `filterItemsForOrientador()` ficou condicionado ao usuário realmente ser orientador, evitando filtragem indevida para outros perfis.

**Por que a solução é tecnicamente correta:** ela corrige a causa raiz da divergência de permissão, em vez de apenas mascarar o sintoma. O módulo agora usa a mesma fonte de verdade textual para todas as decisões relacionadas ao cargo.

---

### `js/chat.js`

#### 1. Modal “Novo Grupo” com handlers quebrados

**Linhas relevantes:** 1413-1466  
**Problema:** o modal de criação de grupo renderizava controles com `onchange="chatToggleGroupMember(...)"` e `onclick="chatCreateGroupFromModal()"`, mas essas funções não existiam. Na prática, selecionar participantes e clicar em **Criar grupo** quebrava o fluxo do chat.

**Correção aplicada:**
- implementação de `chatToggleGroupMember(uid, checked)`;
- implementação de `chatCreateGroupFromModal()` com validação de sessão, privilégio admin, nome do grupo e quantidade mínima de participantes;
- persistência da conversa criada, mensagem inicial de sistema e abertura imediata do grupo recém-criado.

**Por que a solução é tecnicamente correta:** o bug estava na falta do código chamado pelo HTML já existente. A correção preserva a estrutura original do modal e restaura o fluxo esperado sem reescrever o componente.

#### 2. Criação de grupo montando participantes de forma errada

**Linhas relevantes:** 511-553  
**Problema:** `_chatGetOrCreateConv(otherUid, isGroup, groupName)` tratava grupo como se houvesse apenas um `otherUid`, montando `participants` com um único valor adicional. Isso entrava em conflito com o próprio modal de grupo, que permite múltiplos participantes.

**Correção aplicada:**
- `_chatGetOrCreateConv()` passou a aceitar array quando `isGroup === true`;
- normalização correta de participantes via `_chatNormalizeParticipants()`;
- gravação de `admins` e `createdBy` já no momento da criação do grupo.

**Por que a solução é tecnicamente correta:** a estrutura de dados agora corresponde ao contrato implícito da interface. O backend/local storage deixa de receber um grupo estruturalmente incompleto.

#### 3. Metadados de grupo se perdiam na sincronização entre dispositivos

**Linhas relevantes:** 1641-1655 e payload em `_chatSyncMsg()`  
**Problema:** a sincronização de conversa enviava `isGroup`, `name`, `participants` e `participantNames`, mas não enviava `admins` nem `createdBy`. Com isso, em sincronização remota/inbox, um grupo podia reaparecer sem a informação de administração, afetando recursos como “Adicionar participante” e consistência entre abas/dispositivos.

**Correção aplicada:**
- inclusão de `admins` e `createdBy` no índice de inbox (`_chatSyncConvIndex`);
- inclusão de `admins` e `createdBy` no payload da conversa sincronizada em `_chatSyncMsg()`.

**Por que a solução é tecnicamente correta:** a conversa em nuvem passa a carregar o conjunto mínimo de metadados necessário para reconstituir corretamente o grupo em outro cliente, preservando permissões e contexto.

---


### `js/auth.js`

#### Logout local não encerrava sessão do Worker nem limpava fila persistente

**Linhas relevantes:** 262-303  
**Problema:** o fluxo visual de logout chamava apenas `_execLogout()` a partir de `doLogout()`. Isso removia `lf6_s`, mas não fazia `workerClient.logout()` nem limpava `lidercrm_worker_jwt_v1`, `lf_retry_q_v1`, `lidercrm_retry_queue_v1` e `lidercrm_dlq_v1`. Na prática, outro login no mesmo aparelho podia herdar estado autenticado do Worker e operações pendentes da sessão anterior, criando risco de sincronização indevida e vazamento cross-tenant por reuso de contexto local.

**Correção aplicada:**
- `doLogout()` agora tenta executar `workerClient.logout()` antes de concluir o logout visual;
- `_execLogout()` passou a limpar explicitamente a sessão JWT do Worker;
- limpeza das filas persistentes e DLQ locais no logout.

**Por que a solução é tecnicamente correta:** o bug estava na assimetria entre sessão legada e sessão do Worker. O logout agora encerra as duas camadas e remove intents persistidas da sessão anterior, evitando reaproveitamento indevido entre contas no mesmo dispositivo.

---

### `js/app.js`

#### Ausência de propagação entre abas para mudanças locais críticas

**Linhas relevantes:** 100-129, 445-449  
**Problema:** a aplicação dependia de `online`, `visibilitychange` e `pageshow`, mas não tinha listener de `storage`. Com isso, alterações feitas em outra aba — como logout, atualização de kanban, clientes, agenda, chat e preferências compartilhadas — não eram refletidas rapidamente na aba atual. O cenário era especialmente grave no logout: uma aba podia sair e a outra continuar visualmente ativa.

**Correção aplicada:**
- criação de `_lfHandleCrossTabStorage(ev)` para reagir a mudanças relevantes no `localStorage`;
- atualização cross-tab para kanban, dashboard/clientes, chat e agenda;
- logout local automático quando `lf6_s` ou `lidercrm_worker_jwt_v1` são removidos em outra aba;
- `_lfSoftResumeSync()` agora também drena o `window.SyncManager` legado.

**Por que a solução é tecnicamente correta:** em aplicações SPA com cache local, `storage` é o canal mínimo confiável para sincronismo entre abas quando não há BroadcastChannel próprio. A correção trata tanto atualização de estado quanto invalidação de sessão, reduzindo divergência entre clientes do mesmo usuário.

---

### `src/core/offline/retry-queue.js`

#### Fila offline "nova" ficava stale entre abas

**Linhas relevantes:** 14-18, 51-56, 71-85  
**Problema:** `offline.retryQueue` carregava os itens do `localStorage` só na inicialização. Se outra aba enfileirasse ou consumisse operações, a instância atual continuava com snapshot stale em memória. Isso podia esconder pendências, duplicar tentativas ou atrasar reenvio de ações do kanban que usam essa fila.

**Correção aplicada:**
- criação de `_syncFromStorage()`;
- `list()`, `size()` e `due()` agora recarregam o estado persistido antes de operar;
- listener de `storage` para atualizar a fila em memória e notificar assinantes.

**Por que a solução é tecnicamente correta:** a fonte de verdade da fila é persistida em `localStorage`; portanto a instância em memória precisa se reconciliar quando outra aba grava nessa mesma chave.

---

### `src/modules/sync/runtime/retry-queue-sync.js`

#### RetryQueue legado também mantinha snapshot desatualizado entre abas

**Linhas relevantes:** 91-121, 170-178, 457-463  
**Problema:** a fila global `lf_retry_q_v1`, usada por agenda e sincronizações legadas, só lia `_q` no boot do script. Em multiaba, uma aba podia drenar ou enfileirar operações sem que a outra percebesse. O efeito era exatamente o tipo de divergência do cenário “Sync entre Abas/Dispositivos”: HUD de sync incorreto, drain incompleto e reexecução fora de ordem.

**Correção aplicada:**
- criação de `_reloadQ()`;
- `list()`, `pending()`, `_raw()` e `SyncManager_drain()` agora recarregam a fila persistida antes de decidir o que fazer;
- listener de `storage` para repintar o HUD e sincronizar `_q` quando a chave muda em outra aba.

**Por que a solução é tecnicamente correta:** elimina a dependência de snapshot antigo em memória e faz o comportamento multiaba convergir para a fila persistida real.

---
### `app.html`

#### Divergência de versionamento entre web e app na agenda

**Linhas relevantes:** 248-251  
**Problema:** o app Capacitor apontava para versões antigas de cache-busting em `src/modules/agenda/runtime/activities-store.js` e `js/agenda.js`, enquanto `index.html` já referenciava versões mais novas. Isso criava risco real de o app continuar carregando JS antigo da agenda mesmo após correções já presentes na versão web.

**Correção aplicada:**
- alinhamento dos query params de `activities-store.js` e `agenda.js` em `app.html` com os mesmos valores usados por `index.html`.

**Por que a solução é tecnicamente correta:** em aplicações empacotadas/webview, divergência de versionamento entre entrypoints é uma causa clássica de comportamento inconsistente. O ajuste reduz a chance de cache antigo manter bugs já resolvidos somente no app.

---

## 2) Bugs visuais / sobreposição / fixação

Nesta rodada, não foi aplicada correção visual estrutural nova. Ainda assim, a auditoria estática executada não encontrou IDs duplicados em `index.html` nem em `app.html`, o que reduz risco de conflito de binding, foco e modal stacking. O foco desta entrega ficou nos bugs funcionais e de consistência que bloqueavam fluxo e sincronização.

---

## 3) Integração com Capacitor / comportamento cross-device

A correção de `app.html` entra diretamente nesta categoria, porque ataca divergência entre a camada web e a camada empacotada via Capacitor. Também entra aqui o endurecimento do chat em relação a `admins`/`createdBy`, já que isso afeta sincronização entre abas/aparelhos e reconstrução correta do estado do grupo em outro cliente.

Nesta rodada também entraram correções específicas de consistência multiaba/multissessão:
- logout agora encerra a sessão do Worker e limpa filas persistentes locais;
- mudanças críticas em `localStorage` passaram a propagar atualização/logout entre abas;
- as duas implementações de retry queue passaram a recarregar o estado persistido antes de drenar/listar, reduzindo divergência entre abas e webview.

---

## 4) Limpeza de código / arquivos obsoletos

Nenhum arquivo foi removido nesta rodada.

A decisão foi proposital: embora existam comentários históricos de patches e merges no projeto, não houve remoção sem uma varredura de referências ativa dedicada exclusivamente à faxina. Como a regra do escopo exige certeza de ausência de referência antes de excluir, os resíduos foram preservados nesta entrega para não introduzir regressões desnecessárias.

---

## 5) Validações executadas após as correções

### Validação de permissões
Script executado com sucesso:
- `npm run validate:permissions`

Resultados confirmados:
- orientador textual recebe acesso;
- supervisor não recebe acesso de orientador;
- consultor não recebe acesso de orientador;
- admin não recebe acesso de orientador;
- filtro do orientador restringe corretamente à própria carteira + orientados;
- não-orientador não sofre filtro indevido.

### Validação de arquitetura
Script executado com sucesso:
- `npm run validate:architecture`

Resultados confirmados:
- wiring de runtime compartilhado, permissões e navegação em `index.html` e `app.html`;
- delegação de runtime/permissões em `app.js` e `auth.js`;
- scripts de auditoria expostos no `package.json`.

### Auditoria estática complementar
Também foram executadas verificações adicionais com sucesso:
- `node --check` em todos os arquivos JS do projeto;
- varredura de handlers inline sem definição pendente;
- checagem de referências HTML quebradas;
- checagem de IDs duplicados em `index.html` e `app.html`.

---

## 6) Arquivos alterados nesta entrega

- `src/shared/permissions/access-control.js`
- `js/chat.js`
- `app.html`
- `js/auth.js`
- `js/app.js`
- `src/core/offline/retry-queue.js`
- `src/modules/sync/runtime/retry-queue-sync.js`
- `RELATORIO_BUGS.md`

---

## 7) Próxima etapa recomendada

A próxima rodada deve subir o ambiente integrado e executar QA E2E real com concorrência, concentrando a bateria em:
- login concorrente;
- chat em paralelo;
- criação/edição de leads;
- agenda com conflito;
- uploads grandes;
- sincronização entre abas/dispositivos.

Bateria mínima recomendada para validar as correções desta rodada:
1. abrir duas abas com o mesmo usuário; alterar kanban/clientes/chat/agenda em uma e validar reflexo na outra;
2. fazer logout em uma aba e confirmar retorno imediato à tela de login na outra;
3. simular falha de rede numa aba, enfileirar operações, restaurar conexão e validar drain sem duplicidade em ambas;
4. repetir o fluxo em webview Capacitor com app em foreground/background.

Essa etapa é a mais adequada para confirmar se ainda existem problemas de corrida, perda de sincronização, conflito de gravação e timeout sob carga.
