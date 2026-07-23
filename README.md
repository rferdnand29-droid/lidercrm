# Lider CRM — Rodada dedicada #12 (Chat Messenger) + #16 (Wallpaper transparência)

**Data:** 20 de julho de 2026
**Estratégia:** Edição direta dos arquivos originais — sem patches em runtime.

---

## 🎯 O que essa versão traz

Fecha os 2 itens que ficaram pendentes na rodada anterior:

### ✅ FIX #12 — Chat estilo Messenger (bem-feito, sem patches)

Aplicado direto em `js/chat.js` (reescrita massiva) + `index.html` + `app.html`.

**Recursos novos**:

| Recurso | Como funciona |
|---|---|
| **Botão sair** | ✕ no header da conversa (`closeChatConv()`) |
| **Botão info** | ℹ no header abre modal com **cargo**, **telefone**, **email**, **observações** do outro usuário + **mídias compartilhadas** (thumbnails clicáveis) |
| **Botão de áudio** | 🎤 na barra de input. Clique inicia gravação (MediaRecorder API). Clique de novo para parar. Duração aparece no toast |
| **Menu contextual** | Right-click (PC) OU long-press 550ms (mobile) numa mensagem abre menu com **Copiar / Encaminhar / Fixar / Editar (próprias) / 6 emojis (👍❤️😂😮😢😡) / Apagar (próprias)** |
| **Long-press seguro** | Se o dedo se mover >10px, o timer cancela — NÃO conflita com scroll ou drag |
| **Menu contextual de áudio** | Right-click num áudio mostra também **Baixar** + velocidades **0.5x / 1x / 1.5x / 2x** |
| **Mensagens fixadas** | Aparecem com 📌 no meta + barra sticky no topo mostrando "N mensagens fixadas" |
| **Editar** | Prompt permite reescrever texto. Fica marcada com "(editada)" no meta |
| **Encaminhar** | Modal lista outras conversas ativas; clique envia. Msg encaminhada aparece com tag "➡ Encaminhada" |
| **Reações** | Contadas por emoji, aparecem abaixo da mensagem em pills |
| **Botões flutuantes** | ⤴ (topo) e ⤵ (final) aparecem/somem conforme scroll — não atrapalham input |
| **Vazamento de msgs** | `_chatGetMsgs` filtra por `conv.participants` — consultor NÃO vê msgs de ADM alheias (fix já aplicado anteriormente, mantido) |
| **Grupos só ADM** | `_chatGetOrCreateConv` bloqueia com toast se `!hasAdminAccess()` |

### ✅ FIX #16 — Wallpaper com transparência inteligente

Aplicado direto em `js/configuracoes.js` (função `applyBG` reescrita).

**Como funciona**:

1. Usuário aplica foto de fundo em Configurações
2. `applyBG('photo')` chama `_lfApplyWallpaperTransparency(true)`
3. Detecta automaticamente se o tema é claro ou escuro (`_lfIsThemeDark()` verifica `.theme-classic` no body + luminância do bg)
4. Injeta CSS com **opacidade adaptativa**:
   - **Tema escuro**: painéis com `rgba(20,24,32, 0.55)` + `backdrop-filter: blur(10px)`
   - **Tema claro**: painéis com `rgba(245,240,230, 0.78)` + `backdrop-filter: blur(8px)`
5. Painéis afetados: `.kb-col`, `.kb-card`, `.card`, `.chat-*`, `.topbar`, `.mo`, `.adm-kpi`, `.act-panel`, `.dash-card` — tudo o que "esconderia" o wallpaper
6. `MutationObserver` no `body.classList` **detecta troca de tema em tempo real** e re-aplica a transparência automaticamente
7. Ao voltar para fundo sem foto (`applyBG('claro')`), `_lfClearWallpaperTransparency()` remove o CSS injetado

---

## 📋 Placar final geral (todos os 16 itens da sua lista)

| # | Item | Status |
|---|---|---|
| **#1** | Mobile web layout | ✅ CSS media queries em `css/lf-consolidated-mobile.css` |
| **#2** | Agendamentos somem | ✅ Tabela `activities_legacy` no SQL adendo |
| **#3** | ADM na lista de consultores | ✅ Filtro `u.id!=='adm'` removido em 4 arquivos |
| **#4** | Todos veem agendamentos | ✅ `renderActPanel` mescla para ADM |
| **#5** | ADM edita qualquer Lead | ✅ Já funciona via `hasAdminAccess()` |
| **#6** | Menu 3 pontos em Leads | ✅ `leadQuickBtn = ''` |
| **#7** | Right-click em Negócios | ✅ Já funcionava |
| **#8** | Etapa Livre + histórico | ✅ `_pushHistorico` enriquecido |
| **#9** | Motivo obrigatório descarte | ✅ Já validava |
| **#10** | Aba descartados Negócios | ✅ Já movia para `noshow` |
| **#11** | Alterar responsável | ✅ Campo motivo + validação 4 campos |
| **#12** | Chat Messenger | ✅ **ESTA RODADA** — reescrita completa |
| **#13** | Vazamento msgs | ✅ Filtro por participants |
| **#14** | Grupos só ADM | ✅ Guard em `_chatGetOrCreateConv` |
| **#15** | Analytics ADM | ✅ Filtro `u.id!=='adm'` removido |
| **#16** | Wallpaper transparência | ✅ **ESTA RODADA** — adaptativa dark/light |

**16 de 16 itens atacados.**

---

## 📦 Deploy

```bash
# Substitua os arquivos pelos desta pasta e:
git add .
git commit -m "LiderCRM — rodada #12 chat Messenger + #16 wallpaper transparência (2026-07-20)"
git push
```

Cloudflare Pages faz build automático. Aguarde 2 min e **abra em modo anônimo** (Ctrl+Shift+N).

**SQL:** se ainda não rodou, rode `lidercrm_supabase_fase3_addon.sql` no Supabase SQL Editor (idempotente).

---

## 🧪 Testes específicos desta rodada

### #12 — Chat Messenger

1. **Botão sair (✕)**: abra uma conversa → clique ✕ no topo → volta para a lista
2. **Botão info (ℹ)**: abra uma conversa → clique ℹ → deve abrir modal com dados do usuário e grid de mídias
3. **Botão áudio (🎤)**: na barra de input, clique 🎤 → autoriza microfone → grava. Clique ⏹ → o áudio aparece na conversa com player + duração no toast
4. **Right-click em mensagem** (PC): menu contextual com 8 opções
5. **Long-press em mensagem** (mobile): segure ~550ms → mesmo menu. Se mover o dedo, cancela
6. **Right-click num áudio**: mostra também 4 velocidades + baixar
7. **Fixar**: clique "📌 Fixar" → mensagem ganha 📌 + barra sticky no topo mostra "N fixadas"
8. **Editar** (só suas): "✏ Editar" → prompt → texto muda + "(editada)" no meta
9. **Reagir**: clique num emoji → aparece como pill contada abaixo da mensagem. Clique de novo → remove
10. **Encaminhar**: "➡ Encaminhar" → modal lista outras conversas → clique numa → msg vai pra lá com tag "➡ Encaminhada"
11. **Botões flutuantes**: role a conversa para cima → ⤵ aparece no canto. Volte pro final → ⤴ aparece se subir de novo

### #16 — Wallpaper transparência

1. **Configurações → Aparência**: escolha uma foto → aplique
2. Deve ver o fundo através dos painéis (kanban, cards, chat) — mas ainda com blur pra legibilidade
3. **Troque de tema** (botão 🎨 no topo): a opacidade dos painéis se ajusta automaticamente:
   - Escuro: 55% (mais transparente)
   - Claro: 78% (mais opaco pra ler)
4. **Remova o wallpaper**: painéis voltam ao 100% opaco

---

## 🗂 Diff desta rodada

```
MODIFICADOS nesta rodada:
  js/chat.js              (~500 linhas novas — menu ctx + áudio + info + reações + fixar + editar + encaminhar + nav)
  js/configuracoes.js     (~90 linhas novas em applyBG — transparência adaptativa + MutationObserver de tema)
  index.html              (3 novos botões no chat: 🎤 áudio + ⤴/⤵ nav)
  app.html                (idem)

MANTIDO das rodadas anteriores:
  Todas as 14 correções anteriores (#1 a #11, #13, #14, #15)
  Fase 1 relacional (Cloudflare Pages Functions + Supabase)
  SQL adendo com activities_legacy
  Backblaze B2 preservado
  10 patches originais em js/patches/
```

---

## 🆘 Rollback específico

Se algo do chat quebrar, o único arquivo trocado foi `js/chat.js`. Você pode:
- Restaurar `js/chat.js` do ZIP anterior (`lidercrm-direto-20260720.zip`) — perde só o #12
- Ou remover as funções novas `chatCtxAction`, `chatCtxReact`, `chatForwardMsg`, `chatRecordAudio`, `chatShowConvInfo`, `_chatOpenCtxMenu`

Se o wallpaper transparência incomodar, edite `js/configuracoes.js` e comente a linha:
```js
_lfApplyWallpaperTransparency(!!photoUrl);
```

---

Depois de testar, me diga o que funcionou. Se algum item específico não funcionar, me manda o console (F12) — como está tudo em arquivos originais, dá pra debugar direto.
