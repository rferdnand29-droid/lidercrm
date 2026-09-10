# RELATÓRIO — Item 6 (final): Lead Repetido

**Data:** 23/08/2026
**Escopo:** último item do documento — flag "Lead Repetido", conceito
separado do motor de duplicados. Com isso, o documento inteiro está
implementado.

---

## Achado que facilitou tudo

Antes de escrever qualquer lógica nova, encontrei uma badge
("repetido", classe `mb-card-dup-badge`) já existente na renderização
do card, checando um campo `c._dup` — **mas esse campo nunca era
definido em lugar nenhum do código**. Era uma feature pela metade,
esquecida. Reaproveitei essa mesma infraestrutura em vez de criar um
sistema paralelo com nome parecido (o que geraria confusão).

## O que foi implementado

- **Detecção automática**: quando um Lead novo é criado (individual
  ou importação em lote) e o telefone já bate com um **Negócio
  existente** ou um **Lead já Convertido** (não outro Lead ainda
  aberto — isso é o motor de duplicados normal, já entregue), o Lead
  novo nasce com a flag `_dup` marcada.
- **Preenchimento automático**: se o Lead novo ainda não tem nicho
  definido, herda o nicho do registro batido.
- **Lista de exceção**: telefones cadastrados nunca disparam a flag,
  mesmo batendo com um cliente estabelecido — gerenciável na mesma
  tela "⚙️ Configurar" das fases anteriores.
- **Filtrável**: novo chip "🔁 Lead Repetido" no painel de Filtros (só
  aparece em Leads, que é onde a flag existe).
- **Visível nos dois cards**: a badge "repetido" agora aparece tanto
  no card mobile quanto no desktop (antes só tinha estilo pro mobile).
- **Protegido do motor de duplicados**: não precisou de código extra
  — o motor de duplicados só compara dentro do mesmo tipo (Lead com
  Lead, Negócio com Negócio), então nunca cruza com o Negócio/Lead
  convertido que gerou o "repetido" pra começar.

## Adaptação registrada

O documento fala em "Contato ou Empresa já existente" — como esse app
não tem essas entidades separadas (mesma adaptação já registrada nas
fases anteriores), usei Negócio existente e Lead Convertido como os
equivalentes reais de "cliente já estabelecido". A lista de exceção
também é por telefone, não por contato/empresa.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | detecção, lista de exceção, filtro, badge no desktop |
| `index.html`, `app.html` | chip de filtro "Lead Repetido" |
| `css/style.css` | badge com estilo válido também no desktop |

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

1. Criar um Negócio com um telefone específico.
2. Criar um Lead novo com o **mesmo** telefone — deve nascer com a
   badge "repetido" e o nicho preenchido automaticamente.
3. Em Filtros → "🔁 Lead Repetido" → "Só repetidos" — deve mostrar só
   esse Lead.
4. Em "⚙️ Configurar", adicionar esse telefone na lista de exceção →
   criar outro Lead com o mesmo número → não deve mais marcar repetido.

---

## Documento completo — status final

| Item | Situação |
|---|---|
| 0 — Conversão Lead→Negócio | ✅ |
| 1 — Controle de Duplicados | ✅ |
| 2 — Verificação agendada | ✅ (limitação arquitetural registrada) |
| 3 — Mesclagem automática | ✅ |
| 4 — Mesclagem manual | ✅ |
| 5 — Observador | ✅ (limitação de alcance registrada) |
| 6 — Lead Repetido | ✅ |

Todo o documento foi implementado. As duas limitações registradas ao
longo do caminho (job agendado sem infraestrutura de servidor de
verdade; Observador fora do escopo normal de sincronização) são
arquiteturais — não dá pra resolvê-las só com código de tela, exigem
mudança na camada de sincronização/servidor. Seguem documentadas nos
relatórios de cada fase, caso queira endereçar num projeto futuro.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
