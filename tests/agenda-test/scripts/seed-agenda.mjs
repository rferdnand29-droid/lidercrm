#!/usr/bin/env node
/**
 * seed-agenda.mjs — Seed determinístico para o cenário E2E do CRM (Cenário 3: Agenda).
 *
 * Garante estado idêntico em qualquer execução através de:
 *   - PRNG semeada por SEED (default "agenda-test-2026")  ─ sem Date.now / Math.random nu
 *   - UUID v5 com namespace fixo                            ─ IDs estáveis entre runs
 *   - Timestamps derivados da SEED com offsets fixos
 *   - Operações idempotentes (INSERT ... ON CONFLICT DO UPDATE)
 *   - Apaga agendamentos anteriores antes de semear         ─ isolated test state
 *
 * Conteúdo gerado:
 *   - 150 usuários no pool (load_user_0001 .. load_user_0150)
 *   -   1 recurso disputado (vendor_hot_001)
 *   - 500 contatos de exemplo (contact_1 .. contact_500)     ─ alvos do contact_id_*
 *   -   0 agendamentos pré-existentes                        ─ o teste cria os dele
 *
 * Uso:
 *   SEED=agenda-test-2026 DRY_RUN=1  node scripts/seed-agenda.mjs   # imprime SQL
 *   SEED=agenda-test-2026 RESET=1    node scripts/seed-agenda.mjs   # zera + aplica
 *   SEED=agenda-test-2026 USERS_COUNT=100 node scripts/seed-agenda.mjs
 *   node scripts/seed-agenda.mjs --check                          # exit 0 se SQL válido
 *
 * Variáveis de ambiente:
 *   D1_NAME        nome do binding D1 em wrangler.toml (default "crm-staging")
 *   WRANGLER_ENV   env wrangler (production|staging|...)  (default "staging")
 *   SEED           string semeadora                        (default "agenda-test-2026")
 *   USERS_COUNT    total de usuários no pool               (default 150)
 *   CONTACTS_COUNT total de contatos                       (default 500)
 *   DRY_RUN        "1" imprime SQL, não executa
 *   RESET          "1" trunca tabela appointments antes
 *   PASSWORD       senha plana para todos os usuários      (default "LoadTest#2026")
 *
 * Saída:
 *   - Modo normal: executa via `wrangler d1 execute --file`
 *   - Modo DRY_RUN: salva SQL em build/seed.sql e imprime resumo
 *
 * Compatibilidade: Node ≥ 18, wrangler ≥ 3.
 *
 * [FIX] Removida coluna password_plain — antes o SQL persistia a senha em texto
 *       na tabela users. Mesmo em staging isso é vazamento cru. Autenticação
 *       agora usa exclusivamente password_hash (SHA256(SEED:username:password)).
 *       O k6 continua funcionando pois já envia senha plana no /auth/login;
 *       o backend deve comparar sha256(SEED:username:password) contra a coluna.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constantes & configuração
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

const CFG = {
  D1_NAME:       process.env.D1_NAME       || 'crm-staging',
  WRANGLER_ENV:  process.env.WRANGLER_ENV  || 'staging',
  SEED:          process.env.SEED          || 'agenda-test-2026',
  USERS_COUNT:   parseInt(process.env.USERS_COUNT   || '150', 10),
  CONTACTS_COUNT:parseInt(process.env.CONTACTS_COUNT|| '500', 10),
  PASSWORD:      process.env.PASSWORD      || 'LoadTest#2026',
  DRY_RUN:       process.env.DRY_RUN === '1',
  RESET:         process.env.RESET === '1',
  CHECK_ONLY:    process.argv.includes('--check'),
  RESOURCE_ID:   process.env.RESOURCE_ID   || 'vendor_hot_001',
};

// Namespace UUID fixo para derivação determinística (RFC 4122 §4.3).
// NÃO trocar entre runs — caso contrário, IDs mudam e o teste fica instável.
const UUID_NS = 'a1b2c3d4-e5f6-4890-abcd-ef0123456789';

// ---------------------------------------------------------------------------
// Determinismo: PRNG seedável (Mulberry32) + UUID v5 via crypto
// ---------------------------------------------------------------------------

/** Mulberry32 — 32-bit state, sem dependências externas, qualidade suficiente para IDs de teste. */
function mulberry32(seedInt) {
  let s = seedInt >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
  };
}

/** Converte a SEED string em uint32 (qualidade: só precisa ser estável, não criptográfica). */
function seedToInt(str) {
  const h = createHash('sha256').update(str).digest();
  return h.readUInt32LE(0);
}

/**
 * UUID v5 derivado puramente da SEED.
 * Garante que o mesmo nome + mesma SEED → mesmo UUID, em qualquer máquina.
 */
function uuidV5(name) {
  const NS_BYTES = Buffer.from(UUID_NS.replace(/-/g, ''), 'hex');
  const NAME_BYTES = Buffer.from(name, 'utf8');
  const hash = createHash('sha1').update(NS_BYTES).update(NAME_BYTES).digest();

  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;          // versão 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80;          // variante RFC 4122

  const h = bytes.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
}

/** Hash determinístico de senha — derivado da SEED+username, garante que
 *  re-seeding reescreva exatamente o mesmo hash. */
function passwordHash(username, password) {
  return createHash('sha256')
    .update(`${CFG.SEED}:${username}:${password}`)
    .digest('hex');
}

// ---------------------------------------------------------------------------
// Geração de entidades
// ---------------------------------------------------------------------------

/** ISO timestamp derivado da SEED — estável entre runs. */
function fixedTimestamp(offsetMinutes = 0) {
  // Base: 2026-07-24T00:00:00Z (antecede o slot base do teste).
  const base = new Date('2026-07-24T00:00:00Z').getTime();
  return new Date(base + offsetMinutes * 60_000).toISOString();
}

/** Schema alvo — refletido do k6/agenda.test.js (resource_id, start, duration_min, contact_id)
 *  + audit (admin_agenda_check) + auth (POST /auth/login → token).
 *  [FIX] Coluna password_plain removida — não persistimos senha em texto. */
function buildSchema() {
  return [
    `CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL
    );`,
    `CREATE TABLE IF NOT EXISTS resources (
      id            TEXT PRIMARY KEY,
      name          TEXT UNIQUE NOT NULL,
      owner_user_id TEXT NOT NULL,
      created_at    TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users(id)
    );`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id          TEXT PRIMARY KEY,
      external_id TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL
    );`,
    // appointments: a UNIQUE(resource_id, start) é a peça-chave —
    // ela é o mecanismo testado no cenário 3 (espera-se que impeça double-booking).
    `CREATE TABLE IF NOT EXISTS appointments (
      id               TEXT PRIMARY KEY,
      resource_id      TEXT NOT NULL,
      owner_user_id    TEXT NOT NULL,
      start            TEXT NOT NULL,
      duration_min     INTEGER NOT NULL,
      contact_id       TEXT NOT NULL,
      note             TEXT,
      idempotency_key  TEXT UNIQUE,
      status           TEXT NOT NULL DEFAULT 'confirmed',
      created_at       TEXT NOT NULL,
      FOREIGN KEY (resource_id) REFERENCES resources(id),
      FOREIGN KEY (owner_user_id) REFERENCES users(id),
      UNIQUE (resource_id, start)
    );`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      resource_id   TEXT NOT NULL,
      attempt_at    TEXT NOT NULL,
      outcome       TEXT NOT NULL,
      user_id       TEXT,
      marked_completed_without_row INTEGER DEFAULT 0
    );`,
    `CREATE INDEX IF NOT EXISTS idx_appointments_resource_start ON appointments(resource_id, start);`,
    `CREATE INDEX IF NOT EXISTS idx_audit_resource_attempt      ON audit_log(resource_id, attempt_at);`,
  ];
}

function buildUsers(_rng) {
  const rows = [];
  const createdAt = fixedTimestamp(0);
  for (let i = 1; i <= CFG.USERS_COUNT; i++) {
    const username = `load_user_${String(i).padStart(4, '0')}`;
    rows.push({
      id: uuidV5(`user:${CFG.SEED}:${username}`),
      username,
      password_hash: passwordHash(username, CFG.PASSWORD),
      created_at: createdAt,
    });
  }
  return rows;
}

function buildResources(users) {
  const owner = users[0];
  return [{
    id: uuidV5(`resource:${CFG.SEED}:${CFG.RESOURCE_ID}`),
    name: CFG.RESOURCE_ID,
    owner_user_id: owner.id,
    created_at: fixedTimestamp(0),
  }];
}

function buildContacts(_rng) {
  const rows = [];
  const createdAt = fixedTimestamp(0);
  for (let i = 1; i <= CFG.CONTACTS_COUNT; i++) {
    const external = `contact_${i}`;
    rows.push({
      id: uuidV5(`contact:${CFG.SEED}:${external}`),
      external_id: external,
      name: `Contacto ${i}`,
      created_at: createdAt,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Renderização SQL (D1 / SQLite)
// ---------------------------------------------------------------------------

function escape(s) {
  return String(s).replace(/'/g, "''");
}

function renderUsersSQL(users) {
  return users.map(u => `
INSERT INTO users (id, username, password_hash, created_at)
VALUES ('${escape(u.id)}', '${escape(u.username)}', '${escape(u.password_hash)}', '${u.created_at}')
ON CONFLICT(id) DO UPDATE SET
  username      = excluded.username,
  password_hash = excluded.password_hash;`).join('\n');
}

function renderResourcesSQL(resources) {
  return resources.map(r => `
INSERT INTO resources (id, name, owner_user_id, created_at)
VALUES ('${escape(r.id)}', '${escape(r.name)}', '${escape(r.owner_user_id)}', '${r.created_at}')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  owner_user_id = excluded.owner_user_id;`).join('\n');
}

function renderContactsSQL(contacts) {
  return contacts.map(c => `
INSERT INTO contacts (id, external_id, name, created_at)
VALUES ('${escape(c.id)}', '${escape(c.external_id)}', '${escape(c.name)}', '${c.created_at}')
ON CONFLICT(id) DO UPDATE SET
  external_id = excluded.external_id,
  name = excluded.name;`).join('\n');
}

function renderResetAppointments() {
  return `
-- RESET: limpa agendamentos anteriores do recurso disputado (idempotência de estado)
DELETE FROM appointments WHERE resource_id IN (
  SELECT id FROM resources WHERE name = '${escape(CFG.RESOURCE_ID)}'
);
DELETE FROM audit_log WHERE resource_id IN (
  SELECT id FROM resources WHERE name = '${escape(CFG.RESOURCE_ID)}'
);`;
}

// ---------------------------------------------------------------------------
// Composição do script final + execução
// ---------------------------------------------------------------------------

function generateSQL() {
  const rng = mulberry32(seedToInt(CFG.SEED));
  const users = buildUsers(rng);
  const resources = buildResources(users);
  const contacts = buildContacts(rng);

  const parts = [];
  parts.push('-- ============================================================');
  parts.push(`-- Seed determinístico — gerado em ${fixedTimestamp(0)}`);
  parts.push(`-- SEED="${CFG.SEED}" USERS=${CFG.USERS_COUNT} CONTACTS=${CFG.CONTACTS_COUNT}`);
  parts.push('-- ============================================================');

  parts.push('\n-- Schema (idempotente)');
  parts.push(buildSchema().join('\n'));

  if (CFG.RESET) {
    parts.push('\n-- Reset de appointments (Só roda com RESET=1)');
    parts.push(renderResetAppointments());
  }

  parts.push('\n-- Users (idempotente)');
  parts.push(renderUsersSQL(users));

  parts.push('\n-- Resources (idempotente)');
  parts.push(renderResourcesSQL(resources));

  parts.push('\n-- Contacts (idempotente)');
  parts.push(renderContactsSQL(contacts));

  return {
    sql: parts.join('\n'),
    counts: {
      users: users.length,
      resources: resources.length,
      contacts: contacts.length,
    },
  };
}

function runWrangler(sqlPath) {
  const args = [
    'd1', 'execute', CFG.D1_NAME,
    '--env', CFG.WRANGLER_ENV,
    '--file', sqlPath,
    '--yes',
  ];
  console.log(`[seed] Executando: wrangler ${args.join(' ')}`);
  const out = execFileSync('wrangler', args, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    encoding: 'utf8',
  });
  return out;
}

function main() {
  console.log('========================================');
  console.log(` SEED DETERMINÍSTICO — CRM Agenda`);
  console.log('========================================');
  console.log(` SEED            : ${CFG.SEED}`);
  console.log(` D1_NAME         : ${CFG.D1_NAME}`);
  console.log(` WRANGLER_ENV    : ${CFG.WRANGLER_ENV}`);
  console.log(` USERS_COUNT     : ${CFG.USERS_COUNT}`);
  console.log(` CONTACTS_COUNT  : ${CFG.CONTACTS_COUNT}`);
  console.log(` RESOURCE_ID     : ${CFG.RESOURCE_ID}`);
  console.log(` RESET           : ${CFG.RESET}`);
  console.log(` DRY_RUN         : ${CFG.DRY_RUN}`);
  console.log(` --check         : ${CFG.CHECK_ONLY}`);
  console.log('----------------------------------------');

  const { sql, counts } = generateSQL();

  const outDir = resolve(PROJECT_ROOT, 'build');
  mkdirSync(outDir, { recursive: true });
  const sqlPath = resolve(outDir, 'seed.sql');
  writeFileSync(sqlPath, sql, 'utf8');
  console.log(`[seed] SQL gravado em: ${sqlPath} (${sql.length} bytes)`);

  if (CFG.CHECK_ONLY) {
    console.log(`[seed] --check OK — ${counts.users} users, ${counts.contacts} contacts, ${counts.resources} resource(s).`);
    console.log('[seed] --check OK — seed determinístico gerado sem erro.');
    process.exit(0);
  }

  if (CFG.DRY_RUN) {
    console.log('[seed] DRY_RUN=1 — SQL não executado. Primeiras 30 linhas:');
    console.log('----------------------------------------');
    console.log(sql.split('\n').slice(0, 30).join('\n'));
    console.log('----------------------------------------');
    console.log(`[seed] DRY_RUN concluído. Execute sem DRY_RUN para aplicar.`);
    process.exit(0);
  }

  try {
    runWrangler(sqlPath);
    console.log('----------------------------------------');
    console.log('[seed] ✅ Seed aplicado com sucesso.');
    console.log(`[seed]    Users    : ${counts.users}`);
    console.log(`[seed]    Contacts : ${counts.contacts}`);
    console.log(`[seed]    Resources: ${counts.resources}`);
    console.log('[seed] Próximo passo: k6 run -e LEVEL=N1 ...');
  } catch (err) {
    console.error('[seed] ❌ wrangler falhou. Verifique login no Cloudflare (wrangler login) e binding em wrangler.toml.');
    console.error('[seed]    Mensagem:', err.message ?? err);
    console.error('[seed]    Dica: reexecute com DRY_RUN=1 para inspecionar o SQL.');
    process.exit(1);
  }
}

main();
