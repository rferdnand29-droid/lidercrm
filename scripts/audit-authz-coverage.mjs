#!/usr/bin/env node
/* =====================================================================
 * scripts/audit-authz-coverage.mjs
 * -----------------------------------------------------------------------
 * Melhoria de arquitetura (2026-09-22, item 11 do plano de estabilidade
 * — "auditoria de autorização"). Item classificado como difícil/de
 * meses no plano original — mas o PRIMEIRO PASSO (mapear onde a
 * autorização de verdade acontece hoje) é seguro, rápido, e só
 * análise: não muda nenhum endpoint, só relata.
 *
 * PERGUNTA QUE ESTE SCRIPT RESPONDE: de todas as rotas do backend
 * (_worker_src/worker/routes/router.js), quais têm alguma verificação
 * de autorização DENTRO DA PRÓPRIA FUNÇÃO do controller (`ctx.caps.*`
 * — restrição por cargo/capacidade — ou `ctx.user.*` — escopo pro
 * próprio dono do dado) — e quais NÃO TÊM NENHUMA DAS DUAS, o que
 * significaria que aquele endpoint confia inteiramente no que o
 * cliente afirma (via parâmetro do body/query), sem checar no
 * servidor quem está pedindo.
 *
 * IMPORTANTE — o que este script NÃO faz: não julga se uma rota SEM
 * essas checagens é necessariamente insegura (rotas públicas, tipo
 * login, legitimamente não precisam) nem verifica correção da lógica
 * de quem TEM as checagens — só aponta onde OLHAR primeiro. Autorização
 * de verdade também pode estar no middleware global (ver auth.js) ou
 * embutida na própria query ao banco de um jeito que este regex não
 * enxerga — trate isto como um mapa de prioridade, não um veredito.
 *
 * Uso: node scripts/audit-authz-coverage.mjs
 * ===================================================================== */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ROUTE_MATRIX } from '../_worker_src/worker/middlewares/authz.js';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..');
const ROUTER_PATH = path.join(ROOT, '_worker_src', 'worker', 'routes', 'router.js');
const CONTROLLERS_DIR = path.join(ROOT, '_worker_src', 'worker', 'controllers');

// Rotas cujo próprio propósito é não exigir sessão/permissão prévia —
// não faz sentido cobrar ctx.caps/ctx.user delas.
var EXPECTED_PUBLIC = new Set([
  'loginController', 'healthController',
  // Confirmadas: legacy-nonce/legacy-bridge estão em PUBLIC_PATHS
  // (auth.js) — isentas de autenticação de propósito (bridge de
  // sessão legado). logout exige autenticação (pra saber qual sessão
  // invalidar) mas não exige cargo específico — ação universal de
  // autoatendimento, qualquer usuário autenticado pode encerrar a
  // própria sessão.
  'legacyNonceController', 'legacyBridgeController', 'logoutController',
  // Confirmado por comentário explícito no próprio controller
  // (agenda-slots-controller.js): recurso compartilhado por toda a
  // equipe DE PROPÓSITO — qualquer consultor pode ver/criar/editar/
  // excluir qualquer slot (é uma agenda coletiva, não dado pessoal).
  'listAgendaSlots', 'createAgendaSlot', 'updateAgendaSlot', 'deleteAgendaSlot',
  // Confirmado por comentário explícito (AUDITORIA-FINAL-10,
  // 2026-08-01): "Documentos ADM" é visível a todos de propósito — só
  // a escrita (putAdmDocumentos, que JÁ tem a checagem) é restrita.
  'getAdmDocumentos',
  // Confirmado: decisão documentada de auditoria anterior — consultor
  // pode legitimamente ver as permissões do próprio cargo (só leitura).
  'listRoles', 'listRolePermissions',
  // Confirmado: decisão documentada de auditoria anterior — regras de
  // automação são visíveis a todos, só a edição exige gerência.
  'getAutomationRules',
  // Confirmado por comentário explícito: registro compartilhado por
  // toda a equipe, sem dono — mesmo design de agenda-slots.
  'listFeed',
  // Confirmado: dado de baixo sigilo por natureza (logo/cores da
  // empresa), buscado inclusive antes do login pra montar a tela.
  'getBrandingCtrl',
]);

function parseRoutes(routerSrc) {
  var routes = [];
  var re = /\[\s*'([^']+)'\s*,\s*'([A-Z]+)'\s*,\s*(\w+)\s*\]/g;
  var m;
  while ((m = re.exec(routerSrc))) routes.push({ path: m[1], method: m[2], fn: m[3] });
  return routes;
}

function parseImportedFrom(routerSrc) {
  // Mapeia nome-da-função -> arquivo-de-origem, lendo os imports do topo.
  var map = {};
  var re = /import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g;
  var m;
  while ((m = re.exec(routerSrc))) {
    var names = m[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var file = m[2].replace('../controllers/', '');
    names.forEach(function (n) { map[n] = file; });
  }
  return map;
}

function extractFunctionBody(src, fnName) {
  var re = new RegExp('export\\s+(?:async\\s+)?function\\s+' + fnName + '\\s*\\(');
  var m = re.exec(src);
  if (!m) return null;
  var start = src.indexOf('{', m.index);
  if (start === -1) return null;
  var depth = 0;
  for (var i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

function run() {
  var routerSrc = readFileSync(ROUTER_PATH, 'utf8');
  var routes = parseRoutes(routerSrc);
  var fnToFile = parseImportedFrom(routerSrc);

  var fileCache = {};
  function getFileSrc(file) {
    if (!(file in fileCache)) {
      try { fileCache[file] = readFileSync(path.join(CONTROLLERS_DIR, file), 'utf8'); }
      catch (_e) { fileCache[file] = null; }
    }
    return fileCache[file];
  }

  var withCheck = [];
  var withoutCheck = [];
  var notFound = [];

  routes.forEach(function (r) {
    var file = fnToFile[r.fn];
    if (!file) { notFound.push(r); return; }
    var src = getFileSrc(file);
    if (src === null) { notFound.push(r); return; }
    var body = extractFunctionBody(src, r.fn);
    if (body === null) { notFound.push(r); return; }
    var hasCaps = /ctx\.caps\b/.test(body);
    var hasUser = /ctx\.user\b/.test(body);
    // canAccessUid(...) é uma função auxiliar de escopo por dono, usada
    // por vários controllers (ver _worker_src/worker/utils/team-scope.js)
    // — conta como verificação de autorização mesmo sem tocar ctx.caps/
    // ctx.user diretamente NESTA função (a checagem em si acontece
    // dentro do helper).
    var hasOwnerScopeHelper = /\bcanAccessUid\s*\(/.test(body) || /\bauthedUid\s*\(/.test(body);
    var matchesGlobalMatrix = ROUTE_MATRIX.some(function (rule) { return rule.pattern.test(r.path); });
    var entry = { path: r.path, method: r.method, fn: r.fn, file: file, hasCaps: hasCaps, hasUser: hasUser, hasOwnerScopeHelper: hasOwnerScopeHelper, matchesGlobalMatrix: matchesGlobalMatrix };
    if (hasCaps || hasUser || hasOwnerScopeHelper || matchesGlobalMatrix || EXPECTED_PUBLIC.has(r.fn)) withCheck.push(entry);
    else withoutCheck.push(entry);
  });

  console.log('=== Auditoria de cobertura de autorização (backend) ===\n');
  console.log('Total de rotas mapeadas: ' + routes.length);
  console.log('Com alguma verificação (ctx.caps ou ctx.user) na função: ' + withCheck.length);
  console.log('SEM NENHUMA verificação encontrada: ' + withoutCheck.length);
  console.log('Não localizadas pra análise (import/arquivo não bateu): ' + notFound.length + '\n');

  if (withoutCheck.length) {
    console.log('--- Rotas SEM ctx.caps/ctx.user na função — olhar primeiro ---');
    withoutCheck.forEach(function (e) {
      console.log('  [' + e.method + '] ' + e.path + '  → ' + e.fn + ' (' + e.file + ')');
    });
    console.log('');
  }

  if (notFound.length) {
    console.log('--- Não localizadas (revisar manualmente) ---');
    notFound.forEach(function (e) {
      console.log('  [' + e.method + '] ' + e.path + '  → ' + e.fn);
    });
    console.log('');
  }

  console.log('=== Fim — nenhum arquivo foi alterado ===');
  console.log('Lembrete: isto é um MAPA DE PRIORIDADE, não um veredito de');
  console.log('segurança — cada rota listada acima merece revisão manual antes');
  console.log('de qualquer conclusão ("sem checagem" pode ser intencional, tipo');
  console.log('rotas públicas, ou pode já estar coberta por outro mecanismo que');
  console.log('este regex não enxerga).');
}

var isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) run();

export { parseRoutes, parseImportedFrom, extractFunctionBody };
