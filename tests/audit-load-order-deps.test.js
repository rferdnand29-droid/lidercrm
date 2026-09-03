// =====================================================================
// tests/audit-load-order-deps.test.js
// Melhoria de arquitetura (2026-09-19, item 5 do plano de estabilidade
// — primeiro passo seguro do empacotamento). Cobre a função central do
// script scripts/audit-load-order-deps.mjs — detecção do padrão
// "encapsula uma função global" (var orig=global.X; ...; global.X=
// função nova). Um teste de regressão explícito cobre o falso positivo
// real já encontrado ao rodar a auditoria pela primeira vez (e.target/
// a.target — propriedades comuns de evento/elemento DOM, não globais
// sendo encapsuladas).
// =====================================================================
import { describe, it, expect } from 'vitest';
import { findWraps } from '../scripts/audit-load-order-deps.mjs';

describe('audit-load-order-deps — findWraps', () => {
  it('detecta corretamente o padrão de encapsulamento real usado no projeto', () => {
    const content = `
      (function(global){
        var orig = global.loadUsersDB;
        global.loadUsersDB = function(){
          var r = orig();
          return r;
        };
      })(window);
    `;
    expect(findWraps(content)).toContain('loadUsersDB');
  });

  it('REGRESSÃO EXPLÍCITA: não confunde e.target/a.target (propriedades de evento/elemento DOM) com encapsulamento de global', () => {
    const content = `
      ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      if (!src.startsWith('data:')) a.target = '_blank';
      var t = e.target;
    `;
    expect(findWraps(content)).toEqual([]);
  });

  it('não detecta uma simples leitura sem reatribuição como encapsulamento', () => {
    const content = `
      var orig = window.algumaFuncao;
      console.log(typeof orig);
    `;
    expect(findWraps(content)).toEqual([]);
  });

  it('detecta múltiplos encapsulamentos no mesmo arquivo', () => {
    const content = `
      var origA = global.funcaoA;
      global.funcaoA = function(){ return origA(); };
      var origB = window.funcaoB;
      window.funcaoB = function(){ return origB(); };
    `;
    const result = findWraps(content);
    expect(result).toContain('funcaoA');
    expect(result).toContain('funcaoB');
  });

  it('não duplica o mesmo nome se aparecer mais de uma vez no mesmo arquivo', () => {
    const content = `
      var orig = global.minhaFuncao;
      global.minhaFuncao = function(){ return orig(); };
      var orig2 = global.minhaFuncao;
      global.minhaFuncao = function(){ return orig2(); };
    `;
    const result = findWraps(content);
    expect(result.filter((x) => x === 'minhaFuncao').length).toBe(1);
  });
});
