# RELATÓRIO — FIX cabeçalho/barra de digitação cobrindo mensagens (Papo, mobile)

**Data:** 21/08/2026
**Pedido:** vídeo mostrando o cabeçalho da conversa e a barra de
digitação não ficando fixos — a tela rola por baixo, escondendo o
cabeçalho atrás da barra do app e cobrindo mensagens com a barra de
digitação.

## Investigação do vídeo

Extraí os quadros do vídeo pra analisar frame a frame. Confirmado
exatamente o descrito: ao rolar dentro de uma conversa, o cabeçalho
"Hudson Almeida" (nome/avatar/status) some atrás da barra fixa do app
("Papo da Empresa" no topo), e a barra de digitação passa a flutuar no
meio da tela, sobre as últimas mensagens.

## Causa raiz — duas partes

### 1) Inconsistência real entre dois arquivos CSS

O cabeçalho da conversa (`#chat-conv-header`) e a barra de digitação
(`#chat-input-area`) precisam ficar "soltos" do fluxo normal da página
(`position:absolute`) pra se manterem fixos independente da rolagem
das mensagens. Encontrei que:

- `css/chat/chat.css` (carrega primeiro) só dava esse tratamento pra
  barra de digitação — o cabeçalho continuava em fluxo normal.
- `css/lf-consolidated-mobile.css` (carrega depois, com `!important`)
  dava o tratamento certo pros dois — e por isso "vencia" na prática.

Ou seja: o comportamento CORRETO só existia por acidente de ordem de
carregamento entre dois arquivos que não sabiam um do outro. Deixei os
dois consistentes entre si (o `chat.css` agora reflete a mesma regra,
documentada, sem depender silenciosamente do outro arquivo).

### 2) A causa principal: a correção de rolagem de uma sessão anterior não estava sendo suficiente em todo navegador/cenário

Numa sessão anterior já tinha corrigido esse mesmo sintoma — o
`<body>` da página não tinha nenhuma trava de rolagem, então qualquer
imprecisão de altura fazia a página inteira rolar por baixo do Papo em
vez da rolagem ficar contida dentro da lista de mensagens. A correção
trava o `<body>` (mesma técnica já usada com sucesso no menu mobile)
enquanto a aba Papo está aberta.

Pelo vídeo, esse travamento sozinho não está segurando 100% das vezes
nesse navegador/cenário específico (mobile, navegador — não só o app).
Reforcei com duas camadas a mais, sem tirar a original:

1. **`<html>` também trava**, não só `<body>` — alguns navegadores
   tratam o elemento `<html>` como o "dono" de verdade da rolagem da
   página, e travar só o `<body>` pode não bastar em toda versão.
2. **Bloqueio direto do gesto de arrastar**: um "vigia" no documento
   inteiro impede qualquer gesto de arrastar que comece FORA de uma
   área que já tem rolagem própria prevista (a lista de mensagens, a
   lista de conversas, a caixa de digitar, janelas abertas) — trava o
   vazamento de rolagem na raiz do gesto, em vez de só confiar que o
   CSS vai segurar.

Também reforcei o gatilho: além de ativar a trava ao entrar na aba
Papo, agora também ativa (se ainda não estiver ativa) ao abrir uma
conversa específica — cobre o caso de alguém chegar direto numa
conversa (ex.: por notificação) sem passar pela entrada normal da aba.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `css/chat/chat.css` | cabeçalho da conversa alinhado com a regra que já valia na prática (consistência entre arquivos) |
| `js/patches/chat/lf-fix-chat-mobile-scroll-lock-v1-20260820.js` | reforço: trava `<html>` também, bloqueio direto de gesto de arrastar fora de áreas roláveis, gatilho extra em `openChatConv` |

## Verificação

```
node --check js/patches/chat/lf-fix-chat-mobile-scroll-lock-v1-20260820.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. No celular (app ou navegador), abrir Papo → entrar numa conversa
   com várias mensagens.
2. Arrastar a lista de mensagens pra cima/baixo repetidamente, com
   gestos rápidos e variados (inclusive começando o arrasto perto do
   cabeçalho ou perto da barra de digitação).
3. O cabeçalho "Nome do contato" deve continuar sempre visível no
   topo, e a barra de digitação sempre grudada no rodapé — nunca
   sobrepondo mensagem nenhuma.

## Reversão

Reversível arquivo por arquivo, sem migração de dado. Se o bloqueio de
gesto (item 2 do reforço) causar algum efeito colateral inesperado em
algum navegador específico, é só remover o listener de `touchmove` do
patch — as outras camadas continuam funcionando normalmente sem ele.
