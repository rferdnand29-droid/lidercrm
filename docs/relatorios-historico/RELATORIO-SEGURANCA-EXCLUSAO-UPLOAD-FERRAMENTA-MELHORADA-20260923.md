# RELATORIO-SEGURANCA-EXCLUSAO-UPLOAD-FERRAMENTA-MELHORADA-20260923

## Pedido

Continuar as separações de arquitetura pelas menos difíceis.

## Contexto

Continuação direta da auditoria de autorização da entrega anterior —
revisando, um por um com cuidado, os 40 candidatos restantes que a
ferramenta havia sinalizado.

## Achados que confirmaram estar seguros (sem mudança necessária)

- **`GET /documentos/adm`**: decisão documentada de auditoria
  anterior (2026-08-01) — repositório visível a todos de propósito,
  só a escrita (`PUT`) é restrita a gerência. Confirmei que o `PUT`
  realmente tem essa checagem.
- **`atividades/list` e `ligacoes/list`**: já protegidos, só que via
  uma função auxiliar (`canAccessUid`, em `utils/team-scope.js`) que
  minha ferramenta original não conseguia enxergar dentro da própria
  função do controller — falso positivo confirmado.

**Melhorei a ferramenta de auditoria** pra reconhecer os dois padrões
acima automaticamente: cruzar com a matriz de rotas global (pra não
sinalizar de novo o que já corrigi antes) e reconhecer o padrão
`canAccessUid(...)` como verificação válida. Isso reduziu o número de
candidatos restantes de 40 pra 25 — sem mudar nada além da precisão
da própria ferramenta de análise.

## Achado real, corrigido: exclusão de arquivo sem verificar posse

`DELETE /api/v1/upload` e `DELETE /api/v1/upload/binary` recebem um
"path"/"fileId" direto da requisição e apagam o arquivo — sem
verificar se quem está pedindo tem posse sobre ESSE arquivo
específico. Qualquer usuário autenticado que soubesse (ou
adivinhasse) o caminho de um arquivo de OUTRA pessoa conseguiria
apagá-lo.

Confirmei que **nenhum dos dois métodos de exclusão é chamado pelo
cliente hoje** (`src/shared/http/worker-client.js` só expõe o
`upload` em si, nunca a exclusão) — reduz a urgência prática, mas não
elimina o risco de alguém explorar isso chamando a API diretamente.

**Correção**: restrito a `adminUI`, só pro método `DELETE` — o
`upload` (POST) continua livre pra qualquer usuário autenticado
enviar seus próprios anexos, sem nenhuma mudança.

## Erro cometido e corrigido durante a escrita dos testes

Uma edição de texto acabou removendo acidentalmente a linha de
abertura do bloco de teste de `departamentos` (da entrega anterior)
ao inserir os testes novos de upload. **Rodar os testes pegou isso na
hora** — antes de eu seguir adiante, os 15 testes já confirmavam a
estrutura correta depois do ajuste. Mais um lembrete concreto do
valor da suíte automatizada que vem sendo construída ao longo desta
sessão.

## O que ainda fica pra revisão futura (25 candidatos restantes)

Rotas públicas confirmadas (login/sessão/branding), `roles` (decisão
documentada anterior), `settings`/`branding` (provavelmente
baixa sensibilidade), `agenda-slots`/`notificacoes/rules`/`feed`/
`presence` (não investigados nesta rodada — candidatos pra uma
próxima revisão, não urgentes o suficiente pra justificar mudança sem
entender o contexto de produto primeiro).

## Arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/audit-authz-coverage.mjs` | reconhece `canAccessUid` e a matriz global — menos falso positivo |
| `_worker_src/worker/middlewares/authz.js` | regra nova pra exclusão de upload |
| `tests/authz-usuarios-departamentos-gate.test.js` | +4 testes (upload) |

## Verificação

```
node scripts/audit-authz-coverage.mjs → 25 candidatos restantes (era 42)
node --check _worker_src/worker/middlewares/authz.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 117/117 testes (113 + 4 novos)
npx cap sync                     → android/ios sincronizados
```

## Como validar manualmente

1. Logar como usuário comum, tentar `DELETE /api/v1/upload?path=...`
   direto (não pela interface) — deve retornar 403.
2. Confirmar que enviar um anexo normalmente continua funcionando
   pra qualquer usuário.

## Reversão

A regra nova em `authz.js` pode ser removida isoladamente — mas dado
que reabriria a vulnerabilidade confirmada, não recomendo reverter
sem substituir por outra proteção equivalente.
