# RELATÓRIO — Removido bloqueio de telefone repetido na importação em lote

**Data:** 23/08/2026
**Pedido:** parar de pular/não adicionar contatos repetidos na
importação em lote.

## O que era

A importação em lote tinha um bloqueio duplo (já existia antes das
correções desta sessão) que **pulava silenciosamente** qualquer linha
cujo telefone:
- já existisse em outro cadastro do CRM, ou
- se repetisse dentro do próprio lote sendo importado.

A pessoa só descobria que algo tinha sido pulado por uma contagem
genérica no aviso final ("X duplicata(s) bloqueada(s)") — sem saber
quais, sem poder revisar.

## Correção

Removido por completo — toda linha da lista agora é importada, sem
nenhum bloqueio por telefone repetido. Limpo junto o código que só
existia pra sustentar esse bloqueio (não sobrou nada órfão).

## O que continua disponível pra quem quiser revisar depois

Nada foi perdido em termos de visibilidade — só o **bloqueio**
silencioso foi removido:
- A flag "Lead Repetido" (recém-implementada) continua marcando
  automaticamente quem bate com um Negócio existente ou Lead já
  Convertido.
- O motor de duplicados ("🔍 Duplicatas") continua rodando
  normalmente sobre os leads recém-importados, incluindo os que se
  repetem entre si dentro do próprio lote.

## Arquivo

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | `confirmBatchImport()` — bloqueio removido |

## Verificação

```
node --check js/kanban.js        → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Montar uma lista de importação com 2-3 contatos usando o mesmo
   telefone (ou um telefone que já existe no CRM).
2. Importar — todos devem entrar, nenhum deve ser pulado.
3. Conferir o aviso final — não deve mais mencionar duplicatas
   bloqueadas.

## Reversão

Reversível — é uma remoção pontual de código, sem migração de dado.
