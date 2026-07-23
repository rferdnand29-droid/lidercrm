(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var BaseService = services.BaseService;

  function SyncService(){ BaseService.call(this); }
  SyncService.prototype = Object.create(BaseService.prototype);
  SyncService.prototype.constructor = SyncService;
  SyncService.prototype.syncBusy = function(){ return this.invokeLegacy('syncBusy'); };
  SyncService.prototype.syncOk = function(){ return this.invokeLegacy('syncOk'); };
  SyncService.prototype.syncErr = function(error){ return this.invokeLegacy('syncErr', [error]); };
  services.SyncService = SyncService;
  services.sync = new SyncService();
})(window);
