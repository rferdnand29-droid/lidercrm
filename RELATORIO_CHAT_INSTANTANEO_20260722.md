# Relatório técnico — chat, instantaneidade e áudio

Data: 2026-07-22
Projeto analisado: LiderCRM (ZIP enviado)
Arquivo principal afetado: `js/chat.js`

## Resumo executivo

O problema não está em um único bug. São **3 falhas estruturais combinadas**:

1. **As mensagens não são instantâneas entre usuários** porque o chat depende de **polling a cada 5s** e ainda para de buscar quando a página fica oculta.
2. **Uma conversa nova pode não aparecer para o destinatário** porque o app só consulta conversas que já existem no cache local do próprio usuário.
3. **O áudio gravado no chat não segue o mesmo fluxo confiável dos outros anexos**: ele era salvo como `base64` dentro do documento da conversa, sem índice de descoberta, sem notificação do destinatário e sem upload externo.

## O que está funcionando

- O envio de texto aparece imediatamente **para quem enviou**.
- O render da conversa, lista, anexos e player local existem e estão estruturados.
- O sync do chat já grava um documento `chat_conv_<id>` na nuvem.
- O módulo já tem base para anexos via upload externo (`Backblaze B2`).

## O que não está funcionando corretamente e por quê

### 1) Mensagens não aparecem “instantaneamente” no outro lado
**Arquivo:** `js/chat.js:1686-1788`

**Causa:**
- O app usa polling.
- O intervalo original era **5 segundos**.
- Se a página estiver oculta, o polling é abortado.

**Efeito prático:**
- O outro usuário sempre vê com atraso.
- Se a aba/app estiver em background, a atualização pode demorar mais ainda.
- Isso não é “tempo real”, é sincronização periódica.

### 2) Primeira mensagem de uma conversa nova pode não aparecer para o destinatário
**Arquivo:** `js/chat.js:1691-1733` (fluxo de poll anterior à correção)

**Causa:**
- O polling consultava apenas as conversas já existentes em `_chatGetConvs()`.
- Se o destinatário ainda não tinha aquela conversa salva localmente, ele **nunca consultava** `chat_conv_<id>`.

**Efeito prático:**
- A conversa nova pode existir no servidor, mas o destinatário não “descobre” ela sozinho.
- Isso afeta texto, anexo e especialmente áudio.

### 3) Áudio gravado no chat tinha fluxo diferente e frágil
**Arquivo:** `js/chat.js:871-921` (antes da correção)

**Causa:**
- O `chatRecordAudio()` montava a mensagem manualmente.
- O áudio não passava pelo mesmo pipeline de anexos.
- Ele ficava em `attachmentData` como `base64` no documento da conversa.
- A mensagem de áudio original nem sempre carregava metadados equivalentes ao envio normal de anexo.
- O fluxo não disparava descoberta de conversa/nova notificação da mesma forma que deveria.

**Efeito prático:**
- Áudio podia parecer enviado localmente, mas falhar ou chegar inconsistente no outro usuário.
- Quanto maior o áudio, pior a confiabilidade do sync.

### 4) Anexos e áudio não notificavam o destinatário como o texto
**Arquivo:** `js/chat.js:1231-1242` (antes da correção)

**Causa:**
- O texto fazia `pushNotif(...)` em `sendChatMsg()`.
- O caminho de anexo/áudio via `_chatPushMsg()` não fazia a mesma notificação.

**Efeito prático:**
- Texto notificava.
- Arquivo/áudio podia sincronizar sem notificar corretamente.

### 5) Risco crítico de segurança no storage
**Arquivo:** `js/backblaze.js:19-20`

**Causa:**
- `keyId` e `applicationKey` estão expostos no frontend.

**Efeito prático:**
- Qualquer pessoa com acesso ao JS pode extrair as credenciais.
- Isso não causa diretamente o bug do chat, mas é um problema crítico de produção.

## Correção aplicada no script

Foi aplicada uma correção direta em `js/chat.js` com estes objetivos:

1. **Unificar o envio de áudio com o pipeline de anexo**
   - `chatRecordAudio()` agora reaproveita `_chatSendAttachment(...)`.
   - O áudio passa a seguir o mesmo fluxo dos anexos, com metadados (`kind`, duração, mime).

2. **Criar índice de descoberta de conversas por usuário**
   - Foi adicionado um índice `chat_inbox_<uid>`.
   - Quando uma mensagem é enviada, o resumo da conversa é replicado para os participantes.
   - O destinatário consegue descobrir conversas novas sem depender do cache local prévio.

3. **Notificar também em anexo/áudio**
   - `_chatPushMsg()` passou a disparar notificação do mesmo jeito que o texto.

4. **Persistir corretamente o `updatedAt` da conversa**
   - Foi criado `_chatTouchConv(...)` para evitar inconsistência no timestamp da conversa.

5. **Reduzir a latência percebida**
   - O polling foi reduzido de **5s para 1.2s**.

## Resultado esperado após aplicar esta versão

### Deve melhorar imediatamente
- Texto chegando muito mais rápido entre usuários.
- Conversa nova passando a aparecer no destinatário.
- Áudio seguindo fluxo consistente com o restante dos anexos.
- Áudio e anexos também gerando notificação do destinatário.

### Ainda não vira “tempo real puro”
Mesmo com o patch, isso continua sendo **polling otimizado**, não WebSocket/push real.
Então:
- com o app aberto: deve ficar **quase instantâneo**;
- em background/aba oculta: ainda depende das limitações do navegador/webview.

## Recomendação técnica final

### Fase 1 — aplicar já
Usar esta correção direta de `js/chat.js`.

### Fase 2 — ideal para produção
Migrar o chat para um destes modelos:

1. **Supabase Realtime** para mensagens e presença
2. **Push real** (FCM / APNs / Web Push / Capacitor Push Notifications) para notificação instantânea em background
3. **Upload de áudio 100% server-side ou storage assinado**, sem credencial exposta no frontend

## Arquivos entregues nesta correção

- `js/chat.js` — corrigido
- `RELATORIO_CHAT_INSTANTANEO_20260722.md` — este relatório
- `patch_chat_lidercrm.py` — script usado para aplicar a correção automaticamente
