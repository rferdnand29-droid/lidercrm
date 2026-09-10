#!/usr/bin/env node
/**
 * release-and-sync.mjs — LF Release Automator
 * ------------------------------------------------------------------
 * Resolve de uma vez as falhas de cache/versionamento do Lider CRM:
 *
 *   1. Gera uma nova versão baseada em data/hora (ex: 20260824-1345)
 *   2. Atualiza a fonte única js/lf-config.js e sua URL cache-busted
 *   3. Roda o build-capacitor-www.mjs (gera o bundle local do app)
 *   4. Roda o verify-mirror.mjs (confere espelhos android/ e ios/)
 *   5. Exibe o comando exato de deploy (Cloudflare Pages) e de sync do Capacitor
 *
 * Uso:
 *   node scripts/release-and-sync.mjs            # bump + build + verify
 *   node scripts/release-and-sync.mjs --id=meu-id-custom   # usa ID manual
 *
 * Por que isso existe:
 *   - Sem bump do lf-build-id a cada deploy, o app-update-checker.js NAO
 *     percebe versao nova e o app fica preso em cache antigo.
 *   - O capacitor.config.json NAO deve ter server.url — com ele, o app
 *     ignora o bundle local e abre o site ao vivo (fonte de divergencia
 *     entre celular e PC). Este script assume o modelo "bundle local".
 * ------------------------------------------------------------------
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');

// ---------- 1. Gera a versão ----------
function nowId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
const argId = process.argv.find((a) => a.startsWith('--id='));
const BUILD_ID = argId ? argId.split('=')[1] : nowId();
console.log(`\n[1/5] Nova versão do app: ${BUILD_ID}`);

// ---------- 2. Atualiza a fonte única de configuração ----------
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (entry.endsWith('.html')) yield full;
  }
}
const CONFIG_VERSION_RE = /(LF_CONFIG_VERSION\s*=\s*['"])([^'"]+)(['"])/;
const CONFIG_SCRIPT_RE = /(js\/lf-config\.js\?v=)[^"']+/;
const configPath = join(ROOT, 'js', 'lf-config.js');
const configText = readFileSync(configPath, 'utf8');
if (!CONFIG_VERSION_RE.test(configText)) {
  console.error('   ✖ LF_CONFIG_VERSION não encontrado em js/lf-config.js. Abortando.');
  process.exit(1);
}
writeFileSync(configPath, configText.replace(CONFIG_VERSION_RE, `$1${BUILD_ID}$3`), 'utf8');
console.log('   ✔ js/lf-config.js');

let touched = 1;
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8');
  if (!CONFIG_SCRIPT_RE.test(text)) continue;
  writeFileSync(file, text.replace(CONFIG_SCRIPT_RE, `$1${BUILD_ID}`), 'utf8');
  console.log(`   ✔ ${relative(ROOT, file)}`);
  touched++;
}
console.log(`[2/5] ${touched} arquivo(s) atualizados.`);

// ---------- 3. Garante que capacitor.config.json NAO tem server.url ----------
for (const cfgPath of [
  'capacitor.config.json',
  'android/app/src/main/assets/capacitor.config.json',
  'ios/App/App/capacitor.config.json',
]) {
  try {
    const full = join(ROOT, cfgPath);
    const cfg = JSON.parse(readFileSync(full, 'utf8'));
    if (cfg.server && cfg.server.url) {
      delete cfg.server.url;
      writeFileSync(full, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
      console.log(`   ✔ server.url removido de ${cfgPath} (bundle local ativo)`);
    }
  } catch { /* arquivo ausente — ok */ }
}
console.log('[3/5] capacitor.config sem server.url → app usa o pacote local do APK.');

// ---------- 4. Build do bundle Capacitor + verificacao dos espelhos ----------
function run(cmd, label) {
  console.log(`\n[4/5] ${label}: ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}
try {
  run('node scripts/build-capacitor-www.mjs', 'build-capacitor-www');
  run('node scripts/verify-mirror.mjs', 'verify-mirror');
} catch {
  console.log('\n   ⚠ build/verify falhou ou scripts ausentes — rode manualmente se necessario.');
}

// ---------- 5. Proximos passos ----------
console.log(`
[5/5] PRONTO. Proximos passos:

  App (bundle local — modelo recomendado):
    npx cap sync
    # depois compile o APK/AAB no Android Studio e publique na Play Store

  Site (se voce tambem publica no Cloudflare Pages):
    npx wrangler pages deploy . --project-name=lidercrm
    # ou o comando de deploy que voce ja usa

  A versão central (${BUILD_ID}) garante que o app-update-checker
  detecte a versao nova e force o reload nos clientes.
`);
