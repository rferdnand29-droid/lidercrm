# RELATÓRIO — Remoção definitiva do "trocar de aba arrastando" (mobile)

**Data:** 21/08/2026
**Pedido:** remover em definitivo, da versão mobile, a troca de aba
por arraste (swipe).

## O que era

Um recurso que trocava de aba (Início/Leads/Negócios/Agenda/Papo) ao
arrastar o dedo horizontalmente na tela, no celular. Já tinha passado
por uma rodada de calibração (ajuste de sensibilidade/ângulo) numa
sessão anterior, com uma ferramenta própria em Configurações pra
afinar por aparelho.

## O que foi feito — remoção completa, não só desativação

Pra garantir que fica removido "em definitivo mesmo" (não só
escondido ou desligado por uma condição que poderia voltar sozinha):

1. **Os dois arquivos da feature foram apagados** —
   `js/lf-mobile-swipe-tabs.js` (o recurso em si) e
   `js/patches/lf-swipe-tabs-calibration-v1-20260805.js` (a
   calibração dele). Não ficou nenhum código dormente que pudesse
   voltar a ativar sozinho.
2. As tags que carregavam os dois arquivos foram removidas dos 2
   HTMLs principais (`index.html`, `app.html`).
3. O botão "↔️ Ajustar arrastar de aba" e a seção inteira dele em
   Configurações foram removidos — não fazia sentido deixar um botão
   de ajuste pra uma coisa que não existe mais.
4. Conferido que não sobrou **nenhuma referência** ao recurso em
   lugar nenhum do código ativo do app.

## O que NÃO foi mexido

Existe outro arquivo com "swipe" no nome
(`lf-chat-back-unread-android-swipe-v27-20260715.js`) — é uma coisa
completamente diferente (gesto dentro do Papo, não troca de aba do
app inteiro). Não toquei nele.

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos (arquivos removidos dos dois lados)
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. No celular, arrastar o dedo horizontalmente em qualquer tela do
   app — não deve trocar de aba mais, em nenhuma situação.
2. Em Configurações, a seção "Ajuste do Arrastar de Aba" não deve mais
   aparecer.

## Reversão

Não recomendado dado o pedido explícito de remoção definitiva, mas se
precisar: os dois arquivos removidos estão preservados no histórico
desta conversa (posso recriar se algum dia for pedido de volta).
