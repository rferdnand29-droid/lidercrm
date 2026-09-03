(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var repositories = root.repositories = root.repositories || {};
  var BaseRepository = repositories.BaseRepository;

  function LeadsRepository(){ BaseRepository.call(this, 'leads'); }
  LeadsRepository.prototype = Object.create(BaseRepository.prototype);
  LeadsRepository.prototype.constructor = LeadsRepository;
  repositories.LeadsRepository = LeadsRepository;
  repositories.leads = new LeadsRepository();
})(window);
