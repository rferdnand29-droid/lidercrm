#!/usr/bin/env node
// =====================================================================
// scripts/install-git-hooks.mjs
// ---------------------------------------------------------------------
// Copia githooks/* pra .git/hooks/* (com permissão de execução).
// Roda sozinho via o script "prepare" do package.json — o npm executa
// "prepare" automaticamente depois de `npm install` / `npm ci`, então
// todo mundo que clona o repo e instala as deps já sai com o hook de
// pre-commit instalado, sem passo manual nenhum.
//
// Não depende de nenhum pacote novo (sem husky/simple-git-hooks) —
// só node:fs, conforme a regra do AI_CONTRACT.md de não adicionar
// dependência sem confirmação humana.
//
// Se não houver .git (ex.: instalação a partir de um zip exportado,
// checkout raso sem histórico, ambiente de CI que só roda `npm ci`
// sobre um tarball) — não falha o `npm install`; só avisa e sai OK.
// =====================================================================
import { existsSync, mkdirSync, copyFileSync, chmodSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'githooks');
const GIT_DIR = join(ROOT, '.git');
const DEST = join(GIT_DIR, 'hooks');

if (!existsSync(GIT_DIR)) {
  console.log('[install-git-hooks] sem .git/ aqui (zip exportado ou checkout sem histórico) — pulando.');
  process.exit(0);
}

if (!existsSync(SRC)) {
  console.log('[install-git-hooks] githooks/ não encontrado — nada pra instalar.');
  process.exit(0);
}

mkdirSync(DEST, { recursive: true });

let installed = 0;
for (const name of readdirSync(SRC)) {
  const from = join(SRC, name);
  const to = join(DEST, name);
  copyFileSync(from, to);
  try {
    chmodSync(to, 0o755);
  } catch {
    /* Windows: chmod é no-op — git for Windows lida com isso sozinho. */
  }
  installed++;
}

console.log(`[install-git-hooks] ${installed} hook(s) instalado(s) em .git/hooks/ (fonte: githooks/).`);
