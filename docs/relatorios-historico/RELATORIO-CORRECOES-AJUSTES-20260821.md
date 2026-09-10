# RELATÓRIO — Correções e Ajustes Lider CRM (21/08/2026)

Resposta ao documento "Correções e Ajustes — Lider CRM, 21/08/2026".
Os 4 itens foram investigados e corrigidos, na ordem de prioridade
pedida.

---

## P1 — Item 1: Leads excluídos voltando após deploy/refresh — ✅ corrigido

### Causa raiz

Achado grave: o código **já tinha uma proteção desenhada
especificamente para este bug** — duas funções,
`_lfMarkRecentlyDeleted()` e `_lfIsRecentlyDeleted()`, chamadas em
**5 pontos diferentes** do app toda vez que um Lead/Negócio/Cliente é
excluído (`js/kanban.js`, `js/relatorios.js`, `js/clientes.js`, e um
patch). A lógica de sincronização (`_mergeKeepLocalOnly`, usada tanto
pelo Kanban quanto pelo Bingo) **já consultava** essas funções, com um
comentário explicando exatamente o problema: *"uma resposta de rede
que já estava em voo ANTES da exclusão local chega DEPOIS dela e
ressuscita o item — e pior, como o tamanho da lista mudou, o item
ressuscitado é regravado no servidor, tornando a ressurreição
permanente."*

Só que **as duas funções nunca tinham sido escritas**. Toda a fiação
já existia — a exclusão sempre "avisava" essas funções, e a
sincronização sempre "perguntava" pra elas — só que não tinha
ninguém do outro lado respondendo. Era uma correção desenhada e
conectada, mas nunca terminada.

### Correção

Implementadas as duas funções. Guardam os ids excluídos recentemente
em `localStorage` (não em memória — precisa sobreviver a
refresh/logout/deploy, exatamente os 3 cenários citados no pedido),
com validade de 7 dias. Isso fecha exatamente a corrida de rede já
documentada no próprio código, cobrindo Leads, Negócios e Bingo/
Clientes (todos usam a mesma função de sincronização).

**Arquivo:** `js/utils.js`.

---

## P1 — Item 2: Rolagem volta ao início ao mudar etapa — ✅ corrigido

### Causa raiz

Esse bug já tinha sido atacado numa sessão anterior, mas só no board
**desktop**. Achei o motivo de persistir: `renderKBMobile()` (a lista
de cards do celular) redesenha tudo do zero a cada mudança de etapa
— e nunca tinha recebido nenhuma preservação de posição de rolagem,
diferente do board desktop (que já tinha isso desde a sessão
anterior). Se a correção estava sendo testada no celular, é
exatamente por isso que continuava parecendo "não corrigido".

Também encontrei e removi **2 chamadas redundantes** que redesenhavam
a lista mobile duas vezes seguidas para uma única ação (em ações de
massa e ao fechar o modal de criar card) — como `renderKBLocal` já
dispara `renderKBMobile` por dentro quando necessário, essas chamadas
extras arriscavam uma corrida entre a nova preservação de rolagem e o
segundo redesenho, o que poderia reintroduzir o próprio bug.

### Correção

`renderKBMobile()` agora preserva a posição de rolagem, mesma técnica
já usada e comprovada no board desktop.

**Arquivo:** `js/kanban.js`.

---

## P2 — Item 3: Aba Bingo pro cargo Administrativo — ✅ já corrigido (confirmado)

Verificado: a correção de uma sessão anterior segue intacta e
funcionando — bloqueio tanto visual (aba escondida) quanto por trás
(o servidor recusa qualquer chamada de API do cargo Administrativo
pro Bingo, mesmo direto por fora da tela). Nenhuma mudança necessária
aqui.

---

## P2 — Item 4: Arrastar Lead no PC com rolagem automática — ✅ corrigido

### Causa raiz — parte 1 (rolagem automática)

A rolagem automática (subir/descer a etapa ao chegar perto da borda
enquanto arrasta) **já existia e já funcionava perfeitamente** — só
que apenas para arraste por **toque** (celular/tablet, "apertar e
segurar"). Nunca tinha sido conectada ao arraste por **mouse**
(desktop), que usa um sistema de eventos diferente do navegador. A
função pronta só precisava ser "religada" no lugar certo.

### Causa raiz — parte 2 (posicionamento exato ao soltar)

Ao investigar, achei — e depois descartei — uma suspeita: pensei que
a função que decide exatamente onde o card deve entrar ao soltar
(`_afterEl`) estivesse faltando. Não estava: ela existe e está
correta. O que realmente limitava o posicionamento preciso era não
conseguir *chegar* na posição desejada em listas longas, por causa da
rolagem automática que faltava (parte 1) — resolvendo isso, o
posicionamento exato (que já funcionava) volta a ser alcançável.

### Correções aplicadas

1. **Rolagem automática vertical conectada ao mouse** — arrastar perto
   do topo/base da etapa agora rola sozinho, igual já acontecia no
   toque.
2. **Velocidade proporcional à proximidade da borda** — pedido
   explícito: quanto mais perto da borda, mais rápido rola (antes era
   uma velocidade fixa). Aplicado tanto na rolagem vertical (dentro da
   etapa) quanto na horizontal (entre etapas).
3. **Rolinha do mouse durante o arraste** — adicionado suporte
   explícito, já que o arraste nativo do navegador pode deixar a
   resposta ao scroll inconsistente enquanto uma operação de arraste
   está em andamento (varia entre navegadores). Agora funciona sempre,
   independente disso.
4. **Posicionamento exato ao soltar** — confirmado que já funcionava
   corretamente; passa a ser alcançável em qualquer posição da lista
   graças aos itens 1-3.

**Escopo:** tudo isolado no código de arraste por **mouse**
(`dragover`/`wheel`, exclusivo do board desktop) — o código de arraste
por **toque** (mobile) não foi tocado, então o comportamento mobile
já existente não é afetado.

**Arquivo:** `js/kanban.js`.

---

## Verificação

```
node --check js/utils.js js/kanban.js  → OK
node scripts/ai-guard.mjs              → 0 violações bloqueantes
node scripts/verify-mirror.mjs         → www/ e raiz idênticos
npm run lint                           → 0 erros
npm test                               → 43/43 testes
npx cap sync                           → android/ e ios/ sincronizados
```

## Roteiro de validação (seguindo o critério do documento)

| Teste | Onde validar |
|---|---|
| Excluir um Lead → refresh | Item 1 |
| Excluir um Lead → logout/login | Item 1 |
| Excluir um Lead → novo deploy | Item 1 |
| Etapa com 15+ Leads, mudar etapa de um do meio da lista | Item 2 (desktop e mobile) |
| Mover Lead entre etapas / dentro da mesma etapa | Itens 2 e 4 |
| Usuário Administrativo → conferir Bingo ausente (tela e URL direta) | Item 3 |
| Usuário com acesso ao Bingo → conferir que continua normal | Item 3 |
| Arrastar pra cima/baixo perto da borda, em etapa longa | Item 4 |
| Rolinha do mouse durante o arraste | Item 4 |
| Soltar entre dois Leads específicos | Item 4 |
| Repetir tudo no mobile | Confirmar que nada mudou lá (só o item 2 foi tocado no mobile, e é uma correção aditiva) |

## Reversão

Todas as correções são reversíveis arquivo por arquivo, sem migração
de dado. Item 1 é puramente aditivo (duas funções novas, nenhuma
lógica existente alterada). Itens 2 e 4 só adicionam preservação de
estado/eventos em cima do que já existia — nenhuma lógica de negócio
foi reescrita.
