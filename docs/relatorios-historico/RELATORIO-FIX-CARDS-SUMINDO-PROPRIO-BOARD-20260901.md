# RELATORIO-FIX-CARDS-SUMINDO-PROPRIO-BOARD-20260901

## Bug

**Erro grave**, com prints: clientes com etapa "Ag" (Agendado)
marcada no Bingo (Nando, Léo, Vanicleia, Ana Caroline) não apareciam
em nenhuma coluna do quadro de Negócios — mesmo o Bingo provando que
o negócio existia. Outros clientes (Katia, Paulo) apareciam
corretamente nos dois lugares.

## Causa raiz

**Mesmo mecanismo já diagnosticado e corrigido antes** — só que a
correção anterior era restrita demais. Os patches
`lf-fix-negocios-supervisor-board-v1-20260826.js` e
`v2-20260827.js` (criados numa sessão anterior pra corrigir
"negócios sumindo pro supervisor") só disparavam a reidratação do
cache quando `_isSupervisor()` era verdadeiro — ou seja, **só pra
quem é supervisor/gestor de equipe**. Um consultor comum, olhando o
**próprio** board, ficava com **zero proteção** contra o mesmo
problema de origem: uma transferência otimista (assumir lead,
mesclagem trocando dono, conversão) que grava o card local e falha
ao confirmar no servidor, deixando o cache local faltando card(s) que
o Bingo já tinha sincronizado.

Esse é o motivo exato de "alguns aparecem, outros não" nas suas
fotos — os que sumiram foram os que passaram por esse tipo de
transferência sem a confirmação do servidor chegar a tempo; os que
apareceram certinho nunca tiveram esse problema.

## Estratégia

Novo patch aditivo, sem tocar nos v1/v2 existentes (que continuam
cobrindo o caso adicional de supervisor olhando o time):
`lf-fix-cards-missing-own-board-v1-20260901.js`. Mesma técnica do v2
— compara os negócios que o Bingo do usuário logado referencia
contra os que realmente existem no cache local do **próprio** board
— mas **sem nenhuma condição de cargo**. Qualquer pessoa, de
qualquer papel, tem o próprio board protegido agora.

## Fluxos cobertos

- Consultor comum com cache do próprio board faltando card(s) que o
  Bingo referencia → reidratado automaticamente.
- Supervisor olhando o time → continua coberto pelos v1/v2, sem
  mudança.
- Board totalmente vazio ou parcialmente vazio → ambos os casos
  cobertos, igual ao v2.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/patches/kanban-leads/lf-fix-cards-missing-own-board-v1-20260901.js` | novo |
| `www/js/patches/kanban-leads/lf-fix-cards-missing-own-board-v1-20260901.js` | espelho |
| `index.html`, `app.html`, `www/*` | tag `<script>` registrada; versão de cache unificada; `lf-build-id` atualizado |
| `js/lf-build-info.js`, `www/js/lf-build-info.js` | `builtAt` atualizado |

## Verificação

```
node --check js/patches/kanban-leads/lf-fix-cards-missing-own-board-v1-20260901.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
```

## Como validar manualmente

1. Logar como consultor comum (não supervisor/gestor).
2. Verificar no Bingo se algum cliente tem etapa "Ag" marcada mas não
   aparece em nenhuma coluna do quadro de Negócios.
3. Recarregar a página (ou navegar pra Negócios de novo) — o card
   deve reaparecer automaticamente em alguns segundos.

## Reversão

Reversível — remover as 2 tags `<script>` (raiz + www) + apagar os 2
arquivos do patch. v1/v2 continuam funcionando exatamente como antes,
sem qualquer dependência deste novo patch.
