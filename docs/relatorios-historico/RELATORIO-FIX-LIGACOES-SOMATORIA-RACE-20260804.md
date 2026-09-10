# Correção: métricas de ligações somem após atualizações (2026-08-04)

## Sintoma relatado
> "Métricas não podem sumir após atualizações. Ao atualizar a somatória:
> consultor fez 10 ligações, atualizaram o CRM e não constou as métricas
> antigas."

O contador acumulado do dia ("Somatória Hoje" / "Somatória" no painel ADM,
alimentado pelo widget de bingo 1–10 do consultor) regredia ou zerava
depois de uma sincronização, mesmo o consultor tendo feito dezenas de
ligações no dia.

## Causa raiz

O endpoint `PUT /api/v1/ligacoes/list` (`ligacoes-controller.js`) gravava
o documento do dia (`{ list, total, rounds }`) com **overwrite cego**
(`setFsDocument`), sem ler nem comparar com o que já estava salvo.

Três caminhos diferentes do cliente fazem PUT para o **mesmo** documento
(uid+data), sem nenhuma fila/serialização entre eles:

1. `saveLigToday()` (`src/modules/agenda/runtime/ligacoes-store.js`) —
   disparado a cada clique na célula 1–10 — mandava **só** `{ list }`,
   sem `total`/`rounds`.
2. O patch `lf-lig-counter-sync-cloud-v1` — que envolve `saveLigToday` —
   mandava `{ list, total, rounds, device }` em paralelo.
3. O watcher de 5s do mesmo patch também empurra `{ total, rounds }`
   periodicamente.

Como não há fila nem versão, essas requisições concorrentes podiam
responder **fora de ordem**. Quando a requisição #1 (sem `total`)
respondia por último, o servidor calculava `total = list.length`
(0–10, só a rodada atual) e **sobrescrevia o acumulado do dia inteiro**
que uma requisição anterior já tinha salvo (ex.: 40 → 3). O comentário
do patch de cloud-sync já presumia que o servidor fazia esse merge por
`max()` — mas isso nunca existiu de fato no controller; era só uma
convenção aplicada do lado do cliente, que qualquer chamada legada
(como a própria `saveLigToday`) violava.

## Correção

### 1) Servidor — `_worker_src/worker/controllers/ligacoes-controller.js`
`putLigacoesListDoc` agora lê o documento já salvo antes de gravar e
nunca deixa `total`/`rounds` regredirem — o valor final é sempre
`Math.max(existente, recebido)`, não importa a ordem de chegada dos
PUTs concorrentes. `list` continua sendo substituída normalmente (ela
representa a rodada atual, que legitimamente reseta para vazia quando
o consultor fecha o bingo).

Esta é a proteção que realmente resolve o problema: funciona para
**qualquer** cliente, inclusive JS antigo ainda em cache em algum
dispositivo.

### 2) Cliente — `src/modules/agenda/runtime/ligacoes-store.js`
`saveLigToday`:
- Sempre inclui o `total`/`rounds` acumulados atuais no payload
  (lidos das mesmas chaves de `localStorage` que
  `lf-lig-counter-rounds-v1` mantém) — nunca mais manda um PUT
  "incompleto" que possa fazer o servidor recalcular o total errado.
- Serializa as gravações remotas por `uid+data` (fila em cadeia de
  Promises, mesmo padrão já usado em `activities-store.js`), e cada
  job da fila relê o total/rounds mais recentes no momento de rodar —
  eliminando a corrida na origem, não só mitigando no servidor.

Nenhum outro arquivo (patches de bingo, `agenda.js`, `relatorios.js`,
Worker de rotas) precisou ser alterado — o formato de
`getLigToday()`/`ligKey()` continua idêntico.

## Testes
`tests/ligacoes-somatoria-race.test.js` (5 testes, novos) reproduz a
corrida (PUT completo com total=40 seguido de PUT incompleto
respondendo depois) e confirma que o total/rounds nunca regride, que
avança normalmente quando o valor recebido é maior, e que o
comportamento do primeiro PUT do dia (sem documento anterior) não
mudou. Validado também que, **sem** a correção (merge desligado
manualmente), o mesmo teste falha — confirmando que o teste realmente
cobre o bug.

Suite completa: `npm test` → 8 arquivos, 43 testes, todos verdes
(38 preexistentes + 5 novos, nenhuma regressão).

## Arquivos alterados
- `_worker_src/worker/controllers/ligacoes-controller.js`
- `src/modules/agenda/runtime/ligacoes-store.js`
- `tests/ligacoes-somatoria-race.test.js` (novo)
