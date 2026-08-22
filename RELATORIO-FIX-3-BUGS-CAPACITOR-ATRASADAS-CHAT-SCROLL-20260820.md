# RELATÓRIO — 3 bugs graves do Capacitor (atrasadas erradas + scroll do Papo)

**Data:** 2026-08-20
**Pedido:** achar a causa de 3 bugs graves só reproduzidos no app
Capacitor/mobile e corrigir.

---

## Bug 1 — Filtro "Atrasadas" mostra atividades erradas no mobile

**Sintoma relatado:** no painel de Atividades (visão ADM/Time), o
filtro "Atrasadas" no Capacitor mostra muito mais itens que no PC —
inclusive atividades cujo lead/negócio já nem existe mais, ou já foi
descartado. Acontece especificamente com **supervisor**.

### Causa raiz nº 1 — descartar um negócio nunca purgava as atividades

Em `confirmDeleteKBReason` (`js/relatorios.js`), o fluxo de **descarte**
de negócio (`board==='negocios'`) sempre terminava com `return` **antes**
de chegar no bloco que limpa atividades/notificações órfãs — bloco que
só existia no fluxo de **exclusão permanente** (`leads`). Ou seja:
qualquer negócio descartado (o botão "Excluir" em Negócios, na prática,
sempre descarta — não apaga) deixava suas atividades vinculadas vivas
para sempre, "atrasadas" eternamente, mesmo o card já estando inativo.

### Causa raiz nº 2 — a purga sempre mirava em quem clicava, não no dono do card

Mesmo no fluxo que já purgava (exclusão permanente de lead), o código
usava `getActivities()`/`saveActivities()` — que só operam nos dados do
**usuário logado** (`S.userId`). Quando um **supervisor** excluía o
lead de um **consultor**, a purga limpava as atividades do próprio
supervisor (que não tinham nada a ver), nunca as do consultor de
verdade. Isso explica exatamente por que o bug "acontece com
supervisor": o painel agregado do supervisor é o único lugar que
mistura atividades de vários usuários — um consultor olhando só a
própria agenda nunca notaria, porque a purga errada nem afeta os dados
dele.

### Por que aparecia mais no Capacitor que no PC

`loadAllActivitiesAdmin` busca do servidor por usuário e, se a chamada
falhar, cai pro cache local (`getActivitiesLocalFor`). Um dispositivo
que ficou mais tempo sem sincronizar (ou com uma chamada que falhou)
acumula mais dessas atividades órfãs nunca purgadas no cache local do
que uma sessão de PC recém-carregada — daí a divergência visível entre
plataformas, mesmo sendo o mesmo bug de fundo nos dois lugares.

### Correção — 3 mudanças, `js/relatorios.js` + patch existente

1. **`confirmDeleteKBReason`** — extraída a purga pra uma função
   reutilizável `_purgeOrphanActsAndNotifs(uid, cardId, board)` que:
   - Usa `getActivitiesLocalFor(uid)` +
     `window.LiderCRM.modules.agenda.runtime.lfSaveActivitiesFor(uid,...)`
     (aceitam **uid arbitrário**, "inclusive outro consultor" — já
     existiam prontas em `src/modules/agenda/runtime/activities-store.js`,
     só não eram usadas aqui) em vez de `getActivities`/`saveActivities`.
   - Roda tanto no fluxo de **descarte de negócio** quanto no de
     **exclusão permanente** — antes só o segundo tinha a purga.
   - Purga notificações (`getNotifs`/`saveNotifsFor`) também pelo uid
     do dono real do card, não sempre do usuário logado.

2. **`_admAtivIsOrphan` (novo, `js/relatorios.js`)** — segunda camada,
   na **exibição**: `renderAdmAtividades` e `renderTimeAtividades` agora
   filtram qualquer atividade cujo card não exista mais **ou** esteja em
   etapa terminal (`desc`, `noshow`, `conv`, `desist`, `fechado`) antes
   de calcular KPIs/listas. Isso limpa retroativamente o que já estava
   sujo (atividades de negócios descartados há dias, por exemplo), sem
   precisar de migração — a correção nº 1 só evita que NOVAS órfãs se
   acumulem dali pra frente.

3. **`js/patches/notificacoes/lf-overdue-activity-notif-fix-20260729.js`**
   — o guard "card órfão" adicionado em 2026-08-18 só checava se o card
   *existia*; como descartar um negócio não remove o card do array (só
   marca `discarded:true`/`col:'noshow'`), a notificação do sino
   continuava voltando para negócios descartados. Reforçado pra checar
   também `discarded` e etapa terminal — mesmo critério do item 2.

Todos os três reaproveitam a MESMA lista de etapas terminais já usada
(e testada) em `lf-fix-tab-dot-negocios-ownership-v1-20260820.js` (fix
da sessão anterior, para a bolinha de notificação da aba).

---

## Bugs 2 e 3 — aba Papo rola a tela inteira em vez de só a lista/mensagens

**Sintoma relatado:** ao entrar no Papo e rolar a lista de conversas, a
tela inteira sobe/desce junto. Dentro de uma conversa, mesma coisa:
cabeçalho e barra de digitar não ficam fixos, e a barra de digitar
chega a sobrepor mensagens, impedindo ler/editar.

### Causa raiz

`body` (`css/style.css`) nunca trava `overflow-y` — só
`overflow-x:hidden` — e usa `min-height:100dvh` (não altura fixa).
`#pg-chat` (`css/chat/chat.css`) é a **única** página do CRM pensada
para ter altura travada com rolagem interna (cabeçalho fixo + mensagens
rolando + input fixo); todo o resto do app é uma página comprida normal
onde o body **precisa** rolar — por isso nunca foi travado.

Como o body nunca trava `overflow-y`, qualquer imprecisão de cálculo de
altura (comum em WebView Android/Capacitor com `100dvh`, teclado
abrindo/fechando, safe-area) faz o conteúdo do Papo "vazar" além da
viewport, e o navegador rola o **documento inteiro** em vez de conter a
rolagem dentro de `#chat-msgs`/`#chat-conv-list` (que já tinham
`overflow-y:auto` corretamente configurado — o problema nunca foi ali).
Como `#chat-input-area` é `position:absolute` ancorada em
`#chat-conv-panel` (não na viewport), quando esse container cresce além
da tela visível, a barra "acompanha" o crescimento e aparece flutuando
no meio das mensagens em vez de grudada no rodapé — exatamente o
sintoma relatado.

O próprio projeto já tinha comentários registrando que `position:sticky`
havia sido tentado e abandonado por variar demais entre WebViews
Android (ver `css/chat/chat.css`, bloco "R16-25").

### Correção — reaproveitando técnica já testada no projeto

**Novo arquivo:** `js/patches/chat/lf-fix-chat-mobile-scroll-lock-v1-20260820.js`

Em vez de mexer no cálculo de altura (frágil, já provou variar por
aparelho), trava o **scroll do body** enquanto `#pg-chat` está aberto
no mobile — a mesma técnica `position:fixed` + `top:-scrollY` +
`overflow:hidden` + `width:100%` já usada e comprovada no menu mobile
(`toggleMobileMenu`, `js/utils.js`). Com o body travado, `#pg-chat`
volta a ser o único "dono" da rolagem, e como `#chat-msgs`/
`#chat-conv-list` já tinham `overflow-y:auto` certo, a rolagem passa a
ficar corretamente contida neles — cabeçalho e barra de digitar deixam
de se mover porque o container que os cerca para de crescer além da
tela.

- Wrapper idempotente em `initChatPage()` (trava, só no mobile) e
  `destroyChatPage()` (destrava) — os dois pontos que já existem no
  código para entrar/sair do Papo (chamados por `goPage`).
- Defensivo: nunca sobrescreve um lock que já esteja ativo por outro
  motivo (ex.: menu mobile aberto), e só destrava o que ele mesmo
  travou.
- Não mexe em desktop (>768px, onde o layout de 3 colunas já funciona),
  nem no CSS de altura/posição existente do chat.
- **Reforço CSS** (`css/chat/chat.css`): `overscroll-behavior:contain`
  adicionado em `#chat-msgs` e `#chat-conv-list` — defesa extra contra
  a rolagem "vazar" pro documento pai, mesmo que o lock de scroll do
  body tenha alguma janela de corrida.

**Arquivos:**
| Arquivo | Tipo |
|---|---|
| `js/patches/chat/lf-fix-chat-mobile-scroll-lock-v1-20260820.js` | novo |
| `css/chat/chat.css` | `overscroll-behavior:contain` em 2 seletores |
| `index.html`, `app.html` | nova tag `<script>` |
| `www/**` | espelho, regenerado via `npm run cap:www` |

---

## Verificação

```
npm run lint                    → 0 erros, 8 avisos (pré-existentes, fora de escopo)
npm test                        → 8/8 arquivos, 43/43 testes
node scripts/ai-guard.mjs       → 0 violações bloqueantes
node scripts/verify-mirror.mjs  → www/ e raiz idênticos
node --check <cada arquivo editado> → OK
```

## Como validar manualmente

**Bug 1:** como supervisor, descarte um negócio de um consultor que
tinha atividade agendada vinculada a ele. Confirme no painel de
Atividades (Time/ADM) que ela some da lista "Atrasadas" imediatamente
— e que negócios/leads já descartados **antes** deste fix também não
aparecem mais (a segunda camada limpa isso sem precisar recriar nada).

**Bugs 2/3:** no app mobile/Capacitor, abra o Papo, role a lista de
conversas — só a lista deve rolar, com cabeçalho/nav fora dela parados.
Entre numa conversa, role as mensagens — cabeçalho e barra de digitar
devem ficar fixos, sem sobrepor mensagem nenhuma.

## Reversão

- Bug 1: reverter as edições em `js/relatorios.js` (função
  `_purgeOrphanActsAndNotifs` + filtro `_admAtivIsOrphan`) e no bloco
  `[FIX 20260818, reforçado 20260820]` de
  `lf-overdue-activity-notif-fix-20260729.js`.
- Bugs 2/3: remover a tag `<script>` de
  `lf-fix-chat-mobile-scroll-lock-v1-20260820.js` nos 4 HTMLs e apagar
  o arquivo; reverter o `overscroll-behavior:contain` em
  `css/chat/chat.css` (opcional, inofensivo mesmo sem o patch).

Nenhuma migração, nenhuma mudança de schema, nenhum arquivo canônico
reescrito — todas as correções são aditivas ou trocam alvo de uma
purga que já existia.
