# RELATORIO-CONSOLIDACAO-FUNDO-LOGIN-FERRAMENTA-AUTOATENDIMENTO-20261007

## Pedido

Organizar uma pasta única sobre o vídeo/foto da tela de login (PC,
celular, Capacitor), permitindo trocar sozinho, sem precisar pedir
ajuste a cada vez.

## Achado real, não previsto no pedido original

Antes de conseguir organizar qualquer coisa, precisei investigar por
que "o vídeo pedido não estava funcionando" (relatado numa conversa
anterior). A causa raiz era mais séria do que um arquivo 404: **dois
sistemas de fundo de tela de login coexistiam, sem intenção,
brigando pelo mesmo espaço visual**:

1. **Sistema antigo** (`assets/videos/` + `lf-auth-bg-controller.js`
   + 3 arquivos CSS em `css/login/`, datados de julho/agosto) — mais
   elaborado, cobria splash+login, mas **sem garantia de imagem de
   reserva** — se o vídeo falhasse, sobrava um gradiente vazio.
2. **Sistema novo** (`assets/login/` + `js/lf-login-video.js`,
   construído numa sessão recente) — mais simples, só login, **sempre
   com foto de reserva garantida**.

Um script rodando em segundo plano (`MutationObserver`) inclusive
**forçava ativamente meu logo "LIDER CRM" a ficar escondido** —
mesmo corrigindo todo o resto, isso continuaria quebrando a tela.

## A consolidação

Removi todas as referências ao sistema antigo dos dois HTMLs
(`index.html`, `app.html`) — CSS, script controlador, div de vídeo, e
o script que escondia o logo. **Cuidado extra**: alguns desses
arquivos misturavam correções de login com correções de chat em
grupo completamente não relacionadas (achado durante a investigação)
— nesses casos, removi cirurgicamente só a parte de login,
preservando as 6+ correções de chat intactas no mesmo arquivo.

**Nenhum arquivo de vídeo foi apagado** — só as referências
duplicadas. Os vídeos antigos continuam em `assets/videos/`, sem uso,
caso queira reaproveitar algum no futuro.

Confirmei visualmente (renderizando a tela de verdade, desktop e
mobile) que o resultado agora é exatamente o card "LIDER CRM"
projetado original, sem interferência do sistema antigo.

## A ferramenta de autoatendimento (o pedido original)

`scripts/trocar-fundo-login.mjs` — uso:

```
node scripts/trocar-fundo-login.mjs <arquivo> <desktop|mobile>
```

Faz tudo sozinho: detecta foto vs. vídeo pela extensão, confere
dimensão (avisa sem bloquear se a proporção for diferente), copia pro
lugar certo com o nome certo, e **sincroniza automaticamente o app
nativo** (equivalente a rodar `npm run cap:www` + `npx cap sync` na
mão) — sem precisar de Python, `ffmpeg` nem nenhuma ferramenta
externa, só o Node.js que o projeto já exige.

**Validação rigorosa antes de confiar na ferramenta**: escrevi os
leitores de dimensão (JPEG e MP4) em JavaScript puro, direto dos
bytes do arquivo — sem biblioteca externa, pra funcionar em qualquer
computador que já tenha Node.js. Testei os dois contra ferramentas de
referência (Pillow pra JPEG, `ffprobe` pra MP4) usando os arquivos
reais do projeto — resultado idêntico nos dois casos. Testei também
os 4 caminhos de erro (proporção errada, arquivo inexistente,
argumento inválido, formato não reconhecido) e o fluxo completo de
ponta a ponta, incluindo a sincronização real do Capacitor.

## README consolidado

Reescrevi `assets/login/README.md` como fonte única de verdade —
inclui a ferramenta automática, o jeito manual (se preferir), a
tabela de tamanhos recomendados, e uma seção de histórico explicando
por que só existe um sistema agora (pra quem abrir esta pasta daqui a
meses e se perguntar "por que tinha duas coisas antes?").

## Arquivos

| Arquivo | Mudança |
|---|---|
| `index.html`, `app.html` | sistema antigo removido (CSS, div, script) |
| `css/login/lf-cacador-erro-especifico-20260730.css` | só o bloco de login removido, resto (chat) preservado |
| `js/patches/chat/correcoes-acumuladas/lf-cacador-erro-especifico-v1-20260730.js` | só o bloco de login removido, resto (chat) preservado |
| `css/login/lf-auth-bg-animation.css`, `lf-login-transparent.css`, `lf-login-hide-logo-brand-v1-20260730.css`, `lf-cacador-4bugs-20260730.css`, `lf-login-input-transparent-final-20260730.css`, `lf-login-input-forcetransp-20260801.css` | apagados (100% redundantes, sem uso fora do sistema antigo) |
| `js/lf-auth-bg-controller.js` | apagado (100% redundante) |
| `scripts/trocar-fundo-login.mjs` | novo — ferramenta de autoatendimento |
| `tests/trocar-fundo-login.test.js` | novo — 8 testes |
| `assets/login/README.md` | reescrito — fonte única de verdade |
| `package.json` | script `trocar-fundo-login` registrado |

## Verificação

```
node --check (todos os arquivos .js tocados) → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 201/201 testes (193 + 8 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
Renderização visual (desktop + mobile) → card "LIDER CRM" aparecendo corretamente
```

## Como usar daqui pra frente

```
node scripts/trocar-fundo-login.mjs /caminho/da/foto-nova.jpg desktop
node scripts/trocar-fundo-login.mjs /caminho/da/foto-nova.jpg mobile
```

Depois, publique o site normalmente. Pro app instalado, gere um novo
build (APK/IPA) — a ferramenta já deixa os projetos Android/iOS
prontos pra isso.

## Reversão

Reversível arquivo por arquivo — mas dado que o sistema antigo era
comprovadamente a causa da confusão relatada, não recomendo reverter
sem entender bem o motivo.
