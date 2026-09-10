# RELATORIO-SEGURANCA-AUDITORIA-ITEM4-CONCLUIDO-20260925

## Pedido

Começar pelos itens mais fáceis do roteiro pra 10/10 — item 1
(scaffold React) e item 4 (finalizar auditoria de autorização).

## Item 1 — scaffold React

Mensagem pronta pra enviar ao suporte da Lovable (entregue no chat,
não neste zip) — pergunta direta sobre quais pastas são seguras de
remover. Depende de resposta externa; nada mais a fazer da minha
parte até a resposta chegar.

## Item 4 — as 10 rotas restantes, investigadas uma por uma

### Achado real, corrigido: `GET /usuarios/legacy`

Lê um documento inteiro (`config/users`) sem filtro nenhum — herança
de um sistema anterior (nada no Worker atual grava nesse caminho).
Não é usado pelo cliente hoje. Restrito a admin como padrão
conservador, mesmo raciocínio já aplicado à exclusão de upload.

### Confirmados seguros (decisões documentadas ou design intencional)

- `GET /notificacoes/rules` — decisão documentada de auditoria
  anterior: regras visíveis a todos, só edição exige gerência.
- `GET /feed` — comentário explícito no próprio controller: registro
  compartilhado por toda a equipe, sem dono (mesmo design de
  `agenda-slots`, já confirmado antes).
- `GET /branding` — baixo sigilo por natureza (logo/cores da empresa),
  buscado inclusive antes do login.

### Deixados sem restrição — sem evidência suficiente pra mexer

- `GET/PUT/DELETE /usuarios/config` — já confirmado antes:
  autoatendimento genérico, cada usuário salva a própria preferência.
- `GET /documentos` (listagem genérica) — não usado por lugar nenhum
  do frontend hoje; parece uma funcionalidade nunca integrada à
  interface. Só leitura, sem evidência de conter dado sensível.
- `GET /settings`, `GET /settings/list` — também não usados pelo
  frontend hoje; genéricos demais pra restringir sem entender o
  propósito pretendido primeiro.

**Diferença importante em relação às correções anteriores**: essas 3
últimas ficaram sem restrição de propósito — diferente de
`usuarios/legacy` (que também não tem uso confirmado, mas tem nome e
formato sugerindo dado de usuário potencialmente sensível), estas não
têm evidência clara de sensibilidade que justifique a mudança. Prefiro
deixar como estão a restringir sem necessidade.

## Dois erros cometidos e corrigidos durante a escrita dos testes

Pela segunda vez nesta frente de trabalho, uma edição de texto removeu
acidentalmente a linha de abertura de um bloco de teste ao inserir
conteúdo novo perto dele — desta vez, dois blocos diferentes na mesma
sessão (`EXPECTED_PUBLIC` no script de auditoria, e o describe de
"usuarios" no arquivo de teste). **As duas vezes, verificar a
estrutura do arquivo antes de rodar os testes pegou o erro na hora**,
antes de eu seguir adiante — inclusive, na segunda vez, fiz essa
verificação proativamente, aprendendo do primeiro erro dentro da
mesma sessão.

## Resultado final da auditoria (3 rodadas, agora encerrada)

De 90 rotas totais no backend: **90 → 84 com verificação confirmada,
6 restantes conscientemente deixadas sem mudança** por falta de
evidência de sensibilidade real. Progressão ao longo das 3 entregas:
42 candidatos suspeitos → 25 → 10 → **6 finais**.

**3 vulnerabilidades reais encontradas e corrigidas** no total desta
frente: gestão de usuário/departamento sem verificação de cargo,
exclusão de arquivo sem verificação de posse, e leitura de dado
legado de usuário sem restrição.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/middlewares/authz.js` | regra nova (`usuarios/legacy`) |
| `scripts/audit-authz-coverage.mjs` | 3 funções confirmadas seguras documentadas |
| `tests/authz-usuarios-departamentos-gate.test.js` | +3 testes |

## Verificação

```
node scripts/audit-authz-coverage.mjs → 6 candidatos restantes (era 42 na primeira rodada)
node --check _worker_src/worker/middlewares/authz.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 120/120 testes (117 + 3 novos)
npx cap sync                     → android/ios sincronizados
```

## Reversão

A regra nova em `authz.js` pode ser removida isoladamente — mas dado
que reabriria a exposição confirmada, não recomendo reverter sem
substituir por outra proteção equivalente.
