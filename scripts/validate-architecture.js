#!/usr/bin/env node
import fs from 'fs';

function assert(cond, msg){
  if(!cond){
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK  :', msg);
  }
}

const files = [
  'src/shared/runtime/legacy-runtime-resolver.js',
  'src/shared/permissions/access-control.js',
  'src/shared/constants/navigation.js',
  'scripts/architecture-audit.js',
  'architecture-audit.json'
];
files.forEach(f => assert(fs.existsSync(f), `exists ${f}`));

for(const html of ['index.html','app.html']){
  const text = fs.readFileSync(html, 'utf8');
  assert(text.includes('src/shared/runtime/legacy-runtime-resolver.js?v=arch20260724a'), `${html} wires runtime resolver`);
  assert(text.includes('src/shared/permissions/access-control.js?v=arch20260724a'), `${html} wires access control`);
  assert(text.includes('src/shared/constants/navigation.js?v=arch20260724a'), `${html} wires navigation constants`);
}

const app = fs.readFileSync('js/app.js', 'utf8');
assert(app.includes('navigation.getNavTabs'), 'app.js uses shared navigation constants');
assert(app.includes('navigation.DEEP_LINK_PAGES'), 'app.js uses shared deep-link constants');
assert(app.includes('_lfSharedRuntime'), 'app.js uses shared runtime resolver');

const auth = fs.readFileSync('js/auth.js', 'utf8');
assert(auth.includes('shared.loadUsersDBSafe'), 'auth.js delegates shared runtime loading');
assert(auth.includes('shared.getUserSafe'), 'auth.js delegates shared runtime user lookup');
assert(!auth.includes("var CARGOS_NIVEL_ADMIN=['gerente','gestor','representante','master'];"), 'auth.js no longer owns permission constants');

const pkg = fs.readFileSync('package.json', 'utf8');
assert(pkg.includes('audit:architecture'), 'package.json exposes architecture audit script');

if(process.exitCode){
  process.exit(process.exitCode);
}
