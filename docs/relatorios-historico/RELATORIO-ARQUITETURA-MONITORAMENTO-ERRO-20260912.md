# RELATORIO-ARQUITETURA-MONITORAMENTO-ERRO-20260912

## Pedido

Continuar as melhorias de arquitetura — item 8 do plano original
(monitoramento de erro), reconsiderando a necessidade de um serviço
externo.

## Achado — a infraestrutura já existia, só incompleta

`js/app.js` já tinha uma "error boundary global" (`CERT-12`),
capturando corretamente `window.onerror` e `unhandledrejection`. Mas
suas únicas ações eram: `console.error` (só visível com o DevTools
aberto, nunca o caso em produção) e um `toast` que some em 4 segundos.
Nenhuma das duas persiste em lugar nenhum — exatamente o motivo de
você só descobrir problemas via print de tela de quem estava usando
na hora.

## Estratégia — sem precisar de conta em serviço nenhum agora

Ao invés de integrar um serviço de terceiros (que exigiria você criar
conta e me passar uma chave), completei a funcionalidade usando a
própria infraestrutura que o projeto já tem — o mesmo Worker/banco
que já guarda leads, negócios, atividades.

1. **Backend novo** (`client-errors-controller.js`), seguindo
   exatamente os padrões já estabelecidos: mesmo modelo de
   armazenamento do `feed-controller.js` (cada erro é um registro
   independente, sem corrida entre erros simultâneos de pessoas
   diferentes), mesmo modelo de permissão do `financeiro-controller.js`
   (`POST` aberto pra qualquer usuário reportar o próprio erro, `GET`
   restrito a administrador).
2. **Error boundary estendida** — além do toast/console que já
   existiam, agora também envia o erro pro servidor. Com duas
   proteções: nunca deixa uma falha ao ENVIAR o erro virar outro erro
   capturado (evitaria loop infinito), e não manda a mesma mensagem
   mais de uma vez por minuto (evita inundar o servidor se algo
   entrar em loop de erro).
3. **Tela de administração** — botão "🐞 Ver erros recentes" na
   seção de Manutenção (Configurações), já admin-only. Mostra
   mensagem, quem, plataforma (web/app), data, versão do build, URL
   onde aconteceu, e o stack trace completo (expansível, sem poluir
   a lista).

## Fluxos cobertos

- Qualquer erro no navegador ou no app de qualquer usuário: agora
  fica registrado, visível sem precisar de print de tela.
- Ver a lista de erros: só administrador.
- Se o próprio envio do erro falhar (sem internet, por exemplo): não
  gera erro novo, simplesmente não registra — sem quebrar nada.

## Caminho pra evoluir isso depois (se quiser)

Se no futuro você quiser um serviço dedicado de monitoramento
(alertas por e-mail/Slack quando algo quebra, por exemplo), o que foi
construído aqui já cobre a parte difícil (capturar e ter uma tela pra
ver) — trocar por um serviço externo seria só redirecionar o envio,
não uma reconstrução do zero.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `_worker_src/worker/controllers/client-errors-controller.js` | novo |
| `_worker_src/worker/routes/router.js` | 2 rotas novas registradas |
| `js/app.js` | error boundary envia erro pro servidor |
| `js/utils.js` | `openClientErrorsPanel()` novo |
| `index.html`, `app.html`, `www/*` | botão + modal de erros recentes |

## Verificação

```
node --check (todos os arquivos .js tocados) → OK
Import direto do controller/router novo      → resolve sem erro
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 59/59 testes
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

Testado visualmente (renderização com o CSS real) — painel de erros
aparecendo corretamente.

## Como validar manualmente

1. Fazer o deploy (backend novo precisa ir junto — está em
   `_worker_src`, publica no mesmo `git push` de sempre).
2. Provocar um erro de propósito (ex.: digitar algo inválido no
   console do navegador) — deve aparecer em Configurações > 🐞 Ver
   erros recentes (logado como admin).

## Reversão

Reversível arquivo por arquivo. O backend novo é aditivo (rotas
novas, não mexe em nenhuma existente) — remover não afeta nada mais.
