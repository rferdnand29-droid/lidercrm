// =====================================================================
// logger.js
// Logger estruturado (JSON lines) — imprime no console.log do Worker,
// que o Cloudflare captura via `wrangler tail`. Não usa nenhuma
// dependência externa para respeitar o runtime edge.
// =====================================================================

function baseFields(extra = {}) {
  return {
    ts: new Date().toISOString(),
    service: 'lidercrm-worker',
    ...extra,
  };
}

function safeStringify(payload) {
  try { return JSON.stringify(payload); }
  catch (_e) { return JSON.stringify({ level: 'error', msg: 'log-serialize-failed' }); }
}

export const logger = {
  info(msg, meta)  { console.log(safeStringify({ level: 'info',  msg, ...baseFields(meta) })); },
  warn(msg, meta)  { console.warn(safeStringify({ level: 'warn',  msg, ...baseFields(meta) })); },
  error(msg, meta) { console.error(safeStringify({ level: 'error', msg, ...baseFields(meta) })); },
  debug(msg, meta) { console.log(safeStringify({ level: 'debug', msg, ...baseFields(meta) })); },
};

export function newRequestId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (_e) {}
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
