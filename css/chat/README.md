# `css/chat/` — CSS exclusivo da aba Papo (Chat Corporativo)

Mesma lógica de `js/patches/chat/` — CSS exclusivo do chat isolado do
CSS geral (`css/style.css` etc., que fica na raiz de `css/` por afetar
o app inteiro). Ver `docs/folder-structure.md`.

| Arquivo | Papel |
|---|---|
| `chat.css` | Módulo "Papo da Empresa" — layout base: 3 colunas desktop, 1 coluna mobile |
| `chat-ui-p0.css` | CSS mínimo de fallback pros patches P0, pra testar via console sem aplicar os patches JS completos |
| `lf-chat-redesign-v1.css` | Redesign visual da aba (2026-07-31) |
| `lf-chat-hotfix-20260731.css` | Hotfix final do chat (2026-07-31) |
| `lf-chat-consolidated-fix-v1-20260731.css` | Ajustes finais desktop/PC |

Carregado em `index.html` e `app.html` identicamente (não faz parte da
diferença de vídeo de login — ver `docs/ai-guide.md`).
