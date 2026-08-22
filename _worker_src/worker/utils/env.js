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
  // Etapa 6.2 (2026-07-23) — feature flag do middleware authz.js.
  // Quando true, resolveUserCaps consulta public.v_user_caps antes de
  // cair no CARGO_CAPS estático. Default false para permitir deploy
  // gradual: o SQL da migration precisa estar aplicado + as colunas
  // cargo_codigo/adm_extra populadas em public.users. Enquanto false,
  // o comportamento é exatamente o pré-6.2.
  USE_DB_CAPS: false,
  // TTL do cache in-memory de caps por usuário (segundos). O cache
  // vive no escopo do isolate do Worker, então cai naturalmente em
  // rollout, invalidação de deploy e reinicialização do runtime.
  DB_CAPS_TTL_SECONDS: 30,
  // Op-3 (2026-07-23) — flags de promoção do claim `adm_extra`.
  //   ADM_EXTRA_JWT_PROMOTES=true  (default): `adm_extra=true` no JWT
  //     promove adminUI/supervisorUI mesmo quando o DB (v_user_caps)
  //     responde false. Comportamento retrocompat pré-Op-3.
  //   ADM_EXTRA_JWT_PROMOTES=false: o DB é a fonte única. Recomendado
  //     após backfill de public.users.adm_extra validado — evita que
  //     um JWT antigo continue promovendo permissão que já foi
  //     revogada no banco.
  //   ADM_EXTRA_STATIC_PROMOTES: mesma coisa, mas para o path estático
  //     (fallback quando USE_DB_CAPS=false ou o DB não respondeu).
  //     Default true — desligar só faz sentido em ambientes
  //     obrigatoriamente com USE_DB_CAPS=true.
  ADM_EXTRA_JWT_PROMOTES: true,
  ADM_EXTRA_STATIC_PROMOTES: true,
  // AUDITORIA-FINAL-10 (2026-08-01, item 2.3) — sinaliza ambiente de produção
  // pra permitir que cors.js feche o wildcard '*' sem exigir ALLOWED_ORIGINS
  // configurada. Default 'development' de propósito: NÃO muda nenhum
  // comportamento existente até alguém setar ENV=production explicitamente
  // (Cloudflare Pages > Settings > Environment variables). Rollout seguro:
  // a mudança de comportamento real só acontece quando o time decidir ativar.
  ENV: 'development',
  // FASE 2 (2026-08-05) — push notification de verdade (ver lib/fcm-client.js
  // e controllers/push-send-controller.js). Conteúdo INTEIRO (string JSON)
  // do arquivo de Conta de Serviço baixado no Firebase Console. Default ''
  // (vazio) = feature desligada de propósito — /api/v1/push/send responde
  // 200 com skipped:'FCM_NOT_CONFIGURED' em vez de erro, então nada quebra
  // enquanto ninguém configurar. Configurar via:
  //   wrangler secret put FCM_SERVICE_ACCOUNT_JSON
  // (cole o JSON inteiro do arquivo baixado — nunca em [vars] no
  // wrangler.toml, é credencial sensível, tem que ser secret).
  FCM_SERVICE_ACCOUNT_JSON: '',
});

function _coerceBool(v, defVal) {
  if (v === true || v === false) return v;
  const s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === 'true'  || s === '1' || s === 'yes' || s === 'on')  return true;
  if (s === 'false' || s === '0' || s === 'no'  || s === 'off') return false;
  return defVal;
}

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
  cfg.DB_CAPS_TTL_SECONDS = Number(cfg.DB_CAPS_TTL_SECONDS) || DEFAULTS.DB_CAPS_TTL_SECONDS;

  // Booleans — aceitamos true/false/"true"/"false"/"1"/"0" para
  // compatibilidade com secrets do Cloudflare (que chegam como string).
  cfg.USE_DB_CAPS = _coerceBool(cfg.USE_DB_CAPS, DEFAULTS.USE_DB_CAPS);
  // Op-3 — flags de promoção. Default true (retrocompat).
  cfg.ADM_EXTRA_JWT_PROMOTES    = _coerceBool(cfg.ADM_EXTRA_JWT_PROMOTES,    DEFAULTS.ADM_EXTRA_JWT_PROMOTES);
  cfg.ADM_EXTRA_STATIC_PROMOTES = _coerceBool(cfg.ADM_EXTRA_STATIC_PROMOTES, DEFAULTS.ADM_EXTRA_STATIC_PROMOTES);

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
