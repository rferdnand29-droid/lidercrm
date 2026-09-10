(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var BaseService = services.BaseService;

  function LeadService(){ BaseService.call(this); }
  LeadService.prototype = Object.create(BaseService.prototype);
  LeadService.prototype.constructor = LeadService;
  LeadService.prototype.renderBoard = function(board){ return this.invokeLegacy('renderKB', [board]); };
  LeadService.prototype.renderBoardLocal = function(board){ return this.invokeLegacy('renderKBLocal', [board]); };
  services.LeadService = LeadService;
  services.leads = new LeadService();
})(window);
