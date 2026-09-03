// @vitest-environment happy-dom
// =====================================================================
// tests/lf-sync-status.test.js
// Melhoria de arquitetura (2026-09-18, item 4 do plano de estabilidade)
// — cobre js/lf-sync-status.js, a camada de observabilidade unificada
// dos 4 mecanismos de sincronização. O requisito mais importante deste
// arquivo é NÃO MUDAR COMPORTAMENTO NENHUM — só observar. Este teste
// garante isso: _lfListsEqualById continua retornando exatamente o
// mesmo valor de antes de ser encapsulada.
// =====================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function src(rel) { return readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
const UTILS_SRC = src('js/utils.js');
const STATUS_SRC = src('js/lf-sync-status.js');

function loadAll() {
  window.LiderCRM = window.LiderCRM || {};
  (0, eval)(UTILS_SRC);
  (0, eval)(STATUS_SRC);
}

describe('lfSyncStatus — observa sem alterar comportamento (item 4 do plano de estabilidade)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('_lfListsEqualById continua retornando o mesmo resultado depois de encapsulada', () => {
    loadAll();
    const a = [{ id: '1' }, { id: '2' }];
    const bEqual = [{ id: '2' }, { id: '1' }];
    const bDiff = [{ id: '1' }, { id: '3' }];
    expect(window._lfListsEqualById(a, bEqual)).toBe(true);
    expect(window._lfListsEqualById(a, bDiff)).toBe(false);
  });

  it('lfSyncStatus() existe e retorna um objeto com os 4 mecanismos', () => {
    loadAll();
    const status = window.lfSyncStatus();
    expect(status).toHaveProperty('sondagemPeriodica');
    expect(status).toHaveProperty('broadcastChannel');
    expect(status).toHaveProperty('filaDeRetentativas');
    expect(status).toHaveProperty('protecaoContraExclusaoFantasma');
  });

  it('registra corretamente quando a sondagem detecta uma mudança', () => {
    loadAll();
    window._lfListsEqualById([{ id: '1' }], [{ id: '2' }]); // diferente
    const status = window.lfSyncStatus();
    expect(status.sondagemPeriodica.detectouMudancaUltimaVez).toBe(true);
    expect(status.sondagemPeriodica.totalExecucoes).toBeGreaterThanOrEqual(1);
  });

  it('lê corretamente o tamanho da fila de retentativas (só leitura, sem escrever nada)', () => {
    loadAll();
    window.LiderCRM.offline = { retryQueue: { list: () => [{ id: 'a' }, { id: 'b' }] } };
    const status = window.lfSyncStatus();
    expect(status.filaDeRetentativas.itensPendentes).toBe(2);
  });

  it('lê corretamente a contagem de ids protegidos contra ressurreição', () => {
    loadAll();
    window._lfMarkRecentlyDeleted('lead-1');
    window._lfMarkRecentlyDeleted('lead-2');
    const status = window.lfSyncStatus();
    expect(status.protecaoContraExclusaoFantasma.idsProtegidosAgora).toBe(2);
  });

  it('instalar duas vezes não duplica o encapsulamento (idempotente)', () => {
    loadAll();
    (0, eval)(STATUS_SRC); // carrega de novo
    const a = [{ id: '1' }];
    const b = [{ id: '1' }];
    expect(window._lfListsEqualById(a, b)).toBe(true); // ainda funciona normal
  });
});
