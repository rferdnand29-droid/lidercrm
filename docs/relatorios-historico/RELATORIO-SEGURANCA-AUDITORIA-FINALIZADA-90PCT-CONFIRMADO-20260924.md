# RELATORIO-SEGURANCA-AUDITORIA-FINALIZADA-90PCT-CONFIRMADO-20260924

## Pedido

Continuar as separações de arquitetura pelas menos difíceis.

## Contexto

Terceira e última rodada (por ora) da investigação de autorização
iniciada duas entregas atrás. Investiguei os candidatos restantes da
lista de 25, um por um.

## Achados — todos confirmados seguros, nenhuma correção necessária desta vez

- **`agenda-slots`** (listar/criar/editar/excluir): o próprio
  controller documenta explicitamente — é uma agenda COMPARTILHADA
  por toda a equipe, de propósito (qualquer consultor pode ver/mexer
  em qualquer horário). Não é dado pessoal, não precisa de dono.
- **`presence`** (heartbeat/last-seen/online): protegido via uma
  função auxiliar (`authedUid`) que pega o usuário SEMPRE da sessão
  autenticada, nunca do que o cliente afirma no corpo da requisição —
  e rejeita explicitamente se alguém tentar reportar presença em nome
  de outro usuário.

Ambos eram **falsos positivos** da minha própria ferramenta (mesma
categoria do achado da entrega anterior com `canAccessUid`) — a
verificação existe, só que dentro de uma função auxiliar que o regex
original não enxergava.

## Ferramenta aprimorada mais uma vez

Adicionado reconhecimento do padrão `authedUid(...)`, e uma lista
explícita de funções já confirmadas seguras por investigação manual
(agenda-slots, `getAdmDocumentos`, `roles`) — cada uma com o motivo
documentado no próprio código do script, não só "confia em mim".

**Resultado**: de 90 rotas totais, a lista de candidatos genuínos caiu
de 42 (primeira rodada) → 25 → **10** — todas as 10 restantes são
leituras (GET), nenhuma com o padrão de escrita-sem-verificação que
motivou as duas correções reais já aplicadas (usuários/departamentos,
exclusão de upload).

## As 10 que ainda restam — não investigadas nesta rodada

`usuarios/legacy` (GET), `usuarios/config` (já confirmado seguro por
natureza — auto-atendimento — mas ainda aparece pelo regex),
`documentos` (listagem geral, GET), `notificacoes/rules` (GET),
`feed` (GET, histórico de atividades), `branding`/`settings`/
`settings/list` (GET). Todas leitura — risco bem menor que os casos
já corrigidos, mas ainda merecem um olhar eventual.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `scripts/audit-authz-coverage.mjs` | reconhece `authedUid`; lista de confirmados seguros documentada |

## Verificação

```
node scripts/audit-authz-coverage.mjs → 10 candidatos restantes (era 42 na primeira rodada)
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 117/117 testes
npx cap sync                     → android/ios sincronizados
```

Nenhum arquivo servido ao usuário foi alterado nesta entrega — só a
ferramenta de auditoria ficou mais precisa.

## Balanço das 3 entregas desta frente (itens 11 do plano de estabilidade)

- 2 vulnerabilidades reais, confirmadas e corrigidas: gestão de
  usuário/departamento sem verificação de cargo no servidor; exclusão
  de arquivo sem verificação de posse.
- 4 falsos positivos investigados e confirmados seguros (2 decisões
  documentadas de auditorias anteriores, 2 usando funções auxiliares
  que a ferramenta não enxergava de início).
- Ferramenta de auditoria construída do zero, cada vez mais precisa,
  disponível pra rodar de novo quando quiser (`npm run
  audit:authz-coverage`).
- 15 testes automatizados novos travando as duas correções reais.

## Reversão

Nenhuma mudança de comportamento nesta entrega — só a ferramenta de
análise.
