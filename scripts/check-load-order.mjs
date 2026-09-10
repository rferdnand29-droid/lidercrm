#!/usr/bin/env node
/**
 * Verifica o contrato de carregamento do entrypoint canônico.
 *
 * Diferente da auditoria exploratória, este comando falha (exit 1) quando:
 * - um src local aponta para um arquivo inexistente ou aparece duas vezes;
 * - uma dependência declarada vem depois do consumidor na ordem efetiva;
 * - um script com dependência é async (ordem não determinística);
 * - um marcador LF-LOAD-GROUP é desconhecido ou muda de seção sem regra;
 * - um patch que usa o padrão de wrapper só encontra sua função-base depois.
 *
 * A ordem efetiva considera scripts normais primeiro e, depois, scripts
 * defer na ordem do HTML. Scripts async são tratados como não ordenáveis.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { findWraps } from './audit-load-order-deps.mjs';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const CONTRACT_PATH = path.join(ROOT, 'scripts', 'load-order-contract.json');

function normalize(value) {
  return value.split('?')[0].replace(/^\.?\//, '');
}

function isExternal(value) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}

function parseEntrypoint(html) {
  const records = [];
  let currentGroup = null;
  const tokenRe = /<!--[\s\S]*?-->|<script\b[^>]*>/gi;
  let token;
  while ((token = tokenRe.exec(html))) {
    const text = token[0];
    if (text.startsWith('<!--')) {
      const marker = text.match(/LF-LOAD-GROUP:\s*([a-z0-9-]+)/i);
      if (marker) currentGroup = marker[1];
      continue;
    }
    const srcMatch = text.match(/\bsrc\s*=\s*(['"])(.*?)\1/i);
    if (!srcMatch || isExternal(srcMatch[2])) continue;
    const src = normalize(srcMatch[2]);
    records.push({
      src,
      group: currentGroup,
      defer: /\bdefer\b/i.test(text),
      async: /\basync\b/i.test(text)
    });
  }
  return records;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function listClientScripts(root, directory, output = []) {
  const fullDirectory = path.join(root, directory);
  if (!existsSync(fullDirectory)) return output;
  for (const entry of readdirSync(fullDirectory)) {
    const relativePath = path.join(directory, entry);
    const fullPath = path.join(root, relativePath);
    if (statSync(fullPath).isDirectory()) listClientScripts(root, relativePath, output);
    else if (relativePath.endsWith('.js')) output.push(relativePath.replaceAll(path.sep, '/'));
  }
  return output;
}

function findDefinitions(source) {
  const definitions = [];
  const clean = stripComments(source);
  const declarationRe = /(?:^|\n)\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  const assignmentRe = /(?:window|global)\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/g;
  for (const re of [declarationRe, assignmentRe]) {
    let match;
    while ((match = re.exec(clean))) definitions.push(match[1]);
  }
  return [...new Set(definitions)];
}

function effectivePositions(records) {
  const ordered = [
    ...records.filter((record) => !record.defer && !record.async),
    ...records.filter((record) => record.defer && !record.async)
  ];
  return new Map(ordered.map((record, index) => [record.src, index]));
}

function checkContract({ html, contract, root = ROOT }) {
  const records = parseEntrypoint(html);
  const errors = [];
  const loaded = new Map();
  const allowedGroups = new Set(contract.groups);

  for (const record of records) {
    if (loaded.has(record.src)) {
      errors.push(`script carregado duas vezes: ${record.src}`);
    }
    loaded.set(record.src, record);
    if (!record.group) errors.push(`script sem LF-LOAD-GROUP: ${record.src}`);
    else if (!allowedGroups.has(record.group)) {
      errors.push(`grupo desconhecido "${record.group}" em ${record.src}`);
    }
    if (!existsSync(path.join(root, record.src))) {
      errors.push(`arquivo referenciado não existe: ${record.src}`);
    }
  }

  const allowedUnloaded = new Set(Object.keys(contract.allowedUnloaded || {}));
  for (const script of ['js', 'src', 'diagnostics'].flatMap((directory) =>
    listClientScripts(root, directory),
  )) {
    if (!loaded.has(script) && !allowedUnloaded.has(script)) {
      errors.push(`arquivo JS sem consumidor declarado: ${script}`);
    }
  }
  for (const script of allowedUnloaded) {
    if (!existsSync(path.join(root, script))) {
      errors.push(`arquivo permitido fora do HTML não existe: ${script}`);
    }
  }

  const transitions = [];
  for (const record of records) {
    if (record.group && transitions.at(-1) !== record.group) transitions.push(record.group);
  }
  for (let index = 1; index < transitions.length; index += 1) {
    const transition = [transitions[index - 1], transitions[index]];
    const allowed = contract.allowedTransitions.some(
      ([from, to]) => from === transition[0] && to === transition[1]
    );
    if (!allowed) errors.push(`transição de grupos não documentada: ${transition.join(' → ')}`);
  }

  const positions = effectivePositions(records);
  for (const rule of contract.dependencies) {
    const consumer = normalize(rule.script);
    const consumerRecord = loaded.get(consumer);
    if (!consumerRecord) {
      errors.push(`dependência declarada para script ausente no HTML: ${consumer}`);
      continue;
    }
    if (consumerRecord.async) {
      errors.push(`script com dependências não pode ser async: ${consumer}`);
      continue;
    }
    for (const dependencyValue of rule.after) {
      const dependency = normalize(dependencyValue);
      if (!loaded.has(dependency)) {
        errors.push(`dependência ausente no HTML: ${consumer} → ${dependency}`);
        continue;
      }
      if (loaded.get(dependency).async) {
        errors.push(`dependência async não pode garantir ordem: ${consumer} → ${dependency}`);
        continue;
      }
      if (positions.get(dependency) >= positions.get(consumer)) {
        errors.push(`ordem inválida: ${consumer} deve vir depois de ${dependency}`);
      }
    }
  }

  const definitions = new Map();
  for (const record of records) {
    if (record.src.startsWith('js/patches/')) continue;
    const fullPath = path.join(root, record.src);
    if (!existsSync(fullPath)) continue;
    for (const name of findDefinitions(readFileSync(fullPath, 'utf8'))) {
      if (!definitions.has(name)) definitions.set(name, []);
      definitions.get(name).push(record.src);
    }
  }
  for (const record of records.filter((item) => item.src.startsWith('js/patches/'))) {
    const fullPath = path.join(root, record.src);
    if (!existsSync(fullPath)) continue;
    for (const name of findWraps(readFileSync(fullPath, 'utf8'))) {
      const candidates = definitions.get(name) || [];
      for (const candidate of candidates) {
        if (positions.get(candidate) >= positions.get(record.src)) {
          errors.push(`wrapper fora de ordem: ${record.src} envolve ${name}, definido depois em ${candidate}`);
        }
      }
    }
  }

  return { records, transitions, errors };
}

export { checkContract, parseEntrypoint };

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  const html = readFileSync(path.join(ROOT, contract.entrypoint), 'utf8');
  const result = checkContract({ html, contract });
  console.log(`=== Verificação de ordem de carregamento ===`);
  console.log(`Scripts locais: ${result.records.length}`);
  console.log(`Seções: ${result.transitions.join(' → ')}`);
  if (result.errors.length) {
    console.error(`\nFalhas encontradas (${result.errors.length}):`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log('Resultado: OK — dependências, grupos e ordem efetiva conferidos.');
  }
}