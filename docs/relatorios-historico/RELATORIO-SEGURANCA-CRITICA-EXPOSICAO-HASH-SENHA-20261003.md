# RELATORIO-SEGURANCA-CRITICA-EXPOSICAO-HASH-SENHA-20261003

## Pedido

Continuar a auditoria de correção — área nova: sistema de
autenticação (`auth-controller.js` e serviços associados).

## Contexto — por que esta área

Nunca tinha recebido uma auditoria de correção dedicada nesta sessão
(só os middlewares ao redor dela). Dado que é a peça mais crítica de
todo o sistema, decidi investigar com atenção redobrada.

## Login, troca de senha, reset administrativo — tudo correto

`loginService`, `changePasswordService` e `adminResetPasswordService`
estão extremamente bem implementados, com histórico de correções
anteriores já documentado no próprio código. Confirmei, entre outras
coisas, que **um administrador não consegue trocar a senha de outra
pessoa via o fluxo normal sem saber a senha atual dela** — só o
endpoint de reset administrativo (mais explicitamente controlado)
permite isso. Nenhum bug encontrado nessas três funções.

## O achado — investigando a "ponte de sessão legada"

A ponte de sessão legada (`legacy-bridge-service.js`) — um mecanismo
alternativo de login pra sistemas antigos — usa o campo `ph` (hash de
senha bruto) do usuário como material de uma assinatura HMAC. Isso é
seguro **desde que ninguém além do próprio usuário consiga ver o
próprio `ph`**. Investiguei se esse campo vazava em algum lugar.

### SEC-07 — achado, corrigido

`GET /api/v1/usuarios/legacy` (já restrito a admin numa correção
anterior desta sessão) devolvia o documento inteiro de usuários **sem
nenhuma sanitização**, incluindo o `ph` de todo mundo. Corrigido
aplicando a mesma função de sanitização (`scrubUser`) já usada em
outros pontos deste arquivo.

### SEC-08 — achado mais grave, corrigido: qualquer usuário, não só admin

Ao investigar mais a fundo, encontrei um caminho **completamente
separado e sem restrição de cargo nenhuma** pro mesmo dado: o
endpoint genérico `/usuarios/config` (GET/PUT/DELETE) aceitava um
`name` totalmente livre do cliente. Passando
`name=users/items/<uid-de-qualquer-pessoa>`, isso resolvia pro MESMO
caminho interno usado pelos registros individuais de usuário —
**qualquer usuário autenticado conseguia ler (e, via PUT/DELETE,
sobrescrever ou apagar) o registro de QUALQUER outra pessoa da
empresa**, incluindo o hash de senha bruto.

**Por que isso é sério de verdade**: com o `ph` de outra pessoa em
mãos, dá pra calcular a assinatura HMAC da ponte de sessão legada e
obter um token de sessão completo **como aquela pessoa**, sem nunca
saber a senha dela — é uma vulnerabilidade de sequestro de conta
completo, não só de exposição de dado.

## A correção

Centralizei a validação dentro da função `configPath` — usada pelos
três verbos (GET/PUT/DELETE), então uma correção só protege os três
de uma vez. Bloqueia qualquer `name` que tente alcançar o namespace
`users/` (ou contenha `..`, travessia de caminho em geral). Nomes
legítimos de configuração (conversas de chat, preferências pessoais)
continuam funcionando normalmente — confirmado por teste explícito.

## Como cheguei a este achado

Não foi por acaso — vim investigando a ponte de sessão legada
especificamente por ela usar `ph` como material de assinatura, o que
levantou a pergunta natural "onde mais esse campo pode aparecer numa
resposta da API?". A primeira busca achou o caminho já-admin-restrito
(SEC-07); reconsiderar se existiria outro jeito de chegar no mesmo
dado, por um caminho diferente, foi o que revelou o achado mais grave
(SEC-08) — que não tinha proteção nenhuma.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/controllers/usuarios-controller.js` | `getLegacyUsuarios` sanitizado; `configPath` bloqueia namespace sensível; `scrubUser`/`configPath` exportadas pra teste |
| `tests/usuarios-config-path-security.test.js` | novo — 8 testes |

## Verificação

```
node --check _worker_src/worker/controllers/usuarios-controller.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 188/188 testes (180 + 8 novos)
npx cap sync                     → android/ios sincronizados
```

## Balanço acumulado desta frente de segurança (todas as entregas)

**7 vulnerabilidades reais** encontradas e corrigidas no total, desde
o início desta auditoria: gestão de usuário/departamento sem
verificação de cargo, exclusão de arquivo sem verificação de posse,
exposição de dado legado de usuário, criação de documento sem
verificação, envio de push arbitrário, exposição de hash de senha
(admin-only), e — a mais grave de todas — leitura/escrita irrestrita
do registro de qualquer usuário via travessia de caminho no endpoint
genérico de configuração.

## Reversão

A validação em `configPath` pode ser removida isoladamente — mas dado
que reabriria uma vulnerabilidade de sequestro de conta confirmada,
recomendo fortemente NÃO reverter isso sem substituir por outra
proteção equivalente.
