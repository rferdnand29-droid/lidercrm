// Gera slots "quentes" — todos os VUs disputam os mesmos horários
// para forçar contenção máxima no backend.
export function buildHotSlots(count, baseDateISO = '2026-07-25T14:00:00Z') {
  const base = new Date(baseDateISO).getTime();
  const slots = [];
  for (let i = 0; i < count; i++) {
    // 1 slot a cada 30 min a partir da base
    slots.push(new Date(base + i * 30 * 60 * 1000).toISOString());
  }
  return slots;
}

// UUID v4 simples para Idempotency-Key.
// [AUDIT] Suficiente para o teste; NÃO usar em produção (Math.random não é CSPRNG).
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
