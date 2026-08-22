(function(global){
  'use strict';
  if (!global || global.__LF_PRESENCE_GROUP_LOGIN_FINAL_20260730__) return;
  global.__LF_PRESENCE_GROUP_LOGIN_FINAL_20260730__ = true;

  var D = global.document;
  var LS = global.localStorage;
  var TOKEN_KEY = 'lidercrm_worker_jwt_v1';
  var PRES_TTL_MS = 90 * 1000;
  var PRES_HB_MS  = 60 * 1000;
  var presTimer = null;
  var presHooksInstalled = false;
  var presCache = Object.create(null); // uid -> { ts, last_heartbeat_at, last_login_at }
  var remoteMetaCache = Object.create(null); // convId -> last fetch ts

  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function arr(x){ return Array.isArray(x) ? x : []; }
  function str(v){ return String(v == null ? '' : v).trim(); }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function meUid(){
    return safe(function(){
      if (global.S && global.S.userId) return String(global.S.userId);
      var raw = LS.getItem('lf6_s');
      if (raw){ var s = JSON.parse(raw); if (s && s.userId) return String(s.userId); }
      return '';
    }, '');
  }
  function normUid(uid){
    uid = str(uid).toLowerCase();
    if (!uid) return '';
    if (typeof global._chatCanonicalUid === 'function') {
      try { return String(global._chatCanonicalUid(uid) || uid).toLowerCase(); } catch(_e){}
    }
    return uid;
  }
  function sameUid(a,b){
    a = normUid(a); b = normUid(b);
    return !!a && !!b && a === b;
  }

  function getWorkerToken(){
    return safe(function(){
      var ss = global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.httpClient && global.LiderCRM.api.httpClient.session;
      if (ss && typeof ss.get === 'function'){
        var cur = ss.get();
        if (cur && cur.token) return String(cur.token);
      }
      var raw = LS.getItem(TOKEN_KEY);
      if (raw){ var obj = JSON.parse(raw); if (obj && obj.token) return String(obj.token); }
      return (global.S && (global.S._workerToken || global.S.token)) ? String(global.S._workerToken || global.S.token) : '';
    }, '');
  }
  function http(){
    return safe(function(){ return global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.httpClient; }, null);
  }
  function wc(){
    return safe(function(){ return global.LiderCRM && global.LiderCRM.api && global.LiderCRM.api.workerClient; }, null);
  }
  function ensureRawRequest(){
    var client = wc();
    if (!client || typeof client.rawRequest === 'function') return;
    client.rawRequest = function(path, method, body){
      var h = http();
      if (h && typeof h.request === 'function'){
        return h.request(path, { method: method || 'GET', body: body == null ? undefined : body, credentials: 'same-origin' });
      }
      var token = getWorkerToken();
      var headers = { 'Accept':'application/json', 'Content-Type':'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch(path, {
        method: method || 'GET',
        headers: headers,
        body: (body == null || /^(GET|HEAD)$/i.test(method||'GET')) ? undefined : JSON.stringify(body),
        credentials: 'same-origin'
      }).then(function(r){ return r.text().then(function(t){ var d; try{ d=t?JSON.parse(t):null; }catch(_e){ d=t; } return { ok:r.ok, status:r.status, data:d, headers:r.headers }; }); });
    };
  }
  function apiReq(path, method, body, keepalive){
    ensureRawRequest();
    var client = wc();
    if (client && typeof client.rawRequest === 'function' && !keepalive){
      return client.rawRequest(path, method || 'GET', body || null);
    }
    var h = http();
    if (h && typeof h.request === 'function' && !keepalive){
      return h.request(path, { method: method || 'GET', body: body == null ? undefined : body, credentials: 'same-origin' });
    }
    var token = getWorkerToken();
    var headers = { 'Accept':'application/json' };
    if (!/^(GET|HEAD)$/i.test(method||'GET')) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(path, {
      method: method || 'GET',
      headers: headers,
      body: (/^(GET|HEAD)$/i.test(method||'GET') || body == null) ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      keepalive: !!keepalive
    }).then(function(r){
      return r.text().then(function(t){ var d; try{ d=t?JSON.parse(t):null; }catch(_e){ d=t; } return { ok:r.ok, status:r.status, data:d, headers:r.headers }; });
    }).catch(function(err){
      return { ok:false, status:0, data:{ ok:false, error:{ code:'NETWORK_ERROR', message:String(err&&err.message||err) } } };
    });
  }

  function writeLocalPresence(uid, ts, reason){
    uid = str(uid); if (!uid) return;
    var rec = { ts: Date.now(), last_heartbeat_at: new Date(ts).toISOString(), last_login_at: reason === 'heartbeat' ? null : new Date(ts).toISOString() };
    presCache[uid] = Object.assign({}, presCache[uid]||{}, rec);
    safe(function(){
      var cache = JSON.parse(LS.getItem('lf_presence_local') || '{}');
      cache[uid] = ts;
      if (reason) cache[uid + '_reason'] = reason;
      LS.setItem('lf_presence_local', JSON.stringify(cache));
    });
  }
  function beatPresence(){
    var uid = meUid();
    if (!uid || !getWorkerToken()) return Promise.resolve(false);
    var ts = Date.now();
    writeLocalPresence(uid, ts, 'heartbeat');
    return apiReq('/api/v1/users/heartbeat', 'POST', { userId: uid, ts: ts }, false).then(function(res){
      if (res && res.ok) refreshOnlineCache();
      return !!(res && res.ok);
    });
  }
  function markLastSeen(reason){
    var uid = meUid();
    var token = getWorkerToken();
    if (!uid || !token) return Promise.resolve(false);
    var ts = Date.now();
    writeLocalPresence(uid, ts, reason || 'manual');
    return apiReq('/api/v1/users/last-seen', 'POST', { userId: uid, ts: ts, reason: reason || 'manual' }, true)
      .then(function(res){ return !!(res && res.ok); });
  }
  /* Coalesce + throttle (2026-08-11): refreshOnlineCache() é chamada de vários
     gatilhos (heartbeat OK, boot, foco da janela, troca de aba, o próprio
     setInterval) — em desktop com troca de aba frequente isso vira dezenas de
     GET /users/online por minuto, o suficiente pra esbarrar no limite de taxa
     do Worker (429). Se já há uma chamada em voo, devolve a MESMA promise
     (nunca duplica a requisição); se a última chamada terminou há pouco
     tempo, devolve o cache atual sem nova requisição. */
  var _refreshOnlineInFlight=null,_refreshOnlineLastAt=0;
  var REFRESH_ONLINE_MIN_INTERVAL_MS=20000;
  function refreshOnlineCache(){
    if (_refreshOnlineInFlight) return _refreshOnlineInFlight;
    if (Date.now()-_refreshOnlineLastAt < REFRESH_ONLINE_MIN_INTERVAL_MS) return Promise.resolve(presCache);
    _refreshOnlineInFlight = apiReq('/api/v1/users/online', 'GET', null, false).then(function(res){
      var list = (((res||{}).data||{}).data||{}).list || [];
      if (!Array.isArray(list)) list = [];
      var next = Object.create(null);
      list.forEach(function(u){
        if (!u || !u.id) return;
        next[String(u.id)] = {
          ts: Date.now(),
          last_heartbeat_at: u.last_heartbeat_at || null,
          last_login_at: u.last_login_at || null
        };
      });
      presCache = next;
      refreshPresenceUI();
      return next;
    }).catch(function(){ return presCache; }).finally(function(){
      _refreshOnlineLastAt=Date.now();
      _refreshOnlineInFlight=null;
    });
    return _refreshOnlineInFlight;
  }
  function isOnline(uid){
    uid = str(uid); if (!uid) return false;
    if (sameUid(uid, meUid())) return true;
    var hit = presCache[uid] || presCache[normUid(uid)] || null;
    if (hit && hit.last_heartbeat_at){
      var dt = Date.now() - new Date(hit.last_heartbeat_at).getTime();
      if (dt >= 0 && dt < PRES_TTL_MS) return true;
    }
    try {
      if (typeof global._chatOnlineUsers !== 'undefined' && global._chatOnlineUsers && global._chatOnlineUsers[uid]) return true;
    } catch(_e){}
    return false;
  }
  function lastSeenIso(uid){
    uid = str(uid); if (!uid) return null;
    var hit = presCache[uid] || presCache[normUid(uid)] || null;
    if (hit && hit.last_login_at) return hit.last_login_at;
    if (hit && hit.last_heartbeat_at) return hit.last_heartbeat_at;
    return safe(function(){
      var cache = JSON.parse(LS.getItem('lf_presence_local') || '{}');
      if (cache && cache[uid]) return new Date(Number(cache[uid])).toISOString();
      return null;
    }, null);
  }
  function lastSeenLabel(uid){
    if (isOnline(uid)) return 'online';
    var iso = lastSeenIso(uid);
    if (!iso) return 'offline';
    var diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'visto agora';
    if (diff < 3600000) return 'visto há ' + Math.max(1, Math.floor(diff/60000)) + ' min';
    if (diff < 86400000) return 'visto há ' + Math.max(1, Math.floor(diff/3600000)) + ' h';
    var d = new Date(iso);
    return 'visto às ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  global.lfIsUserOnline = isOnline;
  global.lfLastSeen = lastSeenIso;
  global.lfLastSeenLabel = lastSeenLabel;

  function refreshPresenceUI(){
    try {
      var convId = global._chatCurrentConv;
      var convs = (typeof global._chatGetConvs === 'function') ? (global._chatGetConvs() || []) : [];
      var conv = convs.find(function(c){ return c && c.id === convId; });
      if (conv && !conv.isGroup){
        var other = (typeof global._chatOtherUid === 'function') ? global._chatOtherUid(conv) : null;
        var st = D.querySelector('#chat-conv-header .chat-conv-hd-status');
        if (st) st.textContent = lastSeenLabel(other);
        var av = D.querySelector('#chat-conv-header .chat-conv-hd-avatar');
        if (av){
          var dot = av.querySelector('.chat-online-dot');
          if (isOnline(other)){
            if (!dot){ dot = D.createElement('span'); dot.className = 'chat-online-dot'; av.appendChild(dot); }
          } else if (dot) dot.remove();
        }
      }
      var items = D.querySelectorAll('#chat-conv-list .chat-conv-item');
      items.forEach(function(el){
        var cid = el.getAttribute('data-conv-id');
        var c = convs.find(function(x){ return x && x.id === cid; });
        if (!c || c.isGroup) return;
        var other = (typeof global._chatOtherUid === 'function') ? global._chatOtherUid(c) : null;
        var av = el.querySelector('.chat-conv-avatar');
        if (!av) return;
        var dot = av.querySelector('.chat-online-dot');
        if (isOnline(other)){
          if (!dot){ dot = D.createElement('span'); dot.className = 'chat-online-dot'; av.appendChild(dot); }
        } else if (dot) dot.remove();
      });
    } catch(_e){}
  }

  function installPresence(){
    if (!meUid() || !getWorkerToken()) return;
    ensureRawRequest();
    beatPresence();
    refreshOnlineCache();
    if (presTimer) clearInterval(presTimer);
    presTimer = setInterval(function(){ beatPresence(); refreshOnlineCache(); }, PRES_HB_MS);
    if (presHooksInstalled) return;
    presHooksInstalled = true;
    global.addEventListener('pagehide', function(){ markLastSeen('pagehide'); }, true);
    global.addEventListener('beforeunload', function(){ markLastSeen('beforeunload'); }, true);
    D.addEventListener('visibilitychange', function(){
      if (D.visibilityState === 'hidden') markLastSeen('hidden');
      else if (meUid()) { beatPresence(); refreshOnlineCache(); }
    }, true);
  }
  function bootPresenceSoon(){ setTimeout(installPresence, 30); }
  global.addEventListener('lf:app-started', bootPresenceSoon, true);
  global.addEventListener('focus', function(){ if (meUid()) { installPresence(); } }, true);
  if (typeof global.startApp === 'function' && !global.startApp.__lfPresenceFinalWrapped){
    var _origStartApp = global.startApp;
    global.startApp = function(){ var r = _origStartApp.apply(this, arguments); bootPresenceSoon(); return r; };
    global.startApp.__lfPresenceFinalWrapped = true;
  }
  if (typeof global._execLogout === 'function' && !global._execLogout.__lfPresenceFinalWrapped){
    var _origLogout = global._execLogout;
    global._execLogout = function(){ try{ markLastSeen('logout'); }catch(_e){} return _origLogout.apply(this, arguments); };
    global._execLogout.__lfPresenceFinalWrapped = true;
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function(){ if (meUid()) installPresence(); }, { once:true });
  else if (meUid()) installPresence();

  function getConvs(){ return (typeof global._chatGetConvs === 'function') ? (global._chatGetConvs() || []) : []; }
  function getConv(id){ return getConvs().find(function(c){ return c && c.id === id; }); }
  function saveConv(conv){
    var list = getConvs();
    var idx = list.findIndex(function(c){ return c && c.id === conv.id; });
    if (idx >= 0) list[idx] = Object.assign({}, list[idx], conv); else list.push(conv);
    if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(list);
    else if (typeof global.ss === 'function') global.ss('lf13_chat_convs', list);
  }
  function canAdmin(conv){ return arr(conv && conv.admins).some(function(uid){ return sameUid(uid, meUid()); }); }
  function isOwner(conv){
    return sameUid(conv && conv.createdBy, meUid()) || (canAdmin(conv) && arr(conv && conv.admins).length <= 1);
  }
  function resolveUser(uid){
    try {
      if (typeof global._chatResolveUser === 'function') return global._chatResolveUser(uid);
      if (typeof global.getUser === 'function') return global.getUser(uid);
    } catch(_e){}
    return null;
  }
  function modal(){ return D.getElementById('mo-chat-manage'); }
  function ensureModal(){
    var mo = modal();
    if (mo) return mo;
    mo = D.createElement('div');
    mo.id = 'mo-chat-manage';
    mo.className = 'mo';
    mo.innerHTML = '<div class="mc"><div class="mb" style="max-width:520px"></div></div>';
    mo.addEventListener('click', function(ev){ if (ev.target === mo) mo.classList.remove('on'); });
    D.body.appendChild(mo);
    return mo;
  }
  function paintGroupAvatarFor(convId){
    try {
      var c = getConv(convId); if (!c || !c.isGroup || !c.avatar) return;
      D.querySelectorAll('#chat-conv-list .chat-conv-item').forEach(function(el){
        if (el.getAttribute('data-conv-id') !== convId) return;
        var av = el.querySelector('.chat-conv-avatar');
        if (av) av.innerHTML = '<img src="'+String(c.avatar).replace(/"/g,'&quot;')+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
      });
      if (global._chatCurrentConv === convId){
        var hav = D.querySelector('#chat-conv-header .chat-conv-hd-avatar');
        if (hav) hav.innerHTML = '<img src="'+String(c.avatar).replace(/"/g,'&quot;')+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
      }
    } catch(_e){}
  }
  function deleteConvForMe(convId){
    var list = getConvs().filter(function(c){ return !(c && c.id === convId); });
    if (typeof global._chatSaveConvs === 'function') global._chatSaveConvs(list);
    else if (typeof global.ss === 'function') global.ss('lf13_chat_convs', list);
    try {
      var key = (typeof global.CHAT_MSG_PREFIX !== 'undefined' ? global.CHAT_MSG_PREFIX : 'lf13_chat_msgs_') + convId;
      LS.removeItem(key);
    } catch(_e){}
    if (global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') global.closeChatConv();
    if (typeof global.renderChatList === 'function') global.renderChatList();
    if (typeof global._chatUpdateUnreadBadge === 'function') global._chatUpdateUnreadBadge();
    if (typeof global.toast === 'function') global.toast('🗑 Grupo apagado só para você');
  }
  function syncGroupExtras(conv){
    var client = wc();
    if (!conv || !conv.id || !client || typeof client.getConfig !== 'function' || typeof client.putConfig !== 'function') return;
    var extra = {};
    if (conv.avatar) extra.avatar = conv.avatar;
    if (conv.description) extra.description = conv.description;
    if (!Object.keys(extra).length) return;
    client.getConfig('chat_conv_' + conv.id).catch(function(){ return {}; }).then(function(doc){
      return client.putConfig('chat_conv_' + conv.id, Object.assign({}, doc || {}, extra));
    }).catch(function(){});
  }
  function hydrateGroupExtras(convId){
    var client = wc();
    if (!client || typeof client.getConfig !== 'function') return;
    if (remoteMetaCache[convId] && (Date.now() - remoteMetaCache[convId]) < 15000) return;
    remoteMetaCache[convId] = Date.now();
    client.getConfig('chat_conv_' + convId).then(function(doc){
      if (!doc || (!doc.avatar && !doc.description)) return;
      var c = getConv(convId); if (!c) return;
      var changed = false;
      if (doc.avatar && c.avatar !== doc.avatar){ c.avatar = doc.avatar; changed = true; }
      if (typeof doc.description === 'string' && c.description !== doc.description){ c.description = doc.description; changed = true; }
      if (changed){ saveConv(c); paintGroupAvatarFor(convId); }
    }).catch(function(){});
  }
  function renderManageModal(){
    var convId = global._chatCurrentConv;
    if (!convId){ if (typeof global.toast === 'function') global.toast('Abra um grupo primeiro'); return; }
    var conv = getConv(convId);
    if (!conv || !conv.isGroup){ if (typeof global.toast === 'function') global.toast('Conversa não é um grupo'); return; }
    hydrateGroupExtras(convId);
    var mo = ensureModal();
    var mb = mo.querySelector('.mb');
    var me = meUid();
    var canManage = canAdmin(conv);
    var canDissolve = canManage; // pedido: ADM também pode encerrar corretamente
    var members = arr(conv.participants).map(function(uid){
      var u = resolveUser(uid);
      return { uid:uid, nome:(u && (u.nome || u.email)) || uid, cargo:(u && u.cargo) || '—', isAdmin: canAdmin({admins:[uid]}), isMe: sameUid(uid, me) };
    });
    mb.innerHTML = ''
      + '<h2>👥 ' + esc(conv.name || 'Grupo') + '</h2>'
      + (conv.description ? '<div style="font-size:.82rem;color:var(--mu);margin-bottom:10px;padding:8px;background:var(--bg3);border-radius:8px">'+esc(conv.description)+'</div>' : '<div style="font-size:.75rem;color:var(--mu);margin-bottom:10px">Sem descrição.</div>')
      + (canManage ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'
          + '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.setDescription()" style="font-size:.78rem">📝 Definir descrição</button>'
          + '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.setPhoto()" style="font-size:.78rem">🖼 Trocar foto</button>'
          + '</div>' : '')
      + '<div style="font-size:.78rem;color:var(--mu);margin-bottom:6px"><b>' + members.length + '</b> participante(s)' + (canManage ? '' : ' — <i>somente leitura</i>') + '</div>'
      + '<div class="chat-grp-manage-list">'
      + members.map(function(m, idx){
          var adminTag = arr(conv.admins).some(function(a){ return sameUid(a, m.uid); }) ? ' <span style="color:var(--amber,#c39a2d);font-size:.7rem">⭐ ADM</span>' : '';
          var meTag = m.isMe ? ' <span style="color:var(--mu);font-size:.7rem">(você)</span>' : '';
          var actions = '';
          if (canManage && !m.isMe){
            if (arr(conv.admins).some(function(a){ return sameUid(a, m.uid); })) actions += '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.transferAdmin('+idx+')" style="font-size:.7rem;padding:3px 7px">↓ Rebaixar</button>';
            else actions += '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.promoteAdmin('+idx+')" style="font-size:.7rem;padding:3px 7px">↑ Promover</button>';
            actions += '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.removeMember('+idx+')" style="font-size:.7rem;padding:3px 7px;color:var(--rl,#ef4444);border-color:var(--rl,#ef4444)">✕ Remover</button>';
          }
          return '<div class="chat-new-item" data-uid="'+esc(m.uid)+'">'
              + '<div class="chat-new-info" style="flex:1"><div class="chat-new-name">'+esc(m.nome)+adminTag+meTag+'</div><div class="chat-new-role">'+esc(m.cargo)+'</div></div>'
              + '<div style="display:flex;gap:4px;flex-wrap:wrap">'+actions+'</div>'
            + '</div>';
        }).join('')
      + '</div>'
      + '<div class="mbtns" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">'
      + '<button class="bc" onclick="document.getElementById(\'mo-chat-manage\').classList.remove(\'on\')">Fechar</button>'
      + '<button class="bd" onclick="window.LF_CHAT_GROUP_MANAGE.leave()">🚪 Sair do grupo</button>'
      + '<button class="bc" onclick="window.LF_CHAT_GROUP_MANAGE.deleteForMe()">🗑 Apagar só para mim</button>'
      + (canDissolve ? '<button class="bd" style="background:#7f1d1d;border-color:#7f1d1d" onclick="window.LF_CHAT_GROUP_MANAGE.dissolve()">🧨 Fechar grupo para todos</button>' : '')
      + '</div>';
    mo._members = members;
    mo._convId = convId;
    mo.classList.add('on');
    paintGroupAvatarFor(convId);
  }

  function hookGroupMenuButton(){
    D.addEventListener('click', function(ev){
      try {
        var btn = ev.target && ev.target.closest && ev.target.closest('#chat-conv-header button.chat-conv-hd-menu');
        if (!btn) return;
        var oc = btn.getAttribute('onclick') || '';
        if (oc.indexOf('chatConvMenu') < 0) return;
        var conv = getConv(global._chatCurrentConv);
        if (!conv || !conv.isGroup) return;
        ev.preventDefault(); ev.stopPropagation();
        renderManageModal();
      } catch(_e){}
    }, true);
  }

  function installGroupFixes(){
    var prev = global.LF_CHAT_GROUP_MANAGE || {};
    global.LF_CHAT_GROUP_MANAGE = {
      open: renderManageModal,
      removeMember: function(idx){
        var mo = modal(), m = mo && mo._members && mo._members[idx];
        if (!m) return;
        if (!canAdmin(getConv(mo._convId))) { if (typeof global.toast === 'function') global.toast('Apenas ADM pode remover participantes'); return; }
        if (sameUid(m.uid, meUid())) { if (typeof global.toast === 'function') global.toast('Use “Sair do grupo” para você mesmo'); return; }
        if (typeof prev.removeMember === 'function') return prev.removeMember(idx);
      },
      promoteAdmin: function(idx){ if (!canAdmin(getConv(modal() && modal()._convId))) { if (typeof global.toast === 'function') global.toast('Apenas ADM pode promover'); return; } if (typeof prev.promoteAdmin === 'function') return prev.promoteAdmin(idx); },
      transferAdmin: function(idx){ if (!canAdmin(getConv(modal() && modal()._convId))) { if (typeof global.toast === 'function') global.toast('Apenas ADM pode alterar administração'); return; } if (typeof prev.transferAdmin === 'function') return prev.transferAdmin(idx); },
      setDescription: function(){ if (!canAdmin(getConv(modal() && modal()._convId))) { if (typeof global.toast === 'function') global.toast('Apenas ADM pode editar descrição'); return; } if (typeof prev.setDescription === 'function') { var r = prev.setDescription(); setTimeout(function(){ var c=getConv(global._chatCurrentConv); if(c) syncGroupExtras(c); }, 80); return r; } },
      setPhoto: function(){ if (!canAdmin(getConv(modal() && modal()._convId))) { if (typeof global.toast === 'function') global.toast('Apenas ADM pode trocar a foto'); return; } if (typeof prev.setPhoto === 'function') { var r = prev.setPhoto(); setTimeout(function(){ var c=getConv(global._chatCurrentConv); if(c){ syncGroupExtras(c); paintGroupAvatarFor(c.id); } }, 200); return r; } },
      leave: function(){ if (typeof prev.leave === 'function') return prev.leave(); },
      deleteForMe: function(){ var mo = modal(); if (mo && mo._convId) deleteConvForMe(mo._convId); if (mo) mo.classList.remove('on'); },
      dissolve: function(){
        var mo = modal(); if (!mo || !mo._convId) return;
        var conv = getConv(mo._convId); if (!conv) return;
        if (!canAdmin(conv)) { if (typeof global.toast === 'function') global.toast('Apenas ADM pode fechar o grupo'); return; }
        var name = conv.name || 'este grupo';
        var typed = global.prompt('Ação irreversível.\n\nPara fechar o grupo para todos, digite exatamente o nome:\n' + name);
        if (typed == null) return;
        if (String(typed).trim() !== String(name).trim()) { if (typeof global.toast === 'function') global.toast('Nome não confere. Grupo não foi fechado.'); return; }
        conv.dissolved = true;
        conv.dissolvedAt = new Date().toISOString();
        conv.dissolvedBy = meUid();
        conv.updatedAt = conv.dissolvedAt;
        conv.participants = [];
        conv.admins = [];
        saveConv(conv);
        if (typeof global._chatSyncConvUpsert === 'function') safe(function(){ global._chatSyncConvUpsert(conv); });
        if (typeof global.closeChatConv === 'function') global.closeChatConv();
        if (typeof global.renderChatList === 'function') global.renderChatList();
        mo.classList.remove('on');
        if (typeof global.toast === 'function') global.toast('🧨 Grupo fechado para todos');
      }
    };

    hookGroupMenuButton();

    if (typeof global._chatSyncConvUpsert === 'function' && !global._chatSyncConvUpsert.__lfFinalExtraWrap){
      var _origUpsert = global._chatSyncConvUpsert;
      global._chatSyncConvUpsert = function(conv){
        if (conv && conv.isGroup && canAdmin(conv) && arr(conv.participants).every(function(uid){ return !sameUid(uid, meUid()); })) {
          conv.participants = [meUid()].concat(arr(conv.participants));
        }
        var p = _origUpsert.apply(this, arguments);
        Promise.resolve(p).then(function(){ if (conv && conv.isGroup) syncGroupExtras(conv); }).catch(function(){});
        return p;
      };
      global._chatSyncConvUpsert.__lfFinalExtraWrap = true;
    }

    if (typeof global.openChatConv === 'function' && !global.openChatConv.__lfFinalGroupOpenWrap){
      var _origOpen = global.openChatConv;
      global.openChatConv = function(convId){
        var r = _origOpen.apply(this, arguments);
        setTimeout(function(){
          var conv = getConv(convId);
          if (conv && conv.isGroup){ hydrateGroupExtras(convId); paintGroupAvatarFor(convId); }
          refreshPresenceUI();
        }, 80);
        return r;
      };
      global.openChatConv.__lfFinalGroupOpenWrap = true;
    }

    if (typeof global.renderChatList === 'function' && !global.renderChatList.__lfFinalGroupRenderWrap){
      var _origRender = global.renderChatList;
      global.renderChatList = function(){
        var r = _origRender.apply(this, arguments);
        setTimeout(function(){
          getConvs().forEach(function(c){ if (c && c.isGroup && c.avatar) paintGroupAvatarFor(c.id); });
          refreshPresenceUI();
        }, 30);
        return r;
      };
      global.renderChatList.__lfFinalGroupRenderWrap = true;
    }
  }

  installGroupFixes();
})(window);
