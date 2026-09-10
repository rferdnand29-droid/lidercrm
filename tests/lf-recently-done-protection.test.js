// @vitest-environment happy-dom
// =====================================================================
// tests/lf-recently-done-protection.test.js
// Correção de causa raiz real (2026-10-08) — cobre o registro
// persistente de "atividade concluída recentemente"
// (_lfMarkRecentlyDone/_lfIsRecentlyDone), mesmo padrão já comprovado
// de _lfMarkRecentlyDeleted/_lfIsRecentlyDeleted (2026-08-21). Ver
// tests/lf-merge-activities-mirror-protection.test.js para o teste do
// uso real deste registro dentro da fusão do kanban.
//
// Carrega o arquivo-fonte real via eval — se o TTL for reduzido por
// engano, ou a chave de armazenamento divergir da de exclusão (mesmo
// bug de duplicação já corrigido para aquele outro registro), este
// teste é o primeiro lugar que deveria acusar o problema.
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
    mark: window._lfMarkRecentlyDone,
    isDone: window._lfIsRecentlyDone,
  };
}

describe('_lfMarkRecentlyDone / _lfIsRecentlyDone', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('id nunca marcado => não é recém-concluído', () => {
    const { isDone } = loadUtils();
    expect(isDone('nunca-existiu')).toBe(false);
  });

  it('id marcado agora => é recém-concluído imediatamente', () => {
    const { mark, isDone } = loadUtils();
    mark('act-123');
    expect(isDone('act-123')).toBe(true);
  });

  it('protege por 7 dias — ainda protegido pouco antes de completar 7 dias', () => {
    const { mark, isDone } = loadUtils();
    mark('act-123');
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 - 1000);
    expect(isDone('act-123')).toBe(true);
  });

  it('expira depois de 7 dias — não protege mais indefinidamente', () => {
    const { mark, isDone } = loadUtils();
    mark('act-123');
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1000);
    expect(isDone('act-123')).toBe(false);
  });

  it('sobrevive a um "reload" — guardado em localStorage, não só em memória (mesmo cenário do bug: conclusão precisa sobreviver a atualizar o CRM)', () => {
    const { mark } = loadUtils();
    mark('act-123');
    const { isDone: isDoneAfterReload } = loadUtils();
    expect(isDoneAfterReload('act-123')).toBe(true);
  });

  it('ids diferentes não se confundem entre si', () => {
    const { mark, isDone } = loadUtils();
    mark('act-A');
    expect(isDone('act-A')).toBe(true);
    expect(isDone('act-B')).toBe(false);
  });

  it('usa uma chave de armazenamento PRÓPRIA, diferente da de exclusão (evita a mesma classe de bug de colisão já corrigida em outro registro)', () => {
    const { mark: markDone } = loadUtils();
    markDone('mesmo-id');
    const rawDeleted = localStorage.getItem('lf_recently_deleted_ids_v1');
    const rawDone = localStorage.getItem('lf_recently_done_act_ids_v1');
    expect(rawDone).not.toBeNull();
    // A marcação de "concluído" não deveria ter afetado o registro de exclusão.
    expect(rawDeleted).toBeNull();
  });
});
