import { signJwtHS256 } from '../../utils/crypto.js';

// =====================================================================
// tokens.js — Payload/emissão de JWT do Worker
// ---------------------------------------------------------------------
// Etapa 6.1 (2026-07-23): incluímos `cargo_codigo` e `adm_extra` no
// payload assinado. Assim o middleware authz.js resolve as caps
// diretamente do JWT (chave forte, populada pelo backend) em vez de
// depender do fallback textual normalizeCargoCode(cargo). Todos os
// campos antigos (role, cargo, nome) continuam presentes — mudança
// puramente aditiva.
//
// Ambos os builders são chamados no login (login-service.js) e o
// refresh (auth-controller.js) replica os mesmos campos, mantendo a
// sessão consistente em toda a vida útil do token.
// =====================================================================

// Normaliza o cargo textual em uma chave conhecida de CARGO_CAPS.
// Duplica a heurística de authz.js#normalizeCargoCode e de
// js/auth.js#_lfNormalizeCargoCode — mantida aqui como fallback usado
// APENAS quando o próprio usuário não tem `cargo_codigo` gravado no
// banco. Não introduz permissão nova: só materializa no payload o que
// o authz já calcularia em runtime.
function _normalizeCargoCode(cargoRaw) {
  const c = String(cargoRaw || '').toLowerCase();
  if (!c) return null;
  const order = [
    'master', 'representante', 'gerente', 'gestor', 'administrativo',
    'supervisor', 'orientador', 'funcionario', 'funcionário', 'consultor',
  ];
  for (const k of order) {
    if (c.indexOf(k) >= 0) return k === 'funcionário' ? 'funcionario' : k;
  }
  return null;
}

export function buildJwtPayloadFromLegacy(user) {
  const cargoCodigo =
    (user && (user.cargo_codigo || user.cargoCodigo)) ||
    _normalizeCargoCode(user && user.cargo) ||
    null;
  const admExtra =
    (user && (user.adm_extra === true || user.admExtra === true)) || false;
  // Etapa 6.2 — UUID relacional (public.users.id). Necessário para o
  // middleware authz.js consultar v_user_caps.user_id quando
  // USE_DB_CAPS estiver ativo. Fica null para usuários que ainda vivem
  // só no fs_documents (fluxo legado puro) — nesse caso o middleware
  // simplesmente não tenta o DB e usa o CARGO_CAPS estático.
  const userUuid =
    (user && (user.user_uuid || user._uuid)) || null;
  return {
    sub: String(user.id || user.uid || user.email),
    email: user.email || null,
    role: user.role || (user.admExtra ? 'adm' : (user.cargo || 'user')),
    nome: user.nome || null,
    cargo: user.cargo || null,
    // Etapa 6.1 — campos consumidos por _worker_src/middlewares/authz.js.
    cargo_codigo: cargoCodigo,
    adm_extra: admExtra,
    // Etapa 6.2 — UUID relacional para lookup em v_user_caps.
    user_uuid: userUuid,
    // FIX (2026-08-03) — time e departamento (via teams.departamento_id,
    // já resolvido em login-service.js antes de chamar esta função).
    // Necessário pro front decidir a aba "Time" e o escopo de
    // leads/negócios/clientes sem consulta extra.
    team_id: (user && user.team_id) || null,
    departamento_id: (user && user.departamento_id) || null,
    auth_source: 'legacy',
  };
}

export function buildJwtPayloadFromSupabase(auth, email) {
  const user = (auth && auth.user) || {};
  const meta = (user && user.app_metadata) || {};
  return {
    sub: user.id || user.sub || email,
    email: user.email || email,
    role: meta.role || 'user',
    // Etapa 6.1 — Supabase Auth pode carregar cargo/cargo_codigo em
    // app_metadata. Se não vier, fica null e o authz cai no default
    // seguro (consultor / self / foreign=none).
    cargo: meta.cargo || null,
    cargo_codigo:
      meta.cargo_codigo ||
      _normalizeCargoCode(meta.cargo) ||
      null,
    adm_extra: meta.adm_extra === true,
    // FIX (2026-08-03) — mesmo campo do path legado, lido de
    // app_metadata quando disponível (consistência entre os dois
    // builders; null é um valor seguro, cai em "sem departamento").
    team_id: meta.team_id || null,
    departamento_id: meta.departamento_id || null,
    // Etapa 6.2 — quando o login vem via Supabase Auth, o próprio
    // user.id já é o UUID relacional (as duas tabelas partilham a chave).
    user_uuid: user.id || null,
    supabase_access_token: (auth && auth.access_token) || null,
    auth_source: 'supabase',
  };
}

export async function issueToken(cfg, payload) {
  const token = await signJwtHS256(payload, cfg.JWT_SECRET, cfg.JWT_EXPIRES_SECONDS);
  return {
    token,
    expiresIn: cfg.JWT_EXPIRES_SECONDS,
    user: {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      nome: payload.nome || null,
      cargo: payload.cargo || null,
      // Etapa 6.1 — expostos no `user` de resposta para o front poder
      // exibir/depurar sem re-decodificar o JWT.
      cargoCodigo: payload.cargo_codigo || null,
      admExtra: payload.adm_extra === true,
      // Etapa 6.2 — UUID relacional exposto (o front não precisa dele
      // hoje, mas fica disponível para debugging e para futuros joins
      // em `v_user_caps` do lado cliente, se houver caso de uso).
      userUuid: payload.user_uuid || null,
      // FIX (2026-08-03) — expostos pro front hidratar S sem
      // re-decodificar o JWT (mesmo padrão de cargoCodigo/admExtra).
      teamId: payload.team_id || null,
      departamentoId: payload.departamento_id || null,
      source: payload.auth_source || 'unknown',
    },
  };
}
