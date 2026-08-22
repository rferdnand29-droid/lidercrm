# Capacitor — CRM pronto pra app iOS/Android (2026-08-04)

Resumo do que foi feito pra deixar o Lider CRM buildável como app nativo
via Capacitor 8, o que ainda depende de credenciais/ferramentas que só
vocês têm (Firebase, Apple Developer Program, Xcode/Android Studio), e
como rodar a build a partir daqui.

## O que foi feito

### 1. Dependências e scripts (`package.json`)

Adicionado ao `dependencies`: `@capacitor/core`, `@capacitor/android`,
`@capacitor/ios`, `@capacitor/app`, `@capacitor/network`,
`@capacitor/keyboard`, `@capacitor/splash-screen`,
`@capacitor/status-bar`, `@capacitor/push-notifications` — todos os
plugins que o próprio código-fonte já esperava (`window.Capacitor.
Plugins.App/Network/Keyboard/PushNotifications`, ver `js/app.js`
CERT-17/18/19 e `js/chat.js`). Ao `devDependencies`:
`@capacitor/cli` e `@capacitor/assets` (gerador de ícone/splash).

Scripts novos:

```
npm run cap:www           # monta a pasta www/ (ver item 2)
npm run cap:sync          # www + cap sync (as duas plataformas)
npm run cap:sync:android  # www + cap sync android
npm run cap:sync:ios      # www + cap sync ios
npm run cap:open:android  # abre o Android Studio
npm run cap:open:ios      # abre o Xcode
npm run cap:android       # sync + abre Android Studio
npm run cap:ios           # sync + abre Xcode
npm run cap:assets        # regenera ícone/splash a partir de resources/logo.png
```

### 2. `webDir` corrigido: `.` → `www/` (achado importante)

O `capacitor.config.json` já existia no projeto com `webDir: "."`
(raiz inteira). Isso **não funciona mais** — o Capacitor 8 recusa
`"."` explicitamente (`"." is not a valid value for webDir"`), e ainda
que funcionasse, embutiria `node_modules/` (261 MB), `.git/`, `sql/`,
`docs/`, `tests/`, `tools/`, `scripts/`, relatórios internos (`*.md`)
e o código do Cloudflare Worker (`_worker_src/`, `functions/`) dentro
do APK/IPA — infla o app e expõe arquivos internos sem necessidade
nenhuma.

Criei `scripts/build-capacitor-www.mjs`: copia só o que o front-end
carrega de fato (`index.html`, `app.html`, `app-lite.html`, `404.html`,
`css/`, `js/`, `src/`, `assets/`) pra uma pasta `www/` — mesma lista de
arquivos que `index.html`/`app.html` referenciam via `<script src=...>`
e `<link href=...>`, conferida um por um. Resultado: **6,5 MB** em vez
de 270 MB. `capacitor.config.json` agora aponta `webDir: "www"`.

`www/` é gerada, não deve ir pro git (já está no `.gitignore` novo) —
rodar `npm run cap:sync` sempre que o código mudar, antes de abrir
Xcode/Android Studio.

### 3. Projetos nativos criados

`android/` (Gradle) e `ios/` (Xcode/Swift) via `npx cap add android` /
`npx cap add ios`, já sincronizados com os 6 plugins.

### 4. Permissões nativas

**`android/app/src/main/AndroidManifest.xml`**: `INTERNET`,
`ACCESS_NETWORK_STATE`, `CAMERA`, `READ_MEDIA_IMAGES`,
`READ_MEDIA_VIDEO`, `READ_MEDIA_AUDIO`, `READ_EXTERNAL_STORAGE`
(`maxSdkVersion=32`, fallback pra Android <13), `RECORD_AUDIO`,
`POST_NOTIFICATIONS`. Cada uma comentada no próprio arquivo com o
trecho de código que a justifica (conferi via grep antes de adicionar
— não coloquei nenhuma permissão "por via das dúvidas").

**`ios/App/App/Info.plist`**: `NSCameraUsageDescription`,
`NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription`,
`NSMicrophoneUsageDescription`, `UIBackgroundModes` com
`remote-notification` (necessário pro push acordar o app em background).

### 5. Ícone e splash screen

Não havia nenhum arquivo de logo no repo — a logo (`Líder Financeira
e Investimentos`) só existia embutida em base64 no `<link rel="icon">`
do `index.html`, carregada em tempo real via JS (`LF_LOGO_B64`).
Numa primeira versão, extraí essa imagem (480×480, sem transparência,
upscalada) e gerei ícone/splash a partir dela.

**Atualizado (2026-08-04, mais tarde)**: vocês enviaram a logo oficial
em `resources/logo.png` — 1024×1024, com fundo transparente de
verdade — e eu regenerei tudo com `npm run cap:assets` usando
`#0A0C10` (mesmo `backgroundColor` do `capacitor.config.json`) como
cor de fundo pro ícone e pro splash. Resultado: ícone nítido em
qualquer tamanho, e o splash agora mostra só o símbolo "flutuando"
sobre o fundo escuro, sem a caixa/borda visível que a versão anterior
tinha (efeito colateral direto de ter transparência real na fonte
desta vez).

Se um dia quiserem trocar a logo de novo, o processo é sempre o mesmo:

```bash
cp /caminho/da/nova-logo.png resources/logo.png
npm run cap:assets
npm run cap:sync
```

### 6. Push notifications (FCM/APNs) — ⚠ causou crash real, já contido

**Atualizado (2026-08-05)** — isso deixou de ser só "infraestrutura
pendente": faltar o `google-services.json` estava **derrubando o app
inteiro** ao abrir a aba Papo. Log de crash real (enviado pelo usuário
via "Enviar feedback" do Android):

```
Caused by: java.lang.IllegalStateException: Default FirebaseApp is not
initialized in this process com.liderfinanceira.lidercrm. Make sure to
call FirebaseApp.initializeApp(Context) first.
  at com.google.firebase.FirebaseApp.getInstance(FirebaseApp.java:179)
  at com.google.firebase.messaging.FirebaseMessaging.getInstance(...)
  at com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin.register(...)
```

`initChatPage()` chama `_chatRegisterPushDevice()` toda vez que a aba
Papo abre → `Push.register()` (plugin nativo) → sem
`google-services.json`, o Firebase nunca inicializa nativamente, e
**qualquer** chamada ao FirebaseMessaging lança essa exceção do lado
Java, numa thread em background. Nenhum `try/catch` em JavaScript
protege disso — a exceção nunca chega a virar uma rejeição de Promise
capturável, ela derruba a thread nativa direto, e o handler padrão de
exceção não-capturada do Android mata o app inteiro.

**Corrigido em `js/chat.js`**: registro de push nativo agora fica atrás
de uma flag `LF_PUSH_NATIVE_ENABLED` (perto da linha 2560), **`false`
por padrão** — ou seja, o app não chama mais `Push.register()` no
Android/iOS até vocês confirmarem que o Firebase/APNs está de fato
configurado. Web Push (VAPID, fora do Capacitor) não é afetado.

**Pra reativar, depois de configurar o Firebase/APNs de verdade**:
troque `var LF_PUSH_NATIVE_ENABLED = false;` para `true` em
`js/chat.js` — mudança de uma palavra, sem mexer em mais nada.

O código-fonte já espera push (tabela `push_devices` em
`migrations/fase1_push_devices.sql`). Preparei o lado de
infraestrutura:

- **Android**: o próprio `cap sync` já gerou o
  `android/build.gradle`/`android/app/build.gradle` com o plugin
  `com.google.gms.google-services` aplicado condicionalmente — **só
  falta colocar o `google-services.json`** (baixado do Firebase
  Console) em `android/app/google-services.json`.
- **iOS**: criei `ios/App/App/App.entitlements` com `aps-environment`,
  já referenciado no `project.pbxproj` (`CODE_SIGN_ENTITLEMENTS`), e
  adicionei os callbacks nativos de push em `AppDelegate.swift`
  (`didRegisterForRemoteNotificationsWithDeviceToken` etc., que é o
  que o plugin do Capacitor escuta).

**O que só dá pra fazer com credenciais que eu não tenho**:

1. Criar um projeto no [Firebase Console](https://console.firebase.google.com),
   registrar o app Android com o pacote `com.liderfinanceira.lidercrm`,
   baixar o `google-services.json` e colocar em `android/app/`. **Depois
   de colocar o arquivo, testem antes de reativar a flag** — melhor um
   dispositivo/emulador real com `npx cap run android`, checando o
   Logcat, do que confiar só que "colocar o arquivo resolve".
2. Ter uma conta no **Apple Developer Program** (paga), registrar o
   App ID `com.liderfinanceira.lidercrm` com a capability "Push
   Notifications" habilitada, e em Xcode → target App → *Signing &
   Capabilities* → conferir que "Push Notifications" e "Background
   Modes → Remote notifications" aparecem marcados (o `Info.plist` e o
   `.entitlements` já estão prontos; falta só o App ID existir do lado
   da Apple e a capability aparecer marcada na aba do Xcode — é
   praticamente automático quando o `.entitlements` já existe, mas só
   confirma com uma conta de desenvolvedor real).

**Observação separada, não fiz nada aqui**: reparei que em
`js/chat.js`, na função `_chatGetPushToken()`, o mesmo bloco de código
que trata Android e iOS junto rotula o token retornado
sempre como `provider: 'fcm'` — mas no iOS puro (sem o SDK nativo do
Firebase, só `@capacitor/push-notifications`), o token que a Apple
devolve é um token APNs, não FCM. Se o backend usa esse campo
`provider` pra decidir como mandar a notificação (FCM vs APNs
diretamente), push no iOS pode não funcionar mesmo com tudo
configurado — vale conferir com quem mantém o backend de envio antes
de assumir que "configurar o app" é suficiente. Não mexi nisso porque
é lógica de negócio do chat, fora do escopo de "deixar pronto pra
Capacitor".

### 7. Hygiene do repo

- `.gitignore` novo (não existia) — cobre `node_modules/`, `www/`
  gerada, artefatos de build do Gradle/Xcode, `google-services.json`
  (por ambiente).
- `eslint.config.js` — adicionei `www/`, `android/`, `ios/`,
  `resources/` aos `ignores` (senão o ESLint tentaria lintar uma
  cópia duplicada de `js/`/`src/` dentro de `www/`).

## O que NÃO deu pra fazer neste ambiente

Este é um sandbox Linux sem Xcode nem Android Studio/emulador — não dá
pra efetivamente **compilar** o `.apk`/`.ipa` nem testar num
device/emulador real a partir daqui. O que entreguei é o projeto
*pronto pra build*: alguém com Android Studio (qualquer SO) ou Xcode
(só Mac, obrigatório pra iOS) abre as pastas `android/`/`ios/` e builda
normalmente.

## Atualização (2026-08-20) — sync automático no pre-commit

Até aqui, `npm run cap:sync` era um passo manual — fácil de esquecer
depois de editar `js/`/`src/`/`css/`, deixando `www/` (e por tabela
`android/`/`ios/`) desatualizados até alguém lembrar de rodar o
comando antes de gerar um build nativo.

Agora existe um hook de `pre-commit` versionado em `githooks/pre-commit`,
instalado sozinho em `.git/hooks/` sempre que alguém roda `npm install`
(via o script `"prepare"` do `package.json` — mecanismo padrão do npm,
sem dependência nova tipo husky). Ele roda em **todo commit**:

1. Se o commit toca `js/`, `src/`, `css/`, `assets/`, `index.html`,
   `app.html` ou `app-lite.html` → reconstrói `www/`
   (`node scripts/build-capacitor-www.mjs`), confere paridade com
   `node scripts/verify-mirror.mjs`, e inclui `www/` no mesmo commit.
2. Roda `node scripts/ai-guard.mjs --staged` (a trava semântica de
   sempre).
3. Tenta `npx cap sync` pra empurrar `www/` pros projetos nativos
   `android/`/`ios/` — **best-effort**: se a máquina não tiver o
   toolchain (Android Studio/Xcode) ou não houver rede pra alguma
   dependência nativa, só avisa e segue; nunca bloqueia o commit.
   `android/.gitignore`/`ios/.gitignore` (padrão do próprio
   `cap add`) já excluem a pasta de bundle gerada
   (`assets/public`/`App/public`), então isso nunca duplica os
   vídeos/assets binários no histórico do git.

**O que isso muda na prática:** editar `js/kanban.js`, commitar, e o
`www/js/kanban.js` (+ `android`/`ios` se o toolchain estiver disponível)
já sai sincronizado no mesmo commit, sem precisar lembrar de
`npm run cap:sync` manualmente. Continua valendo rodar
`npm run cap:android` / `npm run cap:ios` manualmente quando for de
fato gerar um `.apk`/`.ipa` — o hook só garante que `www/` nunca fica
desatualizado por esquecimento.

Se por algum motivo `.git/hooks/pre-commit` não existir (ex.: clonou o
repo mas não rodou `npm install`), rode `npm run hooks:install` a mão.

---

## Como buildar a partir daqui

```bash
npm install              # se ainda não rodou

# Toda vez que o código-fonte (js/, src/, css/, html) mudar:
npm run cap:sync         # reconstrói www/ e sincroniza as duas plataformas

# Android (precisa do Android Studio instalado):
npm run cap:android      # sincroniza e abre o Android Studio
# → Build › Generate Signed Bundle/APK

# iOS (precisa de um Mac com Xcode):
npm run cap:ios           # sincroniza e abre o Xcode
# → Signing & Capabilities: selecionar o Team
# → Product › Archive (pra distribuir) ou Run num device/simulador
```

## Checklist antes do primeiro release

- [x] ~~Crash ao abrir o Papo~~ — causa raiz confirmada e corrigida
      (2026-08-05, ver item 6): push nativo desligado por padrão
      (`LF_PUSH_NATIVE_ENABLED = false` em `js/chat.js`) até o Firebase
      estar configurado de verdade.
- [ ] Testar câmera/galeria/áudio numa build real (Android e iOS) —
      não foi possível validar num device a partir deste ambiente.
- [ ] `google-services.json` do Firebase em `android/app/` — **e só
      depois** trocar `LF_PUSH_NATIVE_ENABLED` pra `true` em
      `js/chat.js` e testar de novo numa build real antes de assumir
      que está resolvido (esse crash especificamente só aparece com
      device/build real, não dava pra reproduzir neste ambiente).
- [ ] App ID com Push Notifications habilitado no Apple Developer
      Program; conferir capability em Xcode.
- [ ] Confirmar com quem mantém o backend de push se o rótulo
      `provider: 'fcm'` genérico (item 6, observação) é um problema
      real pro envio no iOS — só relevante depois de reativar
      `LF_PUSH_NATIVE_ENABLED`.
- [ ] Assinatura de release: keystore Android (`android/app/build.gradle`
      ainda usa build não assinada) e certificado/provisioning profile
      de distribuição no Apple Developer.

---

## Atualização (2026-08-04, mais tarde) — modo remoto (`server.url`)

Adicionei `server.url` no `capacitor.config.json`, apontando pra
produção: `https://lidercrm.pages.dev`. Isso muda o comportamento do
app nativo: em vez de carregar os arquivos web empacotados dentro do
APK/IPA (pasta `www/`), o WebView abre diretamente essa URL toda vez
que o app inicia.

```json
"server": {
  "url": "https://lidercrm.pages.dev",
  ...
}
```

### O que isso muda na prática

- **Mudança em `js/`, `css/`, `html`** → só fazer o deploy normal no
  Cloudflare Pages (`git push` pra `main`, como sempre). Da próxima vez
  que alguém abrir o app, ele já carrega a versão nova — **sem precisar
  gerar novo APK/IPA nem passar por revisão de loja de novo**.
- **Mudança que precisa de build nativa nova** (e, se já estiver na
  loja, de uma atualização enviada pra revisão): trocar permissão no
  `AndroidManifest.xml`/`Info.plist`, adicionar/remover plugin do
  Capacitor, trocar ícone/splash, subir a versão (`versionCode`/
  `versionName` no Android, `CURRENT_PROJECT_VERSION`/
  `MARKETING_VERSION` no iOS).

### Trade-off — ler antes de decidir manter assim

- **Sem internet, o app não abre** — como o WebView carrega direto a
  URL remota, sem conexão ele mostra tela de erro em vez do CRM. Isso é
  diferente do modo anterior (arquivos empacotados no app), que abria
  a interface mesmo offline (ainda que boa parte das telas dependesse
  de rede pra buscar dados de qualquer forma). Se isso for um problema
  real de uso (equipe em campo com internet instável, por exemplo), me
  avisem que dá pra reverter ou montar um esquema híbrido.
- Continua HTTPS-only (`cleartext: false`) — não abre a URL sem
  certificado válido, o que é o comportamento certo pra um CRM com
  dado de cliente.
- `www/` continua sendo gerada e sincronizada (não precisei remover
  nada) — ela só deixa de ser "o que aparece na tela", mas o `cap sync`
  ainda a usa como parte do processo de build.

### Se o domínio de produção mudar no futuro

```bash
sed -i 's#https://lidercrm.pages.dev#https://NOVA-URL#' capacitor.config.json
npm run cap:sync
```

---

## Atualização (2026-08-05) — Fase 2: envio de push de verdade implementado

A Fase 1 (`device-push-controller.js`) só guardava o token do device.
Implementei a Fase 2: o código que efetivamente manda a notificação via
Firebase quando chega mensagem nova no chat.

### O que foi criado

- `_worker_src/worker/lib/fcm-client.js` — assina um JWT com a chave da
  conta de serviço do Firebase (RS256 via Web Crypto, nativo do
  Cloudflare Workers, sem lib externa), troca por um token OAuth2 de
  curta duração, e chama a FCM HTTP v1 API (a "Server Key" antiga foi
  aposentada pelo Google em 2024 — hoje só funciona assim).
- `_worker_src/worker/controllers/push-send-controller.js` — novo
  endpoint `POST /api/v1/push/send`. Recebe `{toUserIds, title, body,
  data}`, busca os devices ativos de cada usuário em `push_devices`, e
  manda via FCM. Best-effort: falha de envio individual nunca vira erro
  HTTP — o chat já funciona sem push, isso é só um extra. Token
  morto/desinstalado (FCM responde `UNREGISTERED`/404) é marcado
  `active:false` automaticamente, pra não tentar de novo.
- `js/chat.js` — `_chatNotifyRecipients(msg, conv)`: função nova,
  compartilhada entre `sendChatMsg()` (texto) e `_chatPushMsg()`
  (anexo/áudio). **Achado no caminho**: mensagens de texto (a maioria
  do chat) nunca chamavam `pushNotif()` nem qualquer notificação — só
  anexos passavam por `_chatPushMsg()`. Agora os dois caminhos notificam
  igual (toast dentro do app + push de verdade fora dele).
- `env.js` — nova config `FCM_SERVICE_ACCOUNT_JSON` (default `''` — a
  Fase 2 fica desligada até alguém configurar; `/api/v1/push/send`
  responde 200 com `skipped:'FCM_NOT_CONFIGURED'` em vez de erro).

### O que falta — uma credencial nova (diferente da Fase 1)

O `google-services.json` de antes só serve pro APP receber. Pra
SERVIDOR mandar, precisa de uma segunda credencial: uma **conta de
serviço**.

1. [Firebase Console](https://console.firebase.google.com) → projeto
   Lider CRM → ⚙️ **Configurações do projeto** → aba **Contas de
   serviço**.
2. Botão **Gerar nova chave privada** → confirma → baixa um `.json`.
3. Esse arquivo **não vai pra pasta do projeto** (diferente do
   `google-services.json`) — ele vira um *secret* direto no Cloudflare:
   ```bash
   npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON
   ```
   Quando pedir o valor, cola o **conteúdo inteiro** do arquivo `.json`
   baixado (é só colar o JSON completo, todo numa linha ou não, tanto
   faz) e aperta Enter.
4. Faz o deploy do Worker/Pages de novo (o `wrangler secret put` já
   aplica pro deploy atual, não precisa de mais nada).

**Depois disso, sem precisar mexer em mais nenhum código**: quem mandar
mensagem no Papo já vai disparar notificação real na bandeja do Android
de quem estiver com o app fechado.
