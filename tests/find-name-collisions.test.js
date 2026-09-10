// =====================================================================
// tests/find-name-collisions.test.js
// Melhoria de arquitetura (2026-09-21, item 5 do plano de estabilidade)
// — cobre a detecção de declarações de nível mais externo usada pra
// achar TODAS as colisões de nome entre arquivos, não só a primeira
// que travaria node --check.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { findTopLevelDecls } from '../scripts/find-name-collisions.mjs';

describe('find-name-collisions — findTopLevelDecls', () => {
  it('detecta uma declaração de função no nível mais externo', () => {
    const content = 'function minhaFuncao(){\n  return 1;\n}\n';
    const decls = findTopLevelDecls(content);
    expect(decls).toContainEqual({ name: 'minhaFuncao', kind: 'function' });
  });

  it('detecta uma declaração var simples no nível mais externo', () => {
    const content = 'var minhaVar = 1;\n';
    const decls = findTopLevelDecls(content);
    expect(decls).toContainEqual({ name: 'minhaVar', kind: 'var' });
  });

  it('detecta uma declaração var de nome único (o padrão real encontrado nas 64 colisões desta auditoria)', () => {
    const content = 'var minhaVar = algumValor;\n';
    const decls = findTopLevelDecls(content);
    expect(decls.map((d) => d.name)).toContain('minhaVar');
  });

  it('REGRESSÃO EXPLÍCITA: não confunde função/var indentada (dentro de IIFE) com declaração de nível mais externo', () => {
    const content = `
(function(global){
  function funcaoPrivada(){ return 1; }
  var varPrivada = 2;
})(window);
    `;
    const decls = findTopLevelDecls(content);
    expect(decls.map((d) => d.name)).not.toContain('funcaoPrivada');
    expect(decls.map((d) => d.name)).not.toContain('varPrivada');
  });

  it('reproduz o achado real: mesmo nome como function num arquivo e var noutro conta como colisão', () => {
    const runtimeFile = 'function syncBusy(){ return 1; }\n';
    const orchestratorFile = 'var syncBusy = __storageRuntime.syncBusy;\n';
    const declsA = findTopLevelDecls(runtimeFile);
    const declsB = findTopLevelDecls(orchestratorFile);
    expect(declsA).toContainEqual({ name: 'syncBusy', kind: 'function' });
    expect(declsB).toContainEqual({ name: 'syncBusy', kind: 'var' });
  });
});
