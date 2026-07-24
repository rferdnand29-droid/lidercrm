# Suíte k6 — Cenário 3: Conflitos de Agenda

Suíte de carga integrada ao repositório do **LiderCRM**. Cobre os 3 níveis
de carga (5/20/100 VUs) via `--env LEVEL=N1|N2|N3`, disputa de slots quentes,
idempotência, verificação de double-booking e todas as métricas customizadas
do plano E2E.

## Estrutura

    tests/agenda-test/
    ├── agenda.test.js          # script principal k6
    ├── config/
    │   └── levels.js           # perfis N1/N2/N3
    ├── lib/
    │   ├── env.js              # BASE_URL / RESOURCE_ID / LEVEL / ADMIN_TOKEN (fonte única)
    │   ├── auth.js             # helper de login/JWT
    │   ├── slots.js            # geração de slots quentes
    │   └── metrics.js          # métricas customizadas + readCounter defensivo
    ├── data/
    │   └── users.json          # pool de usuários de teste (150 entradas)
    ├── scripts/
    │   └── seed-agenda.mjs     # seed determinístico via wrangler d1
    └── README.md

## Execução

    # N1 — Sanidade
    k6 run -e LEVEL=N1 -e BASE_URL=https://staging.crm.example.com \
      -e ADMIN_TOKEN=eyJhbGciOi... tests/agenda-test/agenda.test.js

    # N2 — Carga nominal
    k6 run -e LEVEL=N2 -e BASE_URL=... -e ADMIN_TOKEN=... tests/agenda-test/agenda.test.js

    # N3 — Stress
    k6 run -e LEVEL=N3 -e BASE_URL=... -e ADMIN_TOKEN=... tests/agenda-test/agenda.test.js

    # Com exportação para InfluxDB/Grafana
    k6 run -e LEVEL=N2 --out influxdb=http://influx:8086/k6 tests/agenda-test/agenda.test.js

Scripts npm equivalentes (rodam da raiz do repo):

    npm run seed:agenda          # DRY_RUN por default
    npm run seed:agenda:apply    # RESET=1 + aplica via wrangler
    npm run test:agenda:n1
    npm run test:agenda:n2
    npm run test:agenda:n3

## Correções aplicadas nesta versão (patch integrado ao repo)

1. **BASE_URL centralizado** em `lib/env.js` — antes duplicado entre
   `auth.js` e `agenda.test.js`.
2. **`handleSummary` blindado** — usa `readCounter()` de `lib/metrics.js`,
   que sobrevive a versões do k6 em que `values.count` ainda não existe.
3. **`checkGhostWrites` blindado** — usa `safeJson` no lugar de `res.json()`
   direto, evitando `TypeError` quando `/admin/agenda/audit` responde HTML
   durante deploys parciais.
4. **Idempotência aceita 200 e 201** desde que o `appointment_id` seja o
   mesmo (antes tratava 200-mesmo-id como falha).
5. **`users.json` expandido para 150 entradas** — suficiente para N3
   (100 VUs) sem colisão de credenciais.
6. **`seed-agenda.mjs`: coluna `password_plain` removida** — não persistimos
   senha em texto na tabela `users`. Autenticação usa exclusivamente
   `password_hash = sha256(SEED:username:password)`.

## Pontos de atenção

1. Endpoints admin (`/admin/agenda`, `/admin/agenda/audit`) precisam existir
   no staging. Caso o CRM ainda não exponha auditoria, alternativa é
   consultar D1 direto via um Worker de teste.

2. `Idempotency-Key`: o backend precisa suportar o header. Hoje o teste
   cobre apenas retry-depois-de-sucesso (idempotência em winners). Retry
   sobre conflito (409 → re-POST com a mesma key) deve ser exercitado em
   um cenário separado.

3. Reset entre runs: rodar `npm run seed:agenda:apply` antes de cada
   execução de nível para zerar a tabela `appointments` do recurso
   disputado.

4. Rate limit: se o CRM tem WAF/Cloudflare, liberar o IP do runner k6.

5. Pool de usuários: N3 pede ≥ 100 entradas em `data/users.json`. Já
   entregue com 150 — bate 1:1 com o `USERS_COUNT` default do
   `seed-agenda.mjs`.

6. **Autenticação em staging**: o backend precisa comparar
   `sha256("agenda-test-2026:" + username + ":" + password)` contra a
   coluna `password_hash` para os usuários semeados. Caso o CRM ainda use
   bcrypt/argon2 nativo, um shim de login por SEED pode ser adicionado
   apenas em staging.
