/**
 * lf-chat-msgsearch-and-tabs-v1-20260728.js
 *
 * P0-1 + P0-2: Busca em mensagens + abas na lista de conversas.
 * Stackable. Carregar DEPOIS de lf-chat-avatar-presence-profile-fix-20260727.js
 *
 * NÃO toca renderer original. Substitui:
 *   - chatSearch()          → busca em nome OU em conteúdo de mensagens
 *   - renderChatList()      → aplica filtro de aba
 *   - cria #chat-tabs-bar com [Tudo | Não lidas | Grupos | Equipe | Arquivadas]
 *   - cria #chat-msgsearch-overlay com lista de resultados (jump-to-msg)
 *
 * Persistência: aba ativa em `lf_chat_active_tab` (default 'all').
 */
(function(){
  'use strict';
  if (window.__LF_CHAT_MSGSEARCH_TABS_V1__) return;
  window.__LF_CHAT_MSGSEARCH_TABS_V1__ = true;

  var TAB_KEY = 'lf_chat_active_tab';
  var DEFAULT_TAB = 'all';
  var VALID_TABS = ['all','unread','groups','team','archived'];

  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function norm(v){ return String(v==null?'':v).trim().toLowerCase(); }
  function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function getTab(){
    try{
      var t = (typeof sg==='function') ? sg(TAB_KEY) : localStorage.getItem(TAB_KEY);
      return VALID_TABS.indexOf(t)>=0 ? t : DEFAULT_TAB;
    }catch(_e){ return DEFAULT_TAB; }
  }
  function setTab(t){
    try{ if(typeof ss==='function') ss(TAB_KEY,t); else localStorage.setItem(TAB_KEY,t); }catch(_e){}
  }
  function getUsers(){ return (typeof getUsers==='function') ? (getUsers()||[]) : []; }
  function getMeUid(){ return (window.S && window.S.userId) || ''; }

  function isGroupConv(c){ return !!(c && c.isGroup); }
  function convUnread(c){
    if(!c) return 0;
    var msgs = safe(function(){ return (typeof _chatGetMsgs==='function') ? _chatGetMsgs(c.id) : []; }, []);
    var me = getMeUid();
    return msgs.filter(function(m){
      if(!m||m.read) return false;
      return c.isGroup ? (m.fromUid !== me) : (m.toUid === me);
    }).length;
  }
  function belongsToTeam(c){
    if(!c || c.isGroup) return true; // grupos contam como "equipe" por padrão
    var me = getMeUid();
    var other = safe(function(){ return (typeof _chatOtherUid==='function') ? _chatOtherUid(c) : ''; }, '');
    if(!other) return false;
    return true; // DM sempre conta como equipe; refine por cargo se adicionar campo
  }

  function applyTabFilter(convs){
    var tab = getTab();
    if(tab === 'archived') return convs.filter(function(c){ return c && c.archived; });
    var base = convs.filter(function(c){ return c && !c.archived; });
    if(tab === 'all') return base;
    if(tab === 'unread') return base.filter(function(c){ return convUnread(c)>0; });
    if(tab === 'groups') return base.filter(isGroupConv);
    if(tab === 'team') return base.filter(belongsToTeam);
    return base;
  }

  function renderTabs(){
    var wrap = document.getElementById('chat-tabs-bar');
    if(!wrap) return;
    var all = safe(function(){ return (typeof _chatGetConvs==='function') ? _chatGetConvs() : []; }, []);
    var visibleAll = all.filter(function(c){ return c && !c.archived; });
    var counts = {
      all:      visibleAll.length,
      unread:   visibleAll.filter(function(c){ return convUnread(c)>0; }).length,
      groups:   visibleAll.filter(isGroupConv).length,
      team:     visibleAll.filter(belongsToTeam).length,
      archived: all.filter(function(c){ return c && c.archived; }).length,
    };
    var tabs = [
      {id:'all',      label:'Tudo',     n:counts.all},
      {id:'unread',   label:'Não lidas',n:counts.unread},
      {id:'groups',   label:'Grupos',   n:counts.groups},
      {id:'team',     label:'Equipe',   n:counts.team},
      {id:'archived', label:'Arquivadas',n:counts.archived},
    ];
    var cur = getTab();
    wrap.innerHTML = tabs.map(function(t){
      var active = t.id===cur ? ' on' : '';
      var nz = t.n>0 ? '<span class="chat-tab-n">'+t.n+'</span>' : '';
      return '<button type="button" class="chat-tab'+active+'" data-tab="'+t.id+'">'+esc(t.label)+' '+nz+'</button>';
    }).join('');
    wrap.querySelectorAll('.chat-tab').forEach(function(b){
      b.addEventListener('click', function(){
        setTab(b.getAttribute('data-tab'));
        renderTabs();
        if(typeof renderChatList==='function') renderChatList();
      });
    });
  }

  /* === wrap renderChatList: aplicar filtro de aba ANTES do retorno === */
  if(typeof window.renderChatList==='function'){
    var _origList = window.renderChatList;
    window.renderChatList = function(){
      // Aplica filtro visual pré-render: muta o array que o original vai usar.
      // Como o original lê de _chatGetConvs() no momento, vamos interceptar.
      var convs = [];
      try{
        if(typeof _chatGetConvs==='function') convs = _chatGetConvs();
      }catch(_e){ convs = []; }
      var filtered = applyTabFilter(convs);
      // Substitui temporariamente _chatGetConvs para devolver o filtrado
      var _origGet = window._chatGetConvs;
      window._chatGetConvs = function(){ return filtered.slice(); };
      try{
        renderTabs();
        return _origList.apply(this, arguments);
      } finally {
        window._chatGetConvs = _origGet;
      }
    };
  }

  /* === substitui chatSearch() para incluir busca em mensagens === */
  if(typeof window.chatSearch==='function'){
    window.chatSearch = function(q){
      q = norm(q);
      var items = document.querySelectorAll('#chat-conv-list .chat-conv-item');
      // Se texto curto, modo "filtro de nome" (mostra/oculta)
      if(!q){
        items.forEach(function(el){ el.style.display=''; });
        return;
      }
      items.forEach(function(el){ el.style.display=''; });
      var anyShown = Array.prototype.some.call(items, function(el){ return el.style.display !== 'none'; });
      if(anyShown) return; // encontrou por nome → modo simples
      // Não encontrou por nome → abrir overlay de busca em mensagens
      openMsgSearchOverlay(q);
    };
  }

  /* === overlay de busca em mensagens === */
  function openMsgSearchOverlay(q){
    var overlay = document.getElementById('chat-msgsearch-overlay') || (function(){
      var d = document.createElement('div');
      d.id = 'chat-msgsearch-overlay';
      d.className = 'mo on';
      var mb = document.createElement('div');
      mb.className = 'mb';
      mb.style.maxWidth = '560px';
      d.appendChild(mb);
      d.addEventListener('click', function(e){ if(e.target===d) d.classList.remove('on'); });
      document.body.appendChild(d);
      return d;
    })();
    var results = [];
    var convs = safe(function(){ return (typeof _chatGetConvs==='function') ? _chatGetConvs() : []; }, []);
    convs.forEach(function(c){
      if(!c || c.archived) return;
      var me = getMeUid();
      var inConv = c.isGroup || c.participants.indexOf(me)>=0;
      if(!inConv) return;
      var msgs = safe(function(){ return (typeof _chatGetMsgs==='function') ? _chatGetMsgs(c.id) : []; }, []);
      msgs.forEach(function(m){
        if(!m || !m.text) return;
        if(norm(m.text).indexOf(q)>=0){
          var sender = m.fromName || '';
          var convName = safe(function(){ return (typeof _chatOtherUserName==='function') ? _chatOtherUserName(c) : (c.name||'Grupo'); }, c.name||'Grupo');
          var hl = esc(m.text).replace(new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'), function(s){ return '<mark>'+s+'</mark>'; });
          results.push({cid:c.id, mid:m.id, sender:sender, convName:convName, prev:hl.slice(0,140), ts:m.ts});
        }
      });
    });
    results.sort(function(a,b){ return String(b.ts||'').localeCompare(String(a.ts||'')); });
    overlay.classList.add('on');
    var mb = overlay.querySelector('.mb');
    if(!results.length){
      mb.innerHTML = '<h2>🔎 Buscar mensagens</h2>'+
        '<div style="padding:30px;text-align:center;color:var(--mu,#9aa)">Nenhuma mensagem encontrada para &quot;'+esc(q)+'&quot;</div>'+
        '<div class="mbtns"><button class="bc" onclick="document.getElementById(\'chat-msgsearch-overlay\').classList.remove(\'on\')">Fechar</button></div>';
      return;
    }
    mb.innerHTML = '<h2>🔎 '+results.length+' resultado(s) para &quot;'+esc(q)+'&quot;</h2>'+
      '<div class="chat-msgsearch-results">'+
      results.slice(0,50).map(function(r,idx){
        return '<div class="chat-msgsearch-item" data-idx="'+idx+'">'+
          '<div class="chat-msgsearch-head"><b>'+esc(r.sender)+'</b> <span style="color:var(--mu)">em '+esc(r.convName)+'</span></div>'+
          '<div class="chat-msgsearch-prev">'+r.prev+'</div>'+
        '</div>';
      }).join('')+'</div>'+
      '<div class="mbtns"><button class="bc" onclick="document.getElementById(\'chat-msgsearch-overlay\').classList.remove(\'on\')">Fechar</button></div>';
    mb.querySelectorAll('.chat-msgsearch-item').forEach(function(el){
      el.addEventListener('click', function(){
        var idx = parseInt(el.getAttribute('data-idx'),10);
        var r = results[idx]; if(!r) return;
        overlay.classList.remove('on');
        try{
          if(typeof openChatConv==='function') openChatConv(r.cid);
          // pequeno delay para garantir render da conv
          setTimeout(function(){
            if(typeof chatJumpToMsg==='function') chatJumpToMsg({preventDefault:function(){}}, r.mid);
          }, 200);
        }catch(_e){}
      });
    });
  }

  /* === boot: criar barra de abas + estilos próprios === */
  function injectBar(){
    var list = document.getElementById('chat-list-panel');
    if(!list || document.getElementById('chat-tabs-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'chat-tabs-bar';
    bar.className = 'chat-tabs-bar';
    var search = list.querySelector('.chat-search');
    if(search && search.nextSibling){
      list.insertBefore(bar, search.nextSibling);
    } else {
      list.insertBefore(bar, list.firstChild);
    }
  }

  function injectCSS(){
    if(document.getElementById('lf-chat-msgsearch-tabs-css')) return;
    var s = document.createElement('style');
    s.id = 'lf-chat-msgsearch-tabs-css';
    s.textContent = [
      '.chat-tabs-bar{display:flex;gap:2px;padding:6px 10px 4px;background:var(--bg2);border-bottom:1px solid var(--b2);overflow-x:auto;-webkit-overflow-scrolling:touch;flex-shrink:0}',
      '.chat-tab{display:flex;align-items:center;gap:4px;padding:6px 10px;border:0;background:transparent;color:var(--mu);font-size:.74rem;border-radius:8px;cursor:pointer;white-space:nowrap;transition:all .15s}',
      '.chat-tab:hover{background:rgba(255,255,255,.04);color:var(--tx)}',
      '.chat-tab.on{background:rgba(195,154,45,.18);color:var(--amber,#c39a2d);font-weight:600}',
      '.chat-tab-n{display:inline-flex;align-items:center;justify-content:center;min-width:18px;padding:0 5px;height:16px;border-radius:8px;background:rgba(195,154,45,.18);color:var(--amber,#c39a2d);font-size:.66rem;font-weight:700}',
      '#chat-msgsearch-overlay .mb h2{font-size:1.05rem;margin-bottom:8px}',
      '.chat-msgsearch-results{max-height:60vh;overflow-y:auto}',
      '.chat-msgsearch-item{padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .15s;border-bottom:1px solid var(--b1,rgba(255,255,255,.06))}',
      '.chat-msgsearch-item:hover{background:rgba(195,154,45,.08)}',
      '.chat-msgsearch-head{font-size:.8rem;margin-bottom:3px}',
      '.chat-msgsearch-prev{font-size:.78rem;color:var(--mu);word-break:break-word;line-height:1.4}',
      '.chat-msgsearch-prev mark{background:rgba(195,154,45,.28);color:var(--tx);padding:0 2px;border-radius:3px}',
    ].join('');
    document.head.appendChild(s);
  }

  function boot(){
    injectCSS();
    injectBar();
    renderTabs();
  }

  if(document.readyState==='complete'||document.readyState==='interactive'){
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // Reforça ao abrir a página chat
  document.addEventListener('click', function(e){
    var t = e.target;
    if(!t) return;
    var goingChat = (t.getAttribute && (t.getAttribute('onclick')||'').indexOf("'chat'") >= 0)
                 || (t.closest && t.closest('[data-page="chat"], [onclick*="\'chat\'"]'));
    if(goingChat){
      setTimeout(function(){ boot(); if(typeof renderChatList==='function') renderChatList(); }, 60);
    }
  }, true);

  window.LF_CHAT_MSGSEARCH_TABS = {
    setTab: setTab,
    getTab: getTab,
    search: openMsgSearchOverlay,
  };
})();
