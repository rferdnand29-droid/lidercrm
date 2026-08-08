// =====================================================================
// tests/atividades-ligacoes-scope.test.js
// AUDITORIA-FINAL-10 (2026-08-01) — confirma ponta a ponta que os
// controllers de atividades/ligações realmente aplicam canAccessUid.
// =====================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAtividadesListDoc } from '../_worker_src/worker/controllers/atividades-controller.js';
import { getLigacoesListDoc } from '../_worker_src/worker/controllers/ligacoes-controller.js';
import { ForbiddenError } from '../_worker_src/worker/errors/http-errors.js';

const cfg = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };

function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

afterEach(() => vi.unstubAllGlobals());

describe('atividades-controller — cross-consultor exige relação de time/cargo (item confirmado)', () => {
  it('consultor comum NÃO acessa a lista de outro consultor sem relação nenhuma', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])));
    const ctx = { cfg, user: { sub: 'consultor-1' }, caps: { adminUI: false, supervisorUI: false }, headers: {} };
    const req = { url: 'https://x/api/v1/atividades/list?uid=consultor-2' };
    await expect(getAtividadesListDoc(req, ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('consultor comum acessa a PRÓPRIA lista normalmente (sem regressão)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      // getFsDocument faz sua própria chamada — só confirmamos que não
      // lança ForbiddenError antes de chegar lá.
      return jsonResponse({ list: [] });
    }));
    const ctx = { cfg, user: { sub: 'consultor-1' }, caps: { adminUI: false, supervisorUI: false }, headers: {} };
    const req = { url: 'https://x/api/v1/atividades/list?uid=consultor-1' };
    await expect(getAtividadesListDoc(req, ctx)).resolves.toBeDefined();
  });

  it('gerente (adminUI) acessa a lista de qualquer consultor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ list: [] })));
    const ctx = { cfg, user: { sub: 'gerente-1' }, caps: { adminUI: true, supervisorUI: true }, headers: {} };
    const req = { url: 'https://x/api/v1/atividades/list?uid=qualquer-consultor' };
    await expect(getAtividadesListDoc(req, ctx)).resolves.toBeDefined();
  });
});

describe('ligacoes-controller — mesma regra', () => {
  it('consultor comum NÃO acessa o contador de outro consultor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])));
    const ctx = { cfg, user: { sub: 'consultor-1' }, caps: { adminUI: false, supervisorUI: false }, headers: {} };
    const req = { url: 'https://x/api/v1/ligacoes/list?uid=consultor-2&date=2026-08-02' };
    await expect(getLigacoesListDoc(req, ctx)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
