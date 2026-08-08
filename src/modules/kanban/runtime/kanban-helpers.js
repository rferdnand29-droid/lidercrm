(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var kanban = modules.kanban = modules.kanban || {};

  var KB_LEADS_COLS = [
    {id:'novo',label:'Novo Lead',cls:'c-novo'},
    {id:'tent',label:'2° Tentativa',cls:'c-tent'},
    {id:'whats',label:'WhatsApp',cls:'c-whats'},
    {id:'livre',label:'Lead Livre',cls:'c-livre'},
    {id:'conv',label:'Convertido',cls:'c-conv'},
    {id:'desc',label:'Descartado',cls:'c-desc'}
  ];

  var KB_NEG_COLS = [
    {id:'retag',label:'Retornar',cls:'c-retag'},
    {id:'agvid',label:'AG Vídeo',cls:'c-agvid'},
    {id:'presencial',label:'Presencial',cls:'c-presencial'},
    {id:'reag',label:'Reagendar',cls:'c-reag'},
    {id:'cart',label:'Cartela',cls:'c-cart'},
    {id:'vidp',label:'Video/Loja',cls:'c-vidp'},
    {id:'fich',label:'Liberação de Ficha',cls:'c-fich'},
    {id:'aprov',label:'Cliente Aprovado',cls:'c-aprov'},
    {id:'fecham',label:'Fechamento',cls:'c-fecham'},
    {id:'fechado',label:'Fechado',cls:'c-fechado'},
    {id:'noshow',label:'No-Show/Desistencia',cls:'c-noshow'}
  ];

  var KB_NEG_RESTRICTED_TARGET = ['fich','aprov','fecham','fechado'];
  var KB_NEG_LOCKED_SOURCE = ['fich','aprov','fecham','fechado','vidp'];
  var STAGE_COLORS = {
    novo:'#1a1a1f',tent:'#36c6f0',whats:'#1B8A5E',livre:'#2f4fa0',conv:'#27ae60',desc:'#c0392b',
    retag:'#d4b106',agvid:'#36c6f0',presencial:'#1B8A5E',reag:'#36c6f0',cart:'#3a6fe0',
    vidp:'#7a5230',fich:'#d9491f',aprov:'#2ecfa0',fecham:'#1a4a0a',fechado:'#0a2a05',noshow:'#7b1d1d'
  };

  function _kbCardLocked(board,col,mode){
    var role = (typeof global.getMyRole==='function' ? global.getMyRole() : '');
    if(board!=='negocios' || role==='gestor') return false;

    // mode:
    // 'target' => pode entrar nessa etapa?
    // 'from'   => pode sair dessa etapa?
    if(mode === 'target'){
      return KB_NEG_RESTRICTED_TARGET.indexOf(col) >= 0;
    }
    return KB_NEG_LOCKED_SOURCE.indexOf(col) >= 0;
  }
  function _kbStageReadOnly(board,col){
    var role = (typeof global.getMyRole==='function' ? global.getMyRole() : '');
    return board === 'negocios' && col === 'vidp' && role !== 'gestor';
  }
  function stageColor(id){ return STAGE_COLORS[id] || '#3a3f4a'; }
  function kbCols(board){ return board==='leads' ? KB_LEADS_COLS : KB_NEG_COLS; }
  function kbKeyFor(board, uid){ return 'lf6_kb_' + board + '_' + uid; }
  function getKB(board){ if(!global.S||!global.S.userId)return []; return global.sg(kbKeyFor(board, global.S.userId)) || []; }
  function getKBFor(board, uid){ return global.sg(kbKeyFor(board, uid)) || []; }
  function _mergeKeepLocalOnly(serverList, localList){
    serverList = serverList || [];
    localList = localList || [];
    // Constrói mapa id -> item do servidor
    var serverMap = {};
    serverList.forEach(function(item){ if(item && item.id) serverMap[item.id] = item; });
    // Para cada item local: se não existe no servidor, inclui (upload pendente);
    // se existe, compara updatedAt e mantém a versão mais recente.
    var localMap = {};
    localList.forEach(function(item){
      if(!item || !item.id) return;
      localMap[item.id] = item;
      if(!serverMap[item.id]) return; // extra local — já tratado abaixo
      var sv = serverMap[item.id].updatedAt || serverMap[item.id].createdAt || '';
      var lv = item.updatedAt || item.createdAt || '';
      if(lv > sv) serverMap[item.id] = item; // local mais recente: sobrescreve server
    });
    // Reconstrói lista: todos os do servidor (já com locais mais novos injetados)
    // + locais que não existem no servidor (upload pendente)
    var merged = serverList.map(function(item){
      return (item && item.id && serverMap[item.id]) ? serverMap[item.id] : item;
    });
    var extra = localList.filter(function(item){ return item && item.id && !serverMap[item.id] || (item && item.id && !Object.keys(serverMap).length); });
    // Corrigido: extra = locais que não estão no server original
    var serverOrigIds = {};
    serverList.forEach(function(item){ if(item && item.id) serverOrigIds[item.id] = true; });
    extra = localList.filter(function(item){ return item && item.id && !serverOrigIds[item.id]; });
    return extra.length ? merged.concat(extra) : merged;
  }
  function _kbWorkerClient(){
    var wc = root && root.api && root.api.workerClient;
    return (root && root.config && root.config.useWorkerApi && wc && typeof wc.saveKanbanList === 'function') ? wc : null;
  }
  function _colLabel(board,colId){
    var c=kbCols(board).find(function(x){return x.id===colId;});
    return c?c.label:colId;
  }
  function _kbDiscardReasonLabel(motivo){
    var mL={ja_comprou:'Já comprou',sem_interesse:'Sem interesse',em_tratativa:'Em tratativa'};
    return mL[motivo]||motivo||'Motivo não informado';
  }
  function _afterEl(container,y){
    var els=Array.from(container.querySelectorAll('.kb-card:not(.dragging)'));
    return els.reduce(function(cl,el){
      var b=el.getBoundingClientRect();
      var off=y-b.top-b.height/2;
      return off<0&&off>cl.offset?{offset:off,el:el}:cl;
    },{offset:Number.NEGATIVE_INFINITY,el:null}).el;
  }

  // Extraído nesta rodada (7) de js/kanban.js — varre Leads+Negócios de todos os
  // usuários ativos e retorna uma lista achatada de cada card, anotado com
  // {board,ownerUid,ownerName}. Não toca em DOM; só depende de getUsers()/getKBFor()
  // (globais já resolvidos em tempo de chamada, mesmo padrão de _kbWorkerClient acima).
  function _collectAllCardsForDup(){
    var users = (typeof global.getUsers === 'function' ? global.getUsers() : []).filter(function(u){ return u.ativo; });
    var all = [];
    users.forEach(function(u){
      ['leads','negocios'].forEach(function(board){
        getKBFor(board, u.id).forEach(function(c){
          all.push({card:c, board:board, ownerUid:u.id, ownerName:u.nome});
        });
      });
    });
    return all;
  }

  // Extraído nesta rodada (7) de js/kanban.js — conta quantos OUTROS cards (em
  // Leads/Negócios, de qualquer consultor) já têm o mesmo telefone normalizado.
  function _countDuplicatePhone(telNorm){
    if(!telNorm || telNorm.length < 8) return 0;
    return _collectAllCardsForDup().filter(function(x){
      var n = (x.card.tel||'').replace(/\D/g,'');
      return n.length>=8 && n===telNorm;
    }).length;
  }

  // Extraído nesta rodada (7) de js/kanban.js (função parseImport) — a parte
  // puramente textual (separar telefone de nome em cada linha colada) foi isolada
  // da manipulação de DOM (que continua em parseImport, em js/kanban.js), sem
  // alterar nenhuma regra de parsing existente.
  function parseContactLines(txt){
    var lines = (txt||'').split(/[\n;]+/).map(function(l){ return l.trim(); }).filter(Boolean);
    var out = [];
    lines.forEach(function(line){
      var phoneMatch = line.match(/\(?\d[\d\s\-\(\)]{7,}\d/);
      var tel = phoneMatch ? phoneMatch[0].replace(/\D/g,'') : '';
      var name = line.replace(/\(?\d[\d\s\-\(\)]{7,}\d/,'').replace(/[,;\-]/g,' ').trim().replace(/\s{2,}/g,' ').trim();
      if(name.length>1) out.push({name:name, tel:tel});
    });
    return out;
  }


  // R14-01: expor funções ao escopo global — estas funções são chamadas diretamente por
  // js/kanban.js, js/dashboard.js, js/relatorios.js, js/clientes.js, js/agenda.js como
  // globais (getKB, getKBFor, kbKeyFor, etc.). Sem expô-las em window.*,
  // os outros módulos não as encontram e o CRM quebra silenciosamente.
  global.kbKeyFor = kbKeyFor;
  global.getKB = getKB;
  global.getKBFor = getKBFor;
  global.kbCols = kbCols;
  global.stageColor = stageColor;
  global._kbCardLocked = _kbCardLocked;
  global._mergeKeepLocalOnly = _mergeKeepLocalOnly;
  global._kbWorkerClient = _kbWorkerClient;
  global._colLabel = _colLabel;
  global._kbDiscardReasonLabel = _kbDiscardReasonLabel;
  global._afterEl = _afterEl;
  global._collectAllCardsForDup = _collectAllCardsForDup;
  global._countDuplicatePhone = _countDuplicatePhone;
  global.parseContactLines = parseContactLines;
  global.KB_LEADS_COLS = KB_LEADS_COLS;
  global.KB_NEG_COLS = KB_NEG_COLS;
  global.KB_NEG_RESTRICTED_TARGET = KB_NEG_RESTRICTED_TARGET;
  global.KB_NEG_LOCKED_SOURCE = KB_NEG_LOCKED_SOURCE;
  global._kbStageReadOnly = _kbStageReadOnly;
  // compatibilidade
  global.KB_NEG_RESTRICTED = KB_NEG_RESTRICTED_TARGET;
  global.STAGE_COLORS = STAGE_COLORS;

  kanban.runtime = {
    KB_LEADS_COLS: KB_LEADS_COLS,
    KB_NEG_COLS: KB_NEG_COLS,
    KB_NEG_RESTRICTED_TARGET: KB_NEG_RESTRICTED_TARGET,
    KB_NEG_LOCKED_SOURCE: KB_NEG_LOCKED_SOURCE,
    KB_NEG_RESTRICTED: KB_NEG_RESTRICTED_TARGET,
    STAGE_COLORS: STAGE_COLORS,
    _kbCardLocked: _kbCardLocked,
    _kbStageReadOnly: _kbStageReadOnly,
    stageColor: stageColor,
    kbCols: kbCols,
    kbKeyFor: kbKeyFor,
    getKB: getKB,
    getKBFor: getKBFor,
    _mergeKeepLocalOnly: _mergeKeepLocalOnly,
    _kbWorkerClient: _kbWorkerClient,
    _colLabel: _colLabel,
    _kbDiscardReasonLabel: _kbDiscardReasonLabel,
    _afterEl: _afterEl,
    _collectAllCardsForDup: _collectAllCardsForDup,
    _countDuplicatePhone: _countDuplicatePhone,
    parseContactLines: parseContactLines
  };
})(window);
