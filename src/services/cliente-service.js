(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var BaseService = services.BaseService;

  function ClienteService(){ BaseService.call(this); }
  ClienteService.prototype = Object.create(BaseService.prototype);
  ClienteService.prototype.constructor = ClienteService;
  ClienteService.prototype.load = function(uid, callback){ return this.invokeLegacy('loadCli', [uid, callback]); };
  ClienteService.prototype.render = function(){ return this.invokeLegacy('renderCli'); };
  services.ClienteService = ClienteService;
  services.clientes = new ClienteService();
})(window);
