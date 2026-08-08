// =====================================================================
// utils/team-scope.js
// AUDITORIA-FINAL-10 (2026-08-01) — resolução de "mesmo time" a partir
// de public.users.team_id (coluna existente desde
// migration_hierarquia_20260723.sql, sem código nenhum usando até esta
// correção). Compartilhado por dashboard-controller.js,
// atividades-controller.js e ligacoes-controller.js — a MESMA regra de
// acesso hierárquico deve valer nos três, não uma implementação
// diferente em cada um.
//
// Modelo suportado pelos dados de hoje: associação de time PLANA (um
// usuário pertence a um team_id, sem "time pai/time filho"). Se no
// futuro existir hierarquia de múltiplos níveis de verdade, isto
// precisa mudar — não force uma árvore que os dados não têm.
// =====================================================================

import { findUserByLegacyId } from '../repositories/users-relational-repository.js';
import { selectFrom } from '../lib/supabase-rest.js';

/**
 * Retorna a lista de legacy_id de todos os usuários que compartilham o
 * mesmo team_id do usuário `sub`. Fail-closed: qualquer erro (rede,
 * usuário sem team_id, etc.) retorna null — quem chama deve tratar
 * null como "não resolveu time", não como "sem filtro".
 */
export async function resolveTeamMemberIds(cfg, sub) {
  if (!sub) return null;
  try {
    const me = await findUserByLegacyId(cfg, sub);
    const teamId = me && me.team_id;
    if (!teamId) return null;
    const { rows } = await selectFrom(cfg, 'users', {
      filters: { team_id: 'eq.' + teamId },
      select: 'legacy_id',
      limit: 500,
    });
    return (rows || []).map((u) => u.legacy_id).filter(Boolean);
  } catch (_e) {
    return null;
  }
}

/**
 * Decide se `ctx.user` pode acessar o dado de `targetUid`.
 * Ordem: dono sempre pode; adminUI (gerente pra cima) sempre pode;
 * supervisorUI (orientador/supervisor) só se targetUid estiver no
 * mesmo time; qualquer outro caso, nega.
 */
export async function canAccessUid(cfg, ctx, targetUid) {
  const sub = ctx && ctx.user && ctx.user.sub;
  if (!sub || !targetUid) return false;
  if (sub === targetUid) return true;
  if (ctx.caps && ctx.caps.adminUI) return true;
  if (ctx.caps && ctx.caps.supervisorUI) {
    const teamIds = await resolveTeamMemberIds(cfg, sub);
    return !!(teamIds && teamIds.indexOf(targetUid) !== -1);
  }
  return false;
}
