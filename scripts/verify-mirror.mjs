#!/usr/bin/env node
// =====================================================================
// scripts/verify-mirror.mjs
// ---------------------------------------------------------------------
// Verifica que www/ (usado pelo Capacitor Android/iOS) bate byte-a-byte
// com os arquivos da raiz (usados pela Cloudflare Pages), incluindo os
// entrypoints HTML.
//
// Regra: www/ é ESPELHO GERADO. Toda vez que uma IA edita um arquivo em
// js/ e "esquece" de espelhar em www/ (ou vice-versa), o mobile fica com
// código antigo e o bug volta. Este script pega isso ANTES do commit.
// =====================================================================
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const PAIRS = [
  { canonical: 'js', mirror: 'www/js' },
  { canonical: 'src', mirror: 'www/src' },
];
const HTML_PAIRS = [
  { canonical: 'index.html', mirror: 'app.html' },
  { canonical: 'index.html', mirror: 'www/index.html' },
  { canonical: 'app.html', mirror: 'www/app.html' },
];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
function sha(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

let diverged = 0;
let onlyCanonical = 0;
let onlyMirror = 0;

for (const { canonical, mirror } of HTML_PAIRS) {
  const hasA = existsSync(canonical);
  const hasB = existsSync(mirror);
  if (hasA && !hasB) {
    console.log(`\x1b[33m[só em raiz]\x1b[0m ${mirror}`);
    onlyCanonical++;
  } else if (!hasA && hasB) {
    console.log(`\x1b[33m[só no mirror]\x1b[0m ${canonical}`);
    onlyMirror++;
  } else if (hasA && hasB && sha(canonical) !== sha(mirror)) {
    console.log(`\x1b[31m[HTML divergente]\x1b[0m ${canonical} ≠ ${mirror}`);
    diverged++;
  }
}

for (const { canonical, mirror } of PAIRS) {
  const canFiles = walk(canonical).map((f) => relative(canonical, f));
  const mirFiles = walk(mirror).map((f) => relative(mirror, f));
  const all = new Set([...canFiles, ...mirFiles]);
  for (const rel of all) {
    const a = join(canonical, rel);
    const b = join(mirror, rel);
    const hasA = existsSync(a);
    const hasB = existsSync(b);
    if (hasA && !hasB) {
      console.log(`\x1b[33m[só em ${canonical}]\x1b[0m ${rel}`);
      onlyCanonical++;
    } else if (!hasA && hasB) {
      console.log(`\x1b[33m[só em ${mirror}]\x1b[0m ${rel}`);
      onlyMirror++;
    } else if (hasA && hasB && sha(a) !== sha(b)) {
      console.log(`\x1b[31m[divergente]\x1b[0m ${canonical}/${rel} ≠ ${mirror}/${rel}`);
      diverged++;
    }
  }
}

const total = diverged + onlyCanonical + onlyMirror;
if (total === 0) {
  console.log('\x1b[32m✅ entrypoints HTML, www/ e raiz idênticos.\x1b[0m');
  process.exit(0);
}
console.log(
  `\n\x1b[31m❌ ${total} problema(s): ${diverged} divergente(s), ${onlyCanonical} só na raiz, ${onlyMirror} só em www/.\x1b[0m`,
);
console.log('Corrija com: \x1b[2mnpm run cap:www\x1b[0m ou copie manualmente.');
process.exit(1);
