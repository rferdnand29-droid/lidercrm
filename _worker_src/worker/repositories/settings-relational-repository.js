// =====================================================================
// settings-relational-repository.js — Fase 1 (2026-07-19)
// -----------------------------------------------------------------------
// Repositório relacional para public.settings.
// Formato: (scope, scope_id, key, value jsonb). Idempotente: nunca lança
// erro fatal (retorna null se a tabela não existir).
// =====================================================================

import { selectFrom, insertInto, updateWhere, deleteWhere } from '../lib/supabase-rest.js';

const SETTINGS = 'settings';

export async function getSetting(cfg, scope, scopeId, key) {
  try {
    const filters = {
      scope: 'eq.' + (scope || 'global'),
      key: 'eq.' + String(key || ''),
    };
    if (scopeId) filters.scope_id = 'eq.' + scopeId;
    else filters.scope_id = 'is.null';

    const { rows } = await selectFrom(cfg, SETTINGS, {
      filters,
      select: '*',
      limit: 1,
    });
    return (rows && rows[0]) || null;
  } catch (_e) {
    return null;
  }
}

export async function setSetting(cfg, scope, scopeId, key, value) {
  const existing = await getSetting(cfg, scope, scopeId, key);
  const now = new Date().toISOString();
  try {
    if (existing) {
      return await updateWhere(cfg, SETTINGS, { id: 'eq.' + existing.id }, {
        value: value == null ? {} : value,
        updated_at: now,
      });
    }
    return await insertInto(cfg, SETTINGS, {
      scope: scope || 'global',
      scope_id: scopeId || null,
      key: String(key || ''),
      value: value == null ? {} : value,
      updated_at: now,
    });
  } catch (_e) {
    return null;
  }
}

export async function deleteSetting(cfg, scope, scopeId, key) {
  const existing = await getSetting(cfg, scope, scopeId, key);
  if (!existing) return false;
  try {
    await deleteWhere(cfg, SETTINGS, { id: 'eq.' + existing.id });
    return true;
  } catch (_e) {
    return false;
  }
}

export async function listSettings(cfg, scope, scopeId) {
  try {
    const filters = { scope: 'eq.' + (scope || 'global') };
    if (scopeId) filters.scope_id = 'eq.' + scopeId;
    else filters.scope_id = 'is.null';
    const { rows } = await selectFrom(cfg, SETTINGS, {
      filters, select: '*', limit: 500,
    });
    return rows || [];
  } catch (_e) {
    return [];
  }
}
