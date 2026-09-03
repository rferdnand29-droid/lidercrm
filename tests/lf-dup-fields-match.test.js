// @vitest-environment happy-dom
// =====================================================================
// tests/lf-dup-fields-match.test.js
// Melhoria de arquitetura (2026-09) — cobre a regra de detecção de
// duplicados (_dupFieldsMatch), pedida explicitamente pra focar no
// telefone: nome batendo sozinho NUNCA conta como duplicado; telefone
// batendo SEMPRE conta, mesmo com nomes diferentes ou um dos dois sem
// nome. Também cobre a comparação entre boards diferentes (Lead x
// Negócio), que era uma restrição removida numa correção anterior.
//
// Carrega o arquivo-fonte real via eval (js/storage.js + js/kanban.js,
// na mesma ordem que index.html carrega) — sem isso, um teste contra
// uma cópia não pegaria uma regressão no arquivo de verdade.
// =====================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_SRC = readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
const KANBAN_SRC = readFileSync(path.join(__dirname, '..', 'js', 'kanban.js'), 'utf8');

function loadDupFieldsMatch() {
  // js/kanban.js usa __kanbanRuntime.X||default em tudo que vem de
  // outros módulos — carrega sem travar mesmo sem kanban-helpers.js,
  // já que _dupFieldsMatch/_dupConfigGet só dependem de sg/ss
  // (js/storage.js), não de nada do __kanbanRuntime.
  (0, eval)(STORAGE_SRC);
  (0, eval)(KANBAN_SRC);
  return window._dupFieldsMatch;
}

describe('_dupFieldsMatch — telefone é a única condição válida (pedido explícito)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('mesmo telefone, nomes diferentes => duplicado', () => {
    const match = loadDupFieldsMatch();
    const a = { name: 'João', tel: '65999887766' };
    const b = { name: 'J. Silva', tel: '65999887766' };
    expect(match(a, b, 'leads')).toBe(true);
  });

  it('mesmo telefone, um dos dois SEM nome => ainda assim duplicado', () => {
    const match = loadDupFieldsMatch();
    const a = { name: '', tel: '65999887766' };
    const b = { name: 'Katia', tel: '65999887766' };
    expect(match(a, b, 'leads')).toBe(true);
  });

  it('mesmo nome, telefones diferentes => NÃO é duplicado (o caso que motivou a correção)', () => {
    const match = loadDupFieldsMatch();
    const a = { name: 'Gustavo', tel: '65999887766' };
    const b = { name: 'Gustavo', tel: '65911112222' };
    expect(match(a, b, 'leads')).toBe(false);
  });

  it('telefone com formatação diferente (parênteses/traço/espaço) ainda bate', () => {
    const match = loadDupFieldsMatch();
    const a = { name: 'A', tel: '(65) 99988-7766' };
    const b = { name: 'B', tel: '65999887766' };
    expect(match(a, b, 'leads')).toBe(true);
  });

  it('telefone curto demais (menos de 8 dígitos) não conta como duplicado', () => {
    const match = loadDupFieldsMatch();
    const a = { name: 'A', tel: '1234' };
    const b = { name: 'B', tel: '1234' };
    expect(match(a, b, 'leads')).toBe(false);
  });

  it('compara Lead com Negócio (boards diferentes) normalmente — restrição removida numa correção anterior', () => {
    const match = loadDupFieldsMatch();
    const lead = { name: 'Ana', tel: '65988887777' };
    const negocio = { name: 'Ana Caroline', tel: '65988887777' };
    expect(match(lead, negocio, 'leads', 'negocios')).toBe(true);
  });

  it('sem telefone em nenhum dos dois => nunca duplicado', () => {
    const match = loadDupFieldsMatch();
    const a = { name: 'A', tel: '' };
    const b = { name: 'B', tel: '' };
    expect(match(a, b, 'leads')).toBe(false);
  });
});
