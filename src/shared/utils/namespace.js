(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var utils = root.utils = root.utils || {};

  utils.ensureNamespace = function(path){
    var parts = String(path || '').split('.').filter(Boolean);
    var cursor = root;
    for(var i=0;i<parts.length;i++){
      cursor[parts[i]] = cursor[parts[i]] || {};
      cursor = cursor[parts[i]];
    }
    return cursor;
  };

  utils.resolveGlobal = function(name){
    if(!name)return null;
    var parts = String(name).split('.');
    var cursor = global;
    for(var i=0;i<parts.length;i++){
      if(cursor == null)return null;
      cursor = cursor[parts[i]];
    }
    return cursor == null ? null : cursor;
  };

  utils.safeCall = function(name, args, fallback){
    var fn = utils.resolveGlobal(name);
    if(typeof fn !== 'function'){
      return typeof fallback === 'function' ? fallback() : fallback;
    }
    return fn.apply(global, Array.isArray(args) ? args : []);
  };

  utils.safePromise = function(executor){
    return new Promise(function(resolve, reject){
      try{
        executor(resolve, reject);
      }catch(error){
        reject(error);
      }
    });
  };

  utils.session = function(){
    try{
      if(global.S)return global.S;
      return JSON.parse(global.localStorage.getItem('lf6_s') || 'null');
    }catch(_error){
      return null;
    }
  };
})(window);
