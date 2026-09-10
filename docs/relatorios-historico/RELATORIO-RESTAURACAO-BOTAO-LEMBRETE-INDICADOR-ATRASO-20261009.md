# RELATORIO-RESTAURACAO-BOTAO-LEMBRETE-INDICADOR-ATRASO-20261009

## Pedido

Trazer de volta o botão de lembrete nos cards de lead, e fazer ele
ficar vermelho quando o lead tem uma atividade atrasada.

## O que encontrei

Não era uma feature nova pra construir — era uma quebra silenciosa
real. Toda a "fiação" já existia e estava intacta, só o elemento
visual em si tinha sumido:

- **CSS completo já pronto**, incluindo o estado vermelho exato pedido
  (`.kb-act-btn.late`), com um comentário datado de 2026-08-16
  explicando: "Fica vermelho somente quando existe, NESTE MOMENTO,
  atividade não concluída vencida vinculada ao card... deixa de ficar
  vermelho sozinho assim que a atividade é concluída".
- **O cálculo do atraso já existia** (`_actLate`, via
  `_kbHasOverdueLinkedActivity`) — só que o resultado nunca era usado
  em lugar nenhum.
- **Os manipuladores de clique já existiam**, em múltiplos pontos do
  arquivo, todos esperando um elemento `.kb-act-btn` — que nunca
  existia de verdade no HTML do cartão.

Ou seja: em algum momento anterior, o botão foi removido do HTML do
cartão numa edição — mas ninguém apagou o resto (CSS, cálculo,
manipuladores), porque cada peça isolada continuava sintaticamente
válida. O botão simplesmente nunca aparecia, e clicar onde ele
deveria estar não fazia nada, silenciosamente.

## A correção

Adicionei de volta o elemento `<button class="kb-act-btn">` no HTML
do cartão (dentro de `_buildKB`, `js/kanban.js`) — sempre visível
(seu propósito é abrir o modal de adicionar lembrete, útil em
qualquer cartão, não só nos que já têm atividade atrasada). A classe
`late` é aplicada condicionalmente ao `_actLate` já calculado — sem
precisar tocar em nenhuma outra parte do sistema, já que toda a lógica
de detecção de atraso e o clique já estavam prontos e corretos.

Confirmei visualmente (renderizando com o CSS de produção real) os
dois estados: azul normal ("🔔 Lembrete") e vermelho quando atrasado
("🔔 Atrasada").

## Sobre o teste automatizado

Escrevi um teste que verifica especificamente que `_actLate` e
`kb-act-btn` aparecem CONECTADOS no código-fonte (na mesma linha,
condicionando a classe) — não só que a string `kb-act-btn` existe em
algum lugar do arquivo. Um teste mais frouxo não pegaria o bug
original: a classe já era mencionada nos manipuladores de clique,
mesmo com o elemento ausente do HTML — só checar "a string existe"
teria passado mesmo com o bug presente.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | botão `.kb-act-btn` restaurado no HTML do cartão, dentro de `_buildKB` |
| `tests/kb-act-btn-late-indicator.test.js` | novo — 5 testes |

## Verificação

```
node --check js/kanban.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 226/226 testes (221 + 5 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
Renderização visual              → confirmado os dois estados (normal e atrasado) com o CSS real
```

## Reversão

Reversível isoladamente — remover a linha do botão de volta ao estado
anterior, sem afetar nenhuma outra funcionalidade (o CSS e a lógica de
detecção continuam existindo de qualquer forma).
