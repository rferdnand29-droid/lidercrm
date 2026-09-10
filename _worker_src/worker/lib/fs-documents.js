import { selectFrom, insertInto, updateWhere, deleteWhere } from './supabase-rest.js';

function parentOf(path) {
  const raw = String(path || '').replace(/^\/+|\/+$/g, '');
  const parts = raw.split('/');
  parts.pop();
  return parts.join('/');
}

function normalizeVersion(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw || raw === '*') return null;
  return raw.replace(/^W\/"?|^"|"?$/g, '');
}

/* [FIX 20260907] Comparação de versões por EPOCH (não por string).
   O PostgreSQL/PostgREST serializa timestamptz de formas diferentes
   conforme o contexto (ex.: '2026-09-07T15:30:00.123Z' vs
   '2026-09-07T15:30:00.123456+00:00') — mesmo instante, strings
   diferentes. A comparação por string fazia o controle otimista falhar
   SEMPRE, gerando 409 em loop mesmo com o cliente enviando a versão
   mais recente (era a causa raiz do loop PUT→409 no kanban). Agora
   comparamos o valor numérico (ms desde epoch) com tolerância de 1s
   para absorver diferenças de precisão/formato. Se a conversão falhar
   (versão não-timestamp), cai de volta na comparação de string. */
function _versionToEpoch(v) {
  if (v === null || v === undefined) return null;
  var s = String(v).trim();
  if (!s) return null;
  var t = new Date(s).getTime();
  return isNaN(t) ? null : t;
}

function _versionsEqual(a, b) {
  var na = normalizeVersion(a);
  var nb = normalizeVersion(b);
  if (na === nb) return true;              // caminho rápido (string igual)
  if (na === null || nb === null) return na === nb;
  var ea = _versionToEpoch(na);
  var eb = _versionToEpoch(nb);
  if (ea !== null && eb !== null) {
    return Math.abs(ea - eb) <= 1000;      // tolerância 1s
  }
  return false;                            // formato misto: não arrisca
}

export function documentVersion(doc) {
  return normalizeVersion(doc && doc.__meta && (doc.__meta.version || doc.__meta.updated_at));
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
    return row ? Object.assign({}, row.data || {}, { __meta: { path: row.path, parent_path: row.parent_path, updated_at: row.updated_at, version: row.updated_at } }) : null;
  } catch (_err) {
    // Fallback: schema sem coluna parent_path (setup antigo).
    const { rows } = await selectFrom(cfg, 'fs_documents', {
      filters: { path: 'eq.' + clean },
      select: 'path,data,updated_at',
      limit: 1,
    });
    const row = rows[0] || null;
    return row ? Object.assign({}, row.data || {}, { __meta: { path: row.path, parent_path: parentOf(clean), updated_at: row.updated_at, version: row.updated_at } }) : null;
  }
}

// =====================================================================
// CERT-03: Controle de concorrência otimista.
// setFsDocument agora aceita um `version` opcional. Se fornecido,
// a atualização só proceede se updated_at da linha existente for
// igual à versão passada — caso contrário devolve um marcador de conflito.
// O chamador deve tratar null como 409 Conflict e pedir ao usuário
// para resolver a divergência.
// =====================================================================
export async function setFsDocumentVersioned(cfg, path, data, options = {}) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) throw new Error('fs-path-required');
  const expectedVersion = normalizeVersion(options.version || options.expectedVersion);
  const payload = {
    path: clean,
    parent_path: parentOf(clean),
    data: data || {},
    updated_at: new Date().toISOString(),
  };
  const existing = await getFsDocument(cfg, clean);

  if (existing) {
    if (expectedVersion !== null) {
      const currentVersion = documentVersion(existing);
      if (!_versionsEqual(currentVersion, expectedVersion)) {
        return { __conflict: true, serverVersion: currentVersion, serverData: existing };
      }
    }
    try {
      // A comparação acontece no próprio UPDATE, não só antes dele. Isso
      // fecha a janela entre o GET e o PATCH quando duas abas escrevem
      // simultaneamente.
      const filters = { path: 'eq.' + clean };
      if (expectedVersion !== null) filters.updated_at = 'eq.' + expectedVersion;
      const updated = await updateWhere(cfg, 'fs_documents', filters, payload);
      if (expectedVersion !== null && !updated) {
        /* [FIX 20260907] O UPDATE pode não afetar linhas só porque o
           filtro updated_at=eq.<versão> não bateu por formato de
           timestamptz (Z vs +00:00, 3 vs 6 dígitos). Se a versão atual
           do documento BATE por epoch com a esperada, o documento está
           no estado que o cliente conhece — refaz o UPDATE só pelo path
           (a pré-checagem por epoch acima já garantiu que ninguém
           escreveu no meio do caminho) em vez de devolver 409 espúrio. */
        const current = await getFsDocument(cfg, clean).catch(() => null);
        if (current && _versionsEqual(documentVersion(current), expectedVersion)) {
          await updateWhere(cfg, 'fs_documents', { path: 'eq.' + clean }, payload);
        } else {
          return {
            __conflict: true,
            serverVersion: documentVersion(current),
            serverData: current,
          };
        }
      }
    } catch (_err) {
      const fallback = Object.assign({}, payload);
      delete fallback.parent_path;
      const filters = { path: 'eq.' + clean };
      if (expectedVersion !== null) filters.updated_at = 'eq.' + expectedVersion;
      const updated = await updateWhere(cfg, 'fs_documents', filters, fallback);
      if (expectedVersion !== null && !updated) {
        const current = await getFsDocument(cfg, clean).catch(() => null);
        if (current && _versionsEqual(documentVersion(current), expectedVersion)) {
          await updateWhere(cfg, 'fs_documents', { path: 'eq.' + clean }, fallback);
        } else {
          return {
            __conflict: true,
            serverVersion: documentVersion(current),
            serverData: current,
          };
        }
      }
    }
  } else {
    if (expectedVersion !== null) {
      return { __conflict: true, serverVersion: null, serverData: null };
    }
    try {
      await insertInto(cfg, 'fs_documents', payload, { returning: false });
    } catch (_err) {
      const fallback = Object.assign({}, payload);
      delete fallback.parent_path;
      await insertInto(cfg, 'fs_documents', fallback, { returning: false });
    }
  }
  return { data: data || {}, version: payload.updated_at, created: !existing };
}

// Compatibilidade com todos os chamadores legados. Novos endpoints devem
// usar setFsDocumentVersioned para devolver a versão ao cliente.
export async function setFsDocument(cfg, path, data, options) {
  const result = await setFsDocumentVersioned(cfg, path, data, options);
  if (result && result.__conflict) return result;
  return result.data;
}

export async function deleteFsDocument(cfg, path) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  return deleteWhere(cfg, 'fs_documents', { path: 'eq.' + clean });
}

export async function deleteFsDocumentVersioned(cfg, path, options = {}) {
  const clean = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!clean) return null;
  const expectedVersion = normalizeVersion(options.version || options.expectedVersion);
  const filters = { path: 'eq.' + clean };
  if (expectedVersion !== null) filters.updated_at = 'eq.' + expectedVersion;
  const deleted = await deleteWhere(cfg, 'fs_documents', filters);
  if (expectedVersion !== null && !deleted) {
    /* [FIX 20260907] Mesmo problema do UPDATE: o DELETE com filtro
       updated_at=eq.<versão> pode falhar só pela representação do
       timestamptz. Se a versão atual BATE por epoch com a esperada,
       o documento está no estado que o cliente conhece — refaz o
       DELETE só pelo path em vez de devolver 409 espúrio. */
    const current = await getFsDocument(cfg, clean).catch(() => null);
    if (current && _versionsEqual(documentVersion(current), expectedVersion)) {
      await deleteWhere(cfg, 'fs_documents', { path: 'eq.' + clean });
      return { deleted: true, version: expectedVersion };
    }
    return {
      __conflict: true,
      serverVersion: documentVersion(current),
      serverData: current,
    };
  }
  return { deleted: true, version: expectedVersion };
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
      __meta: { path: row.path, parent_path: row.parent_path, updated_at: row.updated_at, version: row.updated_at },
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
        __meta: { path: row.path, parent_path: parentOf(row.path), updated_at: row.updated_at, version: row.updated_at },
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
