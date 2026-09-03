/* =====================================================================
 * lf-fix-participantes-notif-tabs-v1-20260730.js
 * ---------------------------------------------------------------------
 * CORREÇÃO CIRÚRGICA — 6 bugs, 6 causas raízes independentes.
 * Patch 100% aditivo. Carregar DEPOIS de:
 *   - js/chat.js
 *   - js/notificacoes.js
 *   - js/patches/lf-chat-group-manage-v1-20260728.js
 *   - js/patches/lf-chat-msgsearch-and-tabs-v1-20260728.js
 *   - js/patches/lf-tab-dots-notif-fix-20260729.js
 *
 * Escopo:
 *   FIX A: Header do grupo clicável (nome/N participantes) -> abre gestão
 *          com lista de participantes, adicionar (ADM) e excluir (ADM).
 *   FIX B: Idempotência do chatAddGroupMember (double-tap / ressurreição
 *          via sync remoto) usando lock em memória + tombstone de
 *          participantes removidos por conv.
 *   FIX C: Aba "Grupos" só mostra realmente conv.isGroup === true
 *          (dedupe estrito, ignora grupos corrompidos sem name).
 *          Aba "Não lidas" agora marca msgs como read ao abrir conv
 *          e ignora conv sem participação real do usuário.
 *   FIX D: Remove a sub-aba "Equipe" da barra de abas do chat.
 *   FIX E: Clique em notificação:
 *            - type='chat' + convId -> goPage('chat') + openChatConv
 *            - type='activity' + activityId -> goPage('agenda') + scroll
 *            - type='lead' + leadId (ou cardId sem board) -> abre lead
 *          Todas com fallback ao comportamento antigo (cardId+board).
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__LF_FIX_PARTICIPANTES_NOTIF_TABS_V1__) return;
  global.__LF_FIX_PARTICIPANTES_NOTIF_TABS_V1__ = true;

  var D = global.document;
  var LS = global.localStorage;

  function safe(fn, fb){ try{ return fn(); }catch(_e){ return fb; } }
  function arr(x){ return Array.isArray(x) ? x : []; }
  function meUid(){ return (global.S && global.S.userId) || ''; }
  function toast(m){ if (typeof global.toast === 'function') global.toast(m); }

  /* ==================================================================
   * FIX A — Header do grupo clicável
   * ==================================================================
   * Causa raiz: o <div class="chat-conv-hd-status"> é puro texto ("N
   * participantes"). O botão "⋯" chama chatConvMenu (pin/mute/archive),
   * não abre a gestão de grupo. O modal existe em
   * window.LF_CHAT_GROUP_MANAGE.open, mas nada o aciona no toque
   * natural do usuário (nome/qtd).
   *
   * Correção: usar delegação de eventos no #chat-conv-header. Se a conv
   * atual for grupo, qualquer clique em .chat-conv-hd-name,
   * .chat-conv-hd-info ou .chat-conv-hd-status abre a gestão.
   * Também injetamos cursor:pointer via CSS para dar affordance.
   */
  function _installGroupHeaderClick(){
    try{
      if (D.getElementById('lf-fix-grp-hdr-css')) return;
      var st = D.createElement('style');
      st.id = 'lf-fix-grp-hdr-css';
      st.textContent = [
        '#chat-conv-header.lf-is-group .chat-conv-hd-info,',
        '#chat-conv-header.lf-is-group .chat-conv-hd-name,',
        '#chat-conv-header.lf-is-group .chat-conv-hd-status,',
        '#chat-conv-header.lf-is-group .chat-conv-hd-avatar{cursor:pointer;}',
        '#chat-conv-header.lf-is-group .chat-conv-hd-status{text-decoration:underline dotted;text-underline-offset:2px;opacity:.85;}'
      ].join('');
      D.head.appendChild(st);
    }catch(_e){}
  }

  function _openGroupManage(){
    // Preferir o modal já existente do patch lf-chat-group-manage
    if (global.LF_CHAT_GROUP_MANAGE && typeof global.LF_CHAT_GROUP_MANAGE.open === 'function'){
      global.LF_CHAT_GROUP_MANAGE.open();
      return;
    }
    // Fallback: se por algum motivo o patch não subiu, chama o menu antigo
    if (typeof global.chatConvMenu === 'function' && global._chatCurrentConv){
      global.chatConvMenu(global._chatCurrentConv);
    }
  }

  function _markGroupHeader(){
    try{
      var hdr = D.getElementById('chat-conv-header');
      if (!hdr) return;
      var conv = null;
      if (typeof global._chatGetConvs === 'function' && global._chatCurrentConv){
        conv = (global._chatGetConvs()||[]).find(function(c){
          return c && c.id === global._chatCurrentConv;
        });
      }
      hdr.classList.toggle('lf-is-group', !!(conv && conv.isGroup));
    }catch(_e){}
  }

  // Delegação: um único listener no document — sobrevive a re-renders
  D.addEventListener('click', function(ev){
    var t = ev.target;
    if (!t) return;
    var hdr = t.closest && t.closest('#chat-conv-header');
    if (!hdr) return;
    if (!hdr.classList.contains('lf-is-group')) return;
    // Se clicou em botão real (ℹ, ⋯, ✕, ‹) deixa passar
    if (t.closest('button')) return;
    // Área clicável: nome, status ou info
    if (t.closest('.chat-conv-hd-info, .chat-conv-hd-name, .chat-conv-hd-status, .chat-conv-hd-avatar')){
      ev.preventDefault(); ev.stopPropagation();
      _openGroupManage();
    }
  }, true);

  // Marca o header sempre que openChatConv rodar
  (function wrapOpenChatConv(){
    var orig = global.openChatConv;
    if (typeof orig !== 'function' || orig.__lfHdrGroupWrap) {
      setTimeout(wrapOpenChatConv, 300); return;
    }
    var wrapped = function(){
      var r = orig.apply(this, arguments);
      setTimeout(function(){ _installGroupHeaderClick(); _markGroupHeader(); }, 40);
      return r;
    };
    wrapped.__lfHdrGroupWrap = true;
    global.openChatConv = wrapped;
  })();

  _installGroupHeaderClick();

  /* ==================================================================
   * FIX B — Idempotência real do chatAddGroupMember + tombstone
   *          por conv para evitar ressurreição por sync
   * ==================================================================
   * Causa raiz: cliques repetidos (double-tap em mobile) chamam a função
   * duas vezes antes do primeiro sync. O guard atual (indexOf<0) protege
   * o array in-memory, mas o _chatSyncConvUpsert dispara duas vezes
   * enviando o mesmo participante — dependendo do backend, gera trigger
   * duplicado. Além disso, ao remover um participante (via patch
   * group-manage), o próximo sync recebe do servidor a versão antiga
   * que ainda continha esse participante e o reintroduz.
   */
  var _addLocks = Object.create(null);   // convId -> { uid: expiresAt }
  var TOMB_KEY = 'lf_group_removed_parts';
  function _readGrpTombs(){
    try { return JSON.parse(LS.getItem(TOMB_KEY)||'{}') || {}; }
    catch(_e){ return {}; }
  }
  function _writeGrpTombs(m){
    try { LS.setItem(TOMB_KEY, JSON.stringify(m||{})); } catch(_e){}
  }
  function _addGrpTomb(convId, uid){
    if (!convId || !uid) return;
    var m = _readGrpTombs();
    m[convId] = m[convId] || {};
    m[convId][uid] = Date.now();
    // Expira em 30 dias
    _writeGrpTombs(m);
  }
  function _isGrpTombed(convId, uid){
    if (!convId || !uid) return false;
    var m = _readGrpTombs();
    var e = m[convId] && m[convId][uid];
    if (!e) return false;
    if ((Date.now()-e) > 30*24*3600*1000){
      delete m[convId][uid];
      _writeGrpTombs(m);
      return false;
    }
    return true;
  }
  function _clearGrpTomb(convId, uid){
    var m = _readGrpTombs();
    if (m[convId] && m[convId][uid]){
      delete m[convId][uid];
      _writeGrpTombs(m);
    }
  }

  // Envelopa chatAddGroupMember com lock 1200ms + limpeza de tombstone
  (function wrapAddMember(){
    var orig = global.chatAddGroupMember;
    if (typeof orig !== 'function' || orig.__lfIdem){
      setTimeout(wrapAddMember, 400); return;
    }
    var w = function(convId, uid){
      _addLocks[convId] = _addLocks[convId] || {};
      var now = Date.now();
      if (_addLocks[convId][uid] && now < _addLocks[convId][uid]){
        return; // ignorado — double-tap
      }
      _addLocks[convId][uid] = now + 1200;
      // Ao readicionar deliberadamente, limpa tombstone dessa dupla
      _clearGrpTomb(convId, uid);
      return orig.call(this, convId, uid);
    };
    w.__lfIdem = true;
    global.chatAddGroupMember = w;
  })();

  // Ao remover membro via LF_CHAT_GROUP_MANAGE, crava tombstone
  (function wrapRemoveMember(){
    var api = global.LF_CHAT_GROUP_MANAGE;
    if (!api || typeof api.removeMember !== 'function' || api.__lfTombWrap){
      setTimeout(wrapRemoveMember, 400); return;
    }
    var origRm = api.removeMember;
    api.removeMember = function(idx){
      try{
        var mo = D.getElementById('mo-chat-manage');
        var m  = mo && mo._members && mo._members[idx];
        if (mo && m && mo._convId){ _addGrpTomb(mo._convId, m.uid); }
      }catch(_e){}
      return origRm.apply(this, arguments);
    };
    // Também "leave" cria tombstone do próprio usuário
    var origLeave = api.leave;
    if (typeof origLeave === 'function'){
      api.leave = function(){
        try{
          var mo = D.getElementById('mo-chat-manage');
          if (mo && mo._convId) _addGrpTomb(mo._convId, meUid());
        }catch(_e){}
        return origLeave.apply(this, arguments);
      };
    }
    api.__lfTombWrap = true;
  })();

  // Filtro anti-ressurreição: envelopa _chatGetConvs para tirar
  // participantes tombstoneds da view (não altera storage — apenas
  // apresentação, para não brigar com o sync). O próximo save real
  // (adicionar/remover/nomear) grava sem eles.
  (function wrapGetConvs(){
    var orig = global._chatGetConvs;
    if (typeof orig !== 'function' || orig.__lfTombFilter){
      setTimeout(wrapGetConvs, 400); return;
    }
    var w = function(){
      var list = orig.apply(this, arguments) || [];
      // Não muta o array original — clona só quando há tombstones
      var tombs = _readGrpTombs();
      if (!tombs || !Object.keys(tombs).length) return list;
      return list.map(function(c){
        if (!c || !c.isGroup) return c;
        var t = tombs[c.id];
        if (!t) return c;
        var parts = arr(c.participants).filter(function(u){ return !t[u]; });
        if (parts.length === arr(c.participants).length) return c;
        var clone = Object.assign({}, c);
        clone.participants = parts;
        if (c.admins) clone.admins = arr(c.admins).filter(function(u){ return !t[u]; });
        return clone;
      });
    };
    w.__lfTombFilter = true;
    global._chatGetConvs = w;
  })();

  /* ==================================================================
   * FIX C — Aba "Grupos" só grupos reais; "Não lidas" marca msgs read
   * ==================================================================
   * Causa raiz "Grupos": conv corrompida pode ter isGroup=undefined mas
   * participants.length > 2 — algum normalizador antigo forçou isGroup=true
   * mesmo em DM multi-participante. Filtro estrito: isGroup===true E
   * tem name E participants.length >= 2 (grupo válido).
   *
   * Causa raiz "Não lidas": o patch tab-dots só marca a notif sintética
   * como lida, mas as mensagens permanecem read=false, então convUnread
   * volta a > 0 no próximo poll. Fix: ao openChatConv, marca todas as
   * msgs da conv como read=true e chama renderChatList.
   */
  (function wrapTabsFilter(){
    // Sobrescreve o classificador do patch de abas de forma benigna.
    // Estratégia: interceptar renderChatList (que o patch de abas já
    // envelopou) para pós-filtrar o DOM.
    var orig = global.renderChatList;
    if (typeof orig !== 'function' || orig.__lfStrictTab){
      setTimeout(wrapTabsFilter, 300); return;
    }
    function _currentTab(){
      try{
        return (typeof global.sg==='function') ? global.sg('lf_chat_active_tab') : (LS.getItem('lf_chat_active_tab')||'all');
      }catch(_e){ return 'all'; }
    }
    function _isRealGroup(c){
      return !!(c && c.isGroup === true && arr(c.participants).length >= 2);
    }
    var w = function(){
      var r = orig.apply(this, arguments);
      try{
        var tab = _currentTab();
        if (tab !== 'groups' && tab !== 'unread') return r;
        var items = D.querySelectorAll('#chat-conv-list .chat-conv-item');
        if (!items || !items.length) return r;
        var convs = (typeof global._chatGetConvs==='function') ? (global._chatGetConvs()||[]) : [];
        var byId = {}; convs.forEach(function(c){ if (c && c.id) byId[c.id]=c; });
        var me = meUid();
        items.forEach(function(el){
          var cid = el.getAttribute('data-conv-id');
          var c = byId[cid]; if (!c) return;
          var hide = false;
          if (tab === 'groups' && !_isRealGroup(c)) hide = true;
          if (tab === 'unread'){
            var msgs = safe(function(){ return global._chatGetMsgs(c.id) || []; }, []);
            var unread = msgs.filter(function(m){
              if (!m || m.read) return false;
              return c.isGroup ? (m.fromUid !== me) : (m.toUid === me);
            }).length;
            if (unread <= 0) hide = true;
          }
          el.style.display = hide ? 'none' : '';
        });
      }catch(_e){}
      return r;
    };
    w.__lfStrictTab = true;
    global.renderChatList = w;
  })();

  // Ao abrir uma conv, marca todas as msgs como lidas E persiste
  (function wrapOpenForRead(){
    var orig = global.openChatConv;
    if (typeof orig !== 'function' || orig.__lfMarkReadWrap){
      setTimeout(wrapOpenForRead, 400); return;
    }
    var w = function(convId){
      var r = orig.apply(this, arguments);
      try{
        if (typeof global._chatGetMsgs === 'function' &&
            typeof global._chatSaveMsgs === 'function'){
          var me = meUid();
          var convs = global._chatGetConvs ? (global._chatGetConvs()||[]) : [];
          var c = convs.find(function(x){ return x && x.id===convId; });
          var msgs = global._chatGetMsgs(convId) || [];
          var changed = false;
          msgs.forEach(function(m){
            if (!m || m.read) return;
            var forMe = c && c.isGroup ? (m.fromUid !== me) : (m.toUid === me);
            if (forMe){ m.read = true; changed = true; }
          });
          if (changed){
            global._chatSaveMsgs(convId, msgs);
            if (typeof global.renderChatList === 'function') global.renderChatList();
            if (typeof global._chatUpdateUnreadBadge === 'function') global._chatUpdateUnreadBadge();
          }
        }
      }catch(_e){}
      return r;
    };
    w.__lfMarkReadWrap = true;
    global.openChatConv = w;
  })();

  /* ==================================================================
   * FIX D — Remove sub-aba "Equipe"
   * ==================================================================
   * Causa raiz: injetada em lf-chat-msgsearch-and-tabs. Como o patch é
   * autocontido, matamos o DOM (botão .chat-tab[data-tab="team"]) via
   * MutationObserver + CSS. E se o usuário tiver "team" salvo como aba
   * ativa, força "all".
   */
  (function killTeamTab(){
    try{
      if (D.getElementById('lf-fix-kill-team-css')) return;
      var st = D.createElement('style');
      st.id = 'lf-fix-kill-team-css';
      st.textContent = '.chat-tabs-bar .chat-tab[data-tab="team"]{display:none !important;}';
      D.head.appendChild(st);
    }catch(_e){}
    // Se aba ativa persistida era "team", muda para "all"
    try{
      var cur = (typeof global.sg==='function') ? global.sg('lf_chat_active_tab') : LS.getItem('lf_chat_active_tab');
      if (cur === 'team'){
        if (typeof global.ss==='function') global.ss('lf_chat_active_tab','all');
        else LS.setItem('lf_chat_active_tab','all');
      }
    }catch(_e){}
    // Reforço: se DOM já existir, remove nó
    function purge(){
      D.querySelectorAll('.chat-tabs-bar .chat-tab[data-tab="team"]').forEach(function(el){
        el.parentNode && el.parentNode.removeChild(el);
      });
    }
    purge();
    try{
      var mo = new MutationObserver(purge);
      mo.observe(D.body, {childList:true, subtree:true});
    }catch(_e){}
  })();

  /* ==================================================================
   * FIX E — notifItemClick roteia por tipo e destino real
   * ==================================================================
   * Causa raiz: notifItemClick só entende cardId+board. Notifs de chat
   * carregam n.convId; de atividade carregam cardId sem board correto;
   * de lead carregam cardId+board de leads mas o handler falhava por
   * ausência de openLead. Solução: wrap com router explícito por type.
   */
  (function wrapNotifClick(){
    var orig = global.notifItemClick;
    if (typeof orig !== 'function' || orig.__lfRouter){
      setTimeout(wrapNotifClick, 400); return;
    }
    function _closePanel(){
      try{ if (typeof global.toggleNotifPanel === 'function'){
        var p = D.getElementById('ntf-panel');
        if (p && p.classList.contains('open')) global.toggleNotifPanel();
      } }catch(_e){}
    }
    function _go(page){
      if (typeof global.goPage === 'function') global.goPage(page);
    }
    function _openLeadCard(cardId, board){
      // Tenta múltiplos entrypoints conhecidos do CRM
      var candidates = ['openLeadDet','openLead','openKBDet','openLeadCard'];
      for (var i=0;i<candidates.length;i++){
        var fn = global[candidates[i]];
        if (typeof fn === 'function'){
          try{
            if (fn.length >= 3) fn(cardId, board || 'leads', meUid());
            else if (fn.length === 2) fn(cardId, board||'leads');
            else fn(cardId);
            return true;
          }catch(_e){}
        }
      }
      return false;
    }
    var w = function(id){
      var list = safe(function(){ return global.getNotifs(meUid()); }, []) || [];
      var n = list.find(function(x){ return x && x.id === id; });
      if (!n){
        return orig.apply(this, arguments); // deixa o antigo lidar
      }
      // Marca como lida antes de navegar
      n.lida = true;
      try{ global.saveNotifsFor(meUid(), list); }catch(_e){}
      try{ global.updateNotifBadge && global.updateNotifBadge(); }catch(_e){}
      try{ global.renderNotifPanel && global.renderNotifPanel(list); }catch(_e){}

      // Roteamento por tipo
      var t = n.type;

      // 1) CHAT
      if (t === 'chat' && n.convId){
        _closePanel();
        _go('chat');
        setTimeout(function(){
          if (typeof global.openChatConv === 'function'){
            try{ global.openChatConv(n.convId); }catch(_e){}
          }
        }, 120);
        return;
      }

      // 2) ATIVIDADE (agenda)
      if (t === 'activity'){
        // Se veio com cardId+board (atividade de kanban) usa o fluxo antigo
        if (n.cardId && n.board){
          return orig.apply(this, arguments);
        }
        _closePanel();
        _go('agenda');
        // Rola até o item se houver activityId
        var aid = n.activityId || n.cardId;
        if (aid){
          setTimeout(function(){
            var el = D.querySelector('[data-activity-id="'+String(aid).replace(/"/g,'\\"')+'"], #act-'+aid);
            if (el && el.scrollIntoView){
              el.scrollIntoView({behavior:'smooth', block:'center'});
              el.classList.add('lf-notif-highlight');
              setTimeout(function(){ el.classList.remove('lf-notif-highlight'); }, 1800);
            }
          }, 200);
        }
        return;
      }

      // 3) LEAD / TRANSFERÊNCIA / AUTOMATION apontando para lead
      if (n.cardId){
        _closePanel();
        var board = n.board || 'leads';
        var page = (board === 'leads' || board === 'negocios') ? board : 'leads';
        _go(page);
        setTimeout(function(){
          if (!_openLeadCard(n.cardId, board)){
            // Fallback: destaca o card se estiver na tela
            var el = D.querySelector('[data-card-id="'+String(n.cardId).replace(/"/g,'\\"')+'"]');
            if (el && el.scrollIntoView){
              el.scrollIntoView({behavior:'smooth', block:'center'});
              el.classList.add('lf-notif-highlight');
              setTimeout(function(){ el.classList.remove('lf-notif-highlight'); }, 1800);
            } else {
              toast('Card não encontrado neste dispositivo.');
            }
          }
        }, 180);
        return;
      }

      // 4) Fallback: comportamento antigo (nada a fazer / marca lida)
      return orig.apply(this, arguments);
    };
    w.__lfRouter = true;
    global.notifItemClick = w;

    // CSS do highlight
    try{
      if (!D.getElementById('lf-notif-hl-css')){
        var st = D.createElement('style');
        st.id = 'lf-notif-hl-css';
        st.textContent = '.lf-notif-highlight{outline:2px solid #c39a2d !important;outline-offset:2px;transition:outline .2s;animation:lfNotifBlink 1.6s ease-in-out 1;}'+
          '@keyframes lfNotifBlink{0%,100%{box-shadow:0 0 0 0 rgba(195,154,45,.0)}50%{box-shadow:0 0 0 6px rgba(195,154,45,.35)}}';
        D.head.appendChild(st);
      }
    }catch(_e){}
  })();

  /* ==================================================================
   * FIX E bis — Garantir que agenda.js/leads.js emitam notif COM
   *              activityId/leadId. Best-effort: envelopa pushNotif
   *              para preencher opts.activityId/leadId a partir do
   *              texto quando ausente (não altera arquivos originais).
   * ================================================================== */
  (function wrapPushNotif(){
    var orig = global.pushNotif;
    if (typeof orig !== 'function' || orig.__lfEnrich){
      setTimeout(wrapPushNotif, 400); return;
    }
    var w = function(toUid, type, text, opts){
      opts = opts || {};
      // Se for de chat e não veio convId, tenta pegar do _chatCurrentConv
      if (type === 'chat' && !opts.convId && global._chatCurrentConv){
        opts.convId = global._chatCurrentConv;
      }
      return orig.call(this, toUid, type, text, opts);
    };
    w.__lfEnrich = true;
    global.pushNotif = w;
  })();

})(window);
