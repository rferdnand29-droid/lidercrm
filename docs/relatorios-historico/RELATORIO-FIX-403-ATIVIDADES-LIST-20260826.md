# RELATORIO-FIX-403-ATIVIDADES-LIST-20260826

## Sintoma
Console do app em loop com:

```
api/v1/atividades/list?uid=u1787326407778_8z9   403
api/v1/atividades/list?uid=adm_root_2026        403
```

Os uids ALTERNAM — a mesma sessão pedia ora a lista de um consultor,
ora a lista do ADM, e o Worker recusava todas com 403.

## Causa raiz (2 frentes)

1. **Painel do sino sem guarda de cargo** — `toggleActPanel()`
   (js/agenda.js) chama `loadAllActivitiesAdmin()`, que itera TODOS os
   consultores ativos e faz `GET /atividades/list?uid=<colega>` para
   cada um. O Painel ADM (js/relatorios.js) tem guarda `hasAdminAccess()`;
   o painel do sino não tinha. Consultor comum logado → um 403 por colega.
   A regra do servidor (correta, não foi alterada): `canAccessUid()` em
   `_worker_src/worker/utils/team-scope.js` só permite cross-uid para
   adminUI ou supervisor do mesmo time.

2. **Sessão dessincronizada (multiaba/troca de usuário)** — a aba fica
   com `S.userId = X`, mas o token JWT em `localStorage`
   (`lidercrm_worker_jwt_v1`) é de outro usuário (ex.: o ADM logou em
   outra aba). Todas as requisições saem autenticadas como Y pedindo
   dados de X → 403 em loop. Daí a alternância de uids no console.

O patch antigo `lf-fix-console-errors-v1-20260818.js` envolvia apenas
`LF.fetchAndCacheActivities`; todos os outros caminhos
(`wc.atividadesList` direto em agenda.js, activities-store, hotfix de
notificação, fila de retry) continuavam disparando o 403.

## Correção aplicada (cliente apenas; Worker intacto)

### 1. `src/shared/http/worker-client.js` (+ cópia em `www/`)
Guarda central nos métodos `atividadesList` / `saveAtividadesList`:

- `uid` da sessão (via `httpClient.session.get().user.id`, com fallback
  `S.userId`) === uid pedido → request normal (nada muda).
- `hasAdminAccess()` ou claims de admin no JWT (`role==='adm'`,
  `admExtra`, cargo gerente/gestor/master/representante) → request
  normal (Painel ADM continua funcionando).
- Caso contrário (uid alheio sem permissão — 403 garantido no
  servidor): **o request nem sai do cliente**. GET resolve `null`
  (callers caem no cache local, que já era o fallback existente);
  PUT resolve um eco local `{ list, ts, skipped:'cross_user_denied' }`
  — nenhum dado é perdido, pois o servidor recusaria a gravação de
  qualquer forma.
- Exporta `LiderCRM.api.canReadForeignActivities()` para a UI decidir
  se pode iterar todos os consultores.

### 2. `js/agenda.js` (+ cópia em `www/`)
`loadAllActivitiesAdmin()` agora filtra a lista de usuários: sem
permissão de visão global, só carrega a lista do próprio usuário
(e o cache local dos demais, sem rede). ADM/supervisor mantêm o
comportamento anterior.

### 3. Cache-busting
`index.html`, `app.html`, `www/index.html`, `www/app.html`:
`?v=20260826fix403atv1` em `js/agenda.js` e
`src/shared/http/worker-client.js` — força o navegador/app a baixar
as versões corrigidas.

## Testes
Suíte em Node (contextos VM isolados) cobrindo 8 cenários — todos OK:

| # | Cenário | Resultado |
|---|---------|-----------|
| C1 | uid próprio, consultor | rede chamada, doc retornado |
| C2 | uid alheio, consultor | sem request, `null` (fallback cache) |
| C3 | admin lendo uid alheio | rede chamada normalmente |
| C4 | PUT alheio, consultor | skip silencioso, payload preservado |
| C5 | PUT próprio | rede chamada normalmente |
| C6 | sessão dessincronizada (S=A, token=B) | 403 evitado |
| C7 | `hasAdminAccess()=true` | rede chamada p/ qualquer uid |
| C8 | sem sessão | não estoura, sem request |

## O que NÃO mudou
- Worker (`_worker_src/`): regra `canAccessUid` preservada — segurança
  no servidor continua igual; a correção só impede o cliente de pedir
  o que seria recusado.
- Painel ADM, atribuição de lembrete para colega pelo supervisor,
  gravação da própria lista: fluxos legítimos inalterados.
