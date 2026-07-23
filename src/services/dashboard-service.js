(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var BaseService = services.BaseService;

  function DashboardService(){ BaseService.call(this); }
  DashboardService.prototype = Object.create(BaseService.prototype);
  DashboardService.prototype.constructor = DashboardService;
  DashboardService.prototype.fetchSummary = function(query){
    var wc = root.api && root.api.workerClient;
    if(root.config && root.config.useWorkerApi && wc){
      return wc.dashboard(query).then(function(res){ return (res && res.data && res.data.data) || null; });
    }
    return Promise.resolve(null);
  };
  DashboardService.prototype.render = function(){ return this.invokeLegacy('renderDash'); };
  services.DashboardService = DashboardService;
  services.dashboard = new DashboardService();
})(window);
