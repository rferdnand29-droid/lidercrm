// @vitest-environment happy-dom
// Regressão: uma atualização/reload não pode apagar uma anotação que ainda
// está localmente salva ou impedir que ela seja reenviada para a nuvem.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.join(__dirname, '..', rel), 'utf8');
const APP_SRC = src('js/app.js');
const RECOVERY_SRC = src('js/patches/usuarios-auth/lf-post-update-recovery-v1-20260729.js');
const KANBAN_SRC = src('js/kanban.js');

describe('persistência de anotações durante update/sync', () => {
  it('não regrava lf_app_ver como uma versão antiga em todo boot', () => {
    expect(APP_SRC).toContain(
      "if(!localStorage.getItem('lf_app_ver'))localStorage.setItem('lf_app_ver','lf_v13');",
    );
    expect(APP_SRC).not.toContain(
      "try{localStorage.setItem('lf_app_ver','lf_v13');}catch(e){",
    );
  });

  it('não apaga snapshots local-first do Kanban no pós-update', () => {
    expect(RECOVERY_SRC).toContain('NÃO apagar lf6_kb_* nem lf6_c_*');
    expect(RECOVERY_SRC).not.toMatch(/if\s*\(\/\^lf6_kb_/);
    expect(RECOVERY_SRC).not.toMatch(/if\s*\(\/\^lf6_c_/);
  });

  it('reconcilia uma edição local mesmo quando a quantidade de cards é igual', () => {
    expect(KANBAN_SRC).toContain('function _kbNeedsRemoteReconcile(server,merged)');
    expect(KANBAN_SRC.match(/if\(_kbNeedsRemoteReconcile\(server,merged\)/g)).toHaveLength(3);
  });
});