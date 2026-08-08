# Mapa dos patches da aba Papo (Chat)

Reorganização de 2026-08-01. Objetivo: só isso — achar mais rápido qual
arquivo mexe em qual parte do chat quando aparece um bug novo. **A ORDEM
DE CARREGAMENTO NÃO MUDOU EM NADA** — só o lugar onde cada arquivo mora
no disco. Os `<script src="...">` em `index.html` e `app.html` continuam
na mesma sequência exata de antes (isso importa muito nesse projeto: boa
parte dos bugs que já apareceram foram causados por reordenar carregamento
de patch — não mexi em ordem, só em endereço).

O núcleo do chat (`js/chat.js`) **não foi movido** — continua em `js/`
junto dos outros módulos principais (`leads.js`, `kanban.js`, etc.), só os
`patches/` (as camadas empilhadas em cima) foram reorganizados.

## Onde procurar cada tipo de bug

### `legado-mensageiro/` — UI mobile/desktop do chat, geração mais antiga
`lf-user-instant-mobile-fix-20260713`, `lf-user-request-fix-20260713d`,
`lf-messenger-dark-mobile-permissions-20260713`,
`lf-messenger-desktop-shell-connect-fix-20260714g`,
`lf-messenger-user-request-fix-20260715b`. Nome não tem "chat" mas o
conteúdo mexe direto em `#pg-chat`/`.chat-shell`/`#chat-room-wrap` — são
de antes da convenção de nome `lf-chat-*` pegar. Um deles ainda usa
terminologia antiga de "room" em vez de "conv". Se o bug for visual em
mobile/desktop no chat e não aparecer em nenhuma outra pasta, comece aqui.

### `nucleo/` — funcionalidades de base do chat, um assunto por arquivo
Nome do arquivo já diz o que faz: navegação de abas, permissões, som de
contexto, presença/pin, anexos em nova aba, avatar/perfil, lazy-load do
boot, busca+abas de mensagem, gestão de grupo (versão base), digitando...,
arrastar-e-soltar arquivo, visualização de arquivadas, swipe/voltar no
Android. Se o bug é claramente sobre UMA dessas features específicas e não
depende de outros patches, comece aqui.

### `grupos-admin/` — administração de grupo e participantes
`lf-fix-participantes-notif-tabs-v1`, `lf-chat-archive-strict-view-v1`,
`lf-chat-group-participants-perms-v1`, `lf-chat-group-adm-actions-fix-v1`.
Bug de "ADM não consegue remover/promover participante", "aba Grupos
mostrando coisa errada", "arquivadas sumindo" → comece aqui.

### `presenca/` — status online/offline
`lf-presence-group-login-final-20260730.js` — heartbeat, "visto por
último", bolinha verde. É o único arquivo desse assunto; se o bug é sobre
presença, é aqui (mas confira também se `sql/fix_presence_500_20260801.sql`
já rodou no Supabase — bug de presença "backend indisponível" costuma ser
migração pendente, não bug de frontend).

### `visual/` — CSS/UX, geralmente seguro de mexer sem quebrar lógica
`lf-chat-ui-polish-v1`, `lf-chat-redesign-v1`, `lf-chat-hotfix-20260731`,
`lf-chat-ctx-backdrop-cleanup-v1`. Bug visual (cor errada, menu de
contexto não fecha, layout quebrado) → comece aqui antes de mexer em
lógica.

### `correcoes-acumuladas/` — ⚠️ COMECE AQUI para bugs esquisitos/intermitentes
A maior pasta, de propósito: é onde vive a corrente de patches
"caçador"/"definitivo"/"específico"/"consolidado" que foram empilhados
tentando resolver os MESMOS poucos pontos de atrito (nova conversa,
desfazer grupo, arquivar) repetidas vezes. Se um bug parece ter "várias
camadas de tentativa de conserto por cima", é quase certo que a causa (e
o próximo lugar a mexer) está aqui. Ordem de carregamento importa MUITO
dentro dessa pasta — cada uma envelopa a anterior. Antes de editar
qualquer uma, leia o cabeçalho do arquivo: quase todas documentam
"carregar depois de X".

## O que ficou de FORA dessa reorganização (de propósito)

Estes arquivos tocam no chat mas também mexem em outras áreas (leads,
config, boot geral) — mover pra dentro de `chat/` seria enganoso, então
ficaram em `js/patches/` (raiz):

- `lf-cacador-erro-definitivo-v4-20260801.js` — grupo/nova-conv/arquivar
  (chat) **+** tela de Config e watchdog do botão Resetar (não-chat).
- `lf-fix-definitivo-4bugs-r1-20260801.js` — idem (BUG1-3 são chat, BUG4
  é a tela de Config).
- `lf-caca-final-4sintomas-v1-20260801.js` — overlay fantasma (geral) +
  grupos dissolvidos (chat) + loop do splash (boot geral) + body preso
  (geral).
- `lf-splash-unstuck-v1-20260801.js` — tela de splash/boot, não é chat.
- `lf-notify-global-v1-20260727.js` — serviço de notificação global (a
  inbox interna, não só o Papo).
- `lf-tab-dots-notif-fix-20260729.js` — indicador de pendência em TODAS
  as abas do CRM, não só Papo.
- `lf-cacador-3fixes-v1-20260730.js` — usuário clonado/excluído voltando
  + tema; nada de chat apesar do nome parecido com os outros "cacador".
- `lf-brand-realtime-v1-20260730.js` / `lf-fix-raiz-token-quota-v1-20260801.js`
  — branding e infraestrutura (token/manifest/storage), gerais.

CSS na mesma lógica: `css/chat/` recebeu só `chat.css`,
`lf-chat-redesign-v1.css`, `chat-ui-p0.css`, `lf-chat-hotfix-20260731.css`
e `lf-chat-consolidated-fix-v1-20260731.css`. Os CSS "cacador-*" que
sobraram em `css/` são na verdade sobre a tela de LOGIN, não sobre chat —
apesar do nome parecido, não movi.
