// =====================================================================
// tests/generate-bundle-preview.test.js
// Melhoria de arquitetura (2026-09-20, item 5 do plano de estabilidade
// — segundo passo seguro do empacotamento). Cobre a lógica de
// identificação de scripts externos (CDN) — que devem ficar de fora
// de qualquer pacote gerado, já que continuam carregando da URL
// externa normalmente.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { isExternal } from '../scripts/generate-bundle-preview.mjs';

describe('generate-bundle-preview — isExternal', () => {
  it('identifica corretamente uma URL https:// como externa', () => {
    expect(isExternal('https://www.gstatic.com/firebasejs/x.js')).toBe(true);
  });

  it('identifica corretamente uma URL protocol-relative (//) como externa', () => {
    expect(isExternal('//cdn.example.com/lib.js')).toBe(true);
  });

  it('REGRESSÃO EXPLÍCITA: não confunde um caminho local que contém "http" no meio com uma URL externa', () => {
    // Achado real ao rodar a auditoria de ordem — um grep ingênuo por
    // "http" confundia src/shared/http/http-client.js (caminho local)
    // com uma URL externa de verdade.
    expect(isExternal('src/shared/http/http-client.js')).toBe(false);
    expect(isExternal('src/shared/http/worker-client.js')).toBe(false);
  });

  it('identifica um caminho local comum como não-externo', () => {
    expect(isExternal('js/kanban.js')).toBe(false);
    expect(isExternal('js/patches/lf-fix-algo-v1-20260101.js')).toBe(false);
  });
});
