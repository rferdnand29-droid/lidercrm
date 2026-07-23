(function(){
  if(window.__LF_SUP_TEAM_VIEW_RO_V1__) return;
  window.__LF_SUP_TEAM_VIEW_RO_V1__ = true;

  function isSupervisorReadonly(){
    try{
      return (typeof window.hasSupervisorAccess==='function' && window.hasSupervisorAccess()) &&
             !(typeof window.hasAdminAccess==='function' && window.hasAdminAccess());
    }catch(_e){ return false; }
  }

  // FIX (2026-07-23): antes, o patch tornava TODOS os quadros do Supervisor/Orientador
  // somente-leitura — inclusive os próprios leads/negócios do usuário logado. O usuário
  // reportou que não conseguia editar os PRÓPRIOS cards. A visão somente-leitura só faz
  // sentido quando o Supervisor está olhando o quadro de OUTRA pessoa (ou "Todos").
  // Quando ele seleciona a si mesmo no filtro (chip com o próprio nome), o quadro deve
  // se comportar como o de um Consultor normal (edição total dos próprios cards).
  function _lfMyId(){ return (window.S && window.S.userId) || null; }
  function _lfIsOwnView(board){
    if(!board) return false;
    var me = _lfMyId();
    return !!(me && window._kbViewUid && window._kbViewUid[board] === me);
  }
  function _lfBoardFromArgs(fnName, args){
    try{
      switch(fnName){
        case 'openKBNew': return args[0] || null;
        case 'moveCard':
        case '_kbMoveCard':
        case 'promptDeleteKB':
        case 'assumeLead':
        case 'openTransferKB':
          return args[1] || null;
        case 'saveKBCard':
          var bt = document.getElementById('kb-board-type');
          return (bt && bt.value) || window._kbEditBoard || null;
        case 'editKBFromDet':
        case 'discardKBFromDet':
          return window._kbDetBoard || null;
        case 'ctxEdit':
        case 'ctxDiscard':
          return window._kbCtxBoard || null;
        case 'convertToNeg':
          return 'leads';
        case 'confirmTransferAndMaybeMove':
        case 'confirmDeleteKBReason':
        case 'confirmDiscard':
        case 'discardKB':
          return window._kbDetBoard || window._kbCtxBoard || window._kbEditBoard || null;
        default: return null;
      }
    }catch(_e){ return null; }
  }
  function _lfOwnerFromArgs(fnName, args){
    try{
      switch(fnName){
        case 'moveCard':
        case '_kbMoveCard':
          return args[3] || null; // (cardId, board, newCol, ownerUid)
        case 'promptDeleteKB':
        case 'assumeLead':
        case 'openTransferKB':
          return args[2] || null;
        case 'convertToNeg':
          return args[1] || null;
        case 'saveKBCard':
          return window._kbEditOwnerUid || null;
        case 'editKBFromDet':
        case 'discardKBFromDet':
          return window._kbDetOwnerUid || null;
        case 'ctxEdit':
        case 'ctxDiscard':
          return window._kbCtxOwner || null;
        default: return null;
      }
    }catch(_e){ return null; }
  }
  function _lfMutationAllowed(fnName, args){
    // Bloqueia só quando o Supervisor está atuando sobre cards que não são dele.
    if(!isSupervisorReadonly()) return true;
    var me = _lfMyId();
    if(!me) return true;
    var owner = _lfOwnerFromArgs(fnName, args);
    if(owner && owner === me) return true;          // mexendo em card próprio → OK
    var board = _lfBoardFromArgs(fnName, args);
    if(_lfIsOwnView(board)) return true;            // quadro próprio ativo → OK
    return false;
  }

  function readOnlyMsg(){
    try{
      if(typeof window.toast==='function'){
        window.toast('Supervisor/Orientador: visualização somente leitura nesta área.');
      }
    }catch(_e){}
  }

  function getTeamUsers(){
    var me = (window.S && S.userId) || null;
    var list = [];
    try{
      if(typeof window.getDepartmentVisibleUsers === 'function'){
        list = window.getDepartmentVisibleUsers(me) || [];
      }else if(typeof window.getUsers === 'function'){
        list = (window.getUsers() || []).filter(function(u){ return u && u.ativo !== false; });
      }
    }catch(_e){ list = []; }

    var seen = {};
    var out = [];
    function push(u){
      if(!u || !u.id || seen[u.id]) return;
      seen[u.id] = 1;
      out.push(u);
    }

    if(me){
      push({ id: me, nome: (window.S && S.nome) || 'Eu', ativo: true });
    }
    (list || []).forEach(push);
    return out;
  }

  function getWrap(board){
    return document.getElementById(board === 'leads' ? 'leads-kanban' : 'negocios-kanban');
  }

  function listWithOwner(board, uid){
    var base = (typeof window.getKBFor === 'function') ? (window.getKBFor(board, uid) || []) : [];
    return base.map(function(c){
      try{ c._timeOwnerUid = uid; }catch(_e){}
      return c;
    });
  }

  function renderReadonlyTeamBoard(board){
    if(!window.S || !S.userId) return;
    var wrap = getWrap(board);
    if(!wrap) return;

    if(typeof window._bindKBDragAutoShell === 'function'){
      window._bindKBDragAutoShell(board, wrap);
    }

    var selectedUid = (window._kbViewUid && window._kbViewUid[board]) || null;
    var finalList = [];

    if(selectedUid){
      finalList = listWithOwner(board, selectedUid);
      if(typeof window._buildKB === 'function'){
        window._buildKB(board, finalList, wrap, selectedUid, true);
      }
    }else{
      getTeamUsers().forEach(function(u){
        listWithOwner(board, u.id).forEach(function(card){ finalList.push(card); });
      });
      if(typeof window._buildKB === 'function'){
        window._buildKB(board, finalList, wrap, null, true);
      }
    }

    if(typeof window.isMobileView === 'function' && window.isMobileView() && typeof window.renderKBMobile === 'function'){
      window.renderKBMobile(board);
    }
  }

  if(typeof window.activeUID === 'function'){
    var _origActiveUID = window.activeUID;
    window.activeUID = function(board){
      if(!window.S || !S.userId) return null;
      if((((typeof window.hasAdminAccess === 'function') && window.hasAdminAccess(S.userId)) || isSupervisorReadonly()) && window._kbViewUid && _kbViewUid[board]){
        return _kbViewUid[board];
      }
      return _origActiveUID.call(this, board);
    };
  }

  if(typeof window.renderKBConsBar === 'function'){
    var _origRenderKBConsBar = window.renderKBConsBar;
    window.renderKBConsBar = function(board){
      var el = document.getElementById(board + '-cons-bar');
      if(!el) return;

      var isAdm = (typeof window.hasAdminAccess === 'function') && window.hasAdminAccess();
      var isSupReadonly = isSupervisorReadonly();

      if(!isAdm && !isSupReadonly){
        el.innerHTML = '';
        return;
      }

      if(!isSupReadonly){
        return _origRenderKBConsBar.call(this, board);
      }

      var users = getTeamUsers();
      var cur = window._kbViewUid ? _kbViewUid[board] : null;
      var boardJs = (typeof window._jsSq === 'function') ? window._jsSq(board) : board;
      var html = '<span style="font-size:.65rem;color:var(--mu);margin-right:4px">Ver:</span>' +
        '<button class="kb-cons-chip' + (cur === null ? ' on' : '') + '" onclick="setKBView(\'' + boardJs + '\',null,this)">Todos</button>';

      users.forEach(function(u){
        if(!u || !u.id) return;
        var uidJs = (typeof window._jsSq === 'function') ? window._jsSq(u.id) : u.id;
        var nome = (u.nome || u.id).split(' ')[0];
        html += '<button class="kb-cons-chip' + (cur === u.id ? ' on' : '') + '" onclick="setKBView(\'' + boardJs + '\',\'' + uidJs + '\',this)">' + ((typeof window.eH === 'function') ? window.eH(nome) : nome) + '</button>';
      });

      el.innerHTML = html;
    };
  }

  if(typeof window.renderKBLocal === 'function'){
    var _origRenderKBLocal = window.renderKBLocal;
    window.renderKBLocal = function(board){
      // Se o Supervisor está no próprio quadro, deixa o fluxo padrão (edição total).
      if(isSupervisorReadonly() && !_lfIsOwnView(board)) return renderReadonlyTeamBoard(board);
      return _origRenderKBLocal.call(this, board);
    };
  }

  if(typeof window._syncKBRemoteBG === 'function'){
    var _origSyncKBRemoteBG = window._syncKBRemoteBG;
    window._syncKBRemoteBG = function(board){
      // No quadro próprio o Supervisor usa o sync normal (grava também os cards dele).
      if(!isSupervisorReadonly() || _lfIsOwnView(board)) return _origSyncKBRemoteBG.call(this, board);

      var wc = (typeof window._kbWorkerClient === 'function') ? window._kbWorkerClient() : null;
      var usingWorker = !!wc;
      if(!usingWorker && !(window.DB_MODE === 'firebase' && window.db)) return;

      function fetchDoc(uid){
        return usingWorker
          ? wc.kanbanList(board, uid).then(function(doc){ return (doc && doc.list) || []; })
          : db.collection('kb_' + board).doc(uid).get().then(function(d){ return d.exists ? ((d.data() || {}).list || []) : []; });
      }

      var selectedUid = (window._kbViewUid && window._kbViewUid[board]) || null;
      var targets = selectedUid
        ? getTeamUsers().filter(function(u){ return u && u.id === selectedUid; })
        : getTeamUsers();

      var pending = targets.length;
      if(!pending){
        renderReadonlyTeamBoard(board);
        return;
      }

      targets.forEach(function(u){
        fetchDoc(u.id).then(function(server){
          var local = (typeof window.getKBFor === 'function') ? (window.getKBFor(board, u.id) || []) : [];
          var merged = (typeof window._mergeKeepLocalOnly === 'function') ? window._mergeKeepLocalOnly(server, local) : (server || []);
          if(typeof window.ss === 'function' && typeof window.kbKeyFor === 'function'){
            window.ss(window.kbKeyFor(board, u.id), merged);
          }
          if(merged.length !== server.length && typeof window.saveKBFor === 'function'){
            window.saveKBFor(board, u.id, merged);
          }
        }).catch(function(e){
          try{
            console.warn('[lf-supervisor-teamview-readonly] sync falhou', e);
            if(typeof window.syncErr === 'function') window.syncErr(e);
          }catch(_e){}
        }).then(function(){
          pending--;
          if(pending <= 0) renderReadonlyTeamBoard(board);
        });
      });
    };
  }

  function guardMutation(fnName, blockedReturn){
    if(typeof window[fnName] !== 'function') return;
    var original = window[fnName];
    window[fnName] = function(){
      if(!_lfMutationAllowed(fnName, arguments)){
        readOnlyMsg();
        return blockedReturn;
      }
      return original.apply(this, arguments);
    };
  }

  [
    'openKBNew',
    'saveKBCard',
    'moveCard',
    '_kbMoveCard',
    'editKBFromDet',
    'ctxEdit',
    'promptDeleteKB',
    'confirmDeleteKBReason',
    'convertToNeg',
    'assumeLead',
    'openTransferKB',
    'confirmTransferAndMaybeMove',
    'discardKB',
    // FIX (2026-07-22): descarte via detail e menu de contexto não estavam bloqueados
    'discardKBFromDet',
    'ctxDiscard',
    'confirmDiscard'
  ].forEach(function(name){ guardMutation(name, null); });

  setTimeout(function(){
    try{
      if(isSupervisorReadonly()){
        if(typeof window.renderKBConsBar === 'function'){
          window.renderKBConsBar('leads');
          window.renderKBConsBar('negocios');
        }
        if(typeof window.renderKBLocal === 'function'){
          window.renderKBLocal('leads');
          window.renderKBLocal('negocios');
        }
      }
    }catch(_e){}
  }, 0);
})();
