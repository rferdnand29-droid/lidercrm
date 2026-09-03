# RELATÓRIO — FIX vídeo de login (arquivo corrompido, não bug de código)

**Data:** 20/08/2026
**Pedido:** o vídeo de fundo do login funcionava certinho no zip
`DOC-20260812-FIX-RAIZ-V3-403-rolante-CORRIGIDO.zip`, e não aparece no
que eu entreguei — entender por quê e corrigir.

## Causa raiz — não era bug de código, era arquivo binário corrompido

Comparei os dois zips ponto a ponto:

| Item comparado | Resultado |
|---|---|
| `<script>`/`<link>` nos 4 HTMLs (index/app, raiz/www) | **Idênticos** — vídeo já estava registrado nos dois zips |
| `js/lf-auth-bg-controller.js` | **Idêntico**, byte a byte |
| `css/login/lf-auth-bg-animation.css` | **Idêntico**, byte a byte |
| `assets/videos/lf-auth-bg-desktop.mp4` | **Diferente** |
| `assets/videos/lf-auth-bg-mobile.mp4` | **Diferente** |

Ou seja: todo o código (HTML, CSS, JS) que liga e controla o vídeo
estava **correto e igual** nos dois zips. O problema inteiro estava
nos dois arquivos de vídeo em si, que eu tinha entregado
**corrompidos**:

- `lf-auth-bg-desktop.mp4`: faltava o bloco `moov` (o índice/metadados
  que qualquer player precisa pra sequer abrir o arquivo) — `ffprobe`
  recusava com "moov atom not found, Invalid data found when
  processing input".
- `lf-auth-bg-mobile.mp4`: o cabeçalho do arquivo era válido, mas **não
  tinha nenhuma faixa de vídeo dentro** (`nb_streams=0`) — um MP4
  "vazio", sem conteúdo pra tocar.

Os dois passavam despercebido num check superficial (`file
video.mp4` reconhece só a assinatura inicial do formato, sem validar a
estrutura interna) — só um `ffprobe` de verdade expôs o problema.

## Correção

Restaurei os dois arquivos a partir do zip que você mandou agora
(`DOC-20260812-FIX-RAIZ-V3-403-rolante-CORRIGIDO.zip`), que você
confirmou ter o vídeo funcionando — copiei os bytes originais, sem
alterar nada. Depois rodei o pipeline normal do projeto
(`npm run cap:www` + `npx cap sync`) pra propagar o arquivo corrigido
pras 4 cópias espelhadas (`www/`, `android/`, `ios/`) — todas
verificadas de novo com `ffprobe` depois, uma por uma, confirmando
`codec_name=h264` em todas.

## Verificação

```
ffprobe (raiz + www + android + ios, 2 vídeos cada) → h264 válido em todas
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
npx cap sync                     → android/ e ios/ sincronizados
```

## Nota honesta

Não tenho como precisar em qual sessão exata esses dois arquivos
ficaram corrompidos — provavelmente durante alguma das operações de
empacotar/reempacotar o projeto ao longo das últimas conversas, sem eu
ter verificado a integridade binária dos vídeos até agora (só eu
tinha checado se o arquivo "existia" e tinha a assinatura de MP4, o
que não pega esse tipo de corrupção). A partir de agora, sempre que eu
mexer nesses arquivos de vídeo, vou confirmar com `ffprobe` antes de
entregar — não só confiar no `file`.

## Reversão

Se por acaso os vídeos deste zip novo (Aug 12) não forem a versão mais
recente que vocês queriam (o projeto já passou por vários ajustes
desde então), me mandem a versão que preferem e eu troco — o resto do
código (controller/CSS) já está correto e não precisa de nenhuma
mudança adicional pra isso funcionar.
