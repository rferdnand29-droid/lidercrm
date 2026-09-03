// =====================================================================
// tests/kanban-controller-authz.test.js
// Auditoria de CORREÇÃO da autorização (2026-09-29) — não "existe uma
// checagem", mas "a checagem faz a coisa certa em todo caso". Cobre
// assertKanbanReadOwner/assertKanbanWriteOwner/canCrossOwnerKanban —
// o portão de entrada pra "ler/escrever o kanban de outra pessoa",
// que nunca tinha um teste automatizado sequer antes desta auditoria,
// apesar de ser exatamente a mesma classe de checagem cuja AUSÊNCIA
// em outras rotas já causou 3 vulnerabilidades reais corrigidas em
// entregas anteriores desta sessão.
// =====================================================================
import { describe, it, expect } from 'vitest';
import {
  canCrossOwnerKanban,
  assertKanbanReadOwner,
  assertKanbanWriteOwner,
} from '../_worker_src/worker/controllers/kanban-controller.js';

function user(sub) { return { sub }; }

describe('canCrossOwnerKanban — a regra base de "pode mexer no kanban de outra pessoa"', () => {
  it('nega sem caps nenhum', () => {
    expect(canCrossOwnerKanban(null)).toBe(false);
    expect(canCrossOwnerKanban(undefined)).toBe(false);
  });

  it('nega se foreign não for exatamente "edit"', () => {
    expect(canCrossOwnerKanban({ foreign: 'view', escopo: 'team' })).toBe(false);
    expect(canCrossOwnerKanban({ foreign: 'none', escopo: 'global' })).toBe(false);
    expect(canCrossOwnerKanban({ escopo: 'team' })).toBe(false); // foreign ausente
  });

  it('nega se escopo for "self", mesmo com foreign=edit', () => {
    expect(canCrossOwnerKanban({ foreign: 'edit', escopo: 'self' })).toBe(false);
  });

  it('nega se escopo estiver ausente/vazio, mesmo com foreign=edit', () => {
    expect(canCrossOwnerKanban({ foreign: 'edit', escopo: '' })).toBe(false);
    expect(canCrossOwnerKanban({ foreign: 'edit' })).toBe(false);
  });

  it('permite com foreign=edit E escopo diferente de self (team, department, global)', () => {
    expect(canCrossOwnerKanban({ foreign: 'edit', escopo: 'team' })).toBe(true);
    expect(canCrossOwnerKanban({ foreign: 'edit', escopo: 'global' })).toBe(true);
  });

  it('REGRESSÃO — reflete exatamente os 9 cargos definidos em authz.js hoje', () => {
    // Espelha ROLE_DEFAULTS de authz.js — se um cargo novo for
    // adicionado lá com uma combinação diferente, este teste não pega
    // sozinho, mas os já existentes continuam corretos.
    const cargos = {
      consultor:      { escopo: 'self',   foreign: 'none' },
      funcionario:    { escopo: 'self',   foreign: 'none' },
      orientador:     { escopo: 'self',   foreign: 'none' },
      supervisor:     { escopo: 'team',   foreign: 'edit' },
      administrativo: { escopo: 'self',   foreign: 'none' },
      gerente:        { escopo: 'team',   foreign: 'edit' },
      gestor:         { escopo: 'team',   foreign: 'edit' },
      representante:  { escopo: 'global', foreign: 'edit' },
      master:         { escopo: 'global', foreign: 'edit' },
    };
    const esperadoCrossOwner = new Set(['supervisor', 'gerente', 'gestor', 'representante', 'master']);
    Object.keys(cargos).forEach((cargo) => {
      const resultado = canCrossOwnerKanban(cargos[cargo]);
      expect(resultado).toBe(esperadoCrossOwner.has(cargo));
    });
  });
});

describe('assertKanbanReadOwner — ler o kanban de alguém', () => {
  it('sempre permite ler o próprio kanban, mesmo sem caps nenhum', () => {
    expect(() => assertKanbanReadOwner('u1', user('u1'), null)).not.toThrow();
    expect(() => assertKanbanReadOwner('u1', user('u1'), {})).not.toThrow();
  });

  it('nega ler kanban alheio sem nenhuma capacidade especial (consultor comum)', () => {
    expect(() => assertKanbanReadOwner('outro', user('u1'), { escopo: 'self', foreign: 'none' })).toThrow();
  });

  it('permite ler kanban alheio com escopo=global, MESMO SEM foreign=edit (leitura ampla pra auditoria)', () => {
    expect(() => assertKanbanReadOwner('outro', user('u1'), { escopo: 'global', foreign: 'none' })).not.toThrow();
  });

  it('permite ler kanban alheio com foreign=edit + escopo=team (supervisor/gerente típico)', () => {
    expect(() => assertKanbanReadOwner('outro', user('u1'), { escopo: 'team', foreign: 'edit' })).not.toThrow();
  });

  it('nega ler kanban alheio com escopo=team MAS foreign diferente de edit', () => {
    expect(() => assertKanbanReadOwner('outro', user('u1'), { escopo: 'team', foreign: 'view' })).toThrow();
  });

  it('REGRESSÃO DE SEGURANÇA: rejeita se não houver usuário autenticado, mesmo com caps de admin', () => {
    expect(() => assertKanbanReadOwner('outro', null, { escopo: 'global', foreign: 'edit' })).toThrow();
    expect(() => assertKanbanReadOwner('outro', {}, { escopo: 'global', foreign: 'edit' })).toThrow();
  });
});

describe('assertKanbanWriteOwner — escrever no kanban de alguém', () => {
  it('sempre permite escrever no próprio kanban, mesmo sem caps nenhum', () => {
    expect(() => assertKanbanWriteOwner('u1', user('u1'), null)).not.toThrow();
  });

  it('nega escrever kanban alheio sem capacidade especial', () => {
    expect(() => assertKanbanWriteOwner('outro', user('u1'), { escopo: 'self', foreign: 'none' })).toThrow();
  });

  it('permite escrever kanban alheio com foreign=edit + escopo=team', () => {
    expect(() => assertKanbanWriteOwner('outro', user('u1'), { escopo: 'team', foreign: 'edit' })).not.toThrow();
  });

  it('DIFERENÇA IMPORTANTE E INTENCIONAL EM RELAÇÃO À LEITURA: escopo=global SOZINHO (sem foreign=edit) NÃO basta pra escrever — diferente da leitura, que permite. Confirma a assimetria "ver amplo" vs "editar de outra pessoa" é proposital, não uma inconsistência.', () => {
    expect(() => assertKanbanWriteOwner('outro', user('u1'), { escopo: 'global', foreign: 'none' })).toThrow();
  });

  it('REGRESSÃO DE SEGURANÇA: rejeita sem usuário autenticado, mesmo com caps de admin', () => {
    expect(() => assertKanbanWriteOwner('outro', null, { escopo: 'global', foreign: 'edit' })).toThrow();
  });
});
