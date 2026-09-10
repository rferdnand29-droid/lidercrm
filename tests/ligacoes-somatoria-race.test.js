// =====================================================================
// tests/ligacoes-somatoria-race.test.js
// CORREÇÃO (2026-08-04) — "métricas somem após atualizações": consultor
// fazia 10 ligações, o app sincronizava com o servidor, e a somatória
// acumulada do dia sumia / regredia.
//
// Reproduz a causa raiz: dois PUTs concorrentes para o MESMO uid+date,
// um deles "incompleto" (só `list`, sem `total`/`rounds` — o formato
// que o saveLigToday legado mandava a cada clique), terminando em
// ordem invertida no servidor (o PUT mais "velho" responde por último).
// Antes do fix, o total acumulado regredia para list.length. Depois do
// fix, o servidor nunca deixa total/rounds regredirem.
// =====================================================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import { putLigacoesListDoc, getLigacoesListDoc } from '../_worker_src/worker/controllers/ligacoes-controller.js';

const cfg = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// ---------------------------------------------------------------------
// Mock mínimo e stateful do PostgREST pra tabela fs_documents — guarda
// um único "documento" em memória e responde GET/PATCH/POST de forma
// coerente, o suficiente para exercitar getFsDocument/setFsDocument.
// ---------------------------------------------------------------------
function mockFsDocumentsTable() {
  var store = null; // { path, parent_path, data, updated_at }
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    var u = String(url);
    var method = (init && init.method) || 'GET';
    if (!u.includes('fs_documents')) return jsonResponse([]);

    if (method === 'GET') {
      return jsonResponse(store ? [store] : []);
    }
    if (method === 'POST') {
      var body = JSON.parse(init.body);
      store = Object.assign({}, body);
      return jsonResponse([store]);
    }
    if (method === 'PATCH') {
      var patch = JSON.parse(init.body);
      store = Object.assign({}, store, patch);
      return jsonResponse([store]);
    }
    return jsonResponse([]);
  }));
  return {
    current: function(){ return store; },
  };
}

afterEach(() => vi.unstubAllGlobals());

function ctxFor(uid) {
  return { cfg, user: { sub: uid }, caps: { adminUI: false, supervisorUI: false }, headers: {} };
}

function putReq(uid, date, body) {
  return new Request('https://x/api/v1/ligacoes/list?uid=' + uid + '&date=' + date, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function putAndRead(uid, date, body) {
  var resp = await putLigacoesListDoc(putReq(uid, date, body), ctxFor(uid));
  return (await resp.json()).data;
}

describe('ligacoes-controller — somatória nunca regride (corrida de PUTs concorrentes)', () => {
  it('PUT completo (total=40) seguido de PUT incompleto (só list, típico de saveLigToday legado) NÃO apaga o acumulado', async () => {
    var table = mockFsDocumentsTable();
    var uid = 'consultor-1', date = '2026-08-04';

    // 1) app já tinha acumulado 40 ligações no dia (patch de rounds).
    await putAndRead(uid, date, { list: [{ n: 3, hora: 't' }], total: 40, rounds: 4 });
    expect(table.current().data.total).toBe(40);

    // 2) uma gravação concorrente mais "antiga" (ex.: saveLigToday
    //    disparado por um clique isolado, sem total/rounds) responde
    //    DEPOIS — como acontecia antes do fix, quando não havia fila
    //    nem merge nenhum no servidor.
    var data = await putAndRead(uid, date, { list: [{ n: 1, hora: 't0' }, { n: 2, hora: 't1' }, { n: 3, hora: 't2' }] });

    // 3) a somatória acumulada NÃO pode ter regredido pra 3.
    expect(data.total).toBe(40);
    expect(table.current().data.total).toBe(40);
  });

  it('rounds também nunca regride pelo mesmo mecanismo', async () => {
    var table = mockFsDocumentsTable();
    var uid = 'consultor-2', date = '2026-08-04';

    await putAndRead(uid, date, { list: [], total: 20, rounds: 2 });
    var data = await putAndRead(uid, date, { list: [{ n: 1, hora: 't' }] });

    expect(data.rounds).toBe(2);
    expect(table.current().data.rounds).toBe(2);
  });

  it('quando o total do body é maior que o já salvo, avança normalmente (sem falso teto)', async () => {
    var uid = 'consultor-3', date = '2026-08-04';
    mockFsDocumentsTable();

    await putAndRead(uid, date, { list: [], total: 5, rounds: 0 });
    var data = await putAndRead(uid, date, { list: [], total: 12, rounds: 1 });

    expect(data.total).toBe(12);
  });

  it('primeiro PUT do dia (sem documento anterior) continua funcionando igual a antes', async () => {
    mockFsDocumentsTable();
    var uid = 'consultor-4', date = '2026-08-04';
    var data = await putAndRead(uid, date, { list: [{ n: 1, hora: 't' }, { n: 2, hora: 't' }] });
    expect(data.total).toBe(2); // sem total explícito, cai em list.length — igual ao comportamento original
    expect(data.rounds).toBe(0);
  });

  it('GET continua devolvendo o total protegido para o painel ADM ler', async () => {
    mockFsDocumentsTable();
    var uid = 'consultor-5', date = '2026-08-04';
    await putAndRead(uid, date, { list: [], total: 33, rounds: 3 });
    await putAndRead(uid, date, { list: [{ n: 1, hora: 't' }] });

    var getResp = await getLigacoesListDoc({ url: 'https://x/api/v1/ligacoes/list?uid=' + uid + '&date=' + date }, ctxFor(uid));
    var getData = (await getResp.json()).data;
    expect(getData.total).toBe(33);
  });
});
