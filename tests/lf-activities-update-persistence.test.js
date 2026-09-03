// @vitest-environment happy-dom
// Regressão: o pós-update não pode apagar a fila local-first da Agenda.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, '..', rel), 'utf8');
const RECOVERY_SRC = read('js/patches/usuarios-auth/lf-post-update-recovery-v1-20260729.js');
const AGENDA_SRC = read('js/agenda.js');

describe('persistência de atividades durante update/sync', () => {
  it('não apaga o snapshot local-first lf13_acts_*', () => {
    expect(RECOVERY_SRC).toContain('Também não apagar lf13_acts_*');
    expect(RECOVERY_SRC).not.toMatch(/if\s*\(\/\^lf13_acts_/);
  });

  it('marca criação e edições de atividade com updatedAt', () => {
    expect(AGENDA_SRC).toContain('createdAt:actNow,updatedAt:actNow');
    expect(AGENDA_SRC).toContain('a.done=true;a.doneAt=new Date().toISOString();a.updatedAt=new Date().toISOString();');
    expect(AGENDA_SRC).toContain('a.scheduledAt=dt;a.read=false;a.updatedAt=new Date().toISOString();');
    expect(AGENDA_SRC).toContain('a.desc=desc;a.updatedAt=new Date().toISOString();');
  });

  it('não permite que um PUT antigo substitua uma lista nova no Worker', () => {
    const controller = read(' _worker_src/worker/controllers/atividades-controller.js'.trim());
    expect(controller).toContain('const incomingClientTs = Number(body.clientTs);');
    expect(controller).toContain('incomingClientTs < currentClientTs');
    expect(controller).toContain('clientTs: Number.isFinite(incomingClientTs)');
  });
});