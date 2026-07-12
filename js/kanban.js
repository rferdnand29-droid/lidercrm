/* =====================================================================
 * kanban.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

var KB_LEADS_COLS=[{id:'novo',label:'Novo Lead',cls:'c-novo'},{id:'tent',label:'2° Tentativa',cls:'c-tent'},{id:'whats',label:'WhatsApp',cls:'c-whats'},{id:'livre',label:'Lead Livre',cls:'c-livre'},{id:'conv',label:'Convertido',cls:'c-conv'},{id:'desc',label:'Descartado',cls:'c-desc'}];

var KB_NEG_COLS=[
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

var KB_NEG_RESTRICTED=['fich','aprov','fecham','fechado','vidp'];

/* Uma vez que um card de Negócios entra numa etapa de KB_NEG_RESTRICTED, consultores comuns
   (não-gestor) deixam de poder movê-lo PARA FORA dela também (antes só bloqueava entrada
   em novas etapas restritas, mas o card continuava "arrastável" pra qualquer outra etapa
   livre). Usado por _makeCard (drag desktop), openKBDet/moveCard (painel de detalhe) e
   openStagePicker/_spSelect (seletor mobile estilo Bitrix). */
function _kbCardLocked(board,col){return board==='negocios'&&KB_NEG_RESTRICTED.indexOf(col)>=0&&getMyRole()!=='gestor';}

/* Cores planas usadas nos botões/etapas "em forma de seta" da interface mobile
   (estilo Bitrix24 — ver openStagePicker/renderKBMobile). Uma cor por coluna,
   reaproveitando a paleta já usada nos cabeçalhos do kanban desktop (.kb-col-hd.c-*)
   sempre que possível, pra manter a mesma identidade visual entre desktop e mobile. */
var STAGE_COLORS={
  novo:'#1a1a1f',tent:'#36c6f0',whats:'#1B8A5E',livre:'#2f4fa0',conv:'#27ae60',desc:'#c0392b',
  retag:'#d4b106',agvid:'#36c6f0',presencial:'#1B8A5E',reag:'#36c6f0',cart:'#3a6fe0',
  vidp:'#7a5230',fich:'#d9491f',aprov:'#2ecfa0',fecham:'#1a4a0a',fechado:'#0a2a05',noshow:'#7b1d1d'
}

function stageColor(id){return STAGE_COLORS[id]||'#3a3f4a';}

function kbCols(b){return b==='leads'?KB_LEADS_COLS:KB_NEG_COLS;}

function kbKeyFor(b,uid){return 'lf6_kb_'+b+'_'+uid;}

function getKB(b){return sg(kbKeyFor(b,S.userId))||[];}

function getKBFor(b,uid){return sg(kbKeyFor(b,uid))||[];}

// CORREÇÃO (mesma causa do bug "usuário some" aplicada aqui também): toda vez que o app
// baixa uma lista do Firestore em segundo plano (clientes, cards de Kanban) pra atualizar
// o cache local, ele SUBSTITUÍA a lista local inteira pela do servidor. Se algo criado
// neste aparelho (um card novo, um cliente novo) ainda não tinha terminado de sincronizar
// — ou a gravação falhou por qualquer motivo — essa substituição apagava o item local sem
// nenhum aviso, mesmo ele tendo sido salvo com sucesso na tela momentos antes. Esta função
// central faz a MESCLA seguro: usa a versão do servidor como base (pra refletir edições
// feitas em outros aparelhos) e preserva qualquer item que só existe localmente.
function _mergeKeepLocalOnly(serverList,localList){
  serverList=serverList||[];localList=localList||[];
  var serverIds={};serverList.forEach(function(x){if(x&&x.id)serverIds[x.id]=true;});
  var extra=localList.filter(function(x){return x&&x.id&&!serverIds[x.id];});
  return extra.length?serverList.concat(extra):serverList;
}

function saveKB(b,list){var localOk=ss(kbKeyFor(b,S.userId),list);if(DB_MODE==='firebase'&&db){syncBusy();db.collection('kb_'+b).doc(S.userId).set({list:list,ts:Date.now()}).then(syncOk).catch(syncErr);}return localOk;}

function saveKBFor(b,uid,list){var localOk=ss(kbKeyFor(b,uid),list);if(DB_MODE==='firebase'&&db){syncBusy();db.collection('kb_'+b).doc(uid).set({list:list,ts:Date.now()}).then(syncOk).catch(syncErr);}return localOk;}

var _kbViewUid={leads:null,negocios:null}

function activeUID(b){if(!S)return null;return(hasAdminAccess(S.userId)&&_kbViewUid[b])?_kbViewUid[b]:S.userId;}

function activeList(b){var u=activeUID(b);return u===S.userId?getKB(b):getKBFor(b,u);}

function saveActive(b,list){var u=activeUID(b);if(u===S.userId)return saveKB(b,list);return saveKBFor(b,u,list);}

/* Varias acoes de Kanban (mover card arrastando, transferir, descartar, restaurar
   snapshot) nunca mostravam nada quando davam certo OU quando davam errado — se o
   localStorage estivesse cheio, a mudanca sumia ao recarregar a pagina sem nenhum aviso.
   Isso so avisa quando FALHA (nao inventa um toast de sucesso onde nao existia antes). */
var _kbLastOpFailed=false;

function _kbWarnIfFailed(ok){if(!ok){_kbLastOpFailed=true;toast('⚠️ Alteração pode não ter sido salva — armazenamento local cheio.',4000);}return ok;}

var _kbDragId=null,_kbDragBoard=null,_kbDragOwner=null,_kbDetId=null,_kbDetBoard=null,_kbDetOwnerUid=null,_kbCtxId=null,_kbCtxBoard=null,_kbCtxOwner=null;

var _kbNavFromAdm=false;

 // flag: sinaliza que goPage foi chamado via admViewBoard
var _kbQ={leads:'',negocios:''}

var _kbFilter={leads:{nicho:'',valorMin:'',valorMax:'',dias:''},negocios:{nicho:'',valorMin:'',valorMax:'',dias:''}}

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
   clica (mouseup) pra parar. */
var _kbHoverScrollTimer=null;

function kbScrollHoverStart(wrapId,dir){
  kbScrollHoverStop();
  var el=document.getElementById(wrapId);if(!el)return;
  _kbHoverScrollTimer=setTimeout(function(){
    _kbHoverScrollTimer=setInterval(function(){el.scrollBy({left:dir*16,behavior:'auto'});},16);
  },220);
}

function kbScrollHoverStop(){
  if(_kbHoverScrollTimer){clearTimeout(_kbHoverScrollTimer);clearInterval(_kbHoverScrollTimer);_kbHoverScrollTimer=null;}
}

// ============================================================
// KANBAN
// ============================================================
function renderKBConsBar(board){
  var el=document.getElementById(board+'-cons-bar');if(!el)return;
  if(!hasAdminAccess()){el.innerHTML='';return;}
  // Exibe todos os usuários ativos para filtro (incluindo o próprio ADM/Gerente)
  var users=getUsers().filter(function(u){return u.ativo;});
  if(!users.find(function(u){return u.id===S.userId;})){
    users.unshift({id:S.userId,nome:S.nome||'Eu',ativo:true});
  }
  var cur=_kbViewUid[board],boardJs=_jsSq(board);
  var html='<span style="font-size:.65rem;color:var(--mu);margin-right:4px">Ver:</span><button class="kb-cons-chip'+(cur===null?' on':'')+'" onclick="setKBView(\''+boardJs+'\',null,this)">Todos</button>';
  users.forEach(function(u){var uidJs=_jsSq(u.id);html+='<button class="kb-cons-chip'+(cur===u.id?' on':'')+'" onclick="setKBView(\''+boardJs+'\',\''+uidJs+'\',this)">'+eH(u.nome.split(' ')[0])+'</button>';});
  el.innerHTML=html;
}

function setKBView(board,uid,btn){
  _kbViewUid[board]=uid||null;
  var bar=document.getElementById(board+'-cons-bar');
  if(bar)bar.querySelectorAll('.kb-cons-chip').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');renderKBLocal(board);setTimeout(function(){renderKB(board);},1200);
}

/* CORREÇÃO DE LENTIDÃO AO ABRIR/TROCAR DE QUADRO:
   antes, renderKB() sempre esperava loadKBRemote() (rede/Firestore) responder ANTES de
   desenhar qualquer coisa — trocar de aba Leads/Negócios (ou trocar o filtro de consultor)
   ficava "pensando" até a rede responder. Agora a função pinta o quadro IMEDIATAMENTE com
   o que já está no cache local (renderKBLocal — mesma função já usada, sem rede, no
   drag-and-drop) e só then dispara a sincronização com a nuvem em segundo plano; se
   chegar algo novo (mudança feita em outro aparelho), o quadro é redesenhado de novo,
   sem o usuário jamais esperar a rede pra ver algo na tela. */
function renderKB(board){
  var wrap=document.getElementById(board==='leads'?'leads-kanban':'negocios-kanban');if(!wrap)return;
  renderKBLocal(board); // pintura instantânea, sempre a partir do cache local
  _syncKBRemoteBG(board);
}

function _syncKBRemoteBG(board){
  if(DB_MODE!=='firebase'||!db)return;
  if(hasAdminAccess()&&!_kbViewUid[board]){
    var _allAdmUsers=getUsers().filter(function(u){return u.ativo;});
    if(!_allAdmUsers.find(function(u){return u.id===S.userId;})){
      _allAdmUsers.push({id:S.userId,nome:S.nome||S.userId,ativo:true});
    }
    var _pending=_allAdmUsers.length;
    if(!_pending)return;
    _allAdmUsers.forEach(function(u){
      db.collection('kb_'+board).doc(u.id).get().then(function(d){
        var server=d.exists?(d.data().list||[]):[];
        var merged=_mergeKeepLocalOnly(server,getKBFor(board,u.id));
        ss(kbKeyFor(board,u.id),merged);
        if(merged.length!==server.length)saveKBFor(board,u.id,merged); // reenvia card(s) local(is) ainda não sincronizado(s)
      }).catch(function(){}).then(function(){
        _pending--;
        if(_pending<=0)renderKBLocal(board); // repinta uma única vez, já com tudo atualizado
      });
    });
  } else {
    var uid=activeUID(board);
    db.collection('kb_'+board).doc(uid).get().then(function(d){
      var server=d.exists?(d.data().list||[]):[];
      var merged=_mergeKeepLocalOnly(server,getKBFor(board,uid));
      ss(kbKeyFor(board,uid),merged);
      if(merged.length!==server.length)saveKBFor(board,uid,merged);
    }).catch(function(){}).then(function(){
      if(uid===S.userId)runAutomationEngine(board,getKBFor(board,uid),uid);
      renderKBLocal(board);
    });
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
  var wrap=document.getElementById(board==='leads'?'leads-kanban':'negocios-kanban');if(!wrap)return;
  if(board==='leads'){
    // CORREÇÃO (auditoria, Duplicatas — controle de acesso): o botão "🔍 Duplicatas" era
    // HTML estático sem nenhum hasAdminAccess(), diferente de todo o resto do app (que
    // sempre esconde ações de ADM/Gestor via toggle de display). Qualquer Consultor comum
    // conseguia abrir o scanner e ver/excluir Leads e Negócios de TODOS os outros
    // consultores — ver correção também em openDuplicateScanner()/_dupDeleteAndRescan().
    var dsb=document.getElementById('dup-scan-btn');if(dsb)dsb.style.display=hasAdminAccess()?'':'none';
  }
  if(hasAdminAccess()&&!_kbViewUid[board]){
    var _allAdmUsers=getUsers().filter(function(u){return u.ativo;});
    if(!_allAdmUsers.find(function(u){return u.id===S.userId;}))_allAdmUsers.push({id:S.userId,nome:S.nome||S.userId,ativo:true});
    var _allAdmList=[];
    _allAdmUsers.forEach(function(u){
      var list=getKBFor(board,u.id);
      list.forEach(function(c){c._timeOwnerUid=u.id;});
      _allAdmList=_allAdmList.concat(list);
    });
    _buildKB(board,_allAdmList,wrap,null);
  } else {
    var uid=activeUID(board);
    _buildKB(board,getKBFor(board,uid),wrap,uid);
  }
  if(typeof isMobileView==='function'&&isMobileView()&&typeof renderKBMobile==='function')renderKBMobile(board);
}

function filterKB(board){
  var inp=document.getElementById(board==='leads'?'lead-search':'neg-search');
  _kbQ[board]=(inp?inp.value:'').toLowerCase();renderKBLocal(board);
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
      if(_kbOnlyLate[board]&&!_isOverdue(c))return false;
      return true;
    });
    var restricted=board==='negocios'&&KB_NEG_RESTRICTED.indexOf(col.id)>=0&&!canAll;
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
      ca.addEventListener('dragleave',function(e){if(!ca.contains(e.relatedTarget)){colEl.classList.remove('drag-over');var ph=document.getElementById('kb-ph');if(ph&&ph.parentNode===ca)ph.remove();if(ca._kbDragRAF){cancelAnimationFrame(ca._kbDragRAF);ca._kbDragRAF=null;}}});
      ca.addEventListener('drop',function(e){
        e.preventDefault();colEl.classList.remove('drag-over');var ph=document.getElementById('kb-ph');if(ph)ph.remove();
        if(ca._kbDragRAF){cancelAnimationFrame(ca._kbDragRAF);ca._kbDragRAF=null;}
        if(!_kbDragId||_kbDragBoard!==board)return;
        var uid2=_kbDragOwner||activeUID(board);
        _kbMoveCard(_kbDragId,board,uid2,col.id);
        renderKBLocal(board);
      });
    }
    if(!readOnly)_touchZone(ca,board,col.id,restricted);
    colEl.appendChild(ca);wrap.appendChild(colEl);
  });
}

function _afterEl(container,y){var els=Array.from(container.querySelectorAll('.kb-card:not(.dragging)'));return els.reduce(function(cl,el){var b=el.getBoundingClientRect();var off=y-b.top-b.height/2;return off<0&&off>cl.offset?{offset:off,el:el}:cl;},{offset:Number.NEGATIVE_INFINITY,el:null}).el;}

function _makeCard(c,board,ownerUid,readOnly){
  var el=document.createElement('div');
  var _locked=_kbCardLocked(board,c.col);
  var effOwnerUid=c._timeOwnerUid||ownerUid;
  el.className='kb-card'+(readOnly?' kb-card-ro':'')+(_locked?' kb-card-locked':'');el.draggable=!readOnly&&!_locked;el.dataset.id=c.id;el.dataset.board=board;el.dataset.owner=effOwnerUid||S.userId;
  var n=c.nicho||'outro';
  var dt='';try{if(c.createdAt)dt=new Date(c.createdAt).toLocaleDateString('pt-BR');}catch(e){}
  var actBadge=_cardActBadge(c,effOwnerUid);
  var ownerTag='';if(effOwnerUid&&effOwnerUid!==S.userId){var ou=getUser(effOwnerUid);ownerTag='<div class="kb-owner-tag" style="background:rgba(195,154,45,.1);color:var(--al)">'+eH(ou?ou.nome.split(' ')[0]:'?')+'</div>';}
  var _staleMs=7*24*60*60*1000;
  var _lastMov=c.updatedAt||c.createdAt;
  var _isStale=_lastMov&&(Date.now()-new Date(_lastMov).getTime())>_staleMs&&c.col!=='fechado'&&c.col!=='conv'&&c.col!=='desc'&&c.col!=='noshow'&&c.col!=='desist';
  if(_isStale)el.classList.add('stale');
  el.innerHTML='<div class="kb-card-num">#'+c.id.slice(-6).toUpperCase()+'</div>'
    +'<span class="kb-card-nicho '+n+'">'+(NICHO_LABELS[n]||n)+'</span>'
    +'<div class="kb-card-top"><div class="kb-card-name">'+eH(c.name)+(c.tel&&!readOnly?'<button class="kb-copy-tel-btn" title="Copiar número" aria-label="Copiar número">📎</button>':'')+'</div>'+(readOnly?'':'<button class="kb-card-sel-btn" title="Selecionar" aria-label="Selecionar card" onclick="event.stopPropagation();toggleBulkSelect(\''+c.id+'\',\''+board+'\',\''+effOwnerUid+'\',this.closest(\'.kb-card\'))">&#9633;</button><button class="kb-card-menu" aria-label="Opções do card">⋯</button><button class="kb-card-del-btn" title="Excluir permanentemente" aria-label="Excluir card permanentemente">✕</button>')+'</div>'
    +(c.tel?'<div class="kb-card-tel">'+eH(c.tel)+'</div>':'')
    +(c.tel&&!readOnly?'<button class="kb-call-btn" aria-label="Ligar para o cliente">📞 Ligar</button><button class="kb-wa-btn">✉️ WhatsApp</button>':'')
    +(board==='negocios'&&c.valor?'<div class="kb-card-valor" style="font-size:.72rem;font-weight:700;color:var(--ok);margin-top:2px">'+fmtBRL(c.valor)+'</div>':'')
    +'<div class="kb-card-date">'+dt+'</div>'
    +(c.obs?'<div class="kb-card-obs">'+eH(c.obs.slice(0,60))+'</div>':'')
    +actBadge+ownerTag
    +(_locked?'<div class="kb-locked-tag" title="Apenas o Gestor pode mover a partir desta etapa">&#128274; Etapa travada</div>':'')
    +(readOnly?'':'<button class="kb-act-btn">Lembrete</button>')
    +(!readOnly&&board==='leads'&&c.col!=='conv'?'<button class="kb-convert-btn">Converter em Negocio</button>':'');
  if(readOnly){
    // Modo somente leitura (página Time/Supervisor): sem drag, sem menu, sem ações —
    // só visualização. Clicar abre o detalhe em modo leitura (sem editar/mover/excluir).
    el.addEventListener('click',function(){openKBDet(c.id,board,effOwnerUid||S.userId,true);});
    return el;
  }
  el.addEventListener('dragstart',function(e){_kbDragId=c.id;_kbDragBoard=board;_kbDragOwner=effOwnerUid||S.userId;el.classList.add('dragging');e.dataTransfer.effectAllowed='move';});
  el.addEventListener('dragend',function(){el.classList.remove('dragging');_kbDragId=null;_kbDragOwner=null;});
  // 1 clique = selecionar (estilo Bitrix24), 2 cliques = abrir detalhe
  var _cardClickTimer=null;
  el.addEventListener('click',function(e){
    if(e.target.closest('.kb-card-menu')||e.target.closest('.kb-convert-btn')||
       e.target.closest('.kb-act-btn')||e.target.closest('.kb-card-del-btn')||
       e.target.closest('.kb-call-btn')||e.target.closest('.kb-wa-btn')||
       e.target.closest('.kb-copy-tel-btn')||e.target.closest('.kb-card-sel-btn'))return;
    if(_bulkMode||_bulkSelected.length>0){toggleBulkSelect(c.id,board,effOwnerUid,el);return;}
    if(_cardClickTimer){
      clearTimeout(_cardClickTimer);_cardClickTimer=null;
      openKBDet(c.id,board,effOwnerUid);
    } else {
      _cardClickTimer=setTimeout(function(){
        _cardClickTimer=null;
        toggleBulkSelect(c.id,board,effOwnerUid,el);
      },260);
    }
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
    if(e.target.closest('.kb-card-menu')||e.target.closest('.kb-convert-btn')||
       e.target.closest('.kb-act-btn')||e.target.closest('.kb-call-btn')||
       e.target.closest('.kb-wa-btn')||e.target.closest('.kb-copy-tel-btn')||
       e.target.closest('.kb-card-del-btn')||e.target.closest('.kb-card-sel-btn'))return;
    _lpTimer=setTimeout(function(){
      _touchZoneCancelDrag();
      navigator.vibrate&&navigator.vibrate(40);
      toggleBulkSelect(c.id,board,effOwnerUid,el);
    },500);
  },{passive:true});
  el.addEventListener('touchend',function(){clearTimeout(_lpTimer);},{passive:true});
  el.addEventListener('touchmove',function(){clearTimeout(_lpTimer);},{passive:true});
  el.querySelector('.kb-act-btn').addEventListener('click',function(e){e.stopPropagation();_kbDetId=c.id;_kbDetBoard=board;_kbDetOwnerUid=effOwnerUid||S.userId;openQuickActivity();});
  var delBtn=el.querySelector('.kb-card-del-btn');if(delBtn)delBtn.addEventListener('click',function(e){e.stopPropagation();deleteKBCard(c.id,board,effOwnerUid||activeUID(board));});
  var callBtn=el.querySelector('.kb-call-btn');if(callBtn)callBtn.addEventListener('click',function(e){e.stopPropagation();callClient(c.tel,c.name);});
  var waBtn=el.querySelector('.kb-wa-btn');if(waBtn)waBtn.addEventListener('click',function(e){e.stopPropagation();openWhatsApp(c.tel,c.name);});
  var copyBtn=el.querySelector('.kb-copy-tel-btn');if(copyBtn)copyBtn.addEventListener('click',function(e){e.stopPropagation();copyToClipboard(c.tel,'Número copiado!');});
  var cvBtn=el.querySelector('.kb-convert-btn');if(cvBtn)cvBtn.addEventListener('click',function(e){e.stopPropagation();openConvertModal(c.id,effOwnerUid);});
  el.querySelector('.kb-card-menu').addEventListener('click',function(e){e.stopPropagation();_openCtx(c.id,board,effOwnerUid,e);});
  return el;
}

function _cardActBadge(c,ownerUid){
  // CORREÇÃO (auditoria, rastreamento de proveniência): usava getActivities(), que lê
  // sempre 'lf13_acts_'+S.userId (o usuário logado), em vez das atividades do DONO real
  // do card. Em qualquer visão agregada (Todos do ADM, Time do Supervisor) isso fazia o
  // badge de lembrete (🔔) sair errado/ausente para cards de outros consultores, porque
  // comparava clientId contra a lista de atividades da pessoa errada. getActivitiesLocalFor
  // já existe pra isso (mesma função usada por loadAllActivitiesAdmin) e, quando ownerUid
  // é o próprio usuário logado, resolve pra chave idêntica à de getActivities().
  var acts=getActivitiesLocalFor(ownerUid||S.userId).filter(function(a){return a.clientId===c.id&&!a.done;});if(!acts.length)return '';
  var next=acts.sort(function(a,b){return (a.scheduledAt||'').localeCompare(b.scheduledAt||'');})[0];
  var dt=next.scheduledAt?new Date(next.scheduledAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  var late=(next.scheduledAt&&new Date(next.scheduledAt)<new Date())?'⚠ ':'';
  return '<div style="font-size:.61rem;color:var(--bl);margin-top:3px">🔔 '+late+eH(next.desc.slice(0,28))+(dt?' · '+dt:'')+'</div>';
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
  var kn=document.getElementById('kb-nicho');
  // Para um novo LEAD, força o select a ficar vazio (opção "Selecione o nicho"), obrigando
  // o usuário a escolher antes de salvar — ver validação em saveKBCard(). Para Negócios
  // (que normalmente vêm de uma conversão de Lead) mantém o padrão "imovel" de antes.
  if(kn)kn.value=(board==='leads')?'':'imovel';
  var colSel=document.getElementById('kb-col');if(colSel)colSel.innerHTML=kbCols(board).map(function(c){return '<option value="'+c.id+'"'+(c.id===colId?' selected':'')+'>'+eH(c.label)+'</option>';}).join('');
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
        closeM('mo-kb');renderKBLocal(board);
        toast(savedOk0?'Atualizado!':'⚠️ Alteração pode não ter sido salva — armazenamento local cheio.');
        return;
      }
      if(newColVal!==oldColVal){
        cx.col=newColVal;
        _pushHistorico(cx,'Movido de "'+_colLabel(board,oldColVal)+'" para "'+_colLabel(board,newColVal)+'" (edição)');
      }
    }
    logFeedEvent('create',S.userId,name,'Editado',board);
    // CORREÇÃO (auditoria): idem acima — grava no dono real do card, não no filtro de visão.
    var savedOk1=saveKBFor(board,_kbEditOwnerUid||activeUID(board),arr);closeM('mo-kb');renderKBLocal(board);
    toast(savedOk1?'Atualizado!':'⚠️ Alteração pode não ter sido salva — armazenamento local cheio.');
  }else{
    // CRIAÇÃO: sempre salva no próprio usuário logado (S.userId), independente do filtro ADM ativo
    var criarUid=S.userId;
    var criarArr=getKBFor(board,criarUid);
    var novoCard={id:'kb_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),name:name,tel:(document.getElementById('kb-tel').value||'').trim(),nicho:document.getElementById('kb-nicho').value,col:document.getElementById('kb-col').value,obs:(document.getElementById('kb-obs').value||'').trim(),createdAt:new Date().toISOString(),userId:S.userId,attachments:[],historico:[]};
    _pushHistorico(novoCard,board==='leads'?'Lead criado':'Negócio criado');
    criarArr.push(novoCard);
    var savedOk2=saveKBFor(board,criarUid,criarArr);
    logFeedEvent('create',S.userId,name,'Novo '+board,board);
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
    goPage(board==='leads'?'leads':'negocios');
    // Scroll suave até o novo card após render
    setTimeout(function(){
      var el=document.querySelector('[data-id="'+novoCard.id+'"]');
      if(el){el.scrollIntoView({behavior:'smooth',block:'nearest'});el.classList.add('new-anim');}
    },120);
  }
}

function openKBDet(cardId,board,ownerUid,readOnly){
  _kbDetId=cardId;_kbDetBoard=board;_kbDetReadOnly=!!readOnly;
  var uid=ownerUid||activeUID(board);
  _kbDetOwnerUid=uid;
  var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===cardId;});if(!c)return;
  var dn=document.getElementById('det-name');if(dn)dn.textContent=c.name;
  var dt='';try{if(c.createdAt)dt=new Date(c.createdAt).toLocaleString('pt-BR');}catch(e){}
  var dm=document.getElementById('det-meta');if(dm)dm.textContent=(c.tel||'')+(dt?' · '+dt:'');
  _kbDetTel=c.tel||'';
  var nb=document.getElementById('det-nicho-badge');if(nb){nb.className='kb-card-nicho '+(c.nicho||'outro');nb.textContent=NICHO_LABELS[c.nicho||'outro']||c.nicho||'';}
  var canAll=(getMyRole()==='gestor');
  var cardLocked=readOnly||_kbCardLocked(board,c.col);
  var ds=document.getElementById('det-stages');
  if(ds)ds.innerHTML=kbCols(board).map(function(col){var active=c.col===col.id;var restricted=cardLocked||(board==='negocios'&&KB_NEG_RESTRICTED.indexOf(col.id)>=0&&!canAll);return '<button class="det-stage-btn" style="border-color:'+(active?'var(--amber)':'var(--b1)')+';background:'+(active?'rgba(195,154,45,.12)':'transparent')+';color:'+(active?'var(--al)':'var(--mu)')+'"'+(restricted?' disabled':'')+(readOnly?'':' onclick="moveCard(\''+cardId+'\',\''+board+'\',\''+col.id+'\',\''+uid+'\')"')+'>'+eH(col.label)+'</button>';}).join('');
  var dobs=document.getElementById('det-obs');if(dobs){dobs.value=c.obs||'';dobs.readOnly=!!readOnly;}var dos=document.getElementById('det-obs-saved');if(dos)dos.textContent='';
  var dvw=document.getElementById('det-valor-wrap');if(dvw)dvw.style.display=board==='negocios'?'block':'none';
  var dv=document.getElementById('det-valor');if(dv){dv.value=c.valor||'';dv.readOnly=!!readOnly;}
  var dcw=document.getElementById('det-convert-wrap');
  if(dcw){
    if(readOnly)dcw.innerHTML='';
    else if(board==='leads'&&c.col!=='conv')dcw.innerHTML='<button class="kb-convert-btn" onclick="openConvertModal(\''+cardId+'\',\''+uid+'\')">Converter em Negocio</button>';
    else if(board==='leads'&&c.col==='conv')dcw.innerHTML='<div style="font-size:.68rem;color:var(--ok);padding:6px 0">&#10003; Convertido em Negocio</div>';
    else dcw.innerHTML='';
  }
  // Responsavel + etapa (so ADM/Gerente — mesma regra ja usada em Clientes).
  // Tarefa 2: junta "alterar responsavel" com "decidir se continua Lead ou vira Negocio"
  // no mesmo painel, sem precisar abrir outra tela pra isso.
  var dtw=document.getElementById('det-transfer-wrap');
  if(dtw){
    if(!readOnly&&hasAdminAccess()){
      dtw.style.display='block';
      var trUsers=getUsers().filter(function(u){return u.id!=='adm'&&u.ativo;});
      var trSel=document.getElementById('det-resp-sel');
      if(trSel)trSel.innerHTML=trUsers.map(function(u){return '<option value="'+u.id+'"'+(u.id===uid?' selected':'')+'>'+eH(u.nome)+'</option>';}).join('');
      var brdSel=document.getElementById('det-resp-board');if(brdSel)brdSel.value=board;
      _fillDetRespCol(board,c.col);
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
  var mEdit=document.getElementById('det-btn-edit');if(mEdit)mEdit.style.display=readOnly?'none':'';
  var mDiscard=document.getElementById('det-btn-discard');if(mDiscard)mDiscard.style.display=readOnly?'none':'';
  var mDel=document.getElementById('det-btn-delete');if(mDel)mDel.style.display=readOnly?'none':'';
  var mCallWrap=document.getElementById('det-contact-actions');
  if(mCallWrap){
    if(_kbDetTel)mCallWrap.innerHTML='<button class="kb-call-btn" onclick="callClient(_kbDetTel,document.getElementById(\'det-name\').textContent)">📞 Ligar</button><button class="kb-wa-btn" onclick="openWhatsApp(_kbDetTel,document.getElementById(\'det-name\').textContent)">✉️ WhatsApp</button>';
    else mCallWrap.innerHTML='';
  }
  openM('mo-kb-det');
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
  c.valor=raw?parseFloat(raw):0;
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
  card.historico.unshift({texto:texto,ts:new Date().toISOString(),by:by||S.nome});
  if(card.historico.length>80)card.historico.length=80; // evita crescer pra sempre
}

function _colLabel(board,colId){var c=kbCols(board).find(function(x){return x.id===colId;});return c?c.label:colId;}

function moveCard(cardId,board,newCol,ownerUid){
  var uid=ownerUid||activeUID(board);
  var _preArr=getKBFor(board,uid);var _preCard=_preArr.find(function(x){return x.id===cardId;});
  if(_preCard&&_kbCardLocked(board,_preCard.col)){toast('🔒 Apenas o Gestor pode mover a partir desta etapa.');return;}
  var card=_kbMoveCard(cardId,board,uid,newCol);
  if(!card)return;
  var canAll=(getMyRole()==='gestor');
  var ds=document.getElementById('det-stages');
  if(ds)ds.innerHTML=kbCols(board).map(function(col){var active=card.col===col.id;var restricted=board==='negocios'&&KB_NEG_RESTRICTED.indexOf(col.id)>=0&&!canAll;return '<button class="det-stage-btn" style="border-color:'+(active?'var(--amber)':'var(--b1)')+';background:'+(active?'rgba(195,154,45,.12)':'transparent')+';color:'+(active?'var(--al)':'var(--mu)')+'"'+(restricted?' disabled':'')+' onclick="moveCard(\''+cardId+'\',\''+board+'\',\''+col.id+'\',\''+uid+'\')">'+eH(col.label)+'</button>';}).join('');
  var dcw=document.getElementById('det-convert-wrap');
  if(dcw){
    if(board==='leads'&&card.col!=='conv')dcw.innerHTML='<button class="kb-convert-btn" onclick="openConvertModal(\''+cardId+'\',\''+uid+'\')">Converter em Negocio</button>';
    else if(board==='leads'&&card.col==='conv')dcw.innerHTML='<div style="font-size:.68rem;color:var(--ok);padding:6px 0">&#10003; Convertido em Negocio</div>';
    else dcw.innerHTML='';
  }
  renderKBLocal(board);
}

function editKBFromDet(){
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  closeM('mo-kb-det');_kbEditId=id;_kbEditBoard=board;_kbEditOwnerUid=uid;
  var mt=document.getElementById('mo-kb-title');if(mt)mt.textContent='Editar';
  document.getElementById('kb-name').value=c.name||'';document.getElementById('kb-tel').value=c.tel||'';document.getElementById('kb-nicho').value=c.nicho||'imovel';document.getElementById('kb-obs').value=c.obs||'';
  var cs=document.getElementById('kb-col');if(cs)cs.innerHTML=kbCols(board).map(function(col){return '<option value="'+col.id+'"'+(col.id===c.col?' selected':'')+'>'+eH(col.label)+'</option>';}).join('');
  document.getElementById('kb-edit-id').value=id;document.getElementById('kb-board-type').value=board;openM('mo-kb');
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
  if(sel)sel.innerHTML=KB_NEG_COLS.map(function(col){return '<option value="'+col.id+'"'+(col.id==='retag'?' selected':'')+'>'+eH(col.label)+'</option>';}).join('');
  var vv=document.getElementById('conv-neg-valor');if(vv)vv.value='';
  var ov=document.getElementById('conv-neg-obs');if(ov)ov.value=c.obs||'';
  document.getElementById('conv-neg-card-id').value=cardId;
  document.getElementById('conv-neg-owner-uid').value=uid;
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
  if(lead){
    lead.col=targetCol||lead.colAntesConv||'livre';lead.updatedAt=new Date().toISOString();
    _pushHistorico(lead,'Negócio revertido para Lead (etapa: "'+_colLabel('leads',lead.col)+'")');
    okL=saveKBFor('leads',uid,leadsArr);
  }else{
    lead={id:'kb_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),name:n.name,tel:n.tel,nicho:n.nicho,col:targetCol||'livre',obs:n.obs||'',createdAt:new Date().toISOString(),userId:uid,attachments:[],historico:[]};
    _pushHistorico(lead,'Lead recriado a partir do Negócio "'+n.name+'" (o lead original já havia sido excluído)');
    leadsArr.push(lead);okL=saveKBFor('leads',uid,leadsArr);
  }
  negArr=negArr.filter(function(x){return x.id!==cardId;});
  var okN=saveKBFor('negocios',uid,negArr);
  renderKBLocal('negocios');renderKBLocal('leads');
  logFeedEvent('move',S.userId,n.name,'Negocio -> Lead','negocios');
  toast((okL&&okN)?(n.name+' -> Leads!'):'⚠️ Reversão pode não ter sido salva — armazenamento local cheio.');
  return lead;
}

/* Preenche o select de etapa do painel "Continua como" de acordo com o board escolhido
   (Lead ou Negocio tem listas de etapas diferentes). */
function _fillDetRespCol(board,selectedCol){
  var colSel=document.getElementById('det-resp-col');if(!colSel)return;
  colSel.innerHTML=kbCols(board).map(function(col){return '<option value="'+col.id+'"'+(col.id===selectedCol?' selected':'')+'>'+eH(col.label)+'</option>';}).join('');
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
  var newBoard=(document.getElementById('det-resp-board')||{}).value||board;
  var newCol=(document.getElementById('det-resp-col')||{}).value||c.col;
  var newUid=(document.getElementById('det-resp-sel')||{}).value||uid;
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
  if(newUid&&newUid!==uid){
    _kbTransferCard(id,board,uid,newUid,true,function(res){
      closeM('mo-kb-det');renderKBLocal('leads');renderKBLocal('negocios');
      if(res)toast('Atualizado!');
    });
  }else{
    closeM('mo-kb-det');renderKBLocal('leads');renderKBLocal('negocios');
    toast('Atualizado!');
  }
}

// Context menu
var _ctxOutsideHandler=null;

function _openCtx(cardId,board,ownerUid,e){
  _kbCtxId=cardId;_kbCtxBoard=board;_kbCtxOwner=ownerUid;
  var ctx=document.getElementById('kb-ctx');if(!ctx)return;
  var cvBtn=document.getElementById('ctx-convert'),cvSep=document.getElementById('ctx-conv-sep');
  if(cvBtn)cvBtn.style.display=(board==='leads')?'block':'none';
  if(cvSep)cvSep.style.display=(board==='leads')?'block':'none';
  ctx.style.display='block';
  var x=Math.min(e.clientX,window.innerWidth-170),y=Math.min(e.clientY,window.innerHeight-240);
  ctx.style.left=x+'px';ctx.style.top=y+'px';
  if(_ctxOutsideHandler){document.removeEventListener('click',_ctxOutsideHandler);}
  setTimeout(function(){
    _ctxOutsideHandler=function(){ctx.style.display='none';document.removeEventListener('click',_ctxOutsideHandler);_ctxOutsideHandler=null;};
    document.addEventListener('click',_ctxOutsideHandler);
  },10);
}

function _closeCtx(){var ctx=document.getElementById('kb-ctx');if(ctx)ctx.style.display='none';_kbCtxId=null;_kbCtxBoard=null;_kbCtxOwner=null;}

function ctxView(){_closeCtx();openKBDet(_kbCtxId,_kbCtxBoard,_kbCtxOwner);}

function ctxEdit(){_closeCtx();_kbDetId=_kbCtxId;_kbDetBoard=_kbCtxBoard;openKBDet(_kbCtxId,_kbCtxBoard,_kbCtxOwner);setTimeout(editKBFromDet,50);}

function ctxConvert(){_closeCtx();if(_kbCtxBoard==='leads')openConvertModal(_kbCtxId,_kbCtxOwner);}

function ctxDel(){_closeCtx();deleteKBCard(_kbCtxId,_kbCtxBoard,_kbCtxOwner);}

function ctxActivity(){_closeCtx();_kbDetId=_kbCtxId;_kbDetBoard=_kbCtxBoard;_kbDetOwnerUid=_kbCtxOwner;openQuickActivity();}

function ctxDiscard(){_closeCtx();_kbDetId=_kbCtxId;_kbDetBoard=_kbCtxBoard;_kbDetOwnerUid=_kbCtxOwner;discardKBFromDet();}

// Discard
var _discardId=null,_discardBoard=null,_discardMotivo=null,_discardOwner=null;

function discardKBFromDet(){
  var id=_kbDetId,board=_kbDetBoard;if(!id||!board)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  _discardId=id;_discardBoard=board;_discardMotivo=null;_discardOwner=uid;
  var dn=document.getElementById('discard-nome');if(dn)dn.textContent=c.name;
  var dow=document.getElementById('discard-outro-wrap');if(dow)dow.style.display='none';
  var dot=document.getElementById('discard-outro-txt');if(dot)dot.value='';
  document.querySelectorAll('.discard-opt').forEach(function(b){b.classList.remove('sel');});
  closeM('mo-kb-det');openM('mo-discard');
}

function selDiscardOpt(motivo,btn){_discardMotivo=motivo;document.querySelectorAll('.discard-opt').forEach(function(b){b.classList.remove('sel');});btn.classList.add('sel');var dow=document.getElementById('discard-outro-wrap');if(dow)dow.style.display=motivo==='outro'?'block':'none';}

function confirmDiscard(){
  if(!_discardMotivo){toast('Selecione um motivo');return;}
  var uid=_discardOwner||S.userId;var arr=getKBFor(_discardBoard,uid);var c=arr.find(function(x){return x.id===_discardId;});if(!c)return;
  var mL={noshow:'No-Show',desistencia:'Desistencia',sem_perfil:'Sem Perfil',contato_perdido:'Contato Perdido',outro:'Outro'};
  var outro=_discardMotivo==='outro'?(document.getElementById('discard-outro-txt').value||'').trim():'';
  c.discarded=true;c.discardedAt=new Date().toISOString();c.discardMotivo=_discardMotivo;c.discardMotivoLabel=mL[_discardMotivo]+(outro?' - '+outro:'');
  c.col=_discardBoard==='negocios'?'noshow':'desc';
  saveKBFor(_discardBoard,uid,arr);closeM('mo-discard');renderKBLocal(_discardBoard);
  logFeedEvent('discard',S.userId,c.name,mL[_discardMotivo],_discardBoard);toast('Descartado: '+mL[_discardMotivo]);
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
  document.addEventListener('touchmove',function(e){
    var st=_tzState;if(!st.tc)return;
    var dx=Math.abs(e.touches[0].clientX-st.startX),dy=Math.abs(e.touches[0].clientY-st.startY);
    if(!st.clone&&(dx>8||dy>8)){if(st.dt){clearTimeout(st.dt);st.dt=null;}}
    if(!st.clone)return;
    e.preventDefault();
    st.clone.style.left=(e.touches[0].clientX-st.ox)+'px';st.clone.style.top=(e.touches[0].clientY-st.oy)+'px';
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
          if(_kbCardLocked(st.board,nc)){toast('🔒 Apenas o Gestor pode mover para esta etapa.');}
          else{_kbMoveCard(_kbDragId,st.board,uid2,nc);renderKBLocal(st.board);}
        }
      }
    }
    st.tc=null;_kbDragId=null;_kbDragOwner=null;
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
  st.tc=null;_kbDragId=null;_kbDragOwner=null;
}

function _touchZone(ca,board,colId,restricted){
  if(restricted)return;
  _touchZoneBindGlobal();
  ca.addEventListener('touchstart',function(e){
    var card=e.target.closest('.kb-card');
    if(!card||e.target.closest('.kb-card-menu')||e.target.closest('.kb-convert-btn')||e.target.closest('.kb-act-btn')||e.target.closest('.kb-call-btn')||e.target.closest('.kb-wa-btn')||e.target.closest('.kb-copy-tel-btn')||e.target.closest('.kb-card-del-btn'))return;
    var st=_tzState;
    st.tc=card;st.board=board;
    var r=card.getBoundingClientRect();
    st.ox=e.touches[0].clientX-r.left;st.oy=e.touches[0].clientY-r.top;
    st.startX=e.touches[0].clientX;st.startY=e.touches[0].clientY;
    st.dt=setTimeout(function(){
      if(!st.tc)return;
      st.clone=st.tc.cloneNode(true);
      st.clone.style.cssText='position:fixed;z-index:9999;opacity:.8;pointer-events:none;width:'+r.width+'px;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,.7);';
      st.clone.style.left=(e.touches[0].clientX-st.ox)+'px';st.clone.style.top=(e.touches[0].clientY-st.oy)+'px';
      document.body.appendChild(st.clone);st.tc.style.opacity='.3';
      _kbDragId=card.dataset.id;_kbDragBoard=board;_kbDragOwner=card.dataset.owner||S.userId;
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
  var cols=kbCols(board).filter(function(col){return canAll||!(board==='negocios'&&KB_NEG_RESTRICTED.indexOf(col.id)>=0);});
  if(bco)bco.innerHTML=cols.map(function(col){return '<button class="bulk-col-opt" onclick="applyBulkMove(\''+col.id+'\')">'+eH(col.label)+'</button>';}).join('');
  openM('mo-bulk-move');
}

function applyBulkMove(colId){
  var board0=_bulkSelected.length?_bulkSelected[0].board:null;
  if(board0==='negocios'&&KB_NEG_RESTRICTED.indexOf(colId)>=0&&getMyRole()!=='gestor'){toast('⚠️ Apenas o Gestor pode mover para esta etapa.');return;}
  var affected={};_kbLastOpFailed=false;var blocked=0;
  _bulkSelected.forEach(function(x){
    var uid=x.ownerUid||activeUID(x.board);
    if(x.board==='negocios'&&getMyRole()!=='gestor'){
      var curArr=getKBFor(x.board,uid);var curCard=curArr.find(function(q){return q.id===x.id;});
      if(curCard&&_kbCardLocked(x.board,curCard.col)){blocked++;return;}
    }
    _kbMoveCard(x.id,x.board,uid,colId,true,true);
    affected[x.board]=true;
    if(x.board==='leads'&&colId==='conv')affected.negocios=true;
  });
  Object.keys(affected).forEach(function(b){renderKB(b);if(typeof isMobileView==='function'&&isMobileView()&&typeof renderKBMobile==='function')renderKBMobile(b);});
  closeM('mo-bulk-move');clearBulk();
  if(blocked)toast('Movidos! ('+blocked+' card(s) travado(s) em etapa restrita não foram movidos)',3500);
  else if(!_kbLastOpFailed)toast('Movidos!');
}

function bulkConvert(){
  _kbLastOpFailed=false;
  _bulkSelected.filter(function(x){return x.board==='leads';}).forEach(function(x){convertToNeg(x.id,x.ownerUid,undefined,true,undefined,true);});
  clearBulk();
  if(!_kbLastOpFailed)toast('Convertidos!');
}

function bulkResp(){
  if(!_bulkSelected.length)return;
  var users=getUsers().filter(function(u){return u.id!=='adm'&&u.ativo;});
  var bri=document.getElementById('bulk-resp-info');if(bri)bri.textContent=_bulkSelected.length+' cards:';
  var bro=document.getElementById('bulk-resp-opts');
  if(bro)bro.innerHTML=users.map(function(u){var uidJs=_jsSq(u.id);return '<button class="bulk-col-opt" onclick="applyBulkResp(\''+uidJs+'\')">'+eH(u.nome)+'</button>';}).join('');
  openM('mo-bulk-resp');
}

function applyBulkResp(newUid){
  var toUser=getUser(newUid);if(!toUser)return;
  var affected={};var allOk=true;
  var items=_bulkSelected.slice();
  // Processa um card por vez (não em paralelo): _kbTransferCard agora busca o board do
  // destinatário no Firestore antes de gravar, e várias transferências pro MESMO destino
  // rodando ao mesmo tempo poderiam se basear na mesma leitura antiga e se sobrescreverem
  // (só a última gravação "venceria", perdendo os cards das transferências anteriores).
  function next(i){
    if(i>=items.length){
      Object.keys(affected).forEach(function(b){renderKB(b);if(typeof isMobileView==='function'&&isMobileView()&&typeof renderKBMobile==='function')renderKBMobile(b);});
      closeM('mo-bulk-resp');clearBulk();
      if(allOk)toast('Transferidos para '+toUser.nome.split(' ')[0]);
      // se allOk for false, _kbTransferCard ja mostrou o aviso de armazenamento cheio pro card que falhou
      return;
    }
    var x=items[i];var uid=x.ownerUid||S.userId;
    _kbTransferCard(x.id,x.board,uid,newUid,true,function(res){
      if(!res)allOk=false;
      affected[x.board]=true;
      next(i+1);
    });
  }
  next(0);
}

function bulkDiscard(){
  if(!_bulkSelected.length)return;
  var count=_bulkSelected.length;
  var motiOpts=['noshow','desistencia','sem_perfil','contato_perdido'];
  var motiLabels={noshow:'No-Show',desistencia:'Desistência',sem_perfil:'Sem Perfil',contato_perdido:'Contato Perdido'};
  var radioHtml=motiOpts.map(function(m,i){
    return '<label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;cursor:pointer;font-size:.82rem;'+(i===0?'border:1.5px solid var(--amber);background:rgba(195,154,45,.08)':'border:1.5px solid transparent')+'" id="bdisc-lbl-'+m+'">'
      +'<input type="radio" name="bulk-disc-motivo" value="'+m+'"'+(i===0?' checked':'')+' onchange="document.querySelectorAll(\'[id^=bdisc-lbl-]\').forEach(function(l){l.style.borderColor=\'transparent\';l.style.background=\'\'});this.parentElement.style.borderColor=\'var(--amber)\';this.parentElement.style.background=\'rgba(195,154,45,.08)\'">'
      +motiLabels[m]+'</label>';
  }).join('');
  _confirmModal({
    title:'🗑 Descartar '+count+' card'+(count>1?'s':'')+'?',
    msg:'Escolha o motivo do descarte:<br><div style="display:flex;flex-direction:column;gap:4px;margin-top:10px">'+radioHtml+'</div>',
    okLabel:'Descartar',
    okClass:'bd',
    onOk:function(){
      var sel=document.querySelector('input[name="bulk-disc-motivo"]:checked');
      var motivo=sel?sel.value:'noshow';
      var mLabel=motiLabels[motivo]||motivo;
      var allOk=true;
      _bulkSelected.forEach(function(x){
        var uid=x.ownerUid||S.userId;var arr=getKBFor(x.board,uid);var c=arr.find(function(q){return q.id===x.id;});
        if(c){c.discarded=true;c.discardedAt=new Date().toISOString();c.discardMotivo=motivo;c.discardMotivoLabel=mLabel;c.col=x.board==='negocios'?'noshow':'desc';}
        if(!saveKBFor(x.board,uid,arr))allOk=false;
      });
      var boards=[...new Set(_bulkSelected.map(function(x){return x.board;}))];
      boards.forEach(function(b){renderKBLocal(b);});clearBulk();
      toast(allOk?('Descartados: '+mLabel+' ('+count+')'):'⚠️ Alguns cards podem não ter sido salvos — armazenamento local cheio.');
    }
  });
}

function bulkDelete(){
  if(!_bulkSelected.length)return;
  var count=_bulkSelected.length;
  var msg=document.getElementById('confirm-del-msg');
  if(msg)msg.innerHTML='Excluir <strong>'+count+' card(s)</strong> permanentemente?<br><span style="font-size:.75rem;color:var(--mu)">Esta ação não pode ser desfeita.</span>';
  _confirmDelCb=function(){
    var allOk=true;
    var affected={};
    var groups={};
    _bulkSelected.forEach(function(x){
      var uid=x.ownerUid||S.userId;
      var key=x.board+'__'+uid;
      if(!groups[key])groups[key]={board:x.board,uid:uid,ids:[]};
      groups[key].ids.push(x.id);
    });
    Object.keys(groups).forEach(function(key){
      if(!allOk)return;
      var g=groups[key];
      var arr=getKBFor(g.board,g.uid);
      var nextArr=arr.filter(function(q){return g.ids.indexOf(q.id)<0;});
      var negSnapshot=null,hadLinkedNeg=false;
      if(g.board==='leads'){
        var negArr=getKBFor('negocios',g.uid);
        var nextNegArr=negArr.filter(function(n){return g.ids.indexOf(n.originalLeadId)<0;});
        hadLinkedNeg=nextNegArr.length!==negArr.length;
        if(hadLinkedNeg){
          negSnapshot=JSON.parse(JSON.stringify(negArr));
          if(!saveKBFor('negocios',g.uid,nextNegArr)){allOk=false;return;}
          affected.negocios=true;
        }
      }
      if(!saveKBFor(g.board,g.uid,nextArr)){
        if(hadLinkedNeg&&negSnapshot)saveKBFor('negocios',g.uid,negSnapshot);
        allOk=false;return;
      }
      affected[g.board]=true;
    });
    Object.keys(affected).forEach(function(b){renderKBLocal(b);});clearBulk();
    toast(allOk?('🗑 '+count+' card(s) excluído(s)!'):'⚠️ Alguns cards podem não ter sido excluídos — armazenamento local cheio.',4000);
  };
  openM('mo-confirm-del');
}

// ============================================================
// BATCH IMPORT
// ============================================================
var _importParsed=[];

function openBatchImport(){
  _importParsed=[];
  var it=document.getElementById('import-txt');if(it)it.value='';
  var ic=document.getElementById('import-count');if(ic)ic.innerHTML='';
  var ip=document.getElementById('import-preview');if(ip){ip.style.display='none';ip.innerHTML='';}
  var sel=document.getElementById('import-col');
  if(sel)sel.innerHTML=KB_LEADS_COLS.map(function(c,i){return '<option value="'+c.id+'"'+(i===0?' selected':'')+'>'+eH(c.label)+'</option>';}).join('');
  openM('mo-batch-import');
}

function parseImport(){
  var txt=document.getElementById('import-txt').value||'';_importParsed=[];
  var lines=txt.split(/[\n;]+/).map(function(l){return l.trim();}).filter(Boolean);
  lines.forEach(function(line){
    var phoneMatch=line.match(/\(?\d[\d\s\-\(\)]{7,}\d/);
    var tel=phoneMatch?phoneMatch[0].replace(/\D/g,''):'';
    var name=line.replace(/\(?\d[\d\s\-\(\)]{7,}\d/,'').replace(/[,;\-]/g,' ').trim().replace(/\s{2,}/g,' ').trim();
    if(name.length>1)_importParsed.push({name:name,tel:tel});
  });
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
  var nicho=document.getElementById('import-nicho').value;
  var col=document.getElementById('import-col').value;
  var arr=getKB('leads');var now=new Date().toISOString();
  var dupCount=0;
  _importParsed.forEach(function(p){
    var telNorm=(p.tel||'').replace(/\D/g,'');
    // Checa contra 'arr', que já inclui os leads existentes E os que forem sendo
    // adicionados neste mesmo lote — assim, contatos repetidos dentro do próprio
    // texto colado também são pegos como duplicata (antes só pegava duplicatas
    // que já existiam ANTES da importação começar).
    var isDup=arr.some(function(x){
      var xTel=(x.tel||'').replace(/\D/g,'');
      return (telNorm&&xTel===telNorm)||(x.name&&p.name&&x.name.trim().toLowerCase()===p.name.trim().toLowerCase());
    });
    if(isDup){dupCount++;return;}
    var novoCard={id:'kb_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)+'_'+Math.random().toString(36).slice(2,4),name:p.name,tel:p.tel,nicho:nicho,col:col,obs:'',createdAt:now,userId:S.userId,attachments:[],historico:[]};
    _pushHistorico(novoCard,'Lead importado em lote');
    arr.push(novoCard);
  });
  var okImp=saveKB('leads',arr);closeM('mo-batch-import');renderKBLocal('leads');
  var importedCount=_importParsed.length-dupCount;
  logFeedEvent('create',S.userId,importedCount+' leads','Importacao','leads');
  // Uma única chamada a toast(): duas chamadas seguidas se sobrescreveriam (toast usa um
  // único elemento compartilhado), e o 2º parâmetro é a duração em ms — 'warn' não é um
  // valor válido e fazia esse toast sumir quase instantaneamente.
  var impMsg=okImp?(importedCount+' leads importados!'):'⚠️ Importação pode não ter sido salva — armazenamento local cheio.';
  if(dupCount>0)impMsg+=' ('+dupCount+' duplicata(s) ignorada(s))';
  toast(impMsg,3500);
  _importParsed=[];
}

// ============================================================
// DETECÇÃO DE DUPLICATAS (por telefone, em Leads + Negócios, todos os consultores)
// ============================================================
/* Varre Leads+Negócios de todos os usuários ativos e retorna um array de cada card,
   anotado com {_dupBoard,_dupOwnerUid,_dupOwnerName} para facilitar exibição/exclusão. */
function _collectAllCardsForDup(){
  var users=getUsers().filter(function(u){return u.ativo;});
  var all=[];
  users.forEach(function(u){
    ['leads','negocios'].forEach(function(board){
      getKBFor(board,u.id).forEach(function(c){
        all.push({card:c,board:board,ownerUid:u.id,ownerName:u.nome});
      });
    });
  });
  return all;
}

/* Conta quantos OUTROS cards (em Leads ou Negócios, de qualquer consultor) já têm o mesmo
   telefone normalizado. Usado pelo alerta não-bloqueante em saveKBCard (Parte B). */
function _countDuplicatePhone(telNorm){
  if(!telNorm||telNorm.length<8)return 0;
  return _collectAllCardsForDup().filter(function(x){
    var n=(x.card.tel||'').replace(/\D/g,'');
    return n.length>=8&&n===telNorm;
  }).length;
}

function openDuplicateScanner(){
  // CORREÇÃO (auditoria — controle de acesso grave): faltava aqui QUALQUER checagem de
  // permissão. _collectAllCardsForDup() varre Leads+Negócios de TODOS os consultores
  // ativos, e o próprio scanner oferece um botão de exclusão permanente por item — ou
  // seja, sem esta checagem, um Consultor comum conseguia ver e apagar de vez o board de
  // qualquer outro consultor, só abrindo "🔍 Duplicatas" (nem precisava do modo "Todos" do
  // ADM). Mesmo com o botão agora escondido pra quem não é ADM/Gestor (renderKBLocal), a
  // função em si precisa recusar a chamada — inclusive se disparada direto via onclick
  // salvo/console — porque esconder o botão sozinho não impede a chamada da função.
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode usar o scanner de duplicatas.');return;}
  var all=_collectAllCardsForDup();
  var groups={};
  all.forEach(function(x){
    var n=(x.card.tel||'').replace(/\D/g,'');
    if(n.length<8)return; // ignora telefones vazios/curtos demais pra evitar falso-positivo
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
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid rgba(255,255,255,.06)">'
          +'<div style="font-size:.76rem"><strong>'+eH(x.card.name)+'</strong><br><span style="color:var(--mu);font-size:.68rem">'+eH(x.ownerName)+' · '+_colLabel(x.board,x.card.col)+' · '+(x.board==='leads'?'Lead':'Negócio')+'</span></div>'
          +'<button class="kb-card-del-btn" style="opacity:1;position:static;font-size:.95rem" title="Excluir permanentemente" onclick="_dupDeleteAndRescan(\''+x.card.id+'\',\''+x.board+'\',\''+x.ownerUid+'\')">✕</button>'
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
function openKBAdvFilter(board){
  document.getElementById('adv-filter-board').value=board;
  var f=_kbFilter[board]||{};
  var nm=document.getElementById('adv-f-nome');if(nm)nm.value=_kbQ[board]||'';
  var ni=document.getElementById('adv-f-nicho');if(ni)ni.value=f.nicho||'';
  var vm=document.getElementById('adv-f-valor-min');if(vm)vm.value=f.valorMin||'';
  var vx=document.getElementById('adv-f-valor-max');if(vx)vx.value=f.valorMax||'';
  var di=document.getElementById('adv-f-dias');if(di)di.value=f.dias||'';
  var vw=document.getElementById('adv-f-valor-wrap');if(vw)vw.style.display=board==='negocios'?'':'none';
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
    dias:(document.getElementById('adv-f-dias').value||'')
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
  _kbFilter[board]={nicho:'',valorMin:'',valorMax:'',dias:''};
  var nm=document.getElementById('adv-f-nome');if(nm)nm.value='';
  var ni=document.getElementById('adv-f-nicho');if(ni)ni.value='';
  var vm=document.getElementById('adv-f-valor-min');if(vm)vm.value='';
  var vx=document.getElementById('adv-f-valor-max');if(vx)vx.value='';
  var di=document.getElementById('adv-f-dias');if(di)di.value='';
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

/* Renderiza a lista vertical mobile (estilo Bitrix24) para Leads ou Negócios. Chamada
   por renderKB() quando a tela está no modo mobile, e diretamente pelos chips de filtro. */
function renderKBMobile(board){
  var wrap=document.getElementById(board+'-mobile-list');if(!wrap)return;
  renderStageSummaryBar(board);
  // CORREÇÃO BUG LUPA/ADM-TODOS: agrega todos os consultores quando ADM está no modo "Todos"
  var uid=activeUID(board);
  var list;
  if(hasAdminAccess()&&!_kbViewUid[board]){
    var _mbAllUsers=getUsers().filter(function(u){return u.id!=='adm'&&u.ativo;});
    list=[];
    _mbAllUsers.forEach(function(u){
      getKBFor(board,u.id).forEach(function(c){c._timeOwnerUid=u.id;list.push(c);});
    });
  } else {
    list=getKBFor(board,uid);
  }
  // FIX: Filtros Avançados (nicho/valor/dias) não eram aplicados na visão mobile —
  // só funcionavam no kanban desktop via _buildKB(). Mesma lógica replicada aqui.
  var f=_kbFilter[board]||{};
  list=list.filter(function(c){
    if(f.nicho&&(c.nicho||'')!==f.nicho)return false;
    if(f.valorMin&&board==='negocios'&&(parseFloat(c.valor)||0)<parseFloat(f.valorMin))return false;
    if(f.valorMax&&board==='negocios'&&(parseFloat(c.valor)||0)>parseFloat(f.valorMax))return false;
    if(f.dias&&c.createdAt){var d=Math.floor((Date.now()-new Date(c.createdAt).getTime())/86400000);if(d<parseInt(f.dias,10))return false;}
    if(_kbOnlyLate[board]&&!_isOverdue(c))return false;
    return true;
  });
  var stage=_mbStageFilter[board];
  if(stage)list=list.filter(function(c){return c.col===stage;});
  var q=(_kbQ&&_kbQ[board])||'';
  if(q)list=list.filter(function(c){return c.name.toLowerCase().indexOf(q)>=0||(c.tel||'').indexOf(q)>=0;});
  if(!list.length){wrap.innerHTML='<div class="act-empty">Nenhum registro nesta etapa.</div>';return;}
  var cols=kbCols(board);
  var u=getUser(uid);
  wrap.innerHTML=list.map(function(c){
    var effUid=c._timeOwnerUid||uid;
    var colLbl=_colLabel(board,c.col);
    var ago=_timeAgoShort(c.createdAt);
    var resp=getUser(c._timeOwnerUid||uid);
    var respAvBg=AVB[(resp?resp.cor:0)%AVB.length];
    var stageOpts=cols.map(function(col){return '<option value="'+col.id+'"'+(col.id===c.col?' selected':'')+'>'+eH(col.label)+'</option>';}).join('');
    var telJs=_jsSq(c.tel||''),nameJs=_jsSq(c.name||'');
    return '<div class="mb-card" data-id="'+c.id+'">'
      +'<div class="mb-card-main">'
      +'<div class="mb-card-header"><div class="mb-card-num">'+(board==='negocios'?'Neg.':'Lead')+' #'+c.id.slice(-6).toUpperCase()+'</div>'
      +'<button class="mb-card-menu-btn" aria-label="Opções do card" onclick="_openCtx(\''+c.id+'\',\''+board+'\',\''+effUid+'\',event)">⋯</button></div>'
      +'<div class="mb-card-meta">há '+ago+(c._dup?' · repetido':'')+'</div>'
      +'<div class="mb-card-stage-row"><button class="mb-card-chevron" style="background:'+stageColor(c.col)+'" onclick="openStagePicker(\''+board+'\',\''+c.id+'\',\''+effUid+'\')">'+eH(colLbl)+'</button></div>'
      +'<div class="mb-card-sub"><button class="mb-card-sub-btn'+(c.sub?' filled':'')+'" onclick="openSubEtapaPicker(\''+board+'\',\''+c.id+'\',\''+effUid+'\')">'+(c.sub?eH(c.sub):(board==='negocios'?'Sub-etapa':'2° tentativa'))+'</button>'
      +'<div class="mb-card-sub-bar"><div class="mb-card-sub-bar-fill" style="width:'+_subPct(c.sub)+'%"></div></div></div>'
      +(board==='negocios'?'<div class="mb-card-section">Valor</div><div class="mb-card-value">'+(c.valor?fmtBRL(c.valor):'—')+'</div>':'')
      +'<div class="mb-card-section">Cliente</div><div class="mb-card-client" onclick="openKBDet(\''+c.id+'\',\''+board+'\',\''+effUid+'\')" tabindex="0" role="button">'+eH(c.name)+'</div>'+(c.tel?'<span class="mb-card-contact-badge">'+eH(c.tel)+'</span>':'')
      +'<div class="mb-card-section">Responsável</div>'
      +'<div class="mb-card-resp"><div class="mb-card-resp-av" style="background:'+respAvBg+'">'+(resp?resp.nome.charAt(0).toUpperCase():'?')+'</div>'
      +'<div><div class="mb-card-resp-name">'+(resp?eH(resp.nome.split(' ')[0]):'-')+'</div><div class="mb-card-resp-cargo">'+(resp?eH(resp.cargo||''):'')+'</div></div></div>'
      +'</div>'
      +'<div class="mb-card-actions">'
      +'<button class="mb-action-btn call" aria-label="Ligar" onclick="callClient(\''+telJs+'\',\''+nameJs+'\')" title="Ligar">📞</button>'
      +'<button class="mb-action-btn whatsapp" aria-label="WhatsApp" onclick="openWhatsApp(\''+telJs+'\',\''+nameJs+'\')" title="WhatsApp">💬</button>'
      +'<button class="mb-action-btn timeline" aria-label="Abrir detalhe" onclick="openKBDet(\''+c.id+'\',\''+board+'\',\''+effUid+'\')" title="Linha do tempo">📊</button>'
      +'</div></div>';
  }).join('');
}

/* Monta a mesma base de lista usada pelo kanban mobile (mesmo consultor/ADM-todos,
   mesmos filtros avançados e busca), mas SEM aplicar o filtro de etapa — usada tanto
   pela barra-resumo ("Etapa atual") quanto pelo modal seletor, pra poder contar/somar
   quantos registros existem em cada etapa. */
function _kbBaseListForSummary(board){
  var uid=activeUID(board);
  var list;
  if(hasAdminAccess()&&!_kbViewUid[board]){
    var _u=getUsers().filter(function(u){return u.id!=='adm'&&u.ativo;});
    list=[];
    _u.forEach(function(u){getKBFor(board,u.id).forEach(function(c){list.push(c);});});
  } else {
    list=getKBFor(board,uid);
  }
  var f=_kbFilter[board]||{};
  list=list.filter(function(c){
    if(f.nicho&&(c.nicho||'')!==f.nicho)return false;
    if(f.valorMin&&board==='negocios'&&(parseFloat(c.valor)||0)<parseFloat(f.valorMin))return false;
    if(f.valorMax&&board==='negocios'&&(parseFloat(c.valor)||0)>parseFloat(f.valorMax))return false;
    if(f.dias&&c.createdAt){var d=Math.floor((Date.now()-new Date(c.createdAt).getTime())/86400000);if(d<parseInt(f.dias,10))return false;}
    if(_kbOnlyLate[board]&&!_isOverdue(c))return false;
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
  var _curLocked=cardId&&_kbCardLocked(board,currentCol);
  html+=cols.map(function(c,i){
    var sel=cardId?(currentCol===c.id):(_mbStageFilter[board]===c.id);
    var meta='';
    if(!cardId){
      var list=_kbBaseListForSummary(board);
      var subList=list.filter(function(x){return x.col===c.id;});
      var sum=subList.reduce(function(s,x){return s+(parseFloat(x.valor)||0);},0);
      meta='<span class="sp-row-meta">'+subList.length+' &middot; '+fmtBRL(sum)+'</span>';
    }
    var rowLocked=cardId&&(_curLocked||_kbCardLocked(board,c.id));
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
    if(_c0&&(_kbCardLocked(board,_c0.col)||_kbCardLocked(board,colId))){toast('🔒 Apenas o Gestor pode mover a partir/para esta etapa.');closeM('mo-stage-picker');return;}
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
