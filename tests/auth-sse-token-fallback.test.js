// =====================================================================
// tests/auth-sse-token-fallback.test.js
// Tempo real, Fase 1 (2026-09-26) — cobre o fallback de autenticação
// via query string, criado especificamente porque EventSource (usado
// pelo streaming em tempo real) não consegue enviar o cabeçalho
// Authorization — limitação da própria API do navegador.
//
// TESTE DE SEGURANÇA CRÍTICO: o fallback deve funcionar SÓ na rota de
// streaming — qualquer outra rota precisa continuar exigindo o header
// normalmente, sem exceção. Um erro aqui enfraqueceria a autenticação
// do sistema inteiro, não só do streaming.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { authenticate } from '../_worker_src/worker/middlewares/auth.js';
import { signJwtHS256 } from '../_worker_src/worker/utils/crypto.js';

const SECRET = 'test-secret-nao-usar-em-producao';
const cfg = { JWT_SECRET: SECRET };

async function validToken() {
  return signJwtHS256({ sub: 'user-1', email: 'a@b.com', role: 'user' }, SECRET);
}

function req(url, headers) {
  return new Request(url, { headers: headers || {} });
}

describe('authenticate — fallback de token via query string (SSE)', () => {
  it('funciona na rota de streaming quando o token vem só na query string (sem header)', async () => {
    const token = await validToken();
    const user = await authenticate(req('https://x.com/api/v1/kanban/stream?token=' + token), cfg);
    expect(user.sub).toBe('user-1');
  });

  it('header Authorization continua funcionando normalmente na rota de streaming (não é obrigatório usar query)', async () => {
    const token = await validToken();
    const user = await authenticate(req('https://x.com/api/v1/kanban/stream', { Authorization: 'Bearer ' + token }), cfg);
    expect(user.sub).toBe('user-1');
  });

  it('REGRESSÃO DE SEGURANÇA CRÍTICA: token via query string NÃO funciona em nenhuma outra rota', async () => {
    const token = await validToken();
    await expect(
      authenticate(req('https://x.com/api/v1/kanban/list?token=' + token), cfg)
    ).rejects.toThrow();
  });

  it('REGRESSÃO DE SEGURANÇA CRÍTICA: token via query string não funciona nem em rotas parecidas com o nome', async () => {
    const token = await validToken();
    await expect(
      authenticate(req('https://x.com/api/v1/kanban/stream/outra-coisa?token=' + token), cfg)
    ).rejects.toThrow();
    await expect(
      authenticate(req('https://x.com/api/v1/usuarios?token=' + token), cfg)
    ).rejects.toThrow();
  });

  it('rota de streaming sem token nenhum (nem header, nem query) continua rejeitando', async () => {
    await expect(
      authenticate(req('https://x.com/api/v1/kanban/stream'), cfg)
    ).rejects.toThrow();
  });
});
