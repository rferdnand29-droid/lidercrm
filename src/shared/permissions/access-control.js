(function(global){
  'use strict';

  var root = global.LiderCRM = global.LiderCRM || {};
  var shared = root.shared = root.shared || {};
  var permissions = shared.permissions = shared.permissions || {};

  var ADMIN_CARGO_KEYWORDS = ['gerente','gestor','representante','master'];
  var CARGO_LEVELS = [
    { nivel: 1, match: ['consultor','funcionário','funcionario'] },
    { nivel: 3, match: ['supervisor','orientador'] },
    { nivel: 4, match: ['gerente','gestor','representante','master'] }
  ];

  function getUsuariosRuntime(){
    return ((((root || {}).modules || {}).usuarios || {}).runtime) || {};
  }

  function resolveUser(uid){
    try{
      if(typeof global.getUser === 'function') return global.getUser(uid) || null;
    }catch(_e){}
    try{
      var runtime = getUsuariosRuntime();
      if(runtime && typeof runtime.getUser === 'function') return runtime.getUser(uid) || null;
    }catch(_e){}
    try{
      if(typeof global.getUsers === 'function'){
        var list = global.getUsers();
        if(Array.isArray(list)){
          for(var i = 0; i < list.length; i++){
            var user = list[i];
            if(user && String(user.id) === String(uid)) return user;
          }
        }
      }
    }catch(_e){}
    try{
      var runtimeList = getUsuariosRuntime();
      if(runtimeList && typeof runtimeList.getUsers === 'function'){
        var users = runtimeList.getUsers();
        if(Array.isArray(users)){
          for(var j = 0; j < users.length; j++){
            var runtimeUser = users[j];
            if(runtimeUser && String(runtimeUser.id) === String(uid)) return runtimeUser;
          }
        }
      }
    }catch(_e){}
    return null;
  }

  function getCargoTexto(user){
    return String((user && (user.cargo || user.role || user.papel)) || '').toLowerCase();
  }

  function getCargoNivel(uid){
    uid = uid || (global.S ? global.S.userId : null);
    if(!uid) return 1;
    if(uid === 'adm') return 5;
    var user = resolveUser(uid);
    if(!user){
      if(global.S && global.S.userId === uid && global.S.role === 'adm') return 5;
      return 1;
    }
    if(user.role === 'adm') return 5;
    var cargo = getCargoTexto(user);
    for(var i = CARGO_LEVELS.length - 1; i >= 0; i--){
      if(CARGO_LEVELS[i].match.some(function(keyword){ return cargo.indexOf(keyword) >= 0; })) return CARGO_LEVELS[i].nivel;
    }
    return 1;
  }

  function hasSupervisorAccess(uid){
    return getCargoNivel(uid) >= 3;
  }

  function hasOrientadorAccess(uid){
    uid = uid || (global.S ? global.S.userId : null);
    if(!uid || uid === 'adm') return false;
    var user = resolveUser(uid);
    if(!user || user.role === 'adm' || user.admExtra) return false;
    var cargo = getCargoTexto(user);
    if(cargo.indexOf('orientador') >= 0) return true;
    if(cargo.indexOf('supervisor') >= 0) return false;
    if(ADMIN_CARGO_KEYWORDS.some(function(keyword){ return cargo.indexOf(keyword) >= 0; })) return false;
    var orientados = Array.isArray(user.orientadosIds) ? user.orientadosIds.filter(Boolean) : [];
    return orientados.length > 0;
  }

  function getOrientadosIds(uid){
    uid = uid || (global.S ? global.S.userId : null);
    if(!uid) return [];
    var user = resolveUser(uid);
    if(!user) return [];
    var orientados = Array.isArray(user.orientadosIds) ? user.orientadosIds : [];
    return orientados.filter(Boolean);
  }

  function filterItemsForOrientador(items){
    if(!Array.isArray(items)) return [];
    var myId = (global.S && global.S.userId) || null;
    if(!hasOrientadorAccess(myId)) return items.slice();
    var orientadosIds = getOrientadosIds(myId);
    if(!orientadosIds.length){
      return items.filter(function(item){ return item && (item.ownerId === myId || item.uid === myId); });
    }
    var allowedIds = orientadosIds.concat([myId]);
    return items.filter(function(item){ return item && allowedIds.indexOf(item.ownerId || item.uid) >= 0; });
  }

  function hasAdminAccess(uid){
    uid = uid || (global.S ? global.S.userId : null);
    if(!uid) return false;
    if(uid === 'adm') return true;
    var user = resolveUser(uid);
    if(!user){
      if(global.S && global.S.userId === uid && global.S.role === 'adm') return true;
      return false;
    }
    if(user.role === 'adm' || user.admExtra) return true;
    var cargo = getCargoTexto(user);
    return ADMIN_CARGO_KEYWORDS.some(function(keyword){ return cargo.indexOf(keyword) >= 0; });
  }

  function toggleAdminNote(selId, noteId){
    var select = global.document && global.document.getElementById(selId);
    var note = global.document && global.document.getElementById(noteId);
    if(!select || !note) return;
    var cargo = String(select.value || '').toLowerCase();
    var isAdmin = ADMIN_CARGO_KEYWORDS.some(function(keyword){ return cargo.indexOf(keyword) >= 0; });
    var isSupervisor = !isAdmin && (cargo.indexOf('supervisor') >= 0 || cargo.indexOf('orientador') >= 0);
    var adminToggle = global.document.getElementById(selId === 'k-cargo' ? 'k-admin-toggle' : 'eu-admin-toggle');
    if(adminToggle) adminToggle.style.display = (isAdmin || isSupervisor) ? 'block' : 'none';
    if(isAdmin){
      note.style.display = 'block';
      note.innerHTML = '&#128737; Este cargo tem acesso ao Painel ADM (métricas, usuários, feed), igual ao Gerente. As funções de consultor continuam normalmente.';
    }else if(isSupervisor){
      note.style.display = 'block';
      note.innerHTML = '&#128065; Cargo Supervisor/Orientador: vê leads e negócios da equipe (aba Time), mas NÃO acessa o painel ADM.';
    }else{
      note.style.display = 'none';
    }
  }

  permissions.ADMIN_CARGO_KEYWORDS = ADMIN_CARGO_KEYWORDS;
  permissions.CARGO_LEVELS = CARGO_LEVELS;
  permissions.resolveUser = resolveUser;
  permissions.getCargoNivel = getCargoNivel;
  permissions.hasSupervisorAccess = hasSupervisorAccess;
  permissions.hasOrientadorAccess = hasOrientadorAccess;
  permissions.getOrientadosIds = getOrientadosIds;
  permissions.filterItemsForOrientador = filterItemsForOrientador;
  permissions.hasAdminAccess = hasAdminAccess;
  permissions.toggleAdminNote = toggleAdminNote;

  global.CARGOS_NIVEL_ADMIN = ADMIN_CARGO_KEYWORDS;
  global.CARGO_NIVEIS = CARGO_LEVELS;
  global.getCargoNivel = getCargoNivel;
  global.hasSupervisorAccess = hasSupervisorAccess;
  global.hasOrientadorAccess = hasOrientadorAccess;
  global.getOrientadosIds = getOrientadosIds;
  global.filterItemsForOrientador = filterItemsForOrientador;
  global.hasAdminAccess = hasAdminAccess;
  global.toggleAdminNote = toggleAdminNote;
})(window);
