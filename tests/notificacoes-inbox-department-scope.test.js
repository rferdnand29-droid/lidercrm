// =====================================================================
// tests/notificacoes-inbox-department-scope.test.js
// Auditoria de correção (2026-10-05) — mesma classe de risco já
// corrigida em push-send-controller.js (SEC-06): postInboxNotificacao
// inseria notificação com conteúdo totalmente livre na caixa de
// QUALQUER usuário, sem nenhuma relação exigida entre remetente e
// destinatário. Corrigido restringindo ao mesmo departamento, salvo
// escopo global.
// =====================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setFsDocument = vi.fn();
const getFsDocument = vi.fn();
vi.mock('../_worker_src/worker/lib/fs-documents.js', () => ({
  getFsDocument: (...a) => getFsDocument(...a),
  setFsDocument: (...a) => setFsDocument(...a),
}));

vi.mock('../_worker_src/worker/utils/team-scope.js', () => ({
  resolveDepartmentMemberIds: vi.fn(),
}));

const { resolveDepartmentMemberIds } = await import('../_worker_src/worker/utils/team-scope.js');
const { postInboxNotificacao } = await import('../_worker_src/worker/controllers/notificacoes-controller.js');

function req(body) {
  return {
    headers: { get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
    text: async () => JSON.stringify(body),
  };
}

describe('postInboxNotificacao — escopo por departamento (SEC-09)', () => {
  beforeEach(() => {
    getFsDocument.mockReset();
    setFsDocument.mockReset();
    resolveDepartmentMemberIds.mockReset();
    getFsDocument.mockResolvedValue({ list: [] });
    setFsDocument.mockResolvedValue({});
  });

  it('REGRESSÃO EXPLÍCITA: notificar alguém de OUTRO departamento é negado — bug real que motivou esta correção', async () => {
    resolveDepartmentMemberIds.mockResolvedValue(['eu', 'colegaMesmoDepto']);
    const ctx = { user: { sub: 'eu' }, caps: {}, cfg: {} };
    await expect(
      postInboxNotificacao(req({ toUid: 'estranhoOutroDepto', text: 'Oi' }), ctx)
    ).rejects.toThrow();
  });

  it('notificar alguém do MESMO departamento funciona normalmente', async () => {
    resolveDepartmentMemberIds.mockResolvedValue(['eu', 'colegaMesmoDepto']);
    const ctx = { user: { sub: 'eu' }, caps: {}, cfg: {} };
    const result = await postInboxNotificacao(req({ toUid: 'colegaMesmoDepto', text: 'Oi' }), ctx);
    expect(result).toBeDefined();
  });

  it('notificar a si mesmo sempre funciona, mesmo sem departamento resolvido', async () => {
    resolveDepartmentMemberIds.mockResolvedValue(null);
    const ctx = { user: { sub: 'eu' }, caps: {}, cfg: {} };
    const result = await postInboxNotificacao(req({ toUid: 'eu', text: 'Lembrete pra mim' }), ctx);
    expect(result).toBeDefined();
  });

  it('escopo global (gerência) notifica qualquer um, sem checar departamento', async () => {
    resolveDepartmentMemberIds.mockImplementation(() => { throw new Error('não deveria consultar — escopo global pula direto'); });
    const ctx = { user: { sub: 'eu' }, caps: { escopo: 'global' }, cfg: {} };
    const result = await postInboxNotificacao(req({ toUid: 'qualquerUm', text: 'Aviso geral' }), ctx);
    expect(result).toBeDefined();
  });

  it('fail-closed: se o departamento não resolve (null), notificação pra outra pessoa é negada', async () => {
    resolveDepartmentMemberIds.mockResolvedValue(null);
    const ctx = { user: { sub: 'eu' }, caps: {}, cfg: {} };
    await expect(
      postInboxNotificacao(req({ toUid: 'colega1', text: 'Oi' }), ctx)
    ).rejects.toThrow();
  });
});
