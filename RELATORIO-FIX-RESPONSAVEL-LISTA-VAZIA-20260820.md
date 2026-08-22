# RELATÓRIO — FIX lista de "responsável" incompleta no detalhe do Lead

**Data:** 2026-08-20
**Bug reportado:** ao alterar responsável no detalhe de um Lead, as
opções não aparecem de início — só depois de mudar o card de Lead pra
Negócio (e voltar) é que a lista aparece certa.

## Investigação

O `<select id="det-resp-sel">` (dropdown "novo responsável", dentro de
`#det-transfer-wrap` em `js/kanban.js`, função `openKBDet`) é populado
duas vezes quando o detalhe abre:

1. Na hora, com o que já estiver no cache local de usuários (`lf6_u`).
2. Uma "revalidação" em segundo plano, chamando `loadUsersDB(cb)`, que
   deveria buscar a lista fresca do servidor e repintar o `<select>` se
   vier mais completa que a versão local.

O passo 2 é o que deveria proteger justamente contra o cenário
relatado (cache local incompleto/frio na primeira vez que um detalhe é
aberto na sessão) — mas achei que ele **nunca fazia nada de verdade**.

## Causa raiz

`loadUsersDB()` (`src/modules/usuarios/runtime/users-store.js`) só
tentava buscar do servidor quando `global.DB_MODE === 'firebase'`:

```js
if (global.DB_MODE === 'firebase' && repo && typeof repo.listUsers === 'function') {
  repo.listUsers().then(...);
} else {
  cb(getUsers()); // só devolve o cache local, sem buscar nada
}
```

`DB_MODE` é `'local'` por padrão e a arquitetura atual (Cloudflare
Worker + Supabase) **nunca** o troca pra `'firebase'` — esse era o modo
antigo (Firestore com listeners em tempo real), mantido só por
compatibilidade. Na prática, **todo chamador** desta função — a
revalidação do responsável em `kanban.js`, e também 3 pontos em
`chat.js` e 1 em `relatorios.js` — recebia de volta exatamente o mesmo
cache local que já tinha, sem nenhuma tentativa real de buscar dado
novo. O "revalida em segundo plano" era um no-op silencioso.

Resultado: se o cache `lf6_u` estava incompleto no momento em que o
detalhe do Lead abria (ex.: primeiro card aberto na sessão, antes do
cache "esquentar"), a lista de responsável ficava incompleta/vazia — e
nada corrigia isso depois, porque a única rede de segurança prevista
pra esse cenário estava desativada.

## Por que trocar Lead→Negócio "desbugava"

Não é uma causa direta — é que, entre abrir o Lead, mexer nos campos,
trocar pra Negócio e voltar, tempo suficiente passa para QUALQUER outro
fluxo do app que acabe populando `lf6_u` (ex.: outra tela, outro
carregamento) coincidir e "consertar" o cache antes da próxima
tentativa. A causa real não tinha relação com Lead vs Negócio
especificamente — qualquer ação que desse tempo/oportunidade pro cache
esquentar teria o mesmo efeito.

## Correção

`loadUsersDB()` agora tenta `repo.listUsers()` **sempre**, não só em
modo Firebase. `UsuariosRepository.listUsers()` já tem sua própria
cadeia de fallback interna (Worker → `workerClient.usuarios()` →
Firebase → cache local), então é seguro chamar independente do
`DB_MODE` — o gate aqui era desnecessário e ficou desatualizado depois
da migração pro Worker.

```js
function loadUsersDB(cb){
  var repo = _usuariosRepo();
  if (repo && typeof repo.listUsers === 'function') {
    repo.listUsers().then(function(safeList){
      var result = Array.isArray(safeList) ? safeList.filter(Boolean) : [];
      if (result.length) {
        global.ss('lf6_u', result);
        _crmEmitUsersUpdated('remote-load', result);
        cb(result);
      } else if (global.DB_MODE === 'firebase') {
        migrateUsersLegacyDoc(cb);   // comportamento Firebase preservado intacto
      } else {
        cb(getUsers());              // fallback seguro, igual antes
      }
    }).catch(function(){ cb(getUsers()); });
  } else {
    cb(getUsers());
  }
}
```

Comportamento em modo Firebase (`DB_MODE==='firebase'`) **não muda em
nada** — só o caminho Worker (o modo real de produção) passou a
efetivamente buscar dado fresco.

## Efeito colateral (positivo)

Como `loadUsersDB()` é chamada de vários lugares além do detalhe do
Lead (`js/chat.js` × 3, `js/relatorios.js`), essa correção também
melhora a atualização da lista de usuários nesses outros pontos, que
tinham exatamente o mesmo problema — sem precisar tocar em nenhum
deles individualmente.

## Nota (não corrigido agora, fora do escopo pedido)

`loadDepartmentsRemote()` (mesmo arquivo) tem o mesmo padrão de gate
`DB_MODE==='firebase'`, mas Departamentos já funcionam corretamente
porque têm um caminho de busca real separado
(`LF_DEPARTMENTS.refresh()`, chamado por outro patch) — não é um bug
visível hoje, só uma inconsistência de código. Registro aqui pra
referência futura, não mexi nisso agora.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `src/modules/usuarios/runtime/users-store.js` | `loadUsersDB()` corrigida |
| `www/**` | espelho, regenerado via `npm run cap:www` |

## Validação

```
node --check src/modules/usuarios/runtime/users-store.js → OK
node scripts/ai-guard.mjs        → 0 violações bloqueantes
node scripts/verify-mirror.mjs   → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 43/43 testes
```

## Como validar manualmente

1. Deslogar e logar de novo (força cache `lf6_u` frio).
2. Abrir o detalhe de um Lead qualquer imediatamente.
3. A lista de "novo responsável" deve trazer todos os usuários — sem
   precisar trocar pra Negócio e voltar.

## Reversão

Restaurar a condição `if (global.DB_MODE === 'firebase' && repo && ...)`
em `loadUsersDB()` (`src/modules/usuarios/runtime/users-store.js`).
