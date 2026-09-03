(function(){
  // v2 (2026-07-22): supervisor pode mutar os PRÓPRIOS cards;
  // read-only vale apenas quando o alvo pertence a outro membro do time.
  if(window.__LF_SUP_TEAM_VIEW_RO_V1__) return;
  window.__LF_SUP_TEAM_VIEW_RO_V1__ = true;

  function isSupervisor(){
    try{
      return (typeof window.hasSupervisorAccess==='function' && window.hasSupervisorAccess()) &&
             !(typeof window.hasAdminAccess==='function' && window.hasAdminAccess());
    }catch(_e){ return false; }
  }

  function readOnlyMsg(){
    try{
      if(typeof window.toast==='function'){
        window.toast('Supervisor: somente leitura em cards de outros membros da equipe.');
      }
    }catch(_e){}
  }

  function meUid(){ return (window.S && S.userId) || null; }

  // Descobre o dono efetivo do card a partir dos argumentos da função interceptada.
  // Retorna null quando não conseguimos determinar (nesse caso NÃO bloqueamos).
  function resolveOwnerFromArgs(fnName, args){
    try{
      // 1) tenta o hint que colocamos no listWithOwner
      for(var i=0;i<args.length;i++){
        var a = args[i];
        if(a && typeof a === 'object'){
          if(a._timeOwnerUid) return a._timeOwnerUid;
          if(a.ownerUid) return a.ownerUid;
          if(a.uid) return a.uid;
          if(a.userId) return a.userId;
        }
      }
      // 2) fallback: se estamos em modo team-view com um uid selecionado, é ele
      var board = null;
      for(var j=0;j<args.length;j++){
        if(args[j] === 'leads' || args[j] === 'negocios'){ board = args[j]; break; }
      }
      if(board && window._kbViewUid && window._kbViewUid[board]){
        return window._kbViewUid[board];
      }
    }catch(_e){}
    return null;
  }

  function targetIsSomeoneElse(fnName, args){
    var owner = resolveOwnerFromArgs(fnName, args);
    if(!owner) return false;            // desconhecido → deixa passar
    return owner !== meUid();
  }

  function getTeamUsers(){
    var me = meUid();
    var list = [];
    try{
      if(typeof window.getDepartmentVisibleUsers === 'function'){
        list = window.getDepartmentVisibleUsers(me) || [];
      }else if(typeof window.getUsers === 'function'){
        list = (window.getUsers() || []).filter(function(u){ return u && u.ativo !== false; });
      }
    }catch(_e){ list = []; }

    var seen = {}, out = [];
    function push(u){
      if(!u || !u.id || seen[u.id]) return;
      seen[u.id] = 1;
      out.push(u);
    }
    if(me) push({ id: me, nome: (window.S && S.nome) || 'Eu', ativo: true });
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

  function renderTeamBoard(board){
    if(!window.S || !S.userId) return;
    var wrap = getWrap(board);
    if(!wrap) return;

    if(typeof window._bindKBDragAutoShell === 'function'){
      window._bindKBDragAutoShell(board, wrap);
    }

    var me = meUid();
    window._kbViewUid = window._kbViewUid || { leads: null, negocios: null };
    var selectedUid = window._kbViewUid[board] || null;

    // Padrão: supervisor abre no próprio pipeline (editável) quando nenhum membro
    // está selecionado ainda. Evita o estado inicial todo-readonly que aparecia
    // antes do self-default patch ter uma chance de rodar.
    if (!selectedUid) {
      selectedUid = me;
      window._kbViewUid[board] = me;
    }

    // Editável no próprio pipeline; readonly quando vendo outro membro.
    var readonly = (selectedUid !== me);
    var finalList = [];

    if(selectedUid){
      finalList = listWithOwner(board, selectedUid);
      if(typeof window._buildKB === 'function'){
        window._buildKB(board, finalList, wrap, selectedUid, readonly);
      }
    }else{
      getTeamUsers().forEach(function(u){
        listWithOwner(board, u.id).forEach(function(card){ finalList.push(card); });
      });
      if(typeof window._buildKB === 'function'){
        window._buildKB(board, finalList, wrap, null, true); // "Todos" = readonly
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
      var isAdm = (typeof window.hasAdminAccess === 'function') && window.hasAdminAccess(S.userId);
      // FIX (2026-08-03): admin sempre respeitava o uid selecionado
      // (_kbViewUid) como active uid — supervisor com foreign='edit'
      // (ex.: departamento liberado pelo ADM) precisa do mesmo
      // comportamento, senão as ações no board de um colega agem
      // "como se fosse" o próprio supervisor.
      if((isAdm || canEditForeign()) && window._kbViewUid && _kbViewUid[board]){
        return _kbViewUid[board];
      }
      if(isSupervisor()) return S.userId;
      return _origActiveUID.call(this, board);
    };
  }

  if(typeof window.renderKBConsBar === 'function'){
    var _origRenderKBConsBar = window.renderKBConsBar;
    window.renderKBConsBar = function(board){
      var el = document.getElementById(board + '-cons-bar');
      if(!el) return;

      var isAdm = (typeof window.hasAdminAccess === 'function') && window.hasAdminAccess();
      var isSup = isSupervisor();

      if(!isAdm && !isSup){ el.innerHTML = ''; return; }
      if(!isSup) return _origRenderKBConsBar.call(this, board);

      var users = getTeamUsers();
      var cur = window._kbViewUid ? _kbViewUid[board] : null;
      var boardJs = (typeof window._jsSq === 'function') ? window._jsSq(board) : board;
      var html = '<span style="font-size:.65rem;color:var(--mu);margin-right:4px">Ver:</span>' +
        '<button class="kb-cons-chip' + (cur === null ? ' on' : '') + '" onclick="setKBView(\'' + boardJs + '\',null,this)">Todos</button>';

      users.forEach(function(u){
        if(!u || !u.id) return;
        var uidJs = (typeof window._jsSq === 'function') ? window._jsSq(u.id) : u.id;
        var nome = (u.nome || u.id).split(' ')[0];
        var isMe = u.id === meUid();
        html += '<button class="kb-cons-chip' + (cur === u.id ? ' on' : '') + '" onclick="setKBView(\'' + boardJs + '\',\'' + uidJs + '\',this)">' +
                ((typeof window.eH === 'function') ? window.eH(nome) : nome) +
                (isMe ? ' ✎' : '') + '</button>';
      });

      el.innerHTML = html;
    };
  }

  if(typeof window.renderKBLocal === 'function'){
    var _origRenderKBLocal = window.renderKBLocal;
    window.renderKBLocal = function(board){
      if(isSupervisor()) return renderTeamBoard(board);
      return _origRenderKBLocal.call(this, board);
    };
  }

  if(typeof window._syncKBRemoteBG === 'function'){
    var _origSyncKBRemoteBG = window._syncKBRemoteBG;
    window._syncKBRemoteBG = function(board){
      if(!isSupervisor()) return _origSyncKBRemoteBG.call(this, board);

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
      if(!pending){ renderTeamBoard(board); return; }

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
            console.warn('[lf-supervisor-teamview-readonly v2] sync falhou', e);
            if(typeof window.syncErr === 'function') window.syncErr(e);
          }catch(_e){}
        }).then(function(){
          pending--;
          if(pending <= 0) renderTeamBoard(board);
        });
      });
    };
  }

  // FIX (2026-08-03): guardMutation bloqueava QUALQUER supervisor
  // editando card de outro membro, sem checar caps.foreign — mesmo
  // pra cargos com foreign='edit' (supervisor, desde a correção de
  // hoje em CARGO_CAPS; gerente/gestor já eram assim antes). _buildKB
  // logo abaixo já fazia essa checagem só pro RENDER (esconder o
  // cadeado visual) — mas as funções de mutação continuavam
  // bloqueando de verdade, dando a experiência confusa de "parece
  // editável mas a ação falha com toast de somente-leitura".
  function canEditForeign(){
    try{
      var caps=(typeof window.getCargoCaps==='function') ? window.getCargoCaps() : null;
      return !!(caps && caps.foreign==='edit' && caps.escopo!=='self');
    }catch(_e){ return false; }
  }

  // Guard seletivo: só bloqueia quando o alvo é de OUTRO usuário E o
  // cargo não tem permissão de editar cards de fora (foreign='edit').
  function guardMutation(fnName, blockedReturn){
    if(typeof window[fnName] !== 'function') return;
    var original = window[fnName];
    window[fnName] = function(){
      if(isSupervisor() && !canEditForeign() && targetIsSomeoneElse(fnName, arguments)){
        readOnlyMsg();
        return blockedReturn;
      }
      return original.apply(this, arguments);
    };
  }

  // openKBNew NUNCA é bloqueado — supervisor sempre pode criar no próprio pipeline.
  // assumeLead também liberado (é justamente a ação que traz o lead pra ele).
  [
    'saveKBCard',
    'moveCard','_kbMoveCard',
    'editKBFromDet','ctxEdit',
    'promptDeleteKB','confirmDeleteKBReason',
    'convertToNeg',
    'openTransferKB','confirmTransferAndMaybeMove',
    'discardKB','discardKBFromDet','ctxDiscard','confirmDiscard'
  ].forEach(function(name){ guardMutation(name, null); });

  // ---------------------------------------------------------------
  // Gerente / Gestor (foreign=edit, escopo≠self): garante que
  // _buildKB nunca renderize readonly=true para esses cargos.
  // Incorporado de lf-gerente-peers-edit (removido 2026-07-23).
  // Idempotente — a guarda do IIFE pai já cobre este bloco.
  // ---------------------------------------------------------------
  if (typeof window._buildKB === 'function') {
    var _origBuildKB = window._buildKB;
    window._buildKB = function(board, list, wrap, ownerUid, readOnly) {
      if (readOnly === true) {
        try {
          var caps = (typeof window.getCargoCaps === 'function') ? window.getCargoCaps() : null;
          // Cargos com permissão de editar cards de outros (foreign=edit)
          // nunca devem ser bloqueados por readonly vindo de código legado.
          if (caps && caps.foreign === 'edit' && caps.escopo !== 'self') {
            readOnly = false;
          }
        } catch(_e) {}
      }
      return _origBuildKB.call(this, board, list, wrap, ownerUid, readOnly);
    };
  }

  setTimeout(function(){
    try{
      if(isSupervisor()){
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
