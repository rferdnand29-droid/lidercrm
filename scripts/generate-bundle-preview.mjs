#!/usr/bin/env node
/* =====================================================================
 * scripts/generate-bundle-preview.mjs
 * -----------------------------------------------------------------------
 * Melhoria de arquitetura (2026-09-20, item 5 do plano de estabilidade
 * — "empacotamento"). Segundo passo seguro, depois da auditoria de
 * dependência de ordem (scripts/audit-load-order-deps.mjs, que já
 * confirmou: nenhum patch hoje depende de uma ordem que não seja a
 * que já está em produção).
 *
 * O QUE ESTE SCRIPT FAZ: gera um pacote único (concatenação simples,
 * SEM reordenar, SEM tree-shaking, SEM minificar) a partir da MESMA
 * ordem exata que já está em index.html hoje — e confirma que o
 * resultado passa em `node --check` (sem erro de sintaxe).
 *
 * O QUE ESTE SCRIPT *NÃO* FAZ: não modifica index.html/app.html pra
 * usar esse pacote. Essa troca é uma decisão separada, que merece
 * validação manual extensa (não só suíte automatizada) antes de ir
 * pra produção — motivo: hoje, um erro de sintaxe em UM patch só
 * quebra aquele patch (script tags são independentes); concatenado
 * num arquivo só, um erro de sintaxe em QUALQUER lugar do pacote
 * impede TUDO que vem depois dele no MESMO arquivo de rodar. Antes de
 * arriscar isso em produção, o pacote gerado aqui deveria ser testado
 * manualmente, cobrindo os fluxos mais usados do CRM, não só rodar
 * `node --check`.
 *
 * Scripts com defer/async vão pra um pacote SEPARADO (mantém a
 * semântica de "roda depois de todo script normal"). Scripts externos
 * (CDN, tipo Firebase) são ignorados — continuam como estão.
 *
 * Uso: node scripts/generate-bundle-preview.mjs
 * ===================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { readLoadOrder } from './audit-load-order-deps.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const OUT_DIR = path.join(ROOT, 'dist-bundle-preview');

function isExternal(src) {
  return /^(https?:)?\/\//.test(src);
}

function buildOne(htmlName) {
  var htmlPath = path.join(ROOT, htmlName);
  var result = readLoadOrder(htmlPath);
  var localScripts = result.order.filter(function (s) { return !isExternal(s); });
  var normalScripts = localScripts.filter(function (s) { return !result.deferred[s]; });
  var deferredScripts = localScripts.filter(function (s) { return result.deferred[s]; });

  function concat(list, label) {
    var parts = [];
    parts.push('/* ===== Pacote "' + label + '" gerado de ' + htmlName + ' — ' + list.length + ' arquivo(s), mesma ordem exata de hoje ===== */');
    list.forEach(function (rel) {
      var full = path.join(ROOT, rel);
      var content;
      try { content = readFileSync(full, 'utf8'); }
      catch (e) { throw new Error('Não consegui ler ' + rel + ': ' + e.message); }
      parts.push('\n/* ---- início: ' + rel + ' ---- */');
      // Separador de segurança — evita ASI (Automatic Semicolon
      // Insertion) juntar a última linha de um arquivo com a primeira
      // do próximo de forma inesperada, se algum arquivo não terminar
      // com ; ou quebra de linha.
      parts.push(content);
      parts.push('\n/* ---- fim: ' + rel + ' ---- */');
    });
    return parts.join('\n');
  }

  return {
    normal: { content: concat(normalScripts, 'normal'), count: normalScripts.length },
    deferred: { content: concat(deferredScripts, 'defer'), count: deferredScripts.length },
    totalOriginal: localScripts.length,
  };
}

function sizeOf(str) { return Buffer.byteLength(str, 'utf8'); }
function fmtKB(bytes) { return (bytes / 1024).toFixed(1) + 'KB'; }

function run() {
  mkdirSync(OUT_DIR, { recursive: true });

  ['index.html', 'app.html'].forEach(function (htmlName) {
    var base = htmlName.replace('.html', '');
    var built = buildOne(htmlName);

    var normalPath = path.join(OUT_DIR, base + '.bundle.normal.js');
    var deferredPath = path.join(OUT_DIR, base + '.bundle.defer.js');
    writeFileSync(normalPath, built.normal.content, 'utf8');
    writeFileSync(deferredPath, built.deferred.content, 'utf8');

    console.log('\n=== ' + htmlName + ' ===');
    console.log('Scripts locais originais: ' + built.totalOriginal + ' (' + built.normal.count + ' normais + ' + built.deferred.count + ' defer)');
    console.log('Depois do pacote: 2 arquivos (' + fmtKB(sizeOf(built.normal.content)) + ' + ' + fmtKB(sizeOf(built.deferred.content)) + ')');

    // Validação — o pacote gerado precisa ser JS sintaticamente válido.
    [normalPath, deferredPath].forEach(function (p) {
      try {
        execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' });
        console.log('  ' + path.basename(p) + ': sintaxe OK (node --check)');
      } catch (e) {
        console.error('  ' + path.basename(p) + ': ERRO DE SINTAXE —');
        console.error(e.stderr ? e.stderr.toString() : e.message);
        process.exitCode = 1;
      }
    });
  });

  console.log('\n=== Pacotes gerados em ' + path.relative(ROOT, OUT_DIR) + '/ — SÓ PREVIEW ===');
  console.log('index.html/app.html NÃO foram alterados. Esta pasta é só pra');
  console.log('inspeção/teste manual — trocar a produção pra usar isso é uma');
  console.log('decisão separada, que precisa de validação além de node --check.');
}

var isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) run();

export { buildOne, isExternal };
