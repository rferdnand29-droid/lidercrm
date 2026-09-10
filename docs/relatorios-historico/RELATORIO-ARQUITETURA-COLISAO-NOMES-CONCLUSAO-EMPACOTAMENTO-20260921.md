# RELATORIO-ARQUITETURA-COLISAO-NOMES-CONCLUSAO-EMPACOTAMENTO-20260921

## Pedido

Continuar as separações de arquitetura pelas menos difíceis.

## Contexto

A entrega anterior encontrou um bloqueador real (`syncBusy` declarado
como `var` num arquivo e `function` noutro, colidindo quando
concatenados) ao gerar um pacote de teste. Esta entrega aprofunda essa
investigação — com uma conclusão bem mais importante do que eu
esperava.

## Tentativa de isolar a causa exata — sem sucesso, e por quê parei

Tentei reproduzir o erro exato (`Identifier 'syncBusy' has already
been declared`) num caso de teste isolado e simplificado — inclusive
replicando a distância real de ~18 mil linhas entre as duas
declarações. **Não consegui reproduzir isso num teste simplificado**,
mesmo replicando a escala. Decidi que continuar tentando isolar a
regra exata do V8 não valia mais o tempo, já que o que importa na
prática já estava confirmado: o pacote real, de verdade, falha —
reprodutível, sempre no mesmo lugar.

## O achado maior: não é um caso isolado, são 64

Em vez de continuar tentando entender o mecanismo exato do V8,
construí uma ferramenta que busca TODA colisão de nome no nível mais
externo entre arquivos (não só a primeira que travaria `node
--check`). Resultado: **64 colisões**, não 1.

**A maioria segue um padrão só**: um arquivo "módulo runtime" (ex.:
`src/modules/storage/runtime/fs-compat-engine.js`) declara `function
NOME(){...}` de verdade, e o arquivo "orquestrador" correspondente
(ex.: `js/supabase.js`) declara `var NOME = __storageRuntime.NOME ||
padrão;` pra ler essa função. **Esse é o padrão arquitetural
INTENCIONAL usado em praticamente todo o projeto** (documentado em
`docs/architecture.md`) — não é um erro, é como os módulos "runtime"
foram desenhados pra se comunicar com os arquivos que os usam.

## Conclusão honesta: concatenação simples não é viável assim, do jeito que foi planejada

Isso muda a recomendação da entrega anterior. Não é "resolver o
`syncBusy` e tentar de novo" — é: **o padrão arquitetural usado em
todo o projeto (módulo runtime expõe função, orquestrador lê via
`var X = namespace.X`) é fundamentalmente incompatível com
concatenação de texto simples**, porque gera exatamente esse tipo de
colisão em dezenas de pares de arquivos.

Pra resolver isso de verdade, doeria ser um dos dois caminhos —
nenhum dos dois cabe numa continuação rápida:
1. **Um bundler de verdade** (esbuild, Rollup) que entende escopo de
   módulo corretamente, em vez de concatenação de texto — mas isso
   exigiria reescrever os ~180 arquivos como módulos ES de verdade
   (`import`/`export`), uma mudança grande.
2. **Reestruturar o padrão runtime/orquestrador** em todos os ~30
   pares afetados, pra não colidir — trabalho extenso, tocando
   arquivos centrais do sistema, com risco real de regressão.

## Fluxos cobertos

- `npm run audit:name-collisions` — lista as 64 colisões completas,
  sem alterar nada.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/find-name-collisions.mjs` | novo |
| `package.json` | script `audit:name-collisions` |
| `tests/find-name-collisions.test.js` | novo — 5 testes |

## Verificação

```
node scripts/find-name-collisions.mjs → roda, lista as 64 colisões (comportamento esperado)
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 102/102 testes (97 + 5 novos)
npx cap sync                     → android/ios sincronizados
```

Nenhum arquivo servido ao usuário foi alterado — só ferramenta de
desenvolvimento e seu teste.

## Recomendação pro item 5 (empacotamento) a partir daqui

Com esse achado, não recomendo continuar tentando a concatenação
simples — o caminho de menor risco que resta é o item 6 do plano
original (minificar/otimizar cada arquivo individualmente, sem
concatenar) ou aceitar os 180+ arquivos como estão e priorizar outra
frente do plano de estabilidade. Uma reescrita de verdade pra módulos
ES (`import`/`export`) é bem maior que "menos difícil" — se quiser
seguir esse caminho, merece ser tratado como projeto separado, com
planejamento próprio.

## Reversão

Reversível — remover os 2 arquivos novos e a linha do `package.json`,
sem efeito em nada mais.
