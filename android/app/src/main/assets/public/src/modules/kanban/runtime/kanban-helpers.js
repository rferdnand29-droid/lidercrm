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

  /* [FIX 20260820] Pipeline de Negócios exclusivo do cargo Administrativo
     — pedido explícito, 9 etapas próprias, nada a ver com o funil de
     vendas padrão acima. IDs novos (prefixo "adm_"), nunca reaproveitando
     os IDs do pipeline padrão (fich/aprov/fecham/fechado/etc já têm
     significado próprio noutros lugares — métricas do Analytics, sync do
     Bingo, etapas terminais — usar os mesmos IDs aqui contaminaria esses
     cálculos com dado de um processo completamente diferente). Ver
     kbCols() logo abaixo — resolve qual pipeline mostrar pelo cargo do
     DONO do card sendo visto, não de quem está logado (um ADM vendo o
     board de um Administrativo específico também vê este pipeline). */
  var KB_NEG_COLS_ADMINISTRATIVO = [
    {id:'adm_ficha',label:'Ficha/Cadastro',cls:'c-adm-ficha'},
    {id:'adm_pendencia',label:'Pendências Cadastrais',cls:'c-adm-pendencia'},
    {id:'adm_confirmacao',label:'Confirmação de Dados',cls:'c-adm-confirmacao'},
    {id:'adm_aprovado',label:'Aprovados',cls:'c-adm-aprovado'},
    {id:'adm_fechamento',label:'Fechamentos',cls:'c-adm-fechamento'},
    {id:'adm_enrolado',label:'Clientes Enrolados',cls:'c-adm-enrolado'},
    {id:'adm_venda_concluida',label:'Venda Concluída',cls:'c-adm-venda-concluida'},
    {id:'adm_cancelado',label:'Cancelados',cls:'c-adm-cancelado'},
    {id:'adm_posvenda',label:'Setor de Pós-Venda',cls:'c-adm-posvenda'}
  ];

  var KB_NEG_RESTRICTED_TARGET = ['fich','aprov','fecham','fechado']; // não usado mais — ver _kbCardLocked
  var KB_NEG_LOCKED_SOURCE = ['fich','aprov','fecham','fechado','vidp']; // não usado mais — ver _kbCardLocked
  var STAGE_COLORS = {
    novo:'#1a1a1f',tent:'#36c6f0',whats:'#1B8A5E',livre:'#2f4fa0',conv:'#27ae60',desc:'#c0392b',
    retag:'#d4b106',agvid:'#36c6f0',presencial:'#1B8A5E',reag:'#36c6f0',cart:'#3a6fe0',
    vidp:'#7a5230',fich:'#d9491f',aprov:'#2ecfa0',fecham:'#1a4a0a',fechado:'#0a2a05',noshow:'#7b1d1d',
    adm_ficha:'#3a6fe0',adm_pendencia:'#d4b106',adm_confirmacao:'#36c6f0',adm_aprovado:'#2ecfa0',
    adm_fechamento:'#1a4a0a',adm_enrolado:'#7a5230',adm_venda_concluida:'#0a2a05',
    adm_cancelado:'#7b1d1d',adm_posvenda:'#5b3fa0'
  };

  /* [FIX 20260820] Pedido explícito: remover a trava de movimentação —
     antes, ao chegar em Vídeo/Loja (vidp), só o cargo "gestor" conseguia
     mover o card pra qualquer outra etapa (KB_NEG_LOCKED_SOURCE incluía
     'vidp'); e mover PRA fich/aprov/fecham/fechado também era exclusivo
     de gestor (KB_NEG_RESTRICTED_TARGET). Agora qualquer usuário pode
     mover livremente, em qualquer direção, sem limitação — os arrays
     acima ficam só de referência histórica, sem uso. */
  function _kbCardLocked(board,col,mode){
    return false;
  }
  function _kbStageReadOnly(board,col){
    var role = (typeof global.getMyRole==='function' ? global.getMyRole() : '');
    return board === 'negocios' && col === 'vidp' && role !== 'gestor';
  }
  function stageColor(id){ return STAGE_COLORS[id] || '#3a3f4a'; }
  /* [FIX 20260820] Mesma assinatura de detecção de cargo já usada em
     lf-agenda-department-scope-v1/lf-administrativo-hide-tabs-v1/
     assertNotAdministrativo (Worker) — leads:'none'+negocios:'crud' é
     única do cargo Administrativo, conferida na tabela CARGO_CAPS. */
  function _kbOwnerIsAdministrativo(uid){
    if(!uid) return false;
    try{
      if(typeof global.getCargoCaps==='function'){
        var caps=global.getCargoCaps(uid);
        return !!(caps && caps.leads==='none' && caps.negocios==='crud');
      }
    }catch(_e){}
    return false;
  }
  function kbCols(board){
    if(board==='leads') return KB_LEADS_COLS;
    // Resolve de quem é o board sendo mostrado: se um detalhe de Negócios
    // está aberto, usa o dono DAQUELE card (_kbDetOwnerUid); senão, o
    // dono do board atualmente em foco (activeUID — já cobre o "ver como"
    // de ADM/supervisor olhando o board de outra pessoa).
    var ownerUid=null;
    try{
      if(typeof global._kbDetBoard!=='undefined' && global._kbDetBoard===board &&
         typeof global._kbDetOwnerUid!=='undefined' && global._kbDetOwnerUid){
        ownerUid=global._kbDetOwnerUid;
      } else if(typeof global.activeUID==='function'){
        ownerUid=global.activeUID(board);
      }
    }catch(_e){}
    return _kbOwnerIsAdministrativo(ownerUid) ? KB_NEG_COLS_ADMINISTRATIVO : KB_NEG_COLS;
  }
  function kbKeyFor(board, uid){ return 'lf6_kb_' + board + '_' + uid; }
  function getKB(board){ if(!global.S||!global.S.userId)return []; return global.sg(kbKeyFor(board, global.S.userId)) || []; }
  function getKBFor(board, uid){ return global.sg(kbKeyFor(board, uid)) || []; }
  function _mergeKeepLocalOnly(serverList, localList){
    serverList = serverList || [];
    localList = localList || [];
    // Ignora, no servidor, qualquer id marcado como excluido ha pouco (ver
    // _lfMarkRecentlyDeleted logo abaixo) -- sem isso, uma resposta de rede
    // que ja estava em voo ANTES da exclusao local chega DEPOIS dela e
    // "ressuscita" o item aqui (e pior: como merged.length!==server.length
    // fica verdadeiro, o item ressuscitado e regravado no servidor pelo
    // chamador, tornando a ressurreicao permanente ate excluir de novo --
    // e vulneravel a mesma corrida outra vez). Isso vale tanto pra
    // Clientes/Bingo (loadCli, js/auth.js) quanto pra Kanban (js/kanban.js),
    // que compartilham esta mesma funcao de merge.
    if(typeof global._lfIsRecentlyDeleted==='function'){
      serverList = serverList.filter(function(item){
        return !(item && item.id && global._lfIsRecentlyDeleted(item.id));
      });
    }
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
      // [FIX 20261008] CAUSA RAIZ de "atividade concluída volta a
      // aparecer como atrasada": até aqui, a decisão acima troca o
      // CARD INTEIRO (local vs. servidor) só pelo updatedAt do card —
      // isso não tem NENHUMA relação com o estado de cada atividade
      // dentro de card.activities. Se o servidor "vencer" (updatedAt
      // dele empatado ou mais novo, por qualquer motivo — outro campo
      // mudou, outro dispositivo salvou algo não relacionado), o
      // card.activities inteiro dele substitui o local — incluindo
      // qualquer atividade que o servidor ainda não processou como
      // concluída (o PUT da conclusão é assíncrono). Corrigido: depois
      // de decidir qual card vence, funde à parte o array activities,
      // preservando done:true de qualquer atividade marcada como
      // "concluída recentemente" no registro persistente — não importa
      // de qual lado (local ou servidor) o card em si veio.
      if(typeof global._lfIsRecentlyDone==='function'){
        var winner = serverMap[item.id];
        var winnerActs = Array.isArray(winner.activities) ? winner.activities : null;
        var localActs = Array.isArray(item.activities) ? item.activities : null;
        if(winnerActs && localActs){
          var localActsById = {};
          localActs.forEach(function(la){ if(la && la.id) localActsById[la.id] = la; });
          var touched = false;
          var mergedActs = winnerActs.map(function(wa){
            if(!wa || !wa.id) return wa;
            var recentlyDone = global._lfIsRecentlyDone(wa.id);
            var laDone = localActsById[wa.id] && localActsById[wa.id].done;
            if((recentlyDone || laDone) && !wa.done){
              touched = true;
              return Object.assign({}, wa, {
                done: true,
                doneAt: (localActsById[wa.id] && localActsById[wa.id].doneAt) || wa.doneAt || new Date().toISOString(),
              });
            }
            return wa;
          });
          if(touched){
            winner = Object.assign({}, winner, { activities: mergedActs });
            serverMap[item.id] = winner;
          }
        }
      }
    });
    // Reconstrói lista preservando a ORDEM LOCAL já exibida na tela —
    // não a ordem que o servidor devolveu. Sem isso, cards sem
    // manualOrder (a maioria — nunca foram arrastados manualmente)
    // podiam trocar de posição visual sozinhos a cada sincronização de
    // 15s: se a consulta ao banco não garante ordem estável entre
    // buscas sucessivas, o desempate por ordem de entrada do array
    // (usado por _sortCardsForColumn pra cards com datas de criação
    // próximas) mudava mesmo com os MESMOS cards, sem nenhuma
    // alteração real — o "tremor permanente" relatado.
    var merged=[];
    var _seenIds={};
    localList.forEach(function(item){
      if(!item||!item.id)return;
      if(serverMap[item.id]){merged.push(serverMap[item.id]);_seenIds[item.id]=true;}
    });
    // Itens genuinamente novos (chegaram agora, sem posição local
    // ainda) — só estes usam a ordem do servidor, por não terem outra
    // referência de posição.
    serverList.forEach(function(item){
      if(item&&item.id&&!_seenIds[item.id]){merged.push(serverMap[item.id]||item);_seenIds[item.id]=true;}
    });
    // Corrigido: extra = locais que não estão no server original
    var serverOrigIds = {};
    serverList.forEach(function(item){ if(item && item.id) serverOrigIds[item.id] = true; });
    var extra = localList.filter(function(item){ return item && item.id && !serverOrigIds[item.id]; });
    return extra.length ? merged.concat(extra) : merged;
  }

  /* ===== Registro curto de "excluido recentemente" (2026-08-16) =====
     [FIX 20260909 — DEFINITIVO, pedido explícito "quero isso corrigido
     de uma vez"] Esta função tinha sua PRÓPRIA implementação completa,
     duplicada da de js/utils.js, com uma chave de armazenamento
     DIFERENTE (lf6_recently_deleted_ids vs lf_recently_deleted_ids_v1).
     Numa correção anterior (20260902) alinhamos só o TTL das duas (7
     dias nas duas) — mas a duplicação em si continuava existindo, um
     risco de nova divergência no futuro. Agora não existe mais versão
     própria aqui: js/utils.js carrega ANTES deste módulo e já expõe
     window._lfMarkRecentlyDeleted/_lfIsRecentlyDeleted globalmente —
     _mergeKeepLocalOnly (abaixo) já usa global._lfIsRecentlyDeleted
     diretamente. Uma função, uma chave de armazenamento, impossível
     divergir de novo. */
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
  function _collectAllCardsForDup(scopedUids){
    var users = (typeof global.getUsers === 'function' ? global.getUsers() : []).filter(function(u){ return u.ativo; });
    if(Array.isArray(scopedUids)){
      var allowed={};scopedUids.forEach(function(id){if(id)allowed[id]=true;});
      users=users.filter(function(u){return allowed[u.id];});
    }
    var all = [];
    users.forEach(function(u){
      ['leads','negocios'].forEach(function(board){
        getKBFor(board, u.id).forEach(function(c){
          // [FIX 20260822] Prioridade máxima (spec "Bitrix24 duplicados"):
          // Lead com etapa "Convertido" (col==='conv') sai da varredura de
          // duplicados — não é um registro ativo do funil, é o histórico
          // de origem do Negócio que já existe (negócio.originalLeadId
          // aponta de volta pra ele). Comparar os dois como se fossem
          // pessoas diferentes é o bug relatado: conversão não é
          // duplicação, são o MESMO cliente em estágios diferentes.
          if(board==='leads'&&c&&c.col==='conv')return;
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
      var phoneMatch = line.match(/\(?\d[\d\s\-()]{7,}\d/);
      var tel = phoneMatch ? phoneMatch[0].replace(/\D/g,'') : '';
      var name = line.replace(/\(?\d[\d\s\-()]{7,}\d/,'').replace(/[,;-]/g,' ').trim().replace(/\s{2,}/g,' ').trim();
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
  global.KB_NEG_COLS_ADMINISTRATIVO = KB_NEG_COLS_ADMINISTRATIVO;
  global._kbOwnerIsAdministrativo = _kbOwnerIsAdministrativo;
  global.KB_NEG_RESTRICTED_TARGET = KB_NEG_RESTRICTED_TARGET;
  global.KB_NEG_LOCKED_SOURCE = KB_NEG_LOCKED_SOURCE;
  global._kbStageReadOnly = _kbStageReadOnly;
  // compatibilidade
  global.KB_NEG_RESTRICTED = KB_NEG_RESTRICTED_TARGET;
  global.STAGE_COLORS = STAGE_COLORS;

  kanban.runtime = {
    KB_LEADS_COLS: KB_LEADS_COLS,
    KB_NEG_COLS: KB_NEG_COLS,
    KB_NEG_COLS_ADMINISTRATIVO: KB_NEG_COLS_ADMINISTRATIVO,
    _kbOwnerIsAdministrativo: _kbOwnerIsAdministrativo,
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
