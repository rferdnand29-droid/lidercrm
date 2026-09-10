// =====================================================================
// tests/cargo-caps-parity.test.js
// AUDITORIA-FINAL-10 (2026-08-01, item 1.2) — teste de regressão pro
// achado §7.1 da auditoria técnica: CARGO_CAPS existe em DOIS lugares
// (js/auth.js client e _worker_src/worker/middlewares/authz.js worker),
// mantidos em sincronia MANUALMENTE. Este teste pega automaticamente
// qualquer divergência futura — antes disso, só revisão manual pegava.
//
// Não importamos js/auth.js diretamente: é um script global (sem
// import/export, depende de `window`), não um módulo ES — rodar em
// Node/Vitest exigiria mocks pesados só pra ler um objeto literal.
// Em vez disso, lemos o arquivo como texto e extraímos os nomes de
// cargo top-level via regex. Se o padrão de `js/auth.js` mudar de
// forma que quebre esse regex, este teste falha com uma mensagem
// clara (não silenciosamente) — ver o `expect` de sanidade abaixo.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  CARGO_CAPS as workerCargoCaps,
  CARGO_CAPS_DEFAULT as workerCargoCapsDefault,
} from '../_worker_src/worker/middlewares/authz.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractTopLevelCargoKeys(fileText, varName) {
  // Casa `nomeDoCargo:      { ... }` — só chaves cujo valor É um objeto
  // literal (distingue de chaves aninhadas como `escopo:'self'`, cujo
  // valor não começa com `{`).
  const blockRe = new RegExp(varName + '\\s*=\\s*\\{([\\s\\S]*?)\\n\\};');
  const block = fileText.match(blockRe);
  if (!block) return null;
  const keyRe = /^\s*([a-zA-Z0-9_]+):\s*\{/gm;
  const keys = [];
  let m;
  while ((m = keyRe.exec(block[1])) !== null) keys.push(m[1]);
  return keys;
}

describe('CARGO_CAPS — paridade client (js/auth.js) × worker (authz.js)', () => {
  const clientSrc = readFileSync(path.join(__dirname, '..', 'js', 'auth.js'), 'utf8');
  const clientKeys = extractTopLevelCargoKeys(clientSrc, 'var CARGO_CAPS');

  it('conseguiu extrair CARGO_CAPS de js/auth.js (sanidade do próprio teste)', () => {
    expect(clientKeys).not.toBeNull();
    expect(clientKeys.length).toBeGreaterThan(0);
  });

  it('tem exatamente os mesmos nomes de cargo nos dois lados', () => {
    const workerKeys = Object.keys(workerCargoCaps);
    expect([...clientKeys].sort()).toEqual([...workerKeys].sort());
  });

  it('cada cargo tem as mesmas 7 dimensões de capacidade nos dois lados', () => {
    const clientBlock = clientSrc.match(/var CARGO_CAPS\s*=\s*\{([\s\S]*?)\n\};/)[1];
    for (const cargo of Object.keys(workerCargoCaps)) {
      const workerDims = Object.keys(workerCargoCaps[cargo]).sort();
      // extrai só a linha desse cargo no client e lista as dimensões citadas
      const lineRe = new RegExp('^\\s*' + cargo + ':\\s*\\{([^}]*)\\}', 'm');
      const line = clientBlock.match(lineRe);
      expect(line, `cargo "${cargo}" não encontrado em js/auth.js`).not.toBeNull();
      const clientDims = [...line[1].matchAll(/([a-zA-Z0-9_]+):/g)].map((mm) => mm[1]).sort();
      expect(clientDims, `dimensões de "${cargo}" divergem entre client e worker`).toEqual(
        workerDims
      );
    }
  });

  it('CARGO_CAPS_DEFAULT tem as mesmas dimensões nos dois lados', () => {
    const defaultKeys = Object.keys(workerCargoCapsDefault).sort();
    const clientDefaultLine = clientSrc.match(/var CARGO_CAPS_DEFAULT\s*=\s*\{([^}]*)\}/);
    expect(clientDefaultLine).not.toBeNull();
    const clientDefaultKeys = [...clientDefaultLine[1].matchAll(/([a-zA-Z0-9_]+):/g)]
      .map((m) => m[1])
      .sort();
    expect(clientDefaultKeys).toEqual(defaultKeys);
  });
});
