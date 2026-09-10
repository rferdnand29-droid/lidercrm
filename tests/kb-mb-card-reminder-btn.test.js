// =====================================================================
// tests/kb-mb-card-reminder-btn.test.js
// Correção de causa raiz real, achado do diagnóstico 2026-09-01
// (Problema 1) — o botão de lembrete existia no template desktop
// (_buildKB, corrigido em 2026-10-09) mas NUNCA existiu no template
// separado usado só no mobile (.mb-card), desde o redesenho de
// 2026-08-05 que reorganizou esse card e omitiu o botão.
//
// Mesmo padrão de teste já usado pro caso desktop
// (tests/kb-act-btn-late-indicator.test.js) — verifica o código-fonte
// real, não uma cópia, já que invocar a função de renderização
// completa exigiria simular praticamente todo o módulo kanban.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.join(__dirname, '..', 'js', 'kanban.js'), 'utf8');
const CSS_COMPACT = readFileSync(path.join(__dirname, '..', 'css', 'lf-mobile-leads-compact-v1.css'), 'utf8');

describe('Card mobile (.mb-card) — botão de lembrete conectado ao indicador de atraso', () => {
  it('_mbActLate é calculado via _kbHasOverdueLinkedActivity, mesma função já usada no desktop', () => {
    expect(SRC).toMatch(/_mbActLate\s*=.*_kbHasOverdueLinkedActivity/);
  });

  it('REGRESSÃO EXPLÍCITA: o botão de lembrete mobile é gerado na MESMA linha que referencia _mbActLate', () => {
    const linesWithReminder = SRC.split('\n').filter((l) => l.includes('mb-action-btn reminder'));
    expect(linesWithReminder.length).toBeGreaterThan(0);
    const line = linesWithReminder.find((l) => l.includes('_mbActLate'));
    expect(line).toBeDefined();
  });

  it('a classe "late" é aplicada condicionalmente a _mbActLate', () => {
    const line = SRC.split('\n').find((l) => l.includes('mb-action-btn reminder') && l.includes('_mbActLate'));
    expect(line).toMatch(/_mbActLate\?['"]?\s*late/);
  });

  it('o botão mobile chama openQuickActivity, mesma função já usada no desktop e já existente/compartilhada', () => {
    const line = SRC.split('\n').find((l) => l.includes('mb-action-btn reminder'));
    expect(line).toContain('openQuickActivity()');
    expect(line).toContain('_kbDetId');
    expect(line).toContain('_kbDetBoard');
  });

  it('o botão mobile tem event.stopPropagation() — não deveria abrir o detalhe do card ao clicar nele', () => {
    const line = SRC.split('\n').find((l) => l.includes('mb-action-btn reminder'));
    expect(line).toContain('event.stopPropagation()');
  });
});

describe('CSS — variante do botão de lembrete mobile, com a mesma especificidade das regras que já funcionam', () => {
  it('.mb-action-btn.reminder existe no arquivo com maior peso (mesmo padrão de .call/.whatsapp)', () => {
    expect(CSS_COMPACT).toMatch(/#pg-leads \.mb-action-btn\.reminder[\s\S]{0,200}!important/);
  });

  it('.mb-action-btn.reminder.late existe, com cor de alerta diferente do estado normal', () => {
    expect(CSS_COMPACT).toMatch(/\.mb-action-btn\.reminder\.late[\s\S]{0,200}var\(--rl\)/);
  });

  it('REGRESSÃO EXPLÍCITA: a regra do lembrete vem DEPOIS da regra genérica .mb-action-btn (sem !important, perderia)', () => {
    const genericIdx = CSS_COMPACT.indexOf('#pg-leads .mb-action-btn,\n  #pg-negocios .mb-action-btn {');
    const reminderIdx = CSS_COMPACT.indexOf('.mb-action-btn.reminder,');
    expect(genericIdx).toBeGreaterThan(-1);
    expect(reminderIdx).toBeGreaterThan(genericIdx);
  });
});
