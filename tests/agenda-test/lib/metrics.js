import { Counter, Rate, Trend } from 'k6/metrics';

export const doubleBookingCount = new Counter('double_booking_count');
export const ghostWriteCount = new Counter('ghost_write_count');
export const conflictCorrectRate = new Rate('agenda_conflict_correct_rate');
export const idempotencyReuseRate = new Rate('idempotency_reuse_rate');
export const slotWinLatency = new Trend('slot_win_latency', true);
export const slotLoseLatency = new Trend('slot_lose_latency', true);

// [AUDIT] Ghost-write seed:
// Counters em k6 só aparecem no summary se forem incrementados pelo menos uma vez.
// Sem seed, o threshold `count==0` pode não ser avaliado de forma estável em algumas versões.
// Solução: garantir uma instância no setup() de agenda.test.js antes do cenário começar.
export function seedCounters() {
  // add(0) cria a entrada sem alterar a contagem real
  ghostWriteCount.add(0);
  doubleBookingCount.add(0);
}

// [FIX] Guard robusto para leitura de counters no handleSummary — cobre o caso
// em que k6 renomeia values entre versões (values.count vs values['count']).
export function readCounter(metrics, name) {
  const m = metrics && metrics[name];
  if (!m || !m.values) return 0;
  const v = m.values.count !== undefined ? m.values.count : m.values['count'];
  return Number.isFinite(v) ? v : 0;
}
