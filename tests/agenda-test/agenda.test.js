import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';

import { LEVELS } from './config/levels.js';
import { login } from './lib/auth.js';
import { buildHotSlots, uuid } from './lib/slots.js';
import { BASE_URL, RESOURCE_ID, ADMIN_TOKEN, LEVEL } from './lib/env.js';
import {
  doubleBookingCount,
  ghostWriteCount,
  conflictCorrectRate,
  idempotencyReuseRate,
  slotWinLatency,
  slotLoseLatency,
  seedCounters,
  readCounter,
} from './lib/metrics.js';

// ---------- Configuração dinâmica por nível ----------
const CFG = LEVELS[LEVEL];
if (!CFG) throw new Error(`Nível inválido: ${LEVEL}. Use N1, N2 ou N3.`);

// Pool de usuários pré-criados no seed determinístico.
// [FIX] users.json expandido para 150 entradas (bate com seed-agenda.mjs) —
// suficiente para N3 (100 VUs) sem colisão de credenciais.
const users = new SharedArray('users', () =>
  JSON.parse(open('./data/users.json'))
);

// ---------- Opções k6 ----------
export const options = {
  scenarios: {
    agenda_conflict: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: CFG.rampUp, target: CFG.vus },
        { duration: CFG.steady, target: CFG.vus },
        { duration: CFG.rampDown, target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: CFG.thresholds,
  discardResponseBodies: false,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  tags: {
    scenario: 'agenda',
    level: LEVEL,
  },
};

// ---------- Setup: gera slots quentes e semeia contadores ----------
export function setup() {
  // [AUDIT] Garante que os Counters apareçam no summary mesmo se nunca incrementados.
  seedCounters();
  const hotSlots = buildHotSlots(CFG.hotSlots);
  console.log(`[setup] Nível=${LEVEL} VUs=${CFG.vus} hotSlots=${hotSlots.length} users_pool=${users.length}`);
  console.log(`[setup] Slots disputados: ${hotSlots.join(', ')}`);
  if (users.length < CFG.vus) {
    console.warn(
      `[setup] ATENÇÃO: pool de usuários (${users.length}) é menor que VUs (${CFG.vus}). ` +
      `Considere expandir data/users.json para evitar colisão de credenciais.`
    );
  }
  return { hotSlots };
}

// ---------- Estado por VU (login uma vez por VU) ----------
// [AUDIT] Em k6, cada VU executa o módulo em seu próprio contexto.
// O `let session` abaixo é PER-VU — não é compartilhado entre VUs diferentes.
// O login é feito lazily na primeira iteração de cada VU e reusado até o fim do teste.
let session = null;
function getSession() {
  if (session) return session;
  const idx = (exec.vu.idInTest - 1) % users.length;
  const u = users[idx];
  session = login(u.username, u.password);
  session.username = u.username;
  return session;
}

// ---------- Cenário principal ----------
export default function (data) {
  const s = getSession();
  const hotSlots = data.hotSlots;

  // Cada iteração escolhe 1 slot quente aleatório para disputar
  const slot = hotSlots[Math.floor(Math.random() * hotSlots.length)];
  const idempotencyKey = uuid();

  group('POST /agenda (disputa slot quente)', () => {
    const payload = JSON.stringify({
      resource_id: RESOURCE_ID,
      start: slot,
      duration_min: 30,
      contact_id: `contact_${(exec.vu.idInTest % 500) + 1}`,
      note: `load_test_${LEVEL}_vu${exec.vu.idInTest}_iter${exec.scenario.iterationInTest}`,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${s.token}`,
        'Idempotency-Key': idempotencyKey,
      },
      tags: { endpoint: 'agenda_post', level: LEVEL },
    };

    const res = http.post(`${BASE_URL}/agenda`, payload, params);

    // ---- Classificação de resultado ----
    const isWinner = res.status === 201;
    const isConflict = res.status === 409;
    const isServerError = res.status >= 500;

    check(res, {
      'status 201 ou 409': (r) => r.status === 201 || r.status === 409,
      'sem 5xx': (r) => r.status < 500,
      'resposta tem body JSON': (r) => {
        try { r.json(); return true; } catch (e) { return false; }
      },
    });

    // Latência segmentada
    if (isWinner) slotWinLatency.add(res.timings.duration);
    if (isConflict) slotLoseLatency.add(res.timings.duration);

    // Rate de conflito bem formado (409 deve trazer conflict_slot no body)
    if (isConflict) {
      const body = safeJson(res);
      const wellFormed = body && body.error === 'slot_conflict' && body.conflict_slot === slot;
      conflictCorrectRate.add(wellFormed);
    } else if (isWinner) {
      conflictCorrectRate.add(true);
    } else {
      conflictCorrectRate.add(false);
    }

    // Guarda o ID criado (se vencedor) para verificação posterior
    if (isWinner) {
      const body = safeJson(res);
      if (body && body.appointment_id) {
        // [AUDIT] A verificação de idempotência aqui só roda em winners.
        // Isto testa o caminho retry-depois-de-sucesso, NÃO retry-sob-conflito
        // (idempotency-key num POST que retornou 409 não é reenviada).
        // Para cobrir o segundo cenário, adicione um cenário extra dedicado
        // — fora do escopo deste script, mas documentado.
        verifyIdempotency(s.token, payload, idempotencyKey, body.appointment_id);
      }
    }

    // Log de erro real
    if (isServerError) {
      console.error(`[VU${exec.vu.idInTest}] 5xx no slot ${slot}: ${res.status} ${res.body}`);
    }
  });

  sleep(Math.random() * 3 + 1); // think-time 1–4s
}

// ---------- Verificação de idempotência ----------
function verifyIdempotency(token, payload, idempotencyKey, originalId) {
  const res = http.post(`${BASE_URL}/agenda`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
    tags: { endpoint: 'agenda_idempotency_retry' },
  });

  const body = safeJson(res);
  // [FIX] Aceita tanto 200 quanto 201 desde que o mesmo appointment_id seja retornado.
  // Antes o teste rejeitava 200-mesmo-id como falha, subestimando idempotency_reuse_rate.
  const okStatus = res.status === 200 || res.status === 201;
  const reusedSame = okStatus && body && body.appointment_id === originalId;
  idempotencyReuseRate.add(reusedSame);

  if (res.status === 201 && body && body.appointment_id && body.appointment_id !== originalId) {
    // BUG: mesma idempotency-key gerou 2 agendamentos distintos
    doubleBookingCount.add(1);
    console.error(
      `[BUG] Idempotência quebrada: key=${idempotencyKey} gerou ids [${originalId}, ${body.appointment_id}]`
    );
  }
}

// ---------- Teardown: verificação global de double-booking ----------
export function teardown(data) {
  console.log('[teardown] Verificando integridade dos slots disputados...');

  // Admin token para inspeção (definido via env)
  if (!ADMIN_TOKEN) {
    console.warn('[teardown] ADMIN_TOKEN ausente — pulando verificação de integridade.');
    return;
  }

  data.hotSlots.forEach((slot) => {
    const res = http.get(
      `${BASE_URL}/admin/agenda?resource_id=${RESOURCE_ID}&start=${encodeURIComponent(slot)}`,
      { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` }, tags: { endpoint: 'admin_agenda_check' } }
    );

    if (res.status !== 200) {
      console.error(`[teardown] Falha ao verificar slot ${slot}: HTTP ${res.status}`);
      return;
    }

    const body = safeJson(res);
    const count = body && Array.isArray(body.appointments) ? body.appointments.length : -1;

    if (count > 1) {
      // BUG CRÍTICO: mais de 1 agendamento confirmado no mesmo slot
      doubleBookingCount.add(count - 1);
      console.error(
        `[BUG CRÍTICO] Double-booking no slot ${slot}: ${count} agendamentos confirmados. IDs=${body.appointments
          .map((a) => a.id)
          .join(', ')}`
      );
    } else if (count === 1) {
      console.log(`[teardown] OK slot ${slot}: 1 agendamento (id=${body.appointments[0].id})`);
    } else if (count === 0) {
      // Verifica ghost writes: houve 409 mas nenhuma linha? Já esperado se ninguém venceu.
      // Só é ghost write se o backend registrou tentativa "completa" sem persistir — checado via /admin/agenda/audit
      checkGhostWrites(ADMIN_TOKEN, slot);
    }
  });

  console.log('[teardown] Verificação concluída.');
}

function checkGhostWrites(adminToken, slot) {
  const res = http.get(
    `${BASE_URL}/admin/agenda/audit?resource_id=${RESOURCE_ID}&start=${encodeURIComponent(slot)}`,
    { headers: { Authorization: `Bearer ${adminToken}` }, tags: { endpoint: 'admin_audit' } }
  );
  if (res.status !== 200) return;
  // [FIX] Usa safeJson — endpoint pode responder 200 com corpo vazio/HTML durante deploys parciais.
  const body = safeJson(res);
  if (body && body.marked_completed_without_row > 0) {
    ghostWriteCount.add(body.marked_completed_without_row);
    console.error(
      `[BUG] Ghost writes no slot ${slot}: ${body.marked_completed_without_row} registros "completed" sem linha real.`
    );
  }
}

// ---------- Util ----------
function safeJson(res) {
  try { return res.json(); } catch (e) { return null; }
}

// ---------- Resumo customizado ----------
// [FIX] `data.metrics.<name>.values.count` pode não existir se o Counter jamais
// registrou incremento e o seed falhou. `readCounter` (lib/metrics.js) centraliza
// a leitura defensiva e evita `TypeError: Cannot read properties of undefined`.
export function handleSummary(data) {
  const bookings = readCounter(data.metrics, 'double_booking_count');
  const ghosts = readCounter(data.metrics, 'ghost_write_count');
  const verdict = bookings === 0 && ghosts === 0 ? '✅ PASS' : '❌ FAIL';

  console.log(`
========================================
 CENÁRIO 3 — AGENDA (${LEVEL})
========================================
 Double-booking count : ${bookings}
 Ghost writes         : ${ghosts}
 Veredito bloqueante  : ${verdict}
========================================
`);

  return {
    stdout: JSON.stringify(data.metrics, null, 2),
    [`report-agenda-${LEVEL}-${Date.now()}.json`]: JSON.stringify(data, null, 2),
  };
}
