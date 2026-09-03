# RELATÓRIO — FIX gravação de áudio negada no Capacitor Android

**Data:** 2026-08-20
**Bug reportado:** gravação/envio de áudio não funciona no Capacitor,
**mesmo depois de permitir o microfone nas configurações do celular**.

## Causa raiz

`RECORD_AUDIO` já estava declarada em `android/app/src/main/AndroidManifest.xml`,
mas **`MODIFY_AUDIO_SETTINGS` não estava**.

O Capacitor tem seu próprio manipulador de permissão de mídia do
WebView (`com.getcapacitor.BridgeWebChromeClient#onPermissionRequest`,
dentro de `node_modules/@capacitor/android`), e ele **não pede só
`RECORD_AUDIO`** para liberar `getUserMedia({audio:true})` — pede as
duas juntas:

```java
if (Arrays.asList(request.getResources()).contains("android.webkit.resource.AUDIO_CAPTURE")) {
    permissionList.add(Manifest.permission.MODIFY_AUDIO_SETTINGS);
    permissionList.add(Manifest.permission.RECORD_AUDIO);
}
```

E só chama `request.grant(...)` (libera o microfone pro WebView) se
**todas** as permissões da lista vierem concedidas — se qualquer uma
vier negada, chama `request.deny()` e o `getUserMedia()` do JavaScript
rejeita com `NotAllowedError` (o app mostra "Permissão de microfone
negada..." — ver `src/modules/documentos/runtime/audio-helper.js`).

Como `MODIFY_AUDIO_SETTINGS` nunca estava declarada no manifest, o
Android **nunca conseguia concedê-la** — não existe like conceder uma
permissão que o próprio app não declara querer. Resultado: o pedido de
permissão sempre falhava como um todo, **mesmo com `RECORD_AUDIO`
concedida** (inclusive manualmente pelo usuário nas configurações do
sistema).

**Por que "permitir nas configurações do celular" não resolvia:**
`MODIFY_AUDIO_SETTINGS` tem `protectionLevel="normal"` no Android — ela
**nunca aparece na tela de permissões do app nas Configurações do
sistema** (essa tela só lista permissões "perigosas" tipo Microfone/
Câmera/Localização, que mapeiam pra `RECORD_AUDIO`). Não existe jeito
manual de conceder `MODIFY_AUDIO_SETTINGS` pelo celular — ela só pode
vir declarada no `AndroidManifest.xml` do app. Por isso o usuário
ativava "Microfone" corretamente e mesmo assim continuava sendo negado.

## Correção

Uma linha em `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

**iOS não precisou de mudança** — já estava correto:
`NSMicrophoneUsageDescription` presente em `ios/App/App/Info.plist`, e
`node_modules/@capacitor/ios` já implementa
`webView(_:requestMediaCapturePermissionFor:...)` retornando
`.grant` por padrão, delegando o consentimento real pro prompt nativo
do sistema (que usa a mensagem do Info.plist).

## O que NÃO foi mexido

- Nenhum código JavaScript (`audio-helper.js`, `chat.js`) — o fluxo de
  gravação/envio já estava correto; só faltava a permissão nativa.
- Nenhuma dependência nova, nenhum plugin de microfone adicionado — o
  Capacitor já resolve isso via o próprio WebView + manifest.
- `MainActivity.java` continua vazio (`extends BridgeActivity {}`) —
  não precisou de override customizado, o comportamento padrão do
  Capacitor já é suficiente com a permissão declarada.

## Verificação

```
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
python3 -c "import xml.dom.minidom; ...parse(...)" → XML válido
```

(Esta correção é num arquivo nativo Android — fora do escopo do lint/
testes JS e do espelho `www/`, por isso os números batem com a rodada
anterior.)

## Como validar manualmente

Precisa de uma build nativa nova (`npm run cap:android` → gerar
APK/rodar num device/emulador — esta mudança só tem efeito depois de
recompilar o app, não é hot-reload via `server.url`). Depois:

1. Instalar a build nova num aparelho onde o app já estava instalado
   antes (ou um aparelho limpo).
2. Abrir o Papo ou Documentos, tocar em gravar áudio.
3. O Android deve mostrar o prompt padrão de permissão de microfone
   (se ainda não tiver sido decidido) — aceitar.
4. A gravação deve iniciar normalmente, sem "Permissão de microfone
   negada".

## Nota separada (não é bug, sugestão opcional)

O manifest já declara `<uses-feature android:name="android.hardware.camera"
android:required="false">` para a câmera (evita a Play Store filtrar
aparelhos sem câmera). Não existe declaração equivalente
`android.hardware.microphone` — não é necessário pro fix funcionar
(não afeta a concessão de permissão em runtime), mas pode valer
adicionar `<uses-feature android:name="android.hardware.microphone"
android:required="false" />` no futuro, seguindo o mesmo padrão, caso
queiram que a Play Store distribua o app pra aparelhos sem microfone
físico também. Não incluí aqui por ser fora do escopo do bug relatado.

## Reversão

Remover a linha `<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />`
do `AndroidManifest.xml` e recompilar.
