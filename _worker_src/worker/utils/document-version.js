// Contrato único de versão para documentos legados e novos.
// A versão pública é o updated_at do registro, transportada também
// como ETag para que web e Capacitor usem o mesmo controle de concorrência.

import { ConflictError } from '../errors/http-errors.js';
import {
  deleteFsDocumentVersioned,
  documentVersion,
  setFsDocumentVersioned,
} from '../lib/fs-documents.js';

export function normalizeDocumentVersion(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw || raw === '*') return null;
  return raw.replace(/^W\/"?|^"|"?$/g, '');
}

export function expectedDocumentVersion(request, body) {
  const header = request && request.headers && request.headers.get('If-Match');
  const fromHeader = normalizeDocumentVersion(header);
  if (fromHeader) return fromHeader;
  return normalizeDocumentVersion(body && (body.version || body.expectedVersion || body._version));
}

export function documentEtag(version) {
  const normalized = normalizeDocumentVersion(version);
  return normalized ? 'W/"' + normalized + '"' : null;
}

export function versionHeaders(version) {
  const etag = documentEtag(version);
  return etag ? { ETag: etag, 'Cache-Control': 'no-cache, must-revalidate' } : {};
}

export function stripDocumentVersionFields(body) {
  const next = Object.assign({}, body || {});
  delete next.version;
  delete next.expectedVersion;
  delete next._version;
  return next;
}

export async function saveVersionedDocument(cfg, path, data, options = {}) {
  const result = await setFsDocumentVersioned(cfg, path, data, options);
  if (result && result.__conflict) {
    throw new ConflictError(
      'O documento foi alterado por outra sessão. Recarregue os dados e tente novamente.',
      {
        code: 'DOCUMENT_VERSION_CONFLICT',
        path,
        serverVersion: result.serverVersion || null,
        serverData: result.serverData || null,
      },
    );
  }
  return result;
}

export async function deleteVersionedDocument(cfg, path, options = {}) {
  const result = await deleteFsDocumentVersioned(cfg, path, options);
  if (result && result.__conflict) {
    throw new ConflictError(
      'O documento foi alterado por outra sessão. Recarregue os dados e tente novamente.',
      {
        code: 'DOCUMENT_VERSION_CONFLICT',
        path,
        serverVersion: result.serverVersion || null,
        serverData: result.serverData || null,
      },
    );
  }
  return result;
}

export { documentVersion };