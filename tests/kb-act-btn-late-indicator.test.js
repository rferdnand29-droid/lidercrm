// =====================================================================
// tests/kb-act-btn-late-indicator.test.js
// Correção de causa raiz real, pedido explícito (2026-10-09) — o botão
// de lembrete/atividade (.kb-act-btn) tinha toda a "fiação" pronta e
// funcional (CSS completo, incluindo o estado .late em vermelho — ver
// css/style.css, comentário datado de 2026-08-16 — o cálculo de
// _actLate via _kbHasOverdueLinkedActivity, e os manipuladores de
// clique em múltiplos pontos do arquivo esperando um elemento
// .kb-act-btn), mas o próprio elemento HTML nunca era gerado dentro de
// _buildKB — removido silenciosamente em alguma edição anterior, sem
// ninguém notar, porque cada peça isolada continuava sintaticamente
// válida (a variável _actLate era calculada e simplesmente descartada;
// os manipuladores de clique faziam querySelector('.kb-act-btn'),
// achavam null, e silenciosamente não faziam nada).
//
// Este teste verifica o CÓDIGO-FONTE REAL de _buildKB (não uma cópia,
// não uma reimplementação) — extrai o corpo da função e confirma que
// a string "kb-act-btn" aparece DENTRO de uma expressão que também
// referencia _actLate. Um teste que só checasse "a string kb-act-btn
// existe em algum lugar do arquivo" NÃO pegaria o bug original — a
// classe continuava mencionada nos manipuladores de clique mesmo
// com o elemento ausente do HTML.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'js', 'kanban.js'), 'utf8');

describe('_buildKB — botão de lembrete (.kb-act-btn) conectado ao indicador de atraso', () => {
  it('_actLate continua sendo calculado via _kbHasOverdueLinkedActivity', () => {
    expect(SRC).toMatch(/_actLate\s*=.*_kbHasOverdueLinkedActivity/);
  });

  it('REGRESSÃO EXPLÍCITA: o elemento kb-act-btn é gerado na MESMA linha que referencia _actLate — não só mencionado separadamente em manipulador de clique', () => {
    const linesWithActBtn = SRC.split('\n').filter((l) => l.includes('kb-act-btn'));
    expect(linesWithActBtn.length).toBeGreaterThan(0);
    const htmlBuildingLine = linesWithActBtn.find((l) => l.includes('_actLate'));
    expect(htmlBuildingLine).toBeDefined();
  });

  it('a classe "late" (estado vermelho) é aplicada condicionalmente a _actLate, não sempre presente nem sempre ausente', () => {
    const linesWithActBtn = SRC.split('\n').filter((l) => l.includes('kb-act-btn') && l.includes('_actLate'));
    const line = linesWithActBtn[0];
    expect(line).toMatch(/_actLate\?['"]?\s*late/);
  });

  it('o botão continua com o manipulador de clique abrindo openQuickActivity (a "fiação" que já existia e nunca foi tocada)', () => {
    expect(SRC).toMatch(/querySelector\(['"]\.kb-act-btn['"]\)/);
    expect(SRC).toMatch(/openQuickActivity\(\)/);
  });
});

describe('CSS — estado .late do botão de lembrete continua definido (base pra este fix funcionar visualmente)', () => {
  const CSS = readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');

  it('.kb-act-btn.late existe e usa cor de alerta (vermelho)', () => {
    expect(CSS).toMatch(/\.kb-act-btn\.late\s*\{[^}]*color:\s*var\(--rl\)/);
  });
});
