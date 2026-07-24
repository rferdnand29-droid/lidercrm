# Relatório de Patch — Integração `agenda-test` no CRM

**Data:** 24/07/2026
**Origem do patch:** `agenda-test.zip` (14 KB)
**Destino:** `tests/agenda-test/` dentro de `CRM_MERGE_LIMPO_FINAL_bloco2_sync_tabs_corrigido_20260724`
**Autor:** Bot de integração (patch aplicado + correções pontuais)

---

## 1. Escopo

Integrar a suíte de carga k6 do Cenário 3 (Conflitos de Agenda) ao repositório
principal do CRM. O patch chega como pacote autônomo (`agenda-test/`) e é
promovido a subpasta oficial `tests/agenda-test/`, com scripts npm equivalentes.

## 2. Arquivos adicionados

    tests/agenda-test/
    ├── agenda.test.js            (10.1 KB — corrigido: 4 bugs)
    ├── README.md                 (3.8 KB — reescrito para caminho novo)
    ├── config/levels.js          (idêntico ao patch)
    ├── lib/
    │   ├── env.js                (NOVO — centraliza BASE_URL/RESOURCE_ID/ADMIN_TOKEN)
    │   ├── auth.js               (corrigido: importa BASE_URL de env.js)
    │   ├── slots.js              (idêntico ao patch)
    │   └── metrics.js            (corrigido: adiciona readCounter defensivo)
    ├── data/users.json           (expandido: 15 → 150 entradas)
    └── scripts/seed-agenda.mjs   (corrigido: removida coluna password_plain)

## 3. Arquivos modificados

- `package.json` — versão 1.0.0 → **1.0.1**, adicionados 6 scripts npm:
  `seed:agenda`, `seed:agenda:check`, `seed:agenda:apply`,
  `test:agenda:n1`, `test:agenda:n2`, `test:agenda:n3`.
- `.gitignore` (novo) — cobre `build/`, `report-agenda-*.json`,
  `.wrangler/`, `.dev.vars`, `node_modules/`.

## 4. Bugs corrigidos durante a integração

| # | Arquivo | Problema | Correção |
|---|---------|----------|----------|
| 1 | `agenda.test.js` + `lib/auth.js` | `BASE_URL` duplicado (fonte dupla, divergia em refactor) | Extraído para `lib/env.js` e re-importado |
| 2 | `agenda.test.js` (`handleSummary`) | Acesso `data.metrics.X.values.count` quebra se Counter nunca incrementou | Guard central `readCounter()` em `lib/metrics.js` |
| 3 | `agenda.test.js` (`checkGhostWrites`) | `res.json()` explode quando `/admin/agenda/audit` responde HTML (deploy parcial) | Trocado por `safeJson` |
| 4 | `agenda.test.js` (`verifyIdempotency`) | 200-mesmo-id contava como falha, subestimando `idempotency_reuse_rate` | Aceita 200 **ou** 201 desde que `appointment_id` bata |
| 5 | `data/users.json` | Apenas 15 usuários — N3 precisa ≥ 100 | Expandido para 150 (bate com `USERS_COUNT` do seed) |
| 6 | `scripts/seed-agenda.mjs` | Persistia `password_plain` em texto na tabela `users` — vazamento cru mesmo em staging | Coluna e campo removidos; auth passa a usar exclusivamente `password_hash` (SHA-256) |

## 5. Ações requeridas pelo backend (não estão no patch)

Para o cenário rodar end-to-end no staging, o backend precisa:

1. **Suportar o header `Idempotency-Key`** no `POST /agenda`.
   - 1ª chamada com key nova → 201 com `appointment_id`.
   - 2ª chamada com mesma key + mesmo payload → 200 (ou 201) com o **mesmo** `appointment_id`.
2. **Expor endpoints admin** `/admin/agenda` e `/admin/agenda/audit` (leitura autenticada por `ADMIN_TOKEN`).
3. **Autenticar via SEED** para os usuários semeados — comparar
   `sha256("agenda-test-2026:" + username + ":" + password)` contra
   `users.password_hash`. Se o CRM usa bcrypt/argon2 nativo, um shim de
   login apenas-em-staging resolve.
4. **Constraint `UNIQUE(resource_id, start)` em `appointments`** — mecanismo
   real testado pelo cenário. Já está no schema semeado; garantir que a
   migration equivalente foi aplicada em staging.

## 6. Como validar localmente

    # 1. Validar geração do seed sem tocar D1
    npm run seed:agenda:check

    # 2. Gerar SQL num arquivo (DRY_RUN, não executa)
    npm run seed:agenda

    # 3. Rodar sanidade (exige k6 instalado + staging acessível)
    BASE_URL=https://staging.crm.example.com \
    ADMIN_TOKEN=eyJ... \
    npm run test:agenda:n1

## 7. Verificação de sintaxe

Todos os arquivos JavaScript novos/alterados foram checados com `node --check`.
Todos os módulos `.mjs` e `.js` passam sem erro (ver seção 8 do log de
integração).

---

## 🔴 Continuar a partir daqui

**Último arquivo processado:** `tests/agenda-test/scripts/seed-agenda.mjs`
**Bugs resolvidos nesta rodada:** 6 (todos listados na tabela §4).
**Próximo arquivo pendente:** nenhum — patch integralmente aplicado.
**Observações para continuação:**

- Se o backend não expor `/admin/agenda/audit`, o cenário ainda roda,
  mas `ghost_write_count` fica sempre em 0 (não é falso PASS — o teste
  só marca ghost write se o audit endpoint confirma). Alternativa
  documentada no README: Worker de teste que consulta D1 direto.
- Fica pendente um cenário-irmão para retry-sob-conflito (409 → re-POST
  com mesma key). Documentado no README e no comentário `[AUDIT]` do
  próprio `agenda.test.js`.
- Nenhum código do CRM em `js/agenda.js` foi tocado — a integração é
  puramente aditiva.
