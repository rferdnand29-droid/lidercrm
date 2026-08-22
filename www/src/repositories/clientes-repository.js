(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var repositories = root.repositories = root.repositories || {};
  var BaseRepository = repositories.BaseRepository;

  function ClientesRepository(){ BaseRepository.call(this, 'clientes'); }
  ClientesRepository.prototype = Object.create(BaseRepository.prototype);
  ClientesRepository.prototype.constructor = ClientesRepository;
  repositories.ClientesRepository = ClientesRepository;
  repositories.clientes = new ClientesRepository();
})(window);
