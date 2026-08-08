-- =====================================================================
-- LiderCRM — Fase 2.5 (v2-20260803): Row Level Security (cargo + departamento)
--
-- REESCRITO a partir do original depois do diagnóstico real do banco:
--   • Tabelas reais: leads, business, clients (não negocios/clientes).
--   • Coluna de dono real: owner_id (uuid) — não responsavel_id.
--   • Departamento NÃO é coluna direta nessas tabelas. É derivado via
--     team_id -> teams.id -> teams.departamento_id (ver 10-schema-
--     departamentos.sql v2, que criou lf_departamento_of_team()).
--
-- Regras (na ordem), aplicadas a SELECT, INSERT, UPDATE e DELETE:
--   1) Hudson (uid fixo) vê/altera TUDO — condição própria, isolada.
--   2) Usuário sem team_id (ou team sem departamento) só vê/altera
--      onde é owner.
--   3) Cargo alto + team com departamento => vê/altera tudo do MESMO
--      departamento (que pode abranger várias teams).
--   4) Demais casos => só onde é owner.
--
-- ✅ UID do Hudson (confirmado no diagnóstico original, Hudson Almeida,
--    adm@liderfinanceira.com): 9ba39d20-61e3-47e3-a99c-0e8dd559ecae
--    Esse UID é do registro em users e não muda com esta reescrita —
--    mas como faz tempo desde a confirmação original, vale reconferir
--    antes de aplicar:
--      SELECT id, email FROM users WHERE id = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae';
-- ⚠️ NÃO tratar Hudson como "mais um cargo alto" — cláusula própria
--    evita bloquear o ADM raiz se alguma outra policy tiver erro.
-- ⚠️ Não altera password.js/verifyLegacyPassword — Fase 2 é isolada.
--
-- ⚠️ PREMISSA IMPORTANTE: as policies de INSERT/UPDATE/DELETE abaixo só
--    fazem sentido se a conexão que grava for a MESMA usada pra
--    leitura — um role autenticado por usuário, SEM BYPASSRLS, com
--    app.current_user_id setado por request/transação. Se o backend
--    grava com service role / BYPASSRLS (comum em Supabase com a
--    service key no servidor), estas policies de escrita são
--    ignoradas e o controle de quem pode criar/editar/excluir
--    continua sendo só da aplicação. Confirme (query 0.5 do
--    diagnóstico) antes de assumir que isso fecha o buraco de
--    segurança.
--
-- ⚠️ Estado atual do banco (confirmado): teams tem 0 linhas, e os 7
--    usuários existentes estão todos com team_id NULL. Isso significa
--    que, assim que esta RLS for ligada, TODO MUNDO (exceto Hudson)
--    só vai enxergar o que for owner — inclusive o Supervisor, porque
--    a regra 3 exige team_id preenchido E essa team ter
--    departamento_id preenchido. Isso é esperado e não é bug: é o
--    reflexo de que teams/departamentos ainda não foram povoados
--    (passo 1-3 do final do 10-schema-departamentos.sql). Cadastre
--    teams/departamentos e atribua team_id aos usuários antes ou logo
--    depois de ligar esta RLS.
-- =====================================================================

-- Helper — cargo alto, ANTIGO (mantido só por compat, não usado mais
-- nas policies abaixo). Lia me.cargo (texto livre) diretamente —
-- populado em pouquíssimos usuários reais. Ver lf_is_supervisor.
CREATE OR REPLACE FUNCTION lf_is_high_role(cargo TEXT) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
  SELECT cargo IS NOT NULL AND lower(cargo) IN
    ('supervisor','gerente','gestor','coordenador','diretor',
     'admin','administrador','adm');
$$;

-- Helper — cargo alto de verdade (FIX 2026-08-03): consulta
-- v_user_caps.supervisor_ui, a view oficial (migration_hierarquia_
-- 20260723.sql) que resolve cargo_codigo -> cargo_caps. Isso é
-- populado de verdade (users.cargo_codigo), diferente do texto livre
-- users.cargo usado antes (só 1 de 7 usuários preenchido). orientador
-- já está com supervisor_ui=false lá (migration_orientador_demotion_
-- 20260803.sql), então continua sem escopo amplo, igual antes.
CREATE OR REPLACE FUNCTION lf_is_supervisor(uid UUID) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
  SELECT COALESCE((SELECT supervisor_ui FROM v_user_caps WHERE user_id = uid), FALSE);
$$;

-- Helper — cast seguro texto->uuid (current_setting sempre retorna
-- TEXT, mas users.id/owner_id são UUID no banco real). Nunca lança
-- erro: texto inválido vira NULL (comparação falsa/segura).
CREATE OR REPLACE FUNCTION lf_safe_uuid(t TEXT) RETURNS UUID
LANGUAGE SQL IMMUTABLE AS $$
  SELECT CASE
    WHEN t IS NOT NULL AND t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN t::uuid ELSE NULL END;
$$;

-- Helper — usuário atual
CREATE OR REPLACE FUNCTION lf_current_user() RETURNS users
LANGUAGE SQL STABLE AS $$
  SELECT u.* FROM users u WHERE u.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE));
$$;

-- lf_departamento_of_team(uuid) já foi criada em 10-schema-departamentos.sql.
-- Definida de novo aqui (CREATE OR REPLACE) só por segurança, caso este
-- arquivo seja aplicado isoladamente:
CREATE OR REPLACE FUNCTION lf_departamento_of_team(tid UUID) RETURNS TEXT
LANGUAGE SQL STABLE AS $$
  SELECT departamento_id FROM teams WHERE id = tid;
$$;

-- ---------- LEADS ----------
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_scope_v2 ON leads;
CREATE POLICY leads_scope_v2 ON leads
  FOR SELECT USING (
       -- (1) Hudson
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR -- (3) cargo alto + mesmo departamento (via team)
       EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(leads.team_id)
       )
    OR -- (2)/(4) próprio owner
       leads.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

-- INSERT: a linha nova precisa satisfazer a mesma regra — na prática,
-- o app deve gravar owner_id = quem está criando (caso comum) OU o
-- team_id de um departamento que o cargo alto que está criando
-- também gerencia. Um INSERT sem nenhum dos dois e sem ser Hudson é
-- rejeitado — força todo lead novo a ter um dono desde a criação.
DROP POLICY IF EXISTS leads_scope_v2_insert ON leads;
CREATE POLICY leads_scope_v2_insert ON leads
  FOR INSERT WITH CHECK (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(leads.team_id)
       )
    OR leads.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

-- UPDATE: USING controla quais linhas (valores ANTIGOS) podem ser
-- alvo; WITH CHECK controla se o resultado (valores NOVOS) ainda
-- satisfaz a regra — impede mover um lead pra um team/departamento
-- que o usuário não gerencia, a não ser que seja Hudson.
DROP POLICY IF EXISTS leads_scope_v2_update ON leads;
CREATE POLICY leads_scope_v2_update ON leads
  FOR UPDATE USING (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(leads.team_id)
       )
    OR leads.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  )
  WITH CHECK (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(leads.team_id)
       )
    OR leads.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

-- DELETE: mesma regra do SELECT (só valores ANTIGOS, não existe WITH
-- CHECK pra DELETE).
DROP POLICY IF EXISTS leads_scope_v2_delete ON leads;
CREATE POLICY leads_scope_v2_delete ON leads
  FOR DELETE USING (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(leads.team_id)
       )
    OR leads.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

-- ---------- BUSINESS ----------
ALTER TABLE business ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_scope_v2 ON business;
CREATE POLICY business_scope_v2 ON business
  FOR SELECT USING (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(business.team_id)
       )
    OR business.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

DROP POLICY IF EXISTS business_scope_v2_insert ON business;
CREATE POLICY business_scope_v2_insert ON business
  FOR INSERT WITH CHECK (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(business.team_id)
       )
    OR business.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

DROP POLICY IF EXISTS business_scope_v2_update ON business;
CREATE POLICY business_scope_v2_update ON business
  FOR UPDATE USING (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(business.team_id)
       )
    OR business.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  )
  WITH CHECK (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(business.team_id)
       )
    OR business.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

DROP POLICY IF EXISTS business_scope_v2_delete ON business;
CREATE POLICY business_scope_v2_delete ON business
  FOR DELETE USING (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(business.team_id)
       )
    OR business.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

-- ---------- CLIENTS ----------
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_scope_v2 ON clients;
CREATE POLICY clients_scope_v2 ON clients
  FOR SELECT USING (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(clients.team_id)
       )
    OR clients.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

DROP POLICY IF EXISTS clients_scope_v2_insert ON clients;
CREATE POLICY clients_scope_v2_insert ON clients
  FOR INSERT WITH CHECK (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(clients.team_id)
       )
    OR clients.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

DROP POLICY IF EXISTS clients_scope_v2_update ON clients;
CREATE POLICY clients_scope_v2_update ON clients
  FOR UPDATE USING (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(clients.team_id)
       )
    OR clients.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  )
  WITH CHECK (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(clients.team_id)
       )
    OR clients.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

DROP POLICY IF EXISTS clients_scope_v2_delete ON clients;
CREATE POLICY clients_scope_v2_delete ON clients
  FOR DELETE USING (
       lf_safe_uuid(current_setting('app.current_user_id', TRUE)) = '9ba39d20-61e3-47e3-a99c-0e8dd559ecae'::uuid
    OR EXISTS (
         SELECT 1 FROM users me
         WHERE  me.id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
           AND  lf_is_supervisor(me.id)
           AND  me.team_id IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) IS NOT NULL
           AND  lf_departamento_of_team(me.team_id) = lf_departamento_of_team(clients.team_id)
       )
    OR clients.owner_id = lf_safe_uuid(current_setting('app.current_user_id', TRUE))
  );

-- Reforço: orientador tem supervisor_ui=false em cargo_caps (ver
-- migration_orientador_demotion_20260803.sql) — lf_is_supervisor()
-- retorna FALSE pra ele mesmo com team/departamento preenchido.
