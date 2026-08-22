# RELATÓRIO — FIX transferência em massa travando + leads indo pra "Livre" sozinhos

**Data:** 21/08/2026
**Relatado por:** Rhuan Canavarros (Supervisor Executivo)
**Sintomas:** transferir responsável de vários leads de uma vez trava
o sistema inteiro; leads somem e depois voltam — parte com o
responsável certo, parte reclassificados como "Livre" sozinhos.

## Causa raiz 1 — leads virando "Livre" sozinhos (a mais grave)

O sistema tem um recurso que move Leads automaticamente pra etapa
"Livre" (pool de leads que qualquer consultor pode assumir) quando
ficam **3 dias parados sem mudar de etapa** — pensado pra não deixar
lead esquecido.

O problema: **transferir o responsável de um lead nunca reiniciava
esse relógio de 3 dias.** Se um lead já estava parado há um tempo —
motivo bem comum pra um supervisor redistribuir a carteira — ele
chegava no novo responsável **já "vencido"**. Na primeira verificação
automática seguinte (roda em segundo plano, sem nenhuma ação da sua
parte), o sistema via "esse lead está parado há mais de 3 dias" e
empurrava ele pra "Livre" — desfazendo, sem aviso nenhum, a
transferência que você acabou de fazer. Isso bate exatamente com "parte
no meu nome e parte no Livre": os leads que já estavam parados há
menos de 3 dias ficaram normais; os que já estavam vencidos "sumiram"
pra Livre pouco depois de transferidos.

**Correção:** transferir o responsável de um lead agora reinicia esse
relógio — o novo responsável começa do zero, com os 3 dias inteiros
pela frente, já que ele ainda nem teve chance de mexer no lead.

**Arquivo:** `js/relatorios.js`.

## Causa raiz 2 — "travou o sistema" na transferência em massa

Cada card transferido faz até 4 idas-e-voltas de rede (buscar o board
do destinatário, buscar o board de origem, gravar no destinatário,
gravar na origem) — e, numa transferência de vários leads de uma vez,
isso acontece **um card de cada vez, em sequência** (de propósito, pra
evitar um outro bug de corrida — não é ineficiência por acaso).

Achei dois problemas reais nisso:

1. **Sem limite de tempo:** se uma única dessas requisições travasse
   (rede fraca, dados móveis oscilando), a fila inteira ficava
   esperando pra sempre — nenhuma mensagem de erro, nenhum jeito de
   saber que travou de verdade. Bate com "travou todo sistema".
2. **Sem nenhum retorno visual:** mesmo quando está tudo funcionando
   normalmente, transferir muitos leads de uma vez pode legitimamente
   levar dezenas de segundos — e a tela ficava completamente parada
   esse tempo todo, sem indicar que algo estava acontecendo. Fácil de
   parecer travado mesmo estando só devagar.

**Correções:**
- Adicionado um limite de tempo (8 segundos) nas buscas de rede — se
  uma travar, a transferência segue em frente usando o que já está no
  aparelho, em vez de ficar esperando pra sempre.
- Adicionado um indicador "Transferindo X de Y…" na janela, atualizado
  a cada card — agora sempre visível que algo está acontecendo.

**Arquivo:** `js/kanban.js`.

## O que não foi mudado

Mantive a transferência **sequencial** (um card por vez) — é assim de
propósito, pra evitar que várias transferências pro mesmo destino se
sobrescrevam (bug já corrigido antes). Acelerar isso precisaria de uma
mudança mais profunda, com risco de reintroduzir aquele bug antigo —
preferi resolver o travamento (limite de tempo) e a sensação de
travamento (indicador de progresso) sem mexer nessa parte.

## Verificação

```
node --check js/relatorios.js js/kanban.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Selecionar 5-10 leads com pelo menos um deles já parado há mais de
   3 dias na etapa atual.
2. Transferir todos pra um novo responsável.
3. Conferir que a janela mostra "Transferindo X de Y…" durante o
   processo.
4. Esperar a próxima verificação automática (ou forçar um refresh) e
   conferir que **nenhum** lead recém-transferido caiu em "Livre"
   sozinho.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
