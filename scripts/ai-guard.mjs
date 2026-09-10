#!/usr/bin/env node
// =====================================================================
// scripts/ai-guard.mjs
// ---------------------------------------------------------------------
// TRAVA SEMÂNTICA — roda antes do commit e no CI da Cloudflare Pages.
// Rejeita patches feitos por IA (Genspark, Lovable, Cursor, Copilot)
// que quebrem as convenções do AI_CONTRACT.md.
//
// Uso:
//   node scripts/ai-guard.mjs               # valida repo inteiro
//   node scripts/ai-guard.mjs --staged      # só arquivos staged (pre-commit)
//
// Saída:
//   exit 0 → OK
//   exit 1 → violação; imprime lista + como corrigir
// =====================================================================
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, basename } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(process.cwd());
const STAGED = process.argv.includes('--staged');
const violations = [];
const warn = [];

// --------- 0. Allowlist de LEGADOS (grandfathering) ---------
// Contém violações R1.*/R3.* que já existiam ANTES deste guard entrar em
// vigor. Cada entrada carrega o sha256 do arquivo no momento do baseline:
// se o conteúdo mudar (byte-idêntico deixa de valer), a violação VOLTA a
// bloquear — ou seja, isento não é anistia perpétua, é "não pioramos o
// legado até refatorar de propósito".
let LEGACY_ALLOW = { byRule: new Map(), entries: [] };
try {
  const raw = JSON.parse(
    readFileSync(resolve(ROOT, 'scripts/ai-guard-legacy-allowlist.json'), 'utf8'),
  );
  for (const e of raw.entries || []) {
    const key = `${e.rule}|${e.file}`;
    LEGACY_ALLOW.byRule.set(key, e.sha256);
    LEGACY_ALLOW.entries.push(e);
  }
} catch {
  /* sem baseline: guard opera em modo estrito (comportamento original) */
}
function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}
function isGrandfathered(rule, file) {
  const key = `${rule}|${file}`;
  const expected = LEGACY_ALLOW.byRule.get(key);
  if (!expected) return false;
  // R3.HTML_SYNC: 'file' é uma URL de <script src>, não um arquivo em disco.
  // A anistia vale enquanto a URL continuar exatamente igual (sha256 do texto).
  if (rule.startsWith('R3.')) {
    return createHash('sha256').update(file).digest('hex') === expected;
  }
  // Regras R1.*: o hash do arquivo no disco tem que bater com o baseline.
  if (!existsSync(file)) return false;
  return sha256File(file) === expected;
}

function fail(rule, file, msg, fix) {
  if (isGrandfathered(rule, file)) {
    warn.push({
      rule: rule + '.LEGACY',
      file,
      msg: `[legado tolerado] ${msg}`,
    });
    return;
  }
  violations.push({ rule, file, msg, fix });
}
function softWarn(rule, file, msg) {
  warn.push({ rule, file, msg });
}

// --------- 1. Descobrir arquivos alvo ---------
function listFiles() {
  if (STAGED) {
    const out = execSync('git diff --cached --name-only --diff-filter=ACMR', {
      encoding: 'utf8',
    });
    return out.split('\n').filter(Boolean);
  }
  // fallback: tudo versionado
  const out = execSync('git ls-files', { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}
const files = listFiles().filter((f) => existsSync(f));

// --------- 2. R1 — patches em js/patches/ obedecem template ---------
const patchRe = /^(js|www\/js)\/patches\/[^/]+\/lf-[a-z0-9-]+-v\d+-\d{8}\.js$/;
const patchFiles = files.filter((f) => patchRe.test(f));

for (const f of patchFiles) {
  const src = readFileSync(f, 'utf8');
  if (!/\(function\s*\(\s*global\s*\)\s*\{/.test(src)) {
    fail('R1.IIFE', f, 'patch precisa ser IIFE (function(global){...})(...)',
      'Envelope o corpo em (function(global){ "use strict"; ... })(typeof window!=="undefined"?window:globalThis);');
  }
  if (!/global\.__lfFix[A-Z][A-Za-z0-9]+/.test(src)) {
    fail('R1.IDEMP', f, 'falta guarda de idempotência global.__lfFix<Slug>',
      'Primeira linha útil: if(global.__lfFixFoo) return; global.__lfFixFoo = true;');
  }
  if (/\bimport\s+.+from\s+['"]/.test(src) || /\bexport\s+(default|const|function|\{)/.test(src)) {
    fail('R1.NOESM', f, 'patch client não pode usar import/export (script global)',
      'Remova imports/exports. Dependências vêm do global (window.*).');
  }
  if (!/^\s*\/\*[\s\S]*?\bcausa raiz\b[\s\S]*?\*\//i.test(src)) {
    softWarn('R1.HEADER', f, 'cabeçalho do patch não menciona "causa raiz" (recomendado).');
  }
}

// --------- 3. R2 — espelho www/ tem que casar com js/ e src/ ---------
for (const f of files) {
  if (f.startsWith('js/') && f.endsWith('.js')) {
    const mirror = 'www/' + f;
    if (existsSync(mirror) && sha256File(f) !== sha256File(mirror)) {
      fail('R2.MIRROR', f, `divergente do espelho ${mirror}`,
        'Rode `npm run cap:www` OU copie manualmente o mesmo conteúdo para www/.');
    }
  }
}

// --------- 4. R3 — entrypoints HTML gerados a partir de index.html ---------
const HTMLS = ['app.html', 'www/index.html', 'www/app.html'];
if (existsSync('index.html')) {
  for (const mirror of HTMLS) {
    if (existsSync(mirror) && sha256File('index.html') !== sha256File(mirror)) {
      fail('R3.HTML_SYNC', mirror, `${mirror} diverge da fonte oficial index.html`,
        'Edite somente index.html e rode `npm run html:sync` ou `npm run cap:www`.');
    }
  }
}

// --------- 5. R4 — dependências novas em package.json ---------
if (files.includes('package.json')) {
  try {
    const head = execSync('git show HEAD:package.json', { encoding: 'utf8' });
    const now = readFileSync('package.json', 'utf8');
    const dOld = { ...JSON.parse(head).dependencies, ...JSON.parse(head).devDependencies };
    const dNew = { ...JSON.parse(now).dependencies, ...JSON.parse(now).devDependencies };
    const added = Object.keys(dNew).filter((k) => !(k in dOld));
    if (added.length) {
      fail('R4.NEW_DEP', 'package.json',
        `dependência(s) nova(s) sem confirmação humana: ${added.join(', ')}`,
        'Este CRM roda estático em Cloudflare Pages. Nova dep exige aprovação humana explícita. Reverta ou peça OK antes.');
    }
  } catch { /* HEAD ainda não existe (repo novo) */ }
}

// --------- 6. R5 — nenhuma reescrita massiva fora de js/patches/ ---------
if (STAGED) {
  try {
    const diff = execSync('git diff --cached --numstat', { encoding: 'utf8' });
    for (const line of diff.split('\n').filter(Boolean)) {
      const [addStr, delStr, f] = line.split('\t');
      const add = parseInt(addStr, 10) || 0;
      const del = parseInt(delStr, 10) || 0;
      const canonicalNonPatch =
        (f.startsWith('js/') || f.startsWith('src/') || f.startsWith('_worker_src/')) &&
        !f.includes('/patches/');
      if (canonicalNonPatch && add + del > 150) {
        fail('R5.BIG_DIFF', f,
          `diff de ${add + del} linhas em arquivo canônico (limite 150). Provável reescrita.`,
          'Refaça como PATCH em js/patches/<área>/lf-fix-<slug>-vN-<data>.js OU peça confirmação humana explícita para reescrever.');
      }
    }
  } catch { /* ignore */ }
}

// --------- 7. R6 — proibições literais ---------
for (const f of files) {
  if (!f.endsWith('.js') && !f.endsWith('.mjs') && !f.endsWith('.ts')) continue;
  const src = readFileSync(f, 'utf8');
  if (f.startsWith('js/') && /\bexport\s+(default|const|function|\{)/.test(src) && !f.includes('/patches/')) {
    // js/ é script global; export só é OK em worker/tests
    fail('R6.NOESM_CLIENT', f, 'js/ usa scripts globais — remova export',
      'Ver AI_CONTRACT.md §1. Exports quebram concatenação e Capacitor.');
  }
  if (/console\.log\(\s*["'`][^"'`]*TODO\b/i.test(src)) {
    softWarn('R6.TODO_LOG', f, 'console.log("TODO...") esquecido.');
  }
}

// --------- 8. R7 — arquivos apagados de js/patches sem justificativa ---------
if (STAGED) {
  try {
    const del = execSync('git diff --cached --name-only --diff-filter=D', {
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    for (const f of del) {
      if (patchRe.test(f)) {
        fail('R7.PATCH_DELETE', f,
          'apagando patch versionado sem par de substituição (-vN+1-)',
          'Se está obsoleto: mantenha o arquivo e crie o -vN+1- que o neutraliza em runtime. Só APAGUE após 1 release estável.');
      }
    }
  } catch { /* ignore */ }
}

// --------- 9. Relatório final ---------
const RED = '\x1b[31m';
const YEL = '\x1b[33m';
const GRN = '\x1b[32m';
const DIM = '\x1b[2m';
const RST = '\x1b[0m';

const legacyTolerated = warn.filter((w) => w.rule.endsWith('.LEGACY')).length;
if (warn.length) {
  console.log(`${YEL}⚠  ${warn.length} aviso(s) (não bloqueiam):${RST}`);
  for (const w of warn) console.log(`  ${DIM}[${w.rule}]${RST} ${w.file} — ${w.msg}`);
}
if (legacyTolerated) {
  console.log(
    `${DIM}(${legacyTolerated} violação(ões) legada(s) toleradas pela allowlist —` +
      ` scripts/ai-guard-legacy-allowlist.json)${RST}`,
  );
}

if (violations.length === 0) {
  console.log(`${GRN}✅ ai-guard: nenhuma violação bloqueante. Patch obedece o AI_CONTRACT.${RST}`);
  process.exit(0);
}

console.log(`\n${RED}❌ ai-guard: ${violations.length} violação(ões) BLOQUEANTE(S).${RST}\n`);
for (const v of violations) {
  console.log(`${RED}▸ [${v.rule}]${RST} ${v.file}`);
  console.log(`   ${v.msg}`);
  console.log(`   ${DIM}fix:${RST} ${v.fix}\n`);
}
console.log(`${DIM}Corrija e rode de novo. Regras completas: AI_CONTRACT.md${RST}`);
process.exit(1);
