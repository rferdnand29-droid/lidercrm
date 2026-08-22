(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var utils = root.utils || {};

  function BaseService(){}

  BaseService.prototype.invokeLegacy = function(name, args, fallback){
    if(utils && typeof utils.safeCall === 'function')return utils.safeCall(name, args, fallback);
    var fn = global[name];
    if(typeof fn === 'function')return fn.apply(global, Array.isArray(args) ? args : []);
    return typeof fallback === 'function' ? fallback() : fallback;
  };

  services.BaseService = BaseService;
})(window);
