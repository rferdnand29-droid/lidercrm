# RELATÓRIO — FIX Papo atrás da barra de navegação do celular

**Data:** 21/08/2026
**Relatado com vídeo:** última mensagem cortada e barra de digitar
invisível, escondida atrás dos botões de navegação do Android — mesmo
depois da correção anterior (cabeçalho não fica mais escondido atrás
da barra do app, isso já está resolvido; o problema agora é
especificamente no rodapé).

## Investigação do vídeo

Extraí os quadros e confirmei exatamente o relatado: dentro de uma
conversa, a última mensagem aparece cortada rente à borda da tela, e
**a barra de digitar simplesmente não aparece** — fica posicionada
abaixo da área realmente visível, atrás dos botões do Android.

Também notei, no mesmo vídeo, que **já existe uma ferramenta de
calibração manual** em Configurações ("Ajustar posição do Papo" /
"Ajustar visualização") com controles pra empurrar o cabeçalho e a
barra de digitar. A existência dessa ferramenta já era um indício
forte: alguém, numa sessão anterior, tinha percebido esse tipo de
problema variar de aparelho pra aparelho e criou um ajuste manual em
vez de resolver a causa de raiz.

## Causa raiz

O cálculo de altura da página do Papo (`#pg-chat`) usava um valor
**fixo** de `52px` pra descontar a barra superior do app — e **nunca
reservava nenhum espaço pro rodapé** (barra de navegação do celular).

Isso é uma inconsistência real: **todo o resto** da interface mobile
(botões flutuantes, painel de notificação, menu) já soma duas
variáveis — uma pro topo e uma pro rodapé — que tanto se ajustam
automaticamente quanto podem ser corrigidas manualmente pela
ferramenta de calibração já existente. A página do Papo nunca usava
nenhuma das duas. Resultado: se a barra superior de verdade ficasse
mais alta que os 52px fixos (ex.: calibração ativa), ou se o celular
precisasse de espaço reservado embaixo pra não ficar atrás da barra de
navegação, a conta de altura do Papo continuava exatamente igual — o
painel acabava maior que a área realmente visível, e a barra de
digitar (que fica grudada no rodapé desse painel) saía da tela.

## Correção

A altura do Papo agora usa as **mesmas variáveis** que o resto do app
já usa pra topo e rodapé — nunca mais um valor fixo isolado. Isso tem
dois efeitos:

1. **Estrutural, automático:** a página do Papo passa a encolher
   corretamente sempre que a barra superior de verdade for mais alta
   que o padrão — resolve a maior parte do problema sozinho.
2. **A ferramenta de calibração manual já existente passa a ter efeito
   de verdade nesta página** — antes, ajustar aqueles controles em
   Configurações simplesmente não mudava nada no Papo especificamente,
   porque a conta de altura da página nunca olhava pra essas
   variáveis.

## Se ainda sobrar um pouquinho de espaço errado no seu aparelho específico

Detectar automaticamente, com 100% de certeza, a altura exata da barra
de navegação em **todo** modelo/versão de Android é algo
tecnicamente inconsistente entre navegadores — provavelmente foi
exatamente por isso que a ferramenta manual foi criada antes. Com a
correção estrutural acima, o "buraco" já deve estar resolvido ou bem
pequeno na maioria dos aparelhos; se sobrar um resquício no seu
celular específico, agora dá pra fechar isso com precisão em
Configurações → "Ajustar posição do Papo" → arrastar "Barra de
digitar" — que agora tem efeito de verdade, o que não acontecia antes.

**Arquivo:** `css/lf-consolidated-mobile.css`.

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. No mesmo aparelho do vídeo, abrir uma conversa no Papo com várias
   mensagens.
2. Conferir se a última mensagem e a barra de digitar aparecem
   inteiras, acima dos botões de navegação do Android.
3. Se sobrar qualquer sobreposição, ir em Configurações → "Ajustar
   posição do Papo" e arrastar "Barra de digitar" até encaixar
   perfeitamente — deve responder de verdade agora.

## Reversão

Reversível — é uma mudança isolada em uma única regra CSS, sem
migração de dado nenhuma.
