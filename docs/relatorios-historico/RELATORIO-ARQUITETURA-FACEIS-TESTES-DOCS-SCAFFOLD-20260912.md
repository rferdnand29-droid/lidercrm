# RELATORIO-ARQUITETURA-FACEIS-TESTES-DOCS-SCAFFOLD-20260912

## Pedido

Executar os itens "fáceis" da avaliação de arquitetura: expandir
cobertura de testes (duplicados/mesclagem e Analytics), documentar a
arquitetura de sincronização, e reconsiderar o scaffold React órfão.

## 1. Testes novos — duplicados e Analytics

12 testes novos, contra o **código-fonte real** (mesma técnica já
usada nos testes anteriores — carrega os arquivos via `eval`, não uma
cópia):

- **`tests/lf-dup-fields-match.test.js`** (7 testes) — a regra de
  detecção de duplicados. Cobre exatamente o pedido explícito de uma
  sessão anterior: telefone é a única condição válida (nome batendo
  sozinho nunca conta; telefone batendo sempre conta, mesmo com nomes
  diferentes ou um dos dois sem nome); comparação entre boards
  diferentes (Lead × Negócio); telefone com formatação diferente
  ainda bate; telefone curto demais não conta.
- **`tests/lf-analytics-counting.test.js`** (5 testes) — "Leads
  Adicionados"/"Leads Convertidos". Tem um teste de regressão
  explícito contra o bug real da Taxa de Conversão em 160%: garante
  que "convertidos" nunca é maior que "adicionados" no mesmo período,
  porque os dois usam a mesma referência de data.

Não testei a mesclagem em si (`_mergeExecuteCore`) — envolve gravação
em múltiplos boards e tentativa de rede, mais arriscado de isolar sem
mockar bastante coisa. Fica como próximo passo se quiser aprofundar
mais essa área depois.

## 2. Documentação da arquitetura de sincronização

Nova seção em `docs/architecture.md` (não criei um arquivo separado —
o projeto já tinha um documento de arquitetura, e duplicar conteúdo
só criaria a chance de as duas versões divergirem). Explica os 4
mecanismos que convivem hoje (sondagem de 15s, `BroadcastChannel`
entre abas, fila de retentativas, merge com proteção contra corrida),
como se encaixam, e os pontos de risco já encontrados nesta sessão —
incluindo um aviso explícito sobre a duplicação de implementação que
já causou um bug real, com instrução de como evitar que aconteça de
novo.

## 3. Scaffold React — reconsiderado, ainda não removido

Continuo sem conseguir confirmar com certeza se é seguro remover
(dependeria do suporte da Lovable). Em vez de deixar essa incerteza
sem registro, criei `src/README.md` explicando claramente: o que é
usado de verdade em `src/` (não mexer) versus o que é provavelmente
scaffold não utilizado da Lovable (achado + evidências + tamanho +
o que fazer antes de remover). Isso evita que uma sessão futura
minha ou de outra pessoa perca tempo reinvestigando do zero, ou pior,
remova sem essa mesma cautela.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `tests/lf-dup-fields-match.test.js` | novo — 7 testes |
| `tests/lf-analytics-counting.test.js` | novo — 5 testes |
| `docs/architecture.md` | nova seção sobre sincronização |
| `src/README.md` | novo — documenta o scaffold React |

## Verificação

```
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 71/71 testes (59 + 12 novos)
npx cap sync                     → android/ios sincronizados
```

Nenhum arquivo servido ao usuário (`index.html`/`app.html`/`js/*.js`)
foi alterado nesta rodada — só testes e documentação. Não foi
necessário bumpar a versão de cache.

## Reversão

Todos os arquivos desta rodada são aditivos (testes/documentação) —
remover não afeta nenhum comportamento do CRM.
