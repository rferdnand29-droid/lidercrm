# RELATÓRIO — Auditoria de "lixo" e limpeza do zip

**Data:** 23/08/2026
**Pedido:** achar o que só está pesando sem influenciar em nada, e
limpar o zip.

---

## Removido — confirmado como lixo real (zero efeito na aplicação)

| Item | Por quê |
|---|---|
| `js/patches/kanban-leads/lf-lig-counter-rounds-v1-20260728.js` (303 linhas) | Nunca era carregado por nenhum HTML — só existia uma **menção em comentário** dentro de `js/agenda.js`, não um carregamento de verdade. |
| `css/lf-fix-login-bg-20260803.css` | Nunca era carregado. E mesmo se fosse, referenciava uma imagem (`assets/login-bg.jpg`) que **não existe** no projeto — ver achado abaixo, não é só remoção de lixo, é um sinal de algo incompleto. |
| `_patch-meta/` (pasta inteira — 2 scripts .sh + 4 arquivos .txt) | Histórico de verificação de patches antigos aplicados em sessões passadas. Nenhuma referência em lugar nenhum do app nem dos scripts de build. |
| `src/index.html` | Cópia antiga e desatualizada, não usada pelo processo de build (já identificado numa sessão anterior, mas nunca tinha sido apagado de fato). |

## Achado no caminho — não é lixo, é o oposto

Ao investigar o CSS órfão do login, encontrei que **vários patches já
carregados** (`lf-fix-logout-wallpaper-reset-v1/v2`,
`lf-fix-logout-video-restore-v1`) colocam marcações no `<body>`
(`view-login`, `lf-clean-bg`, `data-view="login"`) **esperando** que
uma regra CSS reaja a elas como reserva/fallback estático — mas essa
regra nunca foi conectada, e a imagem que ela usaria nem existe no
projeto. Ou seja: existe um caminho de "imagem estática de reserva"
no sistema de fundo do login que está incompleto — hoje, nessa
situação, o login simplesmente mostra a cor sólida padrão (não quebra
visualmente, só não usa o fallback pretendido). Não tentei
"consertar" isso agora — precisaria da imagem correta, que não
tenho — só registro o achado pra você decidir se vale a pena
completar num momento futuro.

## Confirmado como NÃO sendo lixo — mantido de propósito

- **`diagnostics/`** (36K) — ferramentas de observação **pedidas
  explicitamente numa sessão anterior**, documentadas no próprio
  README como "prontas para uso futuro, como pedido". Não é
  esquecimento — é preparo intencional. Não removi.
- **`docs/`** (168K) — documentação real do projeto (arquitetura,
  deploy, permissões etc.) — útil pra quem for mexer no código.
- **`store-assets/`** (48K) — imagem de divulgação da Play Store —
  não é usada pelo app rodando, mas é necessária pra quem for
  publicar atualização na loja.
- **Vídeos/sons em `assets/`** (3.4M) — todos conferidos, todos
  realmente referenciados (fundo do login, sons de notificação).

## O maior "peso" do zip — não removi, mas quero sua decisão

`android/` (9.7M) + `ios/` (9.6M) + `www/` (8.1M) somam quase **28MB
dos ~39MB totais** — de longe o maior contribuinte de peso. São
saídas de build do Capacitor: `www/` é o espelho estático (o que
seria publicado no Cloudflare Pages), e `android/`/`ios/` são os
projetos nativos completos (Gradle/Xcode), regenerados a cada entrega
via `npx cap sync` a partir do mesmo código-fonte que já está no
resto do zip.

**Não removi essas pastas por conta própria** — é uma decisão de
formato de entrega, não uma limpeza óbvia: se vocês usam essas pastas
diretamente (build nativo, assinatura de app etc.), continuo
entregando; se vocês já mantêm suas próprias cópias locais de
android/ios (com ícone, assinatura e configurações próprias já
customizadas) e só precisam do código-fonte, posso parar de incluir
essas 3 pastas nas próximas entregas — reduziria o zip em quase 70%
do tamanho atual. Me avisa o que prefere.

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes (68→66 violações legadas toleradas — reflexo direto da limpeza)
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 46/46 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Reversão

Reversível — nenhum dos arquivos removidos tinha efeito no
funcionamento do app (confirmado antes de remover), sem migração de
dado.
