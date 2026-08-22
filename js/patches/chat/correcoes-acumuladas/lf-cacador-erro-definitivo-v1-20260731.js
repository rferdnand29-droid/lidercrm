(function(global){
  'use strict';
  if(global.__LF_CACADOR_ERRO_DEFINITIVO_V1__) return;
  global.__LF_CACADOR_ERRO_DEFINITIVO_V1__ = true;

  var D = global.document;
  var LS = global.localStorage;
  var TAG = '[lf-cacador-definitivo]';

  function log(){ try{ console.log.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function warn(){ try{ console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function arr(x){ return Array.isArray(x) ? x : []; }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function meUid(){ return (global.S && global.S.userId) || ''; }
  function toast(m,t){ if(typeof global.toast==='function') global.toast(m,t); }
  function isoNow(){ return new Date().toISOString(); }

  function getConvs(){
    return safe(function(){
      if(typeof global._chatGetConvs === 'function') return global._chatGetConvs() || [];
      if(typeof global.sg === 'function') return global.sg('lf13_chat_convs') || [];
      var raw = LS.getItem('lf13_chat_convs');
      return raw ? (JSON.parse(raw) || []) : [];
    }, []);
  }
  function getConv(id){
    id = String(id || '');
    return getConvs().find(function(c){ return c && String(c.id) === id; }) || null;
  }
  function saveConv(conv){
    if(!conv || !conv.id) return false;
    var convs = getConvs().slice();
    var idx = convs.findIndex(function(c){ return c && c.id === conv.id; });
    if(idx >= 0) convs[idx] = Object.assign({}, convs[idx], conv);
    else convs.push(conv);
    try{
      if(typeof global._chatSaveConvs === 'function') global._chatSaveConvs(convs);
      else if(typeof global.ss === 'function') global.ss('lf13_chat_convs', convs);
      else LS.setItem('lf13_chat_convs', JSON.stringify(convs));
      return true;
    }catch(_e){ return false; }
  }
  function syncConv(conv){
    try{ if(typeof global._chatSyncConvUpsert === 'function') global._chatSyncConvUpsert(conv); }catch(_e){}
    try{ if(typeof global.renderChatList === 'function') global.renderChatList(); }catch(_e){}
    try{ if(global._chatCurrentConv === conv.id && typeof global.openChatConv === 'function') global.openChatConv(conv.id); }catch(_e){}
  }
  function groupRole(conv){
    if(!conv) return 'viewer';
    var me = meUid();
    var admins = arr(conv.admins);
    var isAdmin = admins.indexOf(me) >= 0;
    var isOwner = (conv.createdBy && conv.createdBy === me) || (isAdmin && admins.length === 1) || (isAdmin && !conv.createdBy);
    return isOwner ? 'owner' : (isAdmin ? 'admin' : 'viewer');
  }

  function rawUsers(){
    var list = [];
    try{ if(typeof global.sg === 'function') list = global.sg('lf6_u') || []; }catch(_e){}
    if((!Array.isArray(list) || !list.length)){
      try{ var raw = LS.getItem('lf6_u'); if(raw) list = JSON.parse(raw) || []; }catch(_e){}
    }
    var seen = Object.create(null), out = [];
    arr(list).forEach(function(u){
      if(!u) return;
      var id = u.id || u.uid || u.userId || u._id || u.email;
      if(!id || seen[id]) return;
      seen[id] = 1;
      u.id = id;
      out.push(u);
    });
    return out;
  }
  function isArchivedUser(u){
    if(!u) return false;
    var email = String(u.email || '').toLowerCase();
    return u.ativo === false || /^retired\+/.test(email) || /_retired_/i.test(String(u.legacy_id || ''));
  }
  function findRawUser(id){
    id = String(id || '');
    return rawUsers().find(function(u){ return u && String(u.id) === id; }) || null;
  }
  function mergedAdminUsers(){
    var normal = safe(function(){ return (typeof global.getUsers === 'function') ? (global.getUsers() || []) : []; }, []);
    var byId = Object.create(null), out = [];
    arr(normal).forEach(function(u){ if(u && u.id && !byId[u.id]){ byId[u.id] = 1; out.push(u); } });
    rawUsers().forEach(function(u){ if(u && u.id && isArchivedUser(u) && !byId[u.id]){ byId[u.id] = 1; out.push(u); } });
    return out;
  }
  function getUserWithArchived(uid){
    var u = safe(function(){ return (typeof global.getUser === 'function') ? global.getUser(uid) : null; }, null);
    if(u) return u;
    return findRawUser(uid);
  }

  function openGroupManage(convId){
    if(convId && global._chatCurrentConv !== convId && typeof global.openChatConv === 'function'){
      try{ global.openChatConv(convId); }catch(_e){}
    }
    if(global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function'){
      setTimeout(function(){ try{ global.LF_CHAT_GROUP_MANAGE.open(); }catch(_e){} }, 40);
    }
  }

  function leaveGroup(convId){
    var conv = getConv(convId); if(!conv) return;
    var me = meUid();
    var doIt = function(){
      conv.participants = arr(conv.participants).filter(function(u){ return u !== me; });
      conv.admins = arr(conv.admins).filter(function(u){ return u !== me; });
      conv.updatedAt = isoNow();
      saveConv(conv);
      syncConv(conv);
      try{
        var convs = getConvs().filter(function(c){ return !(c && c.id === convId); });
        if(typeof global._chatSaveConvs === 'function') global._chatSaveConvs(convs);
        else if(typeof global.ss === 'function') global.ss('lf13_chat_convs', convs);
      }catch(_e){}
      try{ LS.removeItem('lf13_chat_msgs_' + convId); }catch(_e){}
      if(global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') global.closeChatConv();
      if(typeof global.renderChatList === 'function') global.renderChatList();
      toast('🚪 Você saiu do grupo');
    };
    if(typeof global._confirmModal === 'function') global._confirmModal({ title:'Sair do grupo?', msg:'Você não receberá mais mensagens deste grupo. O ADM pode te readicionar depois.', okLabel:'Sair', okClass:'bd', onOk:doIt });
    else if(global.confirm('Sair do grupo?')) doIt();
  }
  function dissolveGroup(convId){
    var conv = getConv(convId); if(!conv) return;
    if(groupRole(conv) !== 'owner'){ toast('Apenas o criador/ADM principal pode desfazer'); return; }
    var doIt = function(){
      conv.dissolved = true;
      conv.dissolvedAt = isoNow();
      conv.dissolvedBy = meUid();
      conv.updatedAt = conv.dissolvedAt;
      conv.participants = [];
      conv.admins = [];
      saveConv(conv);
      syncConv(conv);
      if(global._chatCurrentConv === convId && typeof global.closeChatConv === 'function') global.closeChatConv();
      toast('🗑 Grupo desfeito');
    };
    if(typeof global._confirmModal === 'function') global._confirmModal({ title:'Desfazer grupo?', msg:'O grupo será apagado para todos.', okLabel:'Desfazer', okClass:'bd', onOk:doIt });
    else if(global.confirm('Desfazer grupo para TODOS?')) doIt();
  }
  function renameGroup(convId){
    var conv = getConv(convId); if(!conv) return;
    if(groupRole(conv) === 'viewer'){ toast('Apenas ADM pode renomear'); return; }
    var nv = global.prompt ? global.prompt('Nome do grupo:', conv.name || '') : null;
    if(nv == null) return;
    nv = String(nv || '').trim().slice(0,80);
    if(!nv){ toast('Nome inválido'); return; }
    conv.name = nv;
    conv.updatedAt = isoNow();
    saveConv(conv);
    syncConv(conv);
    toast('✏ Nome atualizado');
  }

  function uploadBinaryFile(file, folder){
    folder = folder || 'chat';
    var token = (global.S && (global.S._workerToken || global.S.token)) || '';
    if(!token || !file || typeof file.arrayBuffer !== 'function') return Promise.reject(new Error('worker-upload-unavailable'));
    return file.arrayBuffer().then(function(buffer){
      return fetch('/api/v1/upload/binary', {
        method:'POST',
        headers:{
          'Authorization':'Bearer ' + token,
          'Content-Type': file.type || 'application/octet-stream',
          'X-Filename': file.name || ('file_' + Date.now()),
          'X-Folder': folder
        },
        body: buffer
      });
    }).then(function(res){
      if(!res.ok) return res.text().then(function(t){ throw new Error('upload ' + res.status + ': ' + t); });
      return res.json();
    }).then(function(json){
      var d = json && json.data;
      if(!d || !d.url) throw new Error('worker upload sem URL');
      return d;
    });
  }

  function installGroupFixes(){
    // dots / info / nome/avatar/status -> gestão; back/close passam livre.
    D.addEventListener('click', function(ev){
      try{
        var hdr = ev.target && ev.target.closest && ev.target.closest('#chat-conv-header');
        if(!hdr) return;
        var conv = global._chatCurrentConv && getConv(global._chatCurrentConv);
        if(!conv || !conv.isGroup) return;
        var t = ev.target;
        var btn = t.closest && t.closest('button');
        if(btn){
          var oc = btn.getAttribute('onclick') || '';
          if(btn.classList.contains('chat-back-btn') || /closeChatConv\(/.test(oc)) return;
          if(/chatShowConvInfo\(|chatConvMenu\(/.test(oc)){
            ev.preventDefault(); ev.stopPropagation();
            openGroupManage(conv.id);
          }
          return;
        }
        if(t.closest('.chat-conv-hd-info, .chat-conv-hd-name, .chat-conv-hd-status, .chat-conv-hd-avatar')){
          ev.preventDefault(); ev.stopPropagation();
          openGroupManage(conv.id);
        }
      }catch(_e){}
    }, true);

    // Header menu router for groups
    (function(){
      var orig = global.chatConvMenu;
      if(typeof orig !== 'function' || orig.__lfDefGrp) return;
      var w = function(convId){
        var conv = getConv(convId || global._chatCurrentConv);
        if(conv && conv.isGroup){ openGroupManage(conv.id); return; }
        return orig.apply(this, arguments);
      };
      w.__lfDefGrp = true;
      global.chatConvMenu = w;
    })();

    // card context menu for groups
    (function(){
      var orig = global._chatOpenConvCtxMenu;
      if(typeof orig !== 'function' || orig.__lfDefGrp) return;
      var w = function(x, y, convEl){
        var convId = convEl && convEl.getAttribute && convEl.getAttribute('data-conv-id');
        var conv = convId && getConv(convId);
        if(!conv || !conv.isGroup) return orig.apply(this, arguments);
        if(typeof global._chatCloseCtxMenu === 'function') global._chatCloseCtxMenu();
        var role = groupRole(conv);
        var canManage = role === 'admin' || role === 'owner';
        var canDissolve = role === 'owner';
        var backdrop = D.createElement('div');
        backdrop.id = 'chat-ctx-backdrop';
        D.body.appendChild(backdrop);
        backdrop.addEventListener('click', function(){ if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); }, true);
        backdrop.addEventListener('touchstart', function(ev){ ev.preventDefault(); if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); }, {passive:false});
        var menu = D.createElement('div');
        menu.id = 'chat-ctx-menu';
        menu.className = 'chat-ctx-menu';
        menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg2,#1a1e26);color:var(--tx,#eee);border:1px solid var(--b1,rgba(255,255,255,.18));border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.65);padding:6px;min-width:260px;max-width:92vw;max-height:80vh;overflow-y:auto;font-family:Outfit,sans-serif;font-size:.85rem';
        function btn(act, label, danger){
          var b = D.createElement('button');
          b.className = 'chat-ctx-btn';
          b.setAttribute('data-act', act);
          b.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:'+(danger?'var(--rl,#ef4444)':'inherit')+';padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem';
          b.textContent = label;
          return b;
        }
        function sep(){ var d = D.createElement('div'); d.style.cssText='height:1px;background:var(--b1,rgba(255,255,255,.1));margin:4px 0'; return d; }
        var nodes = [
          btn('manage','👥 Participantes / gestão'),
          btn('pin', conv.pinned ? '📌 Desafixar' : '📌 Fixar no topo'),
          btn('mute', conv.muted ? '🔔 Reativar notificações' : '🔕 Silenciar'),
          btn('archive', (global._isConvArchived && global._isConvArchived(conv)) ? '📥 Desarquivar' : '📦 Arquivar')
        ];
        if(canManage){ nodes.push(btn('add-member','➕ Adicionar participante')); nodes.push(btn('set-photo','🖼 Trocar foto do grupo')); nodes.push(btn('set-name','✏ Renomear grupo')); nodes.push(btn('set-desc','📝 Editar descrição')); }
        nodes.push(sep());
        nodes.push(btn('leave','🚪 Sair do grupo', true));
        if(canDissolve) nodes.push(btn('dissolve','🗑 Desfazer grupo (todos)', true));
        nodes.forEach(function(n){ menu.appendChild(n); });
        menu.addEventListener('click', function(ev){
          var act = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-act');
          if(!act) return;
          if(act === 'manage'){ if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); openGroupManage(convId); return; }
          if(act === 'pin' && typeof global.chatTogglePin==='function'){ global.chatTogglePin(convId); }
          else if(act === 'mute' && typeof global.chatToggleMute==='function'){ global.chatToggleMute(convId); }
          else if(act === 'archive' && typeof global.chatToggleArchive==='function'){ global.chatToggleArchive(convId); }
          else if(act === 'add-member' && typeof global.chatOpenAddMemberModal==='function'){ if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); global.chatOpenAddMemberModal(convId); return; }
          else if(act === 'set-photo'){ if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); openGroupManage(convId); setTimeout(function(){ try{ global.LF_CHAT_GROUP_MANAGE.setPhoto(); }catch(_e){} }, 120); return; }
          else if(act === 'set-name'){ if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); renameGroup(convId); return; }
          else if(act === 'set-desc'){ if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); openGroupManage(convId); setTimeout(function(){ try{ global.LF_CHAT_GROUP_MANAGE.setDescription(); }catch(_e){} }, 120); return; }
          else if(act === 'leave'){ if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); leaveGroup(convId); return; }
          else if(act === 'dissolve'){ if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu(); dissolveGroup(convId); return; }
          if(typeof global._chatCloseCtxMenu==='function') global._chatCloseCtxMenu();
        });
        D.body.appendChild(menu);
        var vw = global.innerWidth || D.documentElement.clientWidth, vh = global.innerHeight || D.documentElement.clientHeight;
        var mw = menu.offsetWidth || 260, mh = menu.offsetHeight || 260, pad = 8, left = x, top = y;
        if(left + mw + pad > vw) left = vw - mw - pad;
        if(left < pad) left = pad;
        if(top + mh + pad > vh) top = Math.max(pad, y - mh - 12);
        menu.style.left = left + 'px';
        menu.style.top = top + 'px';
      };
      w.__lfDefGrp = true;
      global._chatOpenConvCtxMenu = w;
    })();

    // generic delete in groups => leave/dissolve
    (function(){
      var orig = global.chatDeleteConv;
      if(typeof orig !== 'function' || orig.__lfDefGrp) return;
      var w = function(convId){
        var conv = getConv(convId);
        if(conv && conv.isGroup){
          if(groupRole(conv) === 'owner') dissolveGroup(convId);
          else leaveGroup(convId);
          return;
        }
        return orig.apply(this, arguments);
      };
      w.__lfDefGrp = true;
      global.chatDeleteConv = w;
    })();

    // stronger setPhoto: upload binary and persist URL
    (function tryPatchSetPhoto(){
      var api = global.LF_CHAT_GROUP_MANAGE;
      if(!api || typeof api.setPhoto !== 'function') return setTimeout(tryPatchSetPhoto, 300);
      if(api.setPhoto.__lfDefGrp) return;
      var patched = function(){
        var conv = getConv(global._chatCurrentConv);
        if(!conv || !conv.isGroup) return;
        if(groupRole(conv) === 'viewer'){ toast('Apenas ADM pode trocar a foto'); return; }
        var inp = D.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
        D.body.appendChild(inp);
        inp.onchange = function(){
          var f = inp.files && inp.files[0];
          if(!f){ inp.remove(); return; }
          if(f.size > 4*1024*1024){ toast('⚠️ Imagem muito grande. Máximo 4MB.'); inp.remove(); return; }
          var done = function(url){
            conv.avatar = url;
            conv.updatedAt = isoNow();
            saveConv(conv);
            syncConv(conv);
            toast('🖼 Foto do grupo atualizada');
            setTimeout(function(){ try{ global.LF_CHAT_GROUP_MANAGE.open(); }catch(_e){} }, 60);
            inp.remove();
          };
          uploadBinaryFile(f, 'chat-groups').then(function(res){
            done(res.url);
          }).catch(function(err){
            warn('upload da foto falhou; fallback dataURL', err && err.message);
            var fr = new FileReader();
            fr.onload = function(ev){ done(ev.target.result); };
            fr.readAsDataURL(f);
          });
        };
        inp.click();
      };
      patched.__lfDefGrp = true;
      api.setPhoto = patched;
      if(!api.setName) api.setName = function(){ renameGroup(global._chatCurrentConv); };
    })();
  }

  function installAudioFix(){
    var orig = global.chatRecordAudio;
    var state = { recording:false };
    function setBtn(mode, extra){
      var btn = D.getElementById('chat-audio-btn');
      if(!btn) return;
      if(mode === 'recording'){
        btn.textContent = (extra && extra.elapsedFormatted) ? ('⏹ ' + extra.elapsedFormatted) : '⏹';
        btn.classList.add('recording');
        btn.setAttribute('aria-pressed','true');
      } else {
        btn.textContent = '🎤';
        btn.classList.remove('recording');
        btn.setAttribute('aria-pressed','false');
      }
    }
    if(typeof orig !== 'function' || orig.__lfAudioFix) return;
    var w = function(){
      if(!global._chatCurrentConv){ toast('Abra uma conversa primeiro'); return; }
      if(typeof global.startAudioRecording !== 'function' || typeof global.stopAndUploadAudio !== 'function' || typeof global._chatSendAttachmentRemote !== 'function'){
        return orig.apply(this, arguments);
      }
      if(state.recording){
        state.recording = false;
        setBtn('idle');
        return global.stopAndUploadAudio().then(function(res){
          if(!res || !res.upload || !res.upload.url) return;
          var conv = getConv(global._chatCurrentConv);
          if(!conv) return;
          global._chatSendAttachmentRemote(
            (res.recording && res.recording.filename) || 'audio.webm',
            res.upload.url,
            res.upload.path || '',
            conv,
            {
              kind:'audio',
              mimeType:(res.recording && res.recording.mimeType) || 'audio/webm',
              durationSec: ((res.recording && res.recording.duration) || 0) / 1000
            }
          );
          if(typeof global._chatSyncMobileLayout === 'function') setTimeout(function(){ global._chatSyncMobileLayout(true); }, 40);
        }).catch(function(err){
          toast('❌ Falha no áudio: ' + ((err && err.message) || 'erro'));
          warn('audio stop/upload', err);
        }).finally(function(){
          state.recording = false;
          setBtn('idle');
        });
      }
      return global.startAudioRecording({
        onStateChange: function(mode, extra){ if(mode === 'recording') setBtn('recording', extra || {}); },
        onError: function(msg){ toast('❌ ' + msg, 5000); }
      }).then(function(){
        state.recording = true;
        setBtn('recording', {});
        toast('🎤 Gravando... toque novamente para parar');
        if(typeof global._chatSyncMobileLayout === 'function') global._chatSyncMobileLayout(true);
      }).catch(function(err){
        state.recording = false;
        setBtn('idle');
        warn('audio start', err);
      });
    };
    w.__lfAudioFix = true;
    global.chatRecordAudio = w;
  }

  function installArchivedUserFixes(){
    // getUser fallback for archived/inactive users only.
    (function(){
      var orig = global.getUser;
      if(typeof orig !== 'function' || orig.__lfArchivedFix) return;
      var w = function(uid){
        var got = safe(function(){ return orig.call(this, uid); }, null);
        if(got) return got;
        var raw = findRawUser(uid);
        return isArchivedUser(raw) ? raw : raw;
      };
      w.__lfArchivedFix = true;
      global.getUser = w;
    })();

    // admin user grid must include archived/inactive users still present in raw cache.
    if(typeof global.renderUsers === 'function'){
      global.renderUsers = function(){
        var _hideAdm = false;
        try{
          var _prefs = (typeof global.getPrefs==='function') ? (global.getPrefs() || {}) : {};
          if(_prefs && (_prefs.hideAdmInLists === true || _prefs.adm_hidden_in_lists === true)) _hideAdm = true;
          if(!_hideAdm){ var _ls = LS.getItem('lf_hide_adm_lists'); if(_ls === '1' || _ls === 'true') _hideAdm = true; }
        }catch(_e){}
        var users = mergedAdminUsers().filter(function(u){ return _hideAdm ? u.id !== 'adm' : true; });
        var el = D.getElementById('ugrid'); if(!el) return;
        if(!users.length){ el.innerHTML = '<div class="est">Nenhum usuario.</div>'; return; }
        el.innerHTML = users.map(function(u){
          var badge = (typeof global.hasAdminAccess==='function' && global.hasAdminAccess(u.id)) ? ' <span class="perm-badge full" title="Mesmo acesso do Administrador">&#128737; Acesso Total</span>' : '';
          var uidJs = (typeof global._jsSq==='function') ? global._jsSq(u.id) : String(u.id).replace(/'/g,'\\\'');
          var colorIdx = Math.abs((u.cor || 0)) % ((global.AVB && global.AVB.length) || 6);
          var color = (global.AVB && global.AVB[colorIdx]) || '#64748b';
          var status = u.ativo ? 'Ativo' : 'Inativo';
          var retiredTag = isArchivedUser(u) ? ' <span class="perm-badge" style="margin-left:6px">Arquivado</span>' : '';
          return '<div class="uc"><div class="uct"><div class="ucav" style="background:'+color+'">'+esc(String(u.nome || u.email || u.id || '?').charAt(0).toUpperCase())+'</div><div class="uci"><div class="ucn">'+esc(u.nome || u.email || u.id || '?')+'</div><div class="ucc">'+esc(u.cargo || 'Consultor')+badge+retiredTag+'</div></div><div class="sti '+(u.ativo?'sa':'si')+'"><div class="sd2"></div>'+status+'</div></div><div class="ucb"><div class="ucm"><span>'+esc(u.email || '')+'</span><span>Desde '+esc(u.data || '')+'</span></div><div class="uca"><button class="bsm bse" onclick="openEditUser(\''+uidJs+'\')">&#9999;&#65039; Editar</button><button class="bsm bsl" onclick="showCred(\''+uidJs+'\')">Cred.</button><button class="bsm bst" onclick="toggleUser(\''+uidJs+'\')">'+(u.ativo?'Desativar':'Ativar')+'</button><button class="bsm bsd" onclick="openDelUser(\''+uidJs+'\')">Excluir</button></div></div></div>';
        }).join('');
      };
    }

    // reactivate archived users from admin grid.
    if(typeof global.toggleUser === 'function'){
      global.toggleUser = function(uid){
        if(typeof global.hasAdminAccess==='function' && !global.hasAdminAccess()){ toast('Sem permissão'); return; }
        if(global.S && uid === global.S.userId){ toast('Você não pode desativar a própria conta enquanto está usando o sistema.'); return; }
        var users = mergedAdminUsers();
        var u = users.find(function(x){ return x && x.id === uid; });
        if(!u) return;
        u.ativo = !u.ativo;
        var savedOk = (typeof global.saveUsersLocal === 'function') ? global.saveUsersLocal(users, u.id, { ativo:u.ativo }) : false;
        if(!u.ativo && typeof global._clearUserSessionsRemote==='function') global._clearUserSessionsRemote(uid);
        if(typeof global.renderUsers==='function') global.renderUsers();
        if(savedOk) toast(u.ativo ? 'Ativado' : 'Desativado');
      };
    }

    // global search should also find users (including archived/inactive).
    if(typeof global.runGSearch === 'function'){
      global.runGSearch = function(){
        if(typeof global.getKBFor!=='function' || typeof global.getKB!=='function'){ toast('Carregando... tente novamente em instantes.'); return; }
        var inp = D.getElementById('gsearch-inp');
        var q = (inp ? inp.value || '' : '').trim().toLowerCase();
        var res = D.getElementById('gsearch-results'); if(!res) return;
        if(q.length < 2){ res.innerHTML = '<div style="color:var(--mu);font-size:.78rem;text-align:center;padding:16px">Digite ao menos 2 caracteres</div>'; return; }
        var hits = [];
        ['leads','negocios'].forEach(function(board){
          var users = (typeof global.hasAdminAccess==='function' && global.hasAdminAccess()) ? mergedAdminUsers().filter(function(u){ return u && u.ativo; }) : [{id:global.S.userId,nome:global.S.nome}];
          users.forEach(function(u){
            (global.getKBFor(board,u.id) || []).forEach(function(c){
              if((c.name||'').toLowerCase().indexOf(q)>=0 || String(c.tel||'').indexOf(q)>=0 || (c.obs||'').toLowerCase().indexOf(q)>=0){
                hits.push({type:board,label:board==='leads'?'Lead':'Negócio',icon:board==='leads'?'🎯':'💼',nome:c.name,sub:(typeof global._colLabel==='function'?global._colLabel(board,c.col):c.col)+(c.tel?' · '+c.tel:''),id:c.id,uid:u.id,board:board});
              }
            });
          });
        });
        if(typeof global.hasAdminAccess==='function' && global.hasAdminAccess()){
          mergedAdminUsers().forEach(function(u){
            var hay = [u.nome,u.email,u.id,u.cargo].join(' ').toLowerCase();
            if(hay.indexOf(q) >= 0){
              hits.push({ type:'usuario', label:isArchivedUser(u)?'Usuário arquivado':'Usuário', icon:'👤', nome:u.nome||u.email||u.id, sub:(u.cargo||'Sem cargo') + (u.ativo ? ' · Ativo' : ' · Inativo'), id:u.id, uid:u.id, board:null });
            }
          });
        }
        if(typeof global.hasAdminAccess==='function' && global.hasAdminAccess()){
          mergedAdminUsers().filter(function(u){ return u && u.ativo; }).forEach(function(u){
            (typeof global.getCliLocal==='function' ? (global.getCliLocal(u.id) || []) : []).forEach(function(c){
              if((c.nome||c.name||'').toLowerCase().indexOf(q)>=0 || String(c.tel||'').indexOf(q)>=0){
                hits.push({type:'cliente',label:'Cliente',icon:'👤',nome:c.nome||c.name||'?',sub:'Dashboard',id:c.id,uid:u.id,board:null});
              }
            });
          });
        } else if(typeof global.getCliLocal==='function'){
          (global.getCliLocal(global.S.userId) || []).forEach(function(c){
            if((c.nome||c.name||'').toLowerCase().indexOf(q)>=0 || String(c.tel||'').indexOf(q)>=0){
              hits.push({type:'cliente',label:'Cliente',icon:'👤',nome:c.nome||c.name||'?',sub:'Dashboard',id:c.id,uid:global.S.userId,board:null});
            }
          });
        }
        hits = hits.slice(0, 50);
        if(!hits.length){ res.innerHTML = '<div style="color:var(--mu);font-size:.78rem;text-align:center;padding:16px">Nenhum resultado para &quot;'+esc(q)+'&quot;</div>'; return; }
        res.innerHTML = hits.map(function(h){
          return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;cursor:pointer;margin-bottom:3px;transition:background .15s" onmouseover="this.style.background=\'rgba(195,154,45,.09)\'" onmouseout="this.style.background=\'\'" onclick="gSearchOpen(\''+String(h.type).replace(/'/g,'\\\'')+'\',\''+String(h.id).replace(/'/g,'\\\'')+'\',\''+String(h.uid).replace(/'/g,'\\\'')+'\',\''+String(h.board||'').replace(/'/g,'\\\'')+'\')"><span style="font-size:1.1rem">'+h.icon+'</span><div style="flex:1;min-width:0"><div style="font-size:.82rem;color:var(--tx);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(h.nome)+'</div><div style="font-size:.67rem;color:var(--mu)"><span style="color:var(--al)">'+esc(h.label)+'</span> · '+esc(h.sub)+'</div></div></div>';
        }).join('');
      };
      var origOpen = global.gSearchOpen;
      if(typeof origOpen === 'function' && !origOpen.__lfUserSearchFix){
        var wOpen = function(type,id,uid,board){
          if(type === 'usuario'){
            if(typeof global.goPage === 'function') global.goPage('adm');
            setTimeout(function(){
              try{ if(typeof global.admGoTab==='function'){ var btn = D.querySelector('.adm-tab[onclick*=\'usuarios\']'); global.admGoTab('usuarios', btn); } }catch(_e){}
              try{ if(typeof global.renderUsers==='function') global.renderUsers(); }catch(_e){}
              try{ if(typeof global.openEditUser==='function') global.openEditUser(id); }catch(_e){}
            }, 180);
            try{ if(typeof global.closeM==='function') global.closeM('mo-gsearch'); }catch(_e){}
            return;
          }
          return origOpen.apply(this, arguments);
        };
        wOpen.__lfUserSearchFix = true;
        global.gSearchOpen = wOpen;
      }
    }
  }

  function boot(){
    installGroupFixes();
    installAudioFix();
    installArchivedUserFixes();
    log('ativo — grupo/admin, áudio e busca de usuários arquivados corrigidos');
  }

  if(D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})(window);
