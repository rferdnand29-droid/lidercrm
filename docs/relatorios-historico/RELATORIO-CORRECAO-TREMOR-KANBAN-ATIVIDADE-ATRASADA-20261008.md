# RELATORIO-CORRECAO-TREMOR-KANBAN-ATIVIDADE-ATRASADA-20261008

## Pedido

Corrigir os dois bugs descritos num documento de análise técnica
enviado (cards tremendo no Kanban; atividade concluída voltando como
atrasada) — pedido explícito de que o CRM fique "limpo igual Bitrix,
sem esses bugs".

## Como conduzi isto

O documento enviado tinha formatação confusa (parecia um PDF mal
extraído) e citava causas específicas com linha de código. Investiguei
cada afirmação contra o código real antes de implementar qualquer
coisa — algumas se confirmaram exatamente, outras estavam desatualizadas
ou imprecisas, e o achado mais importante do Bug 2 nem estava
exatamente onde o documento apontava.

## Bug 1 — Cards tremendo no Kanban

### Confirmado e corrigido
`_lfListsEqualById` (`js/utils.js`) comparava cartões via
`JSON.stringify(it)` direto — que serializa as propriedades na ordem
de **inserção**, não ordenada. O mesmo cartão, vindo do servidor por
caminhos diferentes (merge, serialização, round-trip pelo Worker),
podia ter as mesmas chaves em ordem diferente — a comparação dizia
"mudou" quando não tinha mudado nada, disparando repintura completa
do quadro inteiro a cada ciclo de sincronização de 15 segundos (e a
cada evento de tempo real).

**Correção**: normalização via ordenação de chaves (recursiva, cobre
objetos aninhados como `card.activities` também) antes de comparar —
não um subconjunto fixo de campos, para não arriscar esquecer um
campo que legitimamente importa.

### Não confirmado — documento estava impreciso aqui
A alegação de que "todos os cards são animados de novo" a cada
repintura **não se confirmou**: a classe `new-anim` só é aplicada a
cartões genuinamente recém-criados (via `setTimeout` visando um
`data-id` específico), não em toda reconstrução do quadro. Não mexi
nisso.

A proteção contra o "loop admin-vs-usuário" em `_autoMoveStaleToLivre`
já tinha uma salvaguarda robusta (`col==='livre'` nunca reprocessa) —
o cenário de corrida entre clientes diferentes que o documento descreve
é mais raro e de impacto bem menor que a causa principal acima. Não
implementei a guarda de 24h sugerida — o ganho seria marginal frente
ao risco de mexer numa função já bem protegida sem evidência clara do
problema específico.

## Bug 2 — Atividade concluída volta como atrasada

### O documento apontava o lugar errado
A alegação central do documento era que `fetchAndCacheActivities` não
usava a proteção contra reverter conclusão. **Isso não é verdade** —
investiguei toda a cadeia de patches que envolvem essa função (3
camadas de wrapper) e confirmei que cada uma delega corretamente pra
versão anterior, preservando a proteção já existente (implementada de
forma diferente da que o documento sugeria, mas presente e funcional).

### A causa raiz real, encontrada durante a investigação
Está em `_mergeKeepLocalOnly` (`src/modules/kanban/runtime/
kanban-helpers.js`) — a fusão do **card inteiro** do Kanban. Ela decide
qual versão vence (servidor ou local) comparando só o `updatedAt` do
card — sem nenhuma relação com o estado de cada atividade dentro do
espelho embutido `card.activities`. Se o servidor vence (por qualquer
motivo — outro campo mudou, outro dispositivo salvou algo não
relacionado), o `card.activities` inteiro dele substitui o local —
incluindo qualquer atividade que o servidor ainda não processou como
concluída (a conclusão é local-first, o envio pro servidor é
assíncrono).

**Correção**: mesmo padrão já comprovado no projeto
(`_lfMarkRecentlyDeleted`/`_lfIsRecentlyDeleted`, 2026-08-21) — um
registro persistente (`_lfMarkRecentlyDone`/`_lfIsRecentlyDone`,
`js/utils.js`) que blinda a atividade recém-concluída contra reverter,
não importa de qual lado (local ou servidor) o card em si vença a
fusão. `actConfirmDone` já marcava `done=true` corretamente no
momento da conclusão — só faltava esse registro persistente pra
sobreviver ao ciclo de sincronização seguinte.

## Erro cometido e corrigido durante a implementação

Ao inserir o novo registro em `js/utils.js`, uma substituição de texto
removeu acidentalmente a linha `var LF_RECENTLY_DELETED_KEY=...` do
registro de exclusão **já existente** — fazendo aquela função ler/
escrever silenciosamente numa chave errada do armazenamento local
(sem lançar nenhum erro visível). **Rodar a suíte de testes completa
pegou isso imediatamente** — 7 testes falharam, todos do registro de
exclusão, nenhum do meu código novo — antes de eu seguir adiante.
Corrigido, e os 7 voltaram a passar.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/utils.js` | `_lfListsEqualById` normalizada (Bug 1); registro `_lfMarkRecentlyDone`/`_lfIsRecentlyDone` novo (Bug 2) |
| `js/agenda.js` | `actConfirmDone` marca o registro de conclusão recente |
| `src/modules/kanban/runtime/kanban-helpers.js` | `_mergeKeepLocalOnly` protege `card.activities` contra reverter |
| `tests/lf-lists-equal-by-id.test.js` | +6 testes (ordem de chaves) |
| `tests/lf-merge-activities-mirror-protection.test.js` | novo — 7 testes |
| `tests/lf-recently-done-protection.test.js` | novo — 7 testes |

## Verificação

```
node --check (todos os arquivos .js tocados) → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 221/221 testes (201 + 20 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Sobre "limpo igual Bitrix"

Essas duas correções atacam causas raiz reais e confirmadas — não são
"esconder o sintoma". Dito isso, sendo honesto: nenhum CRM (incluindo
o Bitrix) está livre de bug nenhum — o objetivo realista é reduzir a
frequência e a gravidade dos que existem, não prometer zero. As duas
classes de bug investigadas aqui (repintura desnecessária por
comparação frágil; dado revertido por corrida de sincronização) são
exatamente o tipo de coisa que, corrigida na raiz como fiz aqui, para
de se repetir — não só nesses dois casos específicos, mas em qualquer
situação futura que ative o mesmo caminho de código.

## Reversão

Reversível arquivo por arquivo — mas as duas correções são aditivas
(não mudam nenhum comportamento existente fora dos cenários de bug
específicos), então não há motivo prático pra reverter.
