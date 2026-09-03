# RELATÓRIO — FIX: Papo nascendo com espaço extra no topo (só corrigia ao arrastar)

**Data:** 23/08/2026
**Relatado com vídeo:** ao abrir o Papo (lista de conversas e dentro
de uma conversa), o cabeçalho nascia mais baixo do que devia, com um
espaço extra (o fundo decorativo do Papo aparecendo) entre a barra
superior do app e o cabeçalho — só corrigia depois de arrastar/rolar
a tela com o dedo.

## Investigação do vídeo

Extraí os quadros e confirmei exatamente o relatado: no quadro inicial
(tanto na lista quanto dentro da conversa "Hudson Almeida"), existe
uma faixa de gradiente visível entre "Papo da Empresa" (barra do app)
e o cabeçalho do Papo — depois do gesto de arrastar, o mesmo quadro
mostra o cabeçalho encostado certinho, sem esse espaço, batendo com as
2 fotos que você mandou como referência do estado correto.

## Causa raiz

`#pg-chat` (o contêiner de toda a página do Papo) tinha uma
propriedade — `padding-top: env(safe-area-inset-top)` — pensada
originalmente pra tratar o "notch" de iPhone, e **nunca tinha sido
zerada especificamente pro celular**. Isso é redundante: a barra
superior do app já reserva o espaço de topo certo por conta própria
(com a calibração que já existe). Pior: esse valor (`env(...)`) pode
resolver errado bem na primeira pintura da tela em WebView Android —
só se ajustando depois que o navegador recalcula, o que
coincidentemente é disparado por um gesto de arrastar/rolar (por isso
"consertava sozinho" ao puxar pra cima).

## Correção

Zerado explicitamente esse padding no contexto mobile — o espaço de
topo continua garantido do mesmo jeito de sempre (pela barra superior
do app), sem depender mais desse valor instável nesta página
específica. Como a lista e a conversa dividem o mesmo contêiner
(`#pg-chat`), essa única correção resolve os dois casos mostrados no
vídeo.

## Por que não testei visualmente antes de entregar

Esse tipo de bug é sobre **timing** de resolução de valor
(`env(safe-area-inset-top)` na primeira pintura de um WebView Android
real) — não é algo que um renderizador estático consiga reproduzir
de forma confiável, já que meu ambiente de teste não tem essa mesma
característica de comportamento inicial instável. Apoiei a correção
na análise de causa (bate exatamente com o padrão relatado: erro só
na primeira pintura, autocorrige com qualquer evento de scroll) em
vez de um print.

## Arquivo

| Arquivo | Mudança |
|---|---|
| `css/lf-consolidated-mobile.css` | `padding-top:0` explícito pra `#pg-chat` no mobile |

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Como validar manualmente

1. Fechar o app completamente (não só minimizar) e abrir de novo.
2. Ir direto no Papo — o cabeçalho ("Papo da Empresa" → lista, ou
   nome do contato → dentro da conversa) deve nascer já encostado,
   sem precisar arrastar nada.
3. Repetir abrindo uma conversa direto (sem passar pela lista).

Se por algum motivo ainda aparecer esse espaço em algum aparelho
específico, me avisa com um vídeo novo — pode ser um comportamento de
WebView um pouco diferente que vale a pena investigar mais a fundo.

## Reversão

Reversível — é uma única propriedade CSS, sem migração de dado.
