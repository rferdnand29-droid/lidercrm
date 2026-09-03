// @vitest-environment happy-dom
// =====================================================================
// tests/lf-lists-equal-by-id.test.js
// Melhoria de arquitetura (2026-09) — a causa raiz do bug do "tremor"
// (colunas do Kanban tremendo/rolando sozinhas) era uma comparação
// sensível à ordem (JSON.stringify de arrays inteiros) usada pra
// decidir "mudou de verdade?" antes de repintar. Corrigido pra
// _lfListsEqualById, que compara por conteúdo, não por ordem.
//
// Carrega o arquivo-fonte real via eval, não uma cópia — se alguém
// reintroduzir uma comparação sensível a ordem aqui no futuro, este
// teste falha contra o código de produção de verdade.
// =====================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');

function loadUtils() {
  (0, eval)(SRC);
  return window._lfListsEqualById;
}

describe('_lfListsEqualById — comparação por conteúdo, não por ordem (fix do "tremor")', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('mesmos itens, ordem diferente => considera IGUAL (não deve repintar)', () => {
    const equal = loadUtils();
    const a = [{ id: '1', nome: 'A' }, { id: '2', nome: 'B' }, { id: '3', nome: 'C' }];
    const b = [{ id: '3', nome: 'C' }, { id: '1', nome: 'A' }, { id: '2', nome: 'B' }];
    expect(equal(a, b)).toBe(true);
  });

  it('mesma ordem, um campo diferente => considera DIFERENTE (deve repintar)', () => {
    const equal = loadUtils();
    const a = [{ id: '1', nome: 'A' }];
    const b = [{ id: '1', nome: 'A-editado' }];
    expect(equal(a, b)).toBe(false);
  });

  it('tamanhos diferentes => considera DIFERENTE', () => {
    const equal = loadUtils();
    const a = [{ id: '1' }, { id: '2' }];
    const b = [{ id: '1' }];
    expect(equal(a, b)).toBe(false);
  });

  it('id presente em A mas ausente em B, mesmo tamanho total => considera DIFERENTE', () => {
    const equal = loadUtils();
    const a = [{ id: '1' }, { id: '2' }];
    const b = [{ id: '1' }, { id: '3' }];
    expect(equal(a, b)).toBe(false);
  });

  it('duas listas vazias => considera IGUAL', () => {
    const equal = loadUtils();
    expect(equal([], [])).toBe(true);
  });

  it('entrada inválida (null/undefined) não derruba a comparação', () => {
    const equal = loadUtils();
    expect(equal(null, undefined)).toBe(true); // ambos viram [] internamente
    expect(equal(null, [{ id: '1' }])).toBe(false);
  });
});

describe('_lfListsEqualById — correção 2026-10-08: ordem das CHAVES dentro do objeto, não só ordem dos itens no array', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('REGRESSÃO EXPLÍCITA: mesmo cartão, chaves em ordem diferente (round-trip pelo servidor) => considera IGUAL, não repinta', () => {
    const equal = loadUtils();
    const a = [{ id: '1', col: 'novo', name: 'Fulano', valor: 500, updatedAt: '2026-01-01' }];
    const b = [{ updatedAt: '2026-01-01', valor: 500, name: 'Fulano', col: 'novo', id: '1' }];
    expect(equal(a, b)).toBe(true);
  });

  it('continua detectando diferença real mesmo com chaves reordenadas', () => {
    const equal = loadUtils();
    const a = [{ id: '1', col: 'novo', valor: 500 }];
    const b = [{ valor: 999, col: 'novo', id: '1' }]; // valor genuinamente diferente
    expect(equal(a, b)).toBe(false);
  });

  it('funciona em objetos aninhados (ex.: card.activities), não só no nível superior', () => {
    const equal = loadUtils();
    const a = [{ id: '1', activities: [{ id: 'a1', done: true, tipo: 'ligacao' }] }];
    const b = [{ id: '1', activities: [{ tipo: 'ligacao', done: true, id: 'a1' }] }]; // mesma coisa, ordem diferente
    expect(equal(a, b)).toBe(true);
  });

  it('detecta diferença real dentro de objeto aninhado, independente da ordem das chaves', () => {
    const equal = loadUtils();
    const a = [{ id: '1', activities: [{ id: 'a1', done: false }] }];
    const b = [{ id: '1', activities: [{ done: true, id: 'a1' }] }]; // done genuinamente diferente
    expect(equal(a, b)).toBe(false);
  });

  it('campo com valor undefined explícito é tratado igual a campo ausente (mesma semântica do JSON.stringify nativo)', () => {
    const equal = loadUtils();
    const a = [{ id: '1', nome: 'X', extra: undefined }];
    const b = [{ id: '1', nome: 'X' }]; // sem o campo "extra" de jeito nenhum
    expect(equal(a, b)).toBe(true);
  });

  it('arrays com undefined viram null, igual o JSON.stringify nativo faz — não quebra a comparação', () => {
    const equal = loadUtils();
    const a = [{ id: '1', lista: [1, undefined, 3] }];
    const b = [{ id: '1', lista: [1, undefined, 3] }];
    expect(equal(a, b)).toBe(true);
  });
});
