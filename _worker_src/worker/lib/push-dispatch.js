// =====================================================================
// lib/push-dispatch.js
// -----------------------------------------------------------------------
// 2026-08-07: extraído de controllers/push-send-controller.js (que só
// atendia POST /api/v1/push/send, disparado pelo cliente logo após
// mandar mensagem de chat) pra ser reaproveitado também pelo novo
// controller de atividades atrasadas (controllers/cron-controller.js),
// que roda sem usuário autenticado (é chamado por um Worker de cron
// externo, não por um cliente logado) — mesma lógica de envio, duas
// origens diferentes de disparo.
//
// Best-effort por design: nunca lança pra cima uma falha de UM device
// específico — cada tentativa vira uma entrada em results[], e quem
// chamou decide o que fazer com sent/attempted.
// =====================================================================

import { selectFrom, updateWhere } from './supabase-rest.js';
import { sendFcmToDevice } from './fcm-client.js';

const TABLE = 'push_devices';

/**
 * Envia uma notificação push pra todos os devices ativos de cada uid em
 * `userIds`. Retorna { sent, attempted, skipped, results }.
 */
export async function dispatchPushToUsers(cfg, userIds, title, body, data) {
  const results = [];
  let skippedReason = null;

  if (!cfg || !cfg.FCM_SERVICE_ACCOUNT_JSON) {
    skippedReason = 'FCM_NOT_CONFIGURED';
  } else if (!Array.isArray(userIds) || !userIds.length) {
    skippedReason = 'NO_TARGETS';
  } else {
    for (const uid of userIds) {
      let devices;
      try {
        const result = await selectFrom(cfg, TABLE, {
          filters: { user_id: 'eq.' + uid, active: 'eq.true', provider: 'eq.fcm' },
          limit: 10,
        });
        devices = (result && result.rows) || [];
      } catch (_e) {
        results.push({ uid, ok: false, reason: 'DEVICE_LOOKUP_FAILED' });
        continue;
      }
      if (!devices.length) {
        results.push({ uid, ok: false, reason: 'NO_DEVICE_REGISTERED' });
        continue;
      }
      for (const dev of devices) {
        try {
          const sendResult = await sendFcmToDevice(cfg, dev.token, { title, body }, data || {});
          results.push({ uid, deviceId: dev.id, ok: sendResult.ok, status: sendResult.status });
          if (sendResult.unregistered) {
            try { await updateWhere(cfg, TABLE, { id: 'eq.' + dev.id }, { active: false, updated_at: new Date().toISOString() }); }
            catch (_e2) { /* não-crítico */ }
          }
        } catch (sendErr) {
          results.push({ uid, deviceId: dev.id, ok: false, reason: String(sendErr && sendErr.message || sendErr) });
        }
      }
    }
  }

  const sentCount = results.filter((r) => r.ok).length;
  return { sent: sentCount, attempted: results.length, skipped: skippedReason, results };
}
