#!/usr/bin/env node
/**
 * scripts/build-capacitor-www.mjs
 * ---------------------------------------------------------------------
 * O projeto usa a raiz do repo como site (Cloudflare Pages) e `www/` como
 * bundle isolado do Capacitor.
 * O Capacitor 8 não aceita mais webDir "." (rejeita com "not a valid
 * value for webDir") e, mesmo aceitando, copiar a raiz inteira faria
 * o app nativo embutir node_modules/, .git/, sql/, docs/, tests/,
 * scripts/, tools/, migrations/, relatórios internos (*.md) e o código
 * do Cloudflare Worker (_worker_src/, functions/) dentro do
 * APK/IPA — infla o tamanho do app e expõe arquivos internos que não
 * têm nenhuma razão para estar no bundle do cliente.
 *
 * Este script monta uma pasta www/ só com o que o front-end realmente
 * carrega (mesmo conjunto de arquivos referenciados por index.html /
 * app.html), e o capacitor.config.json aponta webDir para ela.
 *
 * Rodar sempre que o código-fonte mudar, antes de `npx cap sync`:
 *   npm run cap:sync   (já chama este script antes do sync)
 * ---------------------------------------------------------------------
 */
import { existsSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncEntryHtml } from './sync-entry-html.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'www');

// Arquivos individuais que o app carrega diretamente.
// index.html é a fonte oficial; app.html é um alias gerado para
// compatibilidade. Não há uma terceira variante HTML no bundle.
const FILES = ['index.html', 'app.html', '404.html', 'robots.txt'];

// Pastas inteiras que contêm código/estático consumido pelo front-end.
const DIRS = ['css', 'js', 'src', 'assets', 'diagnostics'];

function copyIfExists(rel, isDir) {
  const from = join(ROOT, rel);
  if (!existsSync(from)) {
    console.warn(`  (aviso) ${rel} não encontrado — pulando`);
    return;
  }
  const to = join(OUT, rel);
  if (isDir) {
    mkdirSync(to, { recursive: true });
    cpSync(from, to, { recursive: true });
  } else {
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
  }
  console.log(`  copiado: ${rel}`);
}

function dirSizeMB(path) {
  let total = 0;
  function walk(p) {
    for (const entry of readdirSync(p)) {
      const full = join(p, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else total += st.size;
    }
  }
  if (existsSync(path)) walk(path);
  return (total / 1024 / 1024).toFixed(2);
}

console.log('Sincronizando entrypoints HTML...');
syncEntryHtml();

console.log(`Limpando ${OUT}...`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('Copiando arquivos do app nativo (Capacitor)...');
for (const f of FILES) copyIfExists(f, false);
for (const d of DIRS) copyIfExists(d, true);

console.log(`\nwww/ pronta — ${dirSizeMB(OUT)} MB`);
console.log('Próximo passo: npx cap sync');
