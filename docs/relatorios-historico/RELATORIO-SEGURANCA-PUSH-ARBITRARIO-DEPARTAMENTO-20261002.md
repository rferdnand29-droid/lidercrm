# RELATORIO-SEGURANCA-PUSH-ARBITRARIO-DEPARTAMENTO-20261002

## Pedido

Continuar a auditoria de correção — área nova: notificações push
(`push-send-controller.js`, `device-push-controller.js`).

## Achado real, corrigido

`device-push-controller.js` (registrar/listar/remover device) estava
corretamente implementado — sempre usa o próprio `sub` da sessão,
nunca aceita um uid vindo do cliente. Sem bug aqui.

`push-send-controller.js`, porém, tinha uma falha real: **qualquer
usuário autenticado podia mandar uma notificação push, com título,
corpo e dado extra totalmente livres, pra até 50 outras pessoas da
empresa — sem nenhuma verificação de relação entre quem manda e quem
recebe**. A única regra existente era "nunca notifica quem mandou" —
nada impedia notificar alguém completamente aleatório da empresa,
inclusive de outro departamento.

**Por que isso é sério**: uma notificação push aparece no celular da
pessoa como se fosse do próprio sistema — dá pra montar uma mensagem
com aparência de legítima ("Cliente urgente te aguardando, clique
aqui") pra qualquer pessoa da empresa, abrindo espaço pra phishing ou
engenharia social interna.

## A correção

Restringido ao mesmo departamento do remetente — reaproveitando
`resolveDepartmentMemberIds` (já auditada e testada em entrega
anterior desta mesma frente). Quem tem escopo global (gerência)
continua podendo notificar qualquer pessoa, preservando qualquer
fluxo legítimo entre departamentos diferentes iniciado por alguém
com esse nível de acesso.

Alvos fora do departamento não travam a requisição inteira — são
listados no resultado como bloqueados (`OUT_OF_DEPARTMENT_SCOPE`),
mesmo estilo "melhor esforço por alvo" que já existia neste arquivo
pra outras falhas (device sem token, FCM fora do ar).

**Por que departamento e não time (mais restrito)**: dado que esse
endpoint é chamado logo depois de mandar uma mensagem de chat, e chat
pode legitimamente cruzar equipes diferentes dentro do mesmo
departamento (mesmo raciocínio já usado antes pro pool de "Livre" do
kanban), restringir só a time seria arriscar quebrar conversas
legítimas sem necessidade — departamento já elimina o pior cenário
(notificar alguém completamente sem relação nenhuma).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/controllers/push-send-controller.js` | filtragem de escopo por departamento |
| `tests/push-send-department-scope.test.js` | novo — 4 testes |

## Verificação

```
node --check _worker_src/worker/controllers/push-send-controller.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 180/180 testes (176 + 4 novos)
npx cap sync                     → android/ios sincronizados
```

## Balanço acumulado desta frente de segurança (todas as entregas)

**5 vulnerabilidades reais** encontradas e corrigidas no total:
gestão de usuário/departamento sem verificação de cargo, exclusão de
arquivo sem verificação de posse, exposição de dado legado de
usuário, criação de documento sem verificação, e agora envio de push
arbitrário sem relação entre remetente e destinatário.

## Reversão

A filtragem pode ser removida isoladamente (revertendo pra `targets =
rawTargets` sem chamar `scopeTargetsToDepartment`) — mas dado que
reabriria a vulnerabilidade confirmada, não recomendo reverter sem
substituir por outra proteção equivalente.
