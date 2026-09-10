# RELATORIO-FIX-TREMOR-KANBAN-CAUSA-RAIZ-ATIVIDADES-20260916

## Pedido

Corrigir de vez o Kanban tremendo/mexendo sozinho (permanente) e
atividades não concluindo/voltando após atualizar. Vídeo enviado
como evidência.

## Sobre o vídeo

Filmagem manual da tela (câmera balançando) — não deu pra confirmar
visualmente um tremor de poucos pixels distinto do tremor da própria
mão seguindo a filmagem. Tratei o vídeo como confirmação do sintoma
relatado e fiz uma investigação de código bem mais profunda do que
nas correções anteriores, já que "permanente" indicava uma causa
consistente, não uma corrida rara.

## 1. Kanban tremendo — causa raiz real, encontrada e corrigida

Investigando `_syncKBRemoteBG` (roda a cada 15s, sempre, pra qualquer
pessoa com a tela de Leads/Negócios aberta) e o merge que ele usa
(`_mergeKeepLocalOnly`), achei o problema:

**A lista final de cards era reconstruída seguindo a ORDEM QUE O
SERVIDOR DEVOLVEU, não a ordem local já exibida na tela**
(`serverList.map(...)`). Se a consulta ao banco não garante ordem
estável entre buscas sucessivas (comum sem `ORDER BY` explícito), a
MESMA sincronização de 15s podia devolver os MESMOS cards em ordem
ligeiramente diferente — mesmo sem nenhuma mudança real de dado.

Como a maioria dos cards nunca foi arrastada manualmente (sem
`manualOrder`), o desempate de `_sortCardsForColumn` (que ordena por
data de criação) dependia da ORDEM DE ENTRADA do array quando duas
datas ficam próximas — ordem essa que agora podia mudar a cada
ciclo. Resultado: cards trocando de posição visual sozinhos, de
forma recorrente e sem gatilho nenhum do usuário — exatamente
"tremendo mexendo sozinho permanente".

**Corrigido**: a lista final agora preserva a ordem LOCAL já exibida
para tudo que já existia dos dois lados; só usa a ordem do servidor
para itens genuinamente novos (sem posição local ainda). Travado com
**5 testes automatizados** novos, incluindo um teste de regressão
explícito pra esse cenário exato (mesmos cards, servidor devolve em
ordem diferente entre duas chamadas → ordem final não muda).

**Correção complementar** (mais defensiva que definitiva): o quadro
inteiro agora é construído fora da tela (`DocumentFragment`) antes de
substituir o antigo de uma vez só — elimina qualquer possibilidade de
intervalo visualmente incompleto durante a repintura, mesmo que rara
dado o modelo de execução do JavaScript.

## 2. Atividades não concluindo/voltando — investigação extensa, sem novo bug confirmado

Rastreei TODA a cadeia de proteção já construída em sessões
anteriores para `LF.fetchAndCacheActivities` (usada no boot e em
outros pontos): `retry-queue-sync.js` (versão original, na prática
pouco usada) → `lf-fix-activity-cloud-persist-v3` (versão segura,
que nunca zera o cache e nunca regride `done`) → `lf-hotfix-notif-
som-e-atividades` (blindagem via `defineProperty`, impede qualquer
patch futuro de sobrescrever com versão insegura) → `lf-fix-console-
errors` (guarda contra pedir atividade de outro uid). Essa cadeia
inteira está corretamente protegida e ativa.

**Achado 1 (corrigido)**: o wrapper de debounce (`lf-fix-definitivo-
multiaba`, o último a carregar) não tinha as marcações de segurança
exigidas pela blindagem — a atribuição dele era silenciosamente
rejeitada, e a otimização de debounce nunca entrava em vigor de
verdade (só ficava logando aviso no console). Não é um bug de
segurança de dado (a blindagem funcionou como deveria, rejeitando a
versão "não marcada"), mas é uma correção real — sem ela, o debounce
nunca funcionava.

**Achado 2 (investigado, não corrigido)**: ao concluir a atividade de
OUTRA pessoa (supervisor/admin concluindo pelo painel), a busca é
assíncrona (rede) — existe uma janela de corrida genuína entre o
INÍCIO dessa busca e sua conclusão, onde uma mudança concorrente no
servidor (feita pelo próprio dono, por exemplo) poderia ser perdida
na regravação da lista inteira. Cheguei a implementar uma correção,
mas reconsiderei e reverti — o remédio certo pra esse caso exige
uma atualização parcial no backend (mudar só o campo `done`, não
regravar a lista inteira), não um ajuste só no cliente. Não fiz essa
mudança de backend sem mais conversa, dado o escopo maior.

## Nota de honestidade

Não encontrei uma NOVA causa ativa para "atividades revertendo" além
do que já foi corrigido em sessões anteriores (painel de
notificações, `_loadActivitiesForOwner`). A cadeia de proteção atual
é robusta. Se o sintoma persistir, o próximo passo mais produtivo
seria capturar o cenário exato (quem completou, se foi a própria
atividade ou de outra pessoa, se em qual tela) pra eu conseguir
reproduzir com precisão — investigação sem esse detalhe já esgotou os
caminhos mais prováveis.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/modules/kanban/runtime/kanban-helpers.js` | `_mergeKeepLocalOnly` preserva ordem local |
| `js/kanban.js` | `_buildKB` constrói fora da tela antes de trocar |
| `js/patches/lf-fix-definitivo-multiaba-v1-20260819.js` | wrapper de debounce marcado como seguro |
| `tests/lf-merge-order-stability.test.js` | novo — 5 testes |

## Verificação

```
node --check (todos os arquivos .js tocados) → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 76/76 testes (71 + 5 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Como validar manualmente

1. Deixar o Kanban de Leads/Negócios aberto por vários minutos, num
   time com outras pessoas mexendo em cards — cards sem posição
   manual não devem mais trocar de lugar sozinhos.
2. Concluir uma atividade (própria), atualizar a página várias vezes
   — deve continuar concluída.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
