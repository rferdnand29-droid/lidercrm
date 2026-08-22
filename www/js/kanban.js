/* =====================================================================
 * kanban.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

var __kanbanRuntime=(((window.LiderCRM||{}).modules||{}).kanban||{}).runtime||{};
var KB_LEADS_COLS=__kanbanRuntime.KB_LEADS_COLS||[];
var KB_NEG_COLS=__kanbanRuntime.KB_NEG_COLS||[];
var KB_NEG_COLS_ADMINISTRATIVO=__kanbanRuntime.KB_NEG_COLS_ADMINISTRATIVO||[];
var _kbOwnerIsAdministrativo=__kanbanRuntime._kbOwnerIsAdministrativo||function(){return false;};
var KB_NEG_RESTRICTED=__kanbanRuntime.KB_NEG_RESTRICTED||[];
var KB_NEG_RESTRICTED_TARGET=__kanbanRuntime.KB_NEG_RESTRICTED_TARGET||KB_NEG_RESTRICTED;
var KB_NEG_LOCKED_SOURCE=__kanbanRuntime.KB_NEG_LOCKED_SOURCE||KB_NEG_RESTRICTED;
var STAGE_COLORS=__kanbanRuntime.STAGE_COLORS||{};
var _kbCardLocked=__kanbanRuntime._kbCardLocked||function(){return false;};
var _kbStageReadOnly=__kanbanRuntime._kbStageReadOnly||function(){return false;};
var stageColor=__kanbanRuntime.stageColor||function(){return '#888';};
var kbCols=__kanbanRuntime.kbCols||function(){return [];};
var kbKeyFor=__kanbanRuntime.kbKeyFor||function(b,u){return 'lf6_kb_'+b+'_'+(u||'');};
var getKB=__kanbanRuntime.getKB||function(){return [];};
var getKBFor=__kanbanRuntime.getKBFor||function(){return [];};
var _mergeKeepLocalOnly=__kanbanRuntime._mergeKeepLocalOnly||function(a){return a;};
var _kbWorkerClient=__kanbanRuntime._kbWorkerClient||function(){return null;};
var _colLabel=__kanbanRuntime._colLabel||function(b,c){return c||'';};
var _kbDiscardReasonLabel=__kanbanRuntime._kbDiscardReasonLabel||function(r){return r||'';};
var _afterEl=__kanbanRuntime._afterEl||function(){};
var _collectAllCardsForDup=__kanbanRuntime._collectAllCardsForDup||function(){return [];};
var _countDuplicatePhone=__kanbanRuntime._countDuplicatePhone||function(){return 0;};
var parseContactLines=__kanbanRuntime.parseContactLines||function(t){return [{name:t,tel:''}];};

function saveKB(b,list){
  if(!S||!S.userId){console.warn('[kb] saveKB: sessão não iniciada');return false;}
  var localOk=ss(kbKeyFor(b,S.userId),list);
  var wc=_kbWorkerClient();
  /* LF-KB-SAVE-RETRY-20260819: gravação remota falhava em silêncio e o
     quadro "voltava" ao estado antigo no próximo deploy/reload. Agora há
     1 retry automático (1,5s) e aviso visível se falhar de vez. */
  function _trySave(attempt){
    var p=wc?wc.saveKanbanList(b,S.userId,list)
            :(DB_MODE==='firebase'&&db?db.collection('kb_'+b).doc(S.userId).set({list:list,ts:Date.now()}):Promise.resolve(null));
    if(!wc&&!(DB_MODE==='firebase'&&db))return;
    syncBusy();
    p.then(syncOk).catch(function(e){
      if(attempt<2){setTimeout(function(){_trySave(attempt+1);},1500);}
      else{syncErr();try{if(typeof toast==='function')toast('⚠️ Não consegui salvar na nuvem. Verifique a internet e tente de novo.',5000);}catch(_e){}}
    });
  }
  _trySave(1);
  return localOk;
}

function saveKBFor(b,uid,list,onRemoteDone){
  /* FIX 2026-07-28: aceita callback opcional para saber quando o PUT remoto terminou.
     Usado por _kbTransferCard para SERIALIZAR os dois PUTs (destino -> origem) e
     eliminar o race que reintroduzia o card na origem no próximo _syncKBRemoteBG. */
  var localOk=ss(kbKeyFor(b,uid),list);
  /* LF-FIX-3BUGS-v1-20260819 #3: publica a mudanca para as outras guias da mesma origem.
     localStorage ja e compartilhado — a guia nova so precisa re-ler a chave
     e re-renderizar, sem rede. */
  try{
    window.__LF_KB_BC__=window.__LF_KB_BC__||(('BroadcastChannel' in window)?new BroadcastChannel('lf_kb_v1'):null);
    if(window.__LF_KB_BC__)window.__LF_KB_BC__.postMessage({t:'kb',board:b,uid:uid});
  }catch(_e){}
  var wc=_kbWorkerClient();
  var _done=(typeof onRemoteDone==='function')?onRemoteDone:function(){};
  /* LF-KB-SAVE-RETRY-20260819 (1b): a edição de lead (ex.: renomear) mostrava
     "Atualizado!" medindo só a gravação LOCAL; se o PUT remoto falhasse, o
     nome antigo voltava no próximo deploy/reload. Agora há 1 retry
     automático (1,5s) e aviso na tela se falhar de vez. */
  function _remoteSave(attempt){
    var p=wc?wc.saveKanbanList(b,uid,list)
            :db.collection('kb_'+b).doc(uid).set({list:list,ts:Date.now()});
    syncBusy();
    p.then(function(r){syncOk();_done(true,r);}).catch(function(e){
      if(attempt<2){setTimeout(function(){_remoteSave(attempt+1);},1500);}
      else{
        syncErr();
        try{if(typeof toast==='function')toast('⚠️ Não consegui salvar na nuvem. Verifique a internet e tente de novo.',5000);}catch(_e){}
        _done(false,e);
      }
    });
  }
  if(wc||(DB_MODE==='firebase'&&db)){_remoteSave(1);}
  else{ setTimeout(function(){_done(true,null);},0); }
  return localOk;
}

var _kbViewUid={leads:null,negocios:null};

// Regra de negócio única: um Lead só vai automaticamente para Livre após 3 dias completos na etapa atual.
// Centralizar o valor evita divergência entre o indicador visual e a movimentação persistida.
var KB_STALE_TO_LIVRE_DAYS=3;
var KB_STALE_TO_LIVRE_MS=KB_STALE_TO_LIVRE_DAYS*24*60*60*1000;

function activeUID(b){if(!S)return null;return(hasAdminAccess(S.userId)&&_kbViewUid[b])?_kbViewUid[b]:S.userId;}

function activeList(b){var u=activeUID(b);return u===(S&&S.userId)?getKB(b):getKBFor(b,u);}

function saveActive(b,list){var u=activeUID(b);if(u===(S&&S.userId))return saveKB(b,list);return saveKBFor(b,u,list);}

/* LF-KB-FOREIGN-EDIT-GATE-20260804
   Fonte única para decidir se o usuário logado pode abrir/editar um card de
   outro owner no Kanban canônico. Evita depender de hasAdminAccess(), que
   deixou de significar "pode editar foreign" depois da regra cargo+departamento. */
function _kbCanEditOwner(board,ownerUid){
  var me=(S&&S.userId)||'';
  if(!me) return false;
  if(!ownerUid||ownerUid===me) return true;
  try{
    if(typeof hasAdminAccess==='function'&&hasAdminAccess(me)) return true;
  }catch(_e){}
  try{
    if(typeof canEditForeign==='function') return !!canEditForeign(me,{ownerId:ownerUid,board:board});
  }catch(_e){}
  return false;
}

/* LF-KB-SCOPED-POOL-20260804
   Corrige a causa raiz do fan-out indevido: antes qualquer usuário não-ADM
   percorria TODOS os usuários ativos, o que disparava GET /kanban/list para
   owners fora do escopo e gerava cascata de 403/travamento. Agora o pool é
   derivado da função já autoritativa de escopo (getDepartmentVisibleUsers). */
function _kbAllVisibleUserPool(){
  var me=(S&&S.userId)||'';
  var users=[];
  try{
    if(typeof getDepartmentVisibleUsers==='function'){
      users=getDepartmentVisibleUsers(me)||[];
    }
  }catch(_e){ users=[]; }
  if(!Array.isArray(users)||!users.length){
    var self=(typeof getUser==='function'&&me)?getUser(me):null;
    users=self?[self]:[];
  }
  if(S&&S.userId&&!users.find(function(u){return u&&u.id===S.userId;})){
    users.unshift({id:S.userId,nome:(S.nome||S.userId),ativo:true});
  }
  var seen={};
  return users.filter(function(u){
    if(!u||!u.id||u.ativo===false) return false;
    if(seen[u.id]) return false;
    seen[u.id]=1;
    return true;
  });
}

/* Pool "Livre" vindo do servidor (LF-KANBAN-LIVRE-POOL, ver
   kanban-controller.js) — funciona pra QUALQUER usuário, não só quem já
   tem caps de leitura cross-owner. Busca em segundo plano, throttle de
   15s pra não bater no endpoint a cada render; usa o que já tiver
   (memória, depois localStorage) enquanto a busca mais recente não volta,
   igual ao padrão "pinta local, atualiza depois" usado no resto do CRM. */
var _lfLivrePoolServerCache=null,_lfLivrePoolFetching=false,_lfLivrePoolLastFetch=0;
var LF_LIVRE_POOL_MIN_INTERVAL_MS=15000;
function _lfRefreshLivrePoolFromServer(force){
  var wc=(typeof _kbWorkerClient==='function')?_kbWorkerClient():null;
  if(!wc||typeof wc.kanbanLivrePool!=='function')return;
  if(_lfLivrePoolFetching)return;
  if(!force&&(Date.now()-_lfLivrePoolLastFetch)<LF_LIVRE_POOL_MIN_INTERVAL_MS)return;
  _lfLivrePoolFetching=true;
  wc.kanbanLivrePool().then(function(pool){
    _lfLivrePoolServerCache=Array.isArray(pool)?pool:[];
    _lfLivrePoolLastFetch=Date.now();
    try{ss('lf6_livre_pool_cache',_lfLivrePoolServerCache);}catch(_e){}
    var leadsPg=document.getElementById('pg-leads');
    if(leadsPg&&leadsPg.classList.contains('on')){
      renderKBLocal('leads');
      if(typeof isMobileView==='function'&&isMobileView()&&typeof renderKBMobile==='function')renderKBMobile('leads');
    }
  }).catch(function(e){console.warn('[kb] livre pool fetch falhou',e);}).then(function(){_lfLivrePoolFetching=false;});
}

function _collectLivrePoolForUser(uid){
  var seen={};
  var out=[];
  function pushCard(card,ownerId){
    if(!card||!card.id)return;
    var key=String(card.id)+'@@'+String(ownerId||'');
    if(seen[key])return;
    seen[key]=true;
    card._timeOwnerUid=ownerId||uid||(S&&S.userId)||'';
    out.push(card);
  }
  getKBFor('leads',uid).forEach(function(c){pushCard(c,uid);});
  var _serverPool=_lfLivrePoolServerCache;
  if(!_serverPool){
    try{_serverPool=sg('lf6_livre_pool_cache')||null;}catch(_e){_serverPool=null;}
  }
  if(_serverPool&&_serverPool.length){
    _serverPool.forEach(function(c){
      if(c&&c._ownerUid&&c._ownerUid!==uid&&c.col==='livre')pushCard(c,c._ownerUid);
    });
  }else{
    // Ainda sem resposta do servidor nesta sessão/aparelho: cai no método
    // antigo (só pega o que já estiver em cache local de outros usuários
    // — pra supervisor/gerente, que já sincroniza o time via
    // _syncKBRemoteBG, isso já cobre bem; pra consultor comum fica vazio
    // até o fetch acima responder, o que é rápido — ver gatilho logo abaixo).
    _kbAllVisibleUserPool().forEach(function(u){
      if(!u||!u.id||u.id===uid)return;
      getKBFor('leads',u.id).forEach(function(c){
        if(c&&c.col==='livre')pushCard(c,u.id);
      });
    });
  }
  _lfRefreshLivrePoolFromServer(false);
  return out;
}

/* Varias acoes de Kanban (mover card arrastando, transferir, descartar, restaurar
   snapshot) nunca mostravam nada quando davam certo OU quando davam errado — se o
   localStorage estivesse cheio, a mudanca sumia ao recarregar a pagina sem nenhum aviso.
   Isso so avisa quando FALHA (nao inventa um toast de sucesso onde nao existia antes). */
var _kbLastOpFailed=false;

function _kbWarnIfFailed(ok){if(!ok){_kbLastOpFailed=true;toast('⚠️ Alteração pode não ter sido salva — armazenamento local cheio.',4000);}return ok;}

var _kbDragId=null,_kbDragBoard=null,_kbDragOwner=null,_kbDetId=null,_kbDetBoard=null,_kbDetOwnerUid=null,_kbCtxId=null,_kbCtxBoard=null,_kbCtxOwner=null;

var _kbNavFromAdm=false;

 // flag: sinaliza que goPage foi chamado via admViewBoard
var _kbQ={leads:'',negocios:'',__default:''}

var _kbFilter={leads:{nicho:'',valorMin:'',valorMax:'',dias:'',usuario:''},negocios:{nicho:'',valorMin:'',valorMax:'',dias:'',usuario:''}}

// Filtro "somente atividades atrasadas" do Kanban de Negócios — reaproveita a mesma
// lógica do _isOverdue() já usado no Dashboard, aplicado aos cards do board.
var _kbOnlyLate={leads:false,negocios:false}

function toggleKBLateFilter(board,btn){
  _kbOnlyLate[board]=!_kbOnlyLate[board];
  if(btn){btn.classList.toggle('on',_kbOnlyLate[board]);btn.setAttribute('aria-pressed',_kbOnlyLate[board]?'true':'false');}
  renderKBLocal(board);
}

var _bulkMode=false,_bulkSelected=[];

var _confirmDelCb=null;

function kbScroll(wrapId,dir){
  var el=document.getElementById(wrapId);
  if(!el)return;
  var step=el.offsetWidth*0.65;
  el.scrollBy({left:dir*step,behavior:"smooth"});
}

/* Auto-scroll contínuo ao passar/segurar o mouse sobre as setas < > do kanban (em vez de
   precisar clicar repetidas vezes). Um pequeno atraso (220ms) evita disparar o scroll
   automático só por passar o mouse de raspão sobre o botão. Solta o mouse (mouseleave) ou
   clica (mouseup) pra parar.
   Usa requestAnimationFrame com velocidade corrigida pelo delta de tempo real (em vez de
   setInterval de 16ms): o deslocamento fica igual em qualquer taxa de atualização de tela
   e a aba em segundo plano não fica enfileirando trabalho. */
var _kbHoverScrollTimer=null,_kbHoverScrollStop=null;
var _kbDragAutoTimer=null,_kbDragAutoWrapId=null,_kbDragAutoDir=0,_kbDragAutoSpeed=18;
var _kbDragColAutoTimer=null,_kbDragColAutoEl=null,_kbDragColAutoDir=0,_kbDragColAutoSpeed=16;

function _kbRafScroll(el,pxPerSec){
  var stopped=false,last=0,id=0;
  function step(ts){
    if(stopped||!el||!el.isConnected){stopped=true;return;}
    if(!last)last=ts;
    var dt=Math.min(64,ts-last);last=ts;
    el.scrollLeft+=pxPerSec*dt/1000;
    id=requestAnimationFrame(step);
  }
  id=requestAnimationFrame(step);
  return function(){stopped=true;if(id)cancelAnimationFrame(id);};
}

function kbScrollHoverStart(wrapId,dir){
  kbScrollHoverStop();
  var el=document.getElementById(wrapId);if(!el)return;
  _kbHoverScrollTimer=setTimeout(function(){
    _kbHoverScrollTimer=null;
    _kbHoverScrollStop=_kbRafScroll(el,dir*900);
  },220);
}

function kbScrollHoverStop(){
  if(_kbHoverScrollTimer){clearTimeout(_kbHoverScrollTimer);_kbHoverScrollTimer=null;}
  if(_kbHoverScrollStop){_kbHoverScrollStop();_kbHoverScrollStop=null;}
}

/* Captura/restaura a posição de scroll do Kanban (rolante horizontal + colunas + lista
   mobile). Usada em ações que encolhem a lista renderizada (converter, excluir, reverter) —
   sem isso, o navegador zera o scrollTop sozinho quando o container fica mais baixo que a
   posição atual, e a lista volta ao topo mesmo sem o usuário ter pedido isso. Chamar
   _kbCaptureScrollSnapshot() ANTES de qualquer mutação na lista (arr.filter/push/etc), e
   _kbScheduleScrollRestore(snap) depois do render que segue a mutação. */
function _kbCaptureScrollSnapshot(){
  var snap={wraps:{},cols:{},mobLists:{}};
  try{
    ['leads','negocios'].forEach(function(b){
      var w=document.getElementById(b+'-kanban');
      var shell=w&&w.closest?w.closest('.kb-scroll-wrap'):null;
      if(shell)snap.wraps[b]=shell.scrollLeft||0;
      if(w){
        w.querySelectorAll('.kb-col').forEach(function(colEl){
          var colId=colEl&&colEl.dataset?colEl.dataset.col:'';
          var cards=colEl.querySelector('.kb-cards');
          if(colId&&cards)snap.cols[b+'::'+colId]=cards.scrollTop||0;
        });
      }
      var mob=document.getElementById(b+'-mobile-list');
      if(mob)snap.mobLists[b]=mob.scrollTop||0;
    });
  }catch(_e){}
  return snap;
}

function _kbRestoreScrollSnapshot(snap){
  if(!snap)return;
  try{
    ['leads','negocios'].forEach(function(b){
      var w=document.getElementById(b+'-kanban');
      var shell=w&&w.closest?w.closest('.kb-scroll-wrap'):null;
      if(shell&&snap.wraps[b]!=null){
        var max=Math.max(0,shell.scrollWidth-shell.clientWidth);
        shell.scrollLeft=Math.max(0,Math.min(snap.wraps[b],max));
      }
      if(w){
        w.querySelectorAll('.kb-col').forEach(function(colEl){
          var colId=colEl&&colEl.dataset?colEl.dataset.col:'';
          var key=b+'::'+colId;
          if(!(key in snap.cols))return;
          var cards=colEl.querySelector('.kb-cards');
          if(cards){
            var m=Math.max(0,cards.scrollHeight-cards.clientHeight);
            cards.scrollTop=Math.max(0,Math.min(snap.cols[key],m));
          }
        });
      }
      var mob=document.getElementById(b+'-mobile-list');
      if(mob&&snap.mobLists[b]!=null){
        var mm=Math.max(0,mob.scrollHeight-mob.clientHeight);
        mob.scrollTop=Math.max(0,Math.min(snap.mobLists[b],mm));
      }
    });
  }catch(_e){}
}

function _kbScheduleScrollRestore(snap){
  /* 3 tentativas em rAFs sucessivos: cobre o caso de o render acontecer em mais de um
     "tick" (ex.: um re-render assíncrono chegando logo depois do primeiro). */
  requestAnimationFrame(function(){
    _kbRestoreScrollSnapshot(snap);
    requestAnimationFrame(function(){
      _kbRestoreScrollSnapshot(snap);
      requestAnimationFrame(function(){_kbRestoreScrollSnapshot(snap);});
    });
  });
  // [FIX 20260820] mesma rede de segurança de _kbRestoreScrollState — uma
  // segunda renderização em segundo plano (sync remoto, automação) chegando
  // pouco depois das 3 tentativas em rAF ainda conseguia desfazer o
  // restore. Reaplica mais uma vez em ~400ms.
  setTimeout(function(){_kbRestoreScrollSnapshot(snap);},400);
}

function _kbWrapIdForBoard(board){
  if(board==='leads')return 'leads-kanban';
  if(board==='negocios')return 'negocios-kanban';
  if(board==='time-leads')return 'time-leads-kanban';
  if(board==='time-negocios')return 'time-negocios-kanban';
  return board||'';
}

function _kbDragAutoScrollStop(){
  if(_kbDragAutoTimer){clearInterval(_kbDragAutoTimer);_kbDragAutoTimer=null;}
  if(_kbDragColAutoTimer){clearInterval(_kbDragColAutoTimer);_kbDragColAutoTimer=null;}
  _kbDragAutoWrapId=null;_kbDragAutoDir=0;
  _kbDragColAutoEl=null;_kbDragColAutoDir=0;
}

function _kbDragColAutoScrollMaybe(clientX,clientY){
  if(!_kbDragId){
    if(_kbDragColAutoTimer){clearInterval(_kbDragColAutoTimer);_kbDragColAutoTimer=null;}
    _kbDragColAutoEl=null;_kbDragColAutoDir=0;
    return;
  }
  var tgt=document.elementFromPoint(clientX,clientY);
  var scroller=tgt&&tgt.closest?tgt.closest('.kb-cards'):null;
  if(!scroller){
    if(_kbDragColAutoTimer){clearInterval(_kbDragColAutoTimer);_kbDragColAutoTimer=null;}
    _kbDragColAutoEl=null;_kbDragColAutoDir=0;
    return;
  }
  var rect=scroller.getBoundingClientRect();
  var zone=Math.max(42,Math.min(76,rect.height*0.14));
  var dir=0,dist=0;
  if(clientY<=rect.top+zone){dir=-1;dist=(rect.top+zone)-clientY;}
  else if(clientY>=rect.bottom-zone){dir=1;dist=clientY-(rect.bottom-zone);}
  if(!dir){
    if(_kbDragColAutoTimer){clearInterval(_kbDragColAutoTimer);_kbDragColAutoTimer=null;}
    _kbDragColAutoEl=null;_kbDragColAutoDir=0;
    return;
  }
  // [FIX 20260821] velocidade proporcional à proximidade da borda — pedido
  // explícito. Quanto mais perto da borda (maior "dist", já que dist é
  // medida a partir do INÍCIO da zona de gatilho, crescendo até a borda de
  // verdade), mais rápido rola. Mínimo 8px/tick (bem devagar, controlável),
  // máximo 34px/tick (rápido, pra listas longas não demorarem uma
  // eternidade) — a 16ms por tick isso dá uma faixa de ~30–130px por
  // segundo aproximadamente.
  var speed=8+Math.round(Math.min(1,dist/zone)*26);
  if(_kbDragColAutoTimer&&_kbDragColAutoEl===scroller&&_kbDragColAutoDir===dir){
    _kbDragColAutoSpeed=speed; // já rolando na mesma direção — só atualiza a velocidade
    return;
  }
  if(_kbDragColAutoTimer){clearInterval(_kbDragColAutoTimer);_kbDragColAutoTimer=null;}
  _kbDragColAutoEl=scroller;_kbDragColAutoDir=dir;_kbDragColAutoSpeed=speed;
  _kbDragColAutoTimer=setInterval(function(){
    if(!_kbDragId||!_kbDragColAutoEl){
      if(_kbDragColAutoTimer){clearInterval(_kbDragColAutoTimer);_kbDragColAutoTimer=null;}
      _kbDragColAutoEl=null;_kbDragColAutoDir=0;
      return;
    }
    _kbDragColAutoEl.scrollBy({top:_kbDragColAutoDir*(_kbDragColAutoSpeed||16),behavior:'auto'});
  },16);
}

function _kbDragAutoScrollMaybe(board,clientX){
  if(!_kbDragId){_kbDragAutoScrollStop();return;}
  var wrapId=_kbWrapIdForBoard(board);
  var el=document.getElementById(wrapId);if(!el){_kbDragAutoScrollStop();return;}
  var shell=el.closest('.kb-scroll-wrap')||el;
  var rect=shell.getBoundingClientRect();
  var zone=Math.max(56,Math.min(92,rect.width*0.12));
  var dir=0,dist=0;
  if(clientX<=rect.left+zone){dir=-1;dist=(rect.left+zone)-clientX;}
  else if(clientX>=rect.right-zone){dir=1;dist=clientX-(rect.right-zone);}
  if(!dir){_kbDragAutoScrollStop();return;}
  // [FIX 20260821] mesma proporcionalidade da rolagem vertical — quanto
  // mais perto da borda, mais rápido.
  var speed=10+Math.round(Math.min(1,dist/zone)*30);
  if(_kbDragAutoTimer&&_kbDragAutoWrapId===wrapId&&_kbDragAutoDir===dir){
    _kbDragAutoSpeed=speed;
    return;
  }
  _kbDragAutoScrollStop();
  _kbDragAutoWrapId=wrapId;_kbDragAutoDir=dir;_kbDragAutoSpeed=speed;
  _kbDragAutoTimer=setInterval(function(){el.scrollBy({left:_kbDragAutoDir*(_kbDragAutoSpeed||18),behavior:'auto'});},16);
}

function _bindKBDragAutoShell(board,wrap){
  var shell=wrap&&(wrap.closest('.kb-scroll-wrap')||wrap);
  if(!shell||shell._kbDragAutoBoardBound===board)return;
  shell._kbDragAutoBoardBound=board;
  shell.addEventListener('dragover',function(e){if(_kbDragBoard===board)_kbDragAutoScrollMaybe(board,e.clientX);});
  shell.addEventListener('dragleave',function(e){if(!shell.contains(e.relatedTarget))_kbDragAutoScrollStop();});
  shell.addEventListener('drop',_kbDragAutoScrollStop);
}

function _kbCaptureScrollState(board){
  var wrap=document.getElementById(board==='leads'?'leads-kanban':'negocios-kanban');
  if(!wrap)return null;
  var state={wrapLeft:wrap.scrollLeft||0,colTops:{}};
  wrap.querySelectorAll('.kb-col').forEach(function(colEl){
    var colId=colEl&&colEl.dataset?colEl.dataset.col:'';
    var cardsEl=colEl.querySelector('.kb-cards');
    if(colId&&cardsEl)state.colTops[colId]=cardsEl.scrollTop||0;
  });
  return state;
}

function _kbRestoreScrollState(board,state){
  if(!state)return;
  var wrap=document.getElementById(board==='leads'?'leads-kanban':'negocios-kanban');
  if(!wrap)return;
  var apply=function(){
    try{wrap.scrollLeft=Math.max(0,Math.min(state.wrapLeft||0,Math.max(0,wrap.scrollWidth-wrap.clientWidth)));}catch(_e){}
    try{
      Object.keys(state.colTops||{}).forEach(function(colId){
        var colEl=wrap.querySelector('.kb-col[data-col="'+colId+'"]');
        var cardsEl=colEl&&colEl.querySelector?colEl.querySelector('.kb-cards'):null;
        if(cardsEl)cardsEl.scrollTop=state.colTops[colId]||0;
      });
    }catch(_e){}
  };
  requestAnimationFrame(function(){requestAnimationFrame(apply);});
  // [FIX 20260820] Rede de segurança: se algum re-render em segundo plano
  // (sync remoto, motor de automação, outra aba) rodar logo depois da
  // ação do usuário — SEM passar por esta mesma preservação — ele zera o
  // scrollTop de novo, poucos instantes depois do restore acima já ter
  // funcionado. Isso parecia "mudar de etapa reseta o scroll", quando na
  // verdade era uma segunda renderização silenciosa desfazendo a primeira
  // correção. Reaplica mais uma vez em ~400ms como reforço.
  setTimeout(apply,400);
}

// ============================================================
// KANBAN
// ============================================================
/* ============================================================
   Barra "Ver:" reutilizável — Seus / Usuários (dropdown rolável)
   ------------------------------------------------------------
   Substitui a lista plana de balões (1 por usuário) — funciona bem com
   poucos usuários, mas com dezenas/100 vira uma fileira enorme, sem
   organização, com risco de cortar visualmente. Agora só 2 elementos
   fixos na barra:
     - "Seus"      -> mostra só os cards/métricas do próprio usuário
     - "Usuários"  -> abre um menu com "Ver todos" + lista de usuários
                      (rolável, altura máxima fixa — nunca estoura a tela
                      por maior que seja a equipe)
   selectFnName: nome da função global chamada ao escolher (sempre
   assinatura (uid_ou_null, btnEl)) — mesma que setKBView/setTimeConsFilter
   já usam, então plugar aqui não pede mudar a assinatura delas. */
function _lfBuildConsBarHtml(barKey,users,currentUid,selectFnName){
  var meUid=(S&&S.userId)||'';
  var isSelf=currentUid===meUid;
  var isAll=(currentUid===null||currentUid===undefined);
  var pickedUser=(!isSelf&&!isAll)?users.find(function(u){return u.id===currentUid;}):null;
  var usersLabel=isAll?'Todos':(pickedUser?eH(pickedUser.nome.split(' ')[0]):'Usuários');
  var usersOn=!isSelf; // "Usuários" marcado sempre que a visão atual não for "Seus" (cobre Todos e uma pessoa específica)
  var html='<span style="font-size:.65rem;color:var(--mu);margin-right:4px">Ver:</span>';
  html+='<button type="button" class="kb-cons-chip'+(isSelf?' on':'')+'" onclick="'+selectFnName+'(\''+_jsSq(meUid)+'\',this)">Seus</button>';
  html+='<div class="kb-cons-users-wrap">';
  html+='<button type="button" class="kb-cons-chip kb-cons-users-btn'+(usersOn?' on':'')+'" onclick="_lfToggleConsUsersMenu(\''+_jsSq(barKey)+'\',event)">'+usersLabel+' <span class="kb-cons-caret">▾</span></button>';
  html+='<div class="kb-cons-users-menu" id="cons-menu-'+barKey+'">';
  html+='<button type="button" class="kb-cons-menu-item'+(isAll?' on':'')+'" onclick="'+selectFnName+'(null,this);_lfCloseConsUsersMenu(\''+_jsSq(barKey)+'\');">Ver todos</button>';
  if(users.length){
    html+='<div class="kb-cons-menu-sep"></div><div class="kb-cons-menu-scroll">';
    html+=users.map(function(u){
      var on=(currentUid===u.id);
      return '<button type="button" class="kb-cons-menu-item'+(on?' on':'')+'" onclick="'+selectFnName+'(\''+_jsSq(u.id)+'\',this);_lfCloseConsUsersMenu(\''+_jsSq(barKey)+'\');">'+eH(u.nome)+'</button>';
    }).join('');
    html+='</div>';
  }
  html+='</div></div>';
  return html;
}

var _lfConsMenuOutsideInstalled=false;
function _lfInstallConsMenuOutsideHandler(){
  if(_lfConsMenuOutsideInstalled)return;
  _lfConsMenuOutsideInstalled=true;
  function onOutside(ev){
    document.querySelectorAll('.kb-cons-users-menu.open').forEach(function(menu){
      if(menu.contains(ev.target))return;
      var wrap=menu.closest('.kb-cons-users-wrap');
      if(wrap&&wrap.contains(ev.target)&&ev.target.closest('.kb-cons-users-btn'))return; // o próprio botão de abrir cuida disso no toggle
      menu.classList.remove('open');
    });
  }
  document.addEventListener('pointerdown',onOutside,true);
  document.addEventListener('touchstart',onOutside,true);
}
function _lfToggleConsUsersMenu(barKey,ev){
  if(ev){ev.preventDefault();ev.stopPropagation();}
  var menu=document.getElementById('cons-menu-'+barKey);
  if(!menu)return;
  var wasOpen=menu.classList.contains('open');
  document.querySelectorAll('.kb-cons-users-menu.open').forEach(function(m){m.classList.remove('open');});
  if(!wasOpen){
    menu.classList.add('open');
    _lfInstallConsMenuOutsideHandler();
  }
}
function _lfCloseConsUsersMenu(barKey){
  var menu=document.getElementById('cons-menu-'+barKey);
  if(menu)menu.classList.remove('open');
}

function renderKBConsBar(board){
  var el=document.getElementById(board+'-cons-bar');if(!el)return;
  if(!hasAdminAccess()){el.innerHTML='';return;}
  // Exibe todos os usuários ativos para filtro (incluindo o próprio ADM/Gerente)
  var users=getUsers().filter(function(u){return u.ativo;});
  if(S&&S.userId&&!users.find(function(u){return u.id===S.userId;})){
    users.unshift({id:S.userId,nome:(S.nome||'Eu'),ativo:true});
  }
  var cur=_kbViewUid[board];
  el.innerHTML=_lfBuildConsBarHtml(board+'-cons',users,cur,'_kbConsSelect_'+board);
}
// onclick precisa de uma função global de aridade (uid,btn) por board —
// gera um pequeno adaptador por board em vez de tentar bind() dentro de
// atributo HTML (mais simples de ler e de depurar no DevTools).
window._kbConsSelect_leads=function(uid,btn){setKBView('leads',uid,btn);};
window._kbConsSelect_negocios=function(uid,btn){setKBView('negocios',uid,btn);};

function setKBView(board,uid,btn){
  _kbViewUid[board]=uid||null;
  renderKBConsBar(board);
  renderKBLocal(board);setTimeout(function(){renderKB(board);},1200);
}

/* CORREÇÃO (auditoria — consumidores indiretos de usuário fora de Time/Estrutura/Messenger):
   _kbViewUid[board] guarda o uid do consultor escolhido no filtro "Ver:" do ADM/Gestor, mas
   nada revalidava esse valor quando o usuário selecionado era desativado ou excluído em
   Time/Estrutura enquanto o Kanban continuava carregado. Como activeUID() só checa se
   _kbViewUid[board] tem algum valor (sem verificar se o usuário ainda existe/está ativo), o
   quadro continuava mostrando os cards daquele ex-consultor indefinidamente — e sem nenhum
   chip marcado como "on" em renderKBConsBar() (o usuário inativo nem aparece mais na
   lista), deixando o filtro preso num estado sem indicação visual de qual "Ver:" está
   realmente selecionado. Mesmo padrão já corrigido em Time (_timeViewUid) e Estrutura. Ao
   receber crm:users-updated, se o uid selecionado em _kbViewUid não estiver mais entre os
   usuários ativos, o filtro volta para "Todos" e o quadro (se estiver na tela) é
   redesenhado. */
function _crmKBRevalidateViewUid(){
  var ativos=null;
  ['leads','negocios'].forEach(function(board){
    var uid=_kbViewUid[board];
    if(!uid)return;
    if(!ativos)ativos=getUsers().filter(function(u){return u.ativo;});
    if(!ativos.find(function(u){return u.id===uid;})){
      _kbViewUid[board]=null;
      var pg=document.getElementById(board==='leads'?'pg-leads':'pg-negocios');
      if(pg&&pg.classList.contains('on')){renderKBConsBar(board);renderKBLocal(board);}
    }
  });
}
window.addEventListener('crm:users-updated',_crmKBRevalidateViewUid);

/* CORREÇÃO DE LENTIDÃO AO ABRIR/TROCAR DE QUADRO:
   antes, renderKB() sempre esperava loadKBRemote() (rede/Firestore) responder ANTES de
   desenhar qualquer coisa — trocar de aba Leads/Negócios (ou trocar o filtro de consultor)
   ficava "pensando" até a rede responder. Agora a função pinta o quadro IMEDIATAMENTE com
   o que já está no cache local (renderKBLocal — mesma função já usada, sem rede, no
   drag-and-drop) e só then dispara a sincronização com a nuvem em segundo plano; se
   chegar algo novo (mudança feita em outro aparelho), o quadro é redesenhado de novo,
   sem o usuário jamais esperar a rede pra ver algo na tela. */
function renderKB(board){
  if(!S||!S.userId){console.warn('[kb] renderKB: sessão não iniciada');return;}
  var wrap=document.getElementById(board==='leads'?'leads-kanban':'negocios-kanban');if(!wrap)return;
  renderKBLocal(board); // pintura instantânea, sempre a partir do cache local
  _syncKBRemoteBG(board);
}

function _syncKBRemoteBG(board){
  var wc=_kbWorkerClient();
  var usingWorker=!!wc;
  if(!usingWorker&&(DB_MODE!=='firebase'||!db))return;
  function fetchDoc(uid){
    return usingWorker
      ? wc.kanbanList(board,uid).then(function(doc){return (doc&&doc.list)||[];})
      : db.collection('kb_'+board).doc(uid).get().then(function(d){return d.exists?(d.data().list||[]):[];});
  }
  // [FIX 20260820] Antes, TODO ciclo desta sincronização terminava chamando
  // renderKBLocal(board) incondicionalmente — mesmo quando o servidor
  // devolvia exatamente o que já estava local. Como renderKBLocal reconstrói
  // o board inteiro do zero (wrap.innerHTML=''), isso derrubava e recriava
  // TODOS os cards de TODAS as colunas a cada ciclo dessa sincronização em
  // segundo plano (roda sozinha, sem nenhuma ação do usuário) — o tremor/
  // mini-travada relatado em leads parados, sem ninguém ter tocado em nada.
  // Agora só repinta se algo realmente mudou.
  var _kbSyncChanged=false;
  function _markChangedIfDiff(uid,merged){
    try{
      var before=JSON.stringify(getKBFor(board,uid));
      var after=JSON.stringify(merged);
      if(before!==after)_kbSyncChanged=true;
    }catch(_e){_kbSyncChanged=true;} // em dúvida, prefere repintar a esconder uma mudança real
  }
  if(hasAdminAccess()&&!_kbViewUid[board]){
    var _allAdmUsers=getUsers().filter(function(u){return u.ativo;});
    if(S&&S.userId&&!_allAdmUsers.find(function(u){return u.id===S.userId;})){
      _allAdmUsers.push({id:S.userId,nome:(S.nome||S.userId),ativo:true});
    }
    var _pending=_allAdmUsers.length;
    if(!_pending)return;
    _allAdmUsers.forEach(function(u){
      fetchDoc(u.id).then(function(server){
        var merged=_mergeKeepLocalOnly(server,getKBFor(board,u.id));
        _markChangedIfDiff(u.id,merged);
        ss(kbKeyFor(board,u.id),merged);
        if(merged.length!==server.length)saveKBFor(board,u.id,merged); // reenvia card(s) local(is) ainda não sincronizado(s)
        _autoMoveStaleToLivre(board,getKBFor(board,u.id),u.id);
      }).catch(function(e){console.warn("[kb] sync admin falhou",e);syncErr&&syncErr(e);}).then(function(){
        _pending--;
        if(_pending<=0&&_kbSyncChanged)renderKBLocal(board); // repinta uma única vez, só se algo mudou
      });
    });
  } else {
    var uid=activeUID(board);
    if(!hasAdminAccess()){
      /* LF-KB-SYNC-SCOPED-20260804 (ampliado 2026-08-17)
         Antes este ramo sincronizava TODOS os usuários ativos. Com a regra
         cargo/departamento isso virou tempestade de 403. Agora sincroniza
         apenas o pool já escopado e só faz PUT remoto quando o owner é
         realmente editável pelo usuário atual.
         Ampliação: antes só rodava pra board==='leads' (motivado pela
         etapa "Livre", que só existe em Leads). Só que _kbAllVisibleUserPool()
         já é escopado pelo cargo de quem está logado (getDepartmentVisibleUsers) —
         pra um consultor comum, o pool já é só ele mesmo (nenhuma mudança de
         comportamento nem custo extra); pra supervisor/gerente (escopo
         'team', mesma permissão que o servidor já concede em
         assertKanbanReadOwner), o pool é o time inteiro. Restringir a Leads
         deixava o Kanban de NEGÓCIOS do supervisor sem essa atualização
         proativa — ele só via mudança de responsável/etapa de um Negócio do
         time depois de sair e voltar pra aba (ou relogar), mesmo o servidor
         já permitindo essa leitura o tempo todo. */
      var _pool=_kbAllVisibleUserPool();
      var _pendingUserSync=_pool.length;
      if(!_pendingUserSync)return;
      _pool.forEach(function(u){
        fetchDoc(u.id).then(function(server){
          var merged=_mergeKeepLocalOnly(server,getKBFor(board,u.id));
          _markChangedIfDiff(u.id,merged);
          ss(kbKeyFor(board,u.id),merged);
          if(merged.length!==server.length&&_kbCanEditOwner(board,u.id))saveKBFor(board,u.id,merged);
          if(S&&u.id===S.userId){runAutomationEngine(board,getKBFor(board,u.id),u.id);_autoMoveStaleToLivre(board,getKBFor(board,u.id),u.id);}
        }).catch(function(e){console.warn("[kb] sync pool escopado falhou",e);syncErr&&syncErr(e);}).then(function(){
          _pendingUserSync--;
          if(_pendingUserSync<=0&&_kbSyncChanged)renderKBLocal(board);
        });
      });
    } else {
      fetchDoc(uid).then(function(server){
        var merged=_mergeKeepLocalOnly(server,getKBFor(board,uid));
        _markChangedIfDiff(uid,merged);
        ss(kbKeyFor(board,uid),merged);
        if(merged.length!==server.length)saveKBFor(board,uid,merged);
      }).catch(function(e){console.warn("[kb] sync user falhou",e);syncErr&&syncErr(e);}).then(function(){
        if(S&&uid===S.userId){runAutomationEngine(board,getKBFor(board,uid),uid);_autoMoveStaleToLivre(board,getKBFor(board,uid),uid);}
        if(_kbSyncChanged)renderKBLocal(board);
      });
    }
  }
}

/* CORREÇÃO DE LENTIDÃO/TRAVAMENTO AO MOVER CARD:
   renderKB() sempre buscava os cards de novo no Firestore (loadKBRemote -> rede) antes de
   redesenhar o quadro inteiro. Isso fazia cada arrastar-e-soltar esperar uma ida-e-volta de
   rede (podendo travar/parecer sem resposta em conexão ruim, exigindo F5). Como o próprio
   _kbMoveCard já grava a mudança no localStorage de forma síncrona ANTES do redraw, não há
   necessidade de rebuscar do zero — renderKBLocal() redesenha direto do cache local, sem
   round-trip de rede, deixando o mover de card instantâneo. O sync com a nuvem continua
   acontecendo normalmente em segundo plano (saveKBFor já dispara o db.collection(...).set()).
   Um renderKB() completo (com rebusca remota) continua rodando ao entrar/trocar de página,
   então outros dispositivos ainda recebem as mudanças. */
function renderKBLocal(board){
  if(!S||!S.userId){console.warn('[kb] renderKBLocal: sessão não iniciada');return;}
  var wrap=document.getElementById(board==='leads'?'leads-kanban':'negocios-kanban');if(!wrap)return;
  var _kbScrollState=_kbCaptureScrollState(board);
  _bindKBDragAutoShell(board,wrap);
  if(board==='leads'){
    var dsb=document.getElementById('dup-scan-btn');if(dsb)dsb.style.display='';
  }
  if(hasAdminAccess()&&!_kbViewUid[board]){
    var _allAdmUsers=getUsers().filter(function(u){return u.ativo;});
    if(S&&S.userId&&!_allAdmUsers.find(function(u){return u.id===S.userId;}))_allAdmUsers.push({id:S.userId,nome:(S.nome||S.userId),ativo:true});
    var _allAdmList=[];
    _allAdmUsers.forEach(function(u){
      var list=getKBFor(board,u.id);
      list.forEach(function(c){c._timeOwnerUid=u.id;});
      _allAdmList=_allAdmList.concat(list);
    });
    _buildKB(board,_allAdmList,wrap,null);
  } else {
    var uid=activeUID(board);
    var baseList=(board==='leads'&&!hasAdminAccess())?_collectLivrePoolForUser(uid):getKBFor(board,uid);
    _buildKB(board,baseList,wrap,uid);
  }
  if(typeof isMobileView==='function'&&isMobileView()&&typeof renderKBMobile==='function')renderKBMobile(board);
  _kbRestoreScrollState(board,_kbScrollState);
}

function refreshKBAffected(boards){
  (boards||[]).forEach(function(board){
    // [FIX 20260821] renderKBLocal já chama renderKBMobile por dentro
    // quando isMobileView() — a chamada explícita que existia aqui
    // rodava renderKBMobile duas vezes seguidas pra cada ação em massa
    // (mover/transferir/etc), arriscando a mesma corrida de rolagem já
    // corrigida dentro de renderKBMobile (a segunda chamada capturava a
    // rolagem antes da primeira terminar de restaurar).
    try{renderKBLocal(board);}catch(_e){}
  });
}

function filterKB(board){
  var inp=document.getElementById(board==='leads'?'lead-search':'neg-search');
  _kbQ[board]=(inp?inp.value:'').toLowerCase();_kbQ[board]=_kbQ[board]||'';renderKBLocal(board);
}

function _sortCardsForColumn(cards){
  return (cards||[]).slice().sort(function(a,b){
    var am=Number.isFinite(a&&a.manualOrder)?a.manualOrder:null;
    var bm=Number.isFinite(b&&b.manualOrder)?b.manualOrder:null;

    // Os dois já foram reordenados manualmente ao menos uma vez nesta
    // coluna: mantém a ordem que a pessoa arrumou (2026-08-03 — antes
    // disso um card com manualOrder SEMPRE vencia um sem manualOrder,
    // então um lead novo (sem manualOrder ainda) caía por baixo dos já
    // organizados; corrigido abaixo).
    if(am!==null&&bm!==null&&am!==bm)return am-bm;
    // Um dos dois é "novo" (nunca foi movido nesta coluna, sem
    // manualOrder): o novo fica por CIMA — mais recente primeiro.
    if(am!==null&&bm===null)return 1;
    if(am===null&&bm!==null)return -1;

    var at=new Date((a&&a.createdAt)||0).getTime();
    var bt=new Date((b&&b.createdAt)||0).getTime();
    return bt-at;
  });
}

function _attCanEditCurrentCard(){
  var board=(typeof _kbDetBoard!=='undefined' ? _kbDetBoard : null);
  var id=(typeof _kbDetId!=='undefined' ? _kbDetId : null);
  if(!board || !id) return false;

  var uid=((typeof _kbDetOwnerUid!=='undefined' ? _kbDetOwnerUid : null) ||
          (typeof activeUID==='function' ? activeUID(board) : null));

  var arr=(typeof getKBFor==='function' ? getKBFor(board,uid) : []);
  var c=arr.find(function(x){ return x.id===id; });
  if(!c) return false;

  if(typeof _kbStageReadOnly === 'function' && _kbStageReadOnly(board,c.col)) return false;
  if(typeof _kbDetReadOnly !== 'undefined' && _kbDetReadOnly) return false;

  return true;
}

/* ---------------------------------------------------------------------
 * Helper: verifica se um card possui atividade vinculada ATRASADA.
 * Nova fonte de verdade: store central de atividades (getActivitiesLocalFor).
 * Fallback legado: espelho antigo dentro de card.activities.
 * Usado pelo filtro "somente atrasadas" em todas as visões (desktop, mobile,
 * resumo/seletor de etapa) — substitui o _isOverdue(c) que checava apenas o
 * card, sem olhar as atividades vinculadas ao cliente.
 * --------------------------------------------------------------------- */
function _kbHasOverdueLinkedActivity(card, ownerUid, board){
  if(!card || typeof card !== 'object') return false;
  /* LF-FIX-3BUGS-v1-20260819 #1: card em etapa terminal (desc/noshow/conv/desist/fechado) NUNCA entra
     no filtro "Atrasadas" nem acende bolinha — a atividade vencida deixa de ser
     acionavel quando o card chega ao fim do funil. */
  if(['desc','noshow','conv','desist','fechado'].indexOf(String(card.col||''))>=0) return false;

  var uid =
    card._timeOwnerUid ||
    ownerUid ||
    card.userId ||
    (S && S.userId) ||
    '';

  // Fonte de verdade nova: store central de atividades
  if(typeof getActivitiesLocalFor === 'function' && uid){
    var now = Date.now();
    var hasLate = getActivitiesLocalFor(uid).some(function(a){
      if(!a || typeof a !== 'object') return false;
      if(a.done) return false;
      if(!a.scheduledAt) return false;
      if(String(a.clientId || '') !== String(card.id || '')) return false;
      if(board && a.board && a.board !== board) return false;
      if(!a.id) return false;
      return _isScheduledExpired(a.scheduledAt, now);
    });
    if(hasLate) return true;
  }

  // Fallback legado: espelho antigo dentro do card
  var acts = card.activities;
  if(!Array.isArray(acts) || acts.length === 0) return false;

  var now2 = Date.now();
  for(var i=0; i<acts.length; i++){
    var a = acts[i];
    if(!a || typeof a !== 'object') continue;
    if(a.done) continue;
    if(!a.id) continue;
    if(!a.scheduledAt) continue;
    if(_isScheduledExpired(a.scheduledAt, now2)) return true;
  }
  return false;
}

function _buildKB(board,list,wrap,ownerUid,readOnly){
  var cols=kbCols(board);var q=_kbQ[board]||'';
  var canAll=(getMyRole()==='gestor');
  wrap.innerHTML='';
  cols.forEach(function(col){
    var cards=list.filter(function(c){
      if(c.col!==col.id)return false;
      if(q&&c.name.toLowerCase().indexOf(q)<0&&(c.tel||'').indexOf(q)<0)return false;
      var f=_kbFilter[board]||{};
      if(f.nicho&&(c.nicho||'')!==f.nicho)return false;
      if(f.valorMin&&board==='negocios'&&(parseFloat(c.valor)||0)<parseFloat(f.valorMin))return false;
      if(f.valorMax&&board==='negocios'&&(parseFloat(c.valor)||0)>parseFloat(f.valorMax))return false;
      if(f.dias&&c.createdAt){var d=Math.floor((Date.now()-new Date(c.createdAt).getTime())/86400000);if(d<parseInt(f.dias,10))return false;}
      if(f.usuario&&(c._timeOwnerUid||ownerUid)!==f.usuario)return false;
      if(_kbOnlyLate[board]&&!_kbHasOverdueLinkedActivity(c, c._timeOwnerUid || ownerUid, board))return false;
      return true;
    });
    cards=_sortCardsForColumn(cards);
    var restricted=board==='negocios'&&_kbCardLocked(board,col.id,'target')&&!canAll;
    var colEl=document.createElement('div');colEl.className='kb-col';colEl.dataset.col=col.id;colEl.dataset.board=board;
    var hd=document.createElement('div');hd.className='kb-col-hd '+col.cls;
    // Soma do valor de venda de todos os cards da etapa (somente Negocios) — exibida ao
    // lado do titulo da etapa, ex: "Ficha Cliente (180)". Recalcula sozinha porque a
    // coluna inteira e re-renderizada a cada entrada/saida/edicao de valor de um card.
    var colValorTxt='';
    if(board==='negocios'){
      var colSum=cards.reduce(function(s,c){return s+(parseFloat(c.valor)||0);},0);
      if(colSum>0)colValorTxt=' <span class="kb-col-valor">('+colSum.toLocaleString('pt-BR',{maximumFractionDigits:0})+')</span>';
    }
    hd.innerHTML='<div style="display:flex;align-items:center;gap:5px"><span class="kb-col-title">'+eH(col.label)+colValorTxt+'</span><span class="kb-col-cnt">'+cards.length+'</span>'+(restricted?'<span class="perm-badge view">Gestor</span>':'')+'</div>'+(readOnly||restricted?'':'<button class="kb-add-btn" aria-label="Adicionar card" onclick="openKBNew(\''+board+'\',\''+col.id+'\')">+</button>');
    colEl.appendChild(hd);
    var ca=document.createElement('div');ca.className='kb-cards';
    if(!cards.length)ca.innerHTML=(readOnly||restricted)?'<div class="kb-empty">Vazio</div>':'<div class="kb-empty kb-empty-add" onclick="openKBNew(\''+board+'\',\''+col.id+'\')" tabindex="0" role="button">+ Adicionar</div>';
    else cards.forEach(function(c){ca.appendChild(_makeCard(c,board,ownerUid,readOnly));});
    if(!restricted&&!readOnly){
      ca.addEventListener('dragover',function(e){
        e.preventDefault();colEl.classList.add('drag-over');
        _kbDragAutoScrollMaybe(board,e.clientX);
        // [FIX 20260821] auto-scroll VERTICAL (rolar a etapa pra cima/baixo
        // ao chegar perto da borda) — a função já existia e já funcionava
        // pro arraste por toque (mobile, ver _touchZone/touchmove logo
        // abaixo neste arquivo), só nunca tinha sido ligada no arraste por
        // mouse (dragover é o evento nativo do HTML5 drag-and-drop do
        // navegador, usado só no desktop). Mesma função, mesmo
        // comportamento, só um segundo gatilho.
        _kbDragColAutoScrollMaybe(e.clientX,e.clientY);
        // Throttle pro próximo animation frame: dragover dispara muitas vezes por segundo, e
        // _afterEl() faz getBoundingClientRect() de cada card da coluna — recalcular isso a
        // cada disparo (em vez de no máximo uma vez por frame) causava travamento visível ao
        // arrastar em colunas com muitos cards. Guarda sempre a posição mais recente do mouse
        // (barato) e só agenda o cálculo caro (_afterEl) uma vez por frame.
        ca._kbDragY=e.clientY;
        if(ca._kbDragRAF)return;
        ca._kbDragRAF=requestAnimationFrame(function(){
          ca._kbDragRAF=null;
          var ph=document.getElementById('kb-ph');if(!ph){ph=document.createElement('div');ph.className='kb-drop-placeholder';ph.id='kb-ph';}
          var af=_afterEl(ca,ca._kbDragY);if(af)ca.insertBefore(ph,af);else ca.appendChild(ph);
        });
      });
      ca.addEventListener('dragleave',function(e){if(!ca.contains(e.relatedTarget)){colEl.classList.remove('drag-over');var ph=document.getElementById('kb-ph');if(ph&&ph.parentNode===ca)ph.remove();if(ca._kbDragRAF){cancelAnimationFrame(ca._kbDragRAF);ca._kbDragRAF=null;} _kbDragAutoScrollStop();}});
      ca.addEventListener('drop',function(e){
        e.preventDefault();_kbDragAutoScrollStop();colEl.classList.remove('drag-over');var ph=document.getElementById('kb-ph');
        var dropIndex=(ph&&ph.parentNode===ca)?Array.prototype.indexOf.call(ca.children,ph):null;if(ph)ph.remove();
        if(ca._kbDragRAF){cancelAnimationFrame(ca._kbDragRAF);ca._kbDragRAF=null;}
        if(!_kbDragId||_kbDragBoard!==board)return;
        var uid2=_kbDragOwner||activeUID(board);
        _kbMoveCard(_kbDragId,board,uid2,col.id,false,false,dropIndex);
        renderKBLocal(board);
      });
    }
    if(!readOnly)_touchZone(ca,board,col.id,restricted);
    // [FIX 20260821] rolinha do mouse durante o arraste — pedido
    // explícito ("não é possível utilizar adequadamente o
    // rolante/scroll do mouse enquanto o card está sendo arrastado").
    // O drag-and-drop nativo do navegador pode deixar a resposta a
    // eventos de wheel inconsistente enquanto uma operação de arraste
    // está em andamento (comportamento varia entre navegadores) — este
    // listener garante a rolagem manualmente, sempre, independente
    // disso. Só age quando HÁ um arraste em curso (_kbDragId setado);
    // fora de um arraste, o scroll nativo do navegador continua
    // funcionando normalmente sem nenhuma interferência deste código.
    ca.addEventListener('wheel',function(e){
      if(!_kbDragId)return; // sem arraste em curso — deixa o navegador cuidar normalmente
      e.preventDefault();
      ca.scrollBy({top:e.deltaY,left:e.deltaX,behavior:'auto'});
    },{passive:false});
    colEl.appendChild(ca);wrap.appendChild(colEl);
  });
}


function _makeCard(c,board,ownerUid,readOnly){
  var el=document.createElement('div');
  var _locked=(typeof _kbCardLocked==='function')&&_kbCardLocked(board,c.col,'from');
  var effOwnerUid=c._timeOwnerUid||ownerUid;
  /* LF-KB-CARD-RO-20260804 */
  var _foreignVisibleLead=(board==='leads'&&effOwnerUid&&S&&effOwnerUid!==S.userId&&!_kbCanEditOwner(board,effOwnerUid));
  var _cardReadOnly=!!(readOnly||_foreignVisibleLead);
  el.className='kb-card'+(_cardReadOnly?' kb-card-ro':'')+(_locked?' kb-card-locked':'');el.draggable=!_cardReadOnly&&!_locked;el.dataset.id=c.id;el.dataset.board=board;el.dataset.owner=effOwnerUid||(S&&S.userId)||'';
  var n=c.nicho||'outro';
  var dt='';try{if(c.createdAt)dt=new Date(c.createdAt).toLocaleDateString('pt-BR');}catch(e){console.warn("kanban date parse",e);}
  var _actLate=(typeof _kbHasOverdueLinkedActivity==='function')&&_kbHasOverdueLinkedActivity(c,effOwnerUid,board);
  var ownerTag='';if(effOwnerUid&&S&&effOwnerUid!==S.userId){var ou=getUser(effOwnerUid);ownerTag='<div class="kb-owner-tag" style="background:rgba(195,154,45,.1);color:var(--al)">'+eH(ou&&ou.nome?ou.nome.split(' ')[0]:'?')+'</div>';}
  var _staleMs=KB_STALE_TO_LIVRE_MS;/* Regra única: 3 dias → etapa livre automática */
  var _lastMov=(board==='leads')?_kbGetLeadStageEnteredAt(c):(c.updatedAt||c.createdAt);
  var _lastMovMs=_lastMov?new Date(_lastMov).getTime():NaN;
  var _isStale=Number.isFinite(_lastMovMs)&&(Date.now()-_lastMovMs)>_staleMs&&c.col!=='fechado'&&c.col!=='conv'&&c.col!=='desc'&&c.col!=='noshow'&&c.col!=='desist';
  if(_isStale)el.classList.add('stale');
  /* Etapa Livre: botão "Assumir Lead" visível para qualquer usuário logado quando o card está na etapa livre */
  var _isLivreLead=(board==='leads'&&c.col==='livre'&&!readOnly);
  // FIX #6 (2026-07-20): removido menu 3 pontos em Leads. Em Leads, o clique/duplo-clique já abre detalhes; em Negócios mantém menu de contexto.
  var leadQuickBtn=(board==='leads')?'':'<button class="kb-card-menu" aria-label="Opções do card">⋯</button>';
  el.innerHTML='<div class="kb-card-num">#'+c.id.slice(-6).toUpperCase()+'</div>'
    +'<span class="kb-card-nicho '+n+'">'+(NICHO_LABELS[n]||n)+'</span>'
    +'<div class="kb-card-top"><div class="kb-card-name">'+eH(c.name)+(c.tel?'<button class="kb-copy-tel-btn" title="Copiar número" aria-label="Copiar número">📎</button>':'')+'</div>'+((_cardReadOnly&&!_isLivreLead)?'':'<button class="kb-card-sel-btn" title="Selecionar" aria-label="Selecionar card" onclick="event.stopPropagation();toggleBulkSelect(\''+_jsSq(c.id)+'\',\''+_jsSq(board)+'\',\''+_jsSq(effOwnerUid)+'\',this.closest(\'.kb-card\'))">&#9633;</button>'+leadQuickBtn+'<button class="kb-card-del-btn" title="Excluir permanentemente" aria-label="Excluir card permanentemente">✕</button>')+'</div>'
    +(c.tel?'<div class="kb-card-tel">'+eH(c.tel)+'</div>':'')
    +(c.tel?'<button class="kb-call-btn" aria-label="Ligar para o cliente">📞 Ligar</button><button class="kb-wa-btn">✉️ WhatsApp</button>':'')
    +(board==='negocios'&&c.valor?'<div class="kb-card-valor" style="font-size:.72rem;font-weight:700;color:var(--ok);margin-top:2px">'+fmtBRL(c.valor)+'</div>':'')
    +'<div class="kb-card-date">'+dt+'</div>'
    +(c.obs?'<div class="kb-card-obs">'+eH(c.obs.slice(0,60))+'</div>':'')
    +ownerTag
    +(_locked?'<div class="kb-locked-tag" title="Apenas o Gestor pode mover a partir desta etapa">&#128274; Etapa travada</div>':'')
    +(_cardReadOnly?'':'<button class="kb-act-btn'+(_actLate?' late':'')+'">Lembrete</button>')
    +(!_cardReadOnly&&board==='leads'&&c.col!=='conv'?'<button class="kb-convert-btn">Converter em Negocio</button>':'')
    +(_isLivreLead&&effOwnerUid!==(S&&S.userId)?'<button class="kb-assume-btn">✋ Assumir Lead</button>':'');
  if(readOnly){
    // Modo somente leitura (página Time/Supervisor): sem drag, sem menu, sem ações —
    // só visualização. Clicar abre o detalhe em modo leitura (sem editar/mover/excluir).
    el.addEventListener('click',function(){openKBDet(c.id,board,effOwnerUid||(S&&S.userId)||'',true);});
    return el;
  }
  if(!_cardReadOnly){
    el.addEventListener('dragstart',function(e){_kbDragId=c.id;_kbDragBoard=board;_kbDragOwner=effOwnerUid||(S&&S.userId)||'';el.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
    el.addEventListener('dragend',function(){_kbDragAutoScrollStop();el.classList.remove('dragging');_kbDragId=null;_kbDragOwner=null;});
  }
  /* R16-02: botão direito do mouse abre editar lead/negócio */
  el.addEventListener('contextmenu',function(e){e.preventDefault();e.stopPropagation();_kbDetId=c.id;_kbDetBoard=board;_kbDetOwnerUid=effOwnerUid||(S&&S.userId)||'';if(_foreignVisibleLead){openKBDet(c.id,board,effOwnerUid||(S&&S.userId)||'',false);}else if(board==='leads'){editKBFromDet();}else{openKBDet(c.id,board,effOwnerUid||(S&&S.userId)||'',false);}});
  /* RHUAN-FIX-20260729-A: single-click abre detalhe */
  // 1 clique = abre detalhe (SEMPRE, com ownerUid explícito). Bulk-select
  // continua acessível pelo checkbox .kb-card-sel-btn (já renderizado no
  // card) e pelo long-press no mobile — ver bloco touchstart abaixo. Não
  // usa mais timer de 260ms porque isso engolia o clique curto do próprio
  // dono do card e o painel de "Alterar responsável / etapa" nunca abria
  // com o _kbDetOwnerUid correto (bug relatado por Rhuan 2026-07-29).
  el.addEventListener('click',function(e){
    if(e.target.closest('.kb-card-menu')||e.target.closest('.kb-convert-btn')||
       e.target.closest('.kb-act-btn')||e.target.closest('.kb-card-del-btn')||
       e.target.closest('.kb-call-btn')||e.target.closest('.kb-wa-btn')||
       e.target.closest('.kb-copy-tel-btn')||e.target.closest('.kb-card-sel-btn')||
       e.target.closest('.kb-assume-btn'))return;
    var _ownerUidForOpen=effOwnerUid||(S&&S.userId)||'';
    if(_foreignVisibleLead){openKBDet(c.id,board,_ownerUidForOpen,false);return;}
    // Se o usuário já está com bulk-mode ligado (barra de seleção múltipla
    // visível) ou já tem algum card marcado, o clique continua alternando
    // seleção — o dono já mostrou intenção de operação em lote.
    if(_bulkMode||_bulkSelected.length>0){toggleBulkSelect(c.id,board,effOwnerUid,el);return;}
    openKBDet(c.id,board,_ownerUidForOpen,false);
  });
  // Long press (mobile) -> entra em bulk select
  // CORREÇÃO (auditoria, Android/iOS): este timer de 500ms competia com o timer de 320ms
  // do _touchZone (início do drag) — os dois escutam o MESMO touchstart no card. Segurando
  // o dedo parado: aos 320ms o clone de arraste já tinha aparecido (_tzState.tc setado,
  // card com opacity .3), e aos 500ms o toggleBulkSelect disparava por cima, deixando o
  // card visualmente "duplicado" (clone flutuante + destaque de selecionado ao mesmo
  // tempo). Ao soltar o dedo sem mover, o touchend do _touchZone rodava _kbMoveCard
  // (coluna igual, no-op) sempre seguido de renderKBLocal(board) — que recria os cards do
  // zero via _makeCard (que não reaplica a classe "selected" a partir de _bulkSelected),
  // apagando o destaque que o long-press acabara de aplicar. Agora, ao confirmar o
  // long-press, cancelamos o drag em andamento (_touchZoneCancelDrag) antes de selecionar;
  // o touchend do _touchZone não encontra mais _tzState.tc e não re-renderiza a coluna.
  //
  // CORREÇÃO 2 (auditoria, Android/iOS): a lista de exclusão deste touchstart só tinha
  // '.kb-card-menu' e '.kb-card-sel-btn', enquanto o handler de click (acima) e o início de
  // drag no _touchZone excluem consistentemente os 8 botões de ação do card. Faltando aqui
  // '.kb-convert-btn', '.kb-act-btn', '.kb-call-btn', '.kb-wa-btn', '.kb-copy-tel-btn' e
  // '.kb-card-del-btn', segurar um desses botões por >=500ms (comum por imprecisão do toque)
  // também disparava toggleBulkSelect no card por baixo, além da ação do próprio botão.
  var _lpTimer=null;
  el.addEventListener('touchstart',function(e){
    // R12B-03: long-press handler — no preventDefault
    if(_cardReadOnly)return;
    if(e.target.closest('.kb-card-menu')||e.target.closest('.kb-convert-btn')||
       e.target.closest('.kb-act-btn')||e.target.closest('.kb-call-btn')||
       e.target.closest('.kb-wa-btn')||e.target.closest('.kb-copy-tel-btn')||
       e.target.closest('.kb-card-del-btn')||e.target.closest('.kb-card-sel-btn')||
       e.target.closest('.kb-assume-btn'))return;
    _lpTimer=setTimeout(function(){
      _touchZoneCancelDrag();
      navigator.vibrate&&navigator.vibrate(40);
      toggleBulkSelect(c.id,board,effOwnerUid,el);
    },500);
  },{passive:true});
  el.addEventListener('touchend',function(){clearTimeout(_lpTimer);},{passive:true});
  el.addEventListener('touchmove',function(){clearTimeout(_lpTimer);},{passive:true});
  var actBtn=el.querySelector('.kb-act-btn');if(actBtn)actBtn.addEventListener('click',function(e){e.stopPropagation();_kbDetId=c.id;_kbDetBoard=board;_kbDetOwnerUid=effOwnerUid||(S&&S.userId)||'';openQuickActivity();});
  var delBtn=el.querySelector('.kb-card-del-btn');if(delBtn)delBtn.addEventListener('click',function(e){e.stopPropagation();deleteKBCard(c.id,board,effOwnerUid||activeUID(board));});
  var callBtn=el.querySelector('.kb-call-btn');if(callBtn)callBtn.addEventListener('click',function(e){e.stopPropagation();callClient(c.tel,c.name);});
  var waBtn=el.querySelector('.kb-wa-btn');if(waBtn)waBtn.addEventListener('click',function(e){e.stopPropagation();openWhatsApp(c.tel,c.name);});
  var copyBtn=el.querySelector('.kb-copy-tel-btn');if(copyBtn)copyBtn.addEventListener('click',function(e){e.stopPropagation();copyToClipboard(c.tel,'Número copiado!');});
  var cvBtn=el.querySelector('.kb-convert-btn');if(cvBtn)cvBtn.addEventListener('click',function(e){e.stopPropagation();openConvertModal(c.id,effOwnerUid);});
  var assumeBtn=el.querySelector('.kb-assume-btn');if(assumeBtn)assumeBtn.addEventListener('click',function(e){e.stopPropagation();assumeLead(c.id,board,effOwnerUid);});
  // FIX #6 (2026-07-20): em Leads, não existe mais botão .kb-card-menu (leadQuickBtn = ''). Só registra listener em Negócios.
  var _kbMenu = el.querySelector('.kb-card-menu');
  if(_kbMenu){
    _kbMenu.addEventListener('click',function(e){e.stopPropagation();_openCtx(c.id,board,effOwnerUid,e);});
  }
  return el;
}


// KB new/edit
var _kbEditId=null,_kbEditBoard=null,_kbEditOwnerUid=null;

// CORREÇÃO (auditoria, rastreamento de proveniência): editar um card via detalhe/menu de
// contexto abria o formulário com os dados corretos (usando _kbDetOwnerUid, o dono real do
// card), mas ao SALVAR, saveKBCard()/_finalizeSaveKBCard() buscavam e gravavam o array via
// activeList()/saveActive(), que resolvem o dono pelo "filtro de visão" do board
// (activeUID()) — em vez do dono real do card sendo editado. No modo "Todos" do ADM
// (_kbViewUid[board] vazio), activeUID() cai para S.userId (o próprio ADM), não o consultor
// dono do card. Resultado: ADM editava/convertia o card de outro consultor pelo menu de
// contexto → a busca do card no array errado falhava silenciosamente (if(cx) não entrava) →
// nada era de fato alterado, mas o toast dizia "Atualizado!" (falso sucesso) — e no caminho
// de conversão para Negócio, o negócio novo era criado sob o uid do ADM em vez do dono real.
// _kbEditOwnerUid guarda o dono real assim que o formulário de edição é aberto, pra ser usado
// no save (busca E gravação), em vez de re-derivar pelo filtro de visão no momento de salvar.
var _kbDetReadOnly=false,_kbDetTel='';

function openKBNew(board,colId){
  _kbEditId=null;_kbEditBoard=board;_kbEditOwnerUid=null;
  var mt=document.getElementById('mo-kb-title');if(mt)mt.textContent=board==='leads'?'Novo Lead':'Novo Negocio';
  ['kb-name','kb-tel','kb-obs'].forEach(function(id){var e=document.getElementById(id);if(e)e.value='';});
  if(typeof renderKBEditActivitySummary==='function')renderKBEditActivitySummary(null,null,null);
  var kn=document.getElementById('kb-nicho');
  // Para um novo LEAD, força o select a ficar vazio (opção "Selecione o nicho"), obrigando
  // o usuário a escolher antes de salvar — ver validação em saveKBCard(). Para Negócios
  // (que normalmente vêm de uma conversão de Lead) mantém o padrão "imovel" de antes.
  if(kn)kn.value=(board==='leads')?'':'imovel';
  var colSel=document.getElementById('kb-col');if(colSel)colSel.innerHTML=kbCols(board).map(function(c){return '<option value="'+_htmlAttr(c.id)+'"'+(c.id===colId?' selected':'')+'>'+eH(c.label)+'</option>';}).join('');
  var ei=document.getElementById('kb-edit-id');if(ei)ei.value='';
  var bt=document.getElementById('kb-board-type');if(bt)bt.value=board;
  openM('mo-kb');setTimeout(function(){var inp=document.getElementById('kb-name');if(inp)inp.focus();},100);
}

function saveKBCard(){
  var name=(document.getElementById('kb-name').value||'').trim();if(!name){toast('Nome obrigatorio');return;}
  var board=document.getElementById('kb-board-type').value;
  var editId=document.getElementById('kb-edit-id').value;
  // CORREÇÃO (auditoria): ao editar, usa o dono REAL do card (_kbEditOwnerUid, guardado em
  // editKBFromDet) em vez de activeList()/activeUID(), que resolvem pelo filtro de visão do
  // board e não pelo dono do card — ver comentário na declaração de _kbEditOwnerUid.
  var arr=editId?getKBFor(board,_kbEditOwnerUid||activeUID(board)):activeList(board);
  // Validação: nicho obrigatório ao CRIAR um novo Lead (não se aplica a edição nem a
  // Negócios, que normalmente já vêm de uma conversão com nicho preenchido).
  if(!editId&&board==='leads'){
    var nichoVal=(document.getElementById('kb-nicho').value||'');
    if(!nichoVal){
      toast('Selecione o nicho antes de salvar');
      var nichoSel=document.getElementById('kb-nicho');if(nichoSel)nichoSel.focus();
      return;
    }
  }
  // Detecção de duplicatas (Parte B): ao CRIAR um novo Lead com telefone de 8+ dígitos,
  // avisa (sem bloquear) se já existe outro registro com o mesmo número, em qualquer
  // consultor, em Leads ou Negócios.
  if(!editId&&board==='leads'){
    var telRaw=(document.getElementById('kb-tel').value||'').trim();
    var telNorm=telRaw.replace(/\D/g,'');
    if(telNorm.length>=8){
      var dupCount=_countDuplicatePhone(telNorm);
      if(dupCount>0){
        // Aviso não-bloqueante: usuário pode continuar ou cancelar
        if(typeof _confirmModal!=='function'){toast('Ação bloqueada: módulo de confirmação não carregado.');return;}

        _confirmModal({
          title:'⚠️ Telefone duplicado',
          msg:'Já existe(m) <strong>'+dupCount+'</strong> registro(s) com este número de telefone.<br><br>Deseja continuar e cadastrar mesmo assim?',
          okLabel:'Cadastrar mesmo assim',
          okClass:'bp',
          onOk:function(){_finalizeSaveKBCard(board,editId,arr);}
        });
        return; // espera confirmação no modal
      }
    }
  }
  _finalizeSaveKBCard(board,editId,arr);
}

function _finalizeSaveKBCard(board,editId,arr){
  var name=(document.getElementById('kb-name').value||'').trim();
  if(editId){
    var cx=arr.find(function(x){return x.id===editId;});
    if(cx){
      var newColVal=document.getElementById('kb-col').value;
      var oldColVal=cx.col;
      cx.name=name;cx.tel=(document.getElementById('kb-tel').value||'').trim();cx.nicho=document.getElementById('kb-nicho').value;cx.obs=(document.getElementById('kb-obs').value||'').trim();cx.updatedAt=new Date().toISOString();
      if(newColVal!==oldColVal&&board==='leads'&&newColVal==='conv'){
        // CORREÇÃO (auditoria): gravava com saveActive()/activeUID() (dono errado no modo
        // "Todos" do ADM) — agora grava e converte usando o dono real do card (_kbEditOwnerUid).
        var editOwner0=_kbEditOwnerUid||activeUID(board);
        var savedOk0=saveKBFor(board,editOwner0,arr);
        convertToNeg(editId,editOwner0,oldColVal);
        closeM('mo-kb');
        refreshKBAffected(['leads','negocios']);
        toast(savedOk0?'Atualizado!':'⚠️ Alteração pode não ter sido salva — armazenamento local cheio.');
        return;
      }
      if(newColVal!==oldColVal&&typeof _kbIsDiscardStage==='function'&&typeof _kbOpenDiscardReasonModal==='function'&&_kbIsDiscardStage(board,newColVal)){
        var editOwnerDiscard=_kbEditOwnerUid||activeUID(board);
        saveKBFor(board,editOwnerDiscard,arr);
        closeM('mo-kb');
        _kbOpenDiscardReasonModal({items:[{id:editId,board:board,ownerUid:editOwnerDiscard,targetCol:newColVal}],targetCol:newColVal});
        return;
      }
      if(newColVal!==oldColVal){
        cx.col=newColVal;
        // [FIX 20260820] mesma correção do _kbMoveCard — Negócios também
        // precisa saber quando entrou na etapa atual, não só Leads.
        cx.stageEnteredAt=new Date().toISOString();
        _pushHistorico(cx,'Movido de "'+_colLabel(board,oldColVal)+'" para "'+_colLabel(board,newColVal)+'" (edição)');
      }
    }
    if(S&&S.userId)logFeedEvent('create',S.userId,name,'Editado',board);
    // CORREÇÃO (auditoria): idem acima — grava no dono real do card, não no filtro de visão.
    var savedOk1=saveKBFor(board,_kbEditOwnerUid||activeUID(board),arr);closeM('mo-kb');renderKBLocal(board);
    toast(savedOk1?'Atualizado!':'⚠️ Alteração pode não ter sido salva — armazenamento local cheio.');
  }else{
    // CRIAÇÃO: sempre salva no próprio usuário logado (S.userId), independente do filtro ADM ativo
    var criarUid=(S&&S.userId);if(!criarUid){toast('Sessão expirada.');return;}
    var criarArr=getKBFor(board,criarUid);
    var _novoCreatedAt=new Date().toISOString();
    var novoCard={id:'kb_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),name:name,tel:(document.getElementById('kb-tel').value||'').trim(),nicho:document.getElementById('kb-nicho').value,col:document.getElementById('kb-col').value,obs:(document.getElementById('kb-obs').value||'').trim(),createdAt:_novoCreatedAt,userId:(S&&S.userId)||null,attachments:[],historico:[]};
    // [FIX 20260820] idem — um card recém-criado já "entra" na etapa
    // escolhida no momento da criação, pra Negócios também.
    novoCard.stageEnteredAt=_novoCreatedAt;
    _pushHistorico(novoCard,board==='leads'?'Lead criado':'Negócio criado');
    criarArr.unshift(novoCard);
    var savedOk2=saveKBFor(board,criarUid,criarArr);
    if(S&&S.userId)logFeedEvent('create',S.userId,name,'Novo '+board,board);
    // CORREÇÃO (auditoria, motor de automação — gatilho 'card_created'): o motor só era
    // acionado no boot (1,5s após abrir o app) e depois a cada 5min (setInterval). O
    // gatilho 'card_created' só considera o card "elegível" nos primeiros 60s após
    // criado — então, na prática, só ~20% dos cards criados (60s de 300s de ciclo)
    // chegavam a cair dentro de uma janela em que o motor rodava; os outros ~80%
    // nunca disparavam a automação, mesmo com uma regra ativa configurada pelo ADM.
    // Roda o motor imediatamente contra o card recém-criado pra garantir que a regra
    // tenha a chance real de avaliar/disparar.
    runAutomationEngine(board,criarArr,criarUid);
    toast(savedOk2?'Criado!':'⚠️ Registro pode não ter sido salvo — armazenamento local cheio.');
    closeM('mo-kb');

    var targetPage=(board==='leads'?'leads':'negocios');
    var currentPg=document.querySelector('.pg.on');
    var alreadyOnTarget=currentPg&&currentPg.id===('pg-'+targetPage);

    if(!alreadyOnTarget){
      goPage(targetPage);
    } else {
      // [FIX 20260821] renderKBLocal já chama renderKBMobile por dentro
      // quando isMobileView() — a chamada explícita aqui era redundante
      // (rodava renderKBMobile duas vezes seguidas, arriscando a mesma
      // corrida de rolagem corrigida em renderKBMobile).
      renderKBLocal(board);
    }

    setTimeout(function(){
      var el=document.querySelector('[data-id="'+novoCard.id+'"]');
      if(el){el.classList.add('new-anim');}
    },120);
  }
}

function openKBDet(cardId,board,ownerUid,readOnly){
  _kbDetId=cardId;_kbDetBoard=board;
  var uid=ownerUid||activeUID(board);
  _kbDetOwnerUid=uid;
  var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===cardId;});if(!c)return;
  /* LF-KB-DET-RO-20260804 */
  var limitedForeignAccess=(!readOnly&&uid&&S&&uid!==S.userId&&!_kbCanEditOwner(board,uid));
  var canAssumeForeignLivre=!!(limitedForeignAccess&&board==='leads'&&c.col==='livre');
  var stageReadOnly=(typeof _kbStageReadOnly==='function')?_kbStageReadOnly(board,c.col):false;
  var modalReadOnly=!!(readOnly||limitedForeignAccess||stageReadOnly);
  _kbDetReadOnly=modalReadOnly;
  var dn=document.getElementById('det-name');if(dn)dn.textContent=c.name;
  var dt='';try{if(c.createdAt)dt=new Date(c.createdAt).toLocaleString('pt-BR');}catch(e){console.warn("kanban datetime parse",e);}
  var dm=document.getElementById('det-meta');if(dm)dm.textContent=(c.tel||'')+(dt?' · '+dt:'');
  _kbDetTel=c.tel||'';
  var nb=document.getElementById('det-nicho-badge');if(nb){nb.className='kb-card-nicho '+(c.nicho||'outro');nb.textContent=NICHO_LABELS[c.nicho||'outro']||c.nicho||'';}
  var detActBtn=document.getElementById('det-act-btn');
  if(detActBtn){
    var detLate=(typeof _kbHasOverdueLinkedActivity==='function')&&_kbHasOverdueLinkedActivity(c,uid,board);
    detActBtn.classList.toggle('late',!!detLate);
  }
  var canAll=(getMyRole()==='gestor');
  var currentCol=c.col;
  var cardLocked=modalReadOnly||_kbCardLocked(board,c.col,'from');
  var ds=document.getElementById('det-stages');
  if(ds)ds.innerHTML=kbCols(board).map(function(col){var active=c.col===col.id;var restricted=cardLocked||_kbCardLocked(board,currentCol,'from')||_kbCardLocked(board,col.id,'target');return '<button class="det-stage-btn" style="border-color:'+(active?'var(--amber)':'var(--b1)')+';background:'+(active?'rgba(195,154,45,.12)':'transparent')+';color:'+(active?'var(--al)':'var(--mu)')+'"'+(restricted?' disabled':'')+(modalReadOnly?'':' onclick="moveCard(\''+cardId+'\',\''+board+'\',\''+col.id+'\',\''+uid+'\')"')+'>'+eH(col.label)+'</button>';}).join('');
  var dobs=document.getElementById('det-obs');if(dobs){dobs.value=c.obs||'';dobs.readOnly=modalReadOnly;}var dos=document.getElementById('det-obs-saved');if(dos)dos.textContent='';
  var dvw=document.getElementById('det-valor-wrap');if(dvw)dvw.style.display=board==='negocios'?'block':'none';
  var dv=document.getElementById('det-valor');if(dv){dv.value=c.valor||'';dv.readOnly=modalReadOnly;}
  var dcw=document.getElementById('det-convert-wrap');
  if(dcw){
    if(modalReadOnly&&!canAssumeForeignLivre)dcw.innerHTML='';
    else {
      var _detAssumeBtn='';
      if(board==='leads'&&c.col==='livre'&&uid!==(S&&S.userId))
        _detAssumeBtn='<button class="kb-assume-btn" onclick="assumeLead(\''+cardId+'\',\''+board+'\',\''+uid+'\')" style="margin-bottom:8px">✋ Assumir Lead</button>';
      if(canAssumeForeignLivre)dcw.innerHTML=_detAssumeBtn;
      else if(board==='leads'&&c.col!=='conv')dcw.innerHTML=_detAssumeBtn+'<button class="kb-convert-btn" onclick="openConvertModal(\''+cardId+'\',\''+uid+'\')">Converter em Negocio</button>';
      else if(board==='leads'&&c.col==='conv')dcw.innerHTML='<div style="font-size:.68rem;color:var(--ok);padding:6px 0">&#10003; Convertido em Negocio</div>';
      else dcw.innerHTML='';
    }
  }
  // Responsavel + etapa (so ADM/Gerente — mesma regra ja usada em Clientes).
  // Tarefa 2: junta "alterar responsavel" com "decidir se continua Lead ou vira Negocio"
  // no mesmo painel, sem precisar abrir outra tela pra isso.
  var dtw=document.getElementById('det-transfer-wrap');
  if(dtw){
    if(!modalReadOnly&&hasAdminAccess()){
      dtw.style.display='block';
      // FIX #11 (revisão 2026-07-20): a lista de "novo responsável" só trazia usuários
      // ATIVOS (u.ativo), ao contrário do requisito, que exige que TODOS os usuários do
      // CRM apareçam aqui — igual já foi corrigido na tela Usuários (ver renderUsers() em
      // usuarios.js). Além disso, essa lista não respeitava a preferência "Ocultar ADM das
      // listas" (lf_hide_adm_lists / getPrefs().hideAdmInLists), então o toggle não tinha
      // efeito nenhum sobre a troca de responsável — justamente o fluxo mais sensível.
      // Reaplica aqui a MESMA lógica de renderUsers() para as duas coisas ficarem
      // consistentes em qualquer tela do CRM. Exceção: se o dono ATUAL do card for o ADM
      // oculto, ele continua aparecendo na lista (senão o <select> perderia a opção
      // selecionada e o card seria reatribuído silenciosamente para outra pessoa sem
      // ninguém ter escolhido isso).
      var _hideAdm=false;
      try{
        var _prefs=(typeof getPrefs==='function')?(getPrefs()||{}):{};
        if(_prefs&&(_prefs.hideAdmInLists===true||_prefs.adm_hidden_in_lists===true))_hideAdm=true;
        if(!_hideAdm){var _ls=localStorage.getItem('lf_hide_adm_lists');if(_ls==='1'||_ls==='true')_hideAdm=true;}
      }catch(_e){}
      /* Regra de departamento (2026-08-17, pedido explícito): a lista de
         "novo responsável" deve respeitar o mesmo escopo já usado em
         todo o resto do CRM — ADM/gerente vê todo mundo, supervisor vê
         o time, consultor comum vê só o próprio departamento. Reaproveita
         _lfKBAdvFilterUsers() (mesma função já usada no filtro de busca)
         em vez de getUsers() puro, que trazia TODOS os usuários da
         empresa sem filtro nenhum de departamento. O dono ATUAL do card
         sempre aparece, mesmo se cair fora do escopo por algum motivo
         histórico — senão o <select> perderia a opção selecionada. */
      var _deptScopedUsers=(typeof _lfKBAdvFilterUsers==='function')?_lfKBAdvFilterUsers():getUsers().filter(function(u){return u.ativo!==false;});
      if(uid&&!_deptScopedUsers.find(function(u){return u&&u.id===uid;})){
        var _curOwner=(typeof getUser==='function')?getUser(uid):null;
        _deptScopedUsers=_deptScopedUsers.concat([_curOwner||{id:uid,nome:uid,ativo:true}]);
      }
      var trUsers=_deptScopedUsers.filter(function(u){return u.ativo!==false;}).filter(function(u){return _hideAdm?(u.id!=='adm'||u.id===uid):true;});
      var trSel = document.getElementById('det-resp-sel');
      if (trSel) {
        trSel.innerHTML =
          '<option value="">Selecione o responsável</option>' +
          trUsers.map(function(u){
            return '<option value="' + u.id + '">' +
              eH(u.nome) + (u.ativo === false ? ' (Inativo)' : '') +
            '</option>';
          }).join('');
      }
      /* Revalidação: se o cache local de usuários ('lf6_u') ainda não tinha sido
         hidratado da nuvem quando este painel abriu (ex.: supervisor é o primeiro a
         logar no aparelho), o dropdown acima pode ter vindo vazio ou incompleto.
         Busca de novo em segundo plano e só repinta se o modal ainda estiver aberto
         no MESMO card — sem deixar nenhum timer rodando depois disso. */
      if(typeof loadUsersDB==='function'){
        var _revalCardId=cardId,_revalBoard=board;
        loadUsersDB(function(freshList){
          if(_kbDetId!==_revalCardId||_kbDetBoard!==_revalBoard)return; // modal já mudou/fechou
          var sel=document.getElementById('det-resp-sel');
          if(!sel)return;
          var already=sel.options?sel.options.length:0;
          var fresh=(Array.isArray(freshList)?freshList:[]).filter(function(u){return u&&u.id;});
          // Mesmo recorte de departamento aplicado acima, agora sobre a
          // lista fresca vinda da nuvem.
          var _deptIds=null;
          try{_deptIds=(typeof _lfKBAdvFilterUsers==='function')?_lfKBAdvFilterUsers().map(function(u){return u.id;}):null;}catch(_e2){_deptIds=null;}
          var freshScoped=_deptIds?fresh.filter(function(u){return _deptIds.indexOf(u.id)>=0||u.id===uid;}):fresh;
          var freshFiltered=freshScoped.filter(function(u){return u.ativo!==false;}).filter(function(u){return _hideAdm?(u.id!=='adm'||u.id===uid):true;});
          if(already>=freshFiltered.length+1)return; // já tinha tudo, não perde a seleção do usuário
          var prevVal=sel.value;
          sel.innerHTML=
            '<option value="">Selecione o responsável</option>'+
            freshFiltered.map(function(u){
              return '<option value="'+u.id+'">'+eH(u.nome)+(u.ativo===false?' (Inativo)':'')+'</option>';
            }).join('');
          sel.value=prevVal||uid||'';
        });
      }

      var brdSel = document.getElementById('det-resp-board');
      if (brdSel) {
        brdSel.innerHTML =
          '<option value="">Selecione a aba</option>' +
          '<option value="leads">Lead</option>' +
          '<option value="negocios">Negócio</option>';
        // CORREÇÃO 2026-08-05: "Alterar responsável" não estava
        // funcionando na prática — os campos Aba/Etapa vinham vazios
        // por padrão (obrigando escolher de novo mesmo sem querer
        // mudar nada disso), e applyRespStage() exige os dois
        // preenchidos antes de salvar. Quem só queria trocar o
        // responsável esbarrava numa validação que parecia bug. Agora
        // vem pré-selecionado com o board/etapa ATUAIS do card — só
        // muda se a pessoa realmente quiser.
        brdSel.value = board;
      }

      var colSel = document.getElementById('det-resp-col');
      if (colSel) {
        if (typeof _fillDetRespCol === 'function') _fillDetRespCol(board, c.col);
        else colSel.innerHTML = '<option value="">Selecione a etapa</option>';
      }

      var motivoEl = document.getElementById('det-resp-motivo');
      if (motivoEl) motivoEl.value = '';
    }else dtw.style.display='none';
  }
  renderDetHistorico(c);
  // Reseta para aba Detalhes e atualiza badge de anexos
  document.querySelectorAll('#mo-kb-det .det-tab').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('#mo-kb-det .det-tab-pane').forEach(function(p){p.classList.remove('on');});
  var tabInfo=document.getElementById('det-tab-info');if(tabInfo)tabInfo.classList.add('on');
  var paneInfo=document.getElementById('det-pane-info');if(paneInfo)paneInfo.classList.add('on');
  renderDetAttachments(c,board,uid);
  // Botões de ação (Editar/Descartar/Excluir) ficam ocultos em modo leitura — Supervisor
  // pode ver tudo na página Time, mas não pode mover, editar ou excluir nada por lá.
  var mEdit=document.getElementById('det-btn-edit');if(mEdit)mEdit.style.display=modalReadOnly?'none':'';
  var mDiscard=document.getElementById('det-btn-discard');if(mDiscard)mDiscard.style.display=modalReadOnly?'none':'';
  var mDel=document.getElementById('det-btn-delete');if(mDel)mDel.style.display=modalReadOnly?'none':'';
  var mCallWrap=document.getElementById('det-contact-actions');
  if(mCallWrap){
    if(_kbDetTel)mCallWrap.innerHTML='<button class="kb-call-btn" onclick="callClient(_kbDetTel,document.getElementById(\'det-name\').textContent)">📞 Ligar</button><button class="kb-wa-btn" onclick="openWhatsApp(_kbDetTel,document.getElementById(\'det-name\').textContent)">✉️ WhatsApp</button>';
    else mCallWrap.innerHTML='';
  }
  if(typeof renderDetLinkedActivities==='function')renderDetLinkedActivities(board,cardId,uid);
  openM('mo-kb-det');
}

function renderDetLinkedActivities(board,cardId,ownerUid){
  var el=document.getElementById('det-activity-summary');if(!el)return;
  if(typeof _linkedActsSummaryHTML==='function')el.innerHTML=_linkedActsSummaryHTML(board,cardId,ownerUid,!_kbDetReadOnly);
}

function autoSaveKBObs(){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  c.obs=(document.getElementById('det-obs').value||'').trim();
  var okS=saveKBFor(board,uid,arr);var m=document.getElementById('det-obs-saved');if(m){m.textContent=okS?'Salvo':'⚠️ Não salvo';setTimeout(function(){m.textContent='';},1500);}
}

function autoSaveKBValor(){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  var raw=document.getElementById('det-valor').value;
  c.valor=raw?(parseFloat(raw)||0):0;
  var okV=saveKBFor(board,uid,arr);
  renderKBLocal(board);
  var m=document.getElementById('det-obs-saved');if(m){m.textContent=okV?'Salvo':'⚠️ Não salvo';setTimeout(function(){m.textContent='';},1500);}
}

// ============================================================
// HISTÓRICO POR CARD + MOVIMENTAÇÃO CENTRALIZADA (correções pedidas)
// Toda mudança de coluna (drag desktop, drag touch, botões de etapa,
// movimentação em massa) passa por _kbMoveCard, e toda troca de
// responsável (individual ou em massa) passa por _kbTransferCard.
// Isso evita ter a mesma lógica copiada em 3-4 lugares diferentes
// (o que já causava o lead "Convertido" não virar Negócio quando
// movido por drag-and-drop, só quando usado o botão manual) e
// garante que TUDO fique registrado no histórico do card.
// ============================================================
function _pushHistorico(card,texto,by){
  if(!card.historico)card.historico=[];
  card.historico.unshift({texto:texto,ts:new Date().toISOString(),by:by||(S&&S.nome)||'?'});
  if(card.historico.length>80)card.historico.length=80; // evita crescer pra sempre
}

/* Relógio da etapa do Lead: a regra de auto-envio para "livre" deve contar 3 dias na
   ETAPA ATUAL, não a partir de createdAt/updatedAt genérico. Para cards legados sem esse
   campo, semeamos "agora" uma única vez para evitar falso positivo imediato. */
function _kbSeedLeadStageEnteredAt(card,forceIso){
  if(!card)return null;
  var iso=forceIso||new Date().toISOString();
  card.stageEnteredAt=iso;
  return iso;
}

/* Proteção contra timestamp legado "podre": cards antigos migrados de versões anteriores
   às vezes só têm colEnteredAt/colUpdatedAt com datas muito antigas (de antes da coluna
   stageEnteredAt existir). Se aceitássemos essas datas como verdade histórica, o relógio de
   3 dias pra ir pra "livre" já nasceria vencido e o card seria varrido na primeira checagem,
   mesmo que o consultor tenha acabado de tocar nele. Por isso: se não há stageEnteredAt
   próprio E o fallback (colEnteredAt/colUpdatedAt) já é mais velho que o próprio limite de
   "parado", semeamos agora em vez de aceitar a data velha — dando o período de graça normal
   de 3 dias antes que o auto-move possa agir. Datas recentes continuam sendo respeitadas. */
function _kbGetLeadStageEnteredAt(card){
  if(!card)return null;
  if(card.stageEnteredAt){
    var ms0=new Date(card.stageEnteredAt).getTime();
    if(Number.isFinite(ms0))return card.stageEnteredAt;
  }
  var raw=card.colEnteredAt||card.colUpdatedAt||'';
  var ms=raw?new Date(raw).getTime():NaN;
  if(Number.isFinite(ms)){
    var isStale=(Date.now()-ms)>KB_STALE_TO_LIVRE_MS;
    if(isStale){
      card.__lfStageSeededAt=Date.now();
      return _kbSeedLeadStageEnteredAt(card);
    }
    return raw;
  }
  return _kbSeedLeadStageEnteredAt(card);
}

/* Etapa Livre: após 3 dias sem movimentação, o Lead é enviado automaticamente para a
   etapa "livre". Executada após a sincronização remota (não durante o render do card,
   onde estava antes — isso causava efeitos colaterais durante a pintura do kanban e
   duplicação de entradas no histórico). Registra na linha do tempo: responsável anterior,
   data e horário da movimentação automática. */
function _autoMoveStaleToLivre(board,list,ownerUid){
  if(board!=='leads')return;
  /* BUG #6 (2026-08-19): isLivreAutoMoveOn pode retornar null enquanto
     a preferência do servidor ainda não hidratou — nesse caso ADIAMOS
     o auto-move (não rodamos às cegas assumindo ligado). */
  if(typeof isLivreAutoMoveOn==='function'){
    var _livrePref=isLivreAutoMoveOn(ownerUid);
    if(_livrePref===null||_livrePref===undefined)return;
    if(!_livrePref)return;
  }
  if(!list||!list.length)return;
  var staleMs=KB_STALE_TO_LIVRE_MS;
  var now=Date.now();
  var changed=false;
  list.forEach(function(c){
    if(!c)return;
    /* Etapas terminais não são elegíveis: conv (convertido), desc (descartado), livre (já está lá) */
    if(c.col==='conv'||c.col==='desc'||c.col==='livre')return;
    var lastStageAt=_kbGetLeadStageEnteredAt(c);
    var lastStageMs=lastStageAt?new Date(lastStageAt).getTime():NaN;
    if(!Number.isFinite(lastStageMs)){_kbSeedLeadStageEnteredAt(c);changed=true;return;}
    if(!c.stageEnteredAt){changed=true;}
    if((now-lastStageMs)<=staleMs)return;
    /* Dupla confirmação: se o timestamp acabou de ser semeado agora (dado ausente/legado
       tratado por _kbGetLeadStageEnteredAt), não conta pra varredura desta rodada — precisa
       esperar os 3 dias de graça normais. E se o card foi ATUALIZADO recentemente por outro
       motivo (updatedAt/createdAt), também não é "parado de verdade" ainda. */
    if(c.__lfStageSeededAt&&(now-c.__lfStageSeededAt)<staleMs)return;
    var updMs=c.updatedAt?new Date(c.updatedAt).getTime():NaN;
    if(Number.isFinite(updMs)&&(now-updMs)<staleMs)return;
    var crtMs=c.createdAt?new Date(c.createdAt).getTime():NaN;
    if(Number.isFinite(crtMs)&&(now-crtMs)<staleMs)return;
    /* Auto-mover para livre */
    var prevRespNome='(sem responsável)';
    if(c.userId&&typeof getUser==='function'){
      var prevUser=getUser(c.userId);
      if(prevUser&&prevUser.nome)prevRespNome=prevUser.nome;
      else prevRespNome=c.userId;
    }
    var moveTs=new Date().toISOString();
    var dataStr=new Date(moveTs).toLocaleDateString('pt-BR');
    var horaStr=new Date(moveTs).toLocaleTimeString('pt-BR');
    c.col='livre';
    c.updatedAt=moveTs;
    c.stageEnteredAt=moveTs;
    _pushHistorico(c,'⏱ Auto-movido para Etapa Livre (parado '+KB_STALE_TO_LIVRE_DAYS+' dias) — Responsável anterior: '+prevRespNome+' · Data: '+dataStr+' · Horário: '+horaStr);
    changed=true;
  });
  if(changed)saveKBFor(board,ownerUid,list);
}

/* Etapa Livre — "Assumir Lead": permite que qualquer usuário logado assuma um Lead que
   esteja na etapa "livre". Usa o endpoint atômico dedicado (kanbanClaimLivre) — o
   servidor lê/confirma/move/grava tudo numa operação só, sem o cliente precisar
   ler o board de outra pessoa (LF-KANBAN-LIVRE-POOL, ver kanban-controller.js do
   Worker). Funciona pra QUALQUER cargo — não depende mais de cross-owner caps. */
function assumeLead(cardId,board,ownerUid){
  if(!S||!S.userId){toast('Sessão expirada.');return;}
  if(board!=='leads'){toast('Assumir Lead só está disponível para Leads.');return;}
  var uid=ownerUid||activeUID(board);
  if(uid===S.userId){toast('Você já é o responsável por este Lead.');return;}
  var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===cardId;});
  var localCol=c?c.col:null;
  if(c&&localCol!=='livre'){toast('Este Lead não está na Etapa Livre.');return;}
  var prevUser=getUser(uid);
  var prevNome=(prevUser&&prevUser.nome)||uid;
  var currentUser=getUser(S.userId);
  var currNome=(currentUser&&currentUser.nome)||(S&&S.nome)||S.userId;
  var wc=(typeof _kbWorkerClient==='function')?_kbWorkerClient():null;
  if(!wc||typeof wc.kanbanClaimLivre!=='function'){toast('Sem conexão com o servidor — tente novamente em instantes.');return;}
  wc.kanbanClaimLivre(cardId,uid).then(function(claimed){
    if(!claimed){toast('Não foi possível assumir — tente novamente.');return;}
    // Espelha localmente o que o servidor já fez: some do dono anterior,
    // aparece no próprio board, com o histórico dos 4 campos obrigatórios.
    var now=new Date();
    var dataStr=now.toLocaleDateString('pt-BR');
    var horaStr=now.toLocaleTimeString('pt-BR');
    var histText='✋ Lead assumido da Etapa Livre — Responsável anterior: '+prevNome+' · Assumido por: '+currNome+' · Data: '+dataStr+' · Horário: '+horaStr;
    var newCard=Object.assign({},claimed);
    if(!newCard.respHistory)newCard.respHistory=[];
    newCard.respHistory.push({from:prevNome,fromId:uid,to:currNome,toId:S.userId,ts:now.toISOString(),by:currNome,reason:'Etapa Livre — Assumir Lead'});
    if(typeof _pushHistorico==='function')_pushHistorico(newCard,histText,currNome);
    var oldOriginArr=getKBFor(board,uid).filter(function(x){return x.id!==cardId;});
    ss(kbKeyFor(board,uid),oldOriginArr);
    var destArr=getKBFor(board,S.userId).filter(function(x){return x.id!==cardId;});
    destArr.push(newCard);
    saveKBFor(board,S.userId,destArr);
    toast('✋ Lead assumido com sucesso!');
    renderKBLocal('leads');
    if(typeof isMobileView==='function'&&isMobileView()&&typeof renderKBMobile==='function')renderKBMobile('leads');
    if(typeof _lfRefreshLivrePoolFromServer==='function')_lfRefreshLivrePoolFromServer(true);
    /* Se o modal de detalhes estiver aberto para este card, atualiza o histórico */
    if(typeof _kbDetId!=='undefined'&&_kbDetId===cardId&&newCard){
      if(typeof renderDetHistorico==='function')renderDetHistorico(newCard);
    }
  }).catch(function(e){
    console.warn('[kb] assumir lead falhou',e);
    var msg=(e&&e.message)?String(e.message):'';
    var friendly='⚠ Não foi possível assumir o Lead. Tente novamente.';
    if(msg.indexOf('departamento')>=0)friendly='⚠ Este Lead é de outro departamento — só dá pra assumir leads livres do seu próprio departamento.';
    else if(msg.indexOf('Livre')>=0)friendly='⚠ Este Lead não está (mais) na Etapa Livre — atualize a lista.';
    toast(friendly,4000);
    if(typeof _lfRefreshLivrePoolFromServer==='function')_lfRefreshLivrePoolFromServer(true);
  });
}


function moveCard(cardId,board,newCol,ownerUid){
  var uid=ownerUid||activeUID(board);
  var _preArr=getKBFor(board,uid);var _preCard=_preArr.find(function(x){return x.id===cardId;});
  if(_preCard&&_kbCardLocked(board,_preCard.col,'from')){toast('🔒 Apenas o Gestor pode mover a partir desta etapa.');return;}
  if(_kbCardLocked(board,newCol,'target')){toast('🔒 Apenas o Gestor pode mover para esta etapa.');return;}
  var card=_kbMoveCard(cardId,board,uid,newCol);
  if(!card)return;
  var canAll=(getMyRole()==='gestor');
  var ds=document.getElementById('det-stages');
  if(ds)ds.innerHTML=kbCols(board).map(function(col){var active=card.col===col.id;var restricted=_kbCardLocked(board,card.col,'from')||_kbCardLocked(board,col.id,'target');return '<button class="det-stage-btn" style="border-color:'+(active?'var(--amber)':'var(--b1)')+';background:'+(active?'rgba(195,154,45,.12)':'transparent')+';color:'+(active?'var(--al)':'var(--mu)')+'"'+(restricted?' disabled':'')+' onclick="moveCard(\''+cardId+'\',\''+board+'\',\''+col.id+'\',\''+uid+'\')">'+eH(col.label)+'</button>';}).join('');
  var dcw=document.getElementById('det-convert-wrap');
  if(dcw){
    if(board==='leads'&&card.col!=='conv')dcw.innerHTML='<button class="kb-convert-btn" onclick="openConvertModal(\''+cardId+'\',\''+uid+'\')">Converter em Negocio</button>';
    else if(board==='leads'&&card.col==='conv')dcw.innerHTML='<div style="font-size:.68rem;color:var(--ok);padding:6px 0">&#10003; Convertido em Negocio</div>';
    else dcw.innerHTML='';
  }
  // [FIX 20260821] renderKBLocal() já chama renderKBMobile() internamente
  // quando isMobileView() (ver dentro dela) — não precisa (e não deve)
  // chamar de novo aqui, senão renderKBMobile roda duas vezes seguidas
  // pra uma única troca de etapa, arriscando uma corrida entre a captura
  // de rolagem da segunda chamada e a restauração (agendada via rAF)
  // ainda pendente da primeira — o mesmo tipo de corrida que já causou
  // reset de rolagem noutro lugar do app.
  renderKBLocal(board);
}

function editKBFromDet(){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  closeM('mo-kb-det');_kbEditId=id;_kbEditBoard=board;_kbEditOwnerUid=uid;
  var mt=document.getElementById('mo-kb-title');if(mt)mt.textContent='Editar';
  var _kn=document.getElementById('kb-name');if(_kn)_kn.value=c.name||'';var _kt=document.getElementById('kb-tel');if(_kt)_kt.value=c.tel||'';var _kni=document.getElementById('kb-nicho');if(_kni)_kni.value=c.nicho||'imovel';var _ko=document.getElementById('kb-obs');if(_ko)_ko.value=c.obs||'';
  var cs=document.getElementById('kb-col');if(cs)cs.innerHTML=kbCols(board).map(function(col){return '<option value="'+_htmlAttr(col.id)+'"'+(col.id===c.col?' selected':'')+'>'+eH(col.label)+'</option>';}).join('');
  var _kei=document.getElementById('kb-edit-id');if(_kei)_kei.value=id;var _kbt=document.getElementById('kb-board-type');if(_kbt)_kbt.value=board;if(typeof renderKBEditActivitySummary==='function')renderKBEditActivitySummary(board,id,uid);
  setTimeout(function(){openM('mo-kb');var inp=document.getElementById('kb-name');if(inp)inp.focus();},40);
}

function deleteKBFromDet(){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  // "Descartar" (botão na mbtns) continua sendo o fluxo de mover para coluna de descarte —
  // ver discardKBFromDet(). Este aqui é mantido apenas como alias de compatibilidade para
  // o contexto antigo que chamava deleteKBFromDet() esperando exclusão permanente.
  // CORREÇÃO (auditoria): usava activeUID(board) em vez do dono real do card aberto no
  // detalhe (_kbDetOwnerUid), mesmo problema descrito em _kbEditOwnerUid. Esta função está
  // sem nenhum chamador no momento desta auditoria, mas corrigido por segurança caso volte
  // a ser usada.
  deleteKBCard(id,board,_kbDetOwnerUid||activeUID(board));
}

/* Abre o modal de conversão (Tarefa 7): deixa escolher em qual etapa do funil de Negócios
   o card vai entrar, e já preencher valor da venda / observação nesse mesmo passo, em vez
   de só ter um botão genérico que converte direto pra primeira etapa. */
function openConvertModal(cardId,ownerUid){
  var uid=ownerUid||activeUID('leads');var arr=getKBFor('leads',uid);
  var c=arr.find(function(x){return x.id===cardId;});if(!c)return;
  closeM('mo-kb-det');
  var nm=document.getElementById('conv-neg-nome');if(nm)nm.textContent=c.name;
  var sel=document.getElementById('conv-neg-col');
  if(sel)sel.innerHTML=KB_NEG_COLS.map(function(col){return '<option value="'+_htmlAttr(col.id)+'"'+(col.id==='retag'?' selected':'')+'>'+eH(col.label)+'</option>';}).join('');
  var vv=document.getElementById('conv-neg-valor');if(vv)vv.value='';
  var ov=document.getElementById('conv-neg-obs');if(ov)ov.value=c.obs||'';
  var _cnci=document.getElementById('conv-neg-card-id');if(_cnci)_cnci.value=cardId;
  var _cnou=document.getElementById('conv-neg-owner-uid');if(_cnou)_cnou.value=uid||'';
  openM('mo-conv-neg');
}

function confirmConvertToNeg(){
  var cardId=document.getElementById('conv-neg-card-id').value;if(!cardId)return;
  var uid=document.getElementById('conv-neg-owner-uid').value;
  var col=document.getElementById('conv-neg-col').value;
  var valor=document.getElementById('conv-neg-valor').value;
  var obs=document.getElementById('conv-neg-obs').value;
  closeM('mo-conv-neg');
  convertToNeg(cardId,uid,undefined,false,{col:col,valor:valor,obs:obs});
}

/* Reverso de convertToNeg. Se o Lead original ainda existir, restaura a etapa em que ele
   estava antes de virar Negócio (colAntesConv) — ou a etapa explicitamente escolhida em
   targetCol. Se o Lead original já tiver sido excluído, recria um novo Lead com os dados
   do Negócio. O registro de Negócio é removido em seguida. Não há mais um botão dedicado
   pra isso nos cards/menu de Negócios (Tarefa 4) — a reversão agora só acontece através do
   fluxo de "alterar responsável + etapa" no detalhe do card (ver applyRespStage), por isso
   aceita silent/targetCol pra ser chamada sem o confirm() de uso avulso. */
function convertToLead(cardId,ownerUid,silent,targetCol){
  var uid=ownerUid||activeUID('negocios');var negArr=getKBFor('negocios',uid);
  var n=negArr.find(function(x){return x.id===cardId;});if(!n)return null;
  if(!silent){
    if(typeof _confirmModal!=='function'){toast('Ação bloqueada: módulo de confirmação não carregado.');return;}

    _confirmModal({
      title:'↩️ Reverter para Lead?',
      msg:'Converter <strong>'+eH(n.name)+'</strong> de volta para Lead?<br><span style="font-size:.78rem;color:var(--mu)">O registro de Negócio será removido.</span>',
      okLabel:'Reverter para Lead',
      okClass:'bd',
      onOk:function(){_doConvertToLead(cardId,uid,targetCol);}
    });
    return null; // resultado assíncrono; chamador deve tratar silent=true nos fluxos automáticos
  }
  return _doConvertToLead(cardId,uid,targetCol);
}

function _doConvertToLead(cardId,uid,targetCol){
  var negArr=getKBFor('negocios',uid);
  var n=negArr.find(function(x){return x.id===cardId;});if(!n)return null;
  var leadsArr=getKBFor('leads',uid);
  var lead=n.originalLeadId?leadsArr.find(function(x){return x.id===n.originalLeadId;}):null;
  var okL;
  var nowIso=new Date().toISOString();
  var histBase=Array.isArray(n.historico)?n.historico.slice():[];
  if(lead){
    lead.col=targetCol||lead.colAntesConv||'livre';
    lead.updatedAt=nowIso;
    if(typeof _kbSeedLeadStageEnteredAt==='function')_kbSeedLeadStageEnteredAt(lead,nowIso);
    lead.regressedFromBusinessId=n.id;
    lead.regressedAt=nowIso;
    lead.regressedFromCol=n.col||null;
    if(Array.isArray(lead.historico)&&histBase.length){
      histBase.slice().reverse().forEach(function(h){
        if(!h)return;
        var exists=lead.historico.some(function(x){return x&&x.ts===h.ts&&x.texto===h.texto;});
        if(!exists)lead.historico.push(h);
      });
    }
    _pushHistorico(lead,'Lead regredido a partir do Negócio (etapa: "'+_colLabel('leads',lead.col)+'" · origem em Negócios: "'+_colLabel('negocios',n.col||'retag')+'")');
    okL=saveKBFor('leads',uid,leadsArr);
  }else{
    lead={id:'kb_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),name:n.name,tel:n.tel,nicho:n.nicho,col:targetCol||'livre',obs:n.obs||'',createdAt:nowIso,userId:uid,attachments:[],historico:Array.isArray(n.historico)?n.historico.slice(0,79):[]};
    lead.regressedFromBusinessId=n.id;
    lead.regressedAt=nowIso;
    lead.regressedFromCol=n.col||null;
    _pushHistorico(lead,'Lead regredido a partir do Negócio "'+n.name+'" (o lead original não estava mais na base)');
    leadsArr.push(lead);okL=saveKBFor('leads',uid,leadsArr);
  }
  negArr=negArr.filter(function(x){return x.id!==cardId;});
  if(typeof window._lfMarkRecentlyDeleted==='function')window._lfMarkRecentlyDeleted(cardId);
  var okN=saveKBFor('negocios',uid,negArr);
  var _scrollSnap=_kbCaptureScrollSnapshot();
  renderKBLocal('negocios');renderKBLocal('leads');
  _kbScheduleScrollRestore(_scrollSnap);
  if(S&&S.userId)logFeedEvent('move',S.userId,n.name,'Negócio -> Lead (regredido)','negocios');
  toast((okL&&okN)?(n.name+' -> Leads!'):'⚠️ Reversão pode não ter sido salva — armazenamento local cheio.');
  return lead;
}

/* Preenche o select de etapa do painel "Continua como" de acordo com o board escolhido
   (Lead ou Negocio tem listas de etapas diferentes). */
function _fillDetRespCol(board, selectedCol){
  var colSel = document.getElementById('det-resp-col');
  if (!colSel) return;

  if (!board) {
    colSel.innerHTML = '<option value="">Selecione a etapa</option>';
    return;
  }

  colSel.innerHTML =
    '<option value="">Selecione a etapa</option>' +
    kbCols(board).map(function(col){
      return '<option value="' + col.id + '"' +
        (col.id === selectedCol ? ' selected' : '') +
        '>' + eH(col.label) + '</option>';
    }).join('');
}

function onDetRespBoardChange(){
  var brd=document.getElementById('det-resp-board');if(!brd)return;
  _fillDetRespCol(brd.value,null);
}

/* Tarefa 2: no mesmo painel de "alterar responsavel" tambem decide se o registro continua
   como Lead ou vira Negocio (e em qual etapa), sem precisar abrir outra tela. So
   ADM/Gerente pode fazer isso (mesma regra ja usada na transferencia de Clientes —
   Supervisor NAO tem esse acesso desde a atualizacao de hierarquia de cargos, ver
   comentario acima de CARGOS_NIVEL_ADMIN). Faz a troca de board primeiro (se houver) e
   so depois transfere o responsavel, ja que converter gera um id novo de card. */
function applyRespStage(){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  if(!hasAdminAccess()){toast('Somente ADM/Gerente pode alterar.');return;}
  var uid=(_kbDetOwnerUid||activeUID(board));
  var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  // FIX #11 (2026-07-20): validar TODOS os campos obrigatórios antes de aplicar.
  var rawBoard=(document.getElementById('det-resp-board')||{}).value||'';
  var rawCol=(document.getElementById('det-resp-col')||{}).value||'';
  var rawUid=(document.getElementById('det-resp-sel')||{}).value||'';
  var rawMotivo=(document.getElementById('det-resp-motivo')||{}).value||'';
  if (!rawUid) { toast('⚠ Selecione o novo responsável'); return; }
  if (!rawBoard) { toast('⚠ Selecione: Leads ou Negócios'); return; }
  if (!rawCol) { toast('⚠ Selecione a etapa'); return; }
  if (!String(rawMotivo).trim()) { toast('⚠ Informe o motivo da alteração'); return; }

  if (rawUid === uid && rawBoard === board && rawCol === c.col) {
    toast('⚠ Nenhuma alteração foi selecionada');
    return;
  }
  var newBoard=rawBoard;
  var newCol=rawCol;
  var newUid=rawUid;
  if(newBoard===board&&newUid===uid&&newCol&&newCol!==c.col&&typeof _kbIsDiscardStage==='function'&&typeof _kbOpenDiscardReasonModal==='function'&&_kbIsDiscardStage(board,newCol)){
    _kbOpenDiscardReasonModal({items:[{id:id,board:board,ownerUid:uid,targetCol:newCol}],targetCol:newCol});
    return;
  }
  // FIX #11 refinado (2026-07-20): guardar dados do motivo em variáveis,
  // aplicar histórico DEPOIS da conversão (senão o motivo se perde no card antigo).
  var _lfMotivoTxt = 'Responsável alterado. Motivo: '+String(rawMotivo).trim()+'. De: '+(typeof getUser==='function'?((getUser(uid)||{}).nome||uid):uid)+' para: '+(typeof getUser==='function'?((getUser(newUid)||{}).nome||newUid):newUid);
  if(newBoard!==board){
    if(board==='leads'&&newBoard==='negocios'){
      convertToNeg(id,uid,undefined,true,{col:newCol,valor:0,obs:c.obs||''});
      var negArr=getKBFor('negocios',uid);
      c=negArr.find(function(x){return x.originalLeadId===id;})||negArr[negArr.length-1];
    }else if(board==='negocios'&&newBoard==='leads'){
      c=convertToLead(id,uid,true,newCol);
    }
    if(!c){toast('Não foi possível alterar a etapa.');return;}
    board=newBoard;id=c.id;
  }else if(newCol&&newCol!==c.col){
    _kbMoveCard(id,board,uid,newCol,true);
  }
  // Aplicar histórico do motivo NO CARD FINAL (após possível conversão)
  if(typeof _pushHistorico==='function' && c){
    try { _pushHistorico(c, _lfMotivoTxt); } catch(_e){}
  }
  if(newUid&&newUid!==uid){
    /* FIX 2026-07-28: fecha modal e renderiza otimisticamente ANTES do await remoto,
       para que a mudança apareça instantânea. _kbTransferCard já serializa os PUTs
       (destino -> origem) e faz o rerender final com a lista consolidada. */
    closeM('mo-kb-det');
    try{
      var _uidCur=(S&&S.userId)||'';
      var _srcArr=getKBFor(board,uid)||[];
      var _newSrc=_srcArr.filter(function(x){return x.id!==id;});
      ss(kbKeyFor(board,uid),_newSrc);
      var _dstArr=getKBFor(board,newUid)||[];
      var _idxDst=-1;for(var _i=0;_i<_dstArr.length;_i++){if(_dstArr[_i]&&_dstArr[_i].id===id){_idxDst=_i;break;}}
      var _cardOpt=_srcArr.find(function(x){return x.id===id;});
      if(_cardOpt){
        _cardOpt=JSON.parse(JSON.stringify(_cardOpt));
        _cardOpt.userId=newUid;_cardOpt.updatedAt=new Date().toISOString();
        if(_idxDst>=0)_dstArr[_idxDst]=_cardOpt;else _dstArr.push(_cardOpt);
        ss(kbKeyFor(board,newUid),_dstArr);
      }
    }catch(_e){/* se pintura otimista falhar, o rerender final corrige */}
    // [FIX 20260822] mesma corrida já corrigida em bulkConvert — dois
    // redesenhos (otimista + final assíncrono) cada um tentando proteger
    // a rolagem por conta própria colidiam entre si. Uma captura só, antes
    // de qualquer redesenho, com a restauração vencendo só depois do
    // ÚLTIMO redesenho (dentro do callback assíncrono).
    var _scrollSnapResp=(typeof _kbCaptureScrollSnapshot==='function')?_kbCaptureScrollSnapshot():null;
    renderKBLocal('leads');renderKBLocal('negocios');
    _kbTransferCard(id,board,uid,newUid,true,function(res){
      renderKBLocal('leads');renderKBLocal('negocios');
      if(_scrollSnapResp&&typeof _kbScheduleScrollRestore==='function')_kbScheduleScrollRestore(_scrollSnapResp);
      if(res)toast('Atualizado!');
    });
  }else{
    closeM('mo-kb-det');
    var _scrollSnapResp2=(typeof _kbCaptureScrollSnapshot==='function')?_kbCaptureScrollSnapshot():null;
    renderKBLocal('leads');renderKBLocal('negocios');
    if(_scrollSnapResp2&&typeof _kbScheduleScrollRestore==='function')_kbScheduleScrollRestore(_scrollSnapResp2);
    toast('Atualizado!');
  }
}

// Context menu
// Listener PERSISTENTE (instalado uma única vez, capture-phase), escuta
// pointerdown/touchstart/click e fecha o menu quando o alvo não é
// descendente de #kb-ctx nem do gatilho que abriu (⋮). Antes, o listener
// era criado a cada abertura, escutava só 'click' (tap no Android/iOS
// muitas vezes não dispara click, só touchstart/touchend — o menu ficava
// aberto pra sempre) e se autorremovia no primeiro disparo mesmo quando
// o clique caía dentro do menu (fechamentos seguintes paravam de funcionar).
var _ctxOutsideInstalled=false;
function _installCtxOutsideHandler(){
  if(_ctxOutsideInstalled)return;
  _ctxOutsideInstalled=true;
  function onOutside(ev){
    var ctx=document.getElementById('kb-ctx');
    if(!ctx||ctx.style.display==='none')return;
    var t=ev.target;
    if(t&&ctx.contains&&ctx.contains(t))return; // clique dentro do menu: não fecha aqui
    ctx.style.display='none';
  }
  document.addEventListener('pointerdown',onOutside,true);
  document.addEventListener('touchstart',onOutside,true);
  document.addEventListener('click',onOutside,true);
}

function _openCtx(cardId,board,ownerUid,e){
  _kbCtxId=cardId;_kbCtxBoard=board;_kbCtxOwner=ownerUid;
  var ctx=document.getElementById('kb-ctx');if(!ctx)return;
  var cvBtn=document.getElementById('ctx-convert'),cvSep=document.getElementById('ctx-conv-sep');
  if(cvBtn)cvBtn.style.display=(board==='leads')?'block':'none';
  if(cvSep)cvSep.style.display=(board==='leads')?'block':'none';
  ctx.style.display='block';
  ctx.style.left='-9999px';ctx.style.top='-9999px';
  var anchor=(e&&e.currentTarget)||(e&&e.target)||null;
  var x=(e&&typeof e.clientX==='number'&&e.clientX>0)?e.clientX:null;
  var y=(e&&typeof e.clientY==='number'&&e.clientY>0)?e.clientY:null;
  if((x===null||y===null)&&anchor&&anchor.getBoundingClientRect){
    var ar=anchor.getBoundingClientRect();
    x=ar.right-10;y=ar.bottom+8;
  }
  if(x===null||y===null){x=window.innerWidth/2;y=window.innerHeight/2;}
  var pad=12,mw=ctx.offsetWidth||170,mh=ctx.offsetHeight||240;
  x=Math.max(pad,Math.min(x,window.innerWidth-mw-pad));
  y=Math.max(pad,Math.min(y,window.innerHeight-mh-pad));
  ctx.style.left=Math.round(x)+'px';ctx.style.top=Math.round(y)+'px';
  _installCtxOutsideHandler();
}

function _closeCtx(){var ctx=document.getElementById('kb-ctx');if(ctx)ctx.style.display='none';_kbCtxId=null;_kbCtxBoard=null;_kbCtxOwner=null;}

function ctxView(){var id=_kbCtxId,board=_kbCtxBoard,owner=_kbCtxOwner;_closeCtx();if(id&&board)openKBDet(id,board,owner);}

function ctxEdit(){var id=_kbCtxId,board=_kbCtxBoard,owner=_kbCtxOwner;_closeCtx();if(!id||!board)return;_kbDetId=id;_kbDetBoard=board;openKBDet(id,board,owner);setTimeout(editKBFromDet,50);}

function ctxConvert(){var id=_kbCtxId,board=_kbCtxBoard,owner=_kbCtxOwner;_closeCtx();if(board==='leads'&&id)openConvertModal(id,owner);}

function ctxDel(){var id=_kbCtxId,board=_kbCtxBoard,owner=_kbCtxOwner;_closeCtx();if(id&&board)deleteKBCard(id,board,owner);}

function ctxActivity(){var id=_kbCtxId,board=_kbCtxBoard,owner=_kbCtxOwner;_closeCtx();if(!id||!board)return;_kbDetId=id;_kbDetBoard=board;_kbDetOwnerUid=owner;openQuickActivity();}

function ctxDiscard(){var id=_kbCtxId,board=_kbCtxBoard,owner=_kbCtxOwner;_closeCtx();if(!id||!board)return;_kbDetId=id;_kbDetBoard=board;_kbDetOwnerUid=owner;discardKBFromDet();}

// Discard
var _discardId=null,_discardBoard=null,_discardMotivo=null,_discardOwner=null;
var _discardState={items:[],reason:null,targetCol:null,afterConfirm:null};

function _kbUnifiedReasonLabel(reason){
  var map={ja_comprou:'Já comprou',sem_interesse:'Sem interesse',em_tratativa:'Em tratativa',duplicado:'Duplicado',bug_teste:'Bug ou Teste',numero_nao_existe:'Número não existe'};
  return map[reason]||((typeof _kbDiscardReasonLabel==='function'&&_kbDiscardReasonLabel(reason))||reason||'');
}

function _kbIsDiscardStage(board,col){
  if(!board||!col)return false;
  if(board==='leads')return col==='desc';
  if(board==='negocios')return col==='noshow'||col==='desist';
  return false;
}

function _kbOpenDiscardReasonModal(opts){
  opts=opts||{};
  var items=Array.isArray(opts.items)?opts.items.filter(function(x){return x&&x.id&&x.board;}):[];
  if(!items.length)return false;
  var first=items[0];
  var uid=first.ownerUid||activeUID(first.board);
  var arr=getKBFor(first.board,uid);
  var c=arr.find(function(x){return x.id===first.id;});
  _discardState={items:items,reason:null,targetCol:opts.targetCol||null,afterConfirm:(typeof opts.afterConfirm==='function'?opts.afterConfirm:null)};
  _discardId=first.id;_discardBoard=first.board;_discardMotivo=null;_discardOwner=uid;
  var dn=document.getElementById('discard-nome');
  if(dn)dn.textContent=(items.length===1&&c&&c.name)?c.name:(items.length+' card'+(items.length>1?'s':'')+' selecionado'+(items.length>1?'s':''));
  var dow=document.getElementById('discard-outro-wrap');if(dow)dow.style.display='block';
  var dot=document.getElementById('discard-outro-txt');if(dot)dot.value='';
  document.querySelectorAll('#discard-opts .discard-opt').forEach(function(b){b.classList.remove('sel');});
  var cb=document.getElementById('discard-confirm-btn');if(cb){cb.disabled=true;cb.style.opacity='.45';cb.style.cursor='not-allowed';}
  closeM('mo-kb-det');
  openM('mo-discard');
  return true;
}

function discardKBFromDet(){
  var id=_kbDetId,board=_kbDetBoard;if(!id||!board)return;
  var uid=(_kbDetOwnerUid||activeUID(board));
  _kbOpenDiscardReasonModal({items:[{id:id,board:board,ownerUid:uid}]});
}

function selDiscardOpt(motivo,btn){
  _discardMotivo=motivo;
  if(_discardState)_discardState.reason=motivo;
  document.querySelectorAll('#discard-opts .discard-opt').forEach(function(b){b.classList.remove('sel');});
  if(btn)btn.classList.add('sel');
  var cb=document.getElementById('discard-confirm-btn');if(cb){cb.disabled=false;cb.style.opacity='';cb.style.cursor='';}
}

function confirmDiscard(){
  var detalhe=((document.getElementById('discard-outro-txt')||{}).value||'').trim();
  var motivo=(_discardState&&_discardState.reason)||_discardMotivo;
  if(!motivo){toast('Selecione um motivo para descartar o card');return;}
  var items=(_discardState&&Array.isArray(_discardState.items)&&_discardState.items.length)?_discardState.items:[{id:_discardId,board:_discardBoard,ownerUid:_discardOwner,targetCol:null}];
  var motivoLabel=_kbUnifiedReasonLabel(motivo);
  var reasonText=motivoLabel+(detalhe?' - '+detalhe:'');
  var affected={};
  var linkedNegChanged=false;
  var allOk=true;
  var doneCount=0;
  /* RECOMENDAÇÃO E + BUG #5 (2026-08-19): quando a fachada unificada
     LF.leads.discard está carregada, delegamos TODA a mutação de dados
     a ela — kanban + atividades + card embutido + negócio vinculado +
     feed no mesmo lote transacional. O modal, o toast e o afterConfirm
     continuam aqui. Se o patch não estiver presente (ordem de carga),
     cai no caminho legado abaixo, inalterado. */
  var _useFacade=!!(window.LF&&window.LF.leads&&typeof window.LF.leads.discard==='function');
  items.forEach(function(item){
    var board=item.board;
    var uid=item.ownerUid||activeUID(board);
    if(_useFacade){
      var r=window.LF.leads.discard(item.id,motivo,{
        board:board,
        ownerUid:uid,
        targetCol:item.targetCol||(_discardState&&_discardState.targetCol)||((board==='negocios')?'noshow':'desc'),
        detalhe:detalhe
      });
      if(!r.ok&&r.error==='card_not_found')return;
      if(!r.ok)allOk=false;
      affected[board]=true;
      if(r.linkedNegChanged){affected.negocios=true;linkedNegChanged=true;}
      doneCount++;
      return;
    }
    var arr=getKBFor(board,uid);
    var c=arr.find(function(x){return x.id===item.id;});
    if(!c)return;
    var ts=new Date().toISOString();
    var targetCol=item.targetCol||(_discardState&&_discardState.targetCol)||((board==='negocios')?'noshow':'desc');
    c.discarded=true;
    c.discardedAt=ts;
    c.discardMotivo=motivo;
    c.discardMotivoLabel=reasonText;
    c.col=targetCol;
    c.updatedAt=ts;
    if(typeof _pushHistorico==='function')_pushHistorico(c,'Descartado: '+reasonText);
    if(!saveKBFor(board,uid,arr))allOk=false;
    affected[board]=true;
    doneCount++;
    if(board==='leads'){
      var negArr=getKBFor('negocios',uid);
      var changed=false;
      negArr.forEach(function(n){
        if(n.originalLeadId===item.id){
          n.discarded=true;
          n.discardedAt=ts;
          n.discardMotivo=motivo;
          n.discardMotivoLabel=reasonText;
          n.col='noshow';
          n.updatedAt=ts;
          if(typeof _pushHistorico==='function')_pushHistorico(n,'Descartado: '+reasonText+' (vinculado ao Lead descartado)');
          changed=true;
          linkedNegChanged=true;
        }
      });
      if(changed){
        affected.negocios=true;
        if(!saveKBFor('negocios',uid,negArr))allOk=false;
      }
    }
    /* Fallback legado também fecha as atividades do lead (bug #5) —
       mesmo sem a fachada, descarte não pode deixar atividade aberta. */
    try{
      var _acts=(typeof lfGetActivitiesFor==='function')?lfGetActivitiesFor(uid):((typeof getActivities==='function')?getActivities():null);
      if(Array.isArray(_acts)){
        var _mut=false;
        _acts.forEach(function(a){
          if(a&&!a.done&&(a.clientId===item.id||a.cardId===item.id||a.leadId===item.id)){
            a.done=true;a.doneAt=ts;a.doneReason='lead_discarded';a._pending=true;a._doneLocalAt=Date.now();_mut=true;
          }
        });
        if(_mut){
          if(uid===((typeof S!=='undefined'&&S&&S.userId))&&typeof saveActivities==='function')saveActivities(_acts);
          else if(typeof lfSaveActivitiesFor==='function')lfSaveActivitiesFor(uid,_acts);
        }
      }
      if(Array.isArray(c.activities)){
        c.activities.forEach(function(x){if(x&&!x.done){x.done=true;x.doneAt=ts;x.doneReason='lead_discarded';}});
      }
    }catch(_e){}
    if(S&&S.userId)logFeedEvent('discard',S.userId,c.name,reasonText,board);
  });
  closeM('mo-discard');
  var _scrollSnap=(typeof _kbCaptureScrollSnapshot==='function')?_kbCaptureScrollSnapshot():null;
  Object.keys(affected).forEach(function(board){renderKBLocal(board);});
  if(_scrollSnap&&typeof _kbScheduleScrollRestore==='function')_kbScheduleScrollRestore(_scrollSnap);
  var afterConfirm=_discardState&&_discardState.afterConfirm;
  _discardState={items:[],reason:null,targetCol:null,afterConfirm:null};
  _discardMotivo=null;
  if(typeof afterConfirm==='function'){
    try{afterConfirm({ok:allOk,count:doneCount,linkedNegChanged:linkedNegChanged,reason:motivo,reasonLabel:motivoLabel,reasonText:reasonText});}catch(_e){}
  }
  toast(allOk?('Descartado: '+reasonText+(doneCount>1?' ('+doneCount+')':'')+(linkedNegChanged?' • Negócio vinculado também foi descartado.':'')):'⚠️ Descarte pode não ter sido salvo — armazenamento local cheio.');
}

// Touch drag
// Bug corrigido: antes, _touchZone() adicionava listeners de touchmove/touchend no
// document A CADA coluna renderizada (e o kanban re-renderiza a toda hora), acumulando
// listeners indefinidamente. Agora os listeners de document so sao registrados UMA VEZ
// (controlado por _touchZoneGlobalBound) e o estado do toque ativo fica em variaveis
// compartilhadas (_tzState), atualizadas pelo touchstart de cada coluna.
var _touchZoneGlobalBound=false;

var _tzState={tc:null,clone:null,ox:0,oy:0,startX:0,startY:0,dt:null,board:null}

function _touchZoneBindGlobal(){
  if(_touchZoneGlobalBound)return;
  _touchZoneGlobalBound=true;
  // FIX-PERF-KB-DRAG: antes, o touchmove do clone do Kanban escrevia style.left/top
  // DIRETO em CADA evento (60–120Hz no Android). Combinado com o clone sendo um
  // subtree pesado (1 HTMLElement ~ 6kb de markup cada), o navegador tinha que
  // revalidar o layer a cada frame e o clone sofria micro-stutter visível.
  // Agora coalescemos por requestAnimationFrame + marcador will-change no clone
  // (definido em _touchZone após o cloneNode). Sem mudar o comportamento.
  var _kbTzRAF=null,_kbTzLX=0,_kbTzLY=0;
  function _kbTzApply(){
    _kbTzRAF=null;var st=_tzState;
    if(!st.clone)return;
    st.clone.style.transform='translate3d('+(_kbTzLX-st.ox)+'px,'+(_kbTzLY-st.oy)+'px,0)';
  }
  document.addEventListener('touchmove',function(e){
    var st=_tzState;if(!st.tc)return;
    if(!e.touches||!e.touches[0])return;
    var x=e.touches[0].clientX,y=e.touches[0].clientY;
    var dx=Math.abs(x-st.startX),dy=Math.abs(y-st.startY);
    if(!st.clone){
      if(dy>10&&dy>dx*1.15){
        if(st.dt){clearTimeout(st.dt);st.dt=null;}
        st.tc=null;
        _kbDragAutoScrollStop();
        return;
      }
      if(dx>8||dy>8){
        if(st.dt){clearTimeout(st.dt);st.dt=null;}
        /* Ao detectar pan/rolagem antes do long-press concluir, solta totalmente o rastreio
           deste toque para não manter o kanban processando touchmove até o finger-up — isso
           deixava a rolagem horizontal/vertical "pesada" em Android/iOS. */
        st.tc=null;
        _kbDragAutoScrollStop();
        return;
      }
    }
    if(!st.clone)return;
    e.preventDefault();
    _kbTzLX=x;_kbTzLY=y;
    _kbDragAutoScrollMaybe(st.board,x);
    _kbDragColAutoScrollMaybe(x,y);
    if(_kbTzRAF)return;_kbTzRAF=requestAnimationFrame(_kbTzApply);
  },{passive:false,capture:false});
  document.addEventListener('touchend',function(e){
    var st=_tzState;if(!st.tc)return;
    if(st.dt){clearTimeout(st.dt);st.dt=null;}
    if(st.clone){
      st.clone.remove();st.clone=null;st.tc.style.opacity='';
      var x=e.changedTouches[0].clientX,y=e.changedTouches[0].clientY;
      var tgt=document.elementFromPoint(x,y);
      if(tgt){
        var tCol=tgt.closest('.kb-col');
        if(tCol&&tCol.dataset.board===st.board&&_kbDragId){
          var nc=tCol.dataset.col;var uid2=_kbDragOwner||activeUID(st.board);
          // CORREÇÃO (auditoria): faltava aqui a mesma checagem de coluna restrita já feita
          // no drop por mouse (que simplesmente não registra listener de 'drop' nas colunas
          // restritas) e em applyBulkMove/moveCard. Sem isso, soltar um card via TOQUE (touch)
          // numa coluna de KB_NEG_RESTRICTED (ex.: "Fechado") pulava a checagem de permissão
          // e qualquer consultor comum (não-gestor) conseguia mover o card para lá.
          if(_kbCardLocked(st.board,nc,'target')){toast('🔒 Apenas o Gestor pode mover para esta etapa.');}
          else{_kbMoveCard(_kbDragId,st.board,uid2,nc);renderKBLocal(st.board);}
        }
      }
    }
    _kbDragAutoScrollStop();
    st.tc=null;_kbDragId=null;_kbDragOwner=null;
  },{passive:true});
  document.addEventListener('touchcancel',function(){
    _kbDragAutoScrollStop();
    _touchZoneCancelDrag();
  },{passive:true});
}

// CORREÇÃO (auditoria, Android/iOS): usado pelo long-press de bulk-select (em _makeCard)
// pra abortar um drag de Kanban em andamento assim que o long-press é confirmado, evitando
// que o touchend do _touchZone rode um _kbMoveCard no-op + renderKBLocal por cima da seleção
// que acabou de ser marcada (ver comentário completo no long-press).
function _touchZoneCancelDrag(){
  var st=_tzState;
  if(st.dt){clearTimeout(st.dt);st.dt=null;}
  if(st.clone){st.clone.remove();st.clone=null;}
  if(st.tc){st.tc.style.opacity='';}
  _kbDragAutoScrollStop();
  st.tc=null;_kbDragId=null;_kbDragOwner=null;
}

function _touchZone(ca,board,colId,restricted){
  if(restricted)return;
  _touchZoneBindGlobal();
  ca.addEventListener('touchstart',function(e){
    var card=e.target.closest('.kb-card');
    if(!card||card.classList.contains('kb-card-ro')||e.target.closest('.kb-card-menu')||e.target.closest('.kb-convert-btn')||e.target.closest('.kb-act-btn')||e.target.closest('.kb-call-btn')||e.target.closest('.kb-wa-btn')||e.target.closest('.kb-copy-tel-btn')||e.target.closest('.kb-card-del-btn')||e.target.closest('.kb-assume-btn'))return;
    var st=_tzState;
    st.tc=card;st.board=board;
    var r=card.getBoundingClientRect();
    st.ox=e.touches[0].clientX-r.left;st.oy=e.touches[0].clientY-r.top;
    st.startX=e.touches[0].clientX;st.startY=e.touches[0].clientY;
    st.dt=setTimeout(function(){
      if(!st.tc)return;
      st.clone=st.tc.cloneNode(true);
      st.clone.style.cssText='position:fixed;left:0;top:0;z-index:9999;opacity:.85;pointer-events:none;width:'+r.width+'px;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.7);will-change:transform;contain:layout style;';
        st.clone.style.transform='translate3d('+(e.touches[0].clientX-st.ox)+'px,'+(e.touches[0].clientY-st.oy)+'px,0)';
      document.body.appendChild(st.clone);st.tc.style.opacity='.3';
      _kbDragId=card.dataset.id;_kbDragBoard=board;_kbDragOwner=card.dataset.owner||(S&&S.userId)||'';
    },320);
  },{passive:true});
}

// ============================================================
// BULK SELECTION
// ============================================================
function toggleBulkSelect(id,board,ownerUid,el){
  var idx=_bulkSelected.findIndex(function(x){return x.id===id;});
  if(idx>=0){_bulkSelected.splice(idx,1);el.classList.remove('selected');}
  else{_bulkSelected.push({id:id,board:board,ownerUid:ownerUid});el.classList.add('selected');_bulkMode=true;}
  updateBulkBar();
}

function updateBulkBar(){
  var bar=document.getElementById('bulk-bar');if(!bar)return;
  if(!_bulkSelected.length){bar.classList.remove('v');_bulkMode=false;return;}
  bar.classList.add('v');_bulkMode=true;
  document.getElementById('bulk-count').textContent=_bulkSelected.length+' selecionado'+(_bulkSelected.length>1?'s':'');
  var cb=document.getElementById('bulk-conv-btn');if(cb)cb.style.display=_bulkSelected.some(function(x){return x.board==='leads';})?'':'none';
}

function clearBulk(){
  _bulkSelected=[];_bulkMode=false;
  document.querySelectorAll('.kb-card.selected').forEach(function(e){e.classList.remove('selected');});
  var bar=document.getElementById('bulk-bar');if(bar)bar.classList.remove('v');
  document.querySelectorAll('.bulk-stage-popover.open').forEach(function(p){p.classList.remove('open');});
}

function selectAllKBCards(board){
  var wrapId=board==='leads'?'leads-kanban':'negocios-kanban';
  var wrap=document.getElementById(wrapId);if(!wrap)return;
  var cards=wrap.querySelectorAll('.kb-card:not(.kb-card-ro)');
  cards.forEach(function(el){
    var id=el.dataset.id,brd=el.dataset.board||board;
    var ownerUid=el.dataset.owner||activeUID(board);
    var already=_bulkSelected.findIndex(function(x){return x.id===id;})>=0;
    if(!already){
      _bulkSelected.push({id:id,board:brd,ownerUid:ownerUid});
      el.classList.add('selected');
      _bulkMode=true;
    }
  });
  updateBulkBar();
  toast(_bulkSelected.length+' card(s) selecionado(s)');
}

/* TAREFA 1 — Seleção por etapa específica ou todas */
function selectAllKBCardsByStage(board,colId){
  if(!colId||colId==='all'){selectAllKBCards(board);closeBulkStagePopover(board);return;}
  var wrapId=board==='leads'?'leads-kanban':'negocios-kanban';
  var wrap=document.getElementById(wrapId);if(!wrap)return;
  // CORREÇÃO (auditoria, Kanban/ownership): em "Todos" do ADM, activeList(board)
  // resolve para activeUID(board) e, com _kbViewUid vazio, cai em S.userId — isto é,
  // só os cards do próprio ADM. O kanban visível, porém, contém cards agregados de todos
  // os consultores (renderKBLocal concatena tudo e grava owner em data-owner). Resultado:
  // "Selecionar por etapa" marcava apenas os cards do usuário atual e ignorava silenciosamente
  // os demais da mesma coluna. Em vez de reconstruir a etapa via activeList(), usa os cards
  // JÁ renderizados dentro da coluna visível, preservando filtro por etapa/busca/ADM-Todos.
  var cards=wrap.querySelectorAll('.kb-col[data-col="'+colId+'"] .kb-card:not(.kb-card-ro)');
  var added=0;
  cards.forEach(function(el){
    var id=el.dataset.id;
    var brd=el.dataset.board||board;
    var ownerUid=el.dataset.owner||activeUID(board);
    var already=_bulkSelected.findIndex(function(x){return x.id===id;})>=0;
    if(!already){_bulkSelected.push({id:id,board:brd,ownerUid:ownerUid});el.classList.add('selected');_bulkMode=true;added++;}
  });
  updateBulkBar();
  var colLbl=_colLabel(board,colId);
  toast(_bulkSelected.length+' card(s) selecionado(s)'+(colLbl?' em "'+colLbl+'"':''));
  closeBulkStagePopover(board);
}

var _bulkStageOutsideH=null;

function toggleBulkStagePopover(board){
  var pop=document.getElementById('bulk-stage-pop-'+board);if(!pop)return;
  var isOpen=pop.classList.contains('open');
  // Fecha todos os popovers abertos primeiro
  document.querySelectorAll('.bulk-stage-popover.open').forEach(function(p){p.classList.remove('open');});
  if(_bulkStageOutsideH){document.removeEventListener('click',_bulkStageOutsideH);_bulkStageOutsideH=null;}
  if(isOpen)return;
  // Monta opções dinamicamente
  var cols=kbCols(board);
  var html='<div class="bulk-stage-opt sel" onclick="selectAllKBCardsByStage(\''+board+'\',null)" tabindex="0" role="button"><div class="bulk-stage-dot"></div>Todos os status</div>'
    +'<div class="bulk-stage-sep"></div>'
    +cols.map(function(col){
      return '<div class="bulk-stage-opt" onclick="selectAllKBCardsByStage(\''+board+'\',\''+col.id+'\')" title="Selecionar somente \''+eH(col.label)+'\'" tabindex="0" role="button"><div class="bulk-stage-dot"></div>'+eH(col.label)+'</div>';
    }).join('');
  pop.innerHTML=html;
  pop.classList.add('open');
  // Fecha ao clicar fora
  setTimeout(function(){
    _bulkStageOutsideH=function(e){
      if(!pop.contains(e.target)&&!e.target.closest('.bulk-stage-arrow')){pop.classList.remove('open');document.removeEventListener('click',_bulkStageOutsideH);_bulkStageOutsideH=null;}
    };
    document.addEventListener('click',_bulkStageOutsideH);
  },10);
}

function closeBulkStagePopover(board){
  var pop=document.getElementById('bulk-stage-pop-'+(board||'leads'));if(pop)pop.classList.remove('open');
  var pop2=document.getElementById('bulk-stage-pop-negocios');if(pop2)pop2.classList.remove('open');
}

function bulkMove(){
  if(!_bulkSelected.length)return;
  var board=_bulkSelected[0].board;
  var canAll=(getMyRole()==='gestor');
  var bmi=document.getElementById('bulk-move-info');if(bmi)bmi.textContent=_bulkSelected.length+' cards';
  var bco=document.getElementById('bulk-col-opts');
  var cols=kbCols(board).filter(function(col){return canAll||!_kbCardLocked(board,col.id,'target');});
  if(bco)bco.innerHTML=cols.map(function(col){return '<button class="bulk-col-opt" onclick="applyBulkMove(\''+col.id+'\')">'+eH(col.label)+'</button>';}).join('');
  openM('mo-bulk-move');
}

function applyBulkMove(colId){
  var board0=_bulkSelected.length?_bulkSelected[0].board:null;
  if(_kbCardLocked(board0,colId,'target')){toast('⚠️ Apenas o Gestor pode mover para esta etapa.');return;}
  if(_kbIsDiscardStage(board0,colId)){
    closeM('mo-bulk-move');
    _kbOpenDiscardReasonModal({
      items:_bulkSelected.map(function(x){return {id:x.id,board:x.board,ownerUid:x.ownerUid,targetCol:colId};}),
      targetCol:colId,
      afterConfirm:function(){clearBulk();}
    });
    return;
  }
  var affected={};_kbLastOpFailed=false;var blocked=0;
  _bulkSelected.forEach(function(x){
    var uid=x.ownerUid||activeUID(x.board);
    if(x.board==='negocios'&&getMyRole()!=='gestor'){
      var curArr=getKBFor(x.board,uid);var curCard=curArr.find(function(q){return q.id===x.id;});
      if(curCard&&_kbCardLocked(x.board,curCard.col,'from')){blocked++;return;}
    }
    _kbMoveCard(x.id,x.board,uid,colId,true,true);
    affected[x.board]=true;
    if(x.board==='leads'&&colId==='conv')affected.negocios=true;
  });
  refreshKBAffected(Object.keys(affected));
  closeM('mo-bulk-move');clearBulk();
  if(blocked)toast('Movidos! ('+blocked+' card(s) travado(s) em etapa restrita não foram movidos)',3500);
  else if(!_kbLastOpFailed)toast('Movidos!');
}

function bulkConvert(){
  _kbLastOpFailed=false;
  var _scrollSnap=(typeof _kbCaptureScrollSnapshot==='function')?_kbCaptureScrollSnapshot():null;
  _bulkSelected.filter(function(x){return x.board==='leads';}).forEach(function(x){convertToNeg(x.id,x.ownerUid,undefined,true,undefined,true);});
  if(_scrollSnap&&typeof _kbScheduleScrollRestore==='function')_kbScheduleScrollRestore(_scrollSnap);
  clearBulk();
  if(!_kbLastOpFailed)toast('Convertidos!');
}

function bulkResp(){
  if(!_bulkSelected.length)return;
  var users=getUsers().filter(function(u){return u.ativo;});
  var bri=document.getElementById('bulk-resp-info');if(bri)bri.textContent=_bulkSelected.length+' card(s) — escolha o novo responsável:';
  var bt=document.getElementById('bulk-resp-title');if(bt)bt.textContent='👤 Transferir Responsável';
  var bro=document.getElementById('bulk-resp-opts');
  if(bro)bro.innerHTML=users.map(function(u){var uidJs=_jsSq(u.id);return '<button class="bulk-col-opt" onclick="_bulkRespPickUser(\''+uidJs+'\')">'+eH(u.nome)+'</button>';}).join('');
  openM('mo-bulk-resp');
}

/* [FIX 20260822] Passo 2 do fluxo combinado — depois de escolher o novo
   responsável, mostra a etapa (mesmo modal, mesma seleção, sem fechar
   nada) em vez de já disparar a transferência. "Manter etapa atual" é
   a opção padrão/mais visível — quem só queria trocar o responsável
   (como já era antes) clica ali e o comportamento é idêntico ao de
   sempre. */
function _bulkRespPickUser(newUid){
  var toUser=getUser(newUid);if(!toUser)return;
  var board=_bulkSelected.length?_bulkSelected[0].board:null;
  var canAll=(getMyRole()==='gestor');
  var bt=document.getElementById('bulk-resp-title');if(bt)bt.textContent='🔀 Escolher Etapa';
  var bri=document.getElementById('bulk-resp-info');
  if(bri)bri.textContent='Novo responsável: '+toUser.nome+'. Escolha a etapa (ou mantenha a atual):';
  var cols=(board?kbCols(board):[]).filter(function(col){return canAll||!_kbCardLocked(board,col.id,'target');});
  var bro=document.getElementById('bulk-resp-opts');
  if(bro)bro.innerHTML=
    '<button class="bulk-col-opt" style="border-color:var(--al);color:var(--al);font-weight:700" onclick="applyBulkRespAndStage(\''+_jsSq(newUid)+'\',null)">↷ Manter etapa atual</button>'
    +cols.map(function(col){return '<button class="bulk-col-opt" onclick="applyBulkRespAndStage(\''+_jsSq(newUid)+'\',\''+_jsSq(col.id)+'\')">'+eH(col.label)+'</button>';}).join('')
    +'<button class="bulk-col-opt" style="border-style:dashed" onclick="bulkResp()">← Voltar (trocar responsável)</button>';
}

/* [FIX 20260822] Combina transferência de responsável + troca de etapa
   numa ÚNICA operação — reaproveita _kbTransferCard (responsável) e, no
   callback de cada card já transferido com sucesso, aplica _kbMoveCard
   (etapa) pro NOVO responsável antes de seguir pro próximo item da
   fila. newColId===null pula a troca de etapa (equivalente ao antigo
   applyBulkResp sozinho). Um clearBulk() só, no final — a seleção
   nunca precisa ser refeita "um por um". */
function applyBulkRespAndStage(newUid,newColId){
  var toUser=getUser(newUid);if(!toUser)return;
  var affected={};var allOk=true;
  var items=_bulkSelected.slice();
  var total=items.length;
  var bro=document.getElementById('bulk-resp-opts');
  var bri=document.getElementById('bulk-resp-info');
  if(bro)bro.innerHTML='<div class="act-empty" id="bulk-resp-progress">Transferindo 0 de '+total+'…</div>';
  if(bri)bri.textContent='';
  function next(i){
    if(i>=items.length){
      refreshKBAffected(Object.keys(affected));
      closeM('mo-bulk-resp');clearBulk();
      var msg='Transferidos para '+(toUser&&toUser.nome?toUser.nome.split(' ')[0]:'usuário');
      if(newColId)msg+=' na etapa escolhida';
      if(allOk)toast(msg);
      return;
    }
    var prog=document.getElementById('bulk-resp-progress');
    if(prog)prog.textContent='Transferindo '+(i+1)+' de '+total+'…';
    var x=items[i];var uid=x.ownerUid||(S&&S.userId);
    _kbTransferCard(x.id,x.board,uid,newUid,true,function(res){
      if(!res){allOk=false;affected[x.board]=true;next(i+1);return;}
      affected[x.board]=true;
      // Card já mora no array do novo responsável (newUid) — troca a
      // etapa ali, se foi pedido. Silenciosa (mesmo card, mesma
      // operação lógica pro usuário, não é uma segunda ação separada).
      if(newColId){
        _kbMoveCard(x.id,x.board,newUid,newColId,true,true);
      }
      next(i+1);
    });
  }
  next(0);
}

function bulkDiscard(){
  if(!_bulkSelected.length)return;
  _kbOpenDiscardReasonModal({
    items:_bulkSelected.map(function(x){return {id:x.id,board:x.board,ownerUid:x.ownerUid};}),
    afterConfirm:function(){clearBulk();}
  });
}

function bulkDelete(){
  if(!_bulkSelected.length)return;
  if(typeof _openDeleteKBReasonModal!=='function'){
    toast('Módulo de motivo de exclusão não carregado.');
    return;
  }
  _openDeleteKBReasonModal({
    items:_bulkSelected.map(function(x){return {id:x.id,board:x.board,ownerUid:x.ownerUid};}),
    afterConfirm:function(){clearBulk();}
  });
}

// ============================================================
// BATCH IMPORT
// ============================================================
var _importParsed=[];

function _fillBatchImportResp(board){
  board=board||'leads';
  var sel=document.getElementById('import-resp');
  if(!sel)return;
  var currentUid=activeUID(board)||(S&&S.userId)||'';
  var _hideAdm=false;
  try{
    var _prefs=(typeof getPrefs==='function')?(getPrefs()||{}):{};
    if(_prefs&&(_prefs.hideAdmInLists===true||_prefs.adm_hidden_in_lists===true))_hideAdm=true;
    if(!_hideAdm){var _ls=localStorage.getItem('lf_hide_adm_lists');if(_ls==='1'||_ls==='true')_hideAdm=true;}
  }catch(_e){}
  var users=getUsers().filter(function(u){return _hideAdm?(u.id!=='adm'||u.id===currentUid):true;});
  if(currentUid&&!users.find(function(u){return u&&u.id===currentUid;})){
    var curUser=(typeof getUser==='function')?getUser(currentUid):null;
    users.push(curUser||{id:currentUid,nome:currentUid,ativo:true});
  }
  sel.innerHTML='<option value="">Selecione o responsável</option>'+users.map(function(u){
    return '<option value="'+_htmlAttr(u.id)+'">'+eH(u.nome)+(u.ativo===false?' (Inativo)':'')+'</option>';
  }).join('');
  if(currentUid)sel.value=currentUid;
}

function openBatchImport(board){
  board=(board==='negocios')?'negocios':'leads';
  var bf=document.getElementById('import-board');if(bf)bf.value=board;
  var title=document.getElementById('import-modal-title');
  if(title)title.textContent=board==='negocios'?'📋 Importar Negócios em Cadeia':'📋 Importar Leads em Cadeia';
  _importParsed=[];
  var it=document.getElementById('import-txt');if(it)it.value='';
  var ic=document.getElementById('import-count');if(ic)ic.innerHTML='';
  var ip=document.getElementById('import-preview');if(ip){ip.style.display='none';ip.innerHTML='';}
  var sel=document.getElementById('import-col');
  var cols=board==='negocios'?KB_NEG_COLS:KB_LEADS_COLS;
  if(sel)sel.innerHTML=cols.map(function(c,i){return '<option value="'+_htmlAttr(c.id)+'"'+(i===0?' selected':'')+'>'+eH(c.label)+'</option>';}).join('');
  _fillBatchImportResp(board);
  openM('mo-batch-import');
}

function parseImport(){
  var txt=document.getElementById('import-txt').value||'';
  _importParsed=parseContactLines(txt);
  var ic=document.getElementById('import-count');
  if(ic)ic.innerHTML=_importParsed.length?'<strong>'+_importParsed.length+'</strong> contatos:':'Nenhum contato identificado.';
  var ip=document.getElementById('import-preview');
  if(ip){if(_importParsed.length){ip.style.display='block';ip.innerHTML=_importParsed.map(function(p,i){return '<div class="import-preview-row"><span class="import-preview-name">'+eH(p.name)+'</span><span class="import-preview-tel">'+eH(p.tel||'sem tel')+'</span><button class="import-preview-rm" aria-label="Remover" onclick="removeImportRow('+i+')">x</button></div>';}).join('');}else ip.style.display='none';}
}

function removeImportRow(i){
  _importParsed.splice(i,1);
  var ip=document.getElementById('import-preview');
  var ic=document.getElementById('import-count');
  if(ic)ic.innerHTML='<strong>'+_importParsed.length+'</strong> contatos';
  if(ip){if(_importParsed.length)ip.innerHTML=_importParsed.map(function(p,i){return '<div class="import-preview-row"><span class="import-preview-name">'+eH(p.name)+'</span><span class="import-preview-tel">'+eH(p.tel||'sem tel')+'</span><button class="import-preview-rm" aria-label="Remover" onclick="removeImportRow('+i+')">x</button></div>';}).join('');else ip.style.display='none';}
}

function confirmBatchImport(){
  if(!_importParsed.length){toast('Nenhum contato');return;}
  var board=((document.getElementById('import-board')||{}).value==='negocios')?'negocios':'leads';
  var nicho=document.getElementById('import-nicho').value;
  var col=document.getElementById('import-col').value;
  var targetUid=(document.getElementById('import-resp').value||activeUID(board)||(S&&S.userId)||'');
  if(!targetUid){toast('Selecione o responsável');return;}
  if(!col){toast('Selecione a etapa inicial');return;}

  var arr=getKBFor(board,targetUid).slice();
  var baseTs=Date.now();
  var importedCount=0;
  var blockedCount=0;
  var seenBatch={};
  var allCards=(typeof _collectAllCardsForDup==='function')?_collectAllCardsForDup():[];
  var globalPhoneMap={};
  allCards.forEach(function(x){
    var n=((x&&x.card&&x.card.tel)||'').replace(/\D/g,'');
    if(n.length<8)return;
    if(!globalPhoneMap[n])globalPhoneMap[n]=[];
    globalPhoneMap[n].push(x);
  });

  var targetUser=(typeof getUser==='function')?getUser(targetUid):null;
  var targetName=(targetUser&&targetUser.nome)||targetUid||'responsável selecionado';
  var stageLabel=_colLabel(board,col)||col;
  var boardLabel=board==='negocios'?'Negócio':'Lead';
  var accepted=[];
  var blocked=[];

  _importParsed.forEach(function(p){
    var telNorm=(p.tel||'').replace(/\D/g,'');
    var reasons=[];
    if(telNorm.length>=8){
      if(globalPhoneMap[telNorm]&&globalPhoneMap[telNorm].length){
        reasons.push('telefone já existe em outro cadastro do CRM');
      }
      if(seenBatch[telNorm]){
        reasons.push('telefone repetido dentro do próprio lote');
      }
    }
    if(reasons.length){
      blocked.push({item:p,reasons:reasons});
      blockedCount++;
      return;
    }
    if(telNorm.length>=8)seenBatch[telNorm]=true;
    accepted.push(p);
  });

  accepted.forEach(function(p,idx){
    var createdAt=new Date(baseTs+idx).toISOString();
    var novoCard=(board==='negocios')
      ?{id:'neg_'+(baseTs+idx)+'_'+Math.random().toString(36).slice(2,6)+'_'+Math.random().toString(36).slice(2,4),name:p.name,tel:p.tel,nicho:nicho,col:col,valor:0,obs:'',createdAt:createdAt,updatedAt:createdAt,userId:targetUid,originalLeadId:null,attachments:[],historico:[]}
      :{id:'kb_'+(baseTs+idx)+'_'+Math.random().toString(36).slice(2,6)+'_'+Math.random().toString(36).slice(2,4),name:p.name,tel:p.tel,nicho:nicho,col:col,obs:'',createdAt:createdAt,updatedAt:createdAt,userId:targetUid,attachments:[],historico:[]};
    _pushHistorico(novoCard,boardLabel+' importado em lote para '+targetName+' na etapa "'+stageLabel+'"');
    arr.push(novoCard);
    importedCount++;
  });

  var okImp=true;
  if(accepted.length){
    okImp=saveKBFor(board,targetUid,arr);
    renderKBLocal(board);
    if(S&&S.userId)logFeedEvent('create',S.userId,importedCount+' '+(board==='negocios'?'negócios':'leads'),'Importacao',board);
    // [FIX 20260822] Pedido explícito: notificar quem virou responsável
    // por Lead(s)/Negócio(s) recém-criados, com o clique levando direto
    // pra eles. Só notifica se o responsável escolhido for OUTRA pessoa
    // (senão a própria pessoa que importou já sabe, sem necessidade de
    // notificação). Se foi só 1 item, aponta o cardId direto (clique já
    // abre o card certo, reaproveitando o mesmo mecanismo que já existe
    // pra notificação de transferência); se foram vários, aponta só pro
    // board (clique leva pra lista, ver notifItemClick).
    if(okImp&&targetUid!==S.userId&&typeof pushNotif==='function'){
      var _boardLabelNotif=board==='negocios'?'negócio':'lead';
      if(importedCount===1){
        var _singleCard=arr[arr.length-1];
        pushNotif(targetUid,'transfer','🆕 "'+_singleCard.name+'" foi adicionado como seu novo '+_boardLabelNotif+' por '+(S.nome||'?'),{cardId:_singleCard.id,board:board});
      }else if(importedCount>1){
        pushNotif(targetUid,'transfer','🆕 '+importedCount+' novo(s) '+_boardLabelNotif+'(s) foram adicionados como seus por '+(S.nome||'?'),{board:board});
      }
    }
  }
  closeM('mo-batch-import');

  var impMsg;
  if(!accepted.length){
    impMsg='Nenhum '+boardLabel.toLowerCase()+' importado: o lote foi bloqueado pela checagem obrigatória de duplicados.';
  }else if(okImp){
    impMsg=''+importedCount+' '+(board==='negocios'?'negócios':'leads')+' importados para '+targetName+' em "'+stageLabel+'"!';
  }else{
    impMsg='⚠️ Importação pode não ter sido salva — armazenamento local cheio.';
  }
  if(blockedCount>0)impMsg+=' '+blockedCount+' duplicata(s) bloqueada(s).';
  toast(impMsg,4200);
  _importParsed=[];
}


// ============================================================
// DETECÇÃO DE DUPLICATAS (por telefone, em Leads + Negócios, todos os consultores)
// ============================================================
// _collectAllCardsForDup e _countDuplicatePhone foram extraídas nesta rodada (7) para
// src/modules/kanban/runtime/kanban-helpers.js (funções puras, sem leitura/escrita de
// DOM) — ver var __kanbanRuntime no topo deste arquivo. Comportamento idêntico.

function openDuplicateScanner(){
  var canDelete=(typeof hasAdminAccess==='function'&&hasAdminAccess());
  var all=_collectAllCardsForDup();
  var groups={};
  all.forEach(function(x){
    var n=(x.card.tel||'').replace(/\D/g,'');
    if(n.length<8)return;
    if(!groups[n])groups[n]=[];
    groups[n].push(x);
  });
  var dupGroups=Object.keys(groups).map(function(n){return {tel:n,items:groups[n]};}).filter(function(g){return g.items.length>1;});
  var el=document.getElementById('dup-results');
  if(!el){openM('mo-duplicates');return;}
  if(!dupGroups.length){
    el.innerHTML='<div class="act-empty">✅ Nenhuma duplicata encontrada — todos os números são únicos.</div>';
  }else{
    el.innerHTML=dupGroups.map(function(g){
      var rows=g.items.map(function(x){
        var action=canDelete
          ? '<button class="kb-card-del-btn" style="opacity:1;position:static;font-size:.95rem" title="Excluir permanentemente" onclick="_dupDeleteAndRescan(\''+x.card.id+'\',\''+x.board+'\',\''+x.ownerUid+'\')">✕</button>'
          : '<span style="font-size:.68rem;color:var(--mu)">somente leitura</span>';
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06)">'
          +'<div style="font-size:.76rem"><strong>'+eH(x.card.name)+'</strong><br><span style="color:var(--mu);font-size:.68rem">'+eH(x.ownerName)+' · '+_colLabel(x.board,x.card.col)+' · '+(x.board==='leads'?'Lead':'Negócio')+'</span></div>'
          +action
          +'</div>';
      }).join('');
      return '<div style="background:rgba(224,138,58,.08);border:1px solid rgba(224,138,58,.25);border-radius:10px;padding:10px 12px;margin-bottom:10px">'
        +'<div style="font-size:.78rem;font-weight:700;color:#e08a3a;margin-bottom:2px">📞 '+eH(g.tel)+' — '+g.items.length+' registros</div>'
        +rows+'</div>';
    }).join('');
  }
  openM('mo-duplicates');
}


// Botão "Ir para o fim" da aba Dicionário — pula direto para o final da página,
// sem precisar rolar manualmente por todo o Banco de Objeções.
function dicGoToEnd(){
  var pg=document.getElementById('pg-dic');
  if(pg)pg.scrollIntoView({block:'end'});
  window.scrollTo({top:document.body.scrollHeight,left:0,behavior:'smooth'});
}

// ============================================================
// FILTROS AVANÇADOS KANBAN
// ============================================================
/* Lista de usuários oferecida no filtro "Usuário" da busca avançada
   (lupa). Mesma régua de visibilidade usada em todo o resto do CRM:
     - ADM/gerente: todos os ativos.
     - Supervisor (já escopado por getDepartmentVisibleUsers): o time.
     - Consultor comum: o DEPARTAMENTO inteiro (pode ter várias teams) —
       mesmo escopo do pool "Livre" no servidor. Filtrar por alguém fora
       do departamento nem aparece como opção; e mesmo dentro do
       departamento, quem não tem permissão de ver o board alheio só
       vai enxergar os cards "Livre" dessa pessoa (a lista já vem assim
       pronta de _collectLivrePoolForUser — o filtro só recorta por
       dono em cima do que já está corretamente visível). */
function _lfKBAdvFilterUsers(){
  var meUid=(S&&S.userId)||'';
  if(hasAdminAccess()){
    var all=getUsers().filter(function(u){return u.ativo;});
    if(meUid&&!all.find(function(u){return u.id===meUid;}))all.unshift({id:meUid,nome:(S&&S.nome)||'Eu',ativo:true});
    return all;
  }
  if(typeof getDepartmentVisibleUsers==='function'){
    var team=getDepartmentVisibleUsers(meUid);
    if(team&&team.length>1)return team;
  }
  if(typeof LF_SCOPE_V2!=='undefined'&&LF_SCOPE_V2&&typeof LF_SCOPE_V2.departamentoOfUser==='function'){
    var myDept=LF_SCOPE_V2.departamentoOfUser(meUid);
    if(myDept){
      var mates=getUsers().filter(function(u){
        return u.ativo&&(u.id===meUid||LF_SCOPE_V2.departamentoOfUser(u.id)===myDept);
      });
      if(mates.length>1)return mates;
    }
  }
  var me=getUser(meUid);
  return me?[me]:[];
}

function openKBAdvFilter(board){
  var _afb=document.getElementById('adv-filter-board');if(_afb)_afb.value=board;
  var f=_kbFilter[board]||{};
  var nm=document.getElementById('adv-f-nome');if(nm)nm.value=_kbQ[board]||'';
  var ni=document.getElementById('adv-f-nicho');if(ni)ni.value=f.nicho||'';
  var vm=document.getElementById('adv-f-valor-min');if(vm)vm.value=f.valorMin||'';
  var vx=document.getElementById('adv-f-valor-max');if(vx)vx.value=f.valorMax||'';
  var di=document.getElementById('adv-f-dias');if(di)di.value=f.dias||'';
  var vw=document.getElementById('adv-f-valor-wrap');if(vw)vw.style.display=board==='negocios'?'':'none';
  var uSel=document.getElementById('adv-f-usuario');
  if(uSel){
    var users=_lfKBAdvFilterUsers();
    var meUid=(S&&S.userId)||'';
    uSel.innerHTML='<option value="">Todos</option>'+users.map(function(u){
      var label=(u.id===meUid?'Você — ':'')+u.nome;
      return '<option value="'+_htmlAttr(u.id)+'">'+eH(label)+'</option>';
    }).join('');
    uSel.value=f.usuario||'';
  }
  openM('mo-kb-adv-filter');
}

function applyKBAdvFilter(){
  var board=document.getElementById('adv-filter-board').value;
  var nome=(document.getElementById('adv-f-nome').value||'').trim();
  _kbQ[board]=nome.toLowerCase();
  var pageInp=document.getElementById(board==='leads'?'lead-search':'neg-search');if(pageInp)pageInp.value=nome;
  _kbFilter[board]={
    nicho:(document.getElementById('adv-f-nicho').value||''),
    valorMin:(document.getElementById('adv-f-valor-min').value||''),
    valorMax:(document.getElementById('adv-f-valor-max').value||''),
    dias:(document.getElementById('adv-f-dias').value||''),
    usuario:((document.getElementById('adv-f-usuario')||{}).value||'')
  };
  closeM('mo-kb-adv-filter');renderKBLocal(board);
  var active=!!nome||Object.values(_kbFilter[board]).some(function(v){return !!v;});
  toast(active?'Filtros aplicados':'Filtros limpos');
  // Sincroniza o indicador de filtro ativo tanto no botão desktop quanto no mobile.
  ['kb-filter-wrap-'+board,'kb-filter-wrap-'+board+'-mb'].forEach(function(wrapId){
    var wrap=document.getElementById(wrapId);
    if(wrap)wrap.classList.toggle('has-filter',active);
  });
}

function clearKBAdvFilter(){
  var board=document.getElementById('adv-filter-board').value;
  _kbQ[board]='';
  var pageInp=document.getElementById(board==='leads'?'lead-search':'neg-search');if(pageInp)pageInp.value='';
  _kbFilter[board]={nicho:'',valorMin:'',valorMax:'',dias:'',usuario:''};
  var nm=document.getElementById('adv-f-nome');if(nm)nm.value='';
  var ni=document.getElementById('adv-f-nicho');if(ni)ni.value='';
  var vm=document.getElementById('adv-f-valor-min');if(vm)vm.value='';
  var vx=document.getElementById('adv-f-valor-max');if(vx)vx.value='';
  var di=document.getElementById('adv-f-dias');if(di)di.value='';
  var uSel=document.getElementById('adv-f-usuario');if(uSel)uSel.value='';
  closeM('mo-kb-adv-filter');renderKBLocal(board);toast('Filtros limpos');
  ['kb-filter-wrap-'+board,'kb-filter-wrap-'+board+'-mb'].forEach(function(wrapId){
    var wrap=document.getElementById(wrapId);
    if(wrap)wrap.classList.remove('has-filter');
  });
}

// Atalho de teclado: Ctrl+K abre busca global
// Escape key fecha o modal mais recente (maior z-index)
// + atalhos de teclado Ctrl/Cmd
document.addEventListener("keydown",function(e){
  // Ativa via Enter/Espaço qualquer elemento não-nativo marcado como role="button"
  // (divs/spans clicáveis usados como botão custom) que ainda não tenha seu próprio
  // onkeydown — sem isso, usuários de teclado não conseguiam ativar vários controles
  // do app (abrir menu mobile, adicionar cliente, seletor de etapa, cards de anexo,
  // itens de atividade/notificação, linhas do painel ADM etc.) mesmo estando com foco
  // neles, já que apenas <button>/<a> ativam nativamente com Enter/Espaço.
  if((e.key==="Enter"||e.key===" ")&&e.target&&e.target.getAttribute&&e.target.getAttribute('role')==='button'&&!e.target.hasAttribute('onkeydown')){
    e.preventDefault();e.target.click();
    return;
  }
  // Escape: fecha modal mais recente
  if(e.key==="Escape"){
    var all=[].slice.call(document.querySelectorAll(".mo.open"));
    if(all.length){var top=all.reduce(function(a,b){return (parseInt(window.getComputedStyle(b).zIndex,10)||0)>=(parseInt(window.getComputedStyle(a).zIndex,10)||0)?b:a;});closeM(top.id);}
    return;
  }
  // Bug corrigido: modais tinham role="dialog"/aria-modal e devolviam o foco ao fechar,
  // mas nada impedia o Tab de "vazar" pra fora do modal e focar elementos escondidos
  // atrás do overlay — trap de foco ausente. Ciclo Tab/Shift+Tab dentro do modal aberto
  // de maior z-index, igual ao Escape acima. Roda antes do early-return de input/textarea
  // porque o foco normalmente ESTÁ num input/textarea dentro do próprio modal.
  if(e.key==="Tab"){
    var openMos=[].slice.call(document.querySelectorAll(".mo.open"));
    if(openMos.length){
      var topMo=openMos.reduce(function(a,b){return (parseInt(window.getComputedStyle(b).zIndex,10)||0)>=(parseInt(window.getComputedStyle(a).zIndex,10)||0)?b:a;});
      var focusables=[].slice.call(topMo.querySelectorAll('input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(function(el){return el.offsetParent!==null;});
      if(focusables.length){
        var first=focusables[0],last=focusables[focusables.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
  }
  // Ctrl/Cmd atalhos (apenas quando não está em input/textarea)
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.isContentEditable))return;
  var _pageKeys={'1':'dash','2':'leads','3':'negocios','4':'anal','5':'config'};
  if((e.ctrlKey||e.metaKey)&&_pageKeys[e.key]){e.preventDefault();goPage(_pageKeys[e.key]);return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openGSearch();return;}
  if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key==='n'){
    var pgLeads=document.getElementById('pg-leads');
    if(pgLeads&&pgLeads.classList.contains('on')){e.preventDefault();openKBNew('leads','livre');}
    return;
  }
  if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==='N'){
    var pgNegs=document.getElementById('pg-negocios');
    if(pgNegs&&pgNegs.classList.contains('on')){e.preventDefault();openKBNew('negocios','retag');}
    return;
  }
});

/* ===== LISTA MOBILE DE LEADS/NEGÓCIOS (estilo Bitrix24) ===== */
var _mbStageFilter={leads:null,negocios:null}

function renderMobileChips(board){
  var bar=document.getElementById(board+'-mb-chips');if(!bar)return;
  var cols=kbCols(board);
  var html='<button class="mb-chip'+(!_mbStageFilter[board]?' on':'')+'" onclick="setMobileChipFilter(\''+board+'\',null,this)">Todas</button>';
  html+=cols.map(function(c){return '<button class="mb-chip'+(_mbStageFilter[board]===c.id?' on':'')+'" onclick="setMobileChipFilter(\''+board+'\',\''+c.id+'\',this)">'+eH(c.label)+'</button>';}).join('');
  bar.innerHTML=html;
}

function setMobileChipFilter(board,colId,btn){
  _mbStageFilter[board]=colId;
  var bar=document.getElementById(board+'-mb-chips');
  if(bar)bar.querySelectorAll('.mb-chip').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  renderKBMobile(board);
}

/* Calcula "há quanto tempo" de forma curta (ex: "2h", "3d") a partir de um ISO date. */
function _timeAgoShort(iso){
  if(!iso)return'';
  var diff=Date.now()-new Date(iso).getTime();
  var min=Math.floor(diff/60000);
  if(min<1)return'agora';
  if(min<60)return min+'min';
  var h=Math.floor(min/60);if(h<24)return h+'h';
  var d=Math.floor(h/24);return d+'d';
}

/* CORREÇÃO 2026-08-03 — "mudar a ordem dos leads/colocar um no lugar do
   outro na mesma etapa": o mecanismo de reordenar já existia
   (_kbMoveCard(...,dropIndex) + manualOrder), usado pelo drag-and-drop do
   desktop, mas (a) não tinha nenhum jeito de acionar isso no celular
   (arrastar com o dedo não dispara os eventos HTML5 de drag-and-drop que
   o desktop usa) e (b) _sortCardsForColumn ignorava manualOrder na
   prática (ver correção acima, no mesmo commit). Aqui: um par de botões
   subir/descer no card da lista mobile, que chamam o mesmo _kbMoveCard
   já testado — sem inventar mecanismo novo. Existiam duas versões soltas
   e não conectadas a nenhum botão real (window.__lf4xMove, em
   lf-bugs-4fixes/5fixes) — esta função as substitui como fonte única. */
function _mbReorderCard(cardId,board,uid,dir){
  try{
    if(typeof getKBFor!=='function'||typeof _kbMoveCard!=='function')return false;
    var arr=getKBFor(board,uid)||[];
    var card=arr.find(function(x){return x&&x.id===cardId;});
    if(!card)return false;
    var sameCol=arr.filter(function(x){return x&&x.col===card.col;});
    var sorted=(typeof _sortCardsForColumn==='function')?_sortCardsForColumn(sameCol):sameCol;
    var idx=-1;
    for(var i=0;i<sorted.length;i++){if(sorted[i]&&sorted[i].id===cardId){idx=i;break;}}
    if(idx<0)return false;
    var ni=idx+(dir==='up'?-1:1);
    if(ni<0||ni>=sorted.length)return false; // já está na ponta da etapa
    _kbMoveCard(cardId,board,uid,card.col,true,false,ni);
    return true;
  }catch(_e){return false;}
}
function mbReorderTap(cardId,board,uid,dir){
  var moved=_mbReorderCard(cardId,board,uid,dir);
  if(moved){
    if(typeof renderKBMobile==='function')renderKBMobile(board);
  }else if(typeof toast==='function'){
    toast(dir==='up'?'Já é o primeiro desta etapa':'Já é o último desta etapa');
  }
}
window._mbReorderCard=_mbReorderCard;
window.mbReorderTap=mbReorderTap;

/* Renderiza a lista vertical mobile (estilo Bitrix24) para Leads ou Negócios. Chamada
   por renderKB() quando a tela está no modo mobile, e diretamente pelos chips de filtro. */
function renderKBMobile(board){
  var wrap=document.getElementById(board+'-mobile-list');if(!wrap)return;
  // [FIX 20260821] renderKBMobile reconstrói a lista inteira do zero
  // (wrap.innerHTML=...) toda vez que é chamada — inclusive depois de
  // mudar a etapa de um lead (via refreshKBAffected). Diferente de
  // renderKBLocal (desktop), que já preservava a posição de rolagem
  // (_kbCaptureScrollState/_kbRestoreScrollState), esta função NUNCA
  // tinha recebido o mesmo tratamento — por isso o bug "rolagem volta
  // pro início ao mudar etapa" persistia especificamente no celular,
  // mesmo depois da correção equivalente já ter sido aplicada no board
  // desktop numa sessão anterior. Mesma técnica, mesmo elemento sendo
  // preservado (o próprio wrap, que é quem rola no mobile).
  var _mbScrollTop=wrap.scrollTop;
  renderStageSummaryBar(board);
  // CORREÇÃO BUG LUPA/ADM-TODOS: agrega todos os consultores quando ADM está no modo "Todos"
  var uid=activeUID(board);
  var list;
  if(hasAdminAccess()&&!_kbViewUid[board]){
    var _mbAllUsers=getUsers().filter(function(u){return u.ativo;});
    list=[];
    _mbAllUsers.forEach(function(u){
      getKBFor(board,u.id).forEach(function(c){c._timeOwnerUid=u.id;list.push(c);});
    });
  } else {
    list=(board==='leads'&&!hasAdminAccess())?_collectLivrePoolForUser(uid):getKBFor(board,uid);
  }
  // FIX: Filtros Avançados (nicho/valor/dias) não eram aplicados na visão mobile —
  // só funcionavam no kanban desktop via _buildKB(). Mesma lógica replicada aqui.
  var f=_kbFilter[board]||{};
  list=list.filter(function(c){
    if(f.nicho&&(c.nicho||'')!==f.nicho)return false;
    if(f.valorMin&&board==='negocios'&&(parseFloat(c.valor)||0)<parseFloat(f.valorMin))return false;
    if(f.valorMax&&board==='negocios'&&(parseFloat(c.valor)||0)>parseFloat(f.valorMax))return false;
    if(f.dias&&c.createdAt){var d=Math.floor((Date.now()-new Date(c.createdAt).getTime())/86400000);if(d<parseInt(f.dias,10))return false;}
    if(f.usuario&&(c._timeOwnerUid||uid)!==f.usuario)return false;
    if(_kbOnlyLate[board]&&!_kbHasOverdueLinkedActivity(c, c._timeOwnerUid || uid, board))return false;
    return true;
  });
  var stage=_mbStageFilter[board];
  if(stage)list=list.filter(function(c){return c.col===stage;});
  var q=(_kbQ&&_kbQ[board])||'';
  if(q)list=list.filter(function(c){return String(c.name||'').toLowerCase().indexOf(q)>=0||String(c.tel||'').indexOf(q)>=0;});
  if(!list.length){wrap.innerHTML='<div class="act-empty">Nenhum registro nesta etapa.</div>';return;}
  var cols=kbCols(board);
  var u=getUser(uid);
  /* ══════════════════════════════════════════════════════════════════
   * REDESENHO VISUAL 2026-08-05 — card mobile de Leads/Negócios
   *
   * Só reorganiza/reestiliza (ver css/lf-mobile-leads-compact-v1.css).
   * NENHUMA função, id de dado, endpoint ou regra de negócio mudou:
   *   - Mesmas classes (.mb-card, .mb-card-chevron, .mb-card-resp...),
   *     só a ordem/agrupamento no HTML mudou.
   *   - Mesmos onclick, chamando exatamente as mesmas funções com os
   *     mesmos argumentos (_openCtx, openStagePicker, openSubEtapaPicker,
   *     openKBDet, assumeLead, callClient, openWhatsApp, mbReorderTap).
   *   - _subPct()/SUB_ETAPA_OPTIONS não mudaram — só passei a desenhar
   *     o mesmo valor 0–100 como barra segmentada (5 blocos) em vez de
   *     uma barra contínua, via _subSegHTML() (helper novo, só de
   *     apresentação, não lê/escreve nada).
   *   - "· repetido" virou uma badge (mesma condição c._dup).
   *   - Removido: `stageOpts` (variável calculada mas nunca usada no
   *     template — já era código morto antes desta mudança).
   * ══════════════════════════════════════════════════════════════════ */
  wrap.innerHTML=list.map(function(c){
    var effUid=c._timeOwnerUid||uid;
    var colLbl=_colLabel(board,c.col);
    var ago=_timeAgoShort(c.createdAt);
    var resp=getUser(c._timeOwnerUid||uid)||{};
    var respAvBg=AVB[(resp.cor||0)%AVB.length];
    var _respNome=resp.nome||'?';
    var telJs=_jsSq(c.tel||''),nameJs=_jsSq(c.name||'');
    var _mbIsLivreLead=(board==='leads'&&c.col==='livre'&&effUid!==(S&&S.userId));
    return '<div class="mb-card" data-id="'+c.id+'" data-board="'+board+'" data-owner="'+eH(effUid||'')+'">'
      +'<div class="mb-card-main">'

      /* 1) Nome do cliente (maior elemento do card) + badge "repetido" + menu ⋮ */
      +'<div class="mb-card-header">'
        +'<div class="mb-card-name-row">'
          +'<span class="mb-card-client" onclick="openKBDet(\''+c.id+'\',\''+board+'\',\''+effUid+'\')" tabindex="0" role="button">'+eH(c.name)+'</span>'
          +(c._dup?'<span class="mb-card-dup-badge">repetido</span>':'')
        +'</div>'
        +'<button class="mb-card-menu-btn" aria-label="Opções do card" onclick="_openCtx(\''+c.id+'\',\''+board+'\',\''+effUid+'\',event)">⋮</button>'
      +'</div>'

      /* 2) Lead ID + tempo (+ Valor do negócio, alinhado à direita, só em Negócios) */
      +'<div class="mb-card-meta-row">'
        +'<div class="mb-card-num">'+(board==='negocios'?'Neg.':'Lead')+' #'+c.id.slice(-6).toUpperCase()+' <span class="mb-card-meta">· há '+ago+'</span></div>'
        +(board==='negocios'?'<div class="mb-card-value">'+(c.valor?fmtBRL(c.valor):'—')+'</div>':'')
      +'</div>'

      /* 3) Badge da etapa (compacta, não é mais chevron em largura total) */
      +'<div class="mb-card-stage-row"><button class="mb-card-chevron" style="background:'+stageColor(c.col)+'" onclick="openStagePicker(\''+board+'\',\''+c.id+'\',\''+effUid+'\')">'+eH(colLbl)+'</button></div>'

      /* [REMOVIDO 20260821] Bloco "4) Sub-etapa" (barra segmentada +
         botão "2° tentativa"/"Sub-etapa") — removido do mobile a pedido
         do usuário. card.sub e a função de definir/ler sub-etapa
         continuam existindo por baixo (não apaga dado de card que já
         tinha sub-etapa marcada) — só parou de aparecer/ser editável
         aqui. Desktop nunca teve essa feature, então nada muda lá. */

      /* 5) Telefone — uma linha só */
      +(c.tel?'<div class="mb-card-contact-badge">📞 '+eH(c.tel)+'</div>':'')

      /* 6) Responsável — avatar pequeno + nome · cargo */
      +'<div class="mb-card-resp"><div class="mb-card-resp-av" style="background:'+respAvBg+'">'+(_respNome.charAt(0).toUpperCase())+'</div>'
      +'<div class="mb-card-resp-info"><span class="mb-card-resp-name">'+eH(_respNome.split(' ')[0])+'</span><span class="mb-card-resp-cargo">'+eH(resp.cargo||'')+'</span></div></div>'

      +(_mbIsLivreLead?'<button class="kb-assume-btn mb-assume-btn" onclick="assumeLead(\''+c.id+'\',\'leads\',\''+effUid+'\')">✋ Assumir Lead</button>':'')
      +'</div>'

      /* 7) Barra de ações — 2026-08-05: removidos ⬆️⬇️ (mover na etapa)
         a pedido do usuário — "não são úteis pra celular". Ficam só as
         3 ações realmente usadas no dia a dia mobile. As funções
         mbReorderTap/_mbReorderCard continuam existindo no arquivo (só
         não são mais chamadas por aqui) — reversível se um dia
         quiserem de volta. */
      +'<div class="mb-card-actions">'
      +'<button class="mb-action-btn call" aria-label="Ligar" onclick="callClient(\''+telJs+'\',\''+nameJs+'\')" title="Ligar">📞</button>'
      +'<button class="mb-action-btn whatsapp" aria-label="WhatsApp" onclick="openWhatsApp(\''+telJs+'\',\''+nameJs+'\')" title="WhatsApp">💬</button>'
      +'<button class="mb-action-btn timeline" aria-label="Abrir detalhe" onclick="openKBDet(\''+c.id+'\',\''+board+'\',\''+effUid+'\')" title="Linha do tempo">📊</button>'
      +'</div></div>';
  }).join('');
  // [FIX 20260821] restaura a posição de rolagem capturada no início da
  // função — mesmo padrão (2 rAF + reforço com setTimeout) já usado e
  // testado em _kbRestoreScrollState (desktop).
  if(_mbScrollTop){
    var _mbApplyScroll=function(){ try{ wrap.scrollTop=_mbScrollTop; }catch(_e){} };
    requestAnimationFrame(function(){ requestAnimationFrame(_mbApplyScroll); });
    setTimeout(_mbApplyScroll,400);
  }
}

/* Barra segmentada da sub-etapa (5 blocos) — helper NOVO, só de apresentação.
   Usa exatamente o mesmo SUB_ETAPA_OPTIONS já existente (não duplica nem
   reinterpreta a lista); não lê nem escreve nenhum dado, só decide quantos
   dos 5 blocos aparecem preenchidos, a partir do índice de c.sub na lista
   (mesmo cálculo que _subPct já fazia, só que discreto em vez de %). */
function _subSegHTML(sub){
  var total=SUB_ETAPA_OPTIONS.length;
  var idx=sub?SUB_ETAPA_OPTIONS.indexOf(sub):-1;
  var filled=idx<0?0:idx+1;
  var html='';
  for(var i=0;i<total;i++){
    html+='<span class="mb-card-sub-seg'+(i<filled?' filled':'')+'"></span>';
  }
  return html;
}

/* Monta a mesma base de lista usada pelo kanban mobile (mesmo consultor/ADM-todos,
   mesmos filtros avançados e busca), mas SEM aplicar o filtro de etapa — usada tanto
   pela barra-resumo ("Etapa atual") quanto pelo modal seletor, pra poder contar/somar
   quantos registros existem em cada etapa. */
function _kbBaseListForSummary(board){
  var uid=activeUID(board);
  var list;
  if(hasAdminAccess()&&!_kbViewUid[board]){
    var _u=getUsers().filter(function(u){return u.ativo;});
    list=[];
    _u.forEach(function(u){getKBFor(board,u.id).forEach(function(c){c._timeOwnerUid=u.id;list.push(c);});});
  } else {
    list=(board==='leads'&&!hasAdminAccess())?_collectLivrePoolForUser(uid):getKBFor(board,uid);
  }
  var f=_kbFilter[board]||{};
  list=list.filter(function(c){
    if(f.nicho&&(c.nicho||'')!==f.nicho)return false;
    if(f.valorMin&&board==='negocios'&&(parseFloat(c.valor)||0)<parseFloat(f.valorMin))return false;
    if(f.valorMax&&board==='negocios'&&(parseFloat(c.valor)||0)>parseFloat(f.valorMax))return false;
    if(f.dias&&c.createdAt){var d=Math.floor((Date.now()-new Date(c.createdAt).getTime())/86400000);if(d<parseInt(f.dias,10))return false;}
    if(f.usuario&&(c._timeOwnerUid||uid)!==f.usuario)return false;
    if(_kbOnlyLate[board]&&!_kbHasOverdueLinkedActivity(c, c._timeOwnerUid || uid, board))return false;
    return true;
  });
  var q=(_kbQ&&_kbQ[board])||'';
  if(q)list=list.filter(function(c){return c.name.toLowerCase().indexOf(q)>=0||(c.tel||'').indexOf(q)>=0;});
  return list;
}

/* Atualiza a barra "Etapa atual / Valor, R$" no topo da lista mobile (estilo Bitrix24). */
function renderStageSummaryBar(board){
  var valEl=document.getElementById('ssb-val-'+board),moneyEl=document.getElementById('ssb-money-'+board);
  if(!valEl)return;
  var list=_kbBaseListForSummary(board);
  var stage=_mbStageFilter[board];
  var shown=stage?list.filter(function(c){return c.col===stage;}):list;
  var sum=shown.reduce(function(s,c){return s+(parseFloat(c.valor)||0);},0);
  valEl.textContent=stage?(_colLabel(board,stage)+' ('+shown.length+')'):('Todas as etapas ('+list.length+')');
  if(moneyEl)moneyEl.textContent=sum.toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0});
}

/* Contexto do modal #mo-stage-picker: qual board e (se for troca de etapa de um card
   específico, em vez de filtro da tela) qual cardId está em edição. */
var _spCtx={board:null,cardId:null,ownerUid:null}

/* Abre o seletor de etapa em tela cheia, estilo Bitrix24 (etapas em forma de seta colorida).
   Sem cardId: modo filtro da tela (mostra "Todas as etapas" + contagem/valor por etapa).
   Com cardId: modo troca de etapa do card (sem "Todas", destaca a etapa atual do card). */
function openStagePicker(board,cardId,ownerUid){
  _spCtx={board:board,cardId:cardId||null,ownerUid:ownerUid||null};
  var titleEl=document.getElementById('sp-title'),subEl=document.getElementById('sp-subtitle'),listEl=document.getElementById('sp-list');
  if(!listEl)return;
  var cols=kbCols(board);
  titleEl.textContent=board==='negocios'?'Pipeline "Geral"':'Leads';
  subEl.textContent='Selecionar etapa do '+(board==='negocios'?'negócio':'lead');
  var currentCol=null;
  if(cardId){
    var uid=ownerUid||activeUID(board);
    var card=getKBFor(board,uid).find(function(x){return x.id===cardId;});
    currentCol=card?card.col:null;
  }
  var html='';
  if(!cardId){
    var list=_kbBaseListForSummary(board);
    var allSum=list.reduce(function(s,c){return s+(parseFloat(c.valor)||0);},0);
    html+='<button class="sp-row all'+(!_mbStageFilter[board]?' sel':'')+'" onclick="_spSelect(null)">'
      +'<span>Todas as etapas ('+list.length+')</span><span class="sp-row-meta">'+fmtBRL(allSum)+'</span></button>';
  }
  var _curLocked=cardId&&_kbCardLocked(board,currentCol,'from');
  html+=cols.map(function(c,i){
    var sel=cardId?(currentCol===c.id):(_mbStageFilter[board]===c.id);
    var meta='';
    if(!cardId){
      var list=_kbBaseListForSummary(board);
      var subList=list.filter(function(x){return x.col===c.id;});
      var sum=subList.reduce(function(s,x){return s+(parseFloat(x.valor)||0);},0);
      meta='<span class="sp-row-meta">'+subList.length+' &middot; '+fmtBRL(sum)+'</span>';
    }
    var rowLocked=cardId&&(_kbCardLocked(board,currentCol,'from')||_kbCardLocked(board,c.id,'target'));
    return '<button class="sp-row'+(sel?' sel':'')+(rowLocked?' sp-row-locked':'')+'" style="background:'+stageColor(c.id)+(rowLocked?';opacity:.4;cursor:not-allowed':'')+'"'+(rowLocked?' disabled':' onclick="_spSelect(\''+c.id+'\')"')+'>'
      +'<span>'+(i+1)+'. '+eH(c.label)+'</span>'+meta+'</button>';
  }).join('');
  listEl.innerHTML=html;
  openM('mo-stage-picker');
}

/* Callback dos botões do modal seletor de etapa: em modo filtro, atualiza o filtro da
   tela; em modo card, move o card pra etapa escolhida (reaproveita moveCard, que já
   cuida de conversão Lead->Negócio, histórico, automações etc). */
function _spSelect(colId){
  var board=_spCtx.board,cardId=_spCtx.cardId,ownerUid=_spCtx.ownerUid;
  if(cardId){
    var _uid0=ownerUid||activeUID(board);var _c0=getKBFor(board,_uid0).find(function(x){return x.id===cardId;});
    if(_c0&&(_kbCardLocked(board,_c0.col,'from')||_kbCardLocked(board,colId,'target'))){toast('🔒 Apenas o Gestor pode mover a partir/para esta etapa.');closeM('mo-stage-picker');return;}
    moveCard(cardId,board,colId,_uid0);
  } else {
    _mbStageFilter[board]=colId;
    renderKBMobile(board);
  }
  closeM('mo-stage-picker');
}

/* Campo opcional de "sub-etapa" (ex: "2° tentativa"), exibido no card como uma pílula
   clara com uma barrinha de progresso embaixo — visual equivalente ao segundo campo que
   aparece ao lado da etapa principal no app do Bitrix24. É um campo adicional (card.sub),
   não mexe na etapa principal (card.col) nem em nenhuma lógica já existente. */
var SUB_ETAPA_OPTIONS=['1ª tentativa','2° tentativa','3ª tentativa','Aguardando retorno','Confirmado'];

var SUB_ETAPA_COLORS=['#36c6f0','#3a6fe0','#7a5230','#d4b106','#2e9e4f'];

function _subPct(sub){
  if(!sub)return 0;
  var i=SUB_ETAPA_OPTIONS.indexOf(sub);
  return i<0?0:Math.round(((i+1)/SUB_ETAPA_OPTIONS.length)*100);
}

function setCardSub(cardId,board,uid,val){
  var arr=getKBFor(board,uid);
  var card=arr.find(function(x){return x.id===cardId;});
  if(!card)return;
  card.sub=val||'';
  saveKBFor(board,uid,arr);
  renderKBMobile(board);
}

function openSubEtapaPicker(board,cardId,uid){
  var listEl=document.getElementById('sp-list'),titleEl=document.getElementById('sp-title'),subEl=document.getElementById('sp-subtitle');
  if(!listEl)return;
  titleEl.textContent='Sub-etapa';
  subEl.textContent='Selecionar sub-etapa (opcional)';
  var arr=getKBFor(board,uid);
  var card=arr.find(function(x){return x.id===cardId;});
  var cur=card?card.sub:'';
  var html='<button class="sp-row all'+(!cur?' sel':'')+'" onclick="setCardSub(\''+cardId+'\',\''+board+'\',\''+uid+'\',\'\');closeM(\'mo-stage-picker\')"><span>Sem sub-etapa</span></button>';
  html+=SUB_ETAPA_OPTIONS.map(function(o,i){
    var safe=o.replace(/'/g,"\\'");
    return '<button class="sp-row'+(cur===o?' sel':'')+'" style="background:'+(SUB_ETAPA_COLORS[i]||'#3a3f4a')+'" onclick="setCardSub(\''+cardId+'\',\''+board+'\',\''+uid+'\',\''+safe+'\');closeM(\'mo-stage-picker\')"><span>'+eH(o)+'</span></button>';
  }).join('');
  listEl.innerHTML=html;
  openM('mo-stage-picker');
}

// Re-renderiza a lista mobile (e o kanban desktop) quando o usuário gira a tela ou
// redimensiona a janela cruzando o breakpoint de 768px — evita ficar com a lista
// desatualizada caso o card tenha sido criado/editado num resize anterior.
var _mbResizeTimer=null;


/* R12B-17: aviso de perda de dados se a aba for fechada com modal de edição aberta */
window.addEventListener('beforeunload', function(e) {
  var editing = document.querySelector('.mo.open[id*="kb-det"], .mo.open[id*="edit"]');
  if (editing) {
    e.preventDefault();
    e.returnValue = 'Você tem edições não salvas. Deseja sair mesmo assim?';
  }
});

/* LF-FIX-3BUGS-v1-20260819 #3: listener cross-guia — ao receber aviso de saveKBFor em outra guia,
   re-le o localStorage (mesma origem = storage compartilhado) e re-renderiza
   o board sem rede nem F5. */
(function(){
  if(window.__LF_KB_BC_LISTEN__)return;
  window.__LF_KB_BC_LISTEN__=true;
  if(!('BroadcastChannel' in window))return;
  try{
    var bc=new BroadcastChannel('lf_kb_v1');
    bc.onmessage=function(ev){
      var d=ev&&ev.data;if(!d||d.t!=='kb')return;
      if(typeof renderKBLocal==='function'&&d.board)renderKBLocal(d.board);
      try{window._lfRefreshTabDots&&window._lfRefreshTabDots();}catch(_e){}
    };
  }catch(_e){}
})();
