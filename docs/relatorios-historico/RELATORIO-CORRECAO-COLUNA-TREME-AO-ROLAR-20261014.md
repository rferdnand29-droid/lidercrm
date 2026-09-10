# RELATORIO-CORRECAO-COLUNA-TREME-AO-ROLAR-20261014

## Pedido

Corrigir a sensação de "a etapa treme/mexe sozinha" especificamente
ao rolar pra baixo dentro de uma coluna do Kanban — diferente do que
já foi corrigido antes (tremor por comparação de dado; reconstrução
completa ao digitar).

## Causa raiz encontrada

O Kanban já tinha uma lógica bem pensada pra preservar a posição de
rolagem quando o quadro é redesenhado em segundo plano (sincronização
de 15s, tempo real, autosave) — captura a posição ANTES de
redesenhar, e força de volta DEPOIS, com um reforço extra 400ms mais
tarde "pra garantir".

O problema: se esse redesenho em segundo plano acontecer **bem no
momento em que você está rolando manualmente** uma coluna, essa
lógica de preservação briga com o seu próprio gesto — força a coluna
de volta pra onde ela estava ANTES do redesenho, ignorando pra onde
você já tinha rolado desde então. Isso é percebido como "a coluna
treme/mexe sozinha".

## A correção

Passei a rastrear rolagem ativa por coluna (ouvindo o evento de
scroll do navegador). Quando o quadro precisa ser redesenhado, se uma
coluna específica teve rolagem manual recente, a restauração **não
mexe nela** — confia na posição atual que você já definiu rolando,
em vez de forçar de volta pra posição antiga.

## Achado real durante o próprio teste automatizado

Minha primeira versão usava uma janela de proteção de 400ms — mas o
reforço de segurança que já existia (`setTimeout` de 400ms, "pra
garantir") dispara **exatamente** nesse mesmo instante. Se você
rolasse uma vez e parasse, havia uma chance real de esse reforço
desproteger a coluna bem nessa hora e forçar a posição antiga de
volta de qualquer forma. Só descobri isso porque escrevi o teste
antes de confiar no código — corrigido alargando a janela de proteção
pra 900ms, com folga confortável sobre o reforço de 400ms.

## Verificação

Escrevi 4 testes cobrindo: (1) sem rolagem ativa, a restauração
funciona normalmente; (2) com rolagem ativa recente, a coluna não é
mexida, nem pelo reforço de 400ms; (3) a proteção expira depois de
900ms (não protege pra sempre); (4) a proteção é por coluna — rolar
uma não afeta a restauração de outra.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | rastreamento de rolagem ativa; `_kbRestoreScrollState` não mexe em coluna recém-rolada |
| `tests/kb-scroll-restore-active-scroll-guard.test.js` | novo — 4 testes |

## Checklist

```
node --check js/kanban.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 277/277 testes (273 + 4 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Como confirmar que resolveu

Abra o Kanban com vários cartões numa coluna (o suficiente pra
precisar rolar), role manualmente devagar por um tempo (mais de 15
segundos, pra atravessar pelo menos um ciclo de sincronização em
segundo plano). A coluna não deve mais "puxar de volta" sozinha
durante a rolagem.

## Reversão

Reversível isoladamente — remover o rastreamento de rolagem ativa e a
checagem correspondente em `_kbRestoreScrollState` — mas isso reabre
o problema confirmado. Não recomendo reverter.
