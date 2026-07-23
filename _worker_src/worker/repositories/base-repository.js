// =====================================================================
// base-repository.js (backend)
// Camada fina sobre supabase-rest para as tabelas usadas pelas rotas v1.
// =====================================================================

import * as sb from '../lib/supabase-rest.js';

export class BaseRepository {
  constructor(table) {
    this.table = table;
  }
  async list(cfg, options = {}) {
    return sb.selectFrom(cfg, this.table, options);
  }
  async findOne(cfg, filters, select = '*') {
    const { rows } = await sb.selectFrom(cfg, this.table, {
      filters: filters, select, limit: 1,
    });
    return rows[0] || null;
  }
  async insert(cfg, payload) { return sb.insertInto(cfg, this.table, payload); }
  async update(cfg, filters, patch) { return sb.updateWhere(cfg, this.table, filters, patch); }
  async remove(cfg, filters) { return sb.deleteWhere(cfg, this.table, filters); }
}
