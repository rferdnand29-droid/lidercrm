// @vitest-environment happy-dom
// =====================================================================
// tests/lf-merge-activities-mirror-protection.test.js
// Correção de causa raiz real (2026-10-08) — "atividade concluída
// volta a aparecer como atrasada" depois de uma sincronização de
// kanban em segundo plano.
//
// Investigação (não a causa que um documento externo apontava — esse
// caminho já estava protegido): _mergeKeepLocalOnly decide qual
// versão do CARD INTEIRO vence (servidor ou local) só pelo updatedAt
// do card — sem nenhuma relação com o estado de cada atividade dentro
// de card.activities. Se o servidor vence (updatedAt dele igual ou
// mais novo, por QUALQUER motivo, nem precisa ser sobre a atividade),
// o card.activities inteiro dele substitui o local — incluindo
// qualquer atividade que o servidor ainda não processou como
// concluída (a conclusão é local-first, o PUT é assíncrono).
//
// Corrigido com o mesmo padrão já comprovado (_lfMarkRecentlyDeleted/
// _lfIsRecentlyDeleted, 2026-08-21): um registro persistente
// (_lfMarkRecentlyDone/_lfIsRecentlyDone, js/utils.js) que blinda a
// atividade recém-concluída contra reverter, não importa de qual lado
// (local ou servidor) o card em si vença a fusão.
//
// Carrega o arquivo-fonte real via eval — se a proteção "vazar" no
// futuro, este teste é o primeiro lugar que deveria acusar o problema.
// =====================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_SRC = readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
const UTILS_SRC = readFileSync(path.join(__dirname, '..', 'js', 'utils.js'), 'utf8');
const HELPERS_SRC = readFileSync(path.join(__dirname, '..', 'src', 'modules', 'kanban', 'runtime', 'kanban-helpers.js'), 'utf8');

function loadMerge() {
  window.LiderCRM = window.LiderCRM || {};
  (0, eval)(STORAGE_SRC);
  (0, eval)(UTILS_SRC);
  (0, eval)(HELPERS_SRC);
  return window._mergeKeepLocalOnly;
}

describe('_mergeKeepLocalOnly — protege card.activities contra reverter conclusão (fix "atividade eternamente atrasada")', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('REGRESSÃO EXPLÍCITA: servidor vence o card (updatedAt mais novo) mas atividade foi marcada "concluída recentemente" => done:true é preservado', () => {
    const merge = loadMerge();
    window._lfMarkRecentlyDone('act-1');

    const local = [{
      id: 'card-1', name: 'Ana', updatedAt: '2026-10-08T10:00:00.000Z',
      activities: [{ id: 'act-1', desc: 'Ligar', done: true, doneAt: '2026-10-08T10:00:00.000Z' }],
    }];
    // Servidor tem updatedAt MAIS NOVO (por qualquer outro motivo, não
    // relacionado à atividade) — venceria a fusão do card inteiro sem
    // a correção, trazendo de volta done:false.
    const server = [{
      id: 'card-1', name: 'Ana', updatedAt: '2026-10-08T10:00:05.000Z',
      activities: [{ id: 'act-1', desc: 'Ligar', done: false }],
    }];

    const merged = merge(server, local);
    const card = merged.find((c) => c.id === 'card-1');
    const act = card.activities.find((a) => a.id === 'act-1');
    expect(act.done).toBe(true);
  });

  it('sem NENHUM sinal de conclusão (nem registro, nem cópia local done) => comportamento antigo se mantém, servidor vence o card inteiro', () => {
    const merge = loadMerge();
    // Nenhum _lfMarkRecentlyDone chamado, e a cópia local também já
    // está done:false — nenhum sinal de proteção deveria disparar.
    const local = [{
      id: 'card-1', updatedAt: '2026-10-08T10:00:00.000Z',
      activities: [{ id: 'act-1', done: false }],
    }];
    const server = [{
      id: 'card-1', updatedAt: '2026-10-08T10:00:05.000Z',
      activities: [{ id: 'act-1', done: false }],
    }];
    const merged = merge(server, local);
    const act = merged[0].activities.find((a) => a.id === 'act-1');
    expect(act.done).toBe(false);
  });

  it('também preserva done:true quando a cópia LOCAL do card já tem a atividade concluída, mesmo sem chamada explícita a _lfMarkRecentlyDone', () => {
    const merge = loadMerge();
    const local = [{
      id: 'card-1', updatedAt: '2026-10-08T10:00:00.000Z',
      activities: [{ id: 'act-1', done: true, doneAt: '2026-10-08T09:59:00.000Z' }],
    }];
    const server = [{
      id: 'card-1', updatedAt: '2026-10-08T10:00:05.000Z',
      activities: [{ id: 'act-1', done: false }],
    }];
    const merged = merge(server, local);
    const act = merged[0].activities.find((a) => a.id === 'act-1');
    expect(act.done).toBe(true);
  });

  it('não mexe em atividades que já estão done:true nos dois lados (sem trabalho desnecessário)', () => {
    const merge = loadMerge();
    const local = [{ id: 'card-1', updatedAt: '2026-10-08T10:00:00.000Z', activities: [{ id: 'act-1', done: true }] }];
    const server = [{ id: 'card-1', updatedAt: '2026-10-08T10:00:05.000Z', activities: [{ id: 'act-1', done: true, doneAt: '2026-10-08T09:00:00.000Z' }] }];
    const merged = merge(server, local);
    // Servidor já tinha done:true — usa a versão dele (não sobrescreve doneAt à toa).
    expect(merged[0].activities[0].done).toBe(true);
    expect(merged[0].activities[0].doneAt).toBe('2026-10-08T09:00:00.000Z');
  });

  it('não afeta outras atividades do mesmo card que não foram marcadas como concluídas', () => {
    const merge = loadMerge();
    window._lfMarkRecentlyDone('act-1');
    const local = [{
      id: 'card-1', updatedAt: '2026-10-08T10:00:00.000Z',
      activities: [
        { id: 'act-1', done: true },
        { id: 'act-2', done: false },
      ],
    }];
    const server = [{
      id: 'card-1', updatedAt: '2026-10-08T10:00:05.000Z',
      activities: [
        { id: 'act-1', done: false },
        { id: 'act-2', done: false },
      ],
    }];
    const merged = merge(server, local);
    const acts = merged[0].activities;
    expect(acts.find((a) => a.id === 'act-1').done).toBe(true);
    expect(acts.find((a) => a.id === 'act-2').done).toBe(false); // não marcada — comportamento normal
  });

  it('card sem campo activities (outros tipos de entidade que usam a mesma fusão, ex.: clientes) não quebra', () => {
    const merge = loadMerge();
    const local = [{ id: 'c1', nome: 'Cliente A', updatedAt: '2026-10-08T10:00:00.000Z' }];
    const server = [{ id: 'c1', nome: 'Cliente A', updatedAt: '2026-10-08T10:00:05.000Z' }];
    expect(() => merge(server, local)).not.toThrow();
  });

  it('atividade marcada como concluída recentemente, mas que não existe em nenhum dos dois cards, não quebra nada', () => {
    const merge = loadMerge();
    window._lfMarkRecentlyDone('act-fantasma');
    const local = [{ id: 'card-1', updatedAt: '2026-10-08T10:00:00.000Z', activities: [{ id: 'act-1', done: false }] }];
    const server = [{ id: 'card-1', updatedAt: '2026-10-08T10:00:05.000Z', activities: [{ id: 'act-1', done: false }] }];
    const merged = merge(server, local);
    expect(merged[0].activities[0].done).toBe(false);
  });
});
