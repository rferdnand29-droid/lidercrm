// =====================================================================
// departamentos-controller.js
// ---------------------------------------------------------------------
// FIX (2026-08-03): o módulo de departamentos (LF_DEPARTMENTS, client-
// side) sempre chamou workerClient.saveDocument()/getDocument() — uma
// API que não existe no workerClient real (só tem list/get/create/
// update/remove por nome de recurso, e só pra recursos com rota
// registrada). Departamentos criados pelo console NUNCA foram
// persistidos no banco — só em localStorage do navegador que criou.
// Este controller cria a rota que faltava: /api/v1/departamentos,
// no mesmo padrão de usuarios-controller.js (privilégio de admin via
// resolveActorPrivilege, respostas padronizadas ok/created).
//
// Modelo (ver sql/10-schema-departamentos.sql v2 + migration_
// hierarquia_20260723.sql): departamento NÃO é campo direto em users/
// leads/business/clients — é derivado via team_id -> teams.id ->
// teams.departamento_id. "Atribuir um usuário a um departamento" (o
// verbo que o ADM usa na prática) significa, por baixo, garantir que
// exista um time vinculado àquele departamento e setar o team_id do
// usuário pra esse time — o endpoint de membros abaixo esconde esse
// detalhe do chamador.
// =====================================================================

import { selectFrom, insertInto, updateWhere, deleteWhere } from '../lib/supabase-rest.js';
import { ok, created } from '../utils/response.js';
import { readJsonBody, sanitizeString } from '../validators/validate.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/http-errors.js';
import { resolveActorPrivilege } from './usuarios-controller.js';

function genDeptId() {
  return 'dept_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function requireAdmin(ctx, msg) {
  const priv = await resolveActorPrivilege(ctx);
  if (!priv || !priv.ok) {
    throw new ForbiddenError(msg || 'Apenas administradores podem gerenciar departamentos.', {
      code: 'AUTHZ_FORBIDDEN', reason: 'departamentos_requires_admin',
    });
  }
  return priv;
}

// ---------- DEPARTAMENTOS ----------

export async function listDepartamentos(request, ctx) {
  const { rows } = await selectFrom(ctx.cfg, 'departamentos', {
    select: '*', order: 'nome.asc', limit: 500,
  });
  return ok(rows || [], { endpoint: '/api/v1/departamentos' }, ctx.headers);
}

export async function createDepartamento(request, ctx) {
  await requireAdmin(ctx, 'Apenas administradores podem criar departamentos.');
  const body = await readJsonBody(request);
  const nome = sanitizeString(body && body.nome, 200);
  if (!nome) throw new BadRequestError('nome é obrigatório.');

  const payload = {
    id: genDeptId(),
    nome,
    descricao: sanitizeString(body && body.descricao, 1000) || null,
    cor: sanitizeString(body && body.cor, 20) || '#3b82f6',
    status: 'ativo',
    supervisor_uid: sanitizeString(body && body.supervisorUid, 120) || null,
    adjunto_uid: sanitizeString(body && body.adjuntoUid, 120) || null,
    created_by: (ctx.user && ctx.user.sub) || null,
  };
  const row = await insertInto(ctx.cfg, 'departamentos', payload);
  return created(row, { endpoint: '/api/v1/departamentos' }, ctx.headers);
}

export async function updateDepartamento(request, ctx) {
  await requireAdmin(ctx, 'Apenas administradores podem editar departamentos.');
  const url = new URL(request.url);
  const id = sanitizeString(url.searchParams.get('id'), 120);
  if (!id) throw new BadRequestError('id é obrigatório.');

  const body = await readJsonBody(request);
  const patch = {};
  if (typeof body?.nome === 'string') patch.nome = sanitizeString(body.nome, 200);
  if (typeof body?.descricao === 'string') patch.descricao = sanitizeString(body.descricao, 1000);
  if (typeof body?.cor === 'string') patch.cor = sanitizeString(body.cor, 20);
  if (typeof body?.status === 'string' && ['ativo', 'inativo'].includes(body.status)) patch.status = body.status;
  if (typeof body?.supervisorUid === 'string') patch.supervisor_uid = sanitizeString(body.supervisorUid, 120) || null;
  if (typeof body?.adjuntoUid === 'string') patch.adjunto_uid = sanitizeString(body.adjuntoUid, 120) || null;
  patch.updated_at = new Date().toISOString();

  const row = await updateWhere(ctx.cfg, 'departamentos', { id: 'eq.' + id }, patch);
  if (!row) throw new NotFoundError('Departamento não encontrado.');
  return ok(row, { endpoint: '/api/v1/departamentos' }, ctx.headers);
}

export async function deleteDepartamento(request, ctx) {
  await requireAdmin(ctx, 'Apenas administradores podem excluir departamentos.');
  const url = new URL(request.url);
  const id = sanitizeString(url.searchParams.get('id'), 120);
  if (!id) throw new BadRequestError('id é obrigatório.');
  // teams.departamento_id tem ON DELETE SET NULL — excluir um
  // departamento libera os times (voltam a "sem departamento"), não
  // quebra a FK. Times e membros continuam existindo.
  await deleteWhere(ctx.cfg, 'departamentos', { id: 'eq.' + id });
  return ok({ id, deleted: true }, { endpoint: '/api/v1/departamentos' }, ctx.headers);
}

// ---------- TEAMS (times dentro de um departamento) ----------

export async function listTeams(request, ctx) {
  const url = new URL(request.url);
  const departamentoId = sanitizeString(url.searchParams.get('departamentoId'), 120);
  const filters = departamentoId ? { departamento_id: 'eq.' + departamentoId } : {};
  const { rows } = await selectFrom(ctx.cfg, 'teams', {
    select: 'id,name,slug,description,active,departamento_id,created_at',
    filters, order: 'name.asc', limit: 500,
  });
  return ok(rows || [], { endpoint: '/api/v1/departamentos/teams' }, ctx.headers);
}

// Garante um time vinculado ao departamento, reaproveitando um já
// existente se houver (evita criar um time novo a cada bulk-assign).
async function ensureTeamForDepartamento(cfg, departamentoId, departamentoNome) {
  const { rows } = await selectFrom(cfg, 'teams', {
    filters: { departamento_id: 'eq.' + departamentoId },
    select: 'id', limit: 1,
  });
  if (rows && rows[0]) return rows[0].id;
  const row = await insertInto(cfg, 'teams', {
    name: departamentoNome || 'Equipe',
    active: true,
    departamento_id: departamentoId,
  });
  return row && row.id;
}

// ---------- MEMBROS (o que o front chama de "atribuir ao departamento") ----------

// POST { departamentoId, userIds: [...] } — em lote, na mesma chamada
// (pedido explícito: "o ADM escolher um monte de gente simultaneamente").
export async function assignDepartamentoMembers(request, ctx) {
  await requireAdmin(ctx, 'Apenas administradores podem atribuir usuários a departamentos.');
  const body = await readJsonBody(request);
  const departamentoId = sanitizeString(body && body.departamentoId, 120);
  const userIds = Array.isArray(body && body.userIds) ? body.userIds.filter(Boolean) : [];
  if (!departamentoId) throw new BadRequestError('departamentoId é obrigatório.');
  if (!userIds.length) throw new BadRequestError('userIds deve ser uma lista não-vazia.');

  const { rows: deptRows } = await selectFrom(ctx.cfg, 'departamentos', {
    filters: { id: 'eq.' + departamentoId }, select: 'id,nome', limit: 1,
  });
  const dept = deptRows && deptRows[0];
  if (!dept) throw new NotFoundError('Departamento não encontrado.');

  const teamId = await ensureTeamForDepartamento(ctx.cfg, departamentoId, dept.nome);
  if (!teamId) throw new BadRequestError('Não foi possível resolver um time para este departamento.');

  const okIds = [];
  const failed = [];
  for (const uid of userIds) {
    const cleanUid = sanitizeString(uid, 120);
    if (!cleanUid) { failed.push({ userId: uid, error: 'id inválido' }); continue; }
    try {
      await updateWhere(ctx.cfg, 'users', { id: 'eq.' + cleanUid }, { team_id: teamId });
      okIds.push(cleanUid);
    } catch (err) {
      failed.push({ userId: cleanUid, error: String((err && err.message) || err) });
    }
  }
  return ok({ departamentoId, teamId, ok: okIds, failed, total: userIds.length },
    { endpoint: '/api/v1/departamentos/members' }, ctx.headers);
}

// DELETE ?userId=X — remove do departamento (limpa team_id).
export async function removeDepartamentoMember(request, ctx) {
  await requireAdmin(ctx, 'Apenas administradores podem remover usuários de departamentos.');
  const url = new URL(request.url);
  const userId = sanitizeString(url.searchParams.get('userId'), 120);
  if (!userId) throw new BadRequestError('userId é obrigatório.');
  await updateWhere(ctx.cfg, 'users', { id: 'eq.' + userId }, { team_id: null });
  return ok({ userId, removed: true }, { endpoint: '/api/v1/departamentos/members' }, ctx.headers);
}

// GET — lista usuários com o departamento resolvido (join users -> teams),
// pro front montar a tela de "quem está em qual departamento" sem N+1.
export async function listDepartamentoMembers(request, ctx) {
  const { rows: users } = await selectFrom(ctx.cfg, 'users', {
    select: 'id,full_name,email,team_id', filters: { active: 'eq.true' }, limit: 500,
  });
  const teamIds = Array.from(new Set((users || []).map(u => u.team_id).filter(Boolean)));
  let teamsById = {};
  if (teamIds.length) {
    const { rows: teams } = await selectFrom(ctx.cfg, 'teams', {
      select: 'id,name,departamento_id', limit: 500,
    });
    teamsById = Object.fromEntries((teams || []).map(t => [t.id, t]));
  }
  const items = (users || []).map(u => {
    const team = u.team_id ? teamsById[u.team_id] : null;
    return {
      userId: u.id, nome: u.full_name, email: u.email,
      teamId: u.team_id || null,
      teamNome: team ? team.name : null,
      departamentoId: team ? team.departamento_id : null,
    };
  });
  return ok(items, { endpoint: '/api/v1/departamentos/members' }, ctx.headers);
}
