/* =====================================================================
 * relatorios.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

function renderAdmPage(){
  renderUsers();
  // CORREÇÃO (usuário criado em outro aparelho não aparece na aba ADM): antes esta função só
  // chamava renderUsers(), que lê exclusivamente o cache local (localStorage). Se um usuário
  // fosse criado em outro dispositivo (ex.: celular) enquanto este aparelho já estava com uma
  // sessão aberta, a lista aqui nunca era atualizada — só mudava com um novo login. Agora, toda
  // vez que a aba ADM é aberta, buscamos a lista mais recente direto do Firestore em segundo
  // plano e re-renderizamos assim que chegar (a tela já abre rápido com o cache local acima).
  loadUsersDB(function(){try{renderUsers();}catch(e){console.warn('[rel] renderUsers failed',e);}});
  document.querySelectorAll('.adm-tab').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('.adm-pane').forEach(function(p){p.classList.remove('on');});
  var ft=document.querySelector('.adm-tab'),fp=document.getElementById('adm-pane-usuarios');
  if(ft)ft.classList.add('on');if(fp)fp.classList.add('on');
}

function admGoTab(tab,btn){
  document.querySelectorAll('.adm-tab').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('.adm-pane').forEach(function(p){p.classList.remove('on');});
  if(btn)btn.classList.add('on');var p=document.getElementById('adm-pane-'+tab);if(p)p.classList.add('on');
  if(tab==='ativ')renderAdmAtividades();
  if(tab==='automacoes')loadAutomationRulesRemote(function(){renderAutoRules();});
  if(tab==='feed')renderAdmFeed();
  if(tab==='ligacoes')renderAdmLigacoes();
  if(tab==='docs')renderAdmDocs();
}

/* FIX (2026-08-03): sub-abas da página Time (supervisor de
   departamento) — mesmo padrão de admGoTab, mas chamando as versões
   Time-* (escopadas por getDepartmentVisibleUsers) e alternando entre
   o painel "Equipe" (kanban — já existia) e as 4 abas novas. */
function timeGoTab(tab,btn){
  document.querySelectorAll('.time-tab').forEach(function(b){b.classList.remove('on');});
  document.querySelectorAll('.time-pane').forEach(function(p){p.classList.remove('on');});
  if(btn)btn.classList.add('on');
  var p=document.getElementById('time-pane-'+tab);if(p)p.classList.add('on');
  // A Equipe é a aba padrão e também precisa disparar sua carga, não só alternar CSS.
  if(tab==='equipe')renderTimePage();
  if(tab==='ativ')renderTimeAtividades();
  if(tab==='feed')renderTimeFeed();
  if(tab==='ligacoes')renderTimeLigacoes();
}

// Usa a mesma autorização que liberou a página Time na navegação.
// Antes, Time podia estar visível por escopo de departamento, mas seus renderizadores
// abortavam por exigir apenas hasSupervisorAccess(), deixando a primeira aba vazia.
function _timePageAllowed(){
  try{if(typeof _lfTimeTabAllowed==='function')return _lfTimeTabAllowed();}catch(_e){}
  return hasSupervisorAccess();
}

/* REMOVIDO (2026-08-18): abas 'Métricas' e 'Clientes' foram removidas
   permanentemente dos fluxos ADM raiz e Time (supervisor de departamento).
   Funções órfãs que atendiam essas abas — renderAdmMetrics, renderTimeMetrics,
   renderAdmTable, renderTimeTable e seus helpers _renderMetricsInto /
   _renderTableInto — foram apagadas junto. Reconciliação de números que o
   dashboard fazia com 'Math.max entre cli/steps[6] e col==="fechado"' já era
   auto-contida em dashboard.js (não dependia dessas funções). */

function admViewBoard(board,uid){_kbViewUid[board]=uid;_kbNavFromAdm=true;goPage(board);}

// Feed
var __relatoriosRuntime=(((window.LiderCRM||{}).modules||{}).relatorios||{}).runtime||{};
var FEED_KEY=__relatoriosRuntime.FEED_KEY||function(){};
var getFeed=__relatoriosRuntime.getFeed||function(){};
var saveFeed=__relatoriosRuntime.saveFeed||function(){};
var _canalToFeedTag=__relatoriosRuntime._canalToFeedTag||function(){};
var CANAL_FEED_LBL=__relatoriosRuntime.CANAL_FEED_LBL||function(){};
var logFeedEvent=__relatoriosRuntime.logFeedEvent||function(){};
var _kbDeleteReasonLabel=__relatoriosRuntime._kbDeleteReasonLabel||function(){};
var _admAtivClassify=__relatoriosRuntime._admAtivClassify||function(){};


/* Filtro de usuário (nome/departamento) na aba Ligações — ADM e Time. */
var _admLigUserQuery='';
var _timeLigUserQuery='';
/* [FIX 20260820] null = hoje. Ver ligacoes-store.js: cada dia fica numa
   chave própria (lf13_lig_<uid>_<data>) e o painel sempre lia só a de
   hoje — não existia jeito de ver dias anteriores. Isso guarda a data
   escolhida no seletor (ver _renderLigDateNav) sem mexer em como os
   dados são gravados. */
var _admLigSelectedDate=null;
var _timeLigSelectedDate=null;

function _ligNorm(s){return (s||'').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}

function _ligUserMatches(u,q){
  if(!q)return true;
  q=_ligNorm(q);
  if(!q)return true;
  var nome=_ligNorm(u.nome||'');
  var dep=_ligNorm(u.departamento||u.depto||u.department||'');
  return nome.indexOf(q)!==-1||dep.indexOf(q)!==-1;
}

function admLigSetUserFilter(v){_admLigUserQuery=v||'';renderAdmLigacoes();}
function admLigClearUserFilter(){_admLigUserQuery='';var el=document.getElementById('adm-lig-user-search');if(el)el.value='';renderAdmLigacoes();}
function timeLigSetUserFilter(v){_timeLigUserQuery=v||'';renderTimeLigacoes();}
function timeLigClearUserFilter(){_timeLigUserQuery='';var el=document.getElementById('time-lig-user-search');if(el)el.value='';renderTimeLigacoes();}

/* [FIX 20260820] Navegação por data no painel de Ligações — ver
   nota em _admLigSelectedDate acima. scope é 'adm' ou 'time'. */
function _ligDateShift(scope,deltaDays){
  var varName=scope==='time'?'_timeLigSelectedDate':'_admLigSelectedDate';
  var cur=(scope==='time'?_timeLigSelectedDate:_admLigSelectedDate)||today();
  var d=new Date(cur+'T12:00:00'); // meio-dia evita virar de dia por fuso na subtração
  d.setDate(d.getDate()+deltaDays);
  var y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');
  var next=y+'-'+m+'-'+dd;
  if(next>=today())next=null; // nunca deixa navegar pro futuro; hoje = null (usa o caminho ao vivo)
  if(scope==='time'){_timeLigSelectedDate=next;renderTimeLigacoes();}
  else{_admLigSelectedDate=next;renderAdmLigacoes();}
}
function _ligDateGoToday(scope){
  if(scope==='time'){_timeLigSelectedDate=null;renderTimeLigacoes();}
  else{_admLigSelectedDate=null;renderAdmLigacoes();}
}
function _ligDatePick(scope,value){
  if(!value)return;
  var isToday=(value>=today());
  if(scope==='time'){_timeLigSelectedDate=isToday?null:value;renderTimeLigacoes();}
  else{_admLigSelectedDate=isToday?null:value;renderAdmLigacoes();}
}
function _renderLigDateNav(scope,elId){
  var el=document.getElementById(elId);if(!el)return;
  var sel=(scope==='time'?_timeLigSelectedDate:_admLigSelectedDate)||today();
  var isToday=(sel===today());
  var dLbl=new Date(sel+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'});
  el.innerHTML=
    '<button type="button" class="bc" style="width:auto;padding:5px 9px;font-size:.7rem" onclick="_ligDateShift(\''+scope+'\',-1)" title="Dia anterior">&#8592;</button>'
    +'<input type="date" value="'+eH(sel)+'" max="'+eH(today())+'" style="padding:5px 8px;border-radius:7px;background:var(--bg3);border:1.5px solid var(--b1);color:var(--tx);font-family:Outfit,sans-serif;font-size:.72rem" onchange="_ligDatePick(\''+scope+'\',this.value)">'
    +'<button type="button" class="bc" style="width:auto;padding:5px 9px;font-size:.7rem" onclick="_ligDateShift(\''+scope+'\',1)" title="Próximo dia"'+(isToday?' disabled':'')+'>&#8594;</button>'
    +(isToday?'':'<button type="button" class="bc" style="width:auto;padding:5px 10px;font-size:.7rem;color:var(--al);border-color:var(--amber)" onclick="_ligDateGoToday(\''+scope+'\')">Hoje</button>')
    +'<span style="font-size:.68rem;color:var(--mu);margin-left:2px">'+(isToday?'Hoje':eH(dLbl))+'</span>';
}

function renderAdmLigacoes(){
  var users=getUsers().filter(function(u){return u.ativo!==false;});
  users=users.filter(function(u){return _ligUserMatches(u,_admLigUserQuery);});
  _renderLigDateNav('adm','adm-lig-datenav');
  _renderLigacoesInto(users, {list:'adm-lig-list', summary:'adm-lig-summary', rowPrefix:'adm-lig-row-', gridPrefix:'adm-lig-grid-', cntPrefix:'adm-lig-cnt-'}, _admLigSelectedDate);
}

function renderTimeLigacoes(){
  var users=getDepartmentVisibleUsers(S&&S.userId);
  users=(users||[]).filter(function(u){return _ligUserMatches(u,_timeLigUserQuery);});
  _renderLigDateNav('time','time-lig-datenav');
  _renderLigacoesInto(users, {list:'time-lig-list', summary:'time-lig-summary', rowPrefix:'time-lig-row-', gridPrefix:'time-lig-grid-', cntPrefix:'time-lig-cnt-'}, _timeLigSelectedDate);
}

function _renderLigacoesInto(users, ids, dateStr){
  var el=document.getElementById(ids.list);if(!el)return;
  var isToday=!dateStr||dateStr===today();
  var targetDate=dateStr||today();
  // FIX (2026-08-20): o proprio ADM nao entra nas metricas de ligacao.
  // Filtra qualquer usuario com acesso de ADM (hasAdminAccess cobre
  // role==='adm', admExtra, cargo de nivel admin e o uid fixo 'adm'),
  // tanto na aba ADM quanto na aba Time — somatoria, media/hora, meta
  // diaria e as linhas por consultor passam a considerar so a equipe.
  users=(users||[]).filter(function(u){
    if(!u)return false;
    try{if(typeof hasAdminAccess==='function'&&hasAdminAccess(u.id))return false;}catch(_e){}
    return true;
  });
  var sumEl=document.getElementById(ids.summary);
  if(!users.length){el.innerHTML='<div class="act-empty">Nenhum consultor.</div>';if(sumEl)sumEl.innerHTML='';return;}
  // Calcula somatória total de ligações — do dia selecionado (hoje, por
  // padrão, ou um dia anterior escolhido no seletor de data).
  var _ligTotal=0;
  users.forEach(function(u){_ligTotal+=(isToday?getLigToday(u.id):getLigForDate(u.id,targetDate)).length;});
  var resumoHTML;
  if(isToday){
    // "Média/Hora" e "Meta Diária" só fazem sentido pra HOJE (ritmo do dia
    // em andamento) — pra um dia já fechado no passado eles não têm
    // significado (o dia já acabou, não tem "andamento" pra medir).
    var _horaAtual=new Date().getHours();
    var _horaInicio=8; // expediente começa às 8h
    var _horasTrab=Math.max(1,_horaAtual-_horaInicio);
    var _media=(_ligTotal/_horasTrab).toFixed(1);
    // META-CORRIGIDA (2026-08-18): 80 ligações/dia por consultor
    // (10 ligações por hora × 8h de expediente). Antes: users.length*10.
    var _metaDiaria=users.length*80; // meta: 80 ligações por consultor/dia
    var _progPct=Math.min(100,Math.round(_ligTotal/_metaDiaria*100));
    resumoHTML='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">'
      +'<div style="background:var(--card);border:1px solid var(--b1);border-radius:10px;padding:10px;text-align:center">'
      +'<div style="font-family:\'Cormorant Garamond\',serif;font-weight:700;font-size:1.6rem;color:var(--al)">'+_ligTotal+'</div>'
      +'<div style="font-size:.6rem;color:var(--mu);margin-top:2px">Somatória Hoje</div></div>'
      +'<div style="background:var(--card);border:1px solid var(--b1);border-radius:10px;padding:10px;text-align:center">'
      +'<div style="font-family:\'Cormorant Garamond\',serif;font-weight:700;font-size:1.6rem;color:var(--bl)">'+_media+'</div>'
      +'<div style="font-size:.6rem;color:var(--mu);margin-top:2px">Média / Hora</div></div>'
      +'<div style="background:var(--card);border:1px solid var(--b1);border-radius:10px;padding:10px;text-align:center">'
      +'<div style="font-family:\'Cormorant Garamond\',serif;font-weight:700;font-size:1.6rem;color:var(--ok)">'+_progPct+'%</div>'
      +'<div style="font-size:.6rem;color:var(--mu);margin-top:2px">Meta Diária</div></div>'
      +'</div>'
      +'<div style="background:var(--bg3);border-radius:6px;height:7px;overflow:hidden;margin-bottom:10px">'
      +'<div style="height:100%;width:'+_progPct+'%;background:linear-gradient(90deg,var(--bd),var(--bl));border-radius:6px;transition:width .6s"></div>'
      +'</div>';
  }else{
    var _mediaPorConsultor=users.length?(_ligTotal/users.length).toFixed(1):'0';
    resumoHTML='<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px">'
      +'<div style="background:var(--card);border:1px solid var(--b1);border-radius:10px;padding:10px;text-align:center">'
      +'<div style="font-family:\'Cormorant Garamond\',serif;font-weight:700;font-size:1.6rem;color:var(--al)">'+_ligTotal+'</div>'
      +'<div style="font-size:.6rem;color:var(--mu);margin-top:2px">Somatória do dia</div></div>'
      +'<div style="background:var(--card);border:1px solid var(--b1);border-radius:10px;padding:10px;text-align:center">'
      +'<div style="font-family:\'Cormorant Garamond\',serif;font-weight:700;font-size:1.6rem;color:var(--bl)">'+_mediaPorConsultor+'</div>'
      +'<div style="font-size:.6rem;color:var(--mu);margin-top:2px">Média / Consultor</div></div>'
      +'</div>';
  }
  if(sumEl)sumEl.innerHTML=resumoHTML;
  el.innerHTML=users.map(function(u){var uIdAttr=eH(u.id);return '<div class="adm-lig-row" id="'+ids.rowPrefix+uIdAttr+'" style="margin-bottom:10px;padding:10px;border:1px solid var(--b1);border-radius:10px"><div style="font-size:.78rem;font-weight:600;margin-bottom:6px">'+eH(u.nome)+' <span style="color:var(--mu);font-weight:400" id="'+ids.cntPrefix+uIdAttr+'"></span></div><div class="lig-grid" id="'+ids.gridPrefix+uIdAttr+'" style="grid-template-columns:repeat(10,1fr);max-width:320px"></div><div style="font-size:.64rem;color:var(--mu);margin-top:6px" id="'+ids.gridPrefix+uIdAttr+'-meta"></div></div>';}).join('');
  users.forEach(function(u){
    var root=window.LiderCRM;
    var wc=root&&root.api&&root.api.workerClient;
    if(root&&root.config&&root.config.useWorkerApi&&wc&&typeof wc.ligacoesList==='function'){
      wc.ligacoesList(u.id,targetDate).then(function(doc){
        _drawAdmLigRow(u,(doc&&doc.list)||(isToday?getLigToday(u.id):getLigForDate(u.id,targetDate)),ids);
      }).catch(function(){_drawAdmLigRow(u,isToday?getLigToday(u.id):getLigForDate(u.id,targetDate),ids);});
    }else if(DB_MODE==='firebase'&&db){
      db.collection('ligacoes').doc(u.id+'_'+targetDate).get().then(function(d){
        var list=(d.exists&&d.data().list)?d.data().list:[];
        _drawAdmLigRow(u,list,ids);
      }).catch(function(){_drawAdmLigRow(u,isToday?getLigToday(u.id):getLigForDate(u.id,targetDate),ids);});
    }else{_drawAdmLigRow(u,isToday?getLigToday(u.id):getLigForDate(u.id,targetDate),ids);}
  });
}

function _drawAdmLigRow(u,list,ids){
  ids=ids||{gridPrefix:'adm-lig-grid-',cntPrefix:'adm-lig-cnt-'};
  var g=document.getElementById(ids.gridPrefix+u.id);if(!g)return;
  var marked={};list.forEach(function(r){marked[r.n]=r.hora;});
  var html='';
  for(var i=1;i<=10;i++){
    var hora=marked[i]?new Date(marked[i]).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
    html+='<div class="lig-cell'+(marked[i]?' marked':'')+'" title="'+(hora?'Ligacao '+i+' as '+hora:'')+'" style="cursor:default;font-size:.6rem">'+i+'</div>';
  }
  g.innerHTML=html;
  // META-CORRIGIDA (2026-08-18): rodada do bingo = 10 ligações (1 hora);
  // meta diária individual = 80. O contador mostra a rodada (list.length/10)
  // e o acumulado do dia contra a meta de 80.
  var cnt=document.getElementById(ids.cntPrefix+u.id);
  if(cnt){
    var _tot=(typeof getLigTotal==='function')?getLigTotal(u.id,today()):list.length;
    cnt.textContent='(rodada '+list.length+'/10 · '+_tot+'/80 ligacoes hoje)';
  }
  // Horários por extenso embaixo do grid (2026-08-17, pedido explícito do
  // ADM) — antes só dava pra ver passando o mouse em cima de cada célula
  // (title=""), fácil de passar batido. Junto: rodadas/total acumulado
  // do dia (mesmo dado que já vai no feed quando bate o bingo).
  var metaEl=document.getElementById(ids.gridPrefix+u.id+'-meta');
  if(metaEl){
    var horas=list.filter(function(r){return r&&r.hora;}).sort(function(a,b){return a.n-b.n;});
    var metaTxt='';
    if(horas.length){
      metaTxt=horas.map(function(r){return r.n+'ª: '+new Date(r.hora).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}).join(' · ');
    }
    var rounds=getLigRounds(u.id,today());
    var total=getLigTotal(u.id,today());
    if(rounds>0)metaTxt+=(metaTxt?' — ':'')+'🎯 '+rounds+' bingo'+(rounds!==1?'s':'')+' hoje ('+total+' ligações no total)';
    metaEl.textContent=metaTxt;
  }
}

// Cache do último feed carregado (usado pela busca/filtro sem precisar rebuscar a cada tecla)
var _admFeedCache=[];

var _admFeedCanal=null;
var _admFeedUserId=null;
// FIX 2026-08-19: filtros novos do painel de Movimentações ADM.
// _admFeedQuery: busca por texto (nome, item, detalhe, tipo de movimentação).
// _admFeedFrom/_admFeedTo: intervalo de datas (yyyy-mm-dd) opcional.
// _admFeedPage: paginação incremental — o feed inteiro pode ter milhares de
// eventos, então renderizamos em blocos de _admFeedPageSize e o botão
// "Carregar mais" avança o corte. Sem limite duro no total exibido.
var _admFeedQuery='';
var _admFeedFrom='';
var _admFeedTo='';
var _admFeedPage=1;
var _admFeedPageSize=100;
/* Contexto ativo dos ids do Feed — só uma página (ADM ou Time) fica
   visível por vez, então trocar esses valores ao entrar em cada uma
   é seguro (mesmo padrão de _ativRowPrefix/_ativBodyPrefix acima).
   `search`/`canalWrap` removidos do HTML (2026-08-17) — busca e filtro
   de canal não fazem mais sentido aqui; ficam como chaves mortas, o
   código que as lê já tolera elemento inexistente (document.getElementById
   retorna null, tratado com segurança nos pontos de uso). */
var _feedIds={list:'adm-feed-list', userSel:'adm-feed-user-filter', userWrap:'adm-feed-user-filter-wrap', search:'adm-feed-search', canalWrap:'adm-feed-canal-filters'};
/* Quando não-nulo, restringe o feed a essas ids de usuário (aba Time,
   escopado por getDepartmentVisibleUsers). null = sem restrição (ADM). */
var _feedScopedUserIds=null;

/* Filtro "Todos os usuários" com rolagem própria (2026-08-17) — antes era
   um <select> nativo; trocado pelo mesmo componente "balão + menu rolável"
   já usado nas barras "Ver:" do Kanban/Time (_lfToggleConsUsersMenu/
   _lfCloseConsUsersMenu, definidos em kanban.js), pra nunca estourar a
   tela por maior que seja a lista de usuários. */
function _admFeedRenderUserOptions(){
  var wrap=document.getElementById(_feedIds.userWrap);
  if(!wrap)return;
  var cur=_admFeedUserId||'';
  var users=(getUsers()||[]).filter(function(u){
    if(!u||u.ativo===false)return false;
    return !_feedScopedUserIds || _feedScopedUserIds[u.id];
  }).slice().sort(function(a,b){
    return String((a&&a.nome)||'').localeCompare(String((b&&b.nome)||''),'pt-BR');
  });
  var curUser=cur?users.find(function(u){return u.id===cur;}):null;
  var allLabel=_feedScopedUserIds?'Todos do departamento':'Todos os usuários';
  var label=cur?(curUser?curUser.nome.split(' ')[0]:'Usuário'):allLabel;
  var barKey=_feedIds.userSel;
  var html='<button type="button" class="kb-cons-chip kb-cons-users-btn'+(cur?' on':'')+'" onclick="_lfToggleConsUsersMenu(\''+barKey+'\',event)">'+eH(label)+' <span class="kb-cons-caret">▾</span></button>';
  html+='<div class="kb-cons-users-menu" id="cons-menu-'+barKey+'">';
  html+='<button type="button" class="kb-cons-menu-item'+(!cur?' on':'')+'" onclick="admFeedFilterUser(null);_lfCloseConsUsersMenu(\''+barKey+'\');">'+eH(allLabel)+'</button>';
  if(users.length){
    html+='<div class="kb-cons-menu-sep"></div><div class="kb-cons-menu-scroll">';
    html+=users.map(function(u){
      var on=(cur===u.id);
      return '<button type="button" class="kb-cons-menu-item'+(on?' on':'')+'" onclick="admFeedFilterUser(\''+_jsSq(u.id)+'\');_lfCloseConsUsersMenu(\''+barKey+'\');">'+eH(u.nome||u.id)+'</button>';
    }).join('');
    html+='</div>';
  }
  html+='</div>';
  wrap.innerHTML=html;
}

function admFeedFilterUser(uid){
  _admFeedUserId=uid||null;
  _admFeedRenderUserOptions();
  _admFeedRenderList();
}

function renderAdmFeed(){
  _feedIds={list:'adm-feed-list', userSel:'adm-feed-user-filter', userWrap:'adm-feed-user-filter-wrap', search:'adm-feed-search', canalWrap:'adm-feed-canal-filters', from:'adm-feed-from', to:'adm-feed-to', more:'adm-feed-more', count:'adm-feed-count'};
  _feedScopedUserIds=null;
  _admFeedPage=1;
  _renderFeedCommon();
}

// FIX 2026-08-19: handlers do novo bloco de filtros (texto + data).
// Debounce curto na busca por texto pra não re-renderizar a cada tecla
// quando o feed inteiro tem milhares de eventos.
var _admFeedSearchTimer=null;
function admFeedSetSearch(v){
  if(_admFeedSearchTimer)clearTimeout(_admFeedSearchTimer);
  _admFeedSearchTimer=setTimeout(function(){
    _admFeedQuery=String(v||'').toLowerCase().trim();
    _admFeedPage=1;
    _admFeedRenderList();
  },180);
}
function admFeedSetFrom(v){_admFeedFrom=String(v||'').trim();_admFeedPage=1;_admFeedRenderList();}
function admFeedSetTo(v){_admFeedTo=String(v||'').trim();_admFeedPage=1;_admFeedRenderList();}
function admFeedClearFilters(){
  _admFeedQuery='';_admFeedFrom='';_admFeedTo='';_admFeedUserId=null;_admFeedCanal=null;_admFeedPage=1;
  var qEl=document.getElementById(_feedIds.search);if(qEl)qEl.value='';
  var fEl=document.getElementById(_feedIds.from);if(fEl)fEl.value='';
  var tEl=document.getElementById(_feedIds.to);if(tEl)tEl.value='';
  // [FIX 20260820] reseta visualmente os botões de canal (Chamada/WhatsApp/
  // Ambos) pro estado "Todos os canais" — sem isso, o botão de canal
  // ficava destacado mesmo depois do filtro ter sido limpo por dentro.
  var cWrap=document.getElementById(_feedIds.canalWrap);
  if(cWrap){
    var btns=cWrap.querySelectorAll('.canal-filter');
    for(var i=0;i<btns.length;i++)btns[i].classList.remove('on');
    if(btns[0])btns[0].classList.add('on'); // "Todos os canais" é sempre o 1º botão
  }
  _admFeedRenderUserOptions();
  _admFeedRenderList();
}
function admFeedMore(){_admFeedPage++;_admFeedRenderList();}

/* FIX (2026-08-03): aba Time (supervisor de departamento) — mesmo
   feed, mas restrito a quem getDepartmentVisibleUsers retorna (senão
   um supervisor veria movimentações de gente de outros departamentos,
   já que o feed em si é global). */
function renderTimeFeed(){
  var users=getDepartmentVisibleUsers(S&&S.userId);
  var ids={};users.forEach(function(u){ids[u.id]=true;});
  _feedIds={list:'time-feed-list', userSel:'time-feed-user-filter', userWrap:'time-feed-user-filter-wrap', search:'time-feed-search', canalWrap:'time-feed-canal-filters', from:'time-feed-from', to:'time-feed-to', more:'time-feed-more', count:'time-feed-count'};
  _feedScopedUserIds=ids;
  _admFeedPage=1;
  _renderFeedCommon();
}

function _renderFeedCommon(){
  var el=document.getElementById(_feedIds.list);if(!el)return;
  function _draw(feed){
    _admFeedCache=feed;
    _admFeedRenderUserOptions();
    _admFeedRenderList();
  }
  _admFeedRenderUserOptions();
  var root=window.LiderCRM;
  var wc=root&&root.api&&root.api.workerClient;
  // FIX 2026-08-19: pede o histórico inteiro (teto ampliado no worker e no
  // cliente HTTP). Sem mais slice(0,200) — o ADM enxerga todo o tempo do CRM.
  var FULL_LIMIT=(typeof FEED_CACHE_HARD_CAP==='number'?FEED_CACHE_HARD_CAP:20000);
  if(root&&root.config&&root.config.useWorkerApi&&wc&&typeof wc.feedList==='function'){
    // Fase 3.4: GET /api/v1/feed já devolve os eventos (um doc por evento) ordenados
    // por "ts" desc — reordena de novo aqui só por segurança/consistência com o ramo
    // de baixo, e cacheia local pra leituras instantâneas (getFeed()).
    wc.feedList({ limit: FULL_LIMIT }).then(function(list){
      var feed=(list||[]).slice().sort(function(a,b){var ta=new Date(a.ts).getTime()||0,tb=new Date(b.ts).getTime()||0;return tb-ta;});
      ss(FEED_KEY,feed);
      _draw(feed);
    }).catch(function(){_draw(getFeed());});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('feed').get().then(function(d){
      var feed=d.exists&&d.data().list?d.data().list:getFeed();
      // logFeedEvent() grava com arrayUnion (append atômico), então o array vem em ordem
      // de inserção (mais antigo primeiro) — reordena por "ts" antes de exibir/cachear.
      feed=feed.slice().sort(function(a,b){var ta=new Date(a.ts).getTime()||0,tb=new Date(b.ts).getTime()||0;return tb-ta;});
      // FIX 2026-08-19: não trunca mais em 200 — usa saveFeed que agora aplica
      // apenas o teto de segurança do cache local (FEED_CACHE_HARD_CAP).
      saveFeed(feed);
      _draw(feed);
    }).catch(function(){_draw(getFeed());});
  }else{_draw(getFeed());}
}

// Filtro por canal (lupa) do feed de atividades da equipe — usado principalmente para
// achar rapidamente quando alguém editou/excluiu uma objeção do Dicionário, mas a busca
// por texto funciona para qualquer tipo de evento do feed.
function admFeedFilterCanal(canal,btn){
  _admFeedCanal=canal;
  var wrap=document.getElementById(_feedIds.canalWrap);
  if(wrap)wrap.querySelectorAll('.canal-filter').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  _admFeedRenderList();
}

// FIX 2026-08-19: dicionário de rótulos por tipo de evento — extraído do
// corpo de _admFeedRenderList porque agora também é consultado pelo filtro
// de busca por texto (o usuário pode digitar "agendou", "transferiu" etc.).
// Ampliado com transfer + act_* (agendamentos) para casar com o feed-runtime.
var _admFeedTypeLbl={move:'moveu',create:'criou',discard:'descartou',login:'entrou',delete:'excluiu permanentemente',note:'anexou',obj_edit:'editou a objeção',obj_delete:'excluiu a objeção',lig_call:'registrou uma ligação',lig_bingo:'completou rodada de BINGO 🎯',lig_reset:'reiniciou o contador de ligações',settings_change:'alterou configuração',transfer:'transferiu o responsável de',act_create:'agendou',act_edit:'editou o agendamento',act_done:'concluiu o agendamento',act_delete:'excluiu o agendamento'};

// FIX 2026-08-19: parser tolerante das datas de filtro (yyyy-mm-dd do <input
// type="date">). Retorna epoch ms; endOfDay=true → 23:59:59.999 do dia.
function _admFeedParseBoundary(raw, endOfDay){
  if(!raw)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
    var t=new Date(raw+(endOfDay?'T23:59:59.999':'T00:00:00.000')).getTime();
    return isFinite(t)?t:null;
  }
  var t2=new Date(raw).getTime();
  return isFinite(t2)?t2:null;
}

function _admFeedRenderList(){
  var el=document.getElementById(_feedIds.list);if(!el)return;
  var users=getUsers();
  var sel=document.getElementById(_feedIds.userSel);
  if(sel)_admFeedUserId=sel.value||null;
  // FIX 2026-08-19: prioriza o estado interno (setado pelos handlers com
  // debounce) sobre o valor bruto do input, e tolera ausência do elemento.
  var qEl=document.getElementById(_feedIds.search);
  var q=(_admFeedQuery||(qEl?String(qEl.value||'').toLowerCase().trim():''));
  var fromEl=document.getElementById(_feedIds.from);
  var toEl=document.getElementById(_feedIds.to);
  var fromRaw=_admFeedFrom||(fromEl?fromEl.value:'');
  var toRaw=_admFeedTo||(toEl?toEl.value:'');
  var fromTs=_admFeedParseBoundary(fromRaw,false);
  var toTs=_admFeedParseBoundary(toRaw,true);
  var feed=_admFeedCache.filter(function(f){
    if(_feedScopedUserIds && !_feedScopedUserIds[f.byId])return false;
    if(_admFeedCanal&&f.canal!==_admFeedCanal)return false;
    if(_admFeedUserId&&f.byId!==_admFeedUserId)return false;
    // Filtro por intervalo de datas.
    if(fromTs!=null||toTs!=null){
      var t=new Date(f&&f.ts).getTime();
      if(!isFinite(t))return false;
      if(fromTs!=null&&t<fromTs)return false;
      if(toTs!=null&&t>toTs)return false;
    }
    if(!q)return true;
    // Busca por texto: nome, item, detalhe, board/canal E o rótulo do tipo
    // ("moveu", "transferiu", "agendou", ...) — assim o usuário consegue
    // achar por "agendou" mesmo que o payload não contenha essa palavra.
    var typeTxt=_admFeedTypeLbl[f.type]||f.type||'';
    var hay=((f.byName||'')+' '+(f.itemName||'')+' '+(f.detail||'')+' '+(f.board||'')+' '+(f.canal||'')+' '+typeTxt).toLowerCase();
    return hay.indexOf(q)>=0;
  });
  var total=feed.length;
  // FIX 2026-08-19: contador do total encontrado (visível ao ADM).
  var cntEl=document.getElementById(_feedIds.count);
  if(cntEl){
    var hasFilter=(q||fromTs!=null||toTs!=null||_admFeedCanal||_admFeedUserId);
    cntEl.textContent=total?(total+' movimentação'+(total===1?'':'ões')+(hasFilter?' encontrada'+(total===1?'':'s'):' no total')):'';
  }
  if(!total){
    el.innerHTML='<div class="act-empty">'+(q||fromTs!=null||toTs!=null||_admFeedCanal||_admFeedUserId?'Nenhuma movimentação encontrada para esses filtros.':'Nenhuma movimentacao ainda.')+'</div>';
    var moreElEmpty=document.getElementById(_feedIds.more);
    if(moreElEmpty)moreElEmpty.style.display='none';
    return;
  }
  var tL=_admFeedTypeLbl;
  // FIX 2026-08-19: paginação incremental. Antes: slice(0,60) fixo — o
  // ADM não conseguia ver eventos mais antigos. Agora: mostramos
  // page*pageSize e um botão "Carregar mais" avança.
  var shown=Math.min(total,_admFeedPage*_admFeedPageSize);
  el.innerHTML=feed.slice(0,shown).map(function(f){
    var u=users.find(function(x){return x.id===f.byId;});var bg=AVB[(u?u.cor:0)%AVB.length];
    var dt=new Date(f.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    var isDel=(f.type==='delete'||f.type==='obj_delete'||f.type==='act_delete');
    var isObjEdit=(f.type==='obj_edit'||f.type==='act_edit');
    var avInit=eH((f.byName||'?').charAt(0).toUpperCase());
    var av=isDel?'<div class="adm-feed-av" style="background:rgba(194,32,38,.18);color:var(--rl)">❌</div>':isObjEdit?'<div class="adm-feed-av" style="background:rgba(58,159,224,.18);color:var(--bl)">✏️</div>':'<div class="adm-feed-av" style="background:'+bg+'">'+avInit+'</div>';
    var canalLbl=eH(CANAL_FEED_LBL[f.canal]||f.canal||'');
    var canalTag=f.canal?' <span style="font-size:.58rem;padding:1px 6px;border-radius:20px;background:var(--bg3);color:var(--mu);white-space:nowrap">'+canalLbl+'</span>':'';
    var typeLbl=eH(tL[f.type]||f.type||'');
    return '<div class="adm-feed-item">'+av+'<div class="adm-feed-body"><div class="adm-feed-txt"><strong>'+eH((f.byName||'?').split(' ')[0])+'</strong> '+typeLbl+' <strong>'+eH(f.itemName||'')+'</strong>'+(f.detail?' - '+eH(f.detail):'')+canalTag+'</div><div class="adm-feed-time">'+dt+'</div></div></div>';
  }).join('');
  // Mostra/oculta o botão "Carregar mais".
  var moreEl=document.getElementById(_feedIds.more);
  if(moreEl){
    if(shown<total){
      moreEl.style.display='';
      moreEl.textContent='Carregar mais ('+(total-shown)+' restante'+(total-shown===1?'':'s')+')';
    }else{
      moreEl.style.display='none';
    }
  }
}

// ============================================================
// PÁGINA TIME (Supervisor) — visão de leitura da equipe.
// Reaproveita o padrão da barra de filtro por consultor (kb-view-bar) e a renderização
// de kanban em modo somente-leitura (sem mover/editar/excluir cards).
// ============================================================
var _timeViewUid=null;

function renderTimeConsFilter(){
  var el=document.getElementById('time-cons-bar');if(!el)return;
  if(!_timePageAllowed()){el.innerHTML='';return;}
  var users=(typeof getDepartmentVisibleUsers==='function'?getDepartmentVisibleUsers(S&&S.userId):getUsers().filter(function(u){return u.ativo!==false;})).filter(function(u){return !S||u.id!==S.userId;});
  if(_timeViewUid&&_timeViewUid!==(S&&S.userId)&&users.every(function(u){return u.id!==_timeViewUid;}))_timeViewUid=null;
  el.innerHTML=_lfBuildConsBarHtml('time-cons',users,_timeViewUid,'setTimeConsFilter');
}

function setTimeConsFilter(uid,btn){
  _timeViewUid=uid||null;
  renderTimeConsFilter();
  renderTimePage();
}

function _timeToggleBoards(show){
  var ids=['time-leads-title','time-leads-kanban-wrap','time-negocios-title','time-negocios-kanban-wrap'];
  ids.forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.style.display=show?'':'none';
  });
  if(!show){
    var leadsWrap=document.getElementById('time-leads-kanban');if(leadsWrap)leadsWrap.innerHTML='';
    var negWrap=document.getElementById('time-negocios-kanban');if(negWrap)negWrap.innerHTML='';
  }
}

/* ------------------------------------------------------------------
 * CONSERTO DA ARQUITETURA DA ABA TIME (auditoria 2026-07):
 *
 * Antes: renderTimePage() só desenhava _timeKpisHTML() (linha de resumo).
 * O filtro por consultor (_timeViewUid) existia mas não mudava nada na tela
 * — nenhuma camada analítica era renderizada. Além disso, os containers de
 * kanban da aba Time no HTML eram escondidos incondicionalmente pelo JS,
 * gerando expectativa falsa.
 *
 * Agora: dois modos consistentes com o dashboard individual do consultor.
 *   1) Modo "Todos"        → KPIs de topo + Ranking comparativo por consultor.
 *   2) Modo consultor UID  → KPIs de topo + Analytics COMPLETO daquele usuário:
 *                            funil (drawAnal), distribuição, metas, KPIs de
 *                            negócios (drawNegKPIs) e valor fechado.
 *
 * Regra de reuso: NADA de métrica nova aqui — tudo passa por drawAnal()
 * e drawNegKPIs() do dashboard.js. Isso garante que "Meu Painel" e "Time"
 * NUNCA divirjam para o mesmo consultor (mesma reconciliação Math.max entre
 * steps[6] e col==='fechado' já aplicada em renderAdmMetrics).
 * ------------------------------------------------------------------ */
var _timePer='mes';

function setTimePer(p,btn){
  _timePer=p;
  var wrap=document.getElementById('time-analytics-wrap');
  if(wrap)wrap.querySelectorAll('.pb').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  var dr=document.getElementById('time-dr');if(dr)dr.style.display=(p==='custom')?'flex':'none';
  renderTimePage();
}

/* Aplica o mesmo filtro de período usado em drawAnal(), mas sobre a variável
   independente _timePer (a aba Time não deve mexer no _per do dashboard
   pessoal, pra não "resetar" o período do consultor logado quando ele voltar
   ao seu Analytics). */
function _timeFilterByPeriod(list){
  var now=new Date();
  return (list||[]).filter(function(c){
    if(!c.data)return true;
    var d=(typeof _parseLocalDate==='function')?_parseLocalDate(c.data):new Date(c.data);
    if(_timePer==='hoje')return d.toDateString()===now.toDateString();
    if(_timePer==='semana'){var s=new Date(now);s.setDate(now.getDate()-7);return d>=s;}
    if(_timePer==='mes')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    if(_timePer==='custom'){
      var d1=document.getElementById('time-d1'),d2=document.getElementById('time-d2');
      if(d1&&d2&&d1.value&&d2.value){
        var _v1=d1.value,_v2=d2.value;
        if(_v1>_v2){var _tmp=_v1;_v1=_v2;_v2=_tmp;d1.value=_v1;d2.value=_v2;}
        return c.data>=_v1&&c.data<=_v2;
      }
      return false;
    }
    return true;
  });
}

/* Lista rolável de consultores (modo "Todos") — remodelação 2026-08-20.
   Cards empilhados verticalmente, um em cima do outro, com scroll interno
   quando a equipe passa da altura visível. Clique em um card abre o analytics
   individual daquele consultor (mesma rota que a antiga grade de ranking usava).
   Reusa a mesma fórmula de reconciliação de renderAdmMetrics (Math.max entre
   cli/steps[6] e kb negocios/col==='fechado') pra não duplicar fechamento. */
function _drawTimeRanking(users){
  var el=document.getElementById('time-ranking');if(!el)return;
  if(!users.length){el.innerHTML='<div class="act-empty">Nenhum consultor visível.</div>';return;}
  var rows=users.map(function(u){
    var clis=(typeof getCliLocal==='function')?getCliLocal(u.id):[];
    var ag=clis.filter(function(c){return c.steps&&c.steps[0];}).length;
    var fecCli=clis.filter(function(c){return c.steps&&c.steps[6];}).length;
    var leads=(typeof getKBFor==='function')?getKBFor('leads',u.id):[];
    var negs=(typeof getKBFor==='function')?getKBFor('negocios',u.id):[];
    var fecKB=negs.filter(function(c){return c.col==='fechado';}).length;
    var fec=Math.max(fecCli,fecKB);
    var tx=ag>0?Math.round(fec/ag*100):0;
    var valor=negs.filter(function(c){return c.col==='fechado';}).reduce(function(s,c){return s+(parseFloat(c.valor)||0);},0);
    var uidJs=(typeof _jsSq==='function')?_jsSq(u.id):u.id;
    var nomeCurto=(u.nome||'?').split(' ')[0];
    var fmt=(typeof fmtBRL==='function')?fmtBRL(valor):('R$ '+valor);
    var inicial=((u.nome||'?').trim().charAt(0)||'?').toUpperCase();
    return {u:u,ag:ag,fec:fec,tx:tx,valor:valor,fmt:fmt,uidJs:uidJs,nomeCurto:nomeCurto,inicial:inicial,leads:leads.length,negs:negs.length};
  }).sort(function(a,b){
    // [FIX 20260820] Pedido explícito: essa lista não deve funcionar como
    // ranking/competição (antes ordenava por fechamentos/taxa/valor e
    // mostrava medalha 🥇🥈🥉 pros 3 primeiros + posição numerada pros
    // demais). Agora é só a lista da equipe, em ordem alfabética — sem
    // "1º/2º lugar" nenhum.
    return (a.u.nome||'').localeCompare(b.u.nome||'',"pt-BR");
  });
  el.innerHTML=rows.map(function(r,i){
    return '<div class="time-cons-card" role="button" tabindex="0" onclick="setTimeConsFilter(\''+r.uidJs+'\',null)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();setTimeConsFilter(\''+r.uidJs+'\',null);}" title="Ver analytics completo de '+eH(r.u.nome)+'">'
      +'<div class="time-cons-av">'+eH(r.inicial)+'</div>'
      +'<div class="time-cons-body">'
        +'<div class="time-cons-name">'+eH(r.u.nome||r.nomeCurto)+'</div>'
        +'<div class="time-cons-sub">'+r.ag+' agend. · '+r.fec+' fech. · '+r.tx+'% · '+r.fmt+'</div>'
      +'</div>'
      +'<div class="time-cons-metrics">'
        +'<div class="time-cons-metric"><div class="time-cons-metric-v">'+r.leads+'</div><div class="time-cons-metric-l">Leads</div></div>'
        +'<div class="time-cons-metric opt"><div class="time-cons-metric-v">'+r.negs+'</div><div class="time-cons-metric-l">Neg.</div></div>'
        +'<div class="time-cons-metric"><div class="time-cons-metric-v">'+r.fec+'</div><div class="time-cons-metric-l">Fech.</div></div>'
      +'</div>'
      +'<div class="time-cons-chev">›</div>'
      +'</div>';
  }).join('');
}

/* REMOVIDO (2026-08-20): _timeKpisHTML() gerava a linha de KPIs de topo
   (Total de Leads / Negócios / Fechamentos + breakdown por consultor).
   A remodelação da aba Time não mostra mais esses agregados de cara —
   quem quiser as métricas de um consultor específico clica no card dele
   na lista abaixo e o painel individual (drawAnal + drawNegKPIs) aparece. */

function renderTimePage(){
  if(!_timePageAllowed())return;
  renderTimeConsFilter();
  _timeToggleBoards(false); // kanban somente-leitura permanece desligado por padrão (decisão: não expor movimentação de cards de outros consultores nessa tela)

  var allUsers=(typeof getDepartmentVisibleUsers==='function'?getDepartmentVisibleUsers(S&&S.userId):getUsers().filter(function(u){return u.ativo!==false;})).filter(function(u){return !S||u.id!==S.userId;});
  if(_timeViewUid&&allUsers.every(function(u){return u.id!==_timeViewUid;}))_timeViewUid=null;

  // Topo: não desenha mais KPIs agregados (remoção 2026-08-20). O container
  // #time-kpis foi removido do HTML; a guarda abaixo mantém compatibilidade
  // caso algum bundle antigo ainda tenha o div em cache no navegador.
  var kpiEl=document.getElementById('time-kpis');if(kpiEl)kpiEl.innerHTML='';

  var anaWrap=document.getElementById('time-analytics-wrap');
  var rankWrap=document.getElementById('time-ranking-wrap');

  if(_timeViewUid){
    // -------- MODO CONSULTOR SELECIONADO --------
    // Reusa exatamente o mesmo motor analítico do dashboard individual.
    if(rankWrap)rankWrap.style.display='none';
    if(anaWrap)anaWrap.style.display='';
    var u=(typeof getUser==='function')?getUser(_timeViewUid):null;
    var ttl=document.getElementById('time-analytics-title');
    if(ttl)ttl.textContent='📊 Analytics de '+((u&&u.nome)?u.nome:'consultor');

    // Carrega clientes do consultor (mesma função usada por renderDash) e chama drawAnal
    // apontando para os IDs novos (time-*) em vez dos IDs do dashboard pessoal (krow/funil/...).
    if(typeof loadCli==='function'){
      loadCli(_timeViewUid,function(list){
        var filtered=_timeFilterByPeriod(list);
        if(typeof drawAnal==='function'){
          // Salva/restaura _per do dashboard pessoal pra que o filtro de período da aba Time
          // não "vaze" para o Analytics do consultor logado (isolamento de estado).
          var _perBk=(typeof _per!=='undefined')?_per:null;
          try{ _per=_timePer; }catch(e){}
          try{ drawAnal(filtered,'time-krow','time-funil','time-psvg','time-pleg'); }
          finally{ try{ _per=_perBk; }catch(e){} }
        }
        if(typeof drawNegKPIs==='function')drawNegKPIs(_timeViewUid,'time-krow2');
      });
    }
  } else {
    // -------- MODO "TODOS" --------
    if(anaWrap)anaWrap.style.display='none';
    if(rankWrap)rankWrap.style.display='';
    _drawTimeRanking(allUsers);
  }
}

var _timePageRefreshTm=0;
function _scheduleTimePageRefresh(){
  clearTimeout(_timePageRefreshTm);
  _timePageRefreshTm=setTimeout(function(){
    var pg=document.getElementById('pg-time');
    if(pg&&pg.classList.contains('on')&&_timePageAllowed())renderTimePage();
  },80);
}
window.addEventListener('crm:users-updated',_scheduleTimePageRefresh);
window.addEventListener('crm:departments-updated',_scheduleTimePageRefresh);

/* Move um card de coluna. Se for um Lead indo pra "Convertido", aciona a conversão
   automática em Negócio (começando em "Retornar") — TAREFA PEDIDA. silent=true evita toast
   individual (usado em operações em massa, que mostram um único toast no final). */
function _kbMoveCard(cardId,board,uid,newCol,silent,bulk,dropIndex){
  var arr=getKBFor(board,uid);
  var card=arr.find(function(x){return x.id===cardId;});if(!card)return null;
  var oldCol=card.col;
  var hasDropIndex=Number.isFinite(dropIndex);

  function _recalcManualOrder(colId,movingCard,insertAt){
    var colCards=(typeof _sortCardsForColumn==='function'?_sortCardsForColumn(arr.filter(function(x){return x.col===colId&&(!movingCard||x.id!==movingCard.id);})):arr.filter(function(x){return x.col===colId&&(!movingCard||x.id!==movingCard.id);}));
    if(movingCard&&movingCard.col===colId){
      var pos=Number.isFinite(insertAt)?insertAt:0;
      if(pos<0)pos=0;
      if(pos>colCards.length)pos=colCards.length;
      colCards.splice(pos,0,movingCard);
    }
    colCards.forEach(function(item,idx){item.manualOrder=idx;});
  }

  if(oldCol===newCol&&hasDropIndex){
    _recalcManualOrder(newCol,card,dropIndex);
    _kbWarnIfFailed(saveKBFor(board,uid,arr));
    return card;
  }
  if(oldCol===newCol)return card;
  if(typeof _kbIsDiscardStage==='function'&&typeof _kbOpenDiscardReasonModal==='function'&&!_kbIsDiscardStage(board,oldCol)&&_kbIsDiscardStage(board,newCol)){
    _kbOpenDiscardReasonModal({items:[{id:cardId,board:board,ownerUid:uid,targetCol:newCol}],targetCol:newCol});
    return card;
  }
  if(board==='leads'&&newCol==='conv'){
    convertToNeg(cardId,uid,oldCol,silent,undefined,bulk);
    return getKBFor(board,uid).find(function(x){return x.id===cardId;});
  }
  var _kbMoveTs=new Date().toISOString();
  card.col=newCol;card.updatedAt=_kbMoveTs;
  // [FIX 20260820] Antes só Leads registrava quando entrou na etapa atual
  // (stageEnteredAt) — Negócios nunca tinha essa informação, então as
  // métricas do Analytics (Agendado/Compareceu/Ficha/Fechamento por data)
  // caíam pro updatedAt genérico, que muda a QUALQUER edição do card, não
  // só quando ele muda de etapa. Resultado: um negócio agendado dia 20
  // que recebe uma observação nova dia 25 "virava" Agendado do dia 25.
  if(typeof _kbSeedLeadStageEnteredAt==='function')_kbSeedLeadStageEnteredAt(card,_kbMoveTs);
  _recalcManualOrder(oldCol,null,null);
  _recalcManualOrder(newCol,card,hasDropIndex?dropIndex:0);
  if(card._autoFired)card._autoFired={}; // permite que regras de automação do tipo "card movido para coluna Y" disparem de novo se o card sair e voltar pra mesma etapa depois
  _pushHistorico(card,'Movido de "'+_colLabel(board,oldCol)+'" para "'+_colLabel(board,newCol)+'"');
  _kbWarnIfFailed(saveKBFor(board,uid,arr));
  var cl=kbCols(board).find(function(x){return x.id===newCol;});
  if(cl){
    if(!silent)toast(card.name+' -> '+cl.label);
    if(!S||!S.userId){console.warn('[feed] logFeedEvent: sessão inativa');return;}

    logFeedEvent('move',S.userId,card.name,cl.label,board);
    }
  // Automação de lembrete (não em massa): card de Negócios entrando em "AG Vídeo" ou
  // "Presencial" abre sozinho a tela de Adicionar Lembrete pra esse card.
  if(!bulk&&board==='negocios'&&(newCol==='agvid'||newCol==='presencial'))_autoOpenReminderFor(cardId,board,uid);
  return card;
}

/* Transfere um Lead/Negócio de um consultor pra outro ("escolher pra quem" antes de
   transferir). Usado tanto pela transferência individual (no detalhe do card) quanto pela
   transferência em massa. */
function _kbTransferCard(cardId,board,fromUid,toUid,silent,cb){
  cb=cb||function(){};
  if(!toUid||fromUid===toUid){cb(null);return null;}
  var arr=getKBFor(board,fromUid);var c=arr.find(function(x){return x.id===cardId;});if(!c){cb(null);return null;}
  var fromUser=getUser(fromUid),toUser=getUser(toUid);if(!toUser){cb(null);return null;}
  if(!c.respHistory)c.respHistory=[];
  c.respHistory.push({from:fromUser?(fromUser.nome||'?'):'?',fromId:fromUid,to:(toUser&&toUser.nome)||toUid,toId:toUid,ts:new Date().toISOString(),by:(S&&S.nome)||'?'});
  _pushHistorico(c,'Responsável alterado de "'+(fromUser?fromUser.nome:'?')+'" para "'+toUser.nome+'"');
  c.userId=toUid;c.updatedAt=new Date().toISOString();
  // [FIX 20260821] Transferir a responsabilidade NUNCA reiniciava o
  // relógio de "quanto tempo está parado na etapa atual"
  // (stageEnteredAt) — usado por _autoMoveStaleToLivre pra empurrar
  // Leads esquecidos pra etapa "Livre" depois de 3 dias sem mexer. Se o
  // lead já estava parado (motivo comum pra um supervisor redistribuir
  // — exatamente o cenário relatado), ele chegava no novo responsável
  // JÁ "vencido", e a próxima varredura de staleness o puxava pra
  // Livre na hora seguinte — desfazendo, sem aviso nenhum, a
  // transferência que acabou de ser feita ("parte no meu nome e parte
  // no Livre"). Uma nova atribuição de responsável é um recomeço
  // legítimo do relógio: o novo dono ainda não teve chance nenhuma de
  // mexer no lead. Só se aplica a Leads (Negócios não tem esse
  // mecanismo de auto-mover) e só quando a etapa em si não está
  // mudando nesta mesma operação (troca de etapa já atualiza esse
  // campo por conta própria, noutro lugar).
  if(board==='leads'&&typeof _kbSeedLeadStageEnteredAt==='function')_kbSeedLeadStageEnteredAt(c);
  /* FIX 2026-07-28: fetch remoto do DESTINO (mantido) + relê a ORIGEM logo antes
     do PUT, e serializa os dois PUTs. Antes: as duas gravações saíam em paralelo
     via saveKBFor (que retorna sync mas dispara PUT async) — a ordem de chegada
     no Worker era indeterminada, e o PUT da origem, montado a partir do snapshot
     antigo, ainda continha o card, reintroduzindo-o no próximo _syncKBRemoteBG.
     Resultado visível: card duplicado (um pro remetente, um pro novo responsável). */
  function _finish(toArrBase,fromArrBase){
    var toArr=(toArrBase||[]).filter(function(x){return x.id!==cardId;});toArr.push(c);
    var srcArr=(fromArrBase&&fromArrBase.length?fromArrBase:arr);
    var newFromArr=srcArr.filter(function(x){return x.id!==cardId;});
    /* 1) grava no destino e AGUARDA o PUT remoto terminar antes de gravar a origem.
       Assim garantimos a ordem destino -> origem no Worker; se a origem chegar
       depois, ela nunca poderá reintroduzir o card lá. */
    var okTo=saveKBFor(board,toUid,toArr,function(remoteOk){
      var okFrom=saveKBFor(board,fromUid,newFromArr,function(remoteOk2){
        if(!S||!S.userId){console.warn('[feed] logFeedEvent: sessão inativa');return;}
        // FIX 2026-08-18: usa tipo 'transfer' (antes era 'move' genérico) pra ficar
        // claro no feed ADM que foi uma troca de responsável, não uma mudança de etapa.
        logFeedEvent('transfer',S.userId,c.name,'De '+((fromUser&&fromUser.nome)||'?')+' para '+toUser.nome,board);
        if(toUid!==S.userId&&remoteOk)if(S&&S.userId)pushNotif(toUid,'transfer','🔄 "'+c.name+'" foi transferido para você por '+(S.nome||'?'),{cardId:c.id,board:board});
        var okAll=(okTo!==false)&&(okFrom!==false)&&(remoteOk!==false)&&(remoteOk2!==false);
        if(!remoteOk)toast('⚠️ Transferência: gravação remota do destino falhou. Tente novamente.',4500);
        else if(!remoteOk2)toast('⚠️ Transferência: gravação remota da origem falhou — pode aparecer duplicado até próximo sync.',4500);
        else if(!silent)toast('Transferido para '+(toUser&&toUser.nome?toUser.nome.split(' ')[0]:'usuário'));
        cb(okAll?c:null);
      });
    });
    if(!okTo){
      toast('⚠️ Não foi possível transferir — armazenamento local cheio. O card permanece com o responsável atual.',4500);
      cb(null);
    }
  }
  // IMPORTANTE: busca a versão mais recente do board do destinatário no Worker antes de
  // gravar, em vez de confiar só no cache local — que pode estar desatualizado se este
  // aparelho não sincronizou o board desse usuário nesta sessão (ex.: Gestor entrou direto
  // no board filtrado de um único consultor via Painel ADM). Sem isso, cards que o
  // destinatário criou/moveu em outro dispositivo podiam ser perdidos (ver relatório de
  // auditoria). FASE 3.3 (parte 4): reaproveita o mesmo endpoint /api/v1/kanban/list já
  // criado na parte 3 (js/kanban.js) — _kbWorkerClient() é uma função global definida lá.
  /* FIX 2026-07-28: além do destino, relê também a ORIGEM no Worker antes de
     montar o PUT que remove o card lá. Se outra aba/dispositivo alterou a origem
     durante essa transferência, respeitamos essa versão mais nova em vez de
     sobrescrevê-la com o snapshot antigo capturado no início da função. */
  var _wcKb=(typeof _kbWorkerClient==='function')?_kbWorkerClient():null;
  // [FIX 20260821] limite de tempo pras duas buscas remotas abaixo —
  // sem isso, uma única requisição travada (rede fraca, dados móveis)
  // deixava a transferência (e, em transferência em massa, TODA A
  // FILA — o próximo card só processa depois deste terminar) esperando
  // pra sempre, sem nenhum aviso na tela. "Travou o sistema inteiro"
  // relatado batia exatamente com esse cenário: uma rede instável no
  // meio de uma transferência de vários leads de uma vez. No timeout,
  // cai pro mesmo cache local que o .catch() já usava como reserva —
  // mesma degradação graciosa já usada no resto desta função.
  function _withTimeout(promise,ms,fallbackValue){
    return new Promise(function(resolve){
      var done=false;
      var t=setTimeout(function(){if(done)return;done=true;resolve(fallbackValue);},ms);
      promise.then(function(v){if(done)return;done=true;clearTimeout(t);resolve(v);})
             .catch(function(){if(done)return;done=true;clearTimeout(t);resolve(fallbackValue);});
    });
  }
  if(_wcKb){
    Promise.all([
      _withTimeout(_wcKb.kanbanList(board,toUid).then(function(doc){return (doc&&doc.list)||getKBFor(board,toUid);}),8000,getKBFor(board,toUid)),
      _withTimeout(_wcKb.kanbanList(board,fromUid).then(function(doc){return (doc&&doc.list)||arr;}),8000,arr)
    ]).then(function(rs){_finish(rs[0],rs[1]);});
  }else if(DB_MODE==='firebase'&&db){
    Promise.all([
      db.collection('kb_'+board).doc(toUid).get().then(function(d){return d.exists&&d.data().list?d.data().list:getKBFor(board,toUid);}).catch(function(){return getKBFor(board,toUid);}),
      db.collection('kb_'+board).doc(fromUid).get().then(function(d){return d.exists&&d.data().list?d.data().list:arr;}).catch(function(){return arr;})
    ]).then(function(rs){_finish(rs[0],rs[1]);});
  }else{
    _finish(getKBFor(board,toUid),arr);
  }
  return undefined; // agora assíncrona — usar o parâmetro "cb" pra saber o resultado
}

/* Exclui um card (Lead ou Negócio) PERMANENTEMENTE. Diferente de "Descartar" (que só move
   o card para a coluna de descartados/no-show, mantendo o histórico), aqui o registro é
   removido de vez do array — usado para leads duplicados ou cadastrados por engano. */
var _deleteKBState={items:[],cardId:null,board:null,ownerUid:null,reason:null,afterConfirm:null};

function _kbDeleteReasonLabelSafe(reason){
  var map={duplicado:'Duplicado',bug_teste:'Bug ou Teste',numero_nao_existe:'Número não existe',ja_comprou:'Já comprou',sem_interesse:'Sem interesse',em_tratativa:'Em tratativa'};
  return map[reason]||((typeof _kbDeleteReasonLabel==='function'&&_kbDeleteReasonLabel(reason))||reason||'');
}

function selDeleteKBReason(reason,btn){
  _deleteKBState.reason=reason;
  document.querySelectorAll('#delete-kb-opts .discard-opt').forEach(function(b){b.classList.remove('sel');});
  if(btn)btn.classList.add('sel');
}

function _openDeleteKBReasonModal(opts){
  opts=opts||{};
  var items=Array.isArray(opts.items)?opts.items.filter(function(x){return x&&x.id&&x.board;}):[];
  if(!items.length)return false;
  var first=items[0];
  var uid=first.ownerUid||activeUID(first.board);
  var arr=getKBFor(first.board,uid);
  var c=arr.find(function(x){return x.id===first.id;});
  _deleteKBState={items:items,cardId:first.id,board:first.board,ownerUid:uid,reason:null,afterConfirm:(typeof opts.afterConfirm==='function'?opts.afterConfirm:null)};
  var nm=document.getElementById('delete-kb-nome');
  if(nm)nm.textContent=(items.length===1&&c&&c.name)?c.name:(items.length+' card'+(items.length>1?'s':'')+' selecionado'+(items.length>1?'s':''));
  var hint=document.getElementById('delete-kb-type-hint');
  if(hint)hint.textContent=(items.some(function(x){return x.board==='negocios';})?'Em Negócios, a ação finaliza em descarte com motivo.':'O motivo é obrigatório para continuar.');
  var dt=document.getElementById('delete-kb-detail');if(dt)dt.value='';
  document.querySelectorAll('#delete-kb-opts .discard-opt').forEach(function(b){b.classList.remove('sel');});
  openM('mo-delete-kb-reason');
  return true;
}

function deleteKBCard(cardId,board,ownerUid){
  var uid=ownerUid||activeUID(board);
  _openDeleteKBReasonModal({items:[{id:cardId,board:board,ownerUid:uid}]});
}

function confirmDeleteKBReason(){
  var items=(_deleteKBState&&Array.isArray(_deleteKBState.items)&&_deleteKBState.items.length)?_deleteKBState.items:[{id:_deleteKBState.cardId,board:_deleteKBState.board,ownerUid:_deleteKBState.ownerUid}];
  if(!items.length){toast('Card não selecionado.');return;}
  if(!_deleteKBState.reason){toast('Selecione um motivo');return;}
  var _dkbDetail=document.getElementById('delete-kb-detail');
  var detail=(_dkbDetail?_dkbDetail.value||'':'').trim();
  var reasonLabel=_kbDeleteReasonLabelSafe(_deleteKBState.reason);
  var reasonText=reasonLabel+(detail?' - '+detail:'');
  var affected={};
  var allOk=true;
  var doneCount=0;
  /* [FIX 20260820] Purga atividades e notificações órfãs vinculadas a um card
     excluído/descartado, para o DONO REAL do card (item.ownerUid) — não para
     quem está clicando em excluir. Antes disso, quando um SUPERVISOR excluía
     ou descartava o lead/negócio de um CONSULTANTE, a purga rodava em cima de
     getActivities()/getNotifs() do supervisor (sempre S.userId), então as
     atividades órfãs do consultor nunca eram limpas — ficavam "atrasadas"
     para sempre no painel de Atividades do ADM/Time (ver _admAtivIsOrphan
     logo abaixo, que agora também filtra na exibição, como segunda camada).
     Usa getActivitiesLocalFor/lfSaveActivitiesFor (aceitam uid arbitrário,
     "inclusive outro consultor" — ver src/modules/agenda/runtime/activities-store.js)
     em vez de getActivities/saveActivities (que só operam no usuário logado). */
  function _purgeOrphanActsAndNotifs(uid,cardId,board){
    try{
      var _agdRt=(typeof window.LiderCRM!=='undefined'&&window.LiderCRM.modules&&window.LiderCRM.modules.agenda&&window.LiderCRM.modules.agenda.runtime)||null;
      var _saveFor=(_agdRt&&typeof _agdRt.lfSaveActivitiesFor==='function')?_agdRt.lfSaveActivitiesFor:null;
      var hasArbitraryActs=(typeof getActivitiesLocalFor==='function'&&_saveFor);
      var _acts=hasArbitraryActs?(getActivitiesLocalFor(uid)||[])
        :((uid===((S&&S.userId)||null)&&typeof getActivities==='function')?(getActivities()||[]):null);
      if(_acts){
        var _nextActs=_acts.filter(function(a){
          return !(a&&a.clientId===cardId&&(!a.board||a.board===board));
        });
        if(_nextActs.length!==_acts.length){
          if(hasArbitraryActs)_saveFor(uid,_nextActs);
          else if(typeof saveActivities==='function')saveActivities(_nextActs);
        }
      }
    }catch(_e){}
    try{
      if(uid&&typeof getNotifs==='function'&&typeof saveNotifsFor==='function'){
        var _lst=getNotifs(uid)||[];
        var _lst2=_lst.filter(function(n){
          return !(n&&n.cardId===cardId&&(!n.board||n.board===board));
        });
        if(_lst2.length!==_lst.length){
          saveNotifsFor(uid,_lst2);
          if(S&&uid===S.userId&&typeof updateNotifBadge==='function')updateNotifBadge();
        }
      }
    }catch(_e){}
  }

  items.forEach(function(item){
    var board=item.board;
    var uid=item.ownerUid||activeUID(board);
    var arr=getKBFor(board,uid);
    var c=arr.find(function(x){return x.id===item.id;});
    if(!c)return;
    if(board==='negocios'){
      var ts=new Date().toISOString();
      c.discarded=true;
      c.discardedAt=ts;
      c.discardMotivo=_deleteKBState.reason;
      c.discardMotivoLabel=reasonText;
      c.col='noshow';
      c.updatedAt=ts;
      if(typeof _pushHistorico==='function')_pushHistorico(c,'Descartado (exclusão): '+reasonText);
      if(!saveKBFor(board,uid,arr))allOk=false;
      // FIX 2026-08-18: se sessão inativa, avisa em vez de silenciar (antes só o if descartava o evento).
      if(S&&S.userId)logFeedEvent('delete',S.userId,c.name,'Descartado (exclusão) · '+reasonText,board);
      else console.warn('[feed] delete não registrado — sessão inativa',c&&c.name);
      affected[board]=true;
      doneCount++;
      // FIX 20260820: descartar um negócio antes NUNCA purgava as atividades
      // vinculadas (o "return" abaixo saía antes de chegar no bloco de purga
      // do fluxo de exclusão permanente) — elas ficavam "atrasadas" para
      // sempre, mesmo o card já não estando mais ativo em nenhum board.
      _purgeOrphanActsAndNotifs(uid,item.id,board);
      return;
    }
    var nextArr=arr.filter(function(x){return x.id!==item.id;});
    if(typeof window._lfMarkRecentlyDeleted==='function')window._lfMarkRecentlyDeleted(item.id);
    if(board==='leads'){
      var negArr=getKBFor('negocios',uid);
      var hadLinked=negArr.some(function(n){return n.originalLeadId===item.id;});
      if(hadLinked){
        var nextNegArr=negArr.filter(function(n){return n.originalLeadId!==item.id;});
        var _delNeg=negArr.find(function(n){return n.originalLeadId===item.id;});
        if(_delNeg&&typeof window._lfMarkRecentlyDeleted==='function')window._lfMarkRecentlyDeleted(_delNeg.id);
        if(!saveKBFor('negocios',uid,nextNegArr))allOk=false;
        affected.negocios=true;
      }
    }
    if(!saveKBFor(board,uid,nextArr))allOk=false;
    if(S&&S.userId)logFeedEvent('delete',S.userId,c.name,'Excluído permanentemente · '+reasonText,board);
    else console.warn('[feed] delete permanente não registrado — sessão inativa',c&&c.name);
    affected[board]=true;
    doneCount++;
    /* [FIX 20260818, alvo corrigido 20260820] Purga atividades e notificações
       órfãs vinculadas ao card excluído — agora para o DONO REAL do card
       (uid), não sempre para quem clicou em excluir (ver função acima). */
    _purgeOrphanActsAndNotifs(uid,item.id,board);
  });
  closeM('mo-delete-kb-reason');
  closeM('mo-kb-det');
  var _scrollSnap=(typeof _kbCaptureScrollSnapshot==='function')?_kbCaptureScrollSnapshot():null;
  Object.keys(affected).forEach(function(board){renderKBLocal(board);});
  if(_scrollSnap&&typeof _kbScheduleScrollRestore==='function')_kbScheduleScrollRestore(_scrollSnap);
  var afterConfirm=_deleteKBState.afterConfirm;
  _deleteKBState={items:[],cardId:null,board:null,ownerUid:null,reason:null,afterConfirm:null};
  if(typeof afterConfirm==='function'){
    try{afterConfirm({ok:allOk,count:doneCount,reasonText:reasonText});}catch(_e){}
  }
  toast(allOk?('Motivo registrado: '+reasonText+(doneCount>1?' ('+doneCount+')':'')):'⚠️ Exclusão/descarte pode não ter sido salvo — armazenamento local cheio.');
}

/* Converte um Lead em Negócio. prevCol (opcional) é a etapa em que o lead estava antes —
   guardado em colAntesConv pra dar pra reverter depois (ver convertToLead). Se o lead já
   tiver sido convertido antes (existe Negócio com originalLeadId igual), não duplica.
   opts (opcional) — { col, valor, obs }: usado pelo modal de conversão (Tarefa 7) pra deixar
   escolher a etapa inicial do negócio e já preencher valor/observação na hora, em vez de
   sempre cair na primeira etapa ("Retornar") sem detalhe nenhum. */
function convertToNeg(cardId,ownerUid,prevCol,silent,opts,noAuto){
  var uid=ownerUid||activeUID('leads');var arr=getKBFor('leads',uid);
  var c=arr.find(function(x){return x.id===cardId;});if(!c)return;
  var oldCol=prevCol!==undefined?prevCol:c.col;
  var negArr=getKBFor('negocios',uid);
  var already=negArr.find(function(n){return n.originalLeadId===cardId;});
  var _convTs=new Date().toISOString();
  c.colAntesConv=oldCol;c.col='conv';c.updatedAt=_convTs;
  if(typeof _kbSeedLeadStageEnteredAt==='function')_kbSeedLeadStageEnteredAt(c,_convTs);
  if(!already)_pushHistorico(c,'Convertido em Negócio');
  var okLead=saveKBFor('leads',uid,arr);
  if(!okLead)_kbLastOpFailed=true;
  if(already){
    var _scrollSnapAlready=(typeof _kbCaptureScrollSnapshot==='function')?_kbCaptureScrollSnapshot():null;
    renderKBLocal('leads');
    if(_scrollSnapAlready&&typeof _kbScheduleScrollRestore==='function')_kbScheduleScrollRestore(_scrollSnapAlready);
    return;
  }
  var targetCol=(opts&&opts.col&&KB_NEG_COLS.some(function(k){return k.id===opts.col;}))?opts.col:'retag';
  var negCard={id:'neg_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),name:c.name,tel:c.tel,nicho:c.nicho,col:targetCol,valor:(opts&&opts.valor)?(parseFloat(opts.valor)||0):0,obs:(opts&&opts.obs!=null)?opts.obs:(c.obs||''),createdAt:new Date().toISOString(),stageEnteredAt:new Date().toISOString(),userId:uid,originalLeadId:c.id,attachments:[],historico:[]};
  _pushHistorico(negCard,'Negócio criado a partir do Lead (etapa inicial: "'+_colLabel('negocios',targetCol)+'")');
  negArr.push(negCard);
  var okConv=saveKBFor('negocios',uid,negArr);if(!okConv)_kbLastOpFailed=true;
  // CORREÇÃO (auditoria, motor de automação — gatilho 'card_created'): idem à criação manual
  // de card — o Negócio gerado aqui pela conversão também é um card novo (createdAt agora),
  // e sem rodar o motor na hora o gatilho 'card_created' (janela de 60s) quase sempre
  // expirava antes do próximo ciclo periódico do motor.
  if(okConv)runAutomationEngine('negocios',negArr,uid);
  var _scrollSnap=(typeof _kbCaptureScrollSnapshot==='function')?_kbCaptureScrollSnapshot():null;
  renderKBLocal('leads');renderKBLocal('negocios');logFeedEvent('move',S.userId,c.name,'Lead -> Negocio','leads');
  if(_scrollSnap&&typeof _kbScheduleScrollRestore==='function')_kbScheduleScrollRestore(_scrollSnap);
  if(!silent)toast((okLead&&okConv)?(c.name+' -> Negocios!'):'⚠️ Conversão pode não ter sido salva — armazenamento local cheio.');
  // Automação de lembrete (não em lote): todo Lead que virar Negócio — não importa a
  // etapa inicial escolhida — já abre sozinho a tela de Adicionar Lembrete/Atividade
  // pra esse novo card em Negócios.
  if(!noAuto&&okConv)_autoOpenReminderFor(negCard.id,'negocios',uid);
}

/* Excluir */
function delAttachment(attId){
  if(typeof _attCanEditCurrentCard==='function'&&!_attCanEditCurrentCard()){toast('Somente visualização em Vídeo/Loja.');return;}
  var canDel=hasAdminAccess();
  if(!canDel){toast('Sem permissão para excluir anexos');return;}
  var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  var a=(c.attachments||[]).find(function(x){return x.id===attId;});if(!a)return;
  if(typeof _confirmModal!=='function'){toast('Ação bloqueada: módulo de confirmação não carregado.');return;}

  _confirmModal({
    title:'🗑 Excluir anexo?',
    msg:'Excluir o anexo <strong>'+eH(a.name)+'</strong>?<br><span style="font-size:.76rem;color:var(--mu)">Esta ação não pode ser desfeita.</span>',
    okLabel:'Excluir',
    okClass:'bd',
    onOk:function(){
      var nomeArq=a.name;
      _deleteFromStorage(a.storagePath);
      c.attachments=c.attachments.filter(function(x){return x.id!==attId;});
      saveKBFor(board,uid,arr);
      logAttEvent('delete',c.name,nomeArq,board);
      reRenderAtt();toast('🗑 Anexo removido');
    }
  });
}

/* Registra eventos de anexo no histórico (timeline) */
function logAttEvent(tipo,cardName,detalhe,board){
  // Adiciona ao feed (já existe logFeedEvent)
  var labels={upload:'Anexo adicionado',delete:'Anexo removido',rename:'Anexo renomeado',pin:'Anexo fixado',unpin:'Anexo desafixado',comment:'Comentário adicionado',comment_delete:'Comentário removido'};
  if(!S||!S.userId){console.warn('[feed] logFeedEvent: sessão inativa');return;}

  logFeedEvent('note',S.userId,cardName,labels[tipo]+': '+detalhe,board);
}

/* Exclui uma duplicata individual a partir do scanner e re-varre na hora, sem fechar o
   modal, pra refletir o resultado imediatamente. */
function _dupDeleteAndRescan(cardId,board,ownerUid){
  if(typeof _openDeleteKBReasonModal!=='function'){toast('Módulo de motivo de exclusão não carregado.');return;}
  _openDeleteKBReasonModal({
    items:[{id:cardId,board:board,ownerUid:ownerUid}],
    afterConfirm:function(){openDuplicateScanner();}
  });
}

// ============================================================
// PAINEL DE ATIVIDADES DO ADMINISTRADOR (Tarefa 3)
// Status (atrasada / a vencer / futura) e sempre calculado na hora,
// comparando scheduledAt com a data atual — nunca e um campo salvo,
// entao nunca fica "desatualizado".
//
// [FIX 20260820] SEGUNDA CAMADA contra atividades "órfãs" aparecendo
// como atrasadas (card já excluído, ou negócio já descartado/fechado):
// _purgeOrphanActsAndNotifs (em confirmDeleteKBReason, acima) evita que
// NOVAS órfãs se acumulem dali pra frente, mas não alcança órfãs que já
// existiam antes desse fix — ex.: negócios descartados há dias, cujas
// atividades nunca tinham sido purgadas (bug antigo: o discard sempre
// retornava sem chegar no bloco de purga). Esta camada filtra na
// EXIBIÇÃO, então limpa retroativamente qualquer estado velho também,
// sem precisar de migração. Mesmo critério já usado e testado em
// js/patches/notificacoes/lf-fix-tab-dot-negocios-ownership-v1-20260820.js
// para a bolinha de notificação da aba.
// ============================================================
var _ADM_ATIV_TERMINAL_COLS=['desc','noshow','conv','desist','fechado'];
function _admAtivIsOrphan(a){
  if(!a||!a.clientId||!a.board)return false; // atividade sem vínculo a card nunca é "órfã"
  try{
    var arr=(typeof getKBFor==='function')?(getKBFor(a.board,a.userId)||[]):[];
    var card=null;
    for(var i=0;i<arr.length;i++){ if(arr[i]&&arr[i].id===a.clientId){card=arr[i];break;} }
    if(!card)return true; // card não existe mais (excluído permanentemente)
    if(card.discarded===true)return true; // negócio descartado (continua no array, só marcado)
    if(_ADM_ATIV_TERMINAL_COLS.indexOf(String(card.col||''))>=0)return true; // etapa terminal
    return false;
  }catch(_e){ return false; } // em erro, não esconde — mantém o comportamento anterior
}

var _admAtivAll=[],_ativFuturasLimit={}

function renderAdmAtividades(){
  var kEl=document.getElementById('adm-ativ-kpis');if(kEl)kEl.innerHTML='<div class="est">Carregando...</div>';
  loadAllActivitiesAdmin(function(all){
    all=all.filter(function(a){return !_admAtivIsOrphan(a);}); // [FIX 20260820]
    _admAtivAll=all;
    _drawAdmAtivKpis(all,'adm-ativ-kpis');
    _drawAdmAtivPorConsultor(all, getUsers().filter(function(u){return u.ativo!==false;}), 'adm-ativ-cons','ativ-row-','ativ-body-');
  });
}

/* FIX (2026-08-03): aba Time (supervisor de departamento) reaproveita
   a mesma coleta de atividades (loadAllActivitiesAdmin já traz de
   TODOS os usuários — é a lista de usuários usada no KPI/detalhe
   que decide quem aparece), filtrando pra só quem getDepartmentVisibleUsers
   retorna. IDs próprios (time-ativ-*) pra não colidir com o painel ADM. */
function renderTimeAtividades(){
  var kEl=document.getElementById('time-ativ-kpis');if(kEl)kEl.innerHTML='<div class="est">Carregando...</div>';
  loadAllActivitiesAdmin(function(all){
    all=all.filter(function(a){return !_admAtivIsOrphan(a);}); // [FIX 20260820]
    var users=getDepartmentVisibleUsers(S&&S.userId);
    var visibleIds={};users.forEach(function(u){visibleIds[u.id]=true;});
    var scoped=all.filter(function(a){return visibleIds[a.userId];});
    _admAtivAll=scoped; /* estado compartilhado com o painel ADM — ok, só uma página fica visível por vez */
    _drawAdmAtivKpis(scoped,'time-ativ-kpis');
    _drawAdmAtivPorConsultor(scoped, users, 'time-ativ-cons','time-ativ-row-','time-ativ-body-');
  });
}

function _drawAdmAtivKpis(all,kpiId){
  var late=0,v24=0,v48=0,fut=0;
  all.forEach(function(a){var c=_admAtivClassify(a);if(c==='atrasada')late++;else if(c==='vence24')v24++;else if(c==='vence48')v48++;else if(c==='futura')fut++;});
  var kEl=document.getElementById(kpiId||'adm-ativ-kpis');if(!kEl)return;
  kEl.innerHTML=[{v:late,l:'Atrasadas',cls:'late'},{v:v24,l:'Vencem em 24h',cls:'soon24'},{v:v48,l:'Vencem em 48h',cls:'soon48'},{v:fut,l:'Futuras',cls:'future'}]
    .map(function(k){return '<div class="ativ-kpi '+k.cls+'"><div class="ativ-kpi-v">'+k.v+'</div><div class="ativ-kpi-l">'+k.l+'</div></div>';}).join('');
}

var _ativRowPrefix='ativ-row-', _ativBodyPrefix='ativ-body-';
function _drawAdmAtivPorConsultor(all, users, consId, rowPrefix, bodyPrefix){
  var el=document.getElementById(consId||'adm-ativ-cons');if(!el)return;
  rowPrefix=rowPrefix||'ativ-row-'; bodyPrefix=bodyPrefix||'ativ-body-';
  /* guarda os prefixos ativos pra toggleAtivConsultor/_drawAtivDetail usarem —
     só uma página (ADM ou Time) fica visível por vez, então isso é seguro. */
  _ativRowPrefix=rowPrefix; _ativBodyPrefix=bodyPrefix;
  if(!users.length){el.innerHTML='<div class="act-empty">Nenhum consultor.</div>';return;}
  el.innerHTML=users.map(function(u){
    var mine=all.filter(function(a){return a.userId===u.id;});
    var late=mine.filter(function(a){return _admAtivClassify(a)==='atrasada';}).length;
    var soon=mine.filter(function(a){var c=_admAtivClassify(a);return c==='vence24'||c==='vence48';}).length;
    var uidJs=_jsSq(u.id),uidAttr=_htmlAttr(u.id);
    return '<div class="adm-user-row" id="'+rowPrefix+uidAttr+'"><div class="adm-user-row-hd" tabindex="0" role="button" onclick="toggleAtivConsultor(\''+uidJs+'\')"><div class="nav-av" style="background:'+AVB[u.cor%AVB.length]+';width:30px;height:30px;font-size:.75rem;flex-shrink:0">'+u.nome.charAt(0).toUpperCase()+'</div><div><div style="font-weight:600;font-size:.82rem">'+eH(u.nome)+'</div><div class="ativ-cons-summary">'+(late?'<span class="ativ-cons-tag late">'+late+' atrasada'+(late>1?'s':'')+'</span>':'')+(soon?'<span class="ativ-cons-tag soon">'+soon+' a vencer</span>':'')+(!late&&!soon?'<span style="color:var(--mu)">Em dia</span>':'')+'</div></div><span class="adm-user-chevron">▾</span></div><div class="adm-user-body" id="'+bodyPrefix+uidAttr+'"></div></div>';
  }).join('');
}

function toggleAtivConsultor(uid){
  var row=document.getElementById(_ativRowPrefix+uid);if(!row)return;
  var body=document.getElementById(_ativBodyPrefix+uid);
  var opening=!row.classList.contains('open');
  row.classList.toggle('open');
  if(opening&&body)_drawAtivDetail(uid,body);
}

function _drawAtivDetail(uid,body){
  var mine=_admAtivAll.filter(function(a){return a.userId===uid;});
  var byTime=function(a,b){return (a.scheduledAt||'').localeCompare(b.scheduledAt||'');};
  var atrasadas=mine.filter(function(a){return _admAtivClassify(a)==='atrasada';}).sort(byTime);
  var aVencer=mine.filter(function(a){var c=_admAtivClassify(a);return c==='vence24'||c==='vence48';}).sort(byTime);
  var futuras=mine.filter(function(a){return _admAtivClassify(a)==='futura';}).sort(byTime);
  var limit=_ativFuturasLimit[uid]||25;
  var html=_admAtivSection('Atrasadas',atrasadas,'late',atrasadas.length)
    +_admAtivSection('A vencer (próximas 48h)',aVencer,'soon',aVencer.length)
    +_admAtivSection('Futuras',futuras,'future',limit,uid);
  body.innerHTML=html||'<div class="act-empty">Nenhuma atividade pendente.</div>';
}

function _admAtivSection(titulo,list,cls,limit,uidForMore){
  if(!list.length)return '';
  var shown=list.slice(0,limit);
  var im={call:'📞',meet:'📅',task:'✅',note:'📋'};
  var html='<div class="ativ-section-title">'+titulo+' ('+list.length+')</div>';
  html+=shown.map(function(a){
    var ic=im[a.type]||'📋';
    var dt=a.scheduledAt?_formatScheduledAt(a.scheduledAt,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
    return '<div class="ativ-row '+cls+'"><div class="ativ-row-top"><span class="ativ-ic">'+ic+'</span><span class="ativ-desc">'+eH(a.desc)+'</span><span class="ativ-time'+(cls==='late'?' late-txt':'')+'">'+dt+'</span></div>'+(a.clientNome?'<div class="ativ-row-sub">'+(a.board==='negocios'?'Negócio':'Lead')+': '+eH(a.clientNome)+'</div>':'')+'</div>';
  }).join('');
  if(list.length>limit)html+='<button class="ativ-showmore" onclick="expandAtivFuturas(\''+_jsSq(uidForMore)+'\')">Mostrar mais '+(list.length-limit)+'</button>';
  return html;
}

function expandAtivFuturas(uid){_ativFuturasLimit[uid]=(_ativFuturasLimit[uid]||25)+25;var body=document.getElementById(_ativBodyPrefix+uid);if(body)_drawAtivDetail(uid,body);}
