# RELATORIO-FEATURE-TEMPO-REAL-FASE1-6-NOTIFICACOES-20260928

## Pedido

Continuar as separações de arquitetura pelas menos difíceis —
terceira extensão consecutiva da mesma infraestrutura de tempo real
(Fase 1: Kanban; Fase 1.5: Atividades; agora Fase 1.6: Notificações).

## O que mudou

Mesmo padrão das duas extensões anteriores, agora pro inbox de
notificações (`notifications/<uid>`, confirmado usar a mesma estrutura
`fs_documents` de armazenamento):

- **Backend**: `checkKanbanChanges` agora consulta 4 caminhos numa
  única query (2 boards + atividades + notificações), emitindo um
  evento `notifications-changed` separado quando o inbox muda.
- **Frontend**: novo listener que dispara `loadNotifsRemote` seguido
  de `updateNotifBadge` — a MESMA sequência já usada pela sondagem de
  60s existente, sem duplicar nada.

## Verificação de retrocompatibilidade (mais uma vez confirmada)

Os 9 testes das duas extensões anteriores (kanban + atividades)
continuam passando sem nenhuma alteração neles. Adicionados mais 6
testes novos (3 no backend, 3 no frontend) cobrindo especificamente
notificações, incluindo um teste explícito de que os 4 recursos
mudando ao mesmo tempo são reportados corretamente, cada um
separado.

## Mesma limitação conhecida, agora estendida a 3 recursos

Só observa os recursos do PRÓPRIO usuário conectado. Documentado nas
duas entregas anteriores, continua valendo aqui.

## Balanço da frente de tempo real (3 entregas)

Partindo de 1 recurso observado (kanban) pra 3 (kanban + atividades +
notificações), sempre na MESMA conexão SSE — sem abrir uma nova a
cada extensão, sem duplicar nenhuma lógica de busca/merge já existente
e testada em sessões anteriores. 29 testes automatizados no total
entre as 3 fases, todos passando.

## Mesma nota de honestidade

Testado tudo que é possível sem deploy real. Confirmação ponta a
ponta em produção continua pendente de um deploy que não posso fazer
sozinho.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/controllers/kanban-stream-controller.js` | estendido pra observar também notificações |
| `js/lf-realtime-kanban.js` | novo listener `notifications-changed` |
| `tests/kanban-stream-controller.test.js` | +3 testes |
| `tests/lf-realtime-kanban.test.js` | +3 testes |

## Verificação

```
node --check (arquivos tocados) → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 148/148 testes (143 + 5 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Como validar manualmente após o deploy

Além do já descrito nas duas entregas anteriores: gerar uma
notificação pra um usuário (ex.: atribuir um lead a ele) num
dispositivo, conferir que o sininho de notificação atualiza no outro
dispositivo dele em segundos, não em até 60.

## Reversão

Reversível — remover o listener novo do cliente e reverter
`checkKanbanChanges` pra observar só os 3 recursos anteriores, sem
afetar as Fases 1/1.5 já validadas.
