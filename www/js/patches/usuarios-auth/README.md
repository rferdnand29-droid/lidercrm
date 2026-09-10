# Mapa dos patches de Usuários / Autenticação / Permissão

Reorganização de 2026-08-01 — só reposicionamento, ordem de
carregamento inalterada. 7 arquivos. **Área sensível** — ver
`docs/permissions.md` e `docs/supabase.md` antes de mexer em qualquer
coisa aqui, mesmo que pareça só reposicionar.

## Ponte de autenticação
- `lf-legacy-auth-bridge-v1-20260717.js` (Fase 3.2) — ponte entre o
  login LEGADO (`localStorage`/`config/users`) e o JWT do Worker. Roda
  100% client-side, sem mexer no `auth.js` legado. Fluxo: espera sessão
  legada existir → se já tem JWT válido, não faz nada → senão, troca a
  sessão legada por um JWT via `/api/v1/session/legacy-nonce` +
  `/legacy-bridge`. Ver `docs/data-flow.md` §2.

## Hierarquia de cargo / permissão (Etapa 2-3 do plano de hierarquia)
- `lf-administrativo-negocios-only-v1-20260723.js` — cargo
  "administrativo": `escopo=self, leads=NONE, negocios=CRUD`. Esconde
  UI de Leads, mantém Negócios. Consulta `getCargoCaps()` (`auth.js`).
- `lf-supervisor-teamview-readonly-v1-20260722.js` — supervisor vê o
  quadro do time inteiro, mas só pode mutar os PRÓPRIOS cards
  (read-only quando o card é de outro membro).
- `lf-supervisor-self-default-v1-20260722b.js` — supervisor abre por
  padrão no próprio pipeline, não no consolidado "Todos". **Precisa
  carregar DEPOIS de `lf-supervisor-teamview-readonly-v1-20260722.js`**
  (depende de `renderTeamBoard`/`renderKBConsBar` que o outro define) —
  ordem não é cosmética aqui.

## Persistência / recuperação de usuário
- `lf-users-persist-cloudfirst-v1-20260728.js` — usuários cadastrados
  "sumiam" após deploy porque `saveUsersLocal()`/`loadUsersDB()` só
  espelhavam na nuvem quando `DB_MODE==='firebase'` — o projeto roda em
  modo local (Firebase desligado em `app.html`), então tudo ficava só
  no `localStorage` do aparelho.
- `lf-cacador-3fixes-v1-20260730.js` — 3 bugs independentes: usuário
  excluído reaparece (retry-queue não purgada), usuário CLONADO ao
  trocar email+senha (upsert relacional usa email como chave, email
  novo vira INSERT em vez de UPDATE), foto de fundo só aparecendo no
  tema claro (especificidade CSS).
- `lf-post-update-recovery-v1-20260729.js` — dois objetivos: limpar
  cache local derivado após update do bundle sem recriar conta, e o
  fluxo de recuperação quando o hash de senha tem iteração PBKDF2 acima
  do cap do workerd (100k) — ver `docs/troubleshooting.md`.

Todos idempotentes, com guarda de instalação única. Ver
`docs/coding-standards.md` e `docs/permissions.md`.
