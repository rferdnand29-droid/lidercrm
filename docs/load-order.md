# Contrato de carregamento dos scripts

`index.html` é o entrypoint canônico. A ordem dos scripts continua
deliberadamente manual, mas agora está dividida por marcadores
`LF-LOAD-GROUP`:

1. `bootstrap`: configuração, guardas e inicialização mínima.
2. `core-legacy`: storage, API, autenticação e runtime legado.
3. `screens`: stores e scripts das telas.
4. `core-services`: namespace, HTTP, repositórios, serviços e offline.
5. `patches`: patches que precisam do núcleo já disponível.
6. `patches-late`: patches carregados no fim do body.
7. `screen-chat-lazy`: exceção deliberada para o núcleo do Papo.

A ordem efetiva é importante: scripts normais executam na sequência do
HTML; scripts `defer` executam depois de todos os normais, mantendo a
ordem entre si. Por isso, não basta olhar somente a posição visual de uma
tag `defer`.

## Verificação

```bash
npm run check:load-order
```

O comando lê `scripts/load-order-contract.json` e falha quando encontra
arquivo ausente, script duplicado, grupo não documentado, transição de
seção inesperada, dependência declarada fora de ordem, dependência `async`
ou um wrapper que encontra a função-base somente depois.

Ao adicionar ou mover um script:

1. Coloque-o no bloco `LF-LOAD-GROUP` correto.
2. Se ele depender de outro script, registre a dependência no manifesto.
3. Se for um patch que envolve uma função global, rode a verificação e a
   auditoria exploratória:

```bash
npm run check:load-order
npm run audit:load-order
```

Não altere `app.html` manualmente. Depois de qualquer alteração em
`index.html`, rode `npm run html:sync` para regenerar o espelho e os
mirrors quando o fluxo de build for executado.