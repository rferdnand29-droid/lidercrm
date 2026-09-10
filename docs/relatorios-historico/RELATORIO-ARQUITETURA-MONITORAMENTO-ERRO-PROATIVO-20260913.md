# RELATORIO-ARQUITETURA-MONITORAMENTO-ERRO-PROATIVO-20260913

## Pedido

Continuar as melhorias de arquitetura — item 6 do plano médio,
ampliar o monitoramento de erro construído antes pra avisar de
verdade, não só ficar disponível pra quem for procurar.

## Contexto

O painel "🐞 Ver erros recentes" (construído numa correção anterior)
funcionava, mas era **passivo** — só mostrava algo se o admin
lembrasse de abrir Configurações e clicar. Sem visibilidade
automática, o objetivo original do item 8 (saber que algo quebrou sem
depender de print de tela) ficava só parcialmente resolvido.

## Estratégia

Sem precisar de conta em serviço de alerta externo (e-mail/Slack) —
usei o que já existe:

1. Ao logar, se a pessoa é admin, o app espera 2 segundos (depois do
   primeiro paint, pra não competir com o carregamento inicial) e
   verifica os últimos 20 erros registrados no servidor.
2. Compara contra a data do último erro que essa pessoa **já viu**
   (guardada localmente, atualizada toda vez que ela abre o painel de
   erros).
3. Se tiver algo mais novo, mostra um toast avisando quantos erros
   novos existem, apontando pra onde ver.

Reaproveita 100% o endpoint já construído — nenhuma mudança no
backend foi necessária.

## Fluxos cobertos

- Admin loga, existem erros novos desde a última vez que abriu o
  painel: recebe um toast avisando a quantidade.
- Admin loga, sem erros novos (ou nunca teve erro nenhum): nada
  aparece, sem ruído.
- Admin abre o painel de erros: marca o mais recente como "visto" —
  não repete o mesmo aviso no próximo login.
- Usuário comum (não admin): nunca faz essa verificação, nenhum
  overhead extra pra ele.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `js/app.js` | verificação proativa no boot, admin-only |
| `js/utils.js` | `openClientErrorsPanel()` marca "visto" ao abrir |

## Verificação

```
node --check js/app.js js/utils.js → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 71/71 testes
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Como validar manualmente

1. Provocar um erro de propósito (mesmo teste da correção anterior).
2. Deslogar e logar de novo como admin — deve aparecer o toast de
   aviso nos primeiros segundos.
3. Abrir o painel de erros, deslogar e logar de novo — o toast não
   deve repetir (já foi marcado como visto).

## Reversão

Reversível arquivo por arquivo, sem migração de dado.
