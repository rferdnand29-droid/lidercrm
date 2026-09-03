# RELATORIO-FEATURE-LOGIN-VISUAL-CINEMATOGRAFICO-20260915

## Pedido

Usar as duas peças visuais enviadas (foto com vapor de café animado)
como o novo visual de login do CRM — PC, mobile e Capacitor — de
forma limpa e leve, sem perder qualidade.

## O que eram os arquivos enviados

Não eram vídeos de verdade — eram animações CSS/HTML (vapor subindo
da xícara, texto "Iniciando sistema") com uma foto de fundo embutida
em base64: uma versão paisagem (1920×1080, para PC) e uma versão
retrato (498×1080, para celular). Isso é ótimo para performance —
zero codec de vídeo, zero JavaScript de animação.

## Estratégia

1. **Imagens extraídas do base64 para arquivos de verdade**
   (`assets/login/login-bg-desktop.jpg` e `login-bg-mobile.jpg`) —
   sem recomprimir (os arquivos originais já vinham bem otimizados,
   148KB e 62KB, e "sem perder qualidade" foi pedido explícito).
   Tirar do base64 inline permite que o navegador armazene em cache
   separadamente — carrega uma vez, nunca mais baixa de novo.
2. **Vapor animado replicado em CSS puro** — mesma técnica do
   design original (sem vídeo, sem JavaScript), incluindo a técnica
   de quadro de proporção fixa que impede a foto de ser cortada de
   forma diferente dependendo do formato da tela (o que faria o
   vapor "desalinhar" da xícara).
3. **Aplicado na tela de login** (`#login-screen`), não na tela de
   "Conectando" — essa é CSS crítico que precisa ficar simples e
   instantâneo, sem depender de imagem, para nunca mostrar tela em
   branco.
4. **Preload das duas imagens** adicionado no `<head>` — já começam
   a carregar durante os poucos segundos da tela de "Conectando",
   prontas quando o login aparece.

## Ajuste de design descoberto durante o teste

O card de login, centralizado, ficava bem em cima da xícara/vapor,
escondendo a animação. Corrigido: no PC, o card desloca para a
esquerda (onde a foto tem céu/prédio desfocado — espaço "vazio" na
composição); no celular de tela média/tablet, desloca para o rodapé,
deixando o rosto e o vapor livres acima.

**Achado adicional**: em celulares estreitos (até 430px de largura —
a maioria dos aparelhos reais), o app já tinha uma regra existente
que transforma o card em tela cheia, sem cantos arredondados,
propositalmente (melhor usabilidade em telas pequenas). Ajustei só a
opacidade do card nesse cenário específico (de 85% para 55%) para a
foto aparecer claramente através do vidro fosco, em vez de ficar
quase invisível atrás de um fundo escuro cobrindo a tela toda.

## Nota sobre a ferramenta de teste

Boa parte do tempo desta tarefa foi gasto descobrindo que a
ferramenta de pré-visualização que uso não suporta bem CSS moderno
(`aspect-ratio`, certas combinações de `calc()`) — o problema nunca
esteve no CSS entregue, e sim na ferramenta usada para conferir
visualmente. Troquei para um motor de navegador de verdade
(Chromium via Playwright) no meio do processo, o que permitiu
validar com confiança — e foi assim que encontrei o ajuste real de
design (card cobrindo a xícara) que precisava de correção.

## Fluxos cobertos

- PC: foto paisagem, card à esquerda, vapor visível subindo da
  xícara à direita.
- Celular largo/tablet: foto retrato, card no rodapé, vapor e rosto
  visíveis acima.
- Celular estreito (maioria dos aparelhos): card em tela cheia (como
  já era por design), agora com a foto visível através do vidro
  fosco.
- Capacitor (Android/iOS): imagens embutidas localmente no pacote —
  funciona offline, sem depender de rede, confirmado presente nos 3
  pontos (raiz, Android, iOS) depois do `cap sync`.
- `prefers-reduced-motion`: vapor para de animar, fica só uma névoa
  sutil parada — respeitado, já que o design original também tinha
  essa preocupação.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `assets/login/login-bg-desktop.jpg`, `login-bg-mobile.jpg` | novos |
| `css/style.css` | fundo cinematográfico + vapor animado + reposicionamento do card |
| `index.html`, `app.html` | quadro de fundo/vapor adicionado à tela de login; preload das imagens |
| `android/`, `ios/` | imagens e CSS sincronizados |

## Verificação

```
CSS balanceado (chaves)          → OK
index.html/app.html consistentes → idênticos na seção de login
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 71/71 testes
npx cap sync                     → imagens + CSS confirmados idênticos nos 3 pontos
```

Testado visualmente com motor de navegador real (Chromium/Playwright)
em 3 larguras (390px celular estreito, 500px celular largo, 1280px
PC) — resultado confirmado em cada uma.

## Peso

+211KB no total (as duas fotos) — leve para duas imagens de tela
cheia; o ganho de performance vem principalmente de tirar as imagens
do base64 inline (permite cache do navegador) e não depender de
vídeo/codec.

## Reversão

Reversível — reverter `css/style.css`/`index.html`/`app.html` e
remover `assets/login/`, sem migração de dado.
