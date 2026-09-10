// =====================================================================
// tests/push-send-department-scope.test.js
// Auditoria de correção (2026-10-02) — cobre o achado real de
// sendPushController: qualquer usuário autenticado podia notificar
// QUALQUER outra pessoa da empresa, com título/corpo/dado totalmente
// livres, sem nenhuma relação exigida entre remetente e destinatário
// (superfície de phishing/engenharia social). Corrigido restringindo
// ao mesmo departamento do remetente, salvo escopo global (gerência).
// =====================================================================
import { describe, it, expect, vi } from 'vitest';

vi.mock('../_worker_src/worker/utils/team-scope.js', () => ({
  resolveDepartmentMemberIds: vi.fn(),
}));

const { resolveDepartmentMemberIds } = await import('../_worker_src/worker/utils/team-scope.js');
const { scopeTargetsToDepartment } = await import('../_worker_src/worker/controllers/push-send-controller.js');

const cfg = {};

describe('scopeTargetsToDepartment', () => {
  it('REGRESSÃO EXPLÍCITA: sem escopo global, alvo de OUTRO departamento é bloqueado — bug real que motivou esta correção', async () => {
    resolveDepartmentMemberIds.mockResolvedValue(['eu', 'colegaMesmoDepto']);
    const { allowed, blocked } = await scopeTargetsToDepartment(cfg, 'eu', ['colegaMesmoDepto', 'estranhoOutroDepto'], {});
    expect(allowed).toEqual(['colegaMesmoDepto']);
    expect(blocked).toEqual(['estranhoOutroDepto']);
  });

  it('escopo global (gerência) notifica qualquer um, sem filtro nenhum', async () => {
    resolveDepartmentMemberIds.mockImplementation(() => { throw new Error('não deveria nem consultar — escopo global pula direto'); });
    const { allowed, blocked } = await scopeTargetsToDepartment(cfg, 'eu', ['qualquerUm', 'outroQualquer'], { escopo: 'global' });
    expect(allowed).toEqual(['qualquerUm', 'outroQualquer']);
    expect(blocked).toEqual([]);
  });

  it('fail-closed: se o departamento não resolve (null), todos os alvos são bloqueados — nunca "sem filtro"', async () => {
    resolveDepartmentMemberIds.mockResolvedValue(null);
    const { allowed, blocked } = await scopeTargetsToDepartment(cfg, 'eu', ['colega1', 'colega2'], {});
    expect(allowed).toEqual([]);
    expect(blocked).toEqual(['colega1', 'colega2']);
  });

  it('lista vazia de alvos retorna listas vazias, sem erro', async () => {
    resolveDepartmentMemberIds.mockResolvedValue(['eu']);
    const { allowed, blocked } = await scopeTargetsToDepartment(cfg, 'eu', [], {});
    expect(allowed).toEqual([]);
    expect(blocked).toEqual([]);
  });
});
