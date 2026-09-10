#!/usr/bin/env node
/**
 * Mantém os entrypoints HTML do site em uma direção única:
 *
 *   index.html  →  app.html
 *
 * O navegador e o Capacitor continuam podendo abrir qualquer um dos dois
 * caminhos, mas só index.html deve ser editado. app.html é um artefato
 * gerado para compatibilidade com links/rotas antigas.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CANONICAL = join(ROOT, 'index.html');
const MIRROR = join(ROOT, 'app.html');

export function syncEntryHtml() {
  if (!existsSync(CANONICAL)) {
    throw new Error(`Entry HTML oficial não encontrado: ${CANONICAL}`);
  }

  const source = readFileSync(CANONICAL, 'utf8');
  const current = existsSync(MIRROR) ? readFileSync(MIRROR, 'utf8') : null;

  if (source === current) {
    console.log('✅ app.html já está sincronizado com index.html.');
    return false;
  }

  writeFileSync(MIRROR, source, 'utf8');
  console.log('✅ app.html gerado a partir de index.html.');
  return true;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  syncEntryHtml();
}