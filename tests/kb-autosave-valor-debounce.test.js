// @vitest-environment happy-dom
// =====================================================================
// tests/kb-autosave-valor-debounce.test.js
// Correção de causa raiz real, pedido explícito (2026-10-13) — "as
// etapas/rolante subindo e descendo sozinho ao digitar em detalhes".
//
// Causa raiz: o campo "Valor da Venda" no modal de detalhe do card
// dispara autoSaveKBValor() em CADA TECLA (oninput, não onchange) —
// e essa função chamava renderKBLocal(board) direto, que reconstrói
// o quadro do Kanban INTEIRO do zero. Digitando um valor como
// "1500,50" (8 caracteres), o quadro inteiro era reconstruído 8
// vezes em menos de 1 segundo — a causa real da sensação de "coluna/
// rolagem se mexendo sozinha".
//
// Corrigido com debounce: o salvamento do dado (saveKBFor) continua
// IMEDIATO a cada tecla (preserva a garantia de nunca perder
// informação); só a reconstrução visual (renderKBLocal, a parte
// cara) passa a esperar a digitação pausar por ~600ms.
// =====================================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UTILS_SRC = readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const KANBAN_SRC = readFileSync(path.join(__dirname, '..', 'js', 'kanban.js'), 'utf8');

function extractFunction(src, fnName) {
  var re = new RegExp('function\\s+' + fnName + '\\s*\\(');
  var m = re.exec(src);
  var start = src.indexOf('{', m.index);
  var depth = 0;
  for (var i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(m.index, i + 1); }
  }
}

function setup() {
  document.body.innerHTML = '<input id="det-valor" value="1500"><div id="det-obs-saved"></div>';
  (0, eval)(UTILS_SRC); // dá debounce()/_dbTimers reais

  window._kbDetBoard = 'negocios';
  window._kbDetId = 'card1';
  window._kbDetOwnerUid = 'uid1';
  window.activeUID = vi.fn(() => 'uid1');
  const card = { id: 'card1', valor: 0 };
  window.getKBFor = vi.fn(() => [card]);
  window.saveKBFor = vi.fn(() => true);
  window.renderKBLocal = vi.fn();

  (0, eval)(extractFunction(KANBAN_SRC, 'autoSaveKBValor'));
  return { card, autoSaveKBValor: window.autoSaveKBValor || autoSaveKBValor }; // eslint-disable-line no-undef
}

describe('autoSaveKBValor — debounce na reconstrução visual (fix "quadro se mexendo sozinho")', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('salva o dado (saveKBFor) IMEDIATAMENTE, sem esperar debounce nenhum', () => {
    const { autoSaveKBValor } = setup();
    autoSaveKBValor();
    expect(window.saveKBFor).toHaveBeenCalledTimes(1);
  });

  it('REGRESSÃO EXPLÍCITA: NÃO reconstrói o quadro (renderKBLocal) imediatamente ao chamar uma única vez', () => {
    const { autoSaveKBValor } = setup();
    autoSaveKBValor();
    expect(window.renderKBLocal).not.toHaveBeenCalled();
  });

  it('reconstrói o quadro depois do atraso de debounce', () => {
    const { autoSaveKBValor } = setup();
    autoSaveKBValor();
    vi.advanceTimersByTime(600);
    expect(window.renderKBLocal).toHaveBeenCalledTimes(1);
  });

  it('CENÁRIO REAL: digitar "1500,50" (8 teclas em sequência rápida) salva 8 vezes mas reconstrói o quadro só 1 vez', () => {
    const { autoSaveKBValor } = setup();
    // Simula 8 chamadas rápidas (uma por tecla), cada uma < 600ms da anterior.
    for (let i = 0; i < 8; i++) {
      autoSaveKBValor();
      vi.advanceTimersByTime(80); // digitação rápida, ~80ms entre teclas
    }
    expect(window.saveKBFor).toHaveBeenCalledTimes(8); // dado sempre salvo
    expect(window.renderKBLocal).not.toHaveBeenCalled(); // ainda digitando, não passou 600ms parado
    vi.advanceTimersByTime(600); // agora sim, parou de digitar
    expect(window.renderKBLocal).toHaveBeenCalledTimes(1); // só reconstruiu 1 vez, não 8
  });

  it('se a digitação pausar por mais de 600ms no meio, reconstrói, e reconstrói de novo se voltar a digitar depois', () => {
    const { autoSaveKBValor } = setup();
    autoSaveKBValor();
    vi.advanceTimersByTime(700); // pausa longa — reconstrói
    expect(window.renderKBLocal).toHaveBeenCalledTimes(1);
    autoSaveKBValor(); // volta a digitar
    vi.advanceTimersByTime(700);
    expect(window.renderKBLocal).toHaveBeenCalledTimes(2);
  });
});
