# RELATÓRIO — FIX-ADM-JWT-VENCE-CACHE (2026-08-18)

## Contexto do usuário
> "crm abrindo adm somente no meu pc no dele nao — dois caches locais por
> dispositivo (`lf6_u`, a lista de usuários, e `lf6_s`, os Claims da sessão),
> e o código prefere o cargo gravado no cache local do navegador em vez do
> JWT autoritativo que vem do login — ou seja, num PC o cache antigo 'trava'
> o cargo sem privilégio de admin, enquanto no seu o cache já está correto."

## Sintoma
Mesma conta logada em dois PCs. Em um o Painel ADM abre normalmente; no
outro não abre. O Worker devolve o cargo/admExtra corretos no `/login` e
no `/refresh` (S/`lf6_s` chegam corretos), mas `hasAdminAccess()` e
`getCargoCaps()` preferem o registro do próprio usuário guardado em
`lf6_u` — que pode estar desatualizado nesse PC.

## Causa (auditada em `js/auth.js`)
1. `getCargoCaps(uid)` (linhas ~240–292) só usava os claims do JWT
   (`S.cargoCodigo`/`S.admExtra`/`S.role`) como **fallback** quando
   `getUser(uid)` retornava `null`. Se `lf6_u` já tinha o próprio
   usuário, o cargo/admExtra desse cache vencia o JWT.
2. `hasAdminAccess(uid)` (linhas ~453–486) chamava `getCargoCaps(uid)` e
   caía no caminho legado por `getUser(uid).cargo` — mesma inversão de
   precedência.

Em conjunto: o PC com cache velho travava o acesso mesmo com o JWT
correto na sessão.

## Correção aplicada (arquivos alterados)

### 1) `js/auth.js` (e `www/js/auth.js`) — precedência invertida

**`getCargoCaps(uid)`**: quando `uid === S.userId` (o próprio usuário
logado) e `u = getUser(uid)` já existe no cache local, um novo bloco
resolve o cargo a partir dos claims do JWT primeiro:

- `S.role === 'adm'` → `CARGO_CAPS.master`
- `sCode = _lfCoerceCargoCode(S.cargoCodigo) || _lfNormalizeCargoCode(S.cargo)`
  → base pelo CARGO_CAPS do JWT
- Só cai em `_lfNormalizeCargoCode(u.cargo)` se o JWT não trouxe nem
  `cargoCodigo` nem `cargo` válidos (sessão antiga)
- `admExtra`: `S.admExtra` (se boolean) vence `u.admExtra`

Para **outros** usuários (não o logado), o caminho legado por `u.*` do
`lf6_u` fica intacto — não há regressão de comportamento em `Time` /
supervisão / edição foreign.

**`hasAdminAccess(uid)`**: adicionada checagem antecipada por JWT quando
`uid === S.userId`, antes do caminho por `getCargoCaps` / `getUser`:

- `S.role === 'adm'` → true
- `S.admExtra === true` → true
- `_lfCoerceCargoCode(S.cargoCodigo)` (ou `S.cargo`) com
  `CARGO_CAPS[code].adminUI === true` → true

Defesa em profundidade também dentro do caminho legado
(`if(S && S.userId===uid && S.admExtra===true) return true;`) para o
raro caso de `getCargoCaps` ter falhado.

### 2) `www/js/notificacoes.js` — sincronizado com `js/notificacoes.js`
O item **[A]** (`_notifSoundPaths` só com `.mp3`) já estava aplicado em
`js/notificacoes.js`, mas o `www/js/notificacoes.js` estava atrasado
(sem o bloco MULTI-TAB-SYNC-20260818 e sem os `.mp3`-only). Copiei o
arquivo canônico de `js/` para `www/js/` para as duas árvores servirem
o mesmo comportamento.

### 3) `js/chat.js` — item [C] já estava aplicado, confirmado
`_chatNormalizeConv` (linhas ~209–246) já reconstrói `participants` a
partir de `id.split('__')` quando `participants` está vazio e o próprio
usuário logado é um dos lados do id `<uidA>__<uidB>`. E
`_chatRepairConvBuckets` (linhas ~113–150) chama `_chatNormalizeConv`
na entrada e na saída, então o repair persistido também consolida.
`www/js/chat.js` já era idêntico a `js/chat.js` — nenhum ajuste
necessário.

## Não tocado (fora do escopo)
- Trabalhador (Worker) — mudança mínima como pedido.
- `js/dashboard.js` vs `www/js/dashboard.js` e `js/kanban.js` vs
  `www/js/kanban.js` seguem com as mesmas diferenças que já vinham no
  zip de entrada (a árvore `www/js/` é a versão mais completa; a `js/`
  é uma reconstrução mais enxuta) — nenhum dos dois arquivos é
  relevante para os sintomas descritos.
- Nenhum patch em `js/patches/` foi alterado. Em particular,
  `js/patches/scope/lf-cargo-only-via-departamento-v1-20260804.js`
  já dá precedência ao JWT em `_hasAdmExtraManual` (linha 158:
  `if(S && S.userId===uid && typeof S.admExtra==='boolean') return S.admExtra===true;`),
  então o wrapper de departamento continua compatível com a nova regra.

## Verificação
- `node -c js/auth.js` — OK
- `node -c js/notificacoes.js` — OK
- `node -c js/chat.js` — OK
- `diff -q js/{auth,chat,notificacoes}.js www/js/{auth,chat,notificacoes}.js`
  — todos idênticos entre as duas árvores.

## Marcadores para busca
- `FIX-ADM-JWT-VENCE-CACHE` — 2 ocorrências em `js/auth.js` e 2 em
  `www/js/auth.js` (getCargoCaps + hasAdminAccess).
- `FIX-CE1[A]` — em `js/notificacoes.js` e `www/js/notificacoes.js`.
- `FIX-CE1[C]` — em `js/chat.js` e `www/js/chat.js`.
