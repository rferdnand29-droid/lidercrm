# RELATÓRIO — Auditoria completa do Papo mobile (cabeçalho/mensagens/input fixos)

**Data:** 21/08/2026
**Pedido:** conferir a fundo se cabeçalho e barra não cortam mensagens
nem atrapalham a rolagem — objetivo: comportamento igual ao WhatsApp
(referência enviada), tudo fixo e organizado.

Fiz uma auditoria completa da estrutura (não só reconferir a correção
anterior) e encontrei **3 causas reais**, incluindo uma que
provavelmente é a mais importante de toda essa história.

---

## Achado principal — um cálculo mais preciso que já existia, mas nunca valia de verdade

Existe, há tempos, uma função em JavaScript
(`_chatSyncMobileLayout`) que calcula a altura certa do Papo **medindo
a tela ao vivo** — pega a altura real da janela, a posição real do
topo do Papo, a altura real da barra de navegação inferior do app — e
já está conectada em **praticamente todo evento relevante**: abrir
conversa, fechar, girar a tela, redimensionar, teclado abrindo/
fechando. O comentário no código mostra que essa função já passou por
várias rodadas de ajuste, especificamente por causa desse mesmo tipo
de bug.

O problema: ela aplicava a altura calculada com um `style.height`
comum — e uma regra de CSS (a mesma que ajustei na correção anterior)
usa `!important`, que **sempre vence um estilo sem `!important`**,
não importa a ordem. Ou seja: esse cálculo, mesmo sendo o mais preciso
que existe no sistema (mede a tela de verdade, não depende de nenhuma
suposição sobre notch/barra de navegação), **nunca chegava a valer**
— o navegador sempre usava o valor calculado em CSS no lugar dele,
silenciosamente.

**Correção:** o cálculo em JavaScript agora também usa `!important`,
então passa a vencer de verdade. Como ele já está conectado em todos
os eventos certos, isso deve resolver a maior parte do problema de
forma bem mais confiável do que depender só da conta em CSS — porque
ele mede a tela de verdade, em vez de estimar.

**Arquivo:** `js/chat.js`.

---

## Achado 2 — a correção anterior (do turno passado) permanece válida

Reconferido: a correção de wire das variáveis `--lf-sat`/`--lf-sab`
segue no lugar, e continua sendo útil como base/reserva — agora ela e
o cálculo em JavaScript (achado acima) trabalham juntos: o CSS dá o
valor inicial (antes do JS ter chance de medir e ajustar), e o JS
corrige com a medição de verdade assim que roda.

---

## Achado 3 — a barrinha "Respondendo a..." podia empurrar/cobrir mensagens

Ao auditar todo elemento que aparece dentro da conversa, achei mais um
ponto real: quando alguém toca em "responder" numa mensagem, aparece
uma barrinha ("↩ Respondendo a...") acima da barra de digitar — mas
essa barrinha **não seguia o mesmo padrão fixo** do cabeçalho e da
barra de digitar. Ela ficava no fluxo normal da página, então quando
aparecia, ninguém tinha reservado espaço pra ela — podia cobrir a
última mensagem visível ou, em casos piores, reabrir a mesma classe de
bug "a tela inteira rola" que já tinha sido corrigida antes.

**Correção:** essa barrinha agora segue o mesmo padrão fixo do
cabeçalho/input (só no mobile — no desktop ela já funcionava
corretamente do jeito que estava, não mexi lá), posicionada
exatamente colada acima da barra de digitar (medindo a altura real
dela, não um valor chutado), e o espaço reservado para as mensagens
cresce automaticamente enquanto ela está visível.

**Arquivos:** `js/chat.js`, `css/chat/chat.css`,
`css/lf-consolidated-mobile.css`.

---

## Verificação

```
node --check js/chat.js          → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Abrir uma conversa no Papo, mandar bastante mensagem (o suficiente
   pra rolar).
2. Rolar rápido, em vários sentidos — cabeçalho e barra de digitar
   devem ficar sempre visíveis, sem sumir nem sobrepor mensagem
   nenhuma.
3. Segurar uma mensagem e tocar em "Responder" — a barrinha deve
   aparecer coladinha acima da barra de digitar, sem cobrir a última
   mensagem.
4. Girar o celular, abrir/fechar o teclado — o painel deve se ajustar
   sem cortar nada.

## Reversão

Reversível arquivo por arquivo. Se por algum motivo o `!important` no
cálculo em JavaScript causar algum efeito colateral inesperado num
aparelho específico, é só voltar a linha pra `style.height=` sem
`!important` — a regra de CSS já reforçada volta a valer sozinha,
como estava antes desta correção.
