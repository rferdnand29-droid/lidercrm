// Falhas de dual-write não podem desaparecer em catch vazio. O registro usa
// fs_documents por ser a única superfície já disponível em instalações antigas
// e pode ser drenado/reprocessado depois pela operação.

import { setFsDocumentVersioned } from '../lib/fs-documents.js';
import { logger } from '../utils/logger.js';

function failureId() {
  const suffix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 12);
  return Date.now().toString(36) + '-' + suffix;
}

function errorDetails(error) {
  return {
    name: error && error.name ? String(error.name).slice(0, 120) : 'Error',
    message: error && error.message ? String(error.message).slice(0, 500) : String(error || 'unknown'),
    status: error && error.status ? Number(error.status) : null,
    code: error && error.code ? String(error.code).slice(0, 120) : null,
  };
}

export async function recordSyncFailure(cfg, details) {
  const id = failureId();
  const payload = {
    id,
    status: 'pending',
    createdAt: new Date().toISOString(),
    attempts: 0,
    domain: details.domain || 'unknown',
    operation: details.operation || 'unknown',
    primary: details.primary || null,
    mirror: details.mirror || null,
    key: details.key || null,
    payload: details.payload || null,
    error: errorDetails(details.error),
  };
  try {
    await setFsDocumentVersioned(cfg, 'sync/failures/' + id, payload);
    logger.warn('sync.failure.recorded', {
      failureId: id,
      domain: payload.domain,
      operation: payload.operation,
      mirror: payload.mirror,
    });
    return payload;
  } catch (recordError) {
    // A falha no próprio registro é operacionalmente relevante e precisa
    // continuar visível no tail do Worker.
    logger.error('sync.failure.record_failed', {
      failureId: id,
      domain: payload.domain,
      operation: payload.operation,
      error: errorDetails(recordError),
      originalError: payload.error,
    });
    return null;
  }
}

export async function mirrorOrRecord(cfg, details, mirrorWrite) {
  try {
    await mirrorWrite();
    return { mirrored: true, failure: null };
  } catch (error) {
    const failure = await recordSyncFailure(cfg, Object.assign({}, details, { error }));
    return { mirrored: false, failure };
  }
}