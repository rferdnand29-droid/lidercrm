// @vitest-environment happy-dom
// =====================================================================
// tests/lf-analytics-counting.test.js
// Melhoria de arquitetura (2026-09) — cobre o cálculo de "Leads
// Adicionados" e "Leads Convertidos" do Analytics. A causa raiz do
// bug relatado (Taxa de Conversão em 160%) era numerador e
// denominador filtrando por datas DIFERENTES pro mesmo período —
// corrigido pra usar a mesma referência (createdAt) nos dois.
//
// Carrega os arquivos-fonte reais via eval, na mesma ordem que
// index.html carrega (storage → kanban-helpers → kanban → dashboard)
// — sem isso, um teste contra uma cópia não pegaria uma regressão no
// arquivo de verdade.
// =====================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(rel) { return readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
const STORAGE_SRC = src('js/storage.js');
const KANBAN_HELPERS_SRC = src('src/modules/kanban/runtime/kanban-helpers.js');
const KANBAN_SRC = src('js/kanban.js');
const DASHBOARD_SRC = src('js/dashboard.js');

function loadAnalyticsFns() {
  window.LiderCRM = window.LiderCRM || {};
  (0, eval)(STORAGE_SRC);
  (0, eval)(KANBAN_HELPERS_SRC);
  (0, eval)(KANBAN_SRC);
  (0, eval)(DASHBOARD_SRC);
  return {
    countAdicionados: window._countLeadsAdicionados,
    countConvertidos: window._countLeadsConvertidos,
    isDateWithinRange: window._isDateWithinRange,
  };
}

function setLeads(uid, list) {
  localStorage.setItem('lf6_kb_leads_' + uid, JSON.stringify(list));
}

describe('Analytics — Leads Adicionados / Leads Convertidos (fix da Taxa de Conversão)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('conta leads criados dentro do período, ignora os de fora', () => {
    const { countAdicionados } = loadAnalyticsFns();
    const hoje = new Date().toISOString();
    const semanaPassada = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    setLeads('u1', [
      { id: '1', createdAt: hoje },
      { id: '2', createdAt: semanaPassada },
    ]);
    const range = { start: new Date(new Date().setHours(0, 0, 0, 0)), end: new Date(new Date().setHours(23, 59, 59, 999)) };
    expect(countAdicionados(['u1'], range)).toBe(1);
  });

  it('REGRESSÃO EXPLÍCITA: convertidos usa a MESMA data (createdAt) do adicionados, não a data de entrada na etapa — bug real já corrigido (Taxa de Conversão em 160%)', () => {
    const { countAdicionados, countConvertidos } = loadAnalyticsFns();
    const hoje = new Date().toISOString();
    const mesPassado = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    // Lead A: criado HOJE, convertido HOJE — deve contar nos dois.
    // Lead B: criado no MÊS PASSADO, mas só ENTROU na etapa "conv" HOJE
    //         (stageEnteredAt=hoje) — NÃO deve contar em "convertidos
    //         do período" porque não foi ADICIONADO no período, mesmo
    //         tendo acabado de converter agora.
    setLeads('u1', [
      { id: 'A', createdAt: hoje, col: 'conv', stageEnteredAt: hoje },
      { id: 'B', createdAt: mesPassado, col: 'conv', stageEnteredAt: hoje },
    ]);
    const range = { start: new Date(new Date().setHours(0, 0, 0, 0)), end: new Date(new Date().setHours(23, 59, 59, 999)) };
    const adicionados = countAdicionados(['u1'], range);
    const convertidos = countConvertidos(['u1'], range);
    expect(adicionados).toBe(1); // só o Lead A foi ADICIONADO hoje
    expect(convertidos).toBe(1); // só o Lead A conta — mesmo critério de data que adicionados
    // A garantia mais importante: taxa nunca passa de 100%, pois
    // convertidos é sempre um subconjunto de adicionados no MESMO
    // critério de data.
    expect(convertidos).toBeLessThanOrEqual(adicionados);
  });

  it('lead adicionado no período mas ainda não convertido: conta em adicionados, não em convertidos', () => {
    const { countAdicionados, countConvertidos } = loadAnalyticsFns();
    const hoje = new Date().toISOString();
    setLeads('u1', [{ id: '1', createdAt: hoje, col: 'novo' }]);
    const range = { start: new Date(new Date().setHours(0, 0, 0, 0)), end: new Date(new Date().setHours(23, 59, 59, 999)) };
    expect(countAdicionados(['u1'], range)).toBe(1);
    expect(countConvertidos(['u1'], range)).toBe(0);
  });

  it('soma leads de múltiplos usuários (uids) corretamente', () => {
    const { countAdicionados } = loadAnalyticsFns();
    const hoje = new Date().toISOString();
    setLeads('u1', [{ id: '1', createdAt: hoje }]);
    setLeads('u2', [{ id: '2', createdAt: hoje }, { id: '3', createdAt: hoje }]);
    const range = { start: new Date(new Date().setHours(0, 0, 0, 0)), end: new Date(new Date().setHours(23, 59, 59, 999)) };
    expect(countAdicionados(['u1', 'u2'], range)).toBe(3);
  });

  it('sem range (null) conta todo o histórico, sem filtro de data', () => {
    const { countAdicionados } = loadAnalyticsFns();
    const antigo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    setLeads('u1', [{ id: '1', createdAt: antigo }]);
    expect(countAdicionados(['u1'], null)).toBe(1);
  });
});
