# `css/login/` — CSS exclusivo da tela de login

⚠️ **Só 3 destes 7 arquivos carregam em `index.html` E ficam AUSENTES
de `app.html`** — a diferença exata (junto com 2 vídeos + 1 JS) está
documentada em `docs/ai-guide.md` § "os 5 fatos". Os outros 4 carregam
igual nos dois entry points.

| Arquivo | Só em index.html? | Papel |
|---|---|---|
| `lf-auth-bg-animation.css` | **Sim** | Animação do vídeo de fundo do login |
| `lf-login-hide-logo-brand-v1-20260730.css` | **Sim** | Esconde logo/brand duplicado sobre o fundo animado |
| `lf-login-transparent.css` | **Sim** | Transparência do card de login sobre o vídeo |
| `lf-cacador-4bugs-20260730.css` | Não (ambos) | Transparência do login + texto branco negrito — **deve carregar DEPOIS de `css/style.css`** |
| `lf-cacador-erro-especifico-20260730.css` | Não (ambos) | Corrige seletores reais do markup (`.lmon`, `.lbr`, `.crm-brand-name`) que o CSS anterior mirava errado |
| `lf-login-input-transparent-final-20260730.css` | Não (ambos) | Inputs (email/senha) transparentes em foco/digitação/autofill |
| `lf-login-input-forcetransp-20260801.css` | Não (ambos) | Override final — força transparência em qualquer estado do input |

Ordem de carregamento importa aqui como em qualquer outra pasta deste
projeto — ver `docs/architecture.md`.
