// @vitest-environment happy-dom
// =====================================================================
// tests/kb-scroll-restore-active-scroll-guard.test.js
// Correção de causa raiz real, pedido explícito (2026-10-14) — "a
// etapa treme/mexe sozinha ao rolar pra baixo".
//
// Causa raiz: _kbRestoreScrollState (chamada em toda renderKBLocal —
// sync de 15s, tempo real, autosave) captura a posição de rolagem
// ANTES de redesenhar e força de volta DEPOIS, inclusive um reforço
// 400ms depois. Se esse redesenho coincidir com o usuário rolando
// manualmente uma coluna, a restauração "trava" ela de volta pra
// posição antiga, brigando com o gesto do usuário.
//
// Corrigido rastreando rolagem ativa por coluna (evento scroll, fase
// de captura) — se a coluna teve scroll nos últimos 400ms, a
// restauração não mexe nela.
// =====================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'js', 'kanban.js'), 'utf8');

function extractBlock(src, startMarker, endFnName) {
  var start = src.indexOf(startMarker);
  var endFnStart = src.indexOf('function ' + endFnName, start);
  var braceStart = src.indexOf('{', endFnStart);
  var depth = 0;
  for (var i = braceStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
}

function setupBoard() {
  document.body.innerHTML =
    '<div id="leads-kanban">' +
    '  <div class="kb-col" data-col="novo"><div class="kb-cards">' +
    '    <div class="kb-card" data-id="c1"></div>' +
    '    <div class="kb-card" data-id="c2"></div>' +
    '  </div></div>' +
    '  <div class="kb-col" data-col="tent"><div class="kb-cards">' +
    '    <div class="kb-card" data-id="c3"></div>' +
    '  </div></div>' +
    '</div>';
}

function loadFns() {
  window.__lfKbScrollActivityTrackerInstalled = false;
  // requestAnimationFrame nativo do happy-dom não avança com os
  // temporizadores falsos do teste — troca por um equivalente baseado
  // em setTimeout(fn,0), que os temporizadores falsos conseguem controlar.
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  var block = extractBlock(SRC, '// [FIX 20261014] Rastreia rolagem ATIVA', '_kbRestoreScrollState');
  (0, eval)(block);
  return { capture: window._kbCaptureScrollState || _kbCaptureScrollState, restore: window._kbRestoreScrollState || _kbRestoreScrollState }; // eslint-disable-line no-undef
}

describe('_kbRestoreScrollState — não briga com rolagem manual ativa (fix "treme ao rolar")', () => {
  beforeEach(() => { vi.useFakeTimers(); setupBoard(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sem rolagem ativa: restaura a coluna normalmente pra posição capturada', () => {
    const { capture, restore } = loadFns();
    const state = capture('leads');
    // Simula outra coisa mudando o scrollTop entre a captura e a restauração
    // (ex.: a reconstrução do DOM) — sem intervenção do usuário.
    var cardsEl = document.querySelector('.kb-col[data-col="novo"] .kb-cards');
    cardsEl.scrollTop = 999;
    restore('leads', state);
    vi.advanceTimersByTime(20); // 2x requestAnimationFrame (happy-dom roda síncrono)
    expect(cardsEl.scrollTop).not.toBe(999); // foi restaurado, não ficou no valor "errado"
  });

  it('REGRESSÃO EXPLÍCITA: coluna com rolagem ativa (timestamp registrado há <900ms) NÃO é restaurada, nem pelo reforço de segurança de 400ms', () => {
    const { capture, restore } = loadFns();
    const state = capture('leads');
    var cardsEl = document.querySelector('.kb-col[data-col="novo"] .kb-cards');
    cardsEl.scrollTop = 777;
    window._kbLastScrollTs.set(cardsEl, Date.now());
    restore('leads', state);
    vi.advanceTimersByTime(850); // passa do reforço de 400ms, mas ainda dentro da janela de proteção de 900ms
    expect(cardsEl.scrollTop).toBe(777); // continua onde o usuário rolou, não "travou" de volta
  });

  it('proteção expira depois de 900ms — coluna volta a ser restaurada normalmente', () => {
    const { capture, restore } = loadFns();
    const state = capture('leads');
    var cardsEl = document.querySelector('.kb-col[data-col="novo"] .kb-cards');
    cardsEl.scrollTop = 777;
    window._kbLastScrollTs.set(cardsEl, Date.now());
    vi.advanceTimersByTime(1000); // rolagem "esfriou" — mais de 900ms se passaram
    cardsEl.scrollTop = 999; // outra mudança não relacionada ao usuário
    restore('leads', state);
    vi.advanceTimersByTime(20);
    expect(cardsEl.scrollTop).not.toBe(999); // proteção expirou, restaura normalmente de novo
  });

  it('a proteção é POR COLUNA — rolar uma coluna não afeta a restauração das outras', () => {
    const { capture, restore } = loadFns();
    const state = capture('leads');
    var col1=document.querySelector('.kb-col[data-col="novo"] .kb-cards');
    var col2=document.querySelector('.kb-col[data-col="tent"] .kb-cards');
    col1.scrollTop=777; window._kbLastScrollTs.set(col1,Date.now()); // só a coluna 1 rolada
    col2.scrollTop=999; // coluna 2 mudou por outro motivo, sem rastro de rolagem do usuário
    restore('leads', state);
    vi.advanceTimersByTime(20);
    expect(col1.scrollTop).toBe(777); // protegida, não mexeu
    expect(col2.scrollTop).not.toBe(999); // não protegida, foi restaurada normalmente
  });
});
