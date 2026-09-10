# RELATORIO-ARQUITETURA-GERADOR-PACOTE-CONFLITO-REAL-20260920

## Pedido

Continuar as separações de arquitetura pelas menos difíceis.

## Contexto

Depois da auditoria de dependência de ordem (entrega anterior, que
confirmou nenhum patch depende de uma ordem diferente da atual), o
próximo passo recomendado do item 5 (empacotamento) era gerar um
pacote de teste — concatenação simples, sem reordenar nada — e
validar antes de considerar trocar a produção pra usar isso.

## Decisão importante: gerar e validar, mas NÃO trocar a produção ainda

Reconsiderei o risco de ir direto pra "trocar index.html/app.html pra
usar o pacote": hoje, um erro de sintaxe em UM patch só quebra aquele
patch (script tags são independentes um do outro). Concatenado num
arquivo só, um erro de sintaxe em QUALQUER lugar do pacote impede
TUDO que vem depois dele no MESMO arquivo. Essa é uma mudança de
comportamento real demais pra decidir sozinho sem validação manual
extensa — por isso, esta entrega gera e testa o pacote, mas **não
altera nem index.html nem app.html**.

## O que foi implementado

`scripts/generate-bundle-preview.mjs` — gera, a partir da MESMA ordem
exata já confirmada seguro pela auditoria anterior, dois arquivos por
página (`.bundle.normal.js` e `.bundle.defer.js`, separando scripts
com `defer` — que têm ordem de execução diferente) e valida cada um
com `node --check`. Scripts externos (CDN, tipo Firebase) ficam de
fora — continuam carregando da URL normalmente. Saída vai pra
`dist-bundle-preview/` (fora do controle de versão, só diagnóstico
local).

## Rodado de verdade — achado um bloqueador real

Ao rodar pela primeira vez, o pacote **falhou** a validação de
sintaxe: `Identifier 'syncBusy' has already been declared`.

Investigando: `js/supabase.js` tem `var syncBusy = __storageRuntime.
syncBusy;` (lê de um módulo), e `js/app.js` (carregado depois) tem
`function syncBusy(){...}` (a implementação de verdade). **Hoje,
como scripts separados, isso funciona perfeitamente** — cada um
executa independente, e a função de `app.js` simplesmente sobrescreve
o que `supabase.js` tinha posto antes no mesmo nome global.
**Concatenados num programa só, essa combinação (`var` + `function`
do mesmo nome) vira erro de sintaxe.**

**Não tentei corrigir esse conflito nesta entrega** — resolver isso
exigiria renomear ou reestruturar como esses dois arquivos se
relacionam, o que é uma mudança de comportamento real, fora do escopo
"só análise/preparação" que as duas últimas entregas mantiveram.
Documentar isso aqui é o valor desta etapa: achar o bloqueador ANTES
de arriscar em produção, não depois.

**Importante**: `node --check` para no PRIMEIRO erro — é bem provável
que existam outros conflitos parecidos mais adiante no arquivo, ainda
não descobertos. Resolver o do `syncBusy` só revelaria o próximo.

## Fluxos cobertos

- `npm run bundle:preview` — gera e valida o pacote, sem tocar em
  nada da produção.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/generate-bundle-preview.mjs` | novo |
| `scripts/audit-load-order-deps.mjs` | `readLoadOrder` exportada, pra reaproveitar |
| `package.json` | script `bundle:preview` |
| `.gitignore` | `dist-bundle-preview/` |
| `tests/generate-bundle-preview.test.js` | novo — 4 testes |

## Verificação

```
npm run bundle:preview           → roda, encontra e relata o conflito real (comportamento esperado da ferramenta)
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 97/97 testes (93 + 4 novos)
npx cap sync                     → android/ios sincronizados
```

Nenhum arquivo servido ao usuário foi alterado — só ferramenta de
desenvolvimento e seu teste.

## Próximo passo, se quiser continuar nessa frente

Antes de qualquer tentativa de bundling de verdade, seria preciso: (1)
resolver o conflito do `syncBusy` (e prováveis outros que apareceriam
depois dele) e (2) rodar `npm run bundle:preview` de novo até passar
limpo — só então cogitar trocar a produção pra usar o pacote, ainda
com validação manual extensa antes de qualquer deploy.

## Reversão

Reversível — remover os arquivos novos e as 2 linhas de configuração,
sem efeito em nada mais.
