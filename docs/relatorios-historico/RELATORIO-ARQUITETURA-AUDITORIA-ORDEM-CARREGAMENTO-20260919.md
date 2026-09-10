# RELATORIO-ARQUITETURA-AUDITORIA-ORDEM-CARREGAMENTO-20260919

## Pedido

Continuar as separações de arquitetura pelas menos difíceis.

## Contexto

Do plano de estabilidade, item 5 (empacotamento) tinha como primeiro
passo recomendado: uma auditoria que mapeia quais dos 180+ `<script>`
dependem de rodar depois de outro específico — sem essa informação,
qualquer empacotador que reordene ou faça tree-shaking corre o risco
de quebrar esses "encapsulamentos" silenciosamente.

## O que foi implementado

`scripts/audit-load-order-deps.mjs` — script novo, só análise, não
muda absolutamente nada no carregamento real. Lê todo `js/patches`
(recursivo), identifica o padrão `var orig=global.X; ...;
global.X=função nova` (o mesmo padrão de "encapsular sem substituir"
usado em dezenas de patches deste projeto), e cruza com a ORDEM REAL
de carregamento em `index.html` — incluindo tratamento correto de
scripts com `defer` (que rodam depois de todo script normal,
independente da posição no HTML).

Registrado como `npm run audit:load-order` pra rodar de novo quando
quiser.

## Rodado de verdade — o que a auditoria revelou

124 patches analisados, 15 encapsulamentos de função global
encontrados. Dois casos onde MAIS DE UM patch encapsula a mesma
função (`loadUsersDB`, `saveUsersLocal`) — **os dois já estão na
ordem certa hoje**, nenhum problema encontrado no estado atual do
projeto.

## Dois erros cometidos e corrigidos durante a construção da própria auditoria

1. **Erro de sintaxe no comentário do próprio script**: a descrição
   do padrão de arquivo `js/patches/**/*.js` dentro de um comentário
   `/* */` continha literalmente a sequência `*/`, fechando o
   comentário sem querer no meio do texto. `node --check`-equivalente
   (rodar o script) pegou isso na hora.
2. **Falso positivo real, corrigido**: a primeira versão do regex
   confundia `e.target`/`a.target` (propriedades comuns de evento e
   elemento do DOM) com "encapsulamento de função global", porque
   aceitava qualquer `objeto.propriedade`, não só os namespaces
   globais de verdade (`window`/`global`/`LF`/`NS_LF`). Corrigido
   depois de investigar o resultado suspeito manualmente.

Os dois erros já estão cobertos por teste de regressão automatizado
— não deveriam voltar a acontecer.

## Fluxos cobertos

- `npm run audit:load-order` — mostra o retrato completo de
  dependências de ordem entre patches, sem alterar nada.
- Detecta corretamente scripts com `defer`/`async` (ordem de execução
  diferente da posição no HTML).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/audit-load-order-deps.mjs` | novo |
| `package.json` | script `audit:load-order` |
| `tests/audit-load-order-deps.test.js` | novo — 5 testes |

## Verificação

```
node scripts/audit-load-order-deps.mjs → roda sem erro, resultado limpo
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 93/93 testes (88 + 5 novos)
npx cap sync                     → android/ios sincronizados
```

Nenhum arquivo servido ao usuário (`index.html`/`app.html`/`js/*.js`
de produção) foi alterado — só uma ferramenta de desenvolvimento e
seu teste.

## Próximo passo, se quiser continuar nessa frente

Com este mapa em mãos, o próximo passo seguro (ainda dentro do item
5) seria um empacotador em modo "concatenação simples" — junta os
arquivos na MESMA ordem exata que já sabemos ser segura, sem
reordenar nem fazer tree-shaking, resolvendo só o problema de "180+
arquivos separados" sem arriscar nenhum comportamento.

## Reversão

Reversível — remover os 2 arquivos novos e a linha do `package.json`,
sem efeito em nada mais.
