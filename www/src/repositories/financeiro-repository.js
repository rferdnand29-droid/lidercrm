(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var repositories = root.repositories = root.repositories || {};
  var BaseRepository = repositories.BaseRepository;

  function FinanceiroRepository(){ BaseRepository.call(this, 'financeiro'); }
  FinanceiroRepository.prototype = Object.create(BaseRepository.prototype);
  FinanceiroRepository.prototype.constructor = FinanceiroRepository;
  repositories.FinanceiroRepository = FinanceiroRepository;
  repositories.financeiro = new FinanceiroRepository();
})(window);
