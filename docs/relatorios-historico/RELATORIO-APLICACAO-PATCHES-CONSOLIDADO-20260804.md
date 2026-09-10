# Aplicação consolidada de patches — 2026-08-04

Este build aplica de forma limpa e idempotente dois patches ao CRM:

## 1. `lf-fix-activity-cloud-persist-v3-20260804.js`
- **Origem**: `lidercrm-fix-atividades-cloud-v3-20260804.zip`
- **Instalado em**: `js/patches/activities/lf-fix-activity-cloud-persist-v3-20260804.js`
- **Injetado em**: `index.html` e `app.html`, **logo após** a linha do
  `lf-fix-activity-done-real-v2-20260804.js` (respeita a ordem de
  dependências — `LF.*` do retry-queue-sync e `saveActivities/lfSaveActivitiesFor`
  do agenda.js já estão prontos).
- **Cache-buster**: `?v=20260804cloudv3`
- **Objetivo**: corrige "atividades/lembretes sumindo e não salvando em nuvem
  mesmo após concluídos" (causas A/B/C descritas no relatório original v3).

## 2. `lf-fix-notif-sound-stuck-v1-20260804.js`
- **Origem**: arquivo avulso enviado.
- **Instalado em**: `js/patches/notificacoes/lf-fix-notif-sound-stuck-v1-20260804.js`
- **Injetado em**: `index.html` e `app.html`, **logo após** a linha do
  `lf-overdue-activity-notif-fix-20260729.js`. Isso garante que o patch de
  som carregue DEPOIS de:
    - `js/notificacoes.js` (define `_playNotifSound`)
    - `js/chat.js` (define `_chatPollNewMsgs`)
    - `js/patches/chat/nucleo/lf-chat-ctx-sound-fix-v1-20260720.js`
    - `js/patches/notificacoes/lf-notify-global-v1-20260727.js`
- **Cache-buster**: `?v=20260804notifsoundstuck1`
- **Objetivo**: corrige "CRM não está notificando com som" (Promise de
  `_chatPollNewMsgs` reabria `_soundSuppressed=true` antes do som tocar;
  o wrap agora é kind-aware — só `chat` é suprimido; `late`/`geral` sempre
  passam — e libera `_soundSuppressed` só no `.finally()` da Promise com
  cinto de segurança de 800ms).

## Idempotência
Ambas as injeções verificam se o `basename` do patch já está no HTML antes
de injetar. Se já existir, apenas o cache-buster é bumpado. Nenhuma
duplicação de `<script>` ocorre em re-execuções.

## Backup
Backup timestampado dos HTMLs originais e dos patches de atividades v1/v2
está preservado em `_backup-fix-consolidado-<timestamp>/` na raiz do
projeto extraído. Para reverter manualmente:

```
cp _backup-fix-consolidado-*/index.html ./index.html
cp _backup-fix-consolidado-*/app.html   ./app.html
rm js/patches/activities/lf-fix-activity-cloud-persist-v3-20260804.js
rm js/patches/notificacoes/lf-fix-notif-sound-stuck-v1-20260804.js
```

## Verificação pós-deploy
1. Hard-reload no navegador (Ctrl+Shift+R / Cmd+Shift+R). Em Capacitor/PWA:
   fechar e reabrir o app.
2. Console:
   - `LF_FIX_ACT_CLOUD_V3.diag()` → todos os `installed.*` devem ser `true`.
   - `window.__LF_NOTIF_SOUND_STUCK_FIX_V1__` → `true`.
   - `window.__LF_SOUND_KIND_AWARE_WRAPPED__` → `true`.
3. Teste de atividades: criar → concluir → recarregar em outro dispositivo do
   mesmo usuário → estado persistido.
4. Teste de som: receber mensagem de chat com aba oculta → som toca;
   atividade atrasada → som toca; item da inbox → som toca.
