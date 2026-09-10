// =====================================================================
// tests/kanban-stream-controller.test.js
// Tempo real, Fase 1 (2026-09-26) — cobre checkKanbanChanges, a função
// pura que decide se algo mudou nos boards do usuário, comparando
// updated_at (não o dado inteiro — consulta barata) contra o último
// estado conhecido. Esta é a peça central da sondagem interna do
// servidor descrita em PLANO-TECNICO-TEMPO-REAL-LIDERCRM.md.
// =====================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectFrom = vi.fn();
vi.mock('../_worker_src/worker/lib/supabase-rest.js', () => ({
  selectFrom: (...a) => selectFrom(...a),
}));

const { checkKanbanChanges } = await import('../_worker_src/worker/controllers/kanban-stream-controller.js');

describe('checkKanbanChanges', () => {
  beforeEach(() => {
    selectFrom.mockReset();
  });

  it('primeira checagem (sem estado anterior) só estabelece a linha de base — não reporta mudança', async () => {
    selectFrom.mockResolvedValue({
      rows: [
        { path: 'kanban/list/leads/u1', updated_at: '2026-09-26T10:00:00Z' },
        { path: 'kanban/list/negocios/u1', updated_at: '2026-09-26T10:00:00Z' },
      ],
    });
    const { changed, nextKnown } = await checkKanbanChanges({}, 'u1', {});
    expect(changed).toEqual([]);
    expect(nextKnown.leads).toBe('2026-09-26T10:00:00Z');
    expect(nextKnown.negocios).toBe('2026-09-26T10:00:00Z');
  });

  it('REGRESSÃO EXPLÍCITA: detecta mudança quando updated_at de um board avança', async () => {
    const known = { leads: '2026-09-26T10:00:00Z', negocios: '2026-09-26T10:00:00Z' };
    selectFrom.mockResolvedValue({
      rows: [
        { path: 'kanban/list/leads/u1', updated_at: '2026-09-26T10:00:05Z' }, // mudou
        { path: 'kanban/list/negocios/u1', updated_at: '2026-09-26T10:00:00Z' }, // igual
      ],
    });
    const { changed } = await checkKanbanChanges({}, 'u1', known);
    expect(changed).toEqual(['leads']);
    expect(changed).not.toContain('negocios');
  });

  it('não reporta mudança nenhuma quando nada mudou', async () => {
    const known = { leads: '2026-09-26T10:00:00Z', negocios: '2026-09-26T10:00:00Z' };
    selectFrom.mockResolvedValue({
      rows: [
        { path: 'kanban/list/leads/u1', updated_at: '2026-09-26T10:00:00Z' },
        { path: 'kanban/list/negocios/u1', updated_at: '2026-09-26T10:00:00Z' },
      ],
    });
    const { changed } = await checkKanbanChanges({}, 'u1', known);
    expect(changed).toEqual([]);
  });

  it('detecta mudança nos dois boards ao mesmo tempo', async () => {
    const known = { leads: '2026-09-26T10:00:00Z', negocios: '2026-09-26T10:00:00Z' };
    selectFrom.mockResolvedValue({
      rows: [
        { path: 'kanban/list/leads/u1', updated_at: '2026-09-26T10:00:05Z' },
        { path: 'kanban/list/negocios/u1', updated_at: '2026-09-26T10:00:07Z' },
      ],
    });
    const { changed } = await checkKanbanChanges({}, 'u1', known);
    expect(changed.sort()).toEqual(['leads', 'negocios']);
  });

  it('trata documento inexistente (nunca criado ainda) sem quebrar', async () => {
    selectFrom.mockResolvedValue({ rows: [] });
    const { changed, nextKnown } = await checkKanbanChanges({}, 'u1', {});
    expect(changed).toEqual([]);
    expect(nextKnown.leads).toBe(null);
    expect(nextKnown.negocios).toBe(null);
  });

  it('só consulta path e updated_at — nunca o dado inteiro (checagem barata)', async () => {
    selectFrom.mockResolvedValue({ rows: [] });
    await checkKanbanChanges({}, 'u1', {});
    const callArgs = selectFrom.mock.calls[0];
    expect(callArgs[2].select).toBe('path,updated_at');
  });
});

describe('checkKanbanChanges — extensão de atividades (Fase 1.5)', () => {
  beforeEach(() => {
    selectFrom.mockReset();
  });

  it('consulta também o caminho de atividades do usuário', async () => {
    selectFrom.mockResolvedValue({ rows: [] });
    await checkKanbanChanges({}, 'u1', {});
    const callArgs = selectFrom.mock.calls[0];
    expect(callArgs[2].filters.path).toContain('atividades/list/u1');
  });

  it('detecta mudança em atividades separadamente dos boards de kanban', async () => {
    const known = { leads: 't1', negocios: 't1', activities: 't1' };
    selectFrom.mockResolvedValue({
      rows: [
        { path: 'kanban/list/leads/u1', updated_at: 't1' },
        { path: 'kanban/list/negocios/u1', updated_at: 't1' },
        { path: 'atividades/list/u1', updated_at: 't2' }, // só isso mudou
      ],
    });
    const { changed } = await checkKanbanChanges({}, 'u1', known);
    expect(changed).toEqual(['activities']);
  });

  it('detecta mudança em kanban e atividades ao mesmo tempo, cada um reportado', async () => {
    const known = { leads: 't1', negocios: 't1', activities: 't1' };
    selectFrom.mockResolvedValue({
      rows: [
        { path: 'kanban/list/leads/u1', updated_at: 't2' },
        { path: 'kanban/list/negocios/u1', updated_at: 't1' },
        { path: 'atividades/list/u1', updated_at: 't2' },
      ],
    });
    const { changed } = await checkKanbanChanges({}, 'u1', known);
    expect(changed.sort()).toEqual(['activities', 'leads']);
  });
});

describe('checkKanbanChanges — extensão de notificações (Fase 1.6)', () => {
  beforeEach(() => {
    selectFrom.mockReset();
  });

  it('consulta também o caminho de notificações do usuário', async () => {
    selectFrom.mockResolvedValue({ rows: [] });
    await checkKanbanChanges({}, 'u1', {});
    const callArgs = selectFrom.mock.calls[0];
    expect(callArgs[2].filters.path).toContain('notifications/u1');
  });

  it('detecta mudança em notificações separadamente dos outros recursos', async () => {
    const known = { leads: 't1', negocios: 't1', activities: 't1', notifications: 't1' };
    selectFrom.mockResolvedValue({
      rows: [
        { path: 'kanban/list/leads/u1', updated_at: 't1' },
        { path: 'kanban/list/negocios/u1', updated_at: 't1' },
        { path: 'atividades/list/u1', updated_at: 't1' },
        { path: 'notifications/u1', updated_at: 't2' }, // só isso mudou
      ],
    });
    const { changed } = await checkKanbanChanges({}, 'u1', known);
    expect(changed).toEqual(['notifications']);
  });

  it('detecta mudança nos 4 recursos ao mesmo tempo, cada um reportado separadamente', async () => {
    const known = { leads: 't1', negocios: 't1', activities: 't1', notifications: 't1' };
    selectFrom.mockResolvedValue({
      rows: [
        { path: 'kanban/list/leads/u1', updated_at: 't2' },
        { path: 'kanban/list/negocios/u1', updated_at: 't2' },
        { path: 'atividades/list/u1', updated_at: 't2' },
        { path: 'notifications/u1', updated_at: 't2' },
      ],
    });
    const { changed } = await checkKanbanChanges({}, 'u1', known);
    expect(changed.sort()).toEqual(['activities', 'leads', 'negocios', 'notifications']);
  });
});
