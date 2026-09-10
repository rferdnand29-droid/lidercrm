# RELATORIO-AUDITORIA-CORRECAO-AUTORIZACAO-20260929

## Pedido

Continuar rumo à nota 8 — item recomendado: auditar não só se as
verificações de permissão EXISTEM (já feito nas entregas anteriores),
mas se a LÓGICA delas está CORRETA. Essa lacuna foi explicitamente
apontada na minha própria avaliação de arquitetura como algo "nunca
auditado linha por linha".

## Áreas investigadas

### `team-scope.js` (lógica central, compartilhada por 4 controllers)

Tracei manualmente `canAccessUid`, `resolveTeamMemberIds` e
`resolveDepartmentMemberIds` — todas com comportamento fail-closed
correto (qualquer erro ou dado ausente nega acesso, nunca libera por
omissão). `canAccessUid` já tinha cobertura de teste completa de uma
auditoria anterior; `resolveDepartmentMemberIds` (a lógica mais
complexa — time → departamento → todas as equipes do departamento →
todos os usuários) não tinha teste dedicado. Escrevi 5 testes novos
cobrindo isso, incluindo o caminho mais importante (usuário de uma
equipe vendo corretamente colega de OUTRA equipe do MESMO
departamento).

### `clientes-controller.js` e `leads-controller.js`

Os dois núcleos de dado mais usados do sistema. Confirmei um padrão
consistente e bem pensado nos dois: consulta ao banco já filtrada por
`owner_id` na própria query (não "busca tudo e filtra depois" — mais
robusto), `owner_id` forçado na criação (impede criar registro em
nome de outra pessoa), erro "não encontrado" em vez de "acesso
negado" ao tentar editar/excluir algo de outro dono (evita vazar se o
registro existe ou não). Nenhum bug encontrado.

## Achado ambíguo, investigado e documentado (não corrigido às cegas)

`dashboard-controller.js`: usuários comuns (nem admin, nem
supervisor) recebem os números da EMPRESA INTEIRA (total de clientes,
leads, receita, pipeline) — não só os próprios. Uma auditoria anterior
já tinha identificado isso e deliberadamente deixado sem mexer,
documentando "intenção não confirmada".

Investiguei o que exatamente é exposto: **são só números agregados
totais** (contagens e somas) — nenhum nome, nenhum detalhamento por
pessoa, nenhum registro individual. Isso é um padrão comum e muitas
vezes intencional em CRMs de vendas (transparência de desempenho da
empresa toda, motivacional). Dado que não achei evidência de dano real
(não é PII, não é por pessoa), mantive a mesma decisão da auditoria
anterior: documentado como "revisado, provavelmente intencional, mas
seria bom confirmar com quem decide o produto" — não mudei o
comportamento sem essa confirmação.

## Dois erros cometidos e corrigidos durante a escrita dos testes

Ao escrever o mock pra simular as respostas do banco:
1. Uma condição de regex genérica demais capturava acidentalmente
   duas URLs diferentes (`id=eq.` casava sem querer também com
   `departamento_id=eq.`, já que a segunda contém a primeira como
   substring) — corrigido reordenando pra checar o padrão mais
   específico primeiro.
2. Parênteses na URL vêm codificados (`%28`/`%29`), não literais — a
   regex esperava o caractere literal e nunca casava. Corrigido
   decodificando a URL inteira antes de aplicar a regex.

**Os dois eram bugs só no meu teste, não no código de produção** —
depurei com logs detalhados, passo a passo, antes de concluir isso,
em vez de presumir.

## Resultado

Nenhum bug NOVO de autorização encontrado nesta rodada — o que é, em
si, um resultado valioso: confirma que a base de ownership/escopo já
construída em auditorias anteriores está sólida nas áreas de maior
tráfego do sistema. Uma lacuna de teste real foi preenchida
(`resolveDepartmentMemberIds`).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `tests/team-scope.test.js` | +5 testes cobrindo `resolveDepartmentMemberIds` |

## Verificação

```
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 170/170 testes (165 + 5 novos)
npx cap sync                     → android/ios sincronizados
```

Nenhum arquivo servido ao usuário foi alterado — só teste.

## Nota pra próxima rodada, se quiser continuar essa frente

Áreas ainda não auditadas por correção (só por existência): módulos
de chat/grupos, financeiro, documentos. Dado o padrão encontrado até
agora (leads/clientes/team-scope sólidos), a expectativa é de
resultado semelhante — mas "esperar que esteja bom" não é a mesma
coisa que confirmar.

## Reversão

Nenhuma mudança de comportamento nesta entrega — só teste novo,
reversível sem efeito em nada mais.
