# RELATORIO-AUDITORIA-CORRECAO-DOCUMENTOS-20261001

## Pedido

Continuar a auditoria de correção — última área da lista original:
`documentos`.

## Achado real, corrigido

`documentos-controller.js` tem 4 funções: `listDocumentos`/
`createDocumento` (genérico) e `getAdmDocumentos`/`putAdmDocumentos`
("Documentos ADM", já verificados corretos numa auditoria anterior).

`createDocumento` (POST) não tinha **nenhuma** verificação de cargo —
e o esquema/repositório desse recurso genérico nem sequer tem um
campo de dono (`owner_id`), diferente de leads/clientes, que sempre
forçam isso. Qualquer usuário autenticado conseguia criar um registro
de documento.

Confirmei, como nas correções anteriores, que **este endpoint não é
usado pelo cliente hoje** (nenhuma referência em lugar nenhum do
frontend) — reduz a urgência prática, mas não elimina o risco de
alguém explorar isso chamando a API diretamente.

**Correção**: restrito a `caps.adminUI`, só pro método `POST` — a
listagem (`GET`) continua livre, e **`/documentos/adm` (rota
diferente, com sua própria checagem já correta) não é afetado**,
confirmado por teste explícito de regressão.

## Erro cometido e corrigido — pela terceira vez, no mesmo arquivo

Ao inserir o novo bloco de teste, removi acidentalmente a linha de
abertura de um `describe` vizinho — a mesma classe de erro que já
tinha cometido duas vezes antes, sempre no mesmo arquivo de teste
(`authz-usuarios-departamentos-gate.test.js`). Desta vez, verifiquei a
estrutura do arquivo **proativamente**, antes de rodar qualquer
teste — confirmando o padrão de aprendizado dentro da própria sessão,
mesmo repetindo o erro de edição em si.

## Balanço final da auditoria de correção (3 entregas, lista original completa)

Áreas cobertas: `team-scope.js`, `clientes-controller.js`,
`leads-controller.js`, `financeiro-controller.js`, chat/grupos,
`documentos-controller.js`. Resultado agregado:

- **1 vulnerabilidade real adicional** encontrada e corrigida nesta
  entrega (criação de documento sem verificação nenhuma) — soma **4**
  no total desta frente de segurança inteira (usuários/departamentos,
  exclusão de upload, dado legado de usuário, criação de documento).
- **1 risco de manutenção** fechado com teste de paridade
  (`CARGOS_NIVEL_ADMIN`).
- **1 achado de design** documentado pra decisão de produto
  (comparação de cargo por substring), não corrigido às cegas.
- **1 lacuna de teste real** preenchida (`resolveDepartmentMemberIds`).
- Núcleos de dado mais usados do sistema (leads, clientes) confirmados
  corretos, sem bug encontrado.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/middlewares/authz.js` | regra nova (`POST /documentos`) |
| `tests/authz-usuarios-departamentos-gate.test.js` | +4 testes |

## Verificação

```
node --check _worker_src/worker/middlewares/authz.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 176/176 testes (172 + 4 novos)
npx cap sync                     → android/ios sincronizados
```

## Reversão

A regra nova pode ser removida isoladamente — mas dado que reabriria
a exposição confirmada, não recomendo reverter sem substituir por
outra proteção equivalente.
