# Relatório Final — Reconstrução do LiderCRM

> Base: cópia do CRM antigo (estável), com as melhorias reais do CRM
> atual portadas de forma **nativa** — direto no código-fonte, não como
> mais uma camada de patch por fora. Nenhum patch existente do antigo
> foi removido ou alterado. Tudo validado com `node --check` em todos os
> arquivos `.js` e com a suíte de testes automatizados do projeto
> (43/43 passando do início ao fim do trabalho).

## Como usar este pacote

1. `js/*.js`, `js/patches/**/*.js`, `index.html`, `app.html` etc. na
   raiz são o código-fonte — é isso que foi editado.
2. `android/` e `ios/` estão como vieram do antigo (não foram
   sincronizados manualmente). Antes de gerar um build mobile, rode
   `npm install` e depois `npm run cap:sync` (ou
   `cap:sync:android`/`cap:sync:ios`) pra propagar as mudanças de
   `js/`/`css/`/HTML pra dentro deles — é o fluxo normal do projeto,
   não uma mudança que eu fiz.
3. `npm test` roda a suíte de 43 testes (`vitest`) que já vinha do
   projeto.

## O que foi corrigido, por módulo

### Kanban
- Setas `<` `>` de scroll: trocado `setInterval` por
  `requestAnimationFrame` (mesmo comportamento, não trava aba em 2º
  plano).
- Etapa "Livre": card com timestamp legado muito velho não é mais
  varrido na hora — precisa dos 3 dias de graça normais (bug latente
  que já existia no antigo).
- Scroll voltando ao topo ao converter Lead→Negócio, reverter ou
  excluir (antes só "mover card" tinha proteção).
- Dropdown "novo responsável" vazio pro supervisor: revalida uma vez
  em segundo plano ao abrir o painel.
- Menu de contexto (⋮) do card não fechava no toque fora em
  Android/iOS — listener persistente substitui o antigo, que se
  autorremovia.
- Filtro "Atrasadas" do Dashboard: passou a consultar a store central
  de atividades (mesma fonte que o Kanban já usava), não só o espelho
  legado do card.

### Agenda / Bingo
- Índice de etapa do Bingo agora cobre todos os donos visíveis
  (supervisor/ADM), não só o usuário logado — sem isso, um card
  transferido de responsável "confundia" o Bingo.
- Exclusão de cliente do Bingo agora "gruda" de verdade nesse mesmo
  cenário (achava o card no dono certo antes de gravar a lápide).
- Exclusão do Bingo agora sincroniza com a nuvem (antes só existia no
  aparelho onde você excluiu — reaparecia em outro dispositivo).
- Cache de 800ms no índice acima — sem isso, um ADM com muitos
  usuários sentiria lentidão ao digitar na busca (achado e corrigido
  durante o próprio trabalho, com evidência de um caso real de
  travamento total no CRM atual causado exatamente por esse padrão sem
  cache).

### Chat
- Apagar uma mensagem não apaga mais ela do chat da outra pessoa
  (bug confirmado: o documento compartilhado da conversa era
  sobrescrito inteiro; agora mescla com o servidor antes de subir).
- Throttle na consulta de "quem está online" — tinha 5+ gatilhos sem
  limite nenhum, podia estourar limite de requisições do servidor.

### Usuários / Auth
- Restauração de sessão (`_restoreRemoteSync`) agora espera o token
  ficar pronto antes de buscar a lista de usuários na nuvem — usa o
  mesmo mecanismo que o antigo já tinha para outras telas. Sem isso,
  um usuário cadastrado em outro aparelho podia não aparecer até
  alguém mais logar naquele celular.

### Notificações
- Pontinho vermelho falso na aba Agenda: agora filtra por dono da
  atividade e usa o mesmo interpretador de data do resto do app.

### Dashboard / Analytics
- Métricas "Compareceu" e "Fichas" somem do funil assim que o
  Negócio avança de etapa — estendido o mesmo padrão de reconciliação
  via Kanban que "Fechamentos" já usava (nada novo, só aplicado onde
  faltava).

## O que foi conscientemente descartado (e por quê)

Vários patches do CRM atual existem só para consertar dano causado por
**outros** patches do próprio atual — não fazem sentido numa base que
nunca teve o problema original:

- Toda a cadeia de brigas entre versões de scroll por roda do mouse
  (o antigo nunca teve esse bug: usa scroll nativo do navegador).
- `kb-429-zombie-final` e a cadeia `adm-login-travado` v1→v6: existem
  pra remendar o excesso de tráfego e os "uids órfãos" causados por
  features que não portei (sincronia em tempo real do Kanban, ADM com
  escopo "todos" varrendo tudo sem cache).
- A versão frágil (monkey-patch) do fix de exclusão cross-owner do
  Bingo — reimplementei o mesmo resultado direto no código-fonte,
  sem o padrão que causou um travamento documentado do CRM pra login
  de ADM.
- Toda a cadeia de "header/input fixo" do chat mobile — feature nova
  que o antigo não tem; os outros 3 patches da mesma leva só existem
  pra consertar bugs que ela mesma introduziu.
- Polish visual (ripple, indicador deslizante) — cosmético, não é bug.

## Pendências que precisam de ambiente de teste (não fiz sem poder testar)

Estas mudam comportamento do **servidor/Worker**, não só do app — não
arrisquei sem conseguir validar contra um Supabase/Cloudflare de
verdade:

1. **Etapa "Livre" entre dispositivos** — precisa de um endpoint novo
   no Worker (`/api/v1/cron/kanban-livre-sweep`) que o antigo não tem.
2. **Exclusão global de mensagem de chat** ("apagar dos dois lados")
   — precisa mudar a lógica de merge do `putUsuarioConfig` no Worker,
   que hoje só sobrescreve. Usada por várias outras telas, não só
   chat — mudança de alto risco sem staging.

## Decisão de política que não tomei por você

O CRM atual removeu (07/08) a opção de dar acesso ADM por checkbox
manual — hoje só dá por departamento. Isso é mudança de regra de
permissão, não correção de bug. Mantive o antigo como está (checkbox
continua funcionando) até você decidir explicitamente se quer essa
mudança.

## Achados e correções — segunda leva (16/08, sessão de bugs reportados)

Depois da entrega inicial, você reportou uma lista de ajustes com base no
uso real. Aqui está o que mudou nesta leva:

### Notificações
- Pontinho vermelho da **Agenda** removido — não notifica mais atividade
  atrasada por ali.
- Pontinho vermelho adicionado nas abas **Leads** e **Negócios** — acende
  quando existe, agora, atividade sua não concluída e vencida vinculada a
  um card daquele board.

### Bug grave achado e corrigido: itens excluídos "ressuscitando"
A função de merge com o servidor (`_mergeKeepLocalOnly`, compartilhada
entre Clientes/Bingo e Kanban) não tinha noção nenhuma de exclusão. Se
uma busca de rede que já estava em andamento *antes* de você excluir
algo respondesse *depois*, ela trazia o item de volta — e pior, **regravava
isso no servidor**, tornando a "ressurreição" permanente até excluir de
novo (e vulnerável à mesma corrida outra vez). Corrigido na fonte com um
registro de "excluído recentemente" (TTL 5 min) que protege os dois casos
de uma vez.

### Analytics
- Aba **Dicionário** removida por completo (nav principal, menu mobile,
  seção da página) — inclusive um botão sobrando na barra principal que
  não tinha sido pego na limpeza inicial.
- Seção **Metas** removida do Analytics (dashboard geral e Time/Equipe).

### Card do Kanban
- Botão **Lembrete** agora fica vermelho somente quando existe atraso
  *neste momento* — deixa de ficar vermelho sozinho assim que a atividade
  é concluída ou reagendada pra frente, sem precisar reabrir o card.
- Removido o relojinho/sino pequeno que aparecia no card quando havia
  atividade vinculada — o botão Lembrete vermelho basta sozinho.

### Navegação por URL (o pedido "tipo Facebook")
- Abas viraram links `<a href="/agenda">` de verdade — clique normal
  navega na hora sem reload; botão direito/botão do meio/Ctrl+clique
  passam a ser o **navegador tratando nativamente** "abrir em nova guia".
- Barra de endereço reflete a aba atual (`/agenda`, `/leads` etc.), com
  Voltar/Avançar do navegador funcionando.
- Abertura instantânea: cada aba já gravava seu estado (filtros, conversa
  aberta) a cada navegação — só não estava sendo lido por abas novas.
  Agora é, então uma aba aberta por botão direito abre já com esse
  estado, sem esperar boot frio.
- Só ativo na Web — o app nativo (Android/iOS) continua navegando por
  dentro do app, sem tocar na URL.

## Achado, mas não confirmado no antigo

O atual tem um fix pras sub-abas do Dashboard (Agendados/Atendimentos/
Remarcar/No-Show) não responderem ao clique. A causa que ele aponta
depende de uma infraestrutura de limpeza de overlay que o antigo nem
tem — não achei evidência de que esse bug específico exista aqui. Se
aparecer no seu teste, é o primeiro lugar a olhar.

## Terceira leva (17/08) — sincronia sem relogar + tela de usuários

### Sincronia entre usuários (o pedido de não precisar mais logar de novo)

Achado importante: o Kanban de **Leads** já tinha, desde o antigo, um
mecanismo que busca o time inteiro do supervisor direto do servidor —
usando uma permissão que o servidor já concede a supervisor/gerente.
Estava restrito à aba Leads.

- Estendido pra **Negócios** também.
- Atualização automática ao **voltar de segundo plano** (trocar de app,
  focar a aba de novo) — antes só Bingo/notificações faziam isso.
- Atualização a cada 45s enquanto a pessoa está parada em Leads/Negócios.

**Etapa "Livre" entre consultores comuns** (a parte que precisava de
mudança no servidor): antes, um consultor comum só via/pegava leads
livres que já estivessem, por acaso, em cache local do próprio aparelho
— o servidor bloqueava a leitura cross-owner de propósito pra qualquer
papel abaixo de supervisor. Implementado:

- `GET /api/v1/kanban/livre-pool` — devolve só os cards em 'livre' de
  todos os usuários ativos, sem exigir capacidade especial. Nunca expõe
  o resto da lista de ninguém.
- `POST /api/v1/kanban/livre-claim` — operação atômica: o servidor lê o
  board de origem só internamente, confirma que o lead ainda está livre
  agora, move pra conta de quem pediu (sempre a própria conta, nunca em
  nome de outra pessoa) e grava os dois lados numa tacada. O cliente
  nunca recebe a lista alheia inteira.
- `assumeLead()` (botão "Assumir Lead") reescrita pra usar esse endpoint
  — funciona agora pra qualquer cargo, não só supervisor/ADM.

### Tela de usuários — remodelada pra escalar até ~100

As 3 barras "Ver:" que existiam (Leads, Negócios, Time) mostravam 1 balão
por usuário ativo — organizável com poucos usuários, mas vira uma fileira
enorme e desorganizada com dezenas/100. Substituído por:

- Balão **"Seus"** — só os cards/métricas do próprio usuário.
- Balão único **"Usuários"** — abre um menu com "Ver todos" no topo e a
  lista de usuários abaixo, **com rolagem própria e altura máxima fixa**
  (nunca estoura a tela, por maior que seja a equipe).
- Componente único e reutilizado nas 3 barras (mesmo código, sem
  duplicação) — qualquer ajuste futuro vale pras 3 de uma vez.

## Pendência de deploy nesta leva

Esta leva inclui **mudanças de servidor** (`_worker_src/`) além do
front. Diferente das levas anteriores (só front, `npm run cap:sync` já
bastava), agora é necessário também publicar o Worker/Cloudflare Pages
Functions atualizado — sem isso, os endpoints novos (`/kanban/livre-pool`,
`/kanban/livre-claim`) não vão existir em produção e "Assumir Lead"
continuará falhando pra consultor comum.

## Quarta leva (17/08) — Livre por departamento, filtro de usuário, importação em lote em Negócios

### Pool "Livre" corrigido para ser por departamento (não mais empresa toda)
A leva anterior tinha implementado o pool "Livre" como compartilhado pra
empresa inteira. Corrigido pra respeitar departamento:
- ADM/gerente (escopo global) continua vendo tudo, sem restrição.
- Qualquer outro cargo: só vê/reivindica leads livres do próprio
  departamento (resolvido via team_id -> teams.departamento_id, cobrindo
  o caso de departamento com várias teams).
- **Bug real corrigido nessa checagem**: a função estava usando o UUID
  interno do usuário em vez do id usado pelo Kanban — o pool teria
  voltado sempre vazio pra todo mundo. Pego antes de ir pra produção.

### Filtro por usuário na busca avançada (ícone de lupa)
Novo campo "Usuário" no filtro avançado de Leads/Negócios, com a mesma
régua de departamento: ADM vê todos, supervisor vê o time, consultor
comum vê o departamento. Quem não tem permissão de ver o board alheio
só filtra e enxerga os leads **Livres** da pessoa escolhida — não a
lista inteira dela (a lista já vem assim corretamente recortada pela
própria fonte de dados; o filtro só recorta por dono em cima do que já
é visível).

### Importação em lote — agora também em Negócios
Botão "📋 Importar em lote" replicado na aba Negócios, mesmo fluxo já
usado em Leads (colar lista de nomes/telefones, checagem de duplicados,
escolher responsável e etapa inicial). Registros criados como Negócio
de verdade (com campo de valor, sem `originalLeadId`), não como Lead
disfarçado.

## Quinta leva (17/08) — calibração de métricas + responsável por departamento

### Métricas do Analytics calibradas
Mesmo padrão de reconciliação já usado pra Compareceu/Fichas/Fechamentos,
agora também pra **Agendado** (a base de todo o funil e denominador da
Taxa). Causa raiz confirmada: clientes migrados do CRM antigo (Bitrix)
foram colocados direto na etapa Vídeo/Loja do Kanban de Negócios, sem
passar pelas etapas normais — por isso "Compareceu" contava esses
registros mas "Agendado" não, gerando percentuais acima de 100%
(314% no caso relatado). Agora qualquer negócio fora da etapa inicial
"Retornar" conta como agendado (inclusive No-Show e Reagendar — se
chegou a essas etapas, foi agendado antes).

### "Alterar responsável" — lista de usuários agora respeita departamento
A lista de "novo responsável" (painel de troca de responsável/etapa no
detalhe do card) usava `getUsers()` puro, sem filtro de departamento
nenhum. Corrigido pra reaproveitar a mesma função já usada no filtro de
busca (`_lfKBAdvFilterUsers`): ADM/gerente vê todos, supervisor vê o
time, consultor comum vê só o próprio departamento. O dono atual do card
sempre aparece na lista, mesmo se estiver fora do escopo por algum
motivo histórico — evita perder a seleção ao abrir o painel.

## Sexta leva (17/08) — limpeza de UI e botão concluir atividade

### Botão "Concluir atividade"
Adicionado ao lado de "Editar atividade" no painel de lembrete (card
Lead/Negócio e modal de adicionar lembrete). Reaproveita `actConfirmDone`,
já existente — marca concluída, propaga pro espelho legado no card,
atualiza badge e repinta o próprio painel na hora.

### "Atrasadas" removido do Bingo
Removido de forma limpa: botão no HTML (dois arquivos), função
`toggleLateFilter`, variável `_fltLate` e toda a persistência de estado
(local + cross-tab em `supabase.js`). Os filtros "Atrasadas" de Leads e
Negócios (Kanban) **não foram tocados** — são independentes.

### "Movimentações da equipe/departamento" (ADM e Time)
- Busca por texto (lupa) removida.
- Filtros de canal (Todas/Ligação/WhatsApp/Ambos) removidos.
- Filtro "Todos os usuários": trocado o `<select>` nativo pelo mesmo
  componente "balão + menu rolável" já usado nas barras "Ver:" do
  Kanban — altura máxima fixa com rolagem interna, não estoura a tela
  mesmo com dezenas de usuários.

Leva só de front-end — não mexe em `_worker_src/`, não precisa publicar
o Worker de novo.

## Sétima leva (17/08) — contador de ligações, auto-mover Livre, boot instantâneo

### Contador de ligações — reescrito nativamente
Absorvido de dentro do patch externo (`lf-lig-counter-rounds-v1`, removido
por ser redundante agora) direto pra `js/agenda.js`:
- **Bug corrigido**: o widget fechava ao tocar em qualquer número. Causa:
  cada toque recriava os 10 botões do zero, soltando o botão clicado do
  documento; o listener de "fechar ao clicar fora" via isso como clique
  de fora. Agora os botões são criados uma vez, só as classes mudam.
- **Bingo automático**: ao completar 10, mostra "BINGO!" e reinicia a
  rodada visível sozinho — botão "Reiniciar" removido (não existe mais).
- **Grava no feed do ADM** com a duração da 1ª à 10ª ligação.
- Painel "Ligações por Consultor" (ADM/Time): horários de cada marcação
  agora visíveis como texto (antes só em tooltip), mais total de bingos
  do dia. Resumo (Somatória/Média/Meta) fixo no topo; lista de
  consultores com rolagem própria — não empurra mais nada pra baixo
  conforme mais gente é cadastrada.

### Novo toggle: auto-mover lead parado (3 dias) para Livre
Em Configurações, logo abaixo de Automação de Lembretes — liga/desliga
por usuário. Ambos os toggles (lembrete + este novo) agora geram evento
no feed do ADM quando alterados.

### Boot mais rápido ao abrir em nova guia
A splash de carregamento só escondia depois do round-trip completo de
conexão com o servidor (+ 500ms de propósito), mesmo quando o aparelho
já tinha sessão válida e conexão recente (cache de 30min). Agora, com os
dois sinais presentes, a interface aparece quase na hora — a conexão de
verdade continua em segundo plano exatamente como antes (mesmo
fallback gracioso que já existia pra rede lenta/offline).

Leva só de front-end — não mexe em `_worker_src/`.

## Oitava leva (17/08) — atualização automática após deploy + correção crítica de cache

### 🚨 Achado crítico, corrigido nesta leva
Os arquivos que venho editando desde o início deste trabalho (`kanban.js`,
`agenda.js`, `relatorios.js`, `app.js`, `dashboard.js`, `clientes.js`,
`chat.js`, `notificacoes.js`, `supabase.js`, `utils.js`, os módulos em
`src/modules/**`, `css/style.css` e 2 patches) têm cache de **1 ano,
imutável** no Cloudflare Pages (`Cache-Control: public, max-age=31536000,
immutable`) — e a versão na tag `<script>`/`<link>` desses arquivos
**nunca tinha sido atualizada**. Na prática, qualquer navegador que já
tivesse aberto o CRM antes desta leva **nunca veria nenhuma das
correções feitas até aqui** — ficaria preso na versão antiga
indefinidamente, mesmo com F5. Corrigido: todas as 17 referências foram
atualizadas para uma versão nova (`20260817rebuild1`) nos dois arquivos
HTML.

### Verificação automática de nova versão (o que você pediu)
- **Marcador de build inline** (`<meta name="lf-build-id">`) no `<head>`
  de `index.html`/`app.html` — não é arquivo `.js` externo (esses ficam
  em cache), então esse valor está sempre atualizado a cada carregamento
  real de página (o HTML em si nunca é cacheado).
- **`js/app-update-checker.js`** (novo): verifica automaticamente a cada
  4 minutos, ao focar a aba e ao voltar de segundo plano, se o build-id
  mudou desde que a aba abriu. Se mudou: avisa, espera não atrapalhar
  nada que esteja aberto na tela (modal aberto) e recarrega de verdade —
  sem tocar em sessão/dados salvos, só o código.
- **Botão manual (🔄)** adicionado ao lado do sino/Atividades na barra
  superior, pra qualquer um forçar essa checagem na hora.

### Importante pra quem prepara os próximos deploys
Pra esse mecanismo continuar funcionando, o valor de
`<meta name="lf-build-id">` em `index.html` E `app.html`, junto com os
`?v=...` dos arquivos alterados naquela entrega, precisam ser
atualizados a cada deploy — mesma disciplina que já existia só pra
`js/lf-build-info.js`. Documentei isso em comentário no topo do próprio
`js/app-update-checker.js` e no `<head>` dos dois HTMLs.

Leva só de front-end — não mexe em `_worker_src/`.

## Nona leva (17/08) — sincronização Android/iOS

### Arquitetura importante de entender
O `capacitor.config.json` já tem `server.url` apontando pro site ao vivo
(`https://lidercrm.pages.dev`) — ou seja, **Android e iOS carregam o app
direto da nuvem**, igual a um navegador, não uma cópia fixa embutida no
APK/IPA. Na prática, isso já garante sozinho:
- **Mesma nuvem e funções** entre PC/Android/iOS — os 3 falam com o
  mesmo Supabase + Worker, não existe "backend separado pra mobile".
- **Editar no celular aparece no PC** (e vice-versa) — já é o
  comportamento natural de qualquer tela conectada à mesma nuvem, reforçado
  por tudo que já foi implementado nas levas anteriores (sincronia sem
  precisar relogar, feed de movimentações, etc.).

O que a sincronização Capacitor atualiza é a **cópia offline embutida**
no app (usada como reserva se a rede não estiver disponível no
primeiro carregamento) — não é o canal principal de atualização, que já
é automático via `server.url`.

### O que foi feito
Rodei o processo real (não só documentado): `npm install`, `npm run
cap:www` (monta a pasta `www/` só com o que o front-end carrega — HTML,
css/js/src/assets, sem node_modules/backend/docs internos) e `npx cap
sync android` + `npx cap sync ios`. Confirmei depois, arquivo por
arquivo, que o conteúdo copiado pra dentro de
`android/app/src/main/assets/public/` e `ios/App/App/public/` é
idêntico ao código-fonte atual (incluindo o `lf-build-id` mais recente e
os `?v=` corrigidos da leva anterior), com sintaxe validada nos dois.

### O que NÃO mudou (config nativa)
6 plugins Capacitor detectados e já presentes nas duas plataformas —
nenhuma mudança de permissão/plugin nativo foi necessária nesta leva
(nenhuma das correções recentes mexeu em câmera, notificações push,
etc.).
