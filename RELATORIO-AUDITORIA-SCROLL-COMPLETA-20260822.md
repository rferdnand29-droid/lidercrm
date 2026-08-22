# RELATÓRIO — Auditoria completa de rolagem no Kanban (todos os fluxos)

**Data:** 22/08/2026
**Pedido:** aplicar a correção de rolagem em todos os fluxos que
redesenham o Kanban, não só Descartar/Converter.

## O que fiz

Levantei **todos os 35+ pontos** do código que redesenham o board de
Leads/Negócios (`renderKBLocal`) e conferi, um por um, se cada um está
protegido corretamente contra o reset de rolagem. A grande maioria já
estava correta (protegida pelo mecanismo interno de
`renderKBLocal`/`renderKBMobile`, construído em sessões anteriores).
Achei **2 pontos reais** que ainda faltavam, além dos que já tinha
corrigido na resposta anterior.

## Achados desta rodada

### `applyRespStage()` — mesma corrida do "Converter em massa"

Essa função (trocar responsável + etapa a partir do detalhe do lead)
fazia **dois redesenhos seguidos** — um "otimista" na hora, outro
"final" dentro de um retorno assíncrono do servidor — exatamente a
mesma corrida que já tinha corrigido no "Converter em massa" na
resposta anterior. Corrigido do mesmo jeito: uma única proteção,
armada antes de qualquer redesenho, valendo só depois do último.

### Ela ainda estava acessível pelo `app.html` — achado inesperado

Ao rastrear onde essa função é chamada, descobri que o **botão que a
aciona ("Salvar Responsável / Etapa") ainda existia no `app.html`**,
mesmo depois de eu ter removido esse mesmo painel do `index.html` há
3 sessões (na correção "remover Trocar Responsável, colocar Histórico
no lugar"). Esqueci de aplicar a mesma remoção nos dois arquivos na
época — completei agora, trazendo os dois de volta à paridade.

## Conferido e confirmado correto (sem mudança necessária)

- Toda ação de filtro (nicho, valor, atrasadas, limpar filtros) —
  resetar a rolagem ali é esperado, já que o conteúdo mostrado muda de
  verdade.
- Criar um lead novo (individual ou importação em lote) — ver o card
  recém-criado é o comportamento esperado, não "perder o lugar" numa
  lista que você já estava navegando.
- Arrastar-e-soltar no desktop, mover por toque no mobile, sincronização
  em segundo plano, sincronização entre abas — todos de único board,
  já protegidos internamente.
- Reverter Negócio pra Lead ("regredir") — já estava com a proteção
  correta desde antes.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | proteção de rolagem em `applyRespStage()` |
| `app.html` | removido o painel "Trocar Responsável" (paridade com `index.html`, correção de 3 sessões atrás que tinha ficado incompleta) |

## Verificação

```
node --check js/kanban.js       → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Escopo desta auditoria

Focada no Kanban (Leads/Negócios), que é onde todos os relatos de
rolagem desta conversa aconteceram. Não estendi pra Agenda ou Papo,
que usam mecanismos de renderização diferentes — se notar o mesmo tipo
de problema em alguma dessas telas, me avisa que audito lá também.

## Como validar manualmente

1. Numa etapa com vários leads, rolar até o meio/final da lista.
2. Abrir um lead → trocar responsável e/ou etapa pelo detalhe → a
   rolagem do board por trás deve continuar no lugar.
3. Repetir com Descartar e Converter (individual e em massa) — todos
   devem manter a posição.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
