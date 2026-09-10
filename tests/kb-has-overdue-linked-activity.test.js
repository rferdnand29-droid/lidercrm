// @vitest-environment happy-dom
// =====================================================================
// tests/kb-has-overdue-linked-activity.test.js
// Correção de causa raiz real, achado do diagnóstico 2026-09-01
// (Problema 2) — _kbHasOverdueLinkedActivity não consultava o registro
// _lfIsRecentlyDone (existente desde 2026-10-08, mas nunca usado
// aqui): uma corrida de sincronização podia trazer done:false
// desatualizado e o filtro "atrasadas" reviver uma atividade já
// concluída localmente.
//
// Extrai a função real de js/kanban.js (pequena e autocontida, sem
// literais de string com chaves — diferente de _buildKB, que é grande
// demais pra extração por contagem de chaves funcionar direito) e
// avalia junto com js/utils.js real (pra usar a implementação de
// verdade de _isScheduledExpired e _lfMarkRecentlyDone/
// _lfIsRecentlyDone, não uma reimplementação).
// =====================================================================
import { describe, it, expect, beforeEach } from 'vitest';
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

function loadFn() {
  (0, eval)(UTILS_SRC); // dá _isScheduledExpired, _lfMarkRecentlyDone, _lfIsRecentlyDone reais
  (0, eval)(extractFunction(KANBAN_SRC, '_kbHasOverdueLinkedActivity'));
  return _kbHasOverdueLinkedActivity; // eslint-disable-line no-undef
}

const NOW = Date.now();
const PAST = new Date(NOW - 60 * 60 * 1000).toISOString(); // 1h atrás — vencida
const FUTURE = new Date(NOW + 60 * 60 * 1000).toISOString(); // 1h no futuro — não vencida

describe('_kbHasOverdueLinkedActivity — fonte central (getActivitiesLocalFor)', () => {
  beforeEach(() => { localStorage.clear(); });

  it('caminho feliz: atividade vencida e não concluída => true', () => {
    global.getActivitiesLocalFor = () => [{ id: 'a1', clientId: 'card1', board: 'leads', done: false, scheduledAt: PAST }];
    const fn = loadFn();
    expect(fn({ id: 'card1', col: 'novo' }, 'uid1', 'leads')).toBe(true);
  });

  it('REGRESSÃO EXPLÍCITA: atividade marcada "concluída recentemente" (_lfIsRecentlyDone) NUNCA conta como atrasada, mesmo com done:false desatualizado', () => {
    global.getActivitiesLocalFor = () => [{ id: 'a1', clientId: 'card1', board: 'leads', done: false, scheduledAt: PAST }];
    global._lfMarkRecentlyDone('a1');
    const fn = loadFn();
    expect(fn({ id: 'card1', col: 'novo' }, 'uid1', 'leads')).toBe(false);
  });

  it('atividade concluída (done:true) não conta como atrasada', () => {
    global.getActivitiesLocalFor = () => [{ id: 'a1', clientId: 'card1', board: 'leads', done: true, scheduledAt: PAST }];
    const fn = loadFn();
    expect(fn({ id: 'card1', col: 'novo' }, 'uid1', 'leads')).toBe(false);
  });

  it('atividade não vencida (futuro) não conta como atrasada', () => {
    global.getActivitiesLocalFor = () => [{ id: 'a1', clientId: 'card1', board: 'leads', done: false, scheduledAt: FUTURE }];
    const fn = loadFn();
    expect(fn({ id: 'card1', col: 'novo' }, 'uid1', 'leads')).toBe(false);
  });

  it('card em etapa terminal nunca conta como atrasado, mesmo com atividade vencida', () => {
    global.getActivitiesLocalFor = () => [{ id: 'a1', clientId: 'card1', board: 'leads', done: false, scheduledAt: PAST }];
    const fn = loadFn();
    expect(fn({ id: 'card1', col: 'conv' }, 'uid1', 'leads')).toBe(false);
  });
});

describe('_kbHasOverdueLinkedActivity — fallback legado (card.activities)', () => {
  beforeEach(() => { localStorage.clear(); global.getActivitiesLocalFor = undefined; });

  it('caminho feliz: espelho legado com atividade vencida e não concluída => true', () => {
    const fn = loadFn();
    const card = { id: 'card1', col: 'novo', activities: [{ id: 'a1', done: false, scheduledAt: PAST }] };
    expect(fn(card, 'uid1', 'leads')).toBe(true);
  });

  it('REGRESSÃO EXPLÍCITA: _lfIsRecentlyDone também protege o fallback legado', () => {
    global._lfMarkRecentlyDone('a1');
    const fn = loadFn();
    const card = { id: 'card1', col: 'novo', activities: [{ id: 'a1', done: false, scheduledAt: PAST }] };
    expect(fn(card, 'uid1', 'leads')).toBe(false);
  });

  it('REGRESSÃO EXPLÍCITA: doneAt preenchido também protege, mesmo com done ausente/false (sinal defensivo extra)', () => {
    const fn = loadFn();
    const card = { id: 'card1', col: 'novo', activities: [{ id: 'a1', done: false, doneAt: new Date().toISOString(), scheduledAt: PAST }] };
    expect(fn(card, 'uid1', 'leads')).toBe(false);
  });
});
