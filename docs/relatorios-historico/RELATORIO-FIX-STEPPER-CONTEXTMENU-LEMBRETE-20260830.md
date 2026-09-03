# RELATORIO-FIX-STEPPER-CONTEXTMENU-LEMBRETE-20260830

## Bug

Três problemas relatados juntos, com capturas de tela:
1. Ao mudar de etapa dentro do modal de detalhes, o stepper visual
   "volta" pra uma interface antiga em vez de continuar com a nova.
2. Pedido pra remover permanentemente um pequeno ícone de relógio dos
   cards.
3. Botão direito do mouse num card, na aba Negócios, abre os
   Detalhes — deveria abrir Editar (como já acontece em Leads).

## Causa raiz

**1 (stepper volta pra versão antiga):** o modal de detalhes tinha
**duas implementações separadas** do mesmo elemento visual (o
stepper de etapas — círculos conectados por uma linha, visível na
sua primeira foto). Uma, usada só ao **abrir** o modal, gerava a
marcação nova (a bonita, com círculos). A outra, usada depois de
**clicar numa etapa pra mudar** (dentro de `moveCard`), reconstruía
o mesmo elemento com uma marcação diferente e mais antiga — botões
simples com estilo inline, sem o visual de círculos. As duas foram
divergindo ao longo do tempo até ficarem visivelmente diferentes.

**2 (reloginho nos cards):** investiguei a fundo e encontrei um botão
de atalho chamado "Lembrete" presente em todo card do Kanban (Leads e
Negócios), que abre a tela rápida de criar lembrete/atividade sem
precisar entrar no detalhe completo do card.

**3 (botão direito abre Detalhes em vez de Editar):** o próprio
código já tinha um comentário dizendo a intenção certa ("botão
direito do mouse abre editar lead/negócio"), mas a implementação só
aplicava isso pra Leads — Negócios caía num "senão" que abria
Detalhes.

## Estratégia

1. Extraída uma função só (`_renderDetStageStepper`), usada tanto ao
   abrir o modal quanto depois de mudar de etapa — elimina a
   divergência de vez, já que agora só existe uma implementação.
2. Removido o botão "Lembrete" dos cards do Kanban. A funcionalidade
   em si **não foi removida** — continua acessível normalmente dentro
   do modal de detalhes, na seção "Lembretes e atividades". Só o
   atalho direto no card saiu.
3. Corrigida a condição do botão direito do mouse — agora abre Editar
   tanto em Leads quanto em Negócios, igual ao que o comentário no
   código já dizia ser a intenção original.

## Nota de honestidade sobre o item 2

A foto que você mandou está com boa qualidade, mas o ângulo e reflexo
da tela dificultaram identificar com 100% de certeza qual ícone
exato você quis dizer — investiguei a fundo (card desktop, card
mobile, patches relacionados) e o único elemento de card
relacionado a lembrete/relógio que encontrei foi esse botão
"Lembrete". Se não for exatamente isso que você via na tela, me
manda um print mais de perto (só do card, sem o resto da tela) que
eu ajusto certinho.

## Fluxos cobertos

- Mudar etapa pelo stepper do modal de detalhes: continua com o
  visual novo (círculos), não volta mais pro antigo.
- Cards do Kanban (Leads e Negócios): sem o botão "Lembrete" — a
  funcionalidade permanece acessível pelo detalhe do card.
- Botão direito num card de Negócio: abre Editar, igual já acontecia
  em Leads.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | stepper unificado numa função só; botão "Lembrete" removido dos cards; botão direito consistente entre Leads e Negócios |

## Verificação

```
node --check js/kanban.js        → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
```

## Como validar manualmente

1. Abrir um lead/negócio, clicar numa etapa diferente no stepper —
   deve continuar com o visual de círculos, sem "piscar" pra uma
   versão antiga.
2. Olhar os cards do Kanban (Leads e Negócios) — não deve mais
   aparecer o botão "Lembrete".
3. Botão direito num card de Negócio — deve abrir a tela de Editar.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
