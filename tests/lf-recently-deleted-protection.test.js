// @vitest-environment happy-dom
// =====================================================================
// tests/lf-recently-deleted-protection.test.js
// Melhoria de arquitetura (2026-09) — cobre a proteção contra "item
// excluído ressuscitando" (_lfMarkRecentlyDeleted/_lfIsRecentlyDeleted),
// incluindo o próprio bug que motivou a correção definitiva de
// 2026-09-09: existiam DUAS implementações concorrentes desta mesma
// proteção (uma com TTL de 5 minutos, outra com 7 dias) — sem teste
// automatizado, essa divergência ficou invisível por semanas.
//
// Carrega o arquivo-fonte real via eval — se o TTL for reduzido por
// engano de novo, ou se a duplicação for reintroduzida em outro
// arquivo, este teste é o primeiro lugar que deveria acusar o problema.
// =====================================================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UTILS_SRC = readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');

function loadUtils() {
  (0, eval)(UTILS_SRC);
  return {
    mark: window._lfMarkRecentlyDeleted,
    isDeleted: window._lfIsRecentlyDeleted,
  };
}

describe('_lfMarkRecentlyDeleted / _lfIsRecentlyDeleted', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('id nunca marcado => não é recém-excluído', () => {
    const { isDeleted } = loadUtils();
    expect(isDeleted('nunca-existiu')).toBe(false);
  });

  it('id marcado agora => é recém-excluído imediatamente', () => {
    const { mark, isDeleted } = loadUtils();
    mark('lead-123');
    expect(isDeleted('lead-123')).toBe(true);
  });

  it('protege por 7 dias — ainda protegido pouco antes de completar 7 dias', () => {
    const { mark, isDeleted } = loadUtils();
    mark('lead-123');
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 - 1000); // 7 dias menos 1s
    expect(isDeleted('lead-123')).toBe(true);
  });

  it('expira depois de 7 dias — não protege mais indefinidamente', () => {
    const { mark, isDeleted } = loadUtils();
    mark('lead-123');
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1000); // 7 dias e 1s
    expect(isDeleted('lead-123')).toBe(false);
  });

  it('REGRESSÃO EXPLÍCITA: janela de proteção não pode ser tão curta quanto 5 minutos — bug real já corrigido (era a validade da implementação duplicada que existia em kanban-helpers.js até 2026-09-02)', () => {
    const { mark, isDeleted } = loadUtils();
    mark('lead-123');
    vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutos — bem além dos 5min do bug antigo
    expect(isDeleted('lead-123')).toBe(true); // com o fix, ainda protegido
  });

  it('sobrevive a um "reload" — guardado em localStorage, não só em memória', () => {
    const { mark } = loadUtils();
    mark('lead-123');
    // Recarrega o "arquivo" (simula um F5 / nova aba) — precisa reler do
    // localStorage, não de uma variável em memória que se perderia.
    const { isDeleted: isDeletedAfterReload } = loadUtils();
    expect(isDeletedAfterReload('lead-123')).toBe(true);
  });

  it('ids diferentes não se confundem entre si', () => {
    const { mark, isDeleted } = loadUtils();
    mark('lead-A');
    expect(isDeleted('lead-A')).toBe(true);
    expect(isDeleted('lead-B')).toBe(false);
  });
});
