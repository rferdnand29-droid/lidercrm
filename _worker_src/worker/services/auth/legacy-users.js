import { getFsDocument, setFsDocument, listFsChildren } from '../../lib/fs-documents.js';
import { NotFoundError } from '../../errors/http-errors.js';
import { USERS_PARENT, USERS_LEGACY_DOC } from './constants.js';

export async function loadLegacyUsers(cfg) {
  let lastError = null;

  try {
    const items = await listFsChildren(cfg, USERS_PARENT);
    if (Array.isArray(items) && items.length) return items;
  } catch (error) {
    lastError = error;
  }

  try {
    const doc = await getFsDocument(cfg, USERS_LEGACY_DOC);
    if (doc && Array.isArray(doc.list)) return doc.list;
  } catch (error) {
    lastError = error;
  }

  if (lastError) {
    const err = new Error('legacy_lookup_failed: ' + ((lastError && lastError.message) || String(lastError)));
    err.cause = lastError;
    throw err;
  }

  return [];
}

export function findLegacyUserByEmail(users, email) {
  const target = String(email || '').trim().toLowerCase();
  if (!target) return null;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (!user || user.ativo === false) continue;
    const current = String(user.email || '').trim().toLowerCase();
    if (current && current === target) return user;
  }

  return null;
}

export function findLegacyUserByIdentity(users, uid, email) {
  const cleanUid = String(uid || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();

  return users.find((user) => {
    if (!user || user.ativo === false) return false;
    const idMatch = String(user.id || user.uid || '') === cleanUid;
    const emailMatch = String(user.email || '').trim().toLowerCase() === cleanEmail;
    return idMatch && emailMatch;
  }) || null;
}

export async function loadLegacyUserById(cfg, uid) {
  const safe = String(uid || '').trim();
  if (!safe) return null;

  const item = await getFsDocument(cfg, USERS_PARENT + '/' + safe);
  if (item) return { user: item, storage: 'items', path: USERS_PARENT + '/' + safe };

  const legacy = await getFsDocument(cfg, USERS_LEGACY_DOC);
  if (legacy && Array.isArray(legacy.list)) {
    const index = legacy.list.findIndex((user) => user && String(user.id || user.uid || '') === safe);
    if (index >= 0) {
      return {
        user: legacy.list[index],
        storage: 'legacy-list',
        index,
        doc: legacy,
        path: USERS_LEGACY_DOC,
      };
    }
  }

  return null;
}

export async function writeBackNewPh(cfg, found, newPh) {
  const now = new Date().toISOString();

  if (found.storage === 'items') {
    const next = Object.assign({}, found.user, { ph: newPh, passwordUpdatedAt: now, updatedAt: now });
    await setFsDocument(cfg, found.path, next);
    return next;
  }

  const doc = found.doc || {};
  const list = Array.isArray(doc.list) ? doc.list.slice() : [];
  const index = typeof found.index === 'number'
    ? found.index
    : list.findIndex((user) => user && String(user.id || user.uid || '') === String(found.user.id || found.user.uid || ''));

  if (index < 0) throw new NotFoundError('Usuário não encontrado no doc legado.');

  list[index] = Object.assign({}, list[index], { ph: newPh, passwordUpdatedAt: now });
  const nextDoc = Object.assign({}, doc, { list, updatedAt: now });
  await setFsDocument(cfg, found.path, nextDoc);
  return list[index];
}
