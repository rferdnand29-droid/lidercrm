// =====================================================================
// repositories/index.js
// Instâncias tipadas por domínio.
// =====================================================================

import { BaseRepository } from './base-repository.js';

export const clientesRepo     = new BaseRepository('clientes');
export const leadsRepo        = new BaseRepository('leads');
export const usuariosRepo     = new BaseRepository('usuarios');
export const documentosRepo   = new BaseRepository('documentos');
export const notificacoesRepo  = new BaseRepository('notificacoes');
export const securityEventsRepo = new BaseRepository('security_events');
export const financeiroRepo    = new BaseRepository('financeiro');
export const uploadsRepo       = new BaseRepository('uploads');
