import { securityEventsRepo } from '../repositories/index.js';
import { logger } from '../utils/logger.js';

export const SECURITY_EVENT_CODES = {
  CHAT_GROUP_FORBIDDEN: 'CHAT_GROUP_FORBIDDEN',
};

function safeText(value, maxLen) {
  const str = String(value == null ? '' : value).trim();
  if (!str) return null;
  return str.slice(0, maxLen || 200);
}

function buildPayload(ctx, meta) {
  const now = new Date().toISOString();
  const userSub = safeText(ctx && ctx.user && ctx.user.sub, 160);
  return {
    user_sub: userSub,
    event_code: SECURITY_EVENT_CODES.CHAT_GROUP_FORBIDDEN,
    count: 1,
    first_seen_at: now,
    last_seen_at: now,
    last_reason: safeText(meta && meta.reason, 80) || 'DENIED',
    last_path: safeText(meta && meta.path, 200) || '/api/v1/usuarios/config',
    last_method: safeText(meta && meta.method, 16) || 'PUT',
    sample_name: safeText(meta && meta.name, 160),
    sample_request_id: safeText(ctx && ctx.requestId, 120),
    payload: {
      status: 403,
      code: SECURITY_EVENT_CODES.CHAT_GROUP_FORBIDDEN,
      reason: safeText(meta && meta.reason, 80) || 'DENIED',
      path: safeText(meta && meta.path, 200) || '/api/v1/usuarios/config',
      method: safeText(meta && meta.method, 16) || 'PUT',
      name: safeText(meta && meta.name, 160),
    },
  };
}

// Passo 5.3 — telemetria best-effort e fail-open.
// Conta ocorrências de 403 CHAT_GROUP_FORBIDDEN por ctx.user.sub sem
// alterar a semântica do gate 5.2: qualquer falha ao gravar a telemetria
// é engolida e só vira warn no tail do Worker.
export async function recordForbiddenChatGroupEvent(ctx, meta) {
  const payload = buildPayload(ctx, meta || {});
  if (!payload.user_sub) return { ok: false, skipped: 'NO_SUBJECT' };

  try {
    const existing = await securityEventsRepo.findOne(
      ctx.cfg,
      {
        user_sub: 'eq.' + payload.user_sub,
        event_code: 'eq.' + SECURITY_EVENT_CODES.CHAT_GROUP_FORBIDDEN,
      },
      'id,user_sub,event_code,count,first_seen_at,last_seen_at'
    );

    if (existing && existing.id) {
      const nextCount = Math.max(0, Number(existing.count || 0)) + 1;
      await securityEventsRepo.update(ctx.cfg, { id: 'eq.' + existing.id }, {
        count: nextCount,
        last_seen_at: payload.last_seen_at,
        last_reason: payload.last_reason,
        last_path: payload.last_path,
        last_method: payload.last_method,
        sample_name: payload.sample_name,
        sample_request_id: payload.sample_request_id,
        payload: payload.payload,
      });
      return { ok: true, mode: 'update', count: nextCount };
    }

    await securityEventsRepo.insert(ctx.cfg, payload);
    return { ok: true, mode: 'insert', count: 1 };
  } catch (err) {
    logger.warn('security.telemetry.write_failed', {
      requestId: ctx && ctx.requestId,
      userSub: payload.user_sub,
      eventCode: SECURITY_EVENT_CODES.CHAT_GROUP_FORBIDDEN,
      message: (err && err.message) || String(err),
    });
    return { ok: false, skipped: 'WRITE_FAILED' };
  }
}
