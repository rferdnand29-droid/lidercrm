// =====================================================================
// repositories/index.js
// Instâncias tipadas por domínio.
// =====================================================================

import { BaseRepository } from './base-repository.js';

// CORRIGIDO 2026-08-01: os nomes abaixo eram em português (assumidos pelo
// código), mas o banco real usa nomes em inglês para várias tabelas — só
// descoberto ao investigar o erro de índice em `leads`. Corrigidos os 3
// com confirmação direta via information_schema. `financeiroRepo` aponta
// pra uma tabela que NÃO EXISTE (ver docs/AUDITORIA-TECNICA-20260801.md
// §15) — mantido como estava, é uma funcionalidade nunca implementada no
// banco, não um erro de nome. `documentosRepo`/`uploadsRepo` também
// suspeitos mas NÃO corrigidos — sem confirmação do nome real ainda.
export const clientesRepo     = new BaseRepository('clients');
export const leadsRepo        = new BaseRepository('leads');
export const usuariosRepo     = new BaseRepository('users');
export const documentosRepo   = new BaseRepository('documentos'); // AINDA suspeito — schema (titulo/tipo/cliente_id/storage_path/content) não bate com nenhuma tabela real confirmada até agora; não corrigido por falta de evidência
export const notificacoesRepo  = new BaseRepository('notifications');
export const securityEventsRepo = new BaseRepository('security_events');
export const financeiroRepo    = new BaseRepository('financeiro'); // tabela não existe — ver auditoria §15
export const uploadsRepo       = new BaseRepository('attachments'); // CORRIGIDO 2026-08-01 — confirmado via information_schema
