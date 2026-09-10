# RELATÓRIO — Papo da Empresa: cabeçalho/barra de digitação fixos

**Data:** 22/08/2026
**Escopo:** seguido o roteiro `prompt-fix-chat-arquivos-especificos-lidercrm.md`,
arquivo por arquivo, na ordem indicada.

---

## 1. `js/patches/lf-chat-position-calibration-v1-20260805.js`

**O que era:** o roteiro suspeitava de um gesto de "arrastar com o
dedo" o cabeçalho/barra de digitar. **Não é isso** — conferi o arquivo
inteiro: é um menu em Configurações ("Ajustar posição do Papo") com
dois `<input type="range">` (sliders), sem nenhum listener de
`touchstart`/`touchmove`/`touchend` em lugar nenhum. A pessoa precisa
abrir Configurações deliberadamente pra mexer nisso — não dá pra
"arrastar sem querer" tocando na tela normal do chat.

**O que encontrei de real:** o ajuste aplica um `transform:translateY()`
fixo, salvo em `localStorage`, aplicado toda vez que o Papo abre. Se
alguém tivesse calibrado esse valor **antes** das correções estruturais
de sessões anteriores (altura do painel, reposicionamento do preview
de resposta), esse número salvo passaria a competir com essas
correções — empurrando as coisas na direção errada.

**Severidade:** baixa (só afeta quem já usou a ferramenta antes das
correções recentes).

**Decisão tomada** (conforme instruído — não travar esperando resposta):
mantive a ferramenta disponível (é um ajuste fino legítimo pra
variações entre aparelhos), mas **resetei qualquer valor já salvo**,
trocando a chave de armazenamento (`v1` → `v2`). Ninguém começa mais
com um deslocamento herdado de antes das correções.

---

## 2. `js/patches/chat/lf-fix-chat-mobile-scroll-lock-v1-20260820.js`

**O que era:** patch meu de sessão anterior. O roteiro suspeitava que
travasse o container errado.

**Conferido:** trava `<body>`/`<html>` (a causa raiz real, documentada
no próprio cabeçalho do arquivo — era a PÁGINA INTEIRA que rolava, não
`#chat-msgs`). Nunca toca em `#chat-msgs` diretamente, e o bloqueio de
gesto (`touchmove`) só age fora das áreas com rolagem própria — não
interfere com rolagem automática programática (`scrollTop=`), que é
como o "rolar até a última mensagem" funciona.

**Severidade:** N/A — sem bug encontrado aqui.

---

## 3. CSS do chat

### `css/chat/chat.css`
**Bug real encontrado e corrigido:** `#chat-input{flex:1;...}` sem
`min-width:0` — item flex sem essa propriedade não encolhe
corretamente quando os vizinhos disputam espaço. **Severidade:**
baixa isoladamente, mas contribuía pro problema do item abaixo.
**Correção:** adicionado `min-width:0`.

### `css/chat/lf-chat-redesign-v1.css`
**Dois bugs reais e importantes, encontrados nesta investigação (não
estavam no roteiro original):**

1. **`#pg-chat #chat-msgs{padding:16px!important;...}`** sem nenhuma
   media query. Como o seletor tem 2 IDs (`#pg-chat #chat-msgs`),
   ele é **mais específico** que o `#chat-msgs{padding-top:76px!important;
   padding-bottom:calc(100px+...)!important;}` em `lf-consolidated-mobile.css`
   — e em CSS, especificidade decide **antes** da ordem de
   carregamento dos arquivos. Essa regra sempre vencia, sobrescrevendo
   o espaço reservado pro cabeçalho/barra de digitar (que no mobile
   são `position:absolute`, fora do fluxo normal). **Isso deixava
   mensagens nascendo parcialmente escondidas atrás do cabeçalho ou da
   barra de digitar, mesmo com todo o resto do posicionamento
   corrigido em sessões anteriores.** Provavelmente a causa mais
   importante de tudo isso continuar acontecendo mesmo depois de três
   rodadas de correção anteriores.
   **Severidade:** alta.
   **Correção:** `padding` restrito a `@media(min-width:769px)` — no
   desktop nada muda (mesmo valor de antes); no mobile, o espaço
   reservado do arquivo mobile-específico passa a valer de verdade.

2. **`#pg-chat #chat-conv-header{padding:10px 16px!important;...}`** e
   **`#pg-chat #chat-input-area{padding:10px 14px!important;...}`** —
   mesma causa, mesma correção (padding restrito a desktop). Essas
   duas tinham severidade menor sozinhas (a versão mobile ainda
   ganhava no `min-height`, que não tinha `!important` aqui), mas
   competiam desnecessariamente e dificultavam o ajuste fino do
   espaçamento mobile (item 3 abaixo).

### `css/chat/lf-chat-hotfix-20260731.css`
**Conferido o alerta do roteiro sobre `.chat-list-header{display:none!important}`:**
não é bug — é intencional. "Papo da Empresa" já aparece na barra
superior do app (`#mobile-top-bar`, fixa, funcionando), e esse
`.chat-list-header` interno seria um título duplicado se não
escondido. O botão "Nova conversa" que ficaria escondido junto já tem
uma versão própria, mais visível, injetada por outro patch (redesign
da lista) — a funcionalidade não se perde. **Não mexi aqui.**

### `css/chat/lf-chat-consolidated-fix-v1-20260731.css` e `css/chat/chat-ui-p0.css`
Conferidos por completo — sem nenhuma regra relacionada a
cabeçalho/input/mensagens (o primeiro é só sobre o player de áudio no
desktop; o segundo é sobre o overlay de arrastar-e-soltar arquivo).
**Nada a corrigir.**

### `css/chat/lf-chat-emoji-btn-v1-20260804.css`
Conferido — reordena os botões via `order` (flex), sem afetar largura/
posicionamento do textarea. **Nada a corrigir.**

---

## Placeholder cortado ("Digite uma" em vez de "Digite uma mensagem...")

**Investigação:** fiz renderizações visuais reais pra medir o
problema. Combinando os requisitos que **precisam** ficar como estão —
botões de toque de 44px (acessibilidade) e fonte de 16px no campo
(necessária pra não disparar zoom automático no Safari/iOS ao focar)
— não sobra espaço suficiente pra "Digite uma mensagem..." caber numa
linha só em telas de celular estreitas, **mesmo** com o espaçamento no
mínimo absoluto. Confirmado por teste visual antes de decidir a
correção.

**Correção:** placeholder trocado pra "Mensagem..." — mesma convenção
que o próprio WhatsApp usa. Cabe com folga em qualquer largura de tela
realista, sem precisar reduzir toque/fonte abaixo do recomendado.
Também apertei um pouco o espaçamento ao redor (gap, padding) como
margem de segurança extra.

**Severidade:** média (cosmético, mas visível o tempo todo).

---

## 4. `js/whatsapp.js` e `js/patches/chat/nucleo/*`

**`js/whatsapp.js`:** referência desatualizada no roteiro — hoje esse
arquivo é só sobre upload de anexos (Cloudinary), não tem nenhuma
função de renderização/scroll do chat.

**Função real de auto-scroll:** `chatScrollToBottom()` e o
render que popula `#chat-msgs`, em `js/chat.js` — conferidos, fazem
`scrollTop=scrollHeight` toda vez que a lista de mensagens é
redesenhada (abrir conversa, enviar, receber). Sem regressão
encontrada.

**Núcleo de patches (`js/patches/chat/nucleo/*`):** conferidos os que
referenciam `#chat-conv-header`/`#chat-input-area`/`#chat-msgs`
diretamente — todos são sobre o **menu de contexto** (clique direito/
toque longo numa mensagem), lendo a posição de header/input só pra
saber onde é seguro abrir o menu sem cobri-los. Nenhum altera a
posição/padding desses elementos. **Nada a corrigir.**

---

## Resumo por severidade

| Achado | Severidade | Corrigido |
|---|---|---|
| `#chat-msgs` padding sobrescrito no mobile (especificidade) | **Alta** | ✅ |
| `#chat-conv-header`/`#chat-input-area` padding sobrescrito (mesma causa) | Média | ✅ |
| Placeholder "Digite uma mensagem..." não cabe numa linha | Média | ✅ |
| `#chat-input` sem `min-width:0` | Baixa | ✅ |
| Calibração manual podia ter valor desatualizado salvo | Baixa | ✅ (resetado) |
| Scroll-lock (patch anterior) | — | Sem bug |
| `.chat-list-header` escondido | — | Intencional, sem bug |
| Núcleo de patches do chat | — | Sem bug |

---

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `css/chat/chat.css` | `min-width:0` no `#chat-input` |
| `css/chat/lf-chat-redesign-v1.css` | padding de `#chat-msgs`/`#chat-conv-header`/`#chat-input-area` restrito a desktop |
| `css/lf-consolidated-mobile.css` | espaçamento mobile mais justo (gap/padding) |
| `index.html`, `app.html` | placeholder "Mensagem..." |
| `js/patches/lf-chat-position-calibration-v1-20260805.js` | reset da chave de calibração salva |

---

## Verificação

```
node --check (todos os JS alterados)  → OK
node scripts/ai-guard.mjs             → 0 violações bloqueantes
node scripts/verify-mirror.mjs        → www/ e raiz idênticos
npm run lint                          → 0 erros
npm test                              → 46/46 testes
npx cap sync                          → android/ e ios/ sincronizados
```

## Roteiro de teste manual (conforme pedido)

1. Tentar arrastar o cabeçalho da lista de conversas — não deve mover
   (nunca se moveu de verdade; era um menu separado em Configurações).
2. Abrir uma conversa e tentar arrastar o cabeçalho do contato — não
   deve mover.
3. Verificar se "Mensagem..." aparece completo, numa linha só.
4. Enviar uma mensagem — a lista deve rolar sozinha até o final.
5. Abrir o teclado — a barra de digitar deve continuar visível,
   colada no rodapé, sem sobrepor mensagens nem ficar cortada.
6. **Extra (achado desta investigação):** rolar até o topo da
   conversa — a primeira mensagem NÃO deve nascer escondida atrás do
   cabeçalho; rolar até o final — a última mensagem NÃO deve nascer
   escondida atrás da barra de digitar.

## Reversão

Tudo reversível arquivo por arquivo, sem migração de dado. O reset da
calibração (item 1) é a única coisa que "apaga" uma preferência salva
— se alguém tinha ajustado esse deslocamento por um motivo válido
(não relacionado ao bug), vai precisar recalibrar uma vez.
