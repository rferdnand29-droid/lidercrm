// =====================================================================
// tests/team-scope.test.js
// AUDITORIA-FINAL-10 (2026-08-01, item confirmado: hierarquia
// orientador/supervisor/gerente) — testa o utilitário compartilhado
// usado por dashboard, atividades e ligações.
// =====================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { canAccessUid, resolveTeamMemberIds } from '../_worker_src/worker/utils/team-scope.js';

const cfg = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function mockTeam(map) {
  // map: { [sub]: { team_id }, teams: { [team_id]: [legacy_id,...] } }
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('legacy_id=eq.')) {
      const sub = decodeURIComponent(u.match(/legacy_id=eq\.([^&]+)/)[1]);
      const user = map.users[sub];
      return jsonResponse(user ? [user] : []);
    }
    if (u.includes('team_id=eq.')) {
      const teamId = decodeURIComponent(u.match(/team_id=eq\.([^&]+)/)[1]);
      const members = map.teams[teamId] || [];
      return jsonResponse(members.map((legacy_id) => ({ legacy_id })));
    }
    return jsonResponse([]);
  }));
}

describe('canAccessUid — regra confirmada (dono sempre; gerente vê tudo; supervisor só o time; resto só o próprio)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('dono sempre acessa a própria lista, sem nenhuma chamada de rede', async () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('não deveria chamar fetch pra self-access'); }));
    const ctx = { user: { sub: 'u1' }, caps: {} };
    expect(await canAccessUid(cfg, ctx, 'u1')).toBe(true);
  });

  it('adminUI (gerente pra cima) acessa qualquer uid, sem precisar resolver time', async () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('não deveria precisar consultar time pra adminUI'); }));
    const ctx = { user: { sub: 'gerente-1' }, caps: { adminUI: true, supervisorUI: true } };
    expect(await canAccessUid(cfg, ctx, 'qualquer-outro-uid')).toBe(true);
  });

  it('supervisorUI acessa uid do mesmo time', async () => {
    mockTeam({
      users: { 'sup-1': { legacy_id: 'sup-1', team_id: 'time-A' } },
      teams: { 'time-A': ['sup-1', 'consultor-1', 'consultor-2'] },
    });
    const ctx = { user: { sub: 'sup-1' }, caps: { adminUI: false, supervisorUI: true } };
    expect(await canAccessUid(cfg, ctx, 'consultor-1')).toBe(true);
  });

  it('supervisorUI NEGA uid de outro time', async () => {
    mockTeam({
      users: { 'sup-1': { legacy_id: 'sup-1', team_id: 'time-A' } },
      teams: { 'time-A': ['sup-1', 'consultor-1'] },
    });
    const ctx = { user: { sub: 'sup-1' }, caps: { adminUI: false, supervisorUI: true } };
    expect(await canAccessUid(cfg, ctx, 'consultor-de-outro-time')).toBe(false);
  });

  it('supervisorUI sem team_id cadastrado: fail-closed (nega cross-user)', async () => {
    mockTeam({ users: { 'sup-sem-time': { legacy_id: 'sup-sem-time', team_id: null } }, teams: {} });
    const ctx = { user: { sub: 'sup-sem-time' }, caps: { adminUI: false, supervisorUI: true } };
    expect(await canAccessUid(cfg, ctx, 'qualquer-outro')).toBe(false);
  });

  it('nem adminUI nem supervisorUI (consultor comum): só a própria lista', async () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('não deveria consultar time — nega direto') }));
    const ctx = { user: { sub: 'consultor-1' }, caps: { adminUI: false, supervisorUI: false } };
    expect(await canAccessUid(cfg, ctx, 'consultor-2')).toBe(false);
  });

  it('resolveTeamMemberIds retorna null (não []) quando não há time — quem chama não confunde "sem time" com "time vazio"', async () => {
    mockTeam({ users: { x: { legacy_id: 'x', team_id: null } }, teams: {} });
    expect(await resolveTeamMemberIds(cfg, 'x')).toBeNull();
  });
});
