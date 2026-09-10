# RELATORIO-FIX-HISTORICO-PERMANENTE-E-PERSISTENCIA-20260829

## Bug

Pedido explícito, com 3 partes:
1. Histórico de conversão Lead → Negócio não mostra pra qual etapa o
   negócio foi.
2. Histórico deve ser bem detalhado — criação, mudança de etapa,
   atividades concluídas — e nada disso pode sumir, nem entre
   atualizações/deploys.
3. Anotações/notas do lead devem ter a mesma garantia: sempre salvas
   na nuvem, sempre voltam, independente da versão.

## Causa raiz

**1 (etapa na conversão):** o histórico do Negócio recém-criado já
registrava a etapa inicial (`Negócio criado a partir do Lead (etapa
inicial: "X")`), mas o histórico do **Lead** — onde a entrada
"Convertido em Negócio" fica registrada — nunca incluía essa
informação.

**2 (atividades concluídas sem rastro permanente) — achado central
desta rodada:** ao concluir uma atividade (individual ou em lote),
o código atualizava a lista separada de Atividades e um "espelho"
dentro de `card.activities`, mas **nunca** gravava nada no
`historico` do card. Ou seja, a única fonte de verdade de "essa
atividade foi feita" vivia fora do histórico do lead — se por
qualquer motivo essa lista separada tivesse um problema, não sobrava
nenhum rastro no próprio lead de que aquilo tinha acontecido.

**2b (limite de 80 no histórico):** o histórico do card descartava
silenciosamente qualquer entrada além da 80ª mais recente — direto
contra o pedido de histórico permanente. Achei também um segundo
ponto (reversão de Negócio para Lead) que cortava em 79 entradas na
hora de transportar o histórico.

**3 (garantia real de nuvem) — achado mais sério da investigação:**
encontrei um comentário no próprio código confirmando que esse medo
específico já tinha se concretizado antes: "se o PUT remoto falhasse,
o nome antigo voltava no próximo deploy/reload". A correção existente
dava só **1 retry** (1,5s) e desistia de vez com um aviso na tela —
se a internet estivesse instável e a pessoa não visse o aviso
(fácil de perder, principalmente no celular), a edição ficava presa
só no armazenamento local, sem nenhuma garantia de chegar à nuvem
depois. Isso vale tanto para o Kanban (Leads/Negócios, que inclui as
notas — `obs` é só mais um campo do mesmo card) quanto para o
Bingo/Clientes, que **não tinha retry nenhum** — desistia na
primeira falha.

Achei também que o projeto já tinha uma fila de retentativas
persistente pronta (`src/core/offline/retry-queue.js` +
`sync-manager.js`, sobrevive a fechar o app) — mas **nunca estava
conectada a nada nem era iniciada**.

## Estratégia

1. `js/relatorios.js`: histórico do Lead na conversão agora inclui a
   etapa de destino, igual ao histórico do Negócio.
2. `js/agenda.js`: ao concluir uma atividade (individual —
   `actConfirmDone` — e em lote — `applyActBulkDone`), grava
   permanentemente `_pushHistorico(card, 'Atividade concluída: "..."')`
   no card relacionado, além de manter a lista de Atividades como
   estava.
3. `js/kanban.js`: limite de histórico por card subido de 80 para
   2000 (trava só contra bug de crescimento sem fim, não limite de
   uso normal); mesmo ajuste no corte de 79 → 2000 na reversão de
   Negócio para Lead.
4. `js/kanban.js` (`saveKBFor`) e `js/clientes.js` (`saveCli`):
   quando a gravação na nuvem falha depois do(s) retry(s), o item
   agora entra na fila de retentativas persistente do próprio
   projeto — sobrevive a fechar o app, é reenviado automaticamente.
   `saveCli` também ganhou 1 retry automático, que não tinha nenhum.
5. `js/app.js` (`bootApp`): ativa o dreno da fila (`offline.sync.start()`)
   e dispara uma tentativa imediata no boot — cobre itens que
   ficaram pendentes de uma sessão anterior enquanto o app estava
   fechado.

## Fluxos cobertos

- Converter Lead em Negócio: histórico do Lead mostra a etapa de
  destino.
- Concluir atividade (individual ou em lote): fica registrado no
  histórico do lead/negócio pra sempre, além da lista de Atividades.
- Lead/Negócio/Bingo com histórico extenso: não perde mais entradas
  antigas até um limite muito mais alto.
- Editar nota com internet instável: se a primeira tentativa falhar,
  tenta de novo sozinho; se ainda assim falhar, fica na fila e é
  reenviada automaticamente quando a conexão voltar — mesmo que a
  pessoa feche o app nesse meio-tempo.
- Boot do app: qualquer gravação pendente de uma sessão anterior é
  reenviada automaticamente, sem precisar editar de novo.

## Limitação, dita com honestidade

Essas garantias dependem do **armazenamento local não ser apagado**
antes da fila conseguir reenviar (ex.: desinstalar o app, limpar
dados do navegador manualmente). Isso é uma limitação de qualquer
sistema local-first — o que dá pra garantir, e agora está garantido,
é que uma falha de rede temporária não perde mais o dado: ele fica
guardado e insiste até conseguir, em vez de desistir depois de 1
tentativa.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/relatorios.js` | histórico do Lead com etapa de destino na conversão |
| `js/agenda.js` | conclusão de atividade grava no histórico do card (individual + lote) |
| `js/kanban.js` | limite de histórico 80→2000; `saveKBFor` conectado à fila de retentativas |
| `js/clientes.js` | `saveCli` com retry + fila de retentativas |
| `js/app.js` | ativa o dreno da fila no boot |

## Verificação

```
node --check (todos os arquivos tocados) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes (incluindo os da própria fila de retentativas)
```

## Como validar manualmente

1. Converter um Lead em Negócio escolhendo uma etapa específica →
   abrir o histórico do Lead → deve mostrar a etapa escolhida.
2. Concluir uma atividade vinculada a um lead → abrir o histórico do
   lead → deve aparecer "Atividade concluída: ...".
3. (Difícil de testar sem simular rede instável de verdade) — desligar
   a internet, editar uma nota, religar a internet → a nota deve ser
   salva sozinha, sem precisar editar de novo.

## Reversão

Reversível arquivo por arquivo. O aumento do limite de histórico não
afeta dados já salvos com o limite antigo — só permite que MAIS
entradas se acumulem daqui pra frente.
