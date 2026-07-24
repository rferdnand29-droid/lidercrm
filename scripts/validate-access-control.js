#!/usr/bin/env node
import fs from 'fs';
import vm from 'vm';

function assert(cond, msg){
  if(!cond){
    console.error('FAIL:', msg);
    process.exitCode = 1;
  }else{
    console.log('OK  :', msg);
  }
}

const code = fs.readFileSync('src/shared/permissions/access-control.js', 'utf8');

const users = {
  orientador: { id:'orientador', cargo:'Orientador', role:'user', orientadosIds:['c1','c2'] },
  supervisor: { id:'supervisor', cargo:'Supervisor', role:'user', orientadosIds:['c1'] },
  consultor: { id:'consultor', cargo:'Consultor', role:'user' },
  gestor: { id:'gestor', cargo:'Gerente', role:'user', admExtra:true },
  adm: { id:'adm', cargo:'Administrador', role:'adm' }
};

const sandbox = {
  window: {
    LiderCRM: {
      modules: {
        usuarios: {
          runtime: {
            getUser: id => users[id] || null,
            getUsers: () => Object.values(users)
          }
        }
      }
    },
    S: { userId: 'orientador', role: 'user' }
  },
  console
};

vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const api = sandbox.window;

assert(api.hasOrientadorAccess('orientador') === true, 'orientador textual recebe acesso de orientador');
assert(api.hasOrientadorAccess('supervisor') === false, 'supervisor nao recebe acesso de orientador');
assert(api.hasOrientadorAccess('consultor') === false, 'consultor nao recebe acesso de orientador');
assert(api.hasOrientadorAccess('adm') === false, 'adm nao recebe acesso de orientador');

const items = [
  { ownerId:'orientador', nome:'meu' },
  { ownerId:'c1', nome:'orientado 1' },
  { ownerId:'c2', nome:'orientado 2' },
  { ownerId:'x1', nome:'fora da equipe' }
];
const filtered = api.filterItemsForOrientador(items);
assert(filtered.length === 3, 'orientador ve apenas a propria carteira e orientados');
assert(filtered.every(item => ['orientador','c1','c2'].includes(item.ownerId)), 'filtro do orientador remove itens externos');

sandbox.window.S.userId = 'supervisor';
const supervisorView = api.filterItemsForOrientador(items);
assert(supervisorView.length === items.length, 'filtro nao reduz lista para usuario que nao e orientador');

if(process.exitCode){
  process.exit(process.exitCode);
}
