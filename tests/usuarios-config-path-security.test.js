// =====================================================================
// tests/usuarios-config-path-security.test.js
// Auditoria de correção do sistema de autenticação (2026-10-03) — cobre
// duas falhas reais encontradas ao investigar a "ponte de sessão
// legada" (legacy-bridge-service.js), que usa o campo `ph` (hash de
// senha bruto) de um usuário como material de assinatura HMAC — ou
// seja, conhecer o `ph` de outra pessoa permite forjar uma sessão
// completa como ela, sem nunca saber a senha real.
//
// SEC-07: getLegacyUsuarios devolvia o hash de senha bruto de TODOS os
// usuários, sem sanitização — mesmo já sendo admin-only.
//
// SEC-08 (mais grave — sem restrição de cargo nenhuma): o endpoint
// genérico /usuarios/config aceitava um "name" totalmente livre do
// cliente. name="users/items/<uid>" resolvia pro MESMO caminho interno
// dos registros individuais de usuário — qualquer autenticado
// conseguia ler (ou, via PUT/DELETE, sobrescrever/apagar) o registro
// de QUALQUER outra pessoa da empresa, incluindo o `ph`.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { configPath, scrubUser } from '../_worker_src/worker/controllers/usuarios-controller.js';

describe('scrubUser — remove todo campo sensível antes de devolver ao cliente', () => {
  it('remove ph (o achado real desta auditoria) e outros campos de credencial', () => {
    const raw = { id: 'u1', nome: 'Fulano', ph: 'hash-super-secreto', senha: 'x', password: 'y', hash: 'z', password_hash: 'w', reset_token: 'a', refresh_token: 'b' };
    const clean = scrubUser(raw);
    expect(clean.ph).toBeUndefined();
    expect(clean.senha).toBeUndefined();
    expect(clean.password).toBeUndefined();
    expect(clean.hash).toBeUndefined();
    expect(clean.password_hash).toBeUndefined();
    expect(clean.reset_token).toBeUndefined();
    expect(clean.refresh_token).toBeUndefined();
  });

  it('preserva campos não-sensíveis intactos', () => {
    const raw = { id: 'u1', nome: 'Fulano', email: 'a@b.com', ph: 'segredo' };
    const clean = scrubUser(raw);
    expect(clean.id).toBe('u1');
    expect(clean.nome).toBe('Fulano');
    expect(clean.email).toBe('a@b.com');
  });

  it('não quebra com entrada nula/indefinida', () => {
    expect(() => scrubUser(null)).not.toThrow();
    expect(() => scrubUser(undefined)).not.toThrow();
  });
});

describe('configPath — bloqueia travessia pro namespace sensível de usuários (SEC-08)', () => {
  it('REGRESSÃO CRÍTICA EXPLÍCITA: name="users/items/<uid>" é bloqueado — este era o ataque real encontrado (leitura do registro de QUALQUER usuário, incluindo o hash de senha, sem nenhuma restrição de cargo)', () => {
    expect(() => configPath('users/items/algum-uid-de-outra-pessoa')).toThrow();
  });

  it('bloqueia também o nome exato "users" (sem sufixo)', () => {
    expect(() => configPath('users')).toThrow();
  });

  it('bloqueia variações de travessia de caminho (..)', () => {
    expect(() => configPath('../users/items/x')).toThrow();
    expect(() => configPath('foo/../users/items/x')).toThrow();
  });

  it('NÃO bloqueia nomes legítimos de configuração (chat, preferências) — não deve quebrar uso real', () => {
    expect(() => configPath('chat_conv_grp_abc123')).not.toThrow();
    expect(() => configPath('minha_preferencia')).not.toThrow();
    expect(configPath('chat_conv_grp_abc123')).toBe('config/chat_conv_grp_abc123');
  });

  it('não bloqueia um nome que só contém "users" como parte de outra palavra (ex.: "meususers_config")', () => {
    expect(() => configPath('meususers_config')).not.toThrow();
  });
});
