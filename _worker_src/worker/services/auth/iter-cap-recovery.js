// =====================================================================
// iter-cap-recovery.js (2026-07-27)
// ---------------------------------------------------------------------
// Operações de recuperação para usuários cujo hash foi gerado em uma
// build anterior com PBKDF2_ITERATIONS = 210000 — incompatível com o
// cap público do runtime Cloudflare Workers (100000).
//
// PBKDF2 não é reversível, então não é possível recomputar a hash sem
// a senha em texto puro. O caminho definitivo é:
//   1) Marcar o usuário (best-effort) em public.users.userrsers.
//   2) Registrar security event para o admin ver quais contas travaram.
//   3) O admin redefine a senha via endpoint existente (PUT /users/:id
//      com novo ph gerado por hashPasswordS2) — toda hash nova nasce
//      em 100k e cai dentro do cap.
// =====================================================================

import { updateWhere, selectFrom } from '../../lib/supabase-rest.js';
import { securityEventsRepo } from '../../repositories/index.js';
import { logger } from '../../utils/logger.js';

const USERS = 'users';

const SECURITY_EVENT_CODE = 'LOGIN_BLOCKED_ITER_CAP';

export async function markUserNeedsPasswordReset(cfg, userRecord, err) {
  if (!cfg || !err) return { ok: false, skipped: 'NO_INPUT' };

  const reason = 'hash_iter_cap_exceeded stored=' +
                 (err && err.storedIters) +
                 ' cap=' + (err && err.cap);

  // Tenta localizar o usuário por email e marcar por UUID relacional.
  // Falha em qualquer estágio é engolida (best-effort) — o sinal
  // primário continua sendo o 401 tipado que o login-service devolve.
  let userId = userRecord && (userRecord._uuid || userRecord.user_uuid || userRecord.id);
  const email = (err && err.email)
             || (userRecord && userRecord.email) || null;

  if (!userId && email) {
    try {
      const { rows } = await selectFrom(cfg, USERS, {
        filters: { email: 'eq.' + String(email).trim().toLowerCase() },
        select: 'id',
        limit: 1,
      });
      if (rows && rows[0] && rows[0].id) userId = rows[0].id;
    } catch (_e) { /* swallow */ }
  }

  if (!userId) {
    logger.warn('iter_cap_recovery.no_user_id', { email, reason });
    return { ok: false, skipped: 'NO_USER_ID' };
  }

  // Colunas abaixo são opcionais — best-effort. O login-service já
  // devolveu 401 tipado; essas colunas são telemetria operacional. A
  // migration SQL (migrate_iter_cap_20260727.sql) adiciona essas
  // colunas em public.users com DEFAULT false / NULL.
  try {
    await updateWhere(cfg, USERS, { id: 'eq.' + userId }, {
      updated_at: new Date().toISOString(),
      needs_password_reset: true,
      iter_cap_exceeded_reason: reason,
    });
  } catch (updErr) {
    // Coluna pode não existir ainda — não bloqueia o fluxo.
    logger.warn('iter_cap_recovery.update_failed', {
      userId,
      reason,
      message: (updErr && updErr.message) || String(updErr),
    });
  }

  // Security event: uma linha por usuário + event_code agregado.
  try {
    const existing = await securityEventsRepo.findOne(
      cfg,
      { user_sub: 'eq.' + String(userId),
        event_code: 'eq.' + SECURITY_EVENT_CODE },
      'id,user_sub,event_code,count'
    );
    const now = new Date().toISOString();
    if (existing && existing.id) {
      await securityEventsRepo.update(cfg, { id: 'eq.' + existing.id }, {
        count: Math.max(0, Number(existing.count || 0)) + 1,
        last_seen_at: now,
        last_reason: reason,
        payload: { email, stored_iters: err.storedIters, cap: err.cap, code: err.code },
      });
    } else {
      await securityEventsRepo.insert(cfg, {
        user_sub: String(userId),
        event_code: SECURITY_EVENT_CODE,
        count: 1,
        first_seen_at: now,
        last_seen_at: now,
        last_reason: reason,
        last_path: '/api/v1/login',
        last_method: 'POST',
        sample_request_id: null,
        payload: { email, stored_iters: err.storedIters, cap: err.cap, code: err.code },
      });
    }
  } catch (evErr) {
    logger.warn('iter_cap_recovery.security_event_failed', {
      userId,
      message: (evErr && evErr.message) || String(evErr),
    });
  }

  return { ok: true, userId, reason };
}
