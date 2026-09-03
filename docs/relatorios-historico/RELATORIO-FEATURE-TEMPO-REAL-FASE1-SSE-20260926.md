# RELATORIO-FEATURE-TEMPO-REAL-FASE1-SSE-20260926

## Pedido

Implementar tempo real seguindo a recomendação do plano técnico
(`PLANO-TECNICO-TEMPO-REAL-LIDERCRM.md`) — Rota A, sondagem interna no
servidor via Server-Sent Events, sem Durable Objects, sem duplicar
autorização em RLS.

## Resumo da implementação

**Backend (3 arquivos novos/mexidos, tudo aditivo):**
1. `waitUntil` repassado do ponto de entrada do Cloudflare Pages
   Functions até `ctx` — necessário pra manter a sondagem em segundo
   plano viva depois da resposta inicial. Parâmetro novo opcional,
   nenhuma chamada existente quebra.
2. `kanban-stream-controller.js` (novo) — abre uma conexão SSE,
   consulta só `path, updated_at` de `fs_documents` (não o dado
   inteiro — consulta barata) a cada 2 segundos, pros 2 boards do
   PRÓPRIO usuário conectado. Empurra um evento "changed" quando algo
   muda. Fecha sozinha depois de ~2 minutos — o navegador reconecta
   automaticamente.
3. Rota nova: `GET /api/v1/kanban/stream`.

**Achado técnico real, resolvido com cuidado:** `EventSource` (a API
do navegador usada por SSE) não consegue enviar o cabeçalho
`Authorization` usado pelo resto da API — limitação da própria API,
não deste projeto. Resolvido com um fallback de token via query
string, **restrito exclusivamente a esta rota** — todas as outras
continuam exigindo o header normalmente, sem exceção. Travado com 5
testes de segurança, incluindo tentativas explícitas de "vazar" esse
fallback pra outras rotas.

**Frontend (1 arquivo novo, 1 pequeno ajuste):**
1. `js/lf-realtime-kanban.js` (novo) — conecta via `EventSource`. Ao
   receber "changed", dispara IMEDIATAMENTE a MESMA função de
   sincronização que já existe (`_syncKBRemoteBG`) — sem duplicar
   nenhuma lógica de merge. Respeita a mesma checagem de "página
   visível" que a sondagem de 15s já usa.
2. `js/api.js` — `_lfNativeApiBase` (resolução de URL pra Capacitor
   vs. web) exposta globalmente, pra o módulo novo reaproveitar a
   mesma lógica em vez de duplicá-la.

**Erro real cometido e corrigido durante a implementação:** minha
primeira versão do `_apiBase()` do módulo novo usava `LiderCRM.
apiBase` diretamente — o que teria funcionado, mas sempre apontaria
pro domínio de produção, mesmo rodando de um ambiente de teste/
preview. Corrigi expondo e reaproveitando a função de verdade já
usada pelo resto do app, que resolve isso corretamente pros dois
casos (relativa na web, absoluta só no Capacitor).

## Por que isto é seguro — puramente aditivo

- A sondagem de 15s em `js/app.js` **não foi tocada em nenhuma
  linha** — continua funcionando exatamente como antes, como reserva.
- Se `EventSource` não existir no navegador, se a conexão falhar, ou
  se o servidor não conseguir consultar o Supabase — o app continua
  funcionando exatamente como hoje, sem regressão nenhuma.
- Nenhuma lógica de merge/reconciliação foi duplicada — o SSE só
  avisa "algo mudou", quem busca e reconcilia o dado é a mesma função
  já testada extensivamente em sessões anteriores.

## Limitação conhecida desta Fase 1 (documentada de propósito)

O servidor só observa os boards do PRÓPRIO usuário conectado — não
replica a lógica de "supervisor vê o time"/"admin vê todo mundo" que
já existe em `team-scope.js`. Quem depende de ver o board de OUTRA
pessoa em tempo real (ex.: admin auditando) continua exatamente como
hoje, com a sondagem de 15s. Não é regressão — é o escopo mais seguro
possível pra uma primeira fase, deixado assim de propósito.

## Nota de honestidade sobre os limites do que consegui validar aqui

Testei extensivamente tudo que é possível testar SEM um ambiente
Cloudflare real implantado: a lógica pura de detecção de mudança (6
testes), a segurança do fallback de autenticação (5 testes), e o
comportamento do conector do lado cliente (7 testes) — 18 testes
novos no total, todos passando.

**O que não dá pra confirmar sem deploy real**: se a conexão SSE de
fato funciona ponta a ponta no ambiente real do Cloudflare Pages
(streaming, `waitUntil`, timing de reconexão do navegador) — isso é
uma limitação inerente de testar este tipo de recurso sem um ambiente
implantado de verdade, não uma lacuna de cuidado da minha parte.
**Recomendo fortemente testar manualmente em produção (ou um ambiente
de preview) logo após o deploy**, antes de considerar esta fase
"confirmada" — abrir a tela de Leads em duas abas/dispositivos
diferentes e mover um card numa delas, conferindo se a outra atualiza
em segundos, não em até 15.

## Arquivos

| Arquivo | Mudança |
|---|---|
| `functions/[[path]].js` | repassa `waitUntil` |
| `_worker_src/worker/api-handler.js` | aceita e repassa `waitUntil` no `ctx` |
| `_worker_src/worker/controllers/kanban-stream-controller.js` | novo |
| `_worker_src/worker/routes/router.js` | rota nova registrada |
| `_worker_src/worker/middlewares/auth.js` | fallback de token via query, restrito à rota de streaming |
| `js/api.js` | `_lfNativeApiBase` exposta globalmente |
| `js/lf-realtime-kanban.js` | novo |
| `index.html`, `app.html` | novo script registrado |
| `tests/kanban-stream-controller.test.js` | novo — 6 testes |
| `tests/auth-sse-token-fallback.test.js` | novo — 5 testes |
| `tests/lf-realtime-kanban.test.js` | novo — 7 testes |

## Verificação

```
node --check (todos os arquivos .js tocados) → OK
npm run guard                    → 0 violações bloqueantes
npm run mirror:check             → www/ e raiz idênticos
npm run lint                     → 0 erros
npm test                         → 138/138 testes (120 + 18 novos)
npx cap sync                     → android/ios sincronizados, confirmado byte a byte
```

## Como validar manualmente após o deploy (essencial, não opcional)

1. Abrir a tela de Leads em dois dispositivos/abas diferentes,
   logados como o mesmo usuário.
2. Mover um card numa das telas.
3. A outra tela deve refletir a mudança em poucos segundos — não em
   até 15 segundos como antes.
4. Testar também com a conexão instável (modo avião ligar/desligar) —
   confirmar que a sondagem de 15s continua funcionando normalmente
   se o streaming cair.

## Reversão

Reversível arquivo por arquivo. A rota nova e o módulo do cliente
podem ser removidos isoladamente sem afetar nenhuma outra
funcionalidade — a sondagem de 15s nunca deixou de funcionar
plenamente sozinha.
