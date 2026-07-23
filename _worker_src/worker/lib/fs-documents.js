import { selectFrom, insertInto, updateWhere, deleteWhere } from './supabase-rest.js';

function parentOf(path) {
  const raw = String(path || '').replace(/^\/+|\/+$/g, '');
  const parts = raw.split('/');
  parts.pop();
  return parts.join('/');
}

export async function getFsDocument(cfg, path) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  // CORREÇÃO (2026-07-17): tenta primeiro com `parent_path` na projection.
  // Se a coluna não existir no schema do Supabase (setup antigo sem a
  // coluna), o PostgREST retorna erro 400 — neste caso faz fallback pra
  // uma query sem `parent_path`, garantindo compatibilidade retroativa.
  try {
    const { rows } = await selectFrom(cfg, 'fs_documents', {
      filters: { path: 'eq.' + clean },
      select: 'path,parent_path,data,updated_at',
      limit: 1,
    });
    const row = rows[0] || null;
    return row ? Object.assign({}, row.data || {}, { __meta: { path: row.path, parent_path: row.parent_path, updated_at: row.updated_at } }) : null;
  } catch (_err) {
    // Fallback: schema sem coluna parent_path (setup antigo).
    const { rows } = await selectFrom(cfg, 'fs_documents', {
      filters: { path: 'eq.' + clean },
      select: 'path,data,updated_at',
      limit: 1,
    });
    const row = rows[0] || null;
    return row ? Object.assign({}, row.data || {}, { __meta: { path: row.path, parent_path: parentOf(clean), updated_at: row.updated_at } }) : null;
  }
}

// =====================================================================
// CERT-03: Controle de concorrência otimista.
// setFsDocument agora aceita um `version` opcional. Se fornecido,
// a atualização só proceede se updated_at da linha existente for
// igual ao version passado — caso contrário retorna null (conflito).
// O chamador deve tratar null como 409 Conflict e pedir ao usuário
// para resolver a divergência.
// =====================================================================
export async function setFsDocument(cfg, path, data, options) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) throw new Error('fs-path-required');
  const expectedVersion = options && options.version ? options.version : null;
  const payload = {
    path: clean,
    parent_path: parentOf(clean),
    data: data || {},
    updated_at: new Date().toISOString(),
  };
  const existing = await getFsDocument(cfg, clean);

  if (existing) {
    // CERT-03: Concorrência otimista — se version foi fornecido e
    // não bate com o updated_at atual, é conflito.
    if (expectedVersion !== null) {
      const currentVersion = (existing.__meta && existing.__meta.updated_at) || null;
      if (currentVersion !== expectedVersion) {
        return { __conflict: true, serverVersion: currentVersion, serverData: existing };
      }
    }
    try {
      await updateWhere(cfg, 'fs_documents', { path: 'eq.' + clean }, payload);
    } catch (_err) {
      const fallback = Object.assign({}, payload);
      delete fallback.parent_path;
      await updateWhere(cfg, 'fs_documents', { path: 'eq.' + clean }, fallback);
    }
  } else {
    try {
      await insertInto(cfg, 'fs_documents', payload, { returning: false });
    } catch (_err) {
      const fallback = Object.assign({}, payload);
      delete fallback.parent_path;
      await insertInto(cfg, 'fs_documents', fallback, { returning: false });
    }
  }
  return data || {};
}

export async function deleteFsDocument(cfg, path) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  return deleteWhere(cfg, 'fs_documents', { path: 'eq.' + clean });
}

export async function listFsChildren(cfg, parentPath) {
  const clean = String(parentPath || '').replace(/^\/+|\/+$/g, '');
  // CORREÇÃO (2026-07-17): tenta filtrar por parent_path; se a coluna
  // não existir no schema (setup antigo), faz fallback lendo TODOS os
  // documentos e filtrando client-side por prefixo do path. É menos
  // eficiente mas garante que o login não quebra por causa de schema.
  try {
    const { rows } = await selectFrom(cfg, 'fs_documents', {
      filters: { parent_path: 'eq.' + clean },
      select: 'path,parent_path,data,updated_at',
      order: 'updated_at.desc',
      limit: 1000,
    });
    return (rows || []).map((row) => Object.assign({}, row.data || {}, {
      __meta: { path: row.path, parent_path: row.parent_path, updated_at: row.updated_at },
    }));
  } catch (_err) {
    // Fallback: sem coluna parent_path — busca tudo e filtra por prefixo.
    const { rows } = await selectFrom(cfg, 'fs_documents', {
      select: 'path,data,updated_at',
      order: 'updated_at.desc',
      limit: 1000,
    });
    const prefix = clean + '/';
    return (rows || []).filter((row) => String(row.path || '').startsWith(prefix))
      .map((row) => Object.assign({}, row.data || {}, {
        __meta: { path: row.path, parent_path: parentOf(row.path), updated_at: row.updated_at },
      }));
  }
}

export async function upsertFsDocuments(cfg, entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    await setFsDocument(cfg, item.path, item.data || {});
  }
  return list.length;
}
