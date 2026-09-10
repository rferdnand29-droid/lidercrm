# RELATÓRIO — FIX: espaço em branco ao digitar + menu de mensagem competindo com seleção nativa

**Data:** 23/08/2026

---

## 1. Espaço em branco ao abrir o teclado

**Causa raiz:** o evento que dispara exatamente quando o teclado
abre/fecha (`visualViewport.resize`) já redimensionava o painel do
Papo corretamente — mas não mandava a lista de mensagens rolar até o
final junto. A última mensagem ficava "presa" na posição de rolagem
de antes (de quando a tela era mais alta, sem o teclado ocupando
espaço), deixando um vão vazio entre ela e a barra de digitar/teclado
— exatamente o espaço em branco/cinza da sua foto.

**Correção:** esse evento específico agora também manda a lista rolar
até o final, junto com o redimensionamento. A mensagem mais recente
fica sempre colada acima de onde você está digitando, sem sobrar
vão nenhum.

---

## 2. Menu de mensagem "perdendo" pra seleção nativa do Android

**Achado revelador:** existia um comentário no próprio código dizendo
"impede o menu nativo de copiar/selecionar durante o toque longo" —
mas a regra logo em seguida **desfazia exatamente isso**,
reabilitando a seleção nativa especificamente no texto da mensagem —
que é onde você realmente toca. Ou seja, alguém já tinha identificado
e tentado corrigir esse mesmo problema antes, só que a correção ficou
incompleta.

**O que acontecia:** ao segurar uma mensagem, o toque longo disparava
**dois comportamentos ao mesmo tempo** — o menu customizado do app
(Responder/Copiar/Encaminhar/Fixar+reações) e a seleção nativa do
Android (com a bolha própria de "Copiar"). Dependendo do timing, a
seleção nativa vencia a corrida e aparecia sozinha, sem o menu do app.

**Correção:** restringi a reabilitação da seleção nativa só ao
desktop, onde não existe esse conflito (lá, selecionar texto com o
mouse é o comportamento esperado, e ainda dá pra copiar pelo menu do
app também). No celular, o toque longo agora só aciona o menu
customizado — "Copiar" continua lá dentro, funcionando normal.

Conferi que o menu customizado usa seu próprio detector de toque
longo (JavaScript), independente da seleção nativa — então essa
correção não muda em nada como o menu do app é aberto, só tira a
seleção nativa do caminho.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/chat.js` | evento de teclado agora também rola a lista até o final |
| `css/chat/chat.css` | seleção nativa de texto restrita ao desktop |

## Verificação

```
node --check js/chat.js          → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Abrir uma conversa, tocar no campo de digitar (abrir o teclado) —
   a última mensagem deve ficar colada acima da barra de digitar, sem
   vão em branco.
2. Segurar uma mensagem — deve abrir direto o menu do app
   (Responder/Copiar/Encaminhar/Fixar+reações), sem a bolha nativa de
   seleção do Android aparecendo sozinha.

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
