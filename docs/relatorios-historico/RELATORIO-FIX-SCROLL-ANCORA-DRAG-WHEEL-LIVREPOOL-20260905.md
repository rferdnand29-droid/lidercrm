# RELATORIO-FIX-SCROLL-ANCORA-DRAG-WHEEL-LIVREPOOL-20260905

## Bug

Três pedidos:
1. Scroll das colunas "pula" sozinho ao mover, descartar, excluir ou
   converter um lead/negócio.
2. Poder rolar a coluna com a roda do mouse enquanto segura um card
   arrastado, pra escolher a posição exata onde soltar.
3. Ainda é necessário dar F5 pra um lead excluído sumir de vez.

## Causa raiz

**1 (scroll "pulando"):** a captura/restauração de scroll era
baseada em **posição em pixels** da coluna. Quando um card **acima**
da área visível é removido (mover, descartar, excluir, converter), o
conteúdo da coluna desloca pra cima — restaurar o mesmo valor em
pixels mostra outra coisa, dando a sensação de "pulou", mesmo o
mecanismo "funcionando" tecnicamente. Achei também uma lacuna real:
**descartar um Lead nunca capturava/restaurava scroll nenhum** —
diferente de excluir/converter/mover, que já faziam isso.

**2 (rolar durante o arraste pra escolher posição):** a rolagem em si
já funcionava (de uma correção anterior), e soltar o card já
respeitava a posição exata (não só "no fim da coluna"). Mas achei uma
lacuna sutil: o indicador visual de "onde vai cair" só se atualizava
quando o **mouse se move** (evento nativo do navegador). Rolar com a
rodinha **sem mexer o mouse** trazia outros cards pra baixo do
cursor, mas o indicador ficava parado na última posição calculada.

**3 (F5 ainda necessário pra excluir):** achei um cache **separado**,
específico do pool "Livre" (leads na etapa Livre, compartilhados
entre consultores — cada um vê os leads livres dos outros). Excluir
ou descartar um lead **nunca invalidava esse cache específico** — só
se atualizava sozinho a cada 15s de sondagem (ou nunca, se ninguém
mais mexesse em nada nesse meio-tempo). Pra outros consultores vendo
esse pool compartilhado, o lead excluído continuava aparecendo até
uma atualização manual.

## Estratégia

1. Reescritas as duas funções de captura/restauração de scroll
   (`_kbCaptureScrollSnapshot`/`_kbCaptureScrollState` e seus pares
   de restauração) pra ancorar por **card** (usando o
   `dataset.id` que cada card já tem no DOM) em vez de pixel —
   acha o card mais próximo do topo da área visível, guarda quanto já
   tinha rolado "dentro" dele, e na restauração acha esse MESMO card
   de novo (mesmo que sua posição relativa tenha mudado) e rola pra
   deixá-lo exatamente onde estava. Mantém o valor em pixels como
   reserva, só usado se o card-âncora não existir mais (ex.: foi ele
   mesmo que saiu). Adicionada também a captura/restauração que
   faltava no fluxo de descarte de Leads.
2. A rolagem por roda do mouse durante o arraste agora também
   recalcula o indicador de posição de soltura, reaproveitando a
   mesma lógica que já roda no evento nativo de arraste.
3. Excluir ou descartar um Lead força a atualização do cache do pool
   Livre na hora (em segundo plano, sem recarregar a página) — mesma
   chamada que já existia pra quando alguém assume um lead livre.

## Fluxos cobertos

- Mover, descartar, excluir ou converter um card: coluna não "pula"
  mais visualmente, mesmo com cards sendo removidos acima da área
  visível.
- Arrastar um card e rolar com a roda pra ver outros cards: o
  indicador de onde vai cair acompanha corretamente.
- Excluir/descartar um Lead na etapa Livre: outros consultores param
  de ver esse lead na hora, sem precisar de F5.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/kanban.js` | scroll ancorado por card (2 pares de função); wheel durante arraste recalcula posição de soltura |
| `js/relatorios.js` | exclusão de Lead força atualização do pool Livre |
| `js/patches/lf-fix-leads-discard-facade-v1-20260819.js` | descarte de Lead ganha captura de scroll + força atualização do pool Livre |

## Verificação

```
node --check (todos os arquivos tocados) → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ios sincronizados
```

## Como validar manualmente

1. Rolar uma coluna com muitos cards pra baixo, mover/excluir/
   descartar um card lá em cima — a tela não deve "pular".
2. Arrastar um card, rolar com a roda do mouse sem mover o cursor —
   o indicador de posição deve acompanhar.
3. Com dois usuários logados, um vendo o pool Livre — o outro exclui
   um lead livre — deve sumir sozinho pro primeiro, sem F5.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
