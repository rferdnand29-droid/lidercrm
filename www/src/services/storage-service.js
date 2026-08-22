(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var BaseService = services.BaseService;

  function StorageService(){ BaseService.call(this); }
  StorageService.prototype = Object.create(BaseService.prototype);
  StorageService.prototype.constructor = StorageService;
  StorageService.prototype.upload = function(file, path, callback){
    var repo = root.repositories && root.repositories.storage;
    if(repo && typeof repo.upload === 'function') return repo.upload(file, path, callback);
    return this.invokeLegacy('_uploadFileToStorage', [file, path, callback]);
  };
  StorageService.prototype.remove = function(path, callback){ return this.invokeLegacy('_deleteFromStorage', [path, callback]); };
  services.StorageService = StorageService;
  services.storage = new StorageService();
})(window);
