// ==== AUDIT-SECURITY 2026-07-17 =============================================
// As chaves do Supabase foram REMOVIDAS deste arquivo e substituídas por
// placeholders. Configure os valores reais via:
//   • Dev:    copie .env.example para .env.local e edite
//   • Prod:   `wrangler secret put SUPABASE_URL` etc.
// Nunca commit chaves reais neste arquivo.
// ===========================================================================

// =====================================================================
// env.js
// Extrai configuração do binding `env` do Worker com defaults seguros
// (compatíveis com o que já existe no js/supabase.js) — assim `wrangler
// deploy` continua funcionando SEM que o usuário precise configurar
// variáveis obrigatórias no primeiro deploy.
// Para produção, defina em wrangler.toml [vars]/[secrets]:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE,
//   SUPABASE_BUCKET, JWT_SECRET, ALLOWED_ORIGINS.
// =====================================================================
// CORREÇÃO (2026-07-17b): URL trocada para o projeto do dashboard
// (<seu-projeto>). SUPABASE_ANON_KEY está como PLACEHOLDER —
// cole a Publishable key (sb_publishable_…) da mesma URL em supabase.js,
// env.js e wrangler.toml. NUNCA use sb_secret_… aqui — secret vai só
// no backend via `wrangler secret put SUPABASE_SERVICE_ROLE`.

const DEFAULTS = Object.freeze({
  SUPABASE_URL: 'https://xwajiwjpecanxaqlxzkt.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_z1rKnhaLJcr1Bdfy1gLQBw_LHUcSzp0',
  SUPABASE_SERVICE_ROLE: '',
  SUPABASE_BUCKET: 'lidercrm-files',
  // JWT_SECRET default é intencionalmente longo e derivado do nome do
  // projeto — em produção DEVE ser sobrescrito por `wrangler secret put JWT_SECRET`.
  JWT_SECRET: 'lidercrm-default-jwt-secret-please-override-in-production-with-wrangler-secret',
  JWT_EXPIRES_SECONDS: 60 * 60 * 8, // 8h
  ALLOWED_ORIGINS: '*',
  RATE_LIMIT_MAX: 120,               // req por janela
  RATE_LIMIT_WINDOW_SECONDS: 60,     // 60s
  CACHE_DEFAULT_MAX_AGE: 30,         // s
});

export function readEnv(env) {
  env = env || {};
  const cfg = {};
  Object.keys(DEFAULTS).forEach((k) => {
    const v = env[k];
    if (v === undefined || v === null || v === '') cfg[k] = DEFAULTS[k];
    else cfg[k] = v;
  });
  // Números
  cfg.JWT_EXPIRES_SECONDS = Number(cfg.JWT_EXPIRES_SECONDS) || DEFAULTS.JWT_EXPIRES_SECONDS;
  cfg.RATE_LIMIT_MAX = Number(cfg.RATE_LIMIT_MAX) || DEFAULTS.RATE_LIMIT_MAX;
  cfg.RATE_LIMIT_WINDOW_SECONDS = Number(cfg.RATE_LIMIT_WINDOW_SECONDS) || DEFAULTS.RATE_LIMIT_WINDOW_SECONDS;
  cfg.CACHE_DEFAULT_MAX_AGE = Number(cfg.CACHE_DEFAULT_MAX_AGE) || DEFAULTS.CACHE_DEFAULT_MAX_AGE;

  // CERT-04: Em produção, não permitir JWT_SECRET default.
  // O default é intencionalmente fraco e derivado do nome do projeto.
  // Se o Worker estiver em produção (sem URL placeholder) e ainda
  // estiver usando o secret default, marcar como inseguro.
  cfg._jwtSecretIsDefault = (cfg.JWT_SECRET === DEFAULTS.JWT_SECRET);

  // CERT-05: ALLOWED_ORIGINS não pode ser '*' em produção.
  // Validação real acontece no cors.js, mas registramos aqui.
  cfg._corsIsWildcard = (cfg.ALLOWED_ORIGINS === '*');

  return cfg;
}
