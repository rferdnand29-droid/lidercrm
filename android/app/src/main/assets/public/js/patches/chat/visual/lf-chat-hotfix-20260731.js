(function(global){
  'use strict';
  if (global.__LF_CHAT_HOTFIX_20260731__) return;
  global.__LF_CHAT_HOTFIX_20260731__ = true;

  var D = global.document;
  function arr(x){ return Array.isArray(x) ? x : []; }
  function safe(fn, fb){ try { return fn(); } catch(_e){ return fb; } }
  function meUid(){ return (global.S && global.S.userId) || ''; }

  /* 1) DEDUPE do botão "Limpar não lidas" + move para a barra nova */
  function dedupeSweep(){
    try{
      var all = Array.prototype.slice.call(D.querySelectorAll('#chat-sweep-btn'));
      if (!all.length) return;
      var keep = all[0];
      var bar = D.getElementById('chat-actions-bar');
      if (bar && keep.parentNode !== bar) bar.appendChild(keep);
      all.slice(1).forEach(function(el){ if (el && el.parentNode) el.parentNode.removeChild(el); });
    }catch(_e){}
  }

  /* 2) 3 pontinhos nativos do header de grupo abrem SEMPRE o gerenciador certo */
  function hookHeaderMenu(){
    D.addEventListener('click', function(ev){
      try{
        var btn = ev.target && ev.target.closest && ev.target.closest('#chat-conv-header button.chat-conv-hd-menu');
        if (!btn) return;
        var oc = btn.getAttribute('onclick') || '';
        if (oc.indexOf('chatConvMenu') < 0) return;
        var conv = null;
        if (typeof global._chatGetConvs === 'function' && global._chatCurrentConv){
          conv = (global._chatGetConvs() || []).find(function(c){ return c && c.id === global._chatCurrentConv; });
        }
        if (!conv || !conv.isGroup) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function') {
          global.LF_CHAT_GROUP_MANAGE.open();
        }
      }catch(_e){}
    }, true);
  }

  /* 3) Mata o 2º botão ⋯ injetado pelo patch antigo */
  function killDuplicateDots(){
    try{
      D.querySelectorAll('#chat-conv-manage-btn').forEach(function(el){
        el.style.display = 'none';
        el.setAttribute('aria-hidden','true');
      });
    }catch(_e){}
  }

  /* 4) Blindagem para remover membro não apagar o grupo do próprio ADM */
  function guardSelfRemovalAndInbox(){
    (function wrapApi(){
      var api = global.LF_CHAT_GROUP_MANAGE;
      if (!api || typeof api.removeMember !== 'function' || api.__lfHotfixSelfGuard) {
        setTimeout(wrapApi, 250); return;
      }
      var orig = api.removeMember;
      api.removeMember = function(idx){
        try{
          var mo = D.getElementById('mo-chat-manage');
          var m = mo && mo._members && mo._members[idx];
          if (m && m.uid === meUid()) {
            if (typeof global.toast === 'function') global.toast('Use “Sair do grupo” para você mesmo.');
            return;
          }
        }catch(_e){}
        return orig.apply(this, arguments);
      };
      api.__lfHotfixSelfGuard = true;
    })();

    (function wrapRmInbox(){
      var orig = global._chatRemoveInboxEntryForUsers;
      if (typeof orig !== 'function' || orig.__lfHotfixRmInbox) {
        setTimeout(wrapRmInbox, 250); return;
      }
      var w = function(convId, userIds){
        var me = meUid();
        userIds = arr(userIds).filter(function(uid){ return uid && uid !== me; });
        return orig.call(this, convId, userIds);
      };
      w.__lfHotfixRmInbox = true;
      global._chatRemoveInboxEntryForUsers = w;
    })();

    (function wrapUpsert(){
      var orig = global._chatSyncConvUpsert;
      if (typeof orig !== 'function' || orig.__lfHotfixUpsert) {
        setTimeout(wrapUpsert, 250); return;
      }
      var w = function(conv){
        try{
          if (conv && conv.isGroup) {
            var me = meUid();
            conv.participants = arr(conv.participants);
            if (me && conv.participants.indexOf(me) < 0 && arr(conv.admins).indexOf(me) >= 0) {
              conv.participants.unshift(me);
            }
          }
        }catch(_e){}
        return orig.apply(this, arguments);
      };
      w.__lfHotfixUpsert = true;
      global._chatSyncConvUpsert = w;
    })();
  }

  /* 5) Contadores corretos: unread = só DM; groups = só grupos reais */
  function strictTabsAndBadges(){
    function isRealGroup(c){ return !!(c && c.isGroup === true && c.name && arr(c.participants).length >= 2); }
    function dmUnread(c, me){
      if (!c || c.archived || c.isGroup) return 0;
      var msgs = safe(function(){ return global._chatGetMsgs(c.id) || []; }, []);
      return msgs.filter(function(m){ return m && !m.read && m.toUid === me; }).length;
    }
    function grpUnread(c, me){
      if (!c || c.archived || !isRealGroup(c)) return 0;
      var msgs = safe(function(){ return global._chatGetMsgs(c.id) || []; }, []);
      return msgs.filter(function(m){ return m && !m.read && m.fromUid !== me; }).length;
    }
    (function wrap(){
      var orig = global.renderChatList;
      if (typeof orig !== 'function' || orig.__lfHotfixBadges) { setTimeout(wrap, 250); return; }
      var w = function(){
        var r = orig.apply(this, arguments);
        try{
          var convs = (typeof global._chatGetConvs === 'function') ? (global._chatGetConvs() || []) : [];
          var byId = {};
          convs.forEach(function(c){ if (c && c.id) byId[c.id] = c; });
          var me = meUid();
          var curTab = safe(function(){ return (typeof global.sg === 'function') ? global.sg('lf_chat_active_tab') : (global.localStorage.getItem('lf_chat_active_tab') || 'all'); }, 'all');
          D.querySelectorAll('#chat-conv-list .chat-conv-item').forEach(function(el){
            var c = byId[el.getAttribute('data-conv-id')];
            if (!c) return;
            var hide = false;
            if (curTab === 'groups' && !isRealGroup(c)) hide = true;
            if (curTab === 'unread' && dmUnread(c, me) <= 0) hide = true;
            el.style.display = hide ? 'none' : '';
          });
          var nUnread = 0, nGroups = 0, nAll = 0;
          convs.forEach(function(c){
            nUnread += dmUnread(c, me);
            nGroups += grpUnread(c, me);
            nAll += dmUnread(c, me) + grpUnread(c, me);
          });
          var bar = D.getElementById('chat-tabs-bar');
          if (bar){
            function setN(tab, n){
              var t = bar.querySelector('.chat-tab[data-tab="'+tab+'"]');
              if (!t) return;
              var badge = t.querySelector('.chat-tab-n');
              if (n > 0){
                if (!badge){ badge = D.createElement('span'); badge.className = 'chat-tab-n'; t.appendChild(badge); }
                badge.textContent = String(n > 99 ? '99+' : n);
                badge.setAttribute('data-n', String(n));
                badge.style.display = '';
              } else if (badge){
                badge.setAttribute('data-n','0');
                badge.style.display = 'none';
              }
            }
            setN('unread', nUnread);
            setN('groups', nGroups);
            setN('all', nAll);
            setN('team', nAll);
          }
        }catch(_e){}
        dedupeSweep();
        killDuplicateDots();
        return r;
      };
      w.__lfHotfixBadges = true;
      global.renderChatList = w;
    })();
  }

  /* 6) Foto do grupo: repaint defensivo após render/open */
  function repaintGroupAvatar(){
    function paint(){
      try{
        var convs = (typeof global._chatGetConvs === 'function') ? (global._chatGetConvs() || []) : [];
        var byId = {};
        convs.forEach(function(c){ if (c && c.id) byId[c.id] = c; });
        D.querySelectorAll('#chat-conv-list .chat-conv-item').forEach(function(el){
          var c = byId[el.getAttribute('data-conv-id')];
          if (!c || !c.isGroup || !c.avatar) return;
          var av = el.querySelector('.chat-conv-avatar');
          if (!av || av.__lfHotfixAvatar === c.avatar) return;
          av.innerHTML = '<img src="'+String(c.avatar).replace(/"/g,'&quot;')+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
          av.__lfHotfixAvatar = c.avatar;
        });
        if (global._chatCurrentConv){
          var c2 = byId[global._chatCurrentConv];
          if (c2 && c2.isGroup && c2.avatar){
            var hav = D.querySelector('#chat-conv-header .chat-conv-hd-avatar');
            if (hav && hav.__lfHotfixAvatar !== c2.avatar){
              hav.innerHTML = '<img src="'+String(c2.avatar).replace(/"/g,'&quot;')+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';
              hav.__lfHotfixAvatar = c2.avatar;
            }
          }
        }
      }catch(_e){}
    }
    (function wrap(){
      var o1 = global.renderChatList;
      if (typeof o1 === 'function' && !o1.__lfHotfixAvatar){
        var w1 = function(){ var r = o1.apply(this, arguments); setTimeout(paint, 20); return r; };
        w1.__lfHotfixAvatar = true;
        global.renderChatList = w1;
      }
      var o2 = global.openChatConv;
      if (typeof o2 === 'function' && !o2.__lfHotfixAvatar){
        var w2 = function(){ var r = o2.apply(this, arguments); setTimeout(paint, 30); return r; };
        w2.__lfHotfixAvatar = true;
        global.openChatConv = w2;
      }
      if (typeof global.renderChatList !== 'function' || typeof global.openChatConv !== 'function') setTimeout(wrap, 250);
    })();
  }

  /* 7) Se algum cache antigo ainda deixar handlers ausentes, cria ponte mínima */
  function eagerBridge(){
    ['chatSwitchNewMode','chatToggleGroupMember','chatCreateGroupFromModal','chatStartConv'].forEach(function(name){
      if (typeof global[name] === 'function') return;
      global[name] = function(){
        console.warn('[lf-chat-hotfix] chamada prematura para', name, '- aguardando chat síncrono carregar');
      };
    });
  }

  function boot(){
    eagerBridge();
    dedupeSweep();
    killDuplicateDots();
    hookHeaderMenu();
    guardSelfRemovalAndInbox();
    strictTabsAndBadges();
    repaintGroupAvatar();
    try{
      new MutationObserver(function(){ dedupeSweep(); killDuplicateDots(); })
        .observe(D.body, { childList:true, subtree:true });
    }catch(_e){}
  }

  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', boot, { once:true });
  else boot();
})(window);
