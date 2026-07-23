(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var BaseService = services.BaseService;

  function FinanceiroService(){ BaseService.call(this); }
  FinanceiroService.prototype = Object.create(BaseService.prototype);
  FinanceiroService.prototype.constructor = FinanceiroService;
  FinanceiroService.prototype.fetch = function(query){
    var wc = root.api && root.api.workerClient;
    if(root.config && root.config.useWorkerApi && wc){
      return wc.financeiro(query).then(function(res){ return (res && res.data && res.data.data) || []; });
    }
    return Promise.resolve([]);
  };
  FinanceiroService.prototype.refresh = function(){ return this.invokeLegacy('renderAdmAtivKpis'); };
  services.FinanceiroService = FinanceiroService;
  services.financeiro = new FinanceiroService();
})(window);
