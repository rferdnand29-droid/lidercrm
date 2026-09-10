# RELATÓRIO ÚNICO — Resposta ao relatório de 17 itens (20/08/2026)

Este relatório documenta a investigação e correção de cada item do
documento enviado. Sem exceção, todo item foi ou (a) corrigido com
causa raiz identificada, (b) investigado e descartado com evidência, ou
(c) investigado e devolvido pra decisão sua antes de agir (2 casos:
nova dependência, e uma limitação estrutural conhecida).

---

## 🔴 PRIORIDADE CRÍTICA — DADOS, ATIVIDADES E MÉTRICAS

### 1. Ligações de dias anteriores não contabilizadas — ✅ corrigido

**Causa raiz:** cada dia de ligações fica numa chave própria em
armazenamento (`lf13_lig_<uid>_<data>`, tanto local quanto no servidor)
— por design, pra suportar contagem em tempo real. O painel de
Ligações (ADM e Time) sempre lia só a chave de **hoje**; não existia
tela nenhuma pra ver dias anteriores. Os dados nunca estiveram
perdidos — só nunca tinham onde aparecer.

**Correção:** adicionado um navegador de data (← dia anterior, campo
de data, → dia seguinte, botão "Hoje") nos dois painéis de Ligações.
Criada uma função de leitura nova (`getLigForDate`) parametrizada por
data, ao lado da existente `getLigToday` — **nenhuma mudança em como
os dados são gravados**, só uma leitura a mais do que já existe.
"Meta Diária"/"Média por Hora" (conceitos de "ritmo do dia em
andamento") só aparecem pra hoje; dias passados mostram total e média
por consultor.

**Arquivos:** `src/modules/agenda/runtime/ligacoes-store.js`,
`js/agenda.js`, `js/relatorios.js`, `index.html`, `app.html`.

---

### 2. Atividade do cliente Júlio aparece como atrasada indevidamente — 🔶 investigado, preciso da sua confirmação

Não achei bug mecânico no código de criação/leitura de data para o
fluxo direto de agendamento — parece correto para uso no mesmo fuso
horário (o campo vem de um `<input type="datetime-local">` e é lido
sempre do mesmo jeito, sem conversão dupla).

**Hipótese mais forte:** o sistema grava o horário como texto "sem
fuso" (ex.: `2026-08-20T14:30`, sem indicar UTC ou offset). Cada tela
que lê esse texto reinterpreta os mesmos números **no fuso horário de
quem está olhando**. Se o Júlio e o supervisor estiverem em fusos
diferentes (times em Amazonas/Acre vs. o resto do Brasil, por exemplo,
ou só o relógio de um aparelho configurado errado), o mesmo horário
"significa" instantes diferentes pra cada um — explicando por que
aparece atrasado pra um e não pro outro.

**Preciso de você:** Júlio e o supervisor usam aparelhos/locais em
fusos diferentes? Se sim, essa é quase certamente a causa, e a
correção completa (gravar sempre em UTC + converter só na exibição)
é uma mudança estrutural que prefiro fazer com essa confirmação em
mãos, pra não reformar uma arquitetura sem necessidade.

Independente da causa exata, a correção do item 3 (atividades órfãs)
também se aplica aqui e pode já ter resolvido o caso do Júlio, se o
card dele também estava descartado/excluído.

---

### 3. Lead inexistente "Léo" aparecendo como atividade atrasada — ✅ corrigido

**Causa raiz:** já existia uma proteção contra "atividade órfã" (card
excluído/descartado que continua com atividade pendente "fantasma"),
mas só no painel de Atividades do ADM/Time — o sino de notificações,
o alarme sonoro, o contador do sino e o card "Atividades Pendentes"
do dashboard mobile nunca tinham essa proteção.

**Correção:** criada uma função compartilhada
(`_isActivityOrphanOrInactive`, `js/utils.js`) e aplicada em **todos**
os lugares que calculam "atrasada"/"pendente": `renderActPanel`
(sino), `checkUpcomingActs` (dispara o alarme), `updateActBadge`
(contador do sino), KPI "Atividades Pendentes" do dashboard mobile.
Card excluído ou em etapa terminal (descartado/fechado/convertido)
nunca mais conta como pendência em lugar nenhum do app.

**Arquivos:** `js/utils.js`, `js/agenda.js`, `js/dashboard.js`.

---

## 🟠 PRIORIDADE ALTA — AGENDAMENTOS E ANALYTICS

### 4, 5 e 6. Lógica de agendamentos e métricas por data de movimentação — ✅ corrigido

**Causa raiz (as três estão amarradas na mesma causa):** cards de
Negócios nunca registravam **quando** entraram na etapa atual — só
Leads tinha esse campo (`stageEnteredAt`). As métricas do Analytics
("Agendado", "Compareceu", "Ficha", "Fechamento" por período) caíam
pra `updatedAt` — a data da **última edição do card por qualquer
motivo**, não da mudança de etapa especificamente. Um negócio agendado
dia 20 que recebe uma observação nova dia 25 "virava" Agendado do dia
25 nas métricas, exatamente o problema descrito.

**Correção:** Negócios agora registra `stageEnteredAt` nos mesmos 3
pontos onde a etapa muda (mover no board, editar pelo modal, criar já
numa etapa específica) — mesmo mecanismo que Leads já tinha. As 4
funções de métrica do Analytics (`_countAgendadoNegocios`,
`_countClosedNegocios`, `_countAtendidoNegocios`, `_countFichaNegocios`)
passam a preferir esse campo, só caindo pra `updatedAt` como último
recurso (cards antigos, migrados antes desta correção).

**Limitação conhecida, registrada por transparência:** pra métricas
que checam um GRUPO de etapas (ex.: "Compareceu" conta qualquer etapa
a partir de Vídeo/Loja), `stageEnteredAt` reflete a etapa **atual**,
não necessariamente o instante exato em que cruzou o primeiro limiar
do grupo, se o card já avançou mais. Ainda assim, é sempre mais preciso
que `updatedAt` (que não tinha relação nenhuma com troca de etapa). Uma
correção completa exigiria histórico por etapa (guardar a data de
entrada de CADA etapa, não só a atual) — um recurso maior, que não
implementei agora por ser uma extensão bem maior de escopo; posso
avaliar isso à parte se fizer diferença na prática.

**Arquivos:** `js/relatorios.js`, `js/kanban.js`, `js/dashboard.js`.

### 7. "Total" precisa ser explicado — ✅ corrigido

Renomeado para "Registros no Período" + tooltip (passar o mouse/tocar
e segurar) explicando exatamente o que cada um dos 4 cards representa.
Nenhum cálculo mudou — só o rótulo e a explicação.

**Arquivo:** `js/dashboard.js`.

---

## 🟠 PRIORIDADE ALTA — ATIVIDADES / ALARMES

### 8. Filtro "Atrasadas" fechando a janela do alarme — ✅ corrigido

**Causa raiz:** existem dois sistemas independentes de "fechar o
painel ao clicar fora" no código (um mais novo, outro mais antigo). O
botão "Atrasadas" redesenha a lista inteira ao ser clicado — isso
destrói o próprio botão (elemento HTML) que acabou de ser clicado e
cria um substituto idêntico no lugar. O sistema de fechamento mais
antigo, que roda um instante depois, checa se o elemento clicado
"ainda existe dentro" do painel — e como o botão original já não
existe mais (foi substituído por um novo), ele entende erradamente que
o clique foi "fora" do painel e fecha tudo.

**Correção:** mesma técnica que outro botão vizinho ("Concluir") já
usava pra esse exato problema — `event.stopPropagation()`.

**Arquivo:** `js/agenda.js`.

---

## 🟡 PRIORIDADE MÉDIA — INTERFACE

### 9. Fundo animado não funciona — ✅ corrigido

**Causa raiz:** uma rodada anterior de redesign visual (reskin claro
"estilo Bitrix24") escondeu o fundo animado (`#bg-orbs`) de forma
incondicional, em qualquer tema e qualquer tamanho de tela — e nunca
existiu nenhuma regra devolvendo ele quando o modo escuro está ligado.
Resultado: o fundo animado não aparecia pra ninguém, em nenhuma
situação.

**Correção:** adicionada a regra que faltava, restaurando o fundo
animado especificamente quando o tema escuro está ativo (o mesmo
padrão "aditivo" já usado pras outras cores do modo escuro).

**Arquivo:** `css/style.css`.

### 10. Foto de perfil piscando na aba Papo — ✅ corrigido

**Causa raiz:** a lista de conversas era redesenhada do zero duas
vezes seguidas ao entrar na aba — uma vez na hora (com cache), outra
logo depois que a atualização de usuários terminava. Como a lista
inteira é reconstruída a cada chamada, isso recriava **todos os
avatares** duas vezes em sequência, causando o "piscar". Isso ficou
mais perceptível depois da correção de sessão anterior que fez a
atualização de usuários buscar dado de verdade do servidor (antes ela
não fazia nada, então as duas renderizações mostravam sempre o mesmo
resultado).

**Correção:** a segunda renderização só acontece agora se os dados
realmente mudaram entre uma chamada e outra.

**Arquivo:** `js/chat.js`.

### 11. "Abrir em nova janela" abrindo na mesma janela — 🔶 investigado, preciso da sua confirmação

**Achado:** a função existe e está bem escrita (`openPageWindow`,
`js/app.js`), mas no aplicativo mobile (Capacitor) ela depende do
plugin `@capacitor/browser` pra abrir um navegador separado — e esse
plugin **nunca foi instalado** no projeto. Sem ele, o app sempre cai
no caminho reserva, que navega na tela atual em vez de abrir separado.

**Preciso de você:** corrigir isso direito no aplicativo mobile exige
adicionar essa dependência nova (`@capacitor/browser`). As regras do
projeto pedem confirmação humana antes de qualquer dependência nova —
não instalei nada ainda. Me autoriza a adicionar?

(Não achei nenhum botão atualmente conectado a esta função em nenhuma
tela — se você tem um lugar específico em mente onde esse botão deveria
aparecer, me diga também, porque a função existe mas não está
conectada a nenhuma interface no momento.)

---

## 🟡 PRIORIDADE MÉDIA — PERMISSÕES

### 12. Bingo não deve existir para cargo Administrativo — ✅ corrigido (frontend + backend)

O frontend já escondia a aba corretamente (patch de 20/08). O que
faltava, exatamente como você pediu ("não basta esconder
visualmente"): **o servidor (Worker) nunca validava isso**. O cargo
Administrativo tem permissão total (`crud`) em Negócios — e o Bingo,
tecnicamente, usa essa MESMA permissão internamente. Resultado: mesmo
com a aba escondida, uma chamada direta à API (devtools, um app
modificado, etc.) conseguia ler e escrever no Bingo normalmente.

**Correção:** adicionada uma trava específica no servidor
(`_worker_src/worker/controllers/clientes-controller.js`) que bloqueia
o cargo Administrativo em **todos** os pontos de entrada do Bingo —
listar, criar, editar, excluir, e os dois endpoints do Bingo
propriamente dito (leitura e escrita da lista). Usa exatamente a mesma
"assinatura" de detecção do cargo que o frontend já usa
(`leads:'none'` + `negocios:'crud'`) — conferi na tabela de cargos que
essa combinação é única do Administrativo, nenhum outro cargo tem
exatamente essas duas capacidades juntas, então não há risco de
bloquear alguém errado.

**Nota de deploy:** esta correção é no código do Worker
(`_worker_src/`), que é importado diretamente pela função do
Cloudflare Pages (`functions/[[path]].js`) — não existe passo de build
separado, o deploy normal já pega essa mudança.

**Arquivo:** `_worker_src/worker/controllers/clientes-controller.js`.

---

## 🔴 PRIORIDADE GERAL — O botão "Atualizar barra / Limpar CRM / Bugs"

### 13-17. Investigação da causa raiz suspeitada — ✅ concluída, causa descartada com evidência

O botão em questão é **"🔄 Resetar Interface"**, em Configurações →
Manutenção (`resetInterface()`, `js/leads.js`).

**O que ele faz, linha por linha:**
1. Desregistra qualquer Service Worker ativo.
2. Limpa o Cache Storage do navegador (arquivos estáticos em cache).
3. Recarrega a página com um parâmetro `?_reset=<timestamp>` (só pra
   forçar o navegador a não usar cache antigo).

**O que ele NUNCA toca:** `localStorage` (onde vivem leads, negócios,
clientes/Bingo, atividades, configurações, preferências visuais) e
`IndexedDB` (não é usado em lugar nenhum do projeto). Confirmei isso
lendo o código da função inteira — o comentário no próprio botão
("nada é apagado") está correto.

**Achado adicional que fortalece a conclusão:** este build do app
**não registra nenhum Service Worker** — procurei em todo o projeto e
não existe `serviceWorker.register(...)` em lugar nenhum. Ou seja, na
prática, hoje, o botão praticamente só recarrega a página — os passos
1 e 2 quase sempre não têm nada pra fazer.

Também conferi se o parâmetro `?_reset=` que ele adiciona na URL é
lido por algum outro código que pudesse fazer algo inesperado —
não é; nenhum outro trecho do app olha pra esse parâmetro.

**Conclusão:** o botão não é a causa raiz dos outros bugs deste
relatório. A correlação que vocês notaram (bugs aparecerem depois de
usar o botão) provavelmente é coincidência de tempo, ou os bugs já
existiam e só foram notados depois de um recarregamento completo da
página (que é exatamente o que o botão faz). As causas raízes reais de
cada bug listado foram encontradas e corrigidas individualmente nas
seções acima.

---

## Verificação

```
node --check <cada arquivo editado>  → OK (incluindo o arquivo do Worker)
node scripts/ai-guard.mjs            → 0 violações bloqueantes
node scripts/verify-mirror.mjs       → www/ e raiz idênticos
npm run lint                         → 0 erros
npm test                             → 43/43 testes
npx cap sync                         → android/ e ios/ sincronizados
```

## Itens que precisam da sua decisão antes de eu continuar

1. **Item 2 (Júlio):** vocês têm gente em fusos horários diferentes?
   Se sim, quero saber pra fazer a correção estrutural completa
   (gravar em UTC).
2. **Item 11 (nova janela):** autorizo adicionar `@capacitor/browser`
   como dependência nova? E existe um botão específico que já deveria
   estar chamando essa função e não está?

## Reversão

Todas as correções são arquivo por arquivo, sem migração de banco.
Qualquer item pode ser revertido isoladamente — me avise qual, se for
o caso.
