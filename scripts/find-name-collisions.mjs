#!/usr/bin/env node
/* =====================================================================
 * scripts/find-name-collisions.mjs
 * -----------------------------------------------------------------------
 * Melhoria de arquitetura (2026-09-21, item 5 do plano de estabilidade
 * — continuação da investigação do bloqueador real encontrado na
 * entrega anterior: `node --check` no pacote gerado por
 * generate-bundle-preview.mjs falhou por causa de duas declarações de
 * "syncBusy" no nível mais externo de arquivos diferentes (uma
 * `var syncBusy = ...`, outra `function syncBusy(){...}`) — que
 * funcionam bem como scripts separados, mas colidem quando
 * concatenadas num programa só.
 *
 * Tentei isolar exatamente qual regra do V8 causa esse erro específico
 * (testes isolados com o mesmo padrão, inclusive replicando a escala
 * real de ~18 mil linhas de distância entre as duas declarações, não
 * reproduziram o erro) — não cheguei a uma explicação definitiva antes
 * de decidir que continuar tentando não valia mais o tempo. O que
 * importa na prática: `node --check` FALHA DE VERDADE no pacote real,
 * e só reporta a PRIMEIRA colisão que encontra — se essa for
 * corrigida, é bem provável que apareça outra logo depois.
 *
 * Esta ferramenta resolve isso de um jeito mais direto: análise
 * estática (regex, não um parser completo — aceita algum ruído) que
 * encontra TODAS as declarações de nível mais externo (coluna 0 — não
 * dentro de um IIFE/bloco indentado) em todos os arquivos locais, e
 * relata TODO nome declarado em mais de um arquivo — completo, não só
 * o primeiro que travaria o node --check.
 *
 * SÓ ANÁLISE — não altera nenhum arquivo.
 *
 * Uso: node scripts/find-name-collisions.mjs
 * ===================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readLoadOrder } from './audit-load-order-deps.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');

function isExternal(src) {
  return /^(https?:)?\/\//.test(src);
}

// Declarações de nível mais externo — coluna 0, sem indentação. No
// estilo deste projeto, código dentro de um IIFE/bloco vem indentado
// (normalmente 2 espaços) — coluna 0 é um indício forte (não uma
// garantia absoluta, é regex) de que a declaração vai pro escopo
// global compartilhado quando concatenada.
var FUNC_RE = /^function\s+(\w+)\s*\(/gm;
// Limitação conhecida: cobre "var a,b,c;" e "var a = valor;" — não
// cobre corretamente "var a=1,b=2,c=3;" (cada um com seu próprio
// valor), onde só a primeira variável é capturada. Comportamento
// seguro (não gera nome errado, só fica incompleto nesse caso raro) —
// nenhuma das 64 colisões reais encontradas usa esse padrão.
var VAR_RE = /^var\s+([\w$]+(?:\s*,\s*[\w$]+)*)\s*[=;]/gm;

function findTopLevelDecls(content) {
  var decls = []; // {name, kind}
  var m;
  FUNC_RE.lastIndex = 0;
  while ((m = FUNC_RE.exec(content))) decls.push({ name: m[1], kind: 'function' });
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(content))) {
    // var pode declarar várias no mesmo statement: var a=1,b=2;
    m[1].split(',').forEach(function (n) { decls.push({ name: n.trim(), kind: 'var' }); });
  }
  return decls;
}

function run() {
  var byName = {}; // name -> [{file, kind}]

  ['index.html'].forEach(function (htmlName) {
    var result = readLoadOrder(path.join(ROOT, htmlName));
    var localScripts = result.order.filter(function (s) { return !isExternal(s) && !result.deferred[s]; });

    localScripts.forEach(function (rel) {
      var content;
      try { content = readFileSync(path.join(ROOT, rel), 'utf8'); }
      catch (_e) { return; }
      findTopLevelDecls(content).forEach(function (d) {
        if (!byName[d.name]) byName[d.name] = [];
        byName[d.name].push({ file: rel, kind: d.kind });
      });
    });
  });

  var collisions = Object.keys(byName).filter(function (name) {
    var files = new Set(byName[name].map(function (e) { return e.file; }));
    return files.size > 1; // mesmo nome, arquivos DIFERENTES
  });

  console.log('=== Busca por colisão de nome no nível mais externo (entre arquivos) ===\n');
  console.log('Total de nomes únicos com declaração de nível mais externo: ' + Object.keys(byName).length);
  console.log('Nomes declarados em MAIS DE UM ARQUIVO: ' + collisions.length + '\n');

  if (!collisions.length) {
    console.log('(nenhuma colisão encontrada — mas isso não significa 100% seguro pra concatenar: esta é uma análise por regex, não um parser completo de JavaScript)');
  }

  collisions.sort().forEach(function (name) {
    console.log('"' + name + '":');
    byName[name].forEach(function (e) {
      console.log('  [' + e.kind + '] ' + e.file);
    });
    console.log('');
  });

  console.log('=== Fim — nenhum arquivo foi alterado ===');
}

var isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) run();

export { findTopLevelDecls };
