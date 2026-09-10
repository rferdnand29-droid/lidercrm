// =====================================================================
// tests/team-scope.test.js
// AUDITORIA-FINAL-10 (2026-08-01, item confirmado: hierarquia
// orientador/supervisor/gerente) — testa o utilitário compartilhado
// usado por dashboard, atividades, ligações e (desde então) o pool de
// Livre do kanban (kanban-controller.js).
// =====================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { canAccessUid, resolveTeamMemberIds, resolveDepartmentMemberIds } from '../_worker_src/worker/utils/team-scope.js';

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

// =====================================================================
// resolveDepartmentMemberIds — lógica mais complexa (time -> departamento
// -> todas as equipes do departamento -> todos os usuários dessas
// equipes), usada pelo pool de "Livre" do kanban (kanban-controller.js).
// Não tinha cobertura dedicada antes desta auditoria de correção
// (2026-09-29) — canAccessUid/resolveTeamMemberIds já eram bem
// cobertos, esta função ficou de fora.
// =====================================================================
function mockDepartment({ users, teams, departments }) {
  // users: { [legacy_id]: { legacy_id, team_id } }
  // teams: { [team_id]: { id, departamento_id } }
  // departments: { [departamento_id]: [team_id, ...] } — quais equipes pertencem a cada departamento
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/users') && u.includes('legacy_id=eq.')) {
      const sub = decodeURIComponent(u.match(/legacy_id=eq\.([^&]+)/)[1]);
      const user = users[sub];
      return jsonResponse(user ? [user] : []);
    }
    if (u.includes('/teams') && u.includes('departamento_id=eq.')) {
      const deptId = decodeURIComponent(u.match(/departamento_id=eq\.([^&]+)/)[1]);
      const teamIds = departments[deptId] || [];
      return jsonResponse(teamIds.map((id) => ({ id })));
    }
    if (u.includes('/teams') && u.includes('id=eq.')) {
      const teamId = decodeURIComponent(u.match(/id=eq\.([^&]+)/)[1]);
      const team = teams[teamId];
      return jsonResponse(team ? [team] : []);
    }
    if (u.includes('/users') && u.includes('team_id=in.')) {
      const decoded = decodeURIComponent(u);
      const idsRaw = decoded.match(/team_id=in\.\(([^)]*)\)/)[1];
      const teamIds = idsRaw.split(',');
      const members = Object.values(users).filter((usr) => teamIds.includes(usr.team_id));
      return jsonResponse(members);
    }
    return jsonResponse([]);
  }));
}

describe('resolveDepartmentMemberIds — time -> departamento -> todas as equipes -> todos os usuários', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('caminho feliz: resolve todos os usuários de TODAS as equipes do mesmo departamento, não só a própria equipe', async () => {
    mockDepartment({
      users: {
        eu: { legacy_id: 'eu', team_id: 'time-A' },
        colegaMesmaEquipe: { legacy_id: 'colegaMesmaEquipe', team_id: 'time-A' },
        colegaOutraEquipeMesmoDepto: { legacy_id: 'colegaOutraEquipeMesmoDepto', team_id: 'time-B' },
      },
      teams: {
        'time-A': { id: 'time-A', departamento_id: 'depto-1' },
      },
      departments: {
        'depto-1': ['time-A', 'time-B'],
      },
    });
    const ids = await resolveDepartmentMemberIds(cfg, 'eu');
    expect(ids).toContain('eu');
    expect(ids).toContain('colegaMesmaEquipe');
    expect(ids).toContain('colegaOutraEquipeMesmoDepto'); // outra equipe, MESMO departamento — deve entrar
  });

  it('fail-closed: usuário sem team_id cadastrado retorna null, não lista vazia', async () => {
    mockDepartment({ users: { eu: { legacy_id: 'eu', team_id: null } }, teams: {}, departments: {} });
    expect(await resolveDepartmentMemberIds(cfg, 'eu')).toBeNull();
  });

  it('fail-closed: equipe sem departamento_id cadastrado retorna null', async () => {
    mockDepartment({
      users: { eu: { legacy_id: 'eu', team_id: 'time-A' } },
      teams: { 'time-A': { id: 'time-A', departamento_id: null } },
      departments: {},
    });
    expect(await resolveDepartmentMemberIds(cfg, 'eu')).toBeNull();
  });

  it('fail-closed: erro de rede em qualquer etapa retorna null, nunca lança exceção', async () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('falha de rede simulada'); }));
    await expect(resolveDepartmentMemberIds(cfg, 'eu')).resolves.toBeNull();
  });

  it('sem sub (uid vazio) retorna null sem tentar nenhuma consulta', async () => {
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('não deveria consultar nada'); }));
    expect(await resolveDepartmentMemberIds(cfg, null)).toBeNull();
    expect(await resolveDepartmentMemberIds(cfg, '')).toBeNull();
  });
});
