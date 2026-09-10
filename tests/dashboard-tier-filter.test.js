// =====================================================================
// tests/dashboard-tier-filter.test.js
// AUDITORIA-FINAL-10 (2026-08-01) — confirma o filtro de 2 níveis do
// dashboard: adminUI vê tudo (nenhuma query extra), supervisorUI (sem
// adminUI) só vê o próprio time. Mocka fetch (não bate no Supabase de
// verdade) — testa que a URL final da query relacional contém (ou não)
// o filtro owner_id=in.(...) esperado.
// =====================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDashboard } from '../_worker_src/worker/controllers/dashboard-controller.js';

const cfg = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };

function jsonResponse(body, headers) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
  });
}

describe('dashboard-controller — filtro por cargo (item confirmado: gerente vê tudo, supervisor vê o time)', () => {
  let calls;
  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      calls.push(String(url));
      const u = String(url);
      if (u.includes('/users?') && u.includes('legacy_id=eq.')) {
        // findUserByLegacyId — devolve um supervisor com team_id='time-A'
        return jsonResponse([{ id: 'row-1', legacy_id: 'sup-1', team_id: 'time-A' }]);
      }
      if (u.includes('/users?') && u.includes('team_id=eq.')) {
        // lista de membros do time
        return jsonResponse([{ legacy_id: 'sup-1' }, { legacy_id: 'consultor-1' }]);
      }
      if (u.includes('/clients?')) {
        // não-vazio, pra garantir que hasRelational=true e o controller
        // NÃO caia no fallback legado (que faria outras chamadas e
        // atrapalharia a contagem de queries deste teste).
        return jsonResponse([{ id: 'c1', extra: {} }]);
      }
      // leads/business — conteúdo não importa pra este teste, só a URL.
      return jsonResponse([]);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('adminUI: nenhuma das 3 queries relacionais tem filtro owner_id, e não consulta team_id', async () => {
    const ctx = { cfg, caps: { adminUI: true, supervisorUI: true }, user: { sub: 'gerente-1' }, headers: {} };
    await getDashboard({ url: 'https://x/api/v1/dashboard', headers: new Headers() }, ctx);
    const relQueries = calls.filter((u) => u.includes('/clients?') || u.includes('/leads?') || u.includes('/business?'));
    expect(relQueries.length).toBe(3);
    expect(relQueries.some((u) => u.includes('owner_id'))).toBe(false);
    expect(calls.some((u) => u.includes('team_id'))).toBe(false);
  });

  it('supervisorUI (sem adminUI): as 3 queries relacionais são filtradas por owner_id do time', async () => {
    const ctx = { cfg, caps: { adminUI: false, supervisorUI: true }, user: { sub: 'sup-1' }, headers: {} };
    await getDashboard({ url: 'https://x/api/v1/dashboard', headers: new Headers() }, ctx);
    const relQueries = calls.filter((u) => u.includes('/clients?') || u.includes('/leads?') || u.includes('/business?'));
    expect(relQueries.length).toBe(3);
    // Os 2 ids do time (sup-1, consultor-1) devem aparecer no filtro de cada query.
    relQueries.forEach((u) => {
      expect(u).toContain('owner_id=in.');
      expect(decodeURIComponent(u)).toContain('sup-1');
      expect(decodeURIComponent(u)).toContain('consultor-1');
    });
  });

  it('consultor comum (nem adminUI nem supervisorUI): comportamento inalterado — sem filtro (intenção não confirmada ainda)', async () => {
    const ctx = { cfg, caps: { adminUI: false, supervisorUI: false }, user: { sub: 'consultor-9' }, headers: {} };
    await getDashboard({ url: 'https://x/api/v1/dashboard', headers: new Headers() }, ctx);
    const relQueries = calls.filter((u) => u.includes('/clients?') || u.includes('/leads?') || u.includes('/business?'));
    expect(relQueries.some((u) => u.includes('owner_id'))).toBe(false);
  });
});
