// =====================================================================
// authz.js — middleware de AUTORIZAÇÃO (Etapa 6 — 2026-07-23)
// ---------------------------------------------------------------------
// Camada de defesa em profundidade sobre o modelo Cargo x Escopo x Ação
// já implementado no front (js/auth.js — CARGO_CAPS). O front é a 1ª
// barreira (esconde UI, bloqueia mutações no cliente); este middleware
// é a 2ª barreira (recusa no servidor mesmo que o cliente ignore o
// bloqueio do front).
//
// Ordem no pipeline (ver api-handler.js):
//   CORS -> RateLimit -> Authenticate -> AUTHORIZE (este) -> Router -> Controller
//
// Princípios (do prompt de sistema, regra 2 — aditivo antes de destrutivo):
//   • Middleware novo, isolado. Não altera authenticate() nem o router.
//   • Só é ativado no pipeline via um único ponto em api-handler.js.
//   • Se falhar em resolver o cargo (ex.: banco fora do ar), DEIXA
//     PASSAR — o controller ainda aplica sua própria validação. Nunca
//     eleva um erro operacional a 403.
//   • Nunca ALARGA acesso: só recusa. Sem cargo mapeado, cai em
//     CARGO_CAPS_DEFAULT (consultor / self / foreign=none).
//
// Fonte de verdade: tabela public.cargo_caps + view v_user_caps
// criadas em sql/migrations/migration_hierarquia_20260723.sql. Se a tabela ainda
// não existir (deploy do backend antes do SQL), fazemos fallback para
// o CARGO_CAPS hard-coded aqui — que é ESPELHO fiel do CARGO_CAPS do
// front (js/auth.js).
//
// Op-3 (2026-07-23): feature flag ADM_EXTRA_JWT_PROMOTES controla se o
// claim `adm_extra=true` no JWT ainda promove adminUI/supervisorUI
// mesmo quando o DB responde false. Default true (retrocompat total).
// Setando false, `public.users.adm_extra` (via v_user_caps.admin_ui)
// passa a ser a fonte única — recomendado após backfill validado.
// =====================================================================

import { ForbiddenError } from '../errors/http-errors.js';
import { selectFrom } from '../lib/supabase-rest.js';
import { applyCargoOnlyDeptRule } from './authz-cargo-only-dept-patch.js';

// ---------------------------------------------------------------------
// Espelho de CARGO_CAPS (js/auth.js). Manter em sincronia manualmente
// enquanto não movemos 100% para o banco. Feature flag USE_DB_CAPS
// (env) determina se o middleware tenta ler v_user_caps primeiro.
// ---------------------------------------------------------------------
export const CARGO_CAPS = {
  consultor:      { escopo:'self',   leads:'crud', negocios:'crud', foreign:'none', stageGated:false, adminUI:false, supervisorUI:false },
  funcionario:    { escopo:'self',   leads:'crud', negocios:'crud', foreign:'none', stageGated:false, adminUI:false, supervisorUI:false },
  // FIX (2026-08-03): orientador rebaixado — mesmo valor de consultor.
  // Ver js/auth.js e migration_orientador_demotion_20260803.sql.
  orientador:     { escopo:'self',   leads:'crud', negocios:'crud', foreign:'none', stageGated:false, adminUI:false, supervisorUI:false },
  // FIX (2026-08-03): supervisor.foreign 'read'->'edit'. Ver js/auth.js.
  supervisor:     { escopo:'team',   leads:'crud', negocios:'crud', foreign:'edit', stageGated:false, adminUI:false, supervisorUI:true  },
  administrativo: { escopo:'self',   leads:'none', negocios:'crud', foreign:'none', stageGated:false, adminUI:false, supervisorUI:false },
  gerente:        { escopo:'team',   leads:'crud', negocios:'crud', foreign:'edit', stageGated:false, adminUI:true,  supervisorUI:true  },
  gestor:         { escopo:'team',   leads:'crud', negocios:'crud', foreign:'edit', stageGated:false, adminUI:true,  supervisorUI:true  },
  representante:  { escopo:'global', leads:'crud', negocios:'crud', foreign:'edit', stageGated:false, adminUI:true,  supervisorUI:true  },
  master:         { escopo:'global', leads:'crud', negocios:'crud', foreign:'edit', stageGated:false, adminUI:true,  supervisorUI:true  },
};

export const CARGO_CAPS_DEFAULT = {
  escopo:'self', leads:'crud', negocios:'crud', foreign:'none',
  stageGated:false, adminUI:false, supervisorUI:false,
};

// ---------------------------------------------------------------------
// Normaliza a string livre `cargo` (u.cargo) em uma chave de CARGO_CAPS.
// Mesma ordem/heurística do _lfNormalizeCargoCode em js/auth.js.
// ---------------------------------------------------------------------
export function normalizeCargoCode(cargoRaw) {
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

// ---------------------------------------------------------------------
// Matriz de rotas -> requisitos mínimos. Cada entrada:
//   { pattern: RegExp, method?: string|Array, board?: 'leads'|'negocios',
//     require: fn(caps, ctx) => boolean }
//
// board indica qual dimensão consultar (leads/negocios). Se o método
// for GET, exigimos capacidade >= 'read'; se for POST/PUT/PATCH/DELETE,
// exigimos 'crud'.
//
// Rotas não mapeadas aqui NÃO SÃO BLOQUEADAS pelo middleware
// (permissão delegada ao controller). Este middleware só refina.
// ---------------------------------------------------------------------
const CRUD_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const READ_METHODS = new Set(['GET', 'HEAD']);

function actionRank(a) {
  return { none:0, remind:1, read:2, crud:3 }[a] ?? 0;
}
function needForMethod(method) {
  if (CRUD_METHODS.has(method)) return 'crud';
  if (READ_METHODS.has(method)) return 'read';
  return 'read';
}

export const ROUTE_MATRIX = [
  // Leads
  { pattern: /^\/api\/v1\/leads(\/|$)/i,          board: 'leads' },
  { pattern: /^\/api\/v1\/kanban\/leads(\/|$)/i,  board: 'leads' },
  // Negócios (nome legado: kanban/negocios)
  { pattern: /^\/api\/v1\/negocios(\/|$)/i,       board: 'negocios' },
  { pattern: /^\/api\/v1\/kanban\/negocios(\/|$)/i, board: 'negocios' },
  // Rotas administrativas — exigem adminUI
  { pattern: /^\/api\/v1\/admin(\/|$)/i,          require: (caps) => !!caps.adminUI },
  // SEC-01 (2026-08-01): financeiro é dado sensível, exige adminUI —
  // camada extra além da checagem já existente em financeiro-controller.js.
  { pattern: /^\/api\/v1\/financeiro(\/|$)/i,     require: (caps) => !!caps.adminUI },
  // Rotas de visão de equipe — exigem supervisorUI (ou adminUI)
  { pattern: /^\/api\/v1\/time(\/|$)/i,           require: (caps) => !!(caps.supervisorUI || caps.adminUI) },
  // SEC-02 (2026-09-22): gestão de usuário (criar/editar/excluir conta) e
  // de departamento (criar/editar/excluir, atribuir/remover membro de
  // equipe) exigem adminUI — só nos métodos que ALTERAM dado (leituras
  // continuam livres, preservando uso legítimo como listar membros de
  // equipe). Achado real de auditoria: nenhuma das duas tinha proteção
  // de servidor antes — só a interface escondia os botões, contornável
  // por quem chamasse a API direto. /usuarios/config fica de fora de
  // propósito: é armazenamento genérico de configuração (inclusive
  // conversas de chat em grupo, que já tem sua própria checagem
  // específica no controller) — cada usuário salva a própria preferência
  // ali, não é gestão de conta.
  { pattern: /^\/api\/v1\/usuarios(\/bulk)?$/i,   require: (caps, ctx) => !CRUD_METHODS.has(ctx.method) || !!caps.adminUI },
  { pattern: /^\/api\/v1\/departamentos(\/|$)/i,  require: (caps, ctx) => !CRUD_METHODS.has(ctx.method) || !!caps.adminUI },
  // SEC-03 (2026-09-22): exclusão de arquivo (upload/upload-binary)
  // aceitava um "path"/"fileId" direto da requisição e apagava sem
  // verificar posse — qualquer autenticado que soubesse o caminho de
  // um arquivo de OUTRA pessoa conseguia apagá-lo. Nenhum dos dois
  // métodos de exclusão é exposto pelo cliente hoje (worker-client.js
  // só expõe o upload em si) — restrito a admin como padrão
  // conservador. Upload (POST) continua livre.
  { pattern: /^\/api\/v1\/upload(\/binary)?$/i,   require: (caps, ctx) => ctx.method !== 'DELETE' || !!caps.adminUI },
  // SEC-04 (2026-09-25): /usuarios/legacy lê um documento inteiro
  // (config/users) sem filtro — herança de um sistema anterior, nada
  // no Worker atual grava nesse caminho. Não é usado pelo cliente
  // hoje. Restrito a admin como padrão conservador — risco de
  // exposição de dado legado sem uso confirmado que justifique deixar
  // aberto.
  { pattern: /^\/api\/v1\/usuarios\/legacy$/i,    require: (caps) => !!caps.adminUI },
  // SEC-05 (2026-10-01): POST /documentos (criar registro genérico de
  // documento) não tinha nenhuma verificação de cargo, e nem sequer um
  // campo de dono no esquema (diferente de leads/clientes, que forçam
  // owner_id) — qualquer autenticado conseguia criar. Não usado pelo
  // cliente hoje. Restrito a admin como padrão conservador. GET
  // (listagem) fica livre — leitura sem uso confirmado de dano.
  // /documentos/adm NÃO é afetado por esta regra (âncora $ exige fim de
  // string) — já tem sua própria checagem correta, documentada
  // separadamente dentro do próprio controller.
  { pattern: /^\/api\/v1\/documentos$/i,          require: (caps, ctx) => ctx.method !== 'POST' || !!caps.adminUI },
];

// ---------------------------------------------------------------------
// Cache in-memory por isolate do Worker. Etapa 6.2 (2026-07-23).
//
// Motivo: com USE_DB_CAPS=true, cada request faria 1 fetch a
// v_user_caps — latencia adicional e pressão no PostgREST. O cache
// vive no escopo do módulo (isolate), invalida em cada deploy e tem
// TTL curto (default 30s, configurável via cfg.DB_CAPS_TTL_SECONDS).
// Um LRU simples por eviction de tamanho máximo evita crescimento
// ilimitado em tenants com muitos usuários.
//
// Op-5 (2026-07-23): contadores instrumentados (hits, misses,
// evictions, writes, expired) para o endpoint de saúde
// /api/v1/health/authz-cache. Contadores são zerados apenas em
// reset do isolate (novo deploy) ou por __resetDbCapsCacheStats().
// ---------------------------------------------------------------------
const DB_CAPS_CACHE_MAX = 500;
const _dbCapsCache = new Map(); // uuid -> { caps, expiresAt }

// Op-5 — contadores de observabilidade do cache.
const _dbCapsStats = {
  hits: 0,        // GET com entrada válida (não expirada)
  misses: 0,      // GET sem entrada
  expired: 0,     // GET com entrada expirada (contabilizado como miss também)
  writes: 0,      // SET (inclui refresh após expirar)
  evictions: 0,   // eviction LRU por atingir DB_CAPS_CACHE_MAX
  startedAt: Date.now(), // marca de início do isolate (aproximada)
};

function _cacheGet(key, now) {
  const hit = _dbCapsCache.get(key);
  if (!hit) { _dbCapsStats.misses++; return null; }
  if (hit.expiresAt <= now) {
    _dbCapsCache.delete(key);
    _dbCapsStats.expired++;
    _dbCapsStats.misses++;
    return null;
  }
  // Move-to-end — LRU: refresca posição.
  _dbCapsCache.delete(key);
  _dbCapsCache.set(key, hit);
  _dbCapsStats.hits++;
  return hit.caps;
}

function _cacheSet(key, caps, ttlSeconds, now) {
  if (_dbCapsCache.size >= DB_CAPS_CACHE_MAX) {
    // Evict o primeiro (menos recentemente usado).
    const oldest = _dbCapsCache.keys().next().value;
    if (oldest !== undefined) {
      _dbCapsCache.delete(oldest);
      _dbCapsStats.evictions++;
    }
  }
  _dbCapsCache.set(key, { caps, expiresAt: now + (ttlSeconds * 1000) });
  _dbCapsStats.writes++;
}

// Test-only: exposta para permitir que o harness limpe o cache entre
// casos. Não é usada em produção (nenhum consumidor lê daqui).
export function __clearDbCapsCache() { _dbCapsCache.clear(); }
export function __dbCapsCacheSize()  { return _dbCapsCache.size; }

// Op-5 — helpers de observabilidade. `getDbCapsCacheStats` é a única
// função pública nova (consumida pelo /api/v1/health/authz-cache).
// `__resetDbCapsCacheStats` é test-only.
export function getDbCapsCacheStats() {
  const totalLookups = _dbCapsStats.hits + _dbCapsStats.misses;
  const hitRate = totalLookups > 0 ? _dbCapsStats.hits / totalLookups : 0;
  return {
    size: _dbCapsCache.size,
    maxSize: DB_CAPS_CACHE_MAX,
    hits: _dbCapsStats.hits,
    misses: _dbCapsStats.misses,
    expired: _dbCapsStats.expired,
    writes: _dbCapsStats.writes,
    evictions: _dbCapsStats.evictions,
    hitRate: Math.round(hitRate * 10000) / 10000, // 0.0000..1.0000
    uptimeMs: Date.now() - _dbCapsStats.startedAt,
  };
}
export function __resetDbCapsCacheStats() {
  _dbCapsStats.hits = 0;
  _dbCapsStats.misses = 0;
  _dbCapsStats.expired = 0;
  _dbCapsStats.writes = 0;
  _dbCapsStats.evictions = 0;
  _dbCapsStats.startedAt = Date.now();
}

// Converte uma linha de v_user_caps no formato interno de CARGO_CAPS.
function _rowToCaps(row) {
  if (!row) return null;
  return {
    escopo:       row.escopo       || 'self',
    leads:        row.leads_acao   || 'crud',
    negocios:     row.negocios_acao|| 'crud',
    foreign:      row.foreign_acao || 'none',
    stageGated:   row.stage_gated  === true,
    adminUI:      row.admin_ui     === true,
    supervisorUI: row.supervisor_ui=== true,
  };
}

// Busca caps no banco. Retorna `null` em qualquer falha (rede, 4xx,
// linha ausente) — nunca propaga. É responsabilidade do caller cair
// no fallback estático.
async function _fetchCapsFromDb(cfg, userUuid) {
  try {
    const { rows } = await selectFrom(cfg, 'v_user_caps', {
      filters: { user_id: 'eq.' + userUuid },
      select: 'escopo,leads_acao,negocios_acao,foreign_acao,stage_gated,admin_ui,supervisor_ui',
      limit: 1,
    });
    if (rows && rows[0]) return _rowToCaps(rows[0]);
    return null;
  } catch (_e) {
    // selectFrom converte falhas de rede em UpstreamError. Engolimos:
    // authz nunca eleva erro operacional a 403.
    return null;
  }
}

// ---------------------------------------------------------------------
// Resolve as caps do usuário.
//
// Ordem de resolução (do mais forte para o mais fraco):
//   0. `role=adm` ou `sub=adm`              → CARGO_CAPS.master
//   1. DB (v_user_caps por user_uuid)       → quando cfg.USE_DB_CAPS=true
//   2. cargo_codigo assinado no JWT         → CARGO_CAPS[code]
//   3. cargo textual normalizado            → CARGO_CAPS[normalize(cargo)]
//   4. CARGO_CAPS_DEFAULT                   → consultor / self / foreign=none
//
// Op-3 (2026-07-23): a promoção via `adm_extra=true` no JWT é
// controlada por feature flag:
//   • cfg.ADM_EXTRA_JWT_PROMOTES  → afeta o path DB (v_user_caps)
//   • cfg.ADM_EXTRA_STATIC_PROMOTES → afeta o path estático (JWT->CAPS)
// Ambas default `true` (retrocompat total). Setando false, o banco
// (`public.users.adm_extra` via `v_user_caps.admin_ui`) é a fonte
// única — desejável após o backfill validado, pois evita que um JWT
// antigo com `adm_extra=true` continue promovendo permissões depois
// que o banco baixou a flag.
// ---------------------------------------------------------------------
// ---------------------------------------------------------------------
// 2026-08-04 — "cargo alto só ganha função extra via departamento".
// resolveUserCaps() tem VÁRIOS pontos de retorno (Hudson, path DB com/sem
// promoção por adm_extra, path estático com/sem promoção por adm_extra).
// Em vez de tocar em cada `return` isoladamente (frágil a esquecer um
// caminho — por exemplo o path DB, que nem chega perto do `return base`
// final), a função original foi renomeada para resolveUserCapsBase() e
// o nome público passa a ser este wrapper, que aplica a regra em CIMA
// do resultado de qualquer um dos caminhos antes de devolver ao chamador.
// Ver docs/RELATORIO-CACADOR-ERRO-CARGO-DEPARTAMENTO-20260804.md.
// ---------------------------------------------------------------------
async function resolveUserCaps(user, cfg) {
  const caps = await resolveUserCapsBase(user, cfg);
  const raw = (user && user.raw) || {};
  return applyCargoOnlyDeptRule(caps, raw, null);
}

async function resolveUserCapsBase(user, cfg) {
  // 1) Master implícito: adm tem sempre caps.master.
  if (user && (user.role === 'adm' || user.sub === 'adm')) {
    return CARGO_CAPS.master;
  }

  const raw = (user && user.raw) || {};
  const cargoCodigoJwt = raw.cargo_codigo || raw.cargoCodigo;
  const cargoFreeJwt   = raw.cargo || null;
  const admExtraJwt    = raw.adm_extra === true || raw.admExtra === true;
  const userUuid       = raw.user_uuid || raw.userUuid || null;

  // Op-3 — flags de promoção. Default true (comportamento pré-Op-3).
  // `cfg` pode ser undefined em callers de teste — nesse caso mantém
  // o default aditivo (promove).
  const dbPromotes     = !cfg || cfg.ADM_EXTRA_JWT_PROMOTES    !== false;
  const staticPromotes = !cfg || cfg.ADM_EXTRA_STATIC_PROMOTES !== false;

  // 2) DB — só tenta quando (a) flag está ativa, (b) SUPABASE_URL
  //    presente, (c) temos um UUID relacional pra consultar. Se falhar
  //    ou não retornar linha, cai no path estático abaixo silenciosamente.
  if (cfg && cfg.USE_DB_CAPS && cfg.SUPABASE_URL && userUuid) {
    const now = Date.now();
    let caps = _cacheGet(userUuid, now);
    if (!caps) {
      caps = await _fetchCapsFromDb(cfg, userUuid);
      if (caps) {
        const ttl = Number(cfg.DB_CAPS_TTL_SECONDS) || 30;
        _cacheSet(userUuid, caps, ttl, now);
      }
    }
    if (caps) {
      // Op-3: promoção só acontece quando ADM_EXTRA_JWT_PROMOTES é true
      // (default). Com a flag desligada, o DB manda inclusive quando
      // o JWT trouxer adm_extra=true — isso destrava a "fonte única"
      // pedida no Op-3 sem quebrar clientes com token antigo em
      // deployments que ainda não migraram.
      if (dbPromotes && admExtraJwt && !caps.adminUI) {
        return { ...caps, adminUI: true, supervisorUI: true };
      }
      return caps;
    }
    // sem cache, sem linha, sem sorte — cai no fallback estático.
  }

  // 3) Estático via JWT (cargo_codigo forte → cargo textual → default).
  let code = null;
  if (cargoCodigoJwt && CARGO_CAPS[String(cargoCodigoJwt).toLowerCase()]) {
    code = String(cargoCodigoJwt).toLowerCase();
  } else if (cargoFreeJwt) {
    code = normalizeCargoCode(cargoFreeJwt);
  }

  const base = (code && CARGO_CAPS[code]) ? CARGO_CAPS[code] : CARGO_CAPS_DEFAULT;
  // No path estático, `staticPromotes=false` só faz sentido em ambientes
  // que estão obrigatoriamente com USE_DB_CAPS=true (senão os cargos com
  // adminUI vêm do CARGO_CAPS de qualquer forma). Mantemos default true
  // para não quebrar deploys que ainda dependem do JWT.
  if (staticPromotes && admExtraJwt && !base.adminUI) {
    return { ...base, adminUI: true, supervisorUI: true };
  }
  return base;
}

// ---------------------------------------------------------------------
// authorize(request, ctx) — chamado APÓS authenticate() e ANTES do
// resolveRoute. Se a rota estiver na ROUTE_MATRIX e o usuário não
// tiver a capacidade mínima, lança ForbiddenError. Caso contrário
// anexa ctx.caps e deixa passar.
//
// Uso em api-handler.js (Etapa 6.1 do próprio commit — trecho pequeno):
//   if (!isPublicPath(pathname, method)) {
//     user = await authenticate(request, cfg);
//     await authorize(request, { cfg, user, pathname, method });
//   }
// ---------------------------------------------------------------------
// SEC-02 (2026-08-01, auditoria técnica): antes, QUALQUER exceção não
// classificada como HttpError caía no mesmo caminho de "falha operacional,
// deixa passar" — inclusive bugs de programação, não só banco fora do ar.
// Como só 4 dos 21 controllers têm checagem própria de ctx.caps, um bug
// nesta função desativava silenciosamente a autorização de rota pra quase
// toda a API. Lista abaixo restringe o "deixa passar" só às falhas
// operacionais realmente esperadas (rede/timeout/upstream) — qualquer
// outro erro agora nega por padrão (fail-closed).
const OPERATIONAL_ERROR_MESSAGES = [
  'fetch failed', 'network', 'timeout', 'econnrefused', 'upstreamerror',
];
function isKnownOperationalFailure(err) {
  const msg = String((err && err.message) || '').toLowerCase();
  return OPERATIONAL_ERROR_MESSAGES.some((k) => msg.indexOf(k) >= 0);
}

export async function authorize(request, ctx) {
  try {
    const { cfg, user } = ctx || {};
    if (!user) return null; // rota pública ou falha anterior — não é papel nosso

    const url = new URL(request.url);
    const pathname = ctx.pathname || url.pathname;
    const method = ctx.method || request.method;

    const caps = await resolveUserCaps(user, cfg);
    ctx.caps = caps; // disponibiliza pro controller (ctx.caps)

    // Percorre a matriz. Primeira regra que casar decide.
    for (const rule of ROUTE_MATRIX) {
      if (!rule.pattern.test(pathname)) continue;

      // Regra genérica (require callback) — usada por /admin e /time.
      if (typeof rule.require === 'function') {
        const ok = !!rule.require(caps, ctx);
        if (!ok) {
          throw new ForbiddenError('Acesso negado para o cargo atual.', {
            code: 'AUTHZ_FORBIDDEN',
            reason: 'rule_require_failed',
            path: pathname,
          });
        }
        return caps;
      }

      // Regra board-based (leads/negocios).
      if (rule.board) {
        const need = needForMethod(method);
        const have = caps[rule.board]; // 'none'|'remind'|'read'|'crud'
        if (actionRank(have) < actionRank(need)) {
          throw new ForbiddenError(
            'Cargo atual não tem permissão de ' + need + ' em ' + rule.board + '.',
            {
              code: 'AUTHZ_FORBIDDEN',
              reason: 'insufficient_action',
              board: rule.board,
              need,
              have,
              path: pathname,
            }
          );
        }
        return caps;
      }
    }

    return caps; // rota não mapeada — só decora ctx.caps
  } catch (err) {
    if (err && err.name === 'HttpError') throw err;

    if (isKnownOperationalFailure(err)) {
      // Falha operacional conhecida (ex.: Supabase fora do ar) — comportamento
      // documentado do sistema: deixa passar, controller decide.
      try { console.warn('[authz] falha operacional conhecida, deixando passar:', err && err.message); } catch (_e) {}
      return null;
    }

    // Erro NÃO classificado (bug de programação, dado inesperado, etc.):
    // nega por padrão — nunca abre acesso por causa de um erro desconhecido.
    try { console.error('[authz] erro inesperado — negando por padrão:', err && err.stack); } catch (_e) {}
    throw new ForbiddenError('Erro ao validar permissões.', {
      code: 'AUTHZ_INTERNAL_ERROR', reason: 'unclassified_error',
    });
  }
}

// Helper exportado — permite que controllers consultem caps sem
// re-resolver.
export function requireCap(caps, dimension, need) {
  if (!caps) return false;
  const have = caps[dimension];
  return actionRank(have) >= actionRank(need);
}
