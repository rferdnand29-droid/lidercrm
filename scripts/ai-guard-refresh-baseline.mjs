#!/usr/bin/env node
// =====================================================================
// scripts/ai-guard-refresh-baseline.mjs
// ---------------------------------------------------------------------
// FERRAMENTA MANUAL — regera scripts/ai-guard-legacy-allowlist.json a
// partir do estado ATUAL do repo. NUNCA é executada pelo CI (não está
// no workflow nem no pre-commit) — só um humano roda quando decide
// "esta é a nova baseline de legados aceitos".
//
// Modo default (dry-run): imprime o que mudaria. Nada é escrito.
// Com --write: grava o JSON. Requer commit humano depois.
//
// Uso:
//   node scripts/ai-guard-refresh-baseline.mjs           # dry-run
//   node scripts/ai-guard-refresh-baseline.mjs --write   # grava JSON
//
// Motivação: quando você refatorar um patch legado para ficar em
// conformidade com o AI_CONTRACT, ele SAI da allowlist automaticamente
// (a violação some). Se um novo legado precisar ser tolerado (raro),
// rode com --write após revisão humana explícita.
// =====================================================================
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const WRITE = process.argv.includes('--write');
const ROOT = resolve(process.cwd());
const OUT = resolve(ROOT, 'scripts/ai-guard-legacy-allowlist.json');

function sha256File(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => existsSync(f));

const entries = [];
const patchRe = /^(js|www\/js)\/patches\/[^/]+\/lf-[a-z0-9-]+-v\d+-\d{8}\.js$/;

// R1.* — patches versionados que não obedecem template
for (const f of files.filter((f) => patchRe.test(f))) {
  const src = readFileSync(f, 'utf8');
  const h = sha256File(f);
  if (!/\(function\s*\(\s*global\s*\)\s*\{/.test(src)) {
    entries.push({ rule: 'R1.IIFE', file: f, sha256: h });
  }
  if (!/global\.__lfFix[A-Z][A-Za-z0-9]+/.test(src)) {
    entries.push({ rule: 'R1.IDEMP', file: f, sha256: h });
  }
  if (
    /\bimport\s+.+from\s+['"]/.test(src) ||
    /\bexport\s+(default|const|function|\{)/.test(src)
  ) {
    entries.push({ rule: 'R1.NOESM', file: f, sha256: h });
  }
}

// R3.HTML_SYNC — mesma <script src> presente em alguns HTMLs, faltando em outros
const HTMLS = ['index.html', 'app.html', 'www/index.html', 'www/app.html'].filter((h) =>
  existsSync(h),
);
if (HTMLS.length === 4) {
  const scriptRe = /<script[^>]+src=["']([^"']*js\/patches\/[^"']+)["']/g;
  const perHtml = HTMLS.map((h) => {
    const src = readFileSync(h, 'utf8');
    const set = new Set();
    let m;
    while ((m = scriptRe.exec(src))) set.add(m[1].replace(/^www\//, ''));
    return { h, set };
  });
  const union = new Set(perHtml.flatMap((x) => [...x.set]));
  for (const patch of union) {
    const missing = perHtml.filter((x) => !x.set.has(patch)).map((x) => x.h);
    if (missing.length && missing.length < 4) {
      entries.push({
        rule: 'R3.HTML_SYNC',
        file: patch,
        sha256: createHash('sha256').update(patch).digest('hex'),
      });
    }
  }
}

// Dedup e ordenação estável
const seen = new Set();
const out = [];
for (const e of entries.sort((a, b) => (a.rule + a.file).localeCompare(b.rule + b.file))) {
  const k = e.rule + '|' + e.file + '|' + e.sha256;
  if (seen.has(k)) continue;
  seen.add(k);
  out.push(e);
}

const payload = {
  _comment:
    'Baseline de violacoes LEGADAS toleradas pelo ai-guard. Cada entrada carrega o sha256 do arquivo no momento do baseline: se o conteudo mudar, o guard volta a bloquear. Regenere com: node scripts/ai-guard-refresh-baseline.mjs --write',
  generated_at: new Date().toISOString().slice(0, 10),
  count: out.length,
  entries: out,
};

const nextJson = JSON.stringify(payload, null, 2) + '\n';

let prevJson = '';
try {
  prevJson = readFileSync(OUT, 'utf8');
} catch {}

if (prevJson === nextJson) {
  console.log('✅ Baseline já está em dia. Nada a mudar. (' + out.length + ' entradas)');
  process.exit(0);
}

// Diff resumido
try {
  const prev = JSON.parse(prevJson || '{"entries":[]}');
  const prevSet = new Set(prev.entries.map((e) => e.rule + '|' + e.file + '|' + e.sha256));
  const nextSet = new Set(out.map((e) => e.rule + '|' + e.file + '|' + e.sha256));
  const added = [...nextSet].filter((k) => !prevSet.has(k));
  const removed = [...prevSet].filter((k) => !nextSet.has(k));
  console.log(`Baseline drift: +${added.length} nova(s) | -${removed.length} removida(s)`);
  if (added.length) {
    console.log('\nAdicionadas:');
    for (const k of added) console.log('  +', k);
  }
  if (removed.length) {
    console.log('\nRemovidas (patch consertado ou apagado):');
    for (const k of removed) console.log('  -', k);
  }
} catch {
  console.log('Baseline atual vazio ou ilegível. Gerando do zero: ' + out.length + ' entradas.');
}

if (!WRITE) {
  console.log('\n(dry-run — passe --write para persistir em scripts/ai-guard-legacy-allowlist.json)');
  process.exit(0);
}

writeFileSync(OUT, nextJson);
console.log(`\n✅ Escrito ${OUT} com ${out.length} entradas.`);
