# RELATORIO-SEGURANCA-CRITICA-AUTORIZACAO-USUARIOS-DEPARTAMENTOS-20260922

## Pedido

Continuar as separações de arquitetura pelas menos difíceis.

## Mudança de rumo: achado crítico, tratado com urgência

Comecei pelo primeiro passo seguro do item 11 (auditoria de
autorização) — mapear quais rotas do backend têm verificação de
permissão de verdade no servidor. Isso revelou uma vulnerabilidade
real e ativa, não uma lacuna teórica — decidi corrigir na hora, fora
do ritmo cauteloso de "só analisar" que mantive nas outras frentes,
dada a gravidade.

## O achado

`_worker_src/worker/middlewares/authz.js` tem uma "camada de defesa
em profundidade" (`ROUTE_MATRIX`) que rejeita com 403, **antes mesmo
de chegar no controller**, se o cargo do usuário não tem a capacidade
certa pra rota. Mas essa matriz só cobria: `/leads`, `/negocios`,
`/admin`, `/financeiro`, `/time`.

**`/api/v1/usuarios` e `/api/v1/departamentos` não estavam na
matriz.** Rotas não mapeadas caem no "default allow" (`return caps; //
rota não mapeada — só decora ctx.caps`) — passam direto. Confirmei
também que os controllers dessas duas rotas (`createOrUpsertUsuario`,
`deleteUsuario`, `updateDepartamento`, `deleteDepartamento`,
`assignDepartamentoMembers`, etc.) **não faziam essa checagem por
conta própria** — nenhuma verificação de cargo em lugar nenhum.

**Na prática**: qualquer usuário autenticado, independente do cargo
(inclusive o mais baixo), conseguia chamar a API diretamente (sem
passar pela interface, que só esconde os botões — não impede alguém
de montar a chamada na mão) e criar, editar ou excluir contas de
usuário, ou criar, editar, excluir departamentos e atribuir/remover
membros de equipe.

## A correção

Duas regras novas em `ROUTE_MATRIX`, seguindo exatamente o mesmo
padrão já usado por `/admin`/`/financeiro`:

- `/api/v1/usuarios` (e `/usuarios/bulk`) — GET continua livre (não
  quebra nenhuma leitura legítima, tipo listar usuários pra um
  dropdown); POST/PUT/PATCH/DELETE agora exigem `caps.adminUI`.
- `/api/v1/departamentos` (e sub-rotas, incluindo `/members`) — mesmo
  padrão: leitura livre, escrita exige `caps.adminUI`.

**Deliberadamente NÃO incluí** `/api/v1/usuarios/config` nessa
restrição — investiguei e confirmei que é um armazenamento genérico
de configuração (usado até por conversas de chat em grupo, que já tem
sua própria checagem específica de admin embutida no controller) —
cada usuário salva a própria preferência ali. Restringir isso ao
bloco geral quebraria autoatendimento legítimo.

Travado com **11 testes automatizados** novos, cobrindo explicitamente
o cenário do bug (POST/DELETE negado sem `adminUI`) e a garantia de
não regressão (GET continua livre, `/config` continua fora da
restrição).

## O que NÃO foi tocado — precisa de revisão futura, separada

A auditoria completa (`npm run audit:authz-coverage`, ferramenta
criada nesta mesma entrega) encontrou **42 rotas** sem verificação
explícita — corrigi as 2 mais claramente graves. As outras 40
incluem:

- **Já confirmadas seguras**: rotas públicas de login/sessão
  (`isPublicPath` já as isola antes da autenticação), `/roles` (só
  leitura, decisão documentada de auditoria anterior — consultor pode
  legitimamente ver permissões do próprio cargo).
- **Candidatas a revisão futura**: `GET /documentos/adm` (nome sugere
  conteúdo administrativo, hoje sem restrição — não corrigi por não
  ter certeza se o conteúdo é sensível ou institucional/público);
  `agenda-slots`, `ligacoes`, `atividades` (podem depender de escopo
  por dono de um jeito que este script não detecta, ou podem ter o
  mesmo tipo de lacuna — precisam de revisão individual, não em lote).

**Não tentei corrigir essas 40 agora** — cada uma precisa de contexto
próprio (qual é o comportamento pretendido) antes de qualquer mudança,
e fazer isso em lote, sem essa validação individual, arriscaria
quebrar acesso legítimo ou deixar passar outra lacuna real por pressa.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/audit-authz-coverage.mjs` | novo — ferramenta de auditoria |
| `_worker_src/worker/middlewares/authz.js` | 2 regras novas em `ROUTE_MATRIX`; `ROUTE_MATRIX` exportada pra teste |
| `package.json` | script `audit:authz-coverage` |
| `tests/authz-usuarios-departamentos-gate.test.js` | novo — 11 testes |

## Verificação

```
node scripts/audit-authz-coverage.mjs → confirma o achado original (42 rotas, agora 40 restantes)
node --check _worker_src/worker/middlewares/authz.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 113/113 testes (102 + 11 novos), incluindo os testes de authz já existentes, confirmando nada quebrou
npx cap sync                     → android/ios sincronizados
```

## Como validar manualmente

1. Logar como um usuário comum (não admin).
2. Tentar criar/editar/excluir outro usuário, ou um departamento, via
   chamada direta à API (não pela interface) — deve retornar 403
   agora.
3. Logar como admin — as mesmas ações devem continuar funcionando
   normalmente.
4. Confirmar que listar usuários/departamentos continua funcionando
   pra qualquer usuário autenticado (não deve ter quebrado nenhuma
   tela existente).

## Reversão

As 2 regras novas em `authz.js` podem ser removidas isoladamente, sem
efeito em nenhuma outra rota — mas dado que isso reabriria a
vulnerabilidade confirmada, não recomendo reverter sem substituir por
outra proteção equivalente.
