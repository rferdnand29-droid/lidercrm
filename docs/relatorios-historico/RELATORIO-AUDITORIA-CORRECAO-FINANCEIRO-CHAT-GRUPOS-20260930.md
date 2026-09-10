# RELATORIO-AUDITORIA-CORRECAO-FINANCEIRO-CHAT-GRUPOS-20260930

## Pedido

Continuar a auditoria de correção — próximas áreas: financeiro,
chat/grupos.

## Financeiro

Só uma rota (`GET /api/v1/financeiro`), já corretamente restrita a
`caps.adminUI`, sem nenhum endpoint de escrita. Nada a investigar
além disso — área simples e já bem protegida.

## Chat/grupos — achado interessante, tratado com a mesma disciplina de sempre

A lógica de permissão pra criar/editar/excluir conversas em GRUPO do
chat vive dentro do endpoint genérico de configuração
(`/usuarios/config`), com uma defesa em profundidade bem pensada:
reconhece grupo tanto pelo nome do documento (`chat_conv_grp_*`)
quanto pelo conteúdo do corpo da requisição (`isGroup:true` ou mais de
2 participantes) — cobre a tentativa de burlar usando um nome de
conversa forjado.

**Risco de manutenção real, encontrado e fechado**: o comentário da
lista de cargos "nível admin" avisava explicitamente que ela precisa
espelhar uma lista idêntica no cliente (`js/auth.js`), sem nenhum
teste automático garantindo isso — só revisão manual. Escrevi um
teste de paridade (seguindo o mesmo padrão já usado para outra lista
parecida, `CARGO_CAPS`) que trava essa sincronia automaticamente daqui
pra frente. Confirmei que as duas listas **já batem hoje**
(`gerente`, `gestor`, `representante`, `master`).

**Achado documentado, não corrigido às cegas**: essa lista de cargos é
comparada por SUBSTRING (`cargo.indexOf(k) >= 0`), não por igualdade
exata — um cargo hipotético como "Assistente de Gerente" bateria
incorretamente e ganharia privilégio de administrador nessa checagem
específica. Investiguei se isso era uma divergência introduzida só no
servidor — **não é**: o cliente usa exatamente a mesma comparação por
substring, há muito tempo, na função que decide quem vê o painel de
administrador. Ou seja, é um comportamento de produto já existente e
consistente nos dois lados, não uma falha nova. Não mudei isso —
alterar unilateralmente poderia revogar acesso de alguém que hoje
depende desse comportamento, sem confirmação de que a mudança é
desejada. Documentado aqui para quem decide o produto avaliar se
merece virar comparação exata.

## Erro cometido e corrigido durante a escrita do teste

Nenhum desta vez — os 2 testes novos passaram de primeira, sem
retrabalho.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/controllers/usuarios-controller.js` | `CARGOS_NIVEL_ADMIN` exportada (aditivo, sem mudar comportamento) |
| `tests/cargos-nivel-admin-parity.test.js` | novo — 2 testes |

## Verificação

```
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 172/172 testes (170 + 2 novos)
npx cap sync                     → android/ios sincronizados
```

## Balanço da auditoria de correção até agora (2 entregas)

Áreas cobertas: `team-scope.js`, `clientes-controller.js`,
`leads-controller.js`, `financeiro-controller.js`, chat/grupos. Um
risco de manutenção real fechado (paridade de lista sem teste); um
achado de design documentado pra decisão de produto (substring vs.
igualdade exata); nenhuma vulnerabilidade nova confirmada.

## Área sugerida pra continuar

`documentos-controller.js` — última da lista original de 3 (chat/
grupos, financeiro, documentos) ainda não coberta por auditoria de
correção.

## Reversão

Nenhuma mudança de comportamento nesta entrega — só export aditivo e
teste novo.
