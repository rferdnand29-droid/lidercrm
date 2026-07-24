(function(global){
  'use strict';

  var root = global.LiderCRM = global.LiderCRM || {};
  var shared = root.shared = root.shared || {};
  var runtime = shared.runtime = shared.runtime || {};

  function getUsuariosRuntime(){
    return ((((root || {}).modules || {}).usuarios || {}).runtime) || {};
  }

  function resolveFn(name, legacyRef){
    if(typeof legacyRef === 'function') return legacyRef;
    try{
      if(typeof global[name] === 'function') return global[name];
    }catch(_e){}
    try{
      var usuariosRuntime = getUsuariosRuntime();
      if(usuariosRuntime && typeof usuariosRuntime[name] === 'function') return usuariosRuntime[name];
    }catch(_e){}
    return null;
  }

  function getUsersSafe(){
    var fn = resolveFn('getUsers', typeof global.getUsers !== 'undefined' ? global.getUsers : null);
    if(!fn) return [];
    try{
      var list = fn();
      return Array.isArray(list) ? list : [];
    }catch(error){
      try{ console.warn('[runtime] getUsers falhou', error); }catch(_e){}
      return [];
    }
  }

  function getUserSafe(uid){
    var fn = resolveFn('getUser', typeof global.getUser !== 'undefined' ? global.getUser : null);
    if(fn){
      try{ return fn(uid) || null; }catch(error){ try{ console.warn('[runtime] getUser falhou', error); }catch(_e){} }
    }
    var users = getUsersSafe();
    for(var i = 0; i < users.length; i++){
      var user = users[i];
      if(user && String(user.id) === String(uid)) return user;
    }
    return null;
  }

  function loadUsersDBSafe(cb){
    var fn = resolveFn('loadUsersDB', typeof global.loadUsersDB !== 'undefined' ? global.loadUsersDB : null);
    if(typeof fn !== 'function'){
      try{ console.warn('[runtime] loadUsersDB indisponível — usando cache local'); }catch(_e){}
      if(typeof cb === 'function') cb(getUsersSafe());
      return;
    }
    try{
      return fn(cb);
    }catch(error){
      try{ console.warn('[runtime] loadUsersDB falhou', error); }catch(_e){}
      if(typeof cb === 'function') cb(getUsersSafe());
    }
  }

  function loadDepartmentsRemoteSafe(cb){
    var fn = resolveFn('loadDepartmentsRemote', typeof global.loadDepartmentsRemote !== 'undefined' ? global.loadDepartmentsRemote : null);
    if(typeof fn !== 'function') return;
    try{
      return fn(cb || function(){});
    }catch(error){
      try{ console.warn('[runtime] loadDepartmentsRemote falhou', error); }catch(_e){}
    }
  }

  runtime.getUsuariosRuntime = getUsuariosRuntime;
  runtime.resolveFn = resolveFn;
  runtime.getUsersSafe = getUsersSafe;
  runtime.getUserSafe = getUserSafe;
  runtime.loadUsersDBSafe = loadUsersDBSafe;
  runtime.loadDepartmentsRemoteSafe = loadDepartmentsRemoteSafe;

  global._lfLegacyResolveFn = resolveFn;
  global._lfLegacyGetUsersSafe = getUsersSafe;
  global._lfLegacyGetUserSafe = getUserSafe;
  global._lfLegacyLoadUsersDBSafe = loadUsersDBSafe;
  global._lfLegacyLoadDepartmentsRemoteSafe = loadDepartmentsRemoteSafe;
})(window);
