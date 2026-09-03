// @vitest-environment happy-dom
// =====================================================================
// tests/lf-merge-order-stability.test.js
// Melhoria de arquitetura / correção de bug real (2026-09-15) — cobre a
// causa raiz do "tremor permanente" do Kanban (relatado com vídeo):
// _mergeKeepLocalOnly reconstruía a lista na ordem que o SERVIDOR
// devolvia os cards, não na ordem local já exibida na tela. Se a
// consulta ao banco não garante ordem estável entre buscas sucessivas
// (comum sem ORDER BY explícito), a mesma sincronização de 15s podia
// devolver os MESMOS cards em ordem ligeiramente diferente — fazendo
// cards sem manualOrder (a maioria) trocarem de posição visual
// sozinhos, sem nenhuma mudança real de dado.
//
// Carrega o arquivo-fonte real via eval — se a ordem "vazar" de volta
// pra seguir o servidor no futuro, este teste é o primeiro lugar que
// deveria acusar o problema.
// =====================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_SRC = readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
const UTILS_SRC = readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const HELPERS_SRC = readFileSync(path.join(__dirname, '..', 'src', 'modules', 'kanban', 'runtime', 'kanban-helpers.js'), 'utf8');

function loadMerge() {
  window.LiderCRM = window.LiderCRM || {};
  (0, eval)(STORAGE_SRC);
  (0, eval)(UTILS_SRC);
  (0, eval)(HELPERS_SRC);
  return window._mergeKeepLocalOnly;
}

describe('_mergeKeepLocalOnly — preserva a ordem LOCAL (fix do "tremor permanente")', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('REGRESSÃO EXPLÍCITA: mesmos cards, servidor devolve em ordem diferente => ordem final não muda', () => {
    const merge = loadMerge();
    const local = [
      { id: 'A', name: 'Ana', createdAt: '2026-09-01T10:00:00.000Z' },
      { id: 'B', name: 'Bruno', createdAt: '2026-09-01T10:00:00.000Z' },
      { id: 'C', name: 'Carla', createdAt: '2026-09-01T10:00:00.000Z' },
    ];
    // Servidor devolve os MESMOS 3 cards, só que em ordem diferente —
    // cenário plausível de uma consulta sem ORDER BY garantido.
    const serverOrderVariant1 = [local[2], local[0], local[1]]; // C, A, B
    const serverOrderVariant2 = [local[1], local[2], local[0]]; // B, C, A

    const merged1 = merge(serverOrderVariant1, local);
    const merged2 = merge(serverOrderVariant2, local);

    const ids1 = merged1.map((c) => c.id);
    const ids2 = merged2.map((c) => c.id);

    // A ordem final deve ser a mesma nas duas vezes (a ordem LOCAL
    // original: A, B, C) — não a ordem que cada variante do servidor
    // trouxe.
    expect(ids1).toEqual(['A', 'B', 'C']);
    expect(ids2).toEqual(['A', 'B', 'C']);
  });

  it('card novo (só no servidor, ainda sem posição local) entra no final', () => {
    const merge = loadMerge();
    const local = [
      { id: 'A', name: 'Ana' },
      { id: 'B', name: 'Bruno' },
    ];
    const server = [
      { id: 'A', name: 'Ana' },
      { id: 'B', name: 'Bruno' },
      { id: 'D', name: 'Diego' }, // novo, chegou agora
    ];
    const merged = merge(server, local);
    expect(merged.map((c) => c.id)).toEqual(['A', 'B', 'D']);
  });

  it('card local ainda não sincronizado (não existe no servidor) é preservado no final', () => {
    const merge = loadMerge();
    const local = [
      { id: 'A', name: 'Ana' },
      { id: 'X', name: 'Recém-criado, ainda subindo' },
    ];
    const server = [{ id: 'A', name: 'Ana' }];
    const merged = merge(server, local);
    expect(merged.map((c) => c.id)).toContain('X');
    expect(merged.length).toBe(2);
  });

  it('versão local mais recente (updatedAt maior) vence, mas mantém a posição local', () => {
    const merge = loadMerge();
    const local = [
      { id: 'A', name: 'Ana', updatedAt: '2026-09-02T00:00:00.000Z' },
      { id: 'B', name: 'Bruno-EDITADO', updatedAt: '2026-09-05T00:00:00.000Z' },
    ];
    const server = [
      { id: 'B', name: 'Bruno-desatualizado', updatedAt: '2026-09-01T00:00:00.000Z' },
      { id: 'A', name: 'Ana', updatedAt: '2026-09-02T00:00:00.000Z' },
    ];
    const merged = merge(server, local);
    expect(merged.map((c) => c.id)).toEqual(['A', 'B']); // ordem local preservada
    expect(merged.find((c) => c.id === 'B').name).toBe('Bruno-EDITADO'); // versão mais recente venceu
  });

  it('item excluído recentemente não ressuscita, mesmo vindo do servidor', () => {
    const merge = loadMerge();
    window._lfMarkRecentlyDeleted('Z');
    const local = [{ id: 'A', name: 'Ana' }];
    const server = [{ id: 'A', name: 'Ana' }, { id: 'Z', name: 'Zeca-excluido' }];
    const merged = merge(server, local);
    expect(merged.map((c) => c.id)).not.toContain('Z');
  });
});
