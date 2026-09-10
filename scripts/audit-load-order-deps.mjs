#!/usr/bin/env node
/* =====================================================================
 * scripts/audit-load-order-deps.mjs
 * -----------------------------------------------------------------------
 * Melhoria de arquitetura (2026-09-19, item 5 do plano de estabilidade
 * — "empacotamento"). Antes de considerar QUALQUER empacotador, é
 * preciso saber com certeza quais dos 180+ <script> dependem de rodar
 * DEPOIS de outro específico — um empacotador que reordene ou faça
 * tree-shaking sem essa informação corre o risco de quebrar esses
 * "encapsulamentos" (padrão var orig=global.X; global.X=function(){
 * ...orig...}) de forma silenciosa, sem erro nenhum no console.
 *
 * Este script é SÓ ANÁLISE — não muda absolutamente nada no
 * carregamento real. Lê todo js/patches (recursivo), identifica quais
 * arquivos "encapsulam" (leem uma função global existente e a
 * substituem por uma versão que chama a original por dentro) qual
 * propriedade global, e cruza isso com a ORDEM REAL de carregamento
 * em index.html — apontando qualquer caso em que um patch encapsule
 * algo que carrega DEPOIS dele (o que seria um bug hoje: o
 * encapsulamento pegaria "nada" pra encapsular, silenciosamente).
 *
 * Uso: node scripts/audit-load-order-deps.mjs
 * ===================================================================== */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

function listJsFiles(dir) {
  var out = [];
  var entries;
  try { entries = readdirSync(dir); } catch (_e) { return out; }
  entries.forEach(function (name) {
    var full = path.join(dir, name);
    var st;
    try { st = statSync(full); } catch (_e) { return; }
    if (st.isDirectory()) out = out.concat(listJsFiles(full));
    else if (name.endsWith('.js')) out.push(full);
  });
  return out;
}

// ---- 1. Ordem real de carregamento, lida de index.html --------------
export function readLoadOrder(htmlPath) {
  // Ignora tags dentro de comentários HTML (por exemplo, SDKs de nuvem
  // desativados). Elas não participam da ordem de execução.
  var html = readFileSync(htmlPath, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  var order = [];
  var deferred = {};
  var re = /<script\b([^>]*)\ssrc="([^"?]+)(?:\?[^"]*)?"/g;
  var m;
  while ((m = re.exec(html))) {
    var attrs = m[1] || '';
    order.push(m[2]);
    if (/\bdefer\b/.test(attrs) || /\basync\b/.test(attrs)) deferred[m[2]] = true;
  }
  return { order: order, deferred: deferred };
}

// ---- 2. Detecta o padrão "encapsula" em cada arquivo -----------------
// var orig = global.X;  (ou window.X, ou NS.X)
// ... mais adiante ...
// global.X = <algo>;    (reatribuição)
var WRAP_RE = /var\s+(\w+)\s*=\s*(?:global|window|NS_LF|LF)\.(\w+)\s*;/g;

export function findWraps(content) {
  var wraps = [];
  var m;
  WRAP_RE.lastIndex = 0;
  while ((m = WRAP_RE.exec(content))) {
    var varName = m[1], propName = m[2];
    // Confirma que a mesma propriedade é reatribuída em algum lugar
    // depois (heurística simples — string, não AST; aceita algum
    // ruído, é uma auditoria, não um linter definitivo).
    var reassignRe = new RegExp('(?:global|window|NS_LF|LF)\\.' + propName + '\\s*=', 'g');
    var reassignCount = (content.match(reassignRe) || []).length;
    if (reassignCount >= 1 && content.indexOf(varName + '(') !== -1) {
      wraps.push(propName);
    }
  }
  return Array.from(new Set(wraps));
}

// ---- Execução ---------------------------------------------------------
function runAudit() {
var loadResult = readLoadOrder(path.join(ROOT, 'index.html'));
var loadOrder = loadResult.order;
var deferredSet = loadResult.deferred;
var orderIndex = {};
loadOrder.forEach(function (f, i) { orderIndex[f] = i; });

var patchFiles = listJsFiles(path.join(ROOT, 'js', 'patches'));
var byProperty = {}; // propName -> [{file, orderPos}]

patchFiles.forEach(function (fullPath) {
  var rel = path.relative(ROOT, fullPath);
  var content;
  try { content = readFileSync(fullPath, 'utf8'); } catch (_e) { return; }
  var wraps = findWraps(content);
  wraps.forEach(function (propName) {
    if (!byProperty[propName]) byProperty[propName] = [];
    byProperty[propName].push({ file: rel, orderPos: orderIndex[rel] });
  });
});

var multiWrapped = Object.keys(byProperty).filter(function (k) { return byProperty[k].length > 1; });
var singleWrapped = Object.keys(byProperty).filter(function (k) { return byProperty[k].length === 1; });
var notInOrder = [];
Object.keys(byProperty).forEach(function (prop) {
  byProperty[prop].forEach(function (entry) {
    if (entry.orderPos === undefined) notInOrder.push(entry.file + ' (encapsula "' + prop + '")');
  });
});

console.log('=== Auditoria de dependência de ordem de carregamento ===\n');
console.log('Total de patches analisados: ' + patchFiles.length);
console.log('Total de propriedades globais "encapsuladas" encontradas: ' + Object.keys(byProperty).length + '\n');

console.log('--- Propriedades encapsuladas por MAIS DE UM patch (ordem entre eles importa) ---');
if (!multiWrapped.length) console.log('(nenhuma)');
multiWrapped.sort().forEach(function (prop) {
  console.log('\n"' + prop + '" — encapsulada em ordem, do primeiro pro último:');
  byProperty[prop]
    .slice()
    .sort(function (a, b) { return (a.orderPos ?? 1e9) - (b.orderPos ?? 1e9); })
    .forEach(function (entry) {
      var deferTag = deferredSet[entry.file] ? ' (defer — roda depois de todo script normal)' : '';
      console.log('  ' + (entry.orderPos !== undefined ? '[pos ' + entry.orderPos + ']' : '[NÃO ESTÁ NO index.html]') + ' ' + entry.file + deferTag);
    });
});

console.log('\n--- Propriedades encapsuladas por só 1 patch (' + singleWrapped.length + ' — sem risco de ordem entre patches, mas cada uma ainda depende de a função original já existir antes dela) ---');
singleWrapped.sort().forEach(function (prop) {
  var entry = byProperty[prop][0];
  var deferTag = deferredSet[entry.file] ? ' (defer)' : '';
  console.log('  "' + prop + '" — ' + entry.file + deferTag);
});

if (notInOrder.length) {
  console.log('\n--- ATENÇÃO: patches encontrados que encapsulam algo mas NÃO aparecem no index.html (podem estar só em app.html, ou órfãos) ---');
  notInOrder.forEach(function (f) { console.log('  ' + f); });
}

console.log('\n=== Fim da auditoria — nenhum arquivo foi alterado ===');
}

var isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) runAudit();
