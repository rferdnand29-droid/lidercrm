import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const UTILS = readFileSync(resolve(ROOT, 'js/utils.js'), 'utf8');
const PRIORITY_SCREENS = ['chat', 'leads', 'clientes', 'kanban'];

describe('escapeHtml centralizado', () => {
  it('escapa texto e preserva valores falsy válidos', () => {
    const source = UTILS.match(/function escapeHtml\(value\)\{[\s\S]*?\n\}/)?.[0];
    expect(source).toBeTruthy();

    // O helper é uma função pura; avaliá-lo isoladamente evita inicializar o
    // restante do legado (que depende de document/window) neste teste.
    const escapeHtml = Function(`${source}; return escapeHtml;`)();
    expect(escapeHtml(`<img src=x onerror="alert('x')"> & 0`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp; 0',
    );
    expect(escapeHtml(0)).toBe('0');
    expect(escapeHtml(false)).toBe('false');
    expect(escapeHtml(null)).toBe('');
  });

  it('mantém o alias legado apontando para o helper central', () => {
    expect(UTILS).toMatch(/function eH\(value\)\{return escapeHtml\(value\);\}/);
  });
});

describe('telas prioritárias usam o escape central', () => {
  for (const screen of PRIORITY_SCREENS) {
    it(`${screen}.js usa escapeHtml em renderizações`, () => {
      const source = readFileSync(resolve(ROOT, 'js', `${screen}.js`), 'utf8');
      expect(source).toContain('escapeHtml(');
    });
  }
});
