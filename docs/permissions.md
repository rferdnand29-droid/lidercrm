# Permissões

## Modelo: Cargo × Escopo × Ação, em DUAS camadas independentes

O modelo é `CARGO_CAPS` — um objeto que mapeia cada cargo (role) para
um conjunto de capacidades. Existe **em dois lugares fisicamente
separados**, que devem ser mantidos em sincronia **manualmente** (não
há geração de código nem fonte única) — isso é dito explicitamente no
comentário do próprio arquivo do worker:

| Camada | Arquivo | Papel |
|---|---|---|
| 1ª barreira (cliente) | `js/auth.js` — `CARGO_CAPS`, `CARGO_CAPS_DEFAULT` | Esconde UI, bloqueia mutações no client. **Não é segurança real** — só UX (evita a pessoa ver/clicar em algo que vai ser recusado). |
| 2ª barreira (servidor) | `_worker_src/worker/middlewares/authz.js` — `CARGO_CAPS`, `CARGO_CAPS_DEFAULT`, `ROUTE_MATRIX` | Recusa de verdade, mesmo que o client tenha sido adulterado. Comentário no próprio arquivo: "Espelho de CARGO_CAPS (js/auth.js). Manter em sincronia manualmente". |

**Risco de manutenção real e concreto**: adicionar um cargo novo, ou
mudar a capacidade de um cargo existente, exige editar os DOIS
arquivos. Editar só um deixa client e servidor divergentes — na
melhor hipótese (servidor mais restritivo) a pessoa vê um botão que
sempre falha; na pior (client mais restritivo, servidor mais permissivo
por esquecimento) uma tela pode parecer bloqueada enquanto a rota
correspondente continua aceitando a chamada direta via `fetch()`.

## Estrutura de uma entrada CARGO_CAPS

Campos observados (`CARGO_CAPS_DEFAULT` no client):
```js
{
  escopo: 'self',       // 'self' | 'team' | 'global' — quais registros o cargo enxerga
  leads: 'crud',          // permissão sobre leads
  negocios: 'crud',         // permissão sobre negócios/kanban
  foreign: 'none',            // acesso a registros de OUTRO usuário
  stageGated: false,            // trava de progressão de etapa (kanban)
  adminUI: false,                  // libera telas administrativas
  supervisorUI: false                 // libera telas de supervisão de equipe
}
```
Cargos com nível administrativo (client, `CARGOS_NIVEL_ADMIN`):
`gerente`, `gestor`, `representante`, `master`. Qualquer usuário com
`role==='adm'` ou `sub==='adm'` recebe `CARGO_CAPS.master`
incondicionalmente (ambas as camadas).

## Resolução do cargo efetivo (servidor, ordem real — ver `authz.js`)

1. `role==='adm'` ou `sub==='adm'` → `CARGO_CAPS.master` direto.
2. `cargo_codigo` assinado no próprio JWT → `CARGO_CAPS[code]`.
3. Cargo textual normalizado (`normalizeCargoCode()`) → `CARGO_CAPS[normalizado]`.
4. Nada bate → `CARGO_CAPS_DEFAULT` (o mais restritivo).

Há também um caminho via banco: uma view `v_user_caps` consultada e
cacheada em memória do isolate (`_dbCapsCache`, TTL configurável,
métricas expostas em `GET /api/v1/health/authz-cache` — ver
`controllers/authz-health-controller.js`, que por sua vez exige
`caps.adminUI` pra ser acessado).

## `ROUTE_MATRIX` — como uma rota decide a capacidade exigida

`authz.js` mantém uma tabela (`ROUTE_MATRIX`) que casa padrão de rota +
método HTTP com a dimensão de capacidade necessária. Métodos são
agrupados: `CRUD_METHODS = {POST,PUT,PATCH,DELETE}` exigem nível de
permissão de escrita; `READ_METHODS = {GET,HEAD}` exigem só leitura.
Ao adicionar uma rota nova que deveria ser restrita, ela precisa
**entrar no `ROUTE_MATRIX`** — uma rota nova sem entrada aqui não é
automaticamente protegida (comportamento default depende de como
`authorize()` trata "sem regra encontrada"; ver o código antes de
assumir).

## 3ª camada (não confundir com autorização) — escopo por dono do registro

Vários controllers (`clientes-controller.js`, `kanban-controller.js`,
`leads-controller.js`) têm uma checagem ADITIVA sobre `authz.js`:
validam que `ctx.user.sub` bate com o dono (`uid`) do registro sendo
lido/escrito — impede um consultor de ler/escrever dado de outro
consultor mesmo tendo capacidade CRUD genérica. Ver comentários
"ESCOPE ENFORCEMENT" nesses arquivos — cada um documenta a
vulnerabilidade específica que motivou a camada.

## Onde NÃO confiar em permissão

`financeiro-controller.js` tem um comentário explícito (auditoria
técnica 2026-08-01) sobre dado financeiro ter sido, em algum momento,
acessível sem checagem — hoje exige `caps.adminUI`. Ver
`docs/AUDITORIA-TECNICA-20260801.md` §3 para o histórico completo de
achados de segurança (fora do escopo desta reorganização — auditoria
separada, já existente).

## Regra de ouro para qualquer IA/dev mexendo em permissão

Esta reorganização (e a missão que a originou) **proíbe explicitamente**
alterar autenticação/autorização/permissões (Regra nº 6 da missão de
arquitetura). Este documento é só leitura do que já existe — qualquer
mudança real de permissão é uma tarefa separada, deliberada, e deve
tocar as DUAS camadas (`js/auth.js` + `authz.js`) de propósito, nunca
como efeito colateral de uma reorganização de arquivo.
