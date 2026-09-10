# Troubleshooting — casos reais já investigados neste projeto

Cada item abaixo é um bug que realmente aconteceu, foi diagnosticado e
corrigido em 2026-08-01. Servem de referência pra reconhecer o padrão
mais rápido da próxima vez.

## "CRM trava tudo" ao abrir nova conversa / clicar em botões

**Sintoma**: clicar em "+ Nova conversa" (ou qualquer botão depois
disso) para de responder; console mostra
`[Violation] 'click' handler took Nms` apontando pra um
`MutationObserver`.

**Causa raiz**: um `MutationObserver` observava `document.body` inteiro
e, a cada mutação, chamava uma função de render que **sempre**
reescrevia o DOM (mesmo se já estivesse correto) — cada reescrita
disparava o próprio observer de novo. Loop de auto-alimentação, sem
fim enquanto o elemento observado ficasse na tela. Como é a mesma
thread de JS, "trava o chat" na prática significa "trava a aba
inteira" (leads, config, tudo mais espera atrás desse loop).

**Correção**: a função chamada pelo observer virou idempotente de
verdade — checa se já tem o que precisa ANTES de mutar o DOM, não
depois. Ver `docs/coding-standards.md` item 4.

**Como detectar rápido da próxima vez**: `document.addEventListener
('click', fn, true)` temporário + `document.elementFromPoint(x,y)` no
momento do clique mostra se o clique está chegando no lugar certo. Se
chegar certo mas travar depois, procurar `[Violation]` no console —
ele aponta o arquivo:linha exatos.

## Loop no console que não para mesmo depois do "patch de silêncio" rodar

**Sintoma**: uma mensagem tipo `"Splash saiu normalmente em Nms"`
repete a cada ~250ms pra sempre, mesmo com um patch que deveria ter
dado `clearInterval` nele.

**Causa raiz**: a função que arma o interval (`_arm()`) podia rodar
duas vezes (uma via `DOMContentLoaded`, outra via um
`setTimeout(_arm, 3000)` de segurança/fallback, sem trava entre os
dois). As duas chamadas reaproveitavam a MESMA variável global pra
guardar o ID do interval — a segunda sobrescreve a referência da
primeira, que fica órfã: ninguém mais tem o ID pra cancelar.

**Correção**: trava de singleton (`if (jaArmado) return;`) na função
que cria o interval. Ver `docs/coding-standards.md` item 3.

## Diagnóstico reporta "tudo certo" mas o comportamento não bate

**Sintoma**: `window.algumStatus()` mostra uma flag `true`/instalado,
mas o efeito esperado não acontece.

**Causa raiz possível**: outro patch, carregado depois (inclusive via
`defer`, que roda depois de TODO script normal independente da posição
no HTML), envelopou a mesma função de novo por cima, criando um NOVO
objeto de função sem a flag do seu patch. A lógica do seu patch
continua rodando (está encadeada por dentro), só a flag que ficou
"enterrada".

**Como confirmar**: comparar a ordem real de execução (não a ordem
visual no HTML) — todo `<script defer>` roda depois de todo script
sem `defer`, em qualquer posição.

## `Manifest: property 'start_url' ignored, URL is invalid` (repetido dezenas de vezes)

**Causa raiz**: o manifest do PWA é servido via `blob:` URL (criado em
runtime, pra permitir branding dinâmico). Um `start_url`/`scope`
**relativo** (`'/'`) não resolve contra uma base `blob:` — o Chrome
descarta e avisa. Cada re-render do branding criava um blob novo,
daí a repetição.

**Correção**: `start_url`/`scope` sempre absolutos
(`location.origin + '/'`) quando o manifest é servido via `blob:`. Mais
detalhes em `docs/cloudflare.md`.

## Erro de SQL `column "X" does not exist`

Ver `docs/database.md` — quase sempre é confundir o nome usado no
app (`nome`, `telefone`, `ativo`) com o nome real da coluna
(`full_name`, `phone`, `active`).

## `[chat] Presence: Supabase indisponível`

Migração de presença (`sql/migrations/fix_presence_500_20260801.sql`)
provavelmente não rodou nesse ambiente. Ver `docs/supabase.md`.

## Metodologia geral pra investigar um bug novo neste projeto

1. Reproduzir com o console aberto — a maioria dos patches loga quando
   instala e quando age.
2. Rodar `window.lfCacaFinalStatus()` (ou o diagnóstico mais recente
   equivalente) pra descartar os bugs já conhecidos.
3. Se o clique/interação não faz nada: espião de clique
   (`addEventListener('click', fn, true)` + `elementFromPoint`) antes
   de suspeitar de lógica.
4. Se travar de vez: procurar `[Violation]` no console — o Chrome já
   aponta arquivo:linha do handler lento.
5. `node --check arquivo.js` sempre antes de considerar um patch
   pronto — pega erro de sintaxe na hora, sem precisar abrir
   navegador.
