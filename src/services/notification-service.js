(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var services = root.services = root.services || {};
  var BaseService = services.BaseService;

  function dbReady(){
    return global.DB_MODE === 'firebase' && !!global.db;
  }

  function configDoc(name){
    if(!dbReady() || !name) return null;
    return global.db.collection('config').doc(String(name));
  }

  function notifDoc(uid){
    if(!dbReady() || !uid) return null;
    return global.db.collection('notifications').doc(String(uid));
  }

  function dataOf(snapshot){
    if(!snapshot) return null;
    return typeof snapshot.data === 'function' ? snapshot.data() : snapshot;
  }

  function localRules(){
    return typeof global.getAutomationRules === 'function' ? global.getAutomationRules() : [];
  }

  function localNotifs(uid){
    return typeof global.getNotifs === 'function' ? global.getNotifs(uid) : [];
  }

  function notifKey(uid){
    return typeof global.notifKey === 'function' ? global.notifKey(uid) : ('lf_notif_' + String(uid || (global.S && global.S.userId) || 'anon'));
  }

  function writeLocalNotifs(uid, list){
    if(typeof global.ss === 'function') global.ss(notifKey(uid), list);
    return list;
  }

  function workerReady(){
    return !!(root.config && root.config.useWorkerNotifications && root.api && root.api.workerClient && root.api.httpClient && root.api.httpClient.session && root.api.httpClient.session.isValid && root.api.httpClient.session.isValid());
  }

  function workerRequest(path, options){
    var wc = root.api && root.api.workerClient;
    if(!wc || typeof wc.request !== 'function') return Promise.resolve(null);
    return wc.request(path, options || {}).then(function(res){
      if(!res || !res.ok) throw new Error((res && res.data && res.data.error && res.data.error.message) || 'worker-request-failed');
      return (res.data && res.data.data !== undefined) ? res.data.data : res.data;
    });
  }

  function NotificationService(){ BaseService.call(this); }
  NotificationService.prototype = Object.create(BaseService.prototype);
  NotificationService.prototype.constructor = NotificationService;

  NotificationService.prototype.load = function(callback){
    return this.loadNotifs(global.S && global.S.userId, callback);
  };

  NotificationService.prototype.updateBadge = function(){ return this.invokeLegacy('updateNotifBadge'); };

  NotificationService.prototype.saveAutomationRules = function(list){
    var payload = { list: Array.isArray(list) ? list : [], ts: Date.now() };
    if(typeof global.ss === 'function' && typeof global.AUTOMATION_RULES_KEY !== 'undefined'){
      global.ss(global.AUTOMATION_RULES_KEY, payload.list);
    }
    if(workerReady()){
      return workerRequest('/notificacoes/rules', { method: 'PUT', body: payload }).catch(function(){ return payload.list; });
    }
    if(!dbReady()) return Promise.resolve(payload.list);
    if(typeof global.syncBusy === 'function') global.syncBusy();
    return configDoc('automation_rules').set(payload).then(function(){
      if(typeof global.syncOk === 'function') global.syncOk();
      return payload.list;
    }).catch(function(err){
      if(typeof global.syncErr === 'function') global.syncErr(err);
      return payload.list;
    });
  };

  NotificationService.prototype.loadAutomationRules = function(callback){
    var local = localRules();
    if(typeof callback === 'function') callback(local);
    if(workerReady()){
      return workerRequest('/notificacoes/rules', { method: 'GET' }).then(function(list){
        list = Array.isArray(list) ? list : local;
        if(typeof global.ss === 'function' && typeof global.AUTOMATION_RULES_KEY !== 'undefined') global.ss(global.AUTOMATION_RULES_KEY, list);
        if(typeof global._autoLastRun !== 'undefined') global._autoLastRun = {};
        if(typeof callback === 'function') callback(list);
        return list;
      }).catch(function(){ return local; });
    }
    if(!dbReady()) return Promise.resolve(local);
    return configDoc('automation_rules').get().then(function(snapshot){
      var data = dataOf(snapshot) || {};
      var list = Array.isArray(data.list) ? data.list : local;
      if(typeof global.ss === 'function' && typeof global.AUTOMATION_RULES_KEY !== 'undefined'){
        global.ss(global.AUTOMATION_RULES_KEY, list);
      }
      if(typeof global._autoLastRun !== 'undefined') global._autoLastRun = {};
      if(typeof callback === 'function') callback(list);
      return list;
    }).catch(function(){ return local; });
  };

  NotificationService.prototype.saveNotifs = function(uid, list){
    uid = uid || (global.S && global.S.userId);
    var safe = (Array.isArray(list) ? list : []).slice(0, 150);
    writeLocalNotifs(uid, safe);
    if(workerReady() && uid){
      return workerRequest('/notificacoes/inbox?uid=' + encodeURIComponent(uid), { method: 'PUT', body: { list: safe } }).then(function(){
        return safe;
      }).catch(function(){ return safe; });
    }
    if(!dbReady() || !uid) return Promise.resolve(safe);
    return notifDoc(uid).set({ list: safe, ts: Date.now() }).then(function(){
      return safe;
    }).catch(function(){ return safe; });
  };

  NotificationService.prototype.loadNotifs = function(uid, callback){
    uid = uid || (global.S && global.S.userId);
    var local = localNotifs(uid);
    if(typeof global._alertNewNotifs === 'function') global._alertNewNotifs(local);
    if(typeof callback === 'function') callback(local);
    if(workerReady() && uid){
      return workerRequest('/notificacoes/inbox?uid=' + encodeURIComponent(uid), { method: 'GET' }).then(function(server){
        var list = Array.isArray(server) ? server : local;
        writeLocalNotifs(uid, list);
        if(typeof global._alertNewNotifs === 'function') global._alertNewNotifs(list);
        if(typeof callback === 'function') callback(list);
        return list;
      }).catch(function(){ return local; });
    }
    if(!dbReady() || !uid) return Promise.resolve(local);
    return notifDoc(uid).get().then(function(snapshot){
      var data = dataOf(snapshot) || {};
      var server = Array.isArray(data.list) ? data.list : [];
      var mergeFn = typeof global._mergeKeepLocalOnly === 'function'
        ? global._mergeKeepLocalOnly
        : function(remote, cached){ return Array.isArray(remote) && remote.length ? remote : (cached || []); };
      var merged = mergeFn(server, localNotifs(uid));
      writeLocalNotifs(uid, merged);
      if(typeof global._alertNewNotifs === 'function') global._alertNewNotifs(merged);
      if(typeof callback === 'function') callback(merged);
      return merged;
    }).catch(function(){ return local; });
  };

  NotificationService.prototype.pushNotif = function(toUid, type, text, opts){
    if(!toUid) return Promise.resolve(null);
    opts = opts || {};
    var entry = {
      id: 'ntf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
      type: type,
      text: text,
      ts: new Date().toISOString(),
      lida: false,
      cardId: opts.cardId || null,
      board: opts.board || null
    };
    var self = this;
    if(workerReady()){
      return workerRequest('/notificacoes/inbox', {
        method: 'POST',
        body: {
          id: entry.id,
          toUid: toUid,
          type: type,
          text: text,
          ts: entry.ts,
          lida: false,
          cardId: entry.cardId,
          board: entry.board
        }
      }).then(function(){
        if(global.S && toUid === global.S.userId && typeof global.updateNotifBadge === 'function') global.updateNotifBadge();
        return entry;
      }).catch(function(){
        var local = localNotifs(toUid);
        local.unshift(entry);
        if(local.length > 200) local = local.slice(0, 200);
        return self.saveNotifs(toUid, local).then(function(){
          if(global.S && toUid === global.S.userId && typeof global.updateNotifBadge === 'function') global.updateNotifBadge();
          return entry;
        });
      });
    }
    if(!dbReady()){
      var local = localNotifs(toUid);
      local.unshift(entry);
      if(local.length > 200) local = local.slice(0, 200);
      return self.saveNotifs(toUid, local).then(function(){
        if(global.S && toUid === global.S.userId && typeof global.updateNotifBadge === 'function') global.updateNotifBadge();
        return entry;
      });
    }
    return notifDoc(toUid).get().then(function(snapshot){
      var data = dataOf(snapshot) || {};
      var list = Array.isArray(data.list) ? data.list : localNotifs(toUid);
      list.unshift(entry);
      if(list.length > 200) list = list.slice(0, 200);
      return self.saveNotifs(toUid, list).then(function(){
        if(global.S && toUid === global.S.userId && typeof global.updateNotifBadge === 'function') global.updateNotifBadge();
        return entry;
      });
    }).catch(function(){
      var list = localNotifs(toUid);
      list.unshift(entry);
      if(list.length > 200) list = list.slice(0, 200);
      return self.saveNotifs(toUid, list).then(function(){
        if(global.S && toUid === global.S.userId && typeof global.updateNotifBadge === 'function') global.updateNotifBadge();
        return entry;
      });
    });
  };

  services.NotificationService = NotificationService;
  services.notifications = new NotificationService();
})(window);
