# RELATÓRIO — Estabilidade/performance do Kanban (tremor em leads parados)

**Data:** 20/08/2026
**Pedido:** CRM mais estável — mini-travadas/tremor em leads parados e
ao mudar de etapa; quer uma "melhora do 3D estilo Bitrix" que não
quebre nada, com suspeita de que tentativas passadas de embelezar
animações já quebraram rolagem/abas.

## Resumo

Achei **4 causas concretas**, todas confirmadas lendo o código (não é
suposição) — três são efeitos colaterais de otimizações visuais
aplicadas na direção errada, e uma é uma re-renderização
desnecessária rodando sozinha em segundo plano. Corrigi as 4. Nenhuma
mexe na arquitetura de renderização do Kanban em si — são ajustes
cirúrgicos de CSS + uma condição a mais antes de repintar.

---

## Causa 1 — sincronização em segundo plano repintava o board inteiro sem necessidade

**A mais provável de explicar "tremida nos leads parados mesmo".**

O Kanban sincroniza com o servidor sozinho, em segundo plano, sem o
usuário pedir nada. Ao terminar, esse ciclo **sempre** mandava
repintar o board inteiro — mesmo quando o servidor devolvia
exatamente os mesmos dados que já estavam na tela. Como repintar
significa destruir e recriar TODOS os cards de TODAS as colunas do
zero, isso causava um tremor visível periodicamente, sem o usuário ter
tocado em nada — porque, de fato, ele não tinha.

**Correção:** agora compara o que veio do servidor com o que já está
salvo antes de decidir se repinta. Só repinta se algo realmente mudou.

**Arquivo:** `js/kanban.js`.

---

## Causa 2 — cada card individual "roubando" sua própria camada de GPU

Havia uma otimização (`transform:translateZ(0)`) aplicada a **todo**
card, o tempo todo — não só o que está sendo arrastado. A intenção era
acelerar pela GPU, mas o efeito, com dezenas de cards na tela ao mesmo
tempo, é o oposto: dezenas de camadas de composição simultâneas
sobrecarregam o navegador, especialmente em aparelhos mais fracos
(celular). É um erro comum — a técnica é correta, só devia ser usada
só no card que está realmente sendo movido (o que, aliás, já existia:
`.kb-card.dragging` já tinha a otimização certa, só que a errada
convivia junto com ela).

**Correção:** removida a promoção de camada de todo card parado;
mantida só no card sendo arrastado de verdade.

**Arquivo:** `css/style.css`.

---

## Causa 3 — desfoque "vidro fosco" em 6-7 colunas ao mesmo tempo

Cada coluna do Kanban tinha um efeito de vidro fosco
(`backdrop-filter: blur`), que obriga o navegador a recalcular o
desfoque de tudo atrás sempre que qualquer coisa muda perto —
inclusive durante rolagem ou qualquer repintura vizinha. Com 6-7
colunas simultâneas, isso é caro de manter continuamente.

**Achado interessante:** o tema claro do CRM **já tinha esse mesmo
efeito desativado**, exatamente por esse motivo de performance — só
que o tema escuro nunca recebeu a mesma correção. Ou seja, essa causa
já tinha sido identificada e corrigida uma vez, só que pela metade.

**Correção:** removido também do tema escuro, com o fundo da coluna
ligeiramente mais opaco pra compensar visualmente a ausência do
desfoque.

**Arquivo:** `css/style.css`.

---

## Causa 4 — fundo animado (as "orbs") sem isolamento de camada

Esta eu preciso ser transparente: é um efeito colateral de uma
correção que **eu mesmo fiz numa sessão anterior**, a pedido de vocês
("fundo animado não funciona" — reativei ele no tema escuro). O efeito
em si (3 formas grandes, desfocadas, com mistura de cor, animando sem
parar enquanto o app está aberto) sempre existiu no código, mas nunca
tinha camada de composição própria — cada quadro da animação podia
forçar o navegador a reconsiderar a pintura do resto da página atrás
dele. Como ele fica sempre presente (inclusive atrás do Kanban, não só
na tela de login), rodava continuamente bem na hora que vocês estavam
olhando os leads.

**Correção:** isolei o fundo animado numa camada própria
(`contain:strict` + `will-change`) — a MESMA técnica da Causa 2, só
que aplicada do jeito certo aqui: são só 3 elementos, então dar camada
própria pra eles ajuda de verdade (o problema da Causa 2 era ter
camada própria em dezenas de elementos, não a técnica em si).

**Arquivo:** `css/style.css`.

---

## Sobre "mover o cartão lisamente como o Bitrix" — decisão consciente de não mexer agora

As 4 correções acima tornam o Kanban bem mais leve — inclusive o
"congelamento" ao mudar de etapa deve ficar bem mais suave, porque o
redesenho que já acontecia a cada movimentação agora é mais barato
(sem a explosão de camadas da Causa 2, sem o desfoque caro da Causa
3). Mas não é uma animação de deslizar de verdade estilo Bitrix — hoje
o Kanban reconstrói a coluna inteira do zero a cada movimentação
(destrói e recria os elementos), em vez de mover o mesmo elemento
visual de um lugar pro outro com uma transição suave. Pra fazer de
verdade "igual Bitrix" seria preciso mudar como o board é redesenhado
(mover o card existente em vez de recriar tudo) — isso é uma mudança
mais profunda, usada em mais de 30 pontos diferentes do código, e é
exatamente o tipo de mudança que already causou os problemas que vocês
suspeitam no passado (rolagem quebrada, abas bugadas).

Preferi não arriscar isso nesta rodada. As correções que fiz já
atacam a causa real da instabilidade relatada (as "mini-travadas");
a animação de deslizar suave é só estética por cima disso, sem
correção de bug nenhuma pendente. Se depois de testar essas correções
vocês ainda quiserem a animação de verdade, posso fazer — com bastante
cuidado, testando cada um dos 30+ pontos que dependem do redesenho do
board, numa rodada dedicada só a isso, pra não repetir o que já
aconteceu antes.

---

## Verificação

```
node --check js/kanban.js        → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## O que NÃO foi mexido

Nenhuma lógica de negócio, nenhum dado, nenhuma estrutura de
renderização do Kanban (a função que redesenha continua fazendo
exatamente o que já fazia — só passou a rodar com menos frequência
desnecessária, e mais barata quando roda). Zero risco pra rolagem ou
abas, que foi a preocupação levantada.

## Reversão

Todas as 4 correções são reversíveis independentemente, sem
migração de dado nenhuma — é só CSS + uma condição a mais em
`_syncKBRemoteBG`.
