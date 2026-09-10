(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var repositories = root.repositories = root.repositories || {};
  var BaseRepository = repositories.BaseRepository;

  function DashboardRepository(){ BaseRepository.call(this, 'dashboard'); }
  DashboardRepository.prototype = Object.create(BaseRepository.prototype);
  DashboardRepository.prototype.constructor = DashboardRepository;
  repositories.DashboardRepository = DashboardRepository;
  repositories.dashboard = new DashboardRepository();
})(window);
