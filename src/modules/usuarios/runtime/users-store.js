(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var usuarios = modules.usuarios = modules.usuarios || {};
  var timers = usuarios._crmEvtTimers = usuarios._crmEvtTimers || {};

  function getUsers(){ return global.sg('lf6_u') || []; }
  function getUser(id){ return getUsers().find(function(u){ return u.id === id; }) || null; }
  function _crmDispatchBuffered(evt, detail){
    try { clearTimeout(timers[evt]); } catch(_e){}
    timers[evt] = setTimeout(function(){
      try { global.dispatchEvent(new CustomEvent(evt, { detail: detail || {} })); } catch(_e){}
    }, 60);
  }
  function getDepartments(){ return global.sg('lf_departments') || []; }
  function _crmEmitUsersUpdated(reason, list){ _crmDispatchBuffered('crm:users-updated', { reason: reason || '', list: list || getUsers(), ts: Date.now() }); }
  function _crmEmitDepartmentsUpdated(reason, list){ _crmDispatchBuffered('crm:departments-updated', { reason: reason || '', list: list || getDepartments(), ts: Date.now() }); }
  function _usuariosRepo(){ return global.LiderCRM && global.LiderCRM.repositories && global.LiderCRM.repositories.usuarios || null; }
  function saveUserDoc(uid, patch){
    var repo = _usuariosRepo();
    if (!uid || !patch || !repo || typeof repo.saveUserPatch !== 'function') return;
    global.syncBusy();
    repo.saveUserPatch(uid, patch).then(global.syncOk).catch(global.syncErr);
  }
  function deleteUserDoc(uid){
    var repo = _usuariosRepo();
    if (!uid || !repo || typeof repo.deleteUser !== 'function') return;
    global.syncBusy();
    repo.deleteUser(uid).then(global.syncOk).catch(global.syncErr);
  }
  function saveUsersLocal(list, uid, patch){
    var localOk = global.ss('lf6_u', list);
    var repo = _usuariosRepo();
    if (localOk) _crmEmitUsersUpdated(uid ? 'patch' : 'bulk', list);
    if (uid && patch) saveUserDoc(uid, patch);
    else if (global.DB_MODE === 'firebase' && repo) list.forEach(function(u){ if (u && u.id) saveUserDoc(u.id, u); });
    return localOk;
  }
  function _seedDefaultUsersToCloud(list){
    var repo = _usuariosRepo();
    var arr = (list || []).filter(function(u){ return u && u.id; });
    if (!repo || typeof repo.batchUpsertUsers !== 'function' || !arr.length) return;
    global.syncBusy();
    repo.batchUpsertUsers(arr).then(global.syncOk).catch(global.syncErr);
  }
  function migrateUsersLegacyDoc(cb){
    var repo = _usuariosRepo();
    if (!repo || typeof repo.getLegacyUsersDoc !== 'function') {
      var defaults = getUsers();
      _seedDefaultUsersToCloud(defaults);
      cb(defaults);
      return;
    }
    repo.getLegacyUsersDoc().then(function(d){
      if (d && d.list && d.list.length) {
        var result = d.list;
        global.syncBusy();
        repo.batchUpsertUsers(result).then(global.syncOk).catch(global.syncErr);
        global.ss('lf6_u', result);
        cb(result);
      } else {
        var defaults = getUsers();
        _seedDefaultUsersToCloud(defaults);
        cb(defaults);
      }
    }).catch(function(){
      var defaults = getUsers();
      _seedDefaultUsersToCloud(defaults);
      cb(defaults);
    });
  }
  function loadUsersDB(cb){
    var repo = _usuariosRepo();
    if (global.DB_MODE === 'firebase' && repo && typeof repo.listUsers === 'function') {
      repo.listUsers().then(function(safeList){
        var result = Array.isArray(safeList) ? safeList.filter(Boolean) : [];
        if (result.length) {
          var local = global.sg('lf6_u') || [];
          var serverIds = {};
          result.forEach(function(u){ if (u && u.id) serverIds[u.id] = true; });
          local.forEach(function(u){
            if (u && u.id && !serverIds[u.id]) {
              result.push(u);
              saveUserDoc(u.id, u);
            }
          });
          global.ss('lf6_u', result);
          _crmEmitUsersUpdated('remote-load', result);
          cb(result);
        } else {
          migrateUsersLegacyDoc(cb);
        }
      }).catch(function(){
        var list = getUsers();
        _crmEmitUsersUpdated('fallback', list);
        cb(list);
      });
    } else {
      var list = getUsers();
      _crmEmitUsersUpdated('local', list);
      cb(list);
    }
  }
  function saveDepartmentsList(list){
    global.ss('lf_departments', list);
    _crmEmitDepartmentsUpdated('save', list);
    var repo = _usuariosRepo();
    if (global.DB_MODE === 'firebase' && repo && typeof repo.setConfigDoc === 'function') {
      global.syncBusy();
      repo.setConfigDoc('departments', { list:list, ts:Date.now() }).then(global.syncOk).catch(global.syncErr);
    }
  }
  function loadDepartmentsRemote(cb){
    if (cb) cb(getDepartments());
    var repo = _usuariosRepo();
    if (global.DB_MODE === 'firebase' && repo && typeof repo.getConfigDoc === 'function') {
      repo.getConfigDoc('departments').then(function(d){
        var list = d && Array.isArray(d.list) ? d.list : [];
        global.ss('lf_departments', list);
        _crmEmitDepartmentsUpdated('remote-load', list);
        if (cb) cb(list);
      }).catch(function(e){console.warn("[users] sync bg falhou",e);});
    }
  }

  // Helpers puros de dispositivo/sessão, extraídos de js/usuarios.js
  // na rodada 2026-07-17 (parte 3).
  function _deviceId(){
    var id=null;try{id=localStorage.getItem('lf_device_id');}catch(e){}
    if(!id){id='dev_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);try{localStorage.setItem('lf_device_id',id);}catch(e){}}
    return id;
  }

  function _deviceLabel(){
    var ua=navigator.userAgent||'';
    var os='Dispositivo';
    if(/iPhone/.test(ua))os='iPhone';
    else if(/iPad/.test(ua))os='iPad';
    else if(/Android/.test(ua))os='Android';
    else if(/Windows/.test(ua))os='Windows';
    else if(/Macintosh/.test(ua))os='Mac';
    else if(/Linux/.test(ua))os='Linux';
    var browser='Navegador';
    if(/Edg\//.test(ua))browser='Edge';
    else if(/OPR\//.test(ua))browser='Opera';
    else if(/Chrome\//.test(ua)&&!/OPR\/|Edg\//.test(ua))browser='Chrome';
    else if(/Firefox\//.test(ua))browser='Firefox';
    else if(/Safari\//.test(ua)&&!/Chrome\//.test(ua))browser='Safari';
    var isPWA=(global.matchMedia&&global.matchMedia('(display-mode: standalone)').matches)||global.navigator.standalone===true;
    return (isPWA?'App instalado':browser)+' · '+os;
  }

  function _normalizeSessionsList(list){
    var byId={},out=[];
    (list||[]).forEach(function(s){
      if(!s||!s.deviceId)return;
      var loggedInAt=s.loggedInAt||s.lastActive||Date.now();
      var lastActive=s.lastActive||loggedInAt;
      var cur=byId[s.deviceId];
      if(cur){
        cur.loggedInAt=Math.min(cur.loggedInAt||loggedInAt,loggedInAt);
        if(lastActive>(cur.lastActive||0))cur.lastActive=lastActive;
        if(s.label)cur.label=s.label;
        return;
      }
      cur={deviceId:s.deviceId,label:s.label||'Dispositivo',loggedInAt:loggedInAt,lastActive:lastActive};
      byId[s.deviceId]=cur;
      out.push(cur);
    });
    return out;
  }

  function _fmtLastSeen(ts){
    if(!ts)return '—';
    var diff=Date.now()-ts;
    if(diff<120000)return 'agora mesmo';
    if(diff<3600000)return 'há '+Math.floor(diff/60000)+' min';
    if(diff<86400000)return 'há '+Math.floor(diff/3600000)+'h';
    return new Date(ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }


  // R14-02: expor funções ao escopo global — getUsers, getUser, loadUsersDB, etc.
  // são chamadas diretamente por js/usuarios.js, js/auth.js, js/kanban.js,
  // js/relatorios.js, js/dashboard.js, js/agenda.js, js/clientes.js como funções globais.
  global.getUsers = getUsers;
  global.getUser = getUser;
  global.loadUsersDB = loadUsersDB;
  global.getDepartments = getDepartments;
  global.saveDepartmentsList = saveDepartmentsList;
  global.loadDepartmentsRemote = loadDepartmentsRemote;
  global.saveUsersLocal = saveUsersLocal;
  global.saveUserDoc = saveUserDoc;
  global.deleteUserDoc = deleteUserDoc;
  global.migrateUsersLegacyDoc = migrateUsersLegacyDoc;
  global._deviceId = _deviceId;
  global._deviceLabel = _deviceLabel;
  global._normalizeSessionsList = _normalizeSessionsList;
  global._fmtLastSeen = _fmtLastSeen;

  usuarios.runtime = {
    getUsers: getUsers,
    getUser: getUser,
    _crmDispatchBuffered: _crmDispatchBuffered,
    _crmEmitUsersUpdated: _crmEmitUsersUpdated,
    _crmEmitDepartmentsUpdated: _crmEmitDepartmentsUpdated,
    _usuariosRepo: _usuariosRepo,
    saveUserDoc: saveUserDoc,
    deleteUserDoc: deleteUserDoc,
    saveUsersLocal: saveUsersLocal,
    _seedDefaultUsersToCloud: _seedDefaultUsersToCloud,
    migrateUsersLegacyDoc: migrateUsersLegacyDoc,
    loadUsersDB: loadUsersDB,
    getDepartments: getDepartments,
    saveDepartmentsList: saveDepartmentsList,
    loadDepartmentsRemote: loadDepartmentsRemote,
    _deviceId: _deviceId,
    _deviceLabel: _deviceLabel,
    _normalizeSessionsList: _normalizeSessionsList,
    _fmtLastSeen: _fmtLastSeen
  };
})(window);
