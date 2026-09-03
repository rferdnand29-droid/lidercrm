# src/shared/utils/

O diretório mantém somente `namespace.js`, que inicializa
`window.LiderCRM.utils` para os módulos client-side que realmente estão
carregados. Os seis helpers opcionais que existiam aqui não tinham
nenhum consumidor no app nem apareciam no entrypoint; foram removidos
para não parecerem dependências disponíveis quando não são.

## Convenção

Tudo pendurado em `window.LiderCRM.utils.*` — nunca em globais soltas — para
não colidir com nada que já existe no projeto (o app inteiro hoje usa
globais soltas tipo `fmtBRL`, `toast`, `debounce`; um namespace próprio
evita qualquer sombreamento acidental).

`namespace.js` deve ser carregado antes de qualquer módulo que publique
funções em `LiderCRM.utils`.

## Se um dia quiser conectar de verdade

Se um novo helper for necessário, primeiro adicione um consumidor real e
uma regra de carregamento em `scripts/load-order-contract.json`; não
reintroduza bibliotecas soltas sem uso.
