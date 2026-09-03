// =====================================================================
// tests/cargos-nivel-admin-parity.test.js
// Auditoria de correção (2026-09-30) — fecha um risco de manutenção
// explicitamente documentado no comentário de CARGOS_NIVEL_ADMIN em
// usuarios-controller.js: "espelho fiel do cliente (js/auth.js:70).
// Qualquer novo cargo 'de nível admin' adicionado no cliente PRECISA
// ser refletido aqui também, senão o gate server-side fica mais
// restritivo que o cliente."
//
// Antes deste teste, essa sincronia era só mantida manualmente — sem
// nenhum teste automático pegando uma divergência futura (mesma classe
// de risco que motivou tests/cargo-caps-parity.test.js pra CARGO_CAPS,
// só que pra esta lista específica, que ainda não tinha cobertura).
// =====================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CARGOS_NIVEL_ADMIN as workerList } from '../_worker_src/worker/controllers/usuarios-controller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractClientList() {
  const src = readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
  const m = src.match(/var CARGOS_NIVEL_ADMIN\s*=\s*\[([^\]]*)\]/);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

describe('CARGOS_NIVEL_ADMIN — paridade client (js/auth.js) × worker (usuarios-controller.js)', () => {
  it('conseguiu extrair a lista de js/auth.js (sanidade do próprio teste)', () => {
    const clientList = extractClientList();
    expect(clientList).not.toBeNull();
    expect(clientList.length).toBeGreaterThan(0);
  });

  it('REGRESSÃO EXPLÍCITA: as duas listas têm exatamente os mesmos cargos, na prática (não exige mesma ordem)', () => {
    const clientList = extractClientList();
    expect([...clientList].sort()).toEqual([...workerList].sort());
  });
});
