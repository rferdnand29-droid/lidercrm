(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var BaseService = services.BaseService;

  function UploadService(){ BaseService.call(this); }
  UploadService.prototype = Object.create(BaseService.prototype);
  UploadService.prototype.constructor = UploadService;
  UploadService.prototype.uploadFile = function(file, path, callback){
    var repo = root.repositories && root.repositories.storage;
    if(repo && typeof repo.upload === 'function') return repo.upload(file, path, callback);
    return this.invokeLegacy('_uploadFileToStorage', [file, path, callback]);
  };
  UploadService.prototype.uploadFallback = function(file, callback){ return this.invokeLegacy('_uploadFileAsDataURL', [file, callback]); };
  services.UploadService = UploadService;
  services.upload = new UploadService();
})(window);
