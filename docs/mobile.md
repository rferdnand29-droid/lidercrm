# Mobile (Capacitor)

**Atualizado (2026-08-04)**: projeto agora tem `android/` e `ios/`
gerados (`npx cap add android` / `npx cap add ios`) e está pronto pra
build nativa. Ver `docs/CAPACITOR-BUILD-SETUP-20260804.md` para o
guia completo (o que foi feito, o que falta configurar com credenciais
próprias — Firebase/APNs — e como gerar o `.apk`/`.ipa`).

`capacitor.config.json`: `appId com.liderfinanceira.lidercrm`, `webDir:
"www"`. **Mudou nesta atualização**: antes era `webDir: "."` (raiz do
projeto inteiro) — o Capacitor 8 rejeita `"."` como valor (`"." is not
a valid value for webDir"`), e mesmo que aceitasse, embutiria
`node_modules/`, `.git/`, `sql/`, `docs/`, `tests/`, relatórios
internos (`*.md`) e o código do Cloudflare Worker dentro do
APK/IPA. Agora `scripts/build-capacitor-www.mjs` monta uma pasta
`www/` só com o que o front-end carrega de fato (`index.html`,
`app.html`, `404.html`, `css/`, `js/`, `src/`,
`assets/`) e é essa pasta que vira `webDir`. Rodar `npm run cap:sync`
(chama o build antes do sync) sempre que o código-fonte mudar antes de
abrir o Xcode/Android Studio.

- **`allowNavigation` foi REMOVIDO de propósito (2026-09-14) — não
  reintroduzir.** Existia aqui achando que era necessário pra liberar
  chamadas de API (`liderfinanceira.com`, `supabase.co`,
  `backblazeb2.com`), mas isso é um entendimento errado do que essa
  configuração faz: `allowNavigation` controla só navegação de
  **página inteira** dentro da WebView (tipo clicar num link que abre
  outro domínio) — chamadas de API via `fetch`/XHR **não precisam
  disso**, já funcionam normalmente via CORS (que o backend já
  configura corretamente pra origem do Capacitor, ver
  `_worker_src/worker/middlewares/cors.js`). Pior: ter o domínio da
  própria API dentro de `allowNavigation` **quebra** as chamadas
  fetch pra esse domínio no Android, porque o Capacitor intercepta
  como se fosse navegação (issue confirmado oficialmente:
  `ionic-team/capacitor#1573`) — foi exatamente a causa do login não
  funcionar no app instalado, mesmo com credenciais certas. Detalhes
  em `docs/relatorios-historico/RELATORIO-FIX-CAPACITOR-LOGIN-ALLOWNAVIGATION-20260914.md`.
- `SplashScreen.launchShowDuration: 1200` (1.2s) — ver
  `js/patches/lf-splash-unstuck-v1-20260801.js` pra o watchdog que
  garante que a splash sai mesmo se o boot demorar mais que isso.
- `Keyboard.resize: "body"` — o teclado nativo redimensiona o `body`;
  isso interage com `js/utils.js` (`_syncViewportMetrics`,
  `_keepFocusedFieldVisible`) pra manter o campo focado visível.

## Entrypoint HTML em contexto mobile

O Capacitor serve `index.html` na raiz do bundle. `app.html` é mantido
como espelho byte-a-byte para compatibilidade com links antigos; ambos
passam a carregar exatamente o mesmo app. O script
`build-capacitor-www.mjs` garante essa sincronização antes de copiar os
arquivos para `www/`.

## Sincronização de dados entre PC, mobile web e Capacitor (2026-08-02)

Achado real, não hipotético: o upload de anexos gerais (aba Documentos,
`js/documentos.js` → `processAttFiles`/`processAdmDocFiles`) convertia
TODO arquivo (inclusive foto) pra base64 e embutia direto dentro do
documento `kanban/list` inteiro — o mesmo documento compartilhado por
toda a equipe, reescrito por completo a cada salvamento (ver
`docs/data-flow.md` §3). Esse é exatamente o padrão que já tinha sido
corrigido pro **áudio** em 2026-07-20 (`src/repositories/
storage-repository.js`, comentário "CORREÇÃO ÁUDIO") mas nunca foi
replicado pros anexos gerais — chat (`js/chat.js`, `_chatSendAttachment`)
também já fazia certo, via `/api/v1/upload/binary`.

**Por que isso afeta mobile mais que PC**: base64 embutido num documento
compartilhado gigante custa mais em qualquer plataforma, mas em celular
o efeito é maior — menos memória disponível pra segurar uma string
grande, rede mais lenta/instável pra sincronizar um documento inteiro
toda vez, e fotos tiradas na hora pela câmera costumam ser maiores (vários
MB) que arquivos tipicamente anexados via desktop.

**Corrigido**: os dois pontos agora usam `storage-repository.js` (mesmo
mecanismo já provado com áudio) — upload binário direto, com fallback
automático embutido no próprio repo (Supabase Storage → Worker → Firebase
legado) e fallback final pro base64 antigo só se o repo não estiver
disponível. Como é o MESMO `js/documentos.js` carregado por `index.html`
e `app.html` (Capacitor incluso, ver seção acima), a correção vale pra
PC, mobile web e Capacitor ao mesmo tempo — não precisou de nenhum código
específico de plataforma.

**Limitação honesta**: não consegui testar upload de foto de verdade num
device iOS/Android nem numa build real do Capacitor a partir deste
ambiente (sandbox sem navegador/emulador). A correção reaproveita um
padrão já comprovado (áudio, em produção desde 07-20) e passou por
revisão de código completa (ordem de carregamento, formato de dado
consumido pelo preview/download, fallback), mas recomendo testar upload
de uma foto de verdade — PC e pelo menos um device móvel real — antes
de considerar 100% validado. Ver `docs/AUDITORIA-FINAL-10-20260801-RODADA3.md`
§Registro de aplicação pra o detalhamento completo.

## Bugs relatados em teste real (2026-08-02) — 3 corrigidos, 1 investigado e mantido como está

Relato direto de teste no navegador mobile (não hipotético). Cada um
foi rastreado até a causa raiz no código antes de qualquer correção.

**1. Sobreposição visual ao abrir "editar lead"** — `editKBFromDet()`
(`js/kanban.js`) fecha o modal de detalhe e abre o de edição só 40ms
depois, mas o fade-out do CSS (`.mo{transition:opacity .18s ease}`)
dura 180ms — os dois ficavam visíveis ao mesmo tempo, e o que estava
fechando (`#mo-kb-det`, z-index 210) tinha prioridade visual sobre o
que estava abrindo (`#mo-kb`, z-index base 200). Mais visível no
mobile porque lá os modais ocupam a tela inteira (duas telas cheias
sobrepostas é bem mais notável que duas caixas menores). **Corrigido**:
`#mo-kb{z-index:215}` em `css/style.css` — o modal que abre sempre
fica por cima, mesmo durante a janela de sobreposição.

**2 e 3. Barra de navegação some no Papo, sem jeito de sair** —
`css/chat/chat.css` esconde `#mobile-bottom-nav` de propósito ao
entrar no chat (pra usar a tela toda), mas não existia nenhuma forma
de voltar — os botões de navegação dentro do chat (`chat-nav-top`/
`chat-nav-bot`) são só "rolar pro topo/fim da conversa", não
navegação. **Corrigido**: botão de saída novo (`#chat-exit-mobile-btn`,
`←` no canto superior esquerdo, só visível ≤768px). Ele é
propositalmente um elemento independente, `position:fixed`, e NÃO um
filho de `.chat-list-header` — esse container é escondido com
`!important`, incondicionalmente, por
`css/chat/lf-chat-hotfix-20260731.css` (achado nesta investigação,
não documentado antes: até o título "Papo da Empresa" fica invisível
o tempo todo, não só no mobile).

**4. Botão físico/gesto "voltar" do Android sai do app** — já existia
um listener (`js/app.js`, bloco "CERT-18") que fechava modal/painel/
menu com o backButton, mas se nada disso estivesse aberto (ex.:
parado numa aba sem modal), o evento não fazia nada e caía no
comportamento padrão do Capacitor — que, sem histórico de navegação
do WebView, sai do app. **Corrigido**: novo caso no mesmo listener,
depois do fechamento de painel — se a aba atual não é a inicial
(`dash`), volta pra ela em vez de deixar sair.

**Não corrigido, de propósito**: troca de aba via swipe (`js/
lf-mobile-swipe-tabs.js`) continua desativada dentro do chat. Motivo
confirmado no código: `js/patches/chat/nucleo/
lf-chat-back-unread-android-swipe-v27-20260715.js` já implementa
"arrastar da esquerda pra direita fecha a conversa aberta" como
funcionalidade pedida explicitamente pelo usuário anteriormente —
ativar swipe geral de aba dentro do chat entraria em conflito direto
com esse gesto já existente. O botão de saída (item 2/3 acima) cobre a
necessidade de sair do chat sem precisar de swipe.

**Limitação**: nenhuma dessas 4 correções foi testada num device/
navegador real — só revisão de código (rastreamento de causa raiz até
o CSS/JS exato, conferência de z-index e ordem de carregamento).
Recomendo testar os 4 cenários originalmente relatados antes do
próximo deploy.

## Permissões nativas de câmera/galeria/microfone/push

**Atualizado (2026-08-04)** — as pastas nativas agora existem e já têm
as permissões declaradas:

- **Android** (`android/app/src/main/AndroidManifest.xml`): `CAMERA`,
  `READ_MEDIA_IMAGES`/`READ_MEDIA_VIDEO`/`READ_MEDIA_AUDIO` (Android
  13+) com `READ_EXTERNAL_STORAGE` como fallback pra versões antigas,
  `RECORD_AUDIO` (gravação de áudio no chat/documentos,
  `src/modules/documentos/runtime/audio-helper.js`, via
  `getUserMedia`/`MediaRecorder`) e `POST_NOTIFICATIONS` (obrigatório
  a partir do Android 13 pra notificação aparecer na tela).
- **iOS** (`ios/App/App/Info.plist`): `NSCameraUsageDescription`,
  `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`
  e `NSMicrophoneUsageDescription`.

O upload continua usando `<input type="file" accept="image/*,...">`
simples (sem plugin `@capacitor/camera`) — o WebView delega pro
seletor nativo do sistema, que agora tem permissão pra abrir a câmera
de verdade em vez de falhar silenciosamente.

**Não testado num device real** a partir deste ambiente (sandbox sem
Xcode/Android Studio/emulador) — as permissões foram revisadas contra
o que o código realmente usa (grep por `getUserMedia`,
`<input type="file">`, `PushNotifications`), mas recomendo confirmar o
fluxo de câmera/galeria/áudio numa build real antes do primeiro
release. Ver `docs/CAPACITOR-BUILD-SETUP-20260804.md` pros passos que
ainda dependem de credenciais próprias (Firebase pro push do Android,
Apple Developer Program pro push do iOS).

## Patches mobile-específicos

`js/patches/chat/legado-mensageiro/` tem os patches mais antigos de UI
mobile do chat. `lf-mobile-display-calibration-20260713f.js` (raiz de
`js/patches/`) cobre um painel de calibração de visualização acessível
pela tela de Configurações — não é específico do chat.
