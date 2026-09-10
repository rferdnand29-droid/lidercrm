# Mapa dos patches de Notificações

Reorganização de 2026-08-01 — só reposicionamento, ordem de
carregamento inalterada. 4 arquivos, serviço global usado por TODAS as
telas (não só uma aba específica).

## Ordem de leitura recomendada (é uma cadeia de complementos, nesta ordem)

1. **`lf-notify-global-v1-20260727.js`** — base. Antes dele,
   notificações do chat/inbox só disparavam com o usuário DENTRO da
   página do chat. Sobe um serviço global no boot: reaproveita
   `_chatPollNewMsgs` a cada 5s mesmo fora de `#pg-chat`, assina
   Supabase Realtime pra `chat_conv_*`/`notifications/<uid>`, reduz o
   polling de fallback da inbox de 60s → 15s.
2. **`lf-notif-visibility-fix-v1-20260729.js`** — complementa o
   anterior: em Capacitor Android, `visibilitychange` às vezes não
   dispara ao voltar do background, então o timer da inbox retornava
   cedo achando que o app não estava visível. Força poll em
   `pageshow`/`focus`/`resume`(capacitor)/clique após 30s sem poll.
3. **`lf-overdue-activity-notif-fix-20260729.js`** — atividades
   atrasadas nunca escreviam em `lf_notif_<uid>` (só tocavam som e
   mostravam alerta visual), então o sino (`#ntf-bell`/`#ntf-badge`)
   ficava zerado mesmo com pendência real na Agenda.
4. **`lf-tab-dots-notif-fix-20260729.js`** — bolinhas de pendência nas
   abas do topo (Bingo/Leads/Negócios/Agenda/Papo/...). Mecanismo
   genérico pra qualquer aba futura, não só Papo (o pedido original).

Todos idempotentes, sem backend novo (client-side puro sobre a API já
existente). Ver `docs/coding-standards.md`.
