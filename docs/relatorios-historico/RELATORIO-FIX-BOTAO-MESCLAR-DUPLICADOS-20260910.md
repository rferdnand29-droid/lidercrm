# RELATORIO-FIX-BOTAO-MESCLAR-DUPLICADOS-20260910

## Pedido

Adicionar o botão de mesclar duplicados (estava faltando pra você),
diminuir o "Não é duplicado" e colocar o novo botão ao lado dele.

## Causa raiz

O botão "🔀 Mesclar" já existia no código, mas só aparecia pra quem
tem acesso de administrador (`canDelete`) — a mesma condição que
mostra "somente leitura" nos registros da captura de tela que você
mandou. Como mesclagem já é uma ação recuperável (o registro
"perdedor" vai pra uma lixeira de 30 dias, não é apagado de
verdade), essa restrição fazia mais sentido pra exclusão
permanente do que pra mesclagem — por isso liberei o botão pra
todo mundo, mantendo a exclusão permanente (✕) e a lixeira/
verificação automática restritas a admin, como já eram.

Antes de liberar, confirmei que o fluxo inteiro de mesclagem é
seguro pra qualquer usuário: o seletor de "responsável final" só
permite escolher entre os dois donos já envolvidos no par sendo
mesclado — nunca um terceiro arbitrário — então não existe risco de
alguém reatribuir um registro pra outra pessoa da empresa.

## Estratégia

- Removida a restrição de admin tanto do botão quanto da função
  `openMergeScreen` (que tinha o mesmo bloqueio por dentro, seria
  inútil só mostrar o botão sem isso).
- "Não é duplicado" diminuído (`flex:0 0 auto`, fonte menor, cor
  discreta) e "Mesclar" ganhou mais destaque (`flex:1`, fonte maior,
  negrito) — ficam lado a lado, com o Mesclar ocupando o espaço
  restante.

## Fluxos cobertos

- Qualquer usuário, ao ver um par de duplicados de 2 registros: pode
  mesclar diretamente, sem precisar de admin.
- Exclusão permanente (✕) e Lixeira/Verificação automática: continuam
  restritas a admin, sem mudança.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | botão "Mesclar" liberado pra todos; layout ajustado |

## Verificação

```
node --check js/kanban.js        → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados
```

Testado visualmente (renderização com o CSS real) — layout
confirmado igual ao pedido.

## Como validar manualmente

1. Logar como usuário comum (não admin) e abrir "🔍 Duplicatas".
2. Conferir que o botão "🔀 Mesclar" aparece ao lado de "Não é
   duplicado", visivelmente maior.
3. Mesclar um par de teste — deve funcionar normalmente.

## Reversão

Reversível — uma única alteração pontual em `js/kanban.js`, sem
migração de dado.
