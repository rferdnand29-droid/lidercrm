// =====================================================================
// tests/authz-usuarios-departamentos-gate.test.js
// Correção de segurança real, encontrada durante auditoria (2026-09-22,
// item 11 do plano de estabilidade). Achado: /api/v1/usuarios (criar/
// editar/excluir conta) e /api/v1/departamentos (criar/editar/excluir
// departamento, atribuir/remover membro de equipe) não estavam na
// matriz de rotas protegidas (ROUTE_MATRIX) — qualquer usuário
// autenticado, independente do cargo, conseguia chegar a essas ações
// sem checagem de permissão no servidor. A única defesa era a
// interface esconder os botões — contornável por quem chamasse a API
// direto (ex.: um script simples com o token de um consultor comum).
//
// Estes testes cobrem as duas regras novas adicionadas a ROUTE_MATRIX:
// GET continua livre pra qualquer usuário autenticado (preserva uso
// legítimo, como listar membros de equipe); POST/PUT/PATCH/DELETE
// exigem caps.adminUI.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { ROUTE_MATRIX } from '../_worker_src/worker/middlewares/authz.js';

function findRule(pathname) {
  return ROUTE_MATRIX.find((r) => r.pattern.test(pathname));
}

describe('SEC-05 — POST /api/v1/documentos exige adminUI, GET continua livre', () => {
  it('POST é negado sem adminUI — bug real que motivou esta correção', () => {
    const rule = findRule('/api/v1/documentos');
    expect(rule.require({ adminUI: false }, { method: 'POST' })).toBe(false);
  });

  it('POST é permitido COM adminUI', () => {
    const rule = findRule('/api/v1/documentos');
    expect(rule.require({ adminUI: true }, { method: 'POST' })).toBe(true);
  });

  it('GET (listagem) continua livre pra qualquer usuário autenticado', () => {
    const rule = findRule('/api/v1/documentos');
    expect(rule.require({ adminUI: false }, { method: 'GET' })).toBe(true);
  });

  it('REGRESSÃO EXPLÍCITA: /api/v1/documentos/adm NÃO é afetado por esta regra — já tem sua própria checagem correta, dentro do controller', () => {
    const bareRule = findRule('/api/v1/documentos');
    const admRule = findRule('/api/v1/documentos/adm');
    expect(admRule).not.toBe(bareRule);
  });
});

describe('SEC-04 — /api/v1/usuarios/legacy exige adminUI', () => {
  it('GET é negado sem adminUI — dado legado potencialmente sensível, sem uso confirmado', () => {
    const rule = findRule('/api/v1/usuarios/legacy');
    expect(rule.require({ adminUI: false }, { method: 'GET' })).toBe(false);
  });

  it('GET é permitido COM adminUI', () => {
    const rule = findRule('/api/v1/usuarios/legacy');
    expect(rule.require({ adminUI: true }, { method: 'GET' })).toBe(true);
  });

  it('REGRESSÃO EXPLÍCITA: não afeta /api/v1/usuarios/config, que é autoatendimento (cada usuário salva a própria preferência)', () => {
    const legacyRule = findRule('/api/v1/usuarios/legacy');
    const configRule = findRule('/api/v1/usuarios/config');
    expect(configRule).not.toBe(legacyRule);
  });
});

describe('SEC-02 — /api/v1/usuarios exige adminUI só pra escrever', () => {
  const rule = findRule('/api/v1/usuarios');

  it('a regra existe e casa com /api/v1/usuarios', () => {
    expect(rule).toBeDefined();
  });

  it('GET passa pra qualquer usuário autenticado (mesmo sem adminUI)', () => {
    const caps = { adminUI: false };
    expect(rule.require(caps, { method: 'GET' })).toBe(true);
  });

  it('POST (criar usuário) é NEGADO sem adminUI — bug real que motivou esta correção', () => {
    const caps = { adminUI: false };
    expect(rule.require(caps, { method: 'POST' })).toBe(false);
  });

  it('DELETE (excluir usuário) é NEGADO sem adminUI', () => {
    const caps = { adminUI: false };
    expect(rule.require(caps, { method: 'DELETE' })).toBe(false);
  });

  it('POST/PUT/DELETE são permitidos COM adminUI', () => {
    const caps = { adminUI: true };
    expect(rule.require(caps, { method: 'POST' })).toBe(true);
    expect(rule.require(caps, { method: 'PUT' })).toBe(true);
    expect(rule.require(caps, { method: 'DELETE' })).toBe(true);
  });

  it('/api/v1/usuarios/bulk (upsert em lote) também é coberto', () => {
    const bulkRule = findRule('/api/v1/usuarios/bulk');
    expect(bulkRule).toBe(rule); // mesma regra
    expect(bulkRule.require({ adminUI: false }, { method: 'POST' })).toBe(false);
  });

  it('REGRESSÃO EXPLÍCITA: /api/v1/usuarios/config NÃO é coberto por esta regra — é armazenamento genérico de configuração (inclusive conversas de chat em grupo), com proteção própria já embutida no controller; cada usuário salva a própria preferência ali', () => {
    const configRule = findRule('/api/v1/usuarios/config');
    expect(configRule).not.toBe(rule);
  });
});

describe('SEC-03 — exclusão de upload exige adminUI, upload em si continua livre', () => {
  it('DELETE /api/v1/upload é negado sem adminUI — bug real que motivou esta correção', () => {
    const rule = findRule('/api/v1/upload');
    expect(rule.require({ adminUI: false }, { method: 'DELETE' })).toBe(false);
  });

  it('DELETE /api/v1/upload/binary também é negado sem adminUI', () => {
    const rule = findRule('/api/v1/upload/binary');
    expect(rule.require({ adminUI: false }, { method: 'DELETE' })).toBe(false);
  });

  it('DELETE é permitido COM adminUI', () => {
    const rule = findRule('/api/v1/upload');
    expect(rule.require({ adminUI: true }, { method: 'DELETE' })).toBe(true);
  });

  it('POST (upload em si) continua livre pra qualquer usuário autenticado', () => {
    const rule = findRule('/api/v1/upload');
    expect(rule.require({ adminUI: false }, { method: 'POST' })).toBe(true);
  });
});

describe('SEC-02 — /api/v1/departamentos exige adminUI só pra escrever', () => {
  const rule = findRule('/api/v1/departamentos');

  it('a regra existe e casa com /api/v1/departamentos', () => {
    expect(rule).toBeDefined();
  });

  it('GET (listar departamentos/membros) passa sem adminUI', () => {
    const caps = { adminUI: false };
    expect(rule.require(caps, { method: 'GET' })).toBe(true);
  });

  it('PUT/PATCH/DELETE (editar/excluir departamento) são NEGADOS sem adminUI', () => {
    const caps = { adminUI: false };
    expect(rule.require(caps, { method: 'PUT' })).toBe(false);
    expect(rule.require(caps, { method: 'PATCH' })).toBe(false);
    expect(rule.require(caps, { method: 'DELETE' })).toBe(false);
  });

  it('/api/v1/departamentos/members (atribuir/remover membro de equipe) também é coberto', () => {
    const membersRule = findRule('/api/v1/departamentos/members');
    expect(membersRule).toBe(rule);
    expect(membersRule.require({ adminUI: false }, { method: 'POST' })).toBe(false);
    expect(membersRule.require({ adminUI: true }, { method: 'POST' })).toBe(true);
  });
});
