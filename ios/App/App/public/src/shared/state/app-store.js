(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var store = root.store = root.store || {};
  var utils = (root.utils = root.utils || {});

  store.getSession = function(){
    return typeof utils.session === 'function' ? utils.session() : null;
  };

  store.getUserId = function(){
    var session = store.getSession();
    return session && session.userId ? session.userId : null;
  };

  store.getDbMode = function(){
    try{
      return global.DB_MODE || 'local';
    }catch(_error){
      return 'local';
    }
  };

  store.isCloudConnected = function(){
    return store.getDbMode() === 'firebase' && !!global.db;
  };
})(window);
