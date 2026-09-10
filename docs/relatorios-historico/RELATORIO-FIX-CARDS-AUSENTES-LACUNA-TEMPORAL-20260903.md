# RELATORIO-FIX-CARDS-AUSENTES-LACUNA-TEMPORAL-20260903

## Bug

Depois do deploy que já incluía as correções anteriores (patches v1
e v2 para "negócios sumindo"), o problema **persistiu**: clientes com
"Ag" marcado no Bingo (Nando, Léo, Vanicleia, Ana Caroline) continuam
sem o Negócio correspondente aparecendo no quadro.

## Investigação — descartando hipóteses antes de concluir

Antes de assumir que era o mesmo bug de antes, verifiquei uma
possibilidade diferente: será que "Ag marcado no Bingo" **garante**
que existe um Negócio? Confirmei que **não existe nenhuma forma de
criar um cliente no Bingo diretamente** — todo cliente do Bingo nasce
a partir da sincronização de um Negócio (`sourceCardId`). Isso
confirma que o Negócio *deveria* existir — reforça que é mesmo um
problema de sincronização, não ausência real do dado.

Também verifiquei se algum patch mais recente estava "quebrando a
corrente" de encadeamento das funções que meus patches anteriores
envelopam (vários patches diferentes reescrevem `renderKBLocal`) —
descartado: todos os que carregam depois preservam corretamente a
versão anterior.

## Causa raiz da lacuna

O patch anterior (v1-20260901) só verifica "falta algum card?"
**dentro do próprio `renderKBLocal`** — ou seja, só roda quando essa
função é chamada. Se o **primeiro** carregamento do quadro de
Negócios acontecer **antes** dos dados do Bingo terminarem de
carregar (uma corrida bem plausível no boot — Bingo e Kanban vêm de
fontes separadas), a checagem roda cedo demais, não encontra nenhuma
referência do Bingo ainda (porque o Bingo em si ainda está vazio
localmente naquele instante) e conclui — errado — que não falta
nada.

Depois disso, pode não haver **nenhum outro** `renderKBLocal
('negocios')` durante a sessão inteira: a pessoa só olha o quadro
uma vez, e o sync automático de 15s só dispara um re-render quando
detecta alguma mudança — e aqui não detecta nenhuma, já que o
problema é justamente a ausência (nada "mudou" do ponto de vista do
sync). Resultado: a checagem nunca mais roda sozinha depois daquela
primeira tentativa que já nasceu tarde demais.

## Estratégia

Novo patch aditivo (`lf-fix-cards-missing-own-board-v2-20260903.js`),
sem tocar no v1 nem nos patches de supervisor:

1. **Verificação periódica própria**, independente de qualquer
   render acontecer — roda a cada 20s sozinha, e mais uma vez logo
   depois do boot (6s, dando tempo do Bingo carregar antes da
   primeira tentativa).
2. **Botão visível** "🔄 Verificar ausentes" nos quadros de Leads e
   Negócios (PC e app) — permite forçar a checagem na hora, sem
   esperar nenhum ciclo automático.
3. Função de console `window.lfFixMissingCardsNow()` pra diagnóstico
   manual, se precisar.

## Resolvendo agora — sem esperar outro deploy

Com o botão "🔄 Verificar ausentes" (ou a verificação periódica, que
já roda sozinha a cada 20s), os cards que estão faltando **devem
reaparecer automaticamente** assim que a pessoa afetada abrir o
quadro de Negócios com esta versão — não precisa de nenhuma ação
manual de "recriar" o negócio, o dado já existe no servidor, só
precisava ser buscado de novo.

## Fluxos cobertos

- Cache local sem card que o Bingo referencia, detectado tarde ou
  nunca pelo v1 (corrida no boot): agora detectado pela verificação
  periódica independente.
- Qualquer usuário, clicando no botão: força a correção na hora.
- Convive sem conflito com v1/v2 (supervisor) e v1 (próprio board) —
  todos continuam ativos, esta é só mais uma camada de segurança.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/patches/kanban-leads/lf-fix-cards-missing-own-board-v2-20260903.js` | novo |
| `www/js/patches/kanban-leads/lf-fix-cards-missing-own-board-v2-20260903.js` | espelho |
| `index.html`, `app.html`, `www/*` | tag `<script>`; botão "🔄 Verificar ausentes"; versão de cache unificada |

## Verificação

```
node --check (arquivo novo) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados, botão confirmado nos dois
```

## Como validar manualmente

1. Fazer o deploy desta versão.
2. Abrir o quadro de Negócios como o usuário afetado — em até 20s
   (ou clicando "🔄 Verificar ausentes"), os cards ausentes devem
   reaparecer.
3. Conferir no Bingo se cada "Ag" agora corresponde a um card
   visível em Negócios.

## Reversão

Reversível — remover as 2 tags `<script>` (raiz + www), apagar o
arquivo do patch, e remover os 2 botões adicionados. Nada mais foi
alterado.
