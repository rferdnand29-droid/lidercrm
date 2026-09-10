# RELATÓRIO — Bug do Bingo demorando + sincronia de login entre abas

**Data:** 2026-08-20

---

## Bug 1 — Bingo demora/não aparece ao mover pra Presencial ou Remarcar

**Sintoma relatado:** mover um Negócio pra "Presencial" às vezes não
reflete no Bingo (aba Agendados do Dashboard); mover pra "Remarcar"
também às vezes demora.

### Causa raiz

Existem **dois jeitos diferentes** de mudar a etapa de um card de
Negócios, e só um deles sincroniza o Bingo na hora:

1. **Arrastar o card ou clicar num botão de etapa no board/detalhe**
   → passa por `_kbMoveCard()` → o patch `lf-bingo-sync-v1-20260722.js`
   já tinha um hook aí (Hook 1) → Bingo atualiza **na hora**.
2. **Abrir o card pelo "Editar" e trocar a Etapa no dropdown do modal**
   → salva por `_finalizeSaveKBCard()` (`js/kanban.js`), que escreve a
   nova coluna **direto no card e chama `saveKBFor()`** — nunca passa
   por `_kbMoveCard()`. O Hook 1 nunca disparava aqui.

Sem sincronizar na hora, o registro do Bingo só ficava em dia na
**próxima reconciliação de boot** (`reconcileBingoFromNegocios()`, que
só roda uma vez por sessão, ~1,5s depois de logar) — ou seja, só na
próxima vez que a pessoa desse reload/relogasse. Daí o "às vezes
demora"/"às vezes não aparece": dependia de qual dos dois jeitos foi
usado pra mover o card, sem nenhuma diferença visível pra quem está
mexendo.

### Correção

Adicionado um **4º hook** no mesmo patch (`lf-bingo-sync-v1-20260722.js`),
envelopando `_finalizeSaveKBCard()`: compara a coluna antes/depois de
salvar o modal "Editar" e, se mudou (pra Negócios), sincroniza o Bingo
imediatamente — mesma função `syncNegocioToBingo()` que os outros 3
hooks já usam, só um novo ponto de entrada. Nenhuma lógica de
mapeamento etapa→status foi alterada.

**Arquivo:** `js/patches/kanban-leads/lf-bingo-sync-v1-20260722.js`
(extensão — os 3 hooks e a reconciliação de boot que já existiam
continuam iguais).

**Como validar:** abrir um Negócio pelo "Editar" (não arrastar, não
clicar nos botões de etapa), trocar a Etapa pra Presencial ou
Remarcar, salvar. O Bingo deve refletir a mudança sem precisar
recarregar a página.

---

## Feature 2 — Login sincronizado entre abas

**Pedido:** hoje, sair (logout) numa aba já desloga todas as outras.
Você quer o mesmo no sentido contrário: entrar numa aba deve logar as
outras automaticamente.

### Como já funcionava (logout, pra referência)

`js/patches/lf-fix-definitivo-multiaba-v1-20260819.js` já resolve isso
pro logout: `_execLogout()` publica numa `BroadcastChannel('lf_logout_v1')`
antes de remover a sessão; todas as abas escutam esse canal (mais um
fallback via `storage` event) e se autodeslogam ao receber o aviso.

### O que foi adicionado

Mesmo mecanismo, espelhado para o login — canal novo
`BroadcastChannel('lf_login_v1')`:

- `startApp()` (chamado por `doLogin()` logo depois de gravar a sessão
  em `localStorage`) agora também publica um aviso `{t:'login'}` no
  canal, reaproveitando o wrapper de `startApp()` que esse mesmo patch
  já tinha (antes só pra hidratar uma preferência).
- Toda aba que **ainda não estiver logada** (tela de login, sem
  `window.S`) e receber esse aviso — ou detectar via `storage` event
  que a chave `lf6_s` passou a existir — dá um `location.reload()`.
- Abas **já logadas** (qualquer usuário) ignoram o aviso — login em
  outra aba nunca interrompe trabalho em andamento.

**Por que recarregar em vez de "logar" a aba sem reload:** o boot
completo (`startApp()`) depende de dezenas de passos assíncronos
(carregar leads, negócios, usuários, atividades, chat, dashboard,
armar os pollings...) que só são seguros de rodar na ordem em que já
rodam hoje, a partir de uma página carregada do zero. Tentar montar
esse estado "a quente" numa aba que já está parada na tela de login,
com listeners/timers antigos possivelmente já armados, é bem mais
arriscado do que recarregar. Como a sessão (`lf6_s`) já está gravada
em `localStorage` **antes** do aviso ser publicado, a aba recarregada
sobe direto autenticada — o mesmo caminho que já funciona hoje quando
você abre uma aba nova enquanto já está logado em outra, só que agora
automático.

**Arquivo:** `js/patches/lf-fix-definitivo-multiaba-v1-20260819.js`
(extensão — a seção de logout global e o restante do patch continuam
iguais).

**Como validar:** abrir 2 abas do CRM, deixar as duas na tela de
login, logar numa delas. A outra deve recarregar sozinha e abrir já
logada, sem precisar apertar nada.

---

## Verificação

```
node --check <cada arquivo editado>  → OK
node scripts/ai-guard.mjs            → 0 violações bloqueantes
node scripts/verify-mirror.mjs       → www/ e raiz idênticos
npm run lint                         → 0 erros
npm test                             → 43/43 testes
npx cap sync                         → android/ e ios/ sincronizados
```

## Reversão

- Bug 1: remover a função `_hookFinalizeSaveKBCard` e a chamada
  `_hookFinalizeSaveKBCard();` em `_install()`
  (`lf-bingo-sync-v1-20260722.js`).
- Feature 2: remover `_installLoginBus()`, a seção `#8` e o bloco de
  `postMessage` dentro de `_wrapStartApp()`
  (`lf-fix-definitivo-multiaba-v1-20260819.js`).

Nenhum dos dois toca em arquivo canônico (`js/kanban.js`,
`js/auth.js`) — ambos são extensões aditivas de patches que já
existiam e já envelopavam exatamente essas funções.
