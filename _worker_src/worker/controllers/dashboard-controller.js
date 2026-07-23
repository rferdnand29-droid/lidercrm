// =====================================================================
// dashboard-controller.js — Fase 1 relacional (2026-07-19)
// -----------------------------------------------------------------------
// Estratégia dual:
//   • Tenta ler agregados de public.leads / public.clients / public.business
//     (tabelas relacionais). Se vieram vazias (ainda não há dados
//     migrados), cai no comportamento antigo que consulta os repos
//     legados (clientesRepo, leadsRepo, financeiroRepo).
//   • Nunca lança erro fatal: cada Promise tem seu .catch(() => vazio).
//   • Formato de resposta IDÊNTICO ao antigo — o frontend do dashboard
//     não precisa mudar nada.
// =====================================================================

import { respondWithCache } from '../utils/etag.js';
import { clientesRepo, leadsRepo, financeiroRepo } from '../repositories/index.js';
import { selectFrom } from '../lib/supabase-rest.js';

async function safeSelect(cfg, table, opts) {
  try {
    const { rows } = await selectFrom(cfg, table, opts);
    return rows || [];
  } catch (_e) {
    return null; // null = tabela indisponível/vazia; [] = tabela vazia mas ok
  }
}

function groupBy(rows, field) {
  const out = {};
  (rows || []).forEach((r) => {
    const key = r && r[field] ? r[field] : 'indefinido';
    out[key] = (out[key] || 0) + 1;
  });
  return out;
}

export async function getDashboard(request, ctx) {
  const cfg = ctx.cfg;

  // ------- 1) Tenta o RELACIONAL primeiro -------
  const [relClients, relLeads, relBusiness] = await Promise.all([
    safeSelect(cfg, 'clients', { select: 'id,extra', limit: 2000 }),
    safeSelect(cfg, 'leads',   { select: 'id,status,created_at', limit: 2000 }),
    safeSelect(cfg, 'business',{ select: 'id,status,value', limit: 2000 }),
  ]);

  const hasRelational =
    (Array.isArray(relClients) && relClients.length > 0) ||
    (Array.isArray(relLeads)   && relLeads.length   > 0) ||
    (Array.isArray(relBusiness)&& relBusiness.length> 0);

  if (hasRelational) {
    const clientesCount = (relClients || []).length;
    const leadsPorStatus = groupBy(relLeads || [], 'status');
    const businessOpen = (relBusiness || []).filter(b => b.status === 'open');
    const businessWon  = (relBusiness || []).filter(b => b.status === 'won');
    const businessLost = (relBusiness || []).filter(b => b.status === 'lost');

    const totalReceitas = businessWon.reduce((s, r) => s + Number(r.value || 0), 0);
    const totalPipeline = businessOpen.reduce((s, r) => s + Number(r.value || 0), 0);

    const summary = {
      totals: {
        clientes:  clientesCount,
        leads:     (relLeads || []).length,
        receitas:  totalReceitas,
        despesas:  0,                          // financeiro ainda é legado
        saldo:     totalReceitas,
        pipeline:  totalPipeline,
        ganhos:    businessWon.length,
        perdidos:  businessLost.length,
      },
      clientesPorStatus: { indefinido: clientesCount },
      leadsPorStatus,
      _source: 'relational',
    };

    return respondWithCache(request, summary,
      { endpoint: '/api/v1/dashboard', source: 'relational' },
      { maxAge: 15, extraHeaders: ctx.headers });
  }

  // ------- 2) Fallback LEGADO (fs_documents via repos) -------
  const [clientes, leads, financeiro] = await Promise.all([
    clientesRepo.list(cfg,   { select: 'id,status', limit: 1000 }).catch(() => ({ rows: [] })),
    leadsRepo.list(cfg,      { select: 'id,status,created_at', limit: 1000 }).catch(() => ({ rows: [] })),
    financeiroRepo.list(cfg, { select: 'id,valor,tipo,status', limit: 1000 }).catch(() => ({ rows: [] })),
  ]);

  const clientesPorStatus = groupBy(clientes.rows, 'status');
  const leadsPorStatus    = groupBy(leads.rows,    'status');
  const totalReceitas = (financeiro.rows || []).filter(r => r.tipo === 'receita').reduce((s, r) => s + Number(r.valor || 0), 0);
  const totalDespesas = (financeiro.rows || []).filter(r => r.tipo === 'despesa').reduce((s, r) => s + Number(r.valor || 0), 0);

  const summary = {
    totals: {
      clientes: (clientes.rows || []).length,
      leads:    (leads.rows    || []).length,
      receitas: totalReceitas,
      despesas: totalDespesas,
      saldo:    totalReceitas - totalDespesas,
    },
    clientesPorStatus,
    leadsPorStatus,
    _source: 'legacy',
  };

  return respondWithCache(request, summary,
    { endpoint: '/api/v1/dashboard', source: 'legacy' },
    { maxAge: 15, extraHeaders: ctx.headers });
}
