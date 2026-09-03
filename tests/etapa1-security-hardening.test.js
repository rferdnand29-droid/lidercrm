import { describe, it, expect } from 'vitest';
import { readEnv, productionConfigErrors } from '../_worker_src/worker/utils/env.js';

describe('Etapa 1 — configuração segura de produção', () => {
  it('não bloqueia defaults no ambiente de desenvolvimento', () => {
    const cfg = readEnv({ ENV: 'development' });
    expect(productionConfigErrors(cfg)).toEqual([]);
  });

  it('bloqueia produção sem segredo, origem e configuração explícitos', () => {
    const cfg = readEnv({ ENV: 'production' });
    expect(productionConfigErrors(cfg)).toEqual([
      'JWT_SECRET',
      'ALLOWED_ORIGINS',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
    ]);
  });

  it('aceita produção quando os checks obrigatórios foram fornecidos', () => {
    const cfg = readEnv({
      ENV: 'production',
      JWT_SECRET: 'segredo-de-teste-forte',
      ALLOWED_ORIGINS: 'https://crm.exemplo.com',
      SUPABASE_URL: 'https://projeto-exemplo.supabase.co',
      SUPABASE_ANON_KEY: 'sb_publishable_teste',
    });
    expect(productionConfigErrors(cfg)).toEqual([]);
  });
});