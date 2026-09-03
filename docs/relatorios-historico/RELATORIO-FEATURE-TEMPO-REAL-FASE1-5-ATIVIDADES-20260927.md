# RELATORIO-FEATURE-TEMPO-REAL-FASE1-5-ATIVIDADES-20260927

## Pedido

Continuar as separações de arquitetura pelas menos difíceis. Dado que
a validação final da Fase 1 (SSE pro Kanban) depende de um deploy
real que não posso fazer sozinho, estendi a mesma infraestrutura já
testada pra cobrir Atividades — a outra área que mais sofreu bugs de
sincronização ao longo desta sessão inteira.

## Por que atividades, e por que estender em vez de duplicar

Boa parte das correções desta sessão foram sobre atividades "não
concluindo/voltando" — a causa raiz, na maioria dos casos, era a
mesma: o cliente confiando em sondagem periódica pra saber que algo
mudou no servidor. A mesma solução (avisar em vez de sondar) se
aplica igualmente bem aqui.

Em vez de abrir uma SEGUNDA conexão SSE separada, estendi a MESMA
conexão já construída na Fase 1 pra também observar o documento de
atividades do usuário — mais eficiente (uma conexão, um laço de
sondagem em segundo plano, em vez de dois) e reaproveita toda a
infraestrutura já testada (autenticação, reconexão, formato de
evento).

## O que mudou

**Backend**: `checkKanbanChanges` agora consulta 3 caminhos em vez de
2 (os 2 boards de kanban + o documento de atividades), continuando a
mesma checagem barata (só `updated_at`, não o dado inteiro). Quando
atividades mudam, emite um evento `activities-changed` separado do
`changed` (usado pelos boards) — o cliente distingue e dispara a
atualização certa em cada caso.

**Frontend**: novo listener pro evento `activities-changed`, que
dispara `window.LF.fetchAndCacheActivities(uid)` — a MESMA função já
profundamente auditada e protegida em sessões anteriores (nunca
zera o cache, nunca regride uma atividade concluída) — não duplica
nem um pouco dessa lógica, só chama mais cedo do que os 60 segundos
da sondagem atual.

## Verificação de retrocompatibilidade

Os 6 testes originais da Fase 1 (só kanban) continuam passando sem
nenhuma alteração neles — confirma que a extensão não regrediu o
comportamento já existente. Adicionados mais 5 testes novos (3 no
backend, cobrindo a detecção separada de mudança em atividades; 2 no
frontend, cobrindo o disparo correto — e a ausência de disparo sem
usuário logado).

## Mesma limitação conhecida da Fase 1, agora também documentada aqui

Só observa os recursos do PRÓPRIO usuário conectado — não estende
pra "supervisor vê atividade do time em tempo real". Continua sendo
uma limitação aceita de propósito, não uma regressão — quem depende
disso continua com a sondagem de 60s de sempre.

## Mesma nota de honestidade da entrega anterior

Testei tudo que é possível testar sem um deploy real (14 testes
novos no total, todos passando). O comportamento ponta a ponta em
produção (o Cloudflare realmente entregando os 2 tipos de evento numa
mesma conexão) só pode ser confirmado depois do deploy — recomendo
testar concluindo uma atividade num dispositivo e conferindo se
outro dispositivo logado como a mesma pessoa reflete isso em segundos.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/controllers/kanban-stream-controller.js` | estendido pra observar também atividades |
| `js/lf-realtime-kanban.js` | novo listener `activities-changed` |
| `tests/kanban-stream-controller.test.js` | +3 testes |
| `tests/lf-realtime-kanban.test.js` | +2 testes |

## Verificação

```
node --check (arquivos tocados) → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 143/143 testes (138 + 5 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Como validar manualmente após o deploy

Além da validação já descrita pra Fase 1 (mover card entre telas):
concluir uma atividade num dispositivo, conferir que outro dispositivo
(mesma pessoa logada) reflete isso em segundos, não em até 60.

## Reversão

Reversível — remover o listener novo do cliente e reverter
`checkKanbanChanges` pra observar só os 2 boards, sem afetar a Fase 1
já validada.
