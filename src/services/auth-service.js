// =====================================================================
// services/auth-service.js — Fase 3.2
// -----------------------------------------------------------------------
// Fachada de auth para a arquitetura nova. Continua delegando ao
// legado por compatibilidade (invokeLegacy), mas adiciona:
//   • bridgeLegacySession() — dispara o patch de ponte legada manualmente
//   • logout() — encerra tanto a sessão do Worker quanto a legada
//   • hasWorkerSession() — só true se JWT do Worker está válido
// =====================================================================
(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var BaseService = services.BaseService;

  function AuthService(){ BaseService.call(this); }
  AuthService.prototype = Object.create(BaseService.prototype);
  AuthService.prototype.constructor = AuthService;
  AuthService.prototype.boot = function(){ return this.invokeLegacy('bootApp'); };
  // Mantido legado por compatibilidade com o fluxo visual atual.
  AuthService.prototype.login = function(){ return this.invokeLegacy('doLogin'); };
  AuthService.prototype.loginWorker = function(email, password){
    var wc = root.api && root.api.workerClient;
    if(!wc) return Promise.reject(new Error('worker-auth-unavailable'));
    return wc.login(email, password).then(function(res){ return (res && res.data && res.data.data) || null; });
  };

  // Fase 3.2 — dispara a ponte legada explicitamente (ex.: no boot).
  // Idempotente: se já existe JWT válido, resolve true sem fazer nada.
  AuthService.prototype.bridgeLegacySession = function(){
    var b = global.__lfLegacyAuthBridge;
    if (b && typeof b.tryBridge === 'function') return b.tryBridge();
    return Promise.resolve(false);
  };

  AuthService.prototype.logout = function(){
    var wc = root.api && root.api.workerClient;
    // Fase 3.2 — logout() do worker agora é assíncrono (avisa o servidor).
    var p = (wc && typeof wc.logout === 'function') ? wc.logout() : Promise.resolve();
    // O legado é chamado sincronamente pra preservar UX (tela de login volta na hora).
    var self = this;
    var legacyResult = self.invokeLegacy('_execLogout');
    return Promise.resolve(p).then(function(){ return legacyResult; });
  };

  AuthService.prototype.hasSession = function(){
    var wc = root.api && root.api.httpClient;
    if(wc && wc.session && typeof wc.session.isValid === 'function' && wc.session.isValid()) return true;
    return this.invokeLegacy('checkSes', [], false);
  };

  // Fase 3.2 — true SOMENTE se o JWT do Worker está válido.
  AuthService.prototype.hasWorkerSession = function(){
    var wc = root.api && root.api.httpClient;
    return !!(wc && wc.session && typeof wc.session.isValid === 'function' && wc.session.isValid());
  };

  services.AuthService = AuthService;
  services.auth = new AuthService();
})(window);
