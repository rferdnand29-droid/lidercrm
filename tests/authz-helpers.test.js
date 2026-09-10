// =====================================================================
// tests/authz-helpers.test.js
// AUDITORIA-FINAL-10 (2026-08-01, item 1.2) — testes das funções puras
// exportadas por authz.js e da validação de UUID adicionada em
// leads-controller.js (item 2.5 desta mesma auditoria).
// =====================================================================
import { describe, it, expect } from 'vitest';
import {
  normalizeCargoCode,
  requireCap,
  CARGO_CAPS,
} from '../_worker_src/worker/middlewares/authz.js';
import { UUID_RE } from '../_worker_src/worker/controllers/leads-controller.js';

describe('normalizeCargoCode', () => {
  it('reconhece os 9 cargos conhecidos, case-insensitive', () => {
    expect(normalizeCargoCode('Consultor')).toBe('consultor');
    expect(normalizeCargoCode('MASTER')).toBe('master');
    expect(normalizeCargoCode('Gerente Comercial')).toBe('gerente'); // substring match
  });

  it('normaliza "funcionário" (com acento) para "funcionario" (sem acento)', () => {
    expect(normalizeCargoCode('funcionário')).toBe('funcionario');
  });

  it('retorna null pra string vazia ou cargo desconhecido', () => {
    expect(normalizeCargoCode('')).toBeNull();
    expect(normalizeCargoCode(null)).toBeNull();
    expect(normalizeCargoCode('estagiario')).toBeNull();
  });

  it('prioriza "master"/"representante" sobre substrings mais curtos (ordem importa)', () => {
    // "gerente" contido em "gerente-master" não deve vencer "master" —
    // a ordem de checagem em normalizeCargoCode já lista master primeiro.
    expect(normalizeCargoCode('master-gerente')).toBe('master');
  });
});

describe('requireCap', () => {
  it('respeita a hierarquia none < remind < read < crud', () => {
    const caps = { leads: 'read' };
    expect(requireCap(caps, 'leads', 'read')).toBe(true);
    expect(requireCap(caps, 'leads', 'crud')).toBe(false);
    expect(requireCap(caps, 'leads', 'none')).toBe(true); // read >= none
  });

  it('retorna false com segurança se caps for null/undefined', () => {
    expect(requireCap(null, 'leads', 'read')).toBe(false);
    expect(requireCap(undefined, 'leads', 'read')).toBe(false);
  });

  it('cada cargo real do CARGO_CAPS responde corretamente a requireCap', () => {
    // consultor tem leads:'crud' — deve passar em read e em crud
    expect(requireCap(CARGO_CAPS.consultor, 'leads', 'crud')).toBe(true);
    // administrativo tem leads:'none' — não deve passar nem em read
    expect(requireCap(CARGO_CAPS.administrativo, 'leads', 'read')).toBe(false);
    expect(requireCap(CARGO_CAPS.administrativo, 'negocios', 'crud')).toBe(true);
  });
});

describe('UUID_RE (validação de id de lead — item 2.5)', () => {
  it('aceita um UUID v4 válido, minúsculo ou maiúsculo', () => {
    expect(UUID_RE.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(UUID_RE.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('rejeita valores malformados, incluindo tentativa de injeção via querystring', () => {
    expect(UUID_RE.test('')).toBe(false);
    expect(UUID_RE.test('not-a-uuid')).toBe(false);
    expect(UUID_RE.test("1' OR '1'='1")).toBe(false);
    expect(UUID_RE.test('550e8400-e29b-41d4-a716-44665544000')).toBe(false); // 1 char a menos
  });
});
