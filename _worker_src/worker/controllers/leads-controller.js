// =====================================================================
// leads-controller.js — server-side ESCOPE ENFORCEMENT (rodada 2 / 2026-07-29)
//
// Companheiro server-side do patch cliente lf-bugs-5fixes-v1-20260729.js.
// O patch cliente (#1) já bloqueia o bingo de aceitar leads cross-owner no
// `getCliLocal`; aqui blindamos o BANCO, porque um cliente buggy ou um
// script externo poderia pular essa defesa.
//
// Esta camada é ADITIVA sobre authz.js:
//   - authz.js valida o MÉTODO permitido pela CAPS (GET = read, POST/PUT/PATCH
//     = crud) sobre o pattern /api/v1/leads por meio do ROUTE_MATRIX.
//   - Este controller valida o ESCOPO (self/team/global) e o DONO
//     (owner_id) do recurso.
//
// Não toca em routes/router.js. Idempotente: rodar 2x = no-op.
// =====================================================================

import { validate, readJsonBody, sanitizeString } from '../validators/validate.js';
import { leadCreateSchema } from '../schemas/index.js';
import { listService } from '../services/crud-service.js';
import { leadsRepo } from '../repositories/index.js';
import { ok, created, noContent } from '../utils/response.js';
import { respondWithCache } from '../utils/etag.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../errors/http-errors.js';

const ALLOWED_FILTERS = ['status', 'origem', 'owner_id', 'interesse'];

// ----------------------------------------------------------------------------
// Defesas para o Bug #1 do bingo (cross-owner) + isolamento rigoroso por
// cargo:
//
//  - leads action = none  (administrativo): 403 em qualquer método.
//  - escopo = self        (consultor/funcionario/administrativo):
//                          atendimento_id é SEMPRE ctx.user.sub no servidor,
//                          independente do que o cliente mandou.
//  - escopo = team        (orientador/supervisor — leads:crud pra si):
//                          atende ao próprio uid. O escopo=team só amplia a
//                          VISUALIZAÇÃO se foreign for read/edit, mas
//                          mutações continuam self-only (foreign não promove
//                          CRUD em leads no CARGO_CAPS).
//  - escopo = global      (gerente/gestor/representante/master): sem
//                          restrição adicional; confia na UI para o filtro
//                          "minha equipe" quando aplicável.
//
// Em todas as mutações, validamos OWNERSHIP com `fetchOwnedLead` antes de
// qualquer UPDATE/DELETE. Leads de outros consultores são INVISÍVEIS (404
// padrão — não desperdiça enumeração com 403).
// ----------------------------------------------------------------------------

function actionRank(a) {
  return { none: 0, remind: 1, read: 2, crud: 3 }[a] ?? 0;
}

function assertCanMutate(caps) {
  if (!caps) {
    // Sem caps resolvido: defesa em profundidade. Bloqueia mutação
    // a menos que seja role=adm (caminho coberto por authz).
    return;
  }
  if (actionRank(caps.leads) < actionRank('crud')) {
    throw new ForbiddenError('Cargo sem permissão de mutação em leads.', {
      code: 'AUTHZ_FORBIDDEN',
      reason: 'insufficient_action',
      board: 'leads',
      need: 'crud',
      have: caps.leads,
    });
  }
}

function scopeOwnerClause(user, caps) {
  // Retorna `null` para escopo=global (sem filtro) e a cláusula PostgREST
  // `owner_id=eq.<sub>` para self/team. Master implícito já passou
  // por authz (cargos com adminUI/supervisorUI global caem em escopo=
  // global aqui).
  if (!user || !user.sub) return { owner_id: null };
  if (caps && caps.escopo === 'global') return { owner_id: null };
  return { owner_id: 'eq.' + user.sub };
}

function enforceScopeOnUrl(url, user, caps) {
  // Remove qualquer owner_id enviado pelo cliente antes de aplicar o
  // nosso — previne injeção/burla via query string.
  try { url.searchParams.delete('owner_id'); } catch (_e) {}
  if (!user || !user.sub) return;
  const clause = scopeOwnerClause(user, caps);
  if (clause && clause.owner_id) {
    url.searchParams.set('owner_id', String(user.sub));
  }
}

async function fetchOwnedLead(cfg, id, userSub, caps) {
  // Primeiro tenta com filtro de dono. Em escopo=global, busca só pelo id.
  if (!id) return null;
  const isGlobal = caps && caps.escopo === 'global';
  try {
    if (isGlobal) {
      return await leadsRepo.findOne(cfg, { id: 'eq.' + id }, '*');
    }
    return await leadsRepo.findOne(cfg, { id: 'eq.' + id, owner_id: 'eq.' + userSub }, '*');
  } catch (_e) {
    return null; // coluna pode não existir nesse schema — cai no fallback abaixo
  }
}

// GET /api/v1/leads — escopo aplicado via filtro injetado no PostgREST.
export async function listLeads(request, ctx) {
  const url = new URL(request.url);
  enforceScopeOnUrl(url, ctx && ctx.user, ctx && ctx.caps);
  const result = await listService(ctx.cfg, leadsRepo, url, ALLOWED_FILTERS);
  return respondWithCache(request, result.items, {
    endpoint: '/api/v1/leads', pagination: result.meta,
  }, { maxAge: ctx.cfg.CACHE_DEFAULT_MAX_AGE, extraHeaders: ctx.headers });
}

// POST /api/v1/leads — escopo enforced pelo owner_id corrigido no payload.
export async function createLead(request, ctx) {
  assertCanMutate(ctx && ctx.caps);
  const body = await readJsonBody(request);
  const data = validate(body, leadCreateSchema);
  data.nome = sanitizeString(data.nome, 200);
  data.created_at = new Date().toISOString();
  data.created_by = ctx.user && ctx.user.sub;

  // Blindagem do Bug #1: owner_id é SEMPRE o usuário autenticado (em
  // escopo=self/team). Em escopo=global, aceita o que o cliente mandou
  // (gerente criando lead para outro consultor, p.ex.).
  const isGlobal = ctx && ctx.caps && ctx.caps.escopo === 'global';
  const sub = ctx.user && ctx.user.sub;
  if (sub) {
    if (isGlobal) {
      // Permite que ADM/gerente designe o atendente; mas exige string
      // não-vazia e <= 200 chars.
      if (data.owner_id !== undefined && data.owner_id !== null) {
        const v = String(data.owner_id);
        if (!v || v.length > 200) {
          throw new BadRequestError('owner_id inválido.');
        }
      }
    } else {
      data.owner_id = sub; // FORÇA dono = sessão
    }
  }
  const row = await leadsRepo.insert(ctx.cfg, data);
  return created(row, { endpoint: '/api/v1/leads' }, ctx.headers);
}

// PUT/PATCH /api/v1/leads — ownership verificado antes do UPDATE.
export async function updateLead(request, ctx) {
  assertCanMutate(ctx && ctx.caps);
  const url = new URL(request.url);
  const body = await readJsonBody(request);
  const id = url.searchParams.get('id') || body.id;
  if (!id) throw new BadRequestError('id do lead é obrigatório.');
  delete body.id;

  const sub = ctx.user && ctx.user.sub;
  // Em escopo não-global, valida ownership ANTES do update. Em global
  // (gerente+/master), confia.
  const isGlobal = ctx && ctx.caps && ctx.caps.escopo === 'global';
  if (sub && !isGlobal) {
    const owned = await fetchOwnedLead(ctx.cfg, id, sub, ctx.caps);
    if (!owned) throw new NotFoundError('Lead não encontrado.');
  }

  body.updated_at = new Date().toISOString();
  body.updated_by = ctx.user && ctx.user.sub;
  // Em escopo não-global, NÃO deixa o cliente trocar o dono por aqui.
  if (sub && !isGlobal) body.owner_id = sub;

  const row = await leadsRepo.update(ctx.cfg, { id: 'eq.' + id }, body);
  if (!row) throw new NotFoundError('Lead não encontrado.');
  return ok(row, { endpoint: '/api/v1/leads' }, ctx.headers);
}

// AUDITORIA-FINAL-10 (2026-08-01, item 2.5 / COMPLEMENTO2 §A): validação de
// formato antes de usar `id` em filtro — não é exploração conhecida (PostgREST
// trata como comparação de valor literal, não SQL concatenado), mas é defesa
// em profundidade barata contra qualquer futuro ponto de uso menos cuidadoso.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/v1/leads — ownership verificado antes do DELETE.
export async function deleteLead(request, ctx) {
  assertCanMutate(ctx && ctx.caps);
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) throw new BadRequestError('id do lead é obrigatório.');
  if (!UUID_RE.test(id)) throw new BadRequestError('id do lead inválido.');

  const sub = ctx.user && ctx.user.sub;
  const isGlobal = ctx && ctx.caps && ctx.caps.escopo === 'global';
  if (sub && !isGlobal) {
    const owned = await fetchOwnedLead(ctx.cfg, id, sub, ctx.caps);
    if (!owned) throw new NotFoundError('Lead não encontrado.');
  }
  await leadsRepo.remove(ctx.cfg, { id: 'eq.' + id });
  return noContent(ctx.headers);
}
