# RELATORIO-SEGURANCA-NOTIFICACAO-INTERNA-DEPARTAMENTO-20261005

## Pedido

Continuar a auditoria de correção — completar a inspeção de
`notificacoes-controller.js` (antes só tinha verificado as regras de
automação, não a caixa de entrada em si) e `authz-health-controller.js`
(nunca verificado).

## Achado real, corrigido — mesma classe do push, agora dentro do próprio app

`getInboxNotificacoes`/`putInboxNotificacoes` já estavam corretamente
protegidos (`canAccessInbox` — dono ou cargo adm/gestor/admin). Mas
`postInboxNotificacao` — a função que insere uma notificação nova na
caixa de outra pessoa — **não tinha nenhuma verificação**. Qualquer
usuário autenticado conseguia inserir uma notificação com texto, tipo
e outros campos totalmente livres na caixa de QUALQUER outro usuário,
sem nenhuma relação exigida entre remetente e destinatário.

É exatamente o mesmo risco já corrigido pro push (SEC-06) — só que
aqui a notificação aparece **dentro do próprio app** (o sininho de
notificação), o que a torna ainda mais convincente como isca de
phishing, já que vem de dentro do sistema que a pessoa já confia.

## A correção

Mesmo padrão já testado: restringido ao mesmo departamento do
remetente, reaproveitando `resolveDepartmentMemberIds`. Notificar a
si mesmo sempre funciona. Escopo global (gerência) continua podendo
notificar qualquer pessoa.

## `authz-health-controller.js` — confirmado seguro

Já corretamente restrito a `caps.adminUI`, expõe só métricas
operacionais de cache (hits/misses/config) — nada sensível. Nenhuma
mudança necessária.

## Erro cometido e corrigido durante a escrita do teste

Meu helper de requisição simulada não reproduzia corretamente a
interface que `readJsonBody` espera de um `Request` de verdade
(primeiro faltou `.headers.get()`, depois usei `.json()` quando a
função real usa `.text()`). Corrigido em duas iterações rápidas,
confirmado rodando os testes a cada ajuste.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/controllers/notificacoes-controller.js` | filtragem de escopo por departamento em `postInboxNotificacao` |
| `tests/notificacoes-inbox-department-scope.test.js` | novo — 5 testes |

## Verificação

```
node --check _worker_src/worker/controllers/notificacoes-controller.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 193/193 testes (188 + 5 novos)
npx cap sync                     → android/ios sincronizados
```

## Balanço acumulado desta frente de segurança (todas as entregas)

**8 vulnerabilidades reais** encontradas e corrigidas no total:
gestão de usuário/departamento, exclusão de arquivo, dado legado de
usuário, criação de documento, push arbitrário, exposição de hash de
senha (dois caminhos diferentes), e agora notificação interna
arbitrária.

## Cobertura completa

Com esta entrega, todos os 25 controllers do backend já passaram por
uma auditoria de correção dedicada (não só de existência de
verificação). A frente de segurança desta sessão está, na minha
avaliação, substancialmente completa — qualquer achado futuro
provavelmente exigiria uma auditoria de outro tipo (ex.: revisão de
schema/validação de entrada, não mais escopo de autorização).

## Reversão

A filtragem pode ser removida isoladamente — mas dado que reabriria
a vulnerabilidade confirmada, não recomendo reverter sem substituir
por outra proteção equivalente.
