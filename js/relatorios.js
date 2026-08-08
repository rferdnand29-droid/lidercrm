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
  if(tab==='metrics')renderAdmMetrics();
  if(tab==='clientes')renderAdmTable();
  if(tab==='automacoes')loadAutomationRulesRemote(function(){renderAutoRules();});
  if(tab==='feed'){renderAdmLigacoes();renderAdmFeed();}
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
  if(tab==='metrics')renderTimeMetrics();
  if(tab==='clientes')renderTimeTable();
  if(tab==='feed'){renderTimeLigacoes();renderTimeFeed();}
}

// Usa a mesma autorização que liberou a página Time na navegação.
// Antes, Time podia estar visível por escopo de departamento, mas seus renderizadores
// abortavam por exigir apenas hasSupervisorAccess(), deixando a primeira aba vazia.
function _timePageAllowed(){
  try{if(typeof _lfTimeTabAllowed==='function')return _lfTimeTabAllowed();}catch(_e){}
  return hasSupervisorAccess();
}

function _renderTableInto(users, tbId){
  var tb=document.getElementById(tbId);if(!tb)return;
  var rows=[];
  users.forEach(function(u){getCliLocal(u.id).forEach(function(c){var uIdJs=_jsSq(u.id),cIdJs=_jsSq(c.id);rows.push('<tr><td><span style="cursor:pointer;color:var(--al)" onclick="admOpenTimeline(\''+uIdJs+'\',\''+cIdJs+'\')">'+eH(c.nome)+'</span></td><td>'+eH(u.nome.split(' ')[0])+'</td>'+(c.steps||[]).slice(0,7).map(function(s){return '<td>'+(s?'<span style="color:var(--ok)">✓</span>':'<span style="color:var(--m2)">·</span>')+'</td>';}).join('')+'</tr>');});});
  tb.innerHTML=rows.join('')||'<tr><td colspan="9" class="est">Sem clientes</td></tr>';
}

function renderAdmTable(){
  var users=getUsers().filter(function(u){return u.ativo!==false;});
  _renderTableInto(users, 'atbody');
}

function renderTimeTable(){
  var users=getDepartmentVisibleUsers(S&&S.userId);
  _renderTableInto(users, 'time-atbody');
}

/* FIX (2026-08-03): extraído de renderAdmMetrics pra ser reaproveitado
   também pela aba Time (supervisor de departamento) — mesma conta,
   ids de destino diferentes por contexto, e a lista de usuários agora
   é parametrizável (getDepartmentVisibleUsers pro supervisor, getUsers
   pro ADM, que já era o comportamento antigo). */
function _renderMetricsInto(users, ids){
  ids = ids || {global:'adm-kpi-global', perUser:'adm-per-user', krow:'kadm', funil:'fadm', psvg:'padm', pleg:'ladm'};
  var tot=0,ag=0,fec=0,nsh=0;
  users.forEach(function(u){var clis=getCliLocal(u.id);tot+=clis.length;clis.forEach(function(c){if(c.steps&&c.steps[0])ag++;if(c.steps&&c.steps[6])fec++;});var kbn=getKBFor('negocios',u.id);nsh+=kbn.filter(function(c){return c.col==='noshow'||c.col==='desist';}).length;});
  var fecKB=0;users.forEach(function(u){fecKB+=getKBFor('negocios',u.id).filter(function(c){return c.col==='fechado';}).length;});fec=Math.max(fec,fecKB);
  var tx=ag>0?Math.round(fec/ag*100):0;
  var ke=document.getElementById(ids.global);
  if(ke)ke.innerHTML=[{v:tot,l:'Clientes'},{v:ag,l:'Agendamentos'},{v:fec,l:'Fechamentos'},{v:tx+'%',l:'Taxa'},{v:nsh,l:'No-Show/Desistencia'}].map(function(k){return '<div class="adm-kpi"><div class="adm-kpi-v">'+k.v+'</div><div class="adm-kpi-l">'+k.l+'</div></div>';}).join('');
  var pu=document.getElementById(ids.perUser);if(!pu)return;
  pu.innerHTML=users.map(function(u){
    var clis=getCliLocal(u.id);var ag2=clis.filter(function(c){return c.steps&&c.steps[0];}).length;var fec2=clis.filter(function(c){return c.steps&&c.steps[6];}).length;
    var kbn=getKBFor('negocios',u.id);var kbF=kbn.filter(function(c){return c.col==='fechado';}).length;var kbN=kbn.filter(function(c){return c.col==='noshow'||c.col==='desist';}).length;var kbA=kbn.filter(function(c){return c.col==='aprov';}).length;var kbR=kbn.filter(function(c){return c.col==='retag';}).length;
    var fecEff=Math.max(fec2,kbF);
    var tx2=ag2>0?Math.round(fecEff/ag2*100):0;
    var uIdJs=_jsSq(u.id),uInit=eH((u.nome||'?').charAt(0).toUpperCase());
    return '<div class="adm-user-row"><div class="adm-user-row-hd" onclick="this.parentElement.classList.toggle(\'open\')" tabindex="0" role="button"><div class="nav-av" style="background:'+AVB[u.cor%AVB.length]+';width:30px;height:30px;font-size:.75rem;flex-shrink:0">'+uInit+'</div><div><div style="font-weight:600;font-size:.82rem">'+eH(u.nome)+'</div><div style="font-size:.6rem;color:var(--mu)">'+eH(u.cargo||'Consultor')+'</div></div><span class="adm-user-chevron">▾</span></div><div class="adm-user-body"><div class="adm-mini-kpi">'+[{v:clis.length,l:'Clientes'},{v:ag2,l:'Agend.'},{v:fecEff,l:'Fecham.'},{v:tx2+'%',l:'Taxa'},{v:kbN,l:'No-Show/Desist.'},{v:kbA,l:'Aprovados'},{v:kbR,l:'A Retornar'}].map(function(k){return '<div class="adm-mini-k"><div class="adm-mini-v">'+k.v+'</div><div class="adm-mini-l">'+k.l+'</div></div>';}).join('')+'</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="transfer-btn" onclick="admViewBoard(\'leads\',\''+uIdJs+'\')">Leads</button><button class="transfer-btn" onclick="admViewBoard(\'negocios\',\''+uIdJs+'\')">Negocios</button></div></div></div>';
  }).join('')||'<div class="act-empty">Nenhum consultor.</div>';
  var allC=[];users.forEach(function(u){allC=allC.concat(getCliLocal(u.id));});
  if(allC.length)drawAnal(allC,ids.krow,ids.funil,ids.psvg,ids.pleg,null);
}

function renderAdmMetrics(){
  var users=getUsers().filter(function(u){return u.ativo!==false;});
  _renderMetricsInto(users);
}

function renderTimeMetrics(){
  var users=getDepartmentVisibleUsers(S&&S.userId);
  _renderMetricsInto(users, {global:'time-kpi-global', perUser:'time-per-user', krow:'time-kadm', funil:'time-fadm', psvg:'time-padm', pleg:'time-ladm'});
}

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


function renderAdmLigacoes(){
  var users=getUsers().filter(function(u){return u.ativo!==false;});
  _renderLigacoesInto(users, {list:'adm-lig-list', rowPrefix:'adm-lig-row-', gridPrefix:'adm-lig-grid-', cntPrefix:'adm-lig-cnt-'});
}

function renderTimeLigacoes(){
  var users=getDepartmentVisibleUsers(S&&S.userId);
  _renderLigacoesInto(users, {list:'time-lig-list', rowPrefix:'time-lig-row-', gridPrefix:'time-lig-grid-', cntPrefix:'time-lig-cnt-'});
}

function _renderLigacoesInto(users, ids){
  var el=document.getElementById(ids.list);if(!el)return;
  if(!users.length){el.innerHTML='<div class="act-empty">Nenhum consultor.</div>';return;}
  // Calcula somatória total de ligações de todos os consultores hoje
  var _ligTotal=0;
  users.forEach(function(u){_ligTotal+=getLigToday(u.id).length;});
  var _horaAtual=new Date().getHours();
  var _horaInicio=8; // expediente começa às 8h
  var _horasTrab=Math.max(1,_horaAtual-_horaInicio);
  var _media=(_ligTotal/_horasTrab).toFixed(1);
  var _metaDiaria=users.length*80; // 2026-08-06: meta ajustada a pedido do usuário — era 10, agora 80 ligações por consultor
  var _progPct=Math.min(100,Math.round(_ligTotal/_metaDiaria*100));
  // Card de resumo no topo
  var resumoHTML='<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">'
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
    +'<div style="background:var(--bg3);border-radius:6px;height:7px;overflow:hidden;margin-bottom:14px">'
    +'<div style="height:100%;width:'+_progPct+'%;background:linear-gradient(90deg,var(--bd),var(--bl));border-radius:6px;transition:width .6s"></div>'
    +'</div>';
  el.innerHTML=resumoHTML+users.map(function(u){var uIdAttr=eH(u.id);return '<div class="adm-lig-row" id="'+ids.rowPrefix+uIdAttr+'" style="margin-bottom:10px;padding:10px;border:1px solid var(--b1);border-radius:10px"><div style="font-size:.78rem;font-weight:600;margin-bottom:6px">'+eH(u.nome)+' <span style="color:var(--mu);font-weight:400" id="'+ids.cntPrefix+uIdAttr+'"></span></div><div class="lig-grid" id="'+ids.gridPrefix+uIdAttr+'" style="grid-template-columns:repeat(10,1fr);max-width:320px"></div></div>';}).join('');
  users.forEach(function(u){
    var root=window.LiderCRM;
    var wc=root&&root.api&&root.api.workerClient;
    if(root&&root.config&&root.config.useWorkerApi&&wc&&typeof wc.ligacoesList==='function'){
      wc.ligacoesList(u.id,today()).then(function(doc){
        _drawAdmLigRow(u,(doc&&doc.list)||getLigToday(u.id),ids);
      }).catch(function(){_drawAdmLigRow(u,getLigToday(u.id),ids);});
    }else if(DB_MODE==='firebase'&&db){
      db.collection('ligacoes').doc(u.id+'_'+today()).get().then(function(d){
        var list=(d.exists&&d.data().list)?d.data().list:[];
        _drawAdmLigRow(u,list,ids);
      }).catch(function(){_drawAdmLigRow(u,getLigToday(u.id),ids);});
    }else{_drawAdmLigRow(u,getLigToday(u.id),ids);}
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
  var cnt=document.getElementById(ids.cntPrefix+u.id);if(cnt)cnt.textContent='('+list.length+'/10 ligacoes)';
}

// Cache do último feed carregado (usado pela busca/filtro sem precisar rebuscar a cada tecla)
var _admFeedCache=[];

var _admFeedCanal=null;
var _admFeedUserId=null;
/* Contexto ativo dos ids do Feed — só uma página (ADM ou Time) fica
   visível por vez, então trocar esses valores ao entrar em cada uma
   é seguro (mesmo padrão de _ativRowPrefix/_ativBodyPrefix acima). */
var _feedIds={list:'adm-feed-list', userSel:'adm-feed-user-filter', search:'adm-feed-search', canalWrap:'adm-feed-canal-filters'};
/* Quando não-nulo, restringe o feed a essas ids de usuário (aba Time,
   escopado por getDepartmentVisibleUsers). null = sem restrição (ADM). */
var _feedScopedUserIds=null;

function _admFeedRenderUserOptions(){
  var sel=document.getElementById(_feedIds.userSel);if(!sel)return;
  var cur=_admFeedUserId||'';
  var users=(getUsers()||[]).filter(function(u){
    if(!u||u.ativo===false)return false;
    return !_feedScopedUserIds || _feedScopedUserIds[u.id];
  }).slice().sort(function(a,b){
    return String((a&&a.nome)||'').localeCompare(String((b&&b.nome)||''),'pt-BR');
  });
  sel.innerHTML='<option value="">Todos os usuários</option>'+users.map(function(u){
    return '<option value="'+eH(u.id)+'">'+eH(u.nome||u.id)+'</option>';
  }).join('');
  sel.value=cur;
}

function admFeedFilterUser(uid){
  _admFeedUserId=uid||null;
  _admFeedRenderList();
}

function renderAdmFeed(){
  _feedIds={list:'adm-feed-list', userSel:'adm-feed-user-filter', search:'adm-feed-search', canalWrap:'adm-feed-canal-filters'};
  _feedScopedUserIds=null;
  _renderFeedCommon();
}

/* FIX (2026-08-03): aba Time (supervisor de departamento) — mesmo
   feed, mas restrito a quem getDepartmentVisibleUsers retorna (senão
   um supervisor veria movimentações de gente de outros departamentos,
   já que o feed em si é global). */
function renderTimeFeed(){
  var users=getDepartmentVisibleUsers(S&&S.userId);
  var ids={};users.forEach(function(u){ids[u.id]=true;});
  _feedIds={list:'time-feed-list', userSel:'time-feed-user-filter', search:'time-feed-search', canalWrap:'time-feed-canal-filters'};
  _feedScopedUserIds=ids;
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
  if(root&&root.config&&root.config.useWorkerApi&&wc&&typeof wc.feedList==='function'){
    // Fase 3.4: GET /api/v1/feed já devolve os eventos (um doc por evento) ordenados
    // por "ts" desc — reordena de novo aqui só por segurança/consistência com o ramo
    // de baixo, e cacheia local pra leituras instantâneas (getFeed()).
    wc.feedList(200).then(function(list){
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
      // Faz a limpeza (mantém só as 200 mais recentes) só quando necessário, aqui — não a
      // cada evento — para não reintroduzir o overwrite concorrente de logFeedEvent().
      if(feed.length>200)saveFeed(feed);else ss(FEED_KEY,feed);
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

function _admFeedRenderList(){
  var el=document.getElementById(_feedIds.list);if(!el)return;
  var users=getUsers();
  var sel=document.getElementById(_feedIds.userSel);
  if(sel)_admFeedUserId=sel.value||null;
  var q=((document.getElementById(_feedIds.search)||{}).value||'').toLowerCase().trim();
  var feed=_admFeedCache.filter(function(f){
    if(_feedScopedUserIds && !_feedScopedUserIds[f.byId])return false;
    if(_admFeedCanal&&f.canal!==_admFeedCanal)return false;
    if(_admFeedUserId&&f.byId!==_admFeedUserId)return false;
    if(!q)return true;
    var hay=((f.byName||'')+' '+(f.itemName||'')+' '+(f.detail||'')).toLowerCase();
    return hay.indexOf(q)>=0;
  });
  if(!feed.length){el.innerHTML='<div class="act-empty">'+(q||_admFeedCanal||_admFeedUserId?'Nenhuma movimentação encontrada para esse usuário/busca/filtro.':'Nenhuma movimentacao ainda.')+'</div>';return;}
  var tL={move:'moveu',create:'criou',discard:'descartou',login:'entrou',delete:'excluiu permanentemente',note:'anexou',obj_edit:'editou a objeção',obj_delete:'excluiu a objeção'};
  el.innerHTML=feed.slice(0,60).map(function(f){
    var u=users.find(function(x){return x.id===f.byId;});var bg=AVB[(u?u.cor:0)%AVB.length];
    var dt=new Date(f.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    var isDel=(f.type==='delete'||f.type==='obj_delete');
    var isObjEdit=f.type==='obj_edit';
    var avInit=eH((f.byName||'?').charAt(0).toUpperCase());
    var av=isDel?'<div class="adm-feed-av" style="background:rgba(194,32,38,.18);color:var(--rl)">❌</div>':isObjEdit?'<div class="adm-feed-av" style="background:rgba(58,159,224,.18);color:var(--bl)">✏️</div>':'<div class="adm-feed-av" style="background:'+bg+'">'+avInit+'</div>';
    var canalLbl=eH(CANAL_FEED_LBL[f.canal]||f.canal||'');
    var canalTag=f.canal?' <span style="font-size:.58rem;padding:1px 6px;border-radius:20px;background:var(--bg3);color:var(--mu);white-space:nowrap">'+canalLbl+'</span>':'';
    var typeLbl=eH(tL[f.type]||f.type||'');
    return '<div class="adm-feed-item">'+av+'<div class="adm-feed-body"><div class="adm-feed-txt"><strong>'+eH((f.byName||'?').split(' ')[0])+'</strong> '+typeLbl+' <strong>'+eH(f.itemName||'')+'</strong>'+(f.detail?' - '+eH(f.detail):'')+canalTag+'</div><div class="adm-feed-time">'+dt+'</div></div></div>';
  }).join('');
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
  if(_timeViewUid&&users.every(function(u){return u.id!==_timeViewUid;}))_timeViewUid=null;
  var html='<span style="font-size:.65rem;color:var(--mu);margin-right:4px">Ver:</span><button class="kb-cons-chip'+(_timeViewUid===null?' on':'')+'" onclick="setTimeConsFilter(null,this)">Todos</button>';
  users.forEach(function(u){var uidJs=_jsSq(u.id);html+='<button class="kb-cons-chip'+(_timeViewUid===u.id?' on':'')+'" onclick="setTimeConsFilter(\''+uidJs+'\',this)">'+eH(u.nome.split(' ')[0])+'</button>';});
  el.innerHTML=html;
}

function setTimeConsFilter(uid,btn){
  _timeViewUid=uid||null;
  var bar=document.getElementById('time-cons-bar');
  if(bar)bar.querySelectorAll('.kb-cons-chip').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
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

/* Ranking comparativo do time (modo "Todos"). Reusa a mesma fórmula de
   reconciliação de renderAdmMetrics (Math.max entre cli/steps[6] e
   kb negocios/col==='fechado') pra não duplicar fechamento. */
function _drawTimeRanking(users){
  var el=document.getElementById('time-ranking');if(!el)return;
  if(!users.length){el.innerHTML='<div class="act-empty">Nenhum consultor visível.</div>';return;}
  var rows=users.map(function(u){
    var clis=(typeof getCliLocal==='function')?getCliLocal(u.id):[];
    var ag=clis.filter(function(c){return c.steps&&c.steps[0];}).length;
    var fecCli=clis.filter(function(c){return c.steps&&c.steps[6];}).length;
    var negs=(typeof getKBFor==='function')?getKBFor('negocios',u.id):[];
    var fecKB=negs.filter(function(c){return c.col==='fechado';}).length;
    var fec=Math.max(fecCli,fecKB);
    var tx=ag>0?Math.round(fec/ag*100):0;
    var valor=negs.filter(function(c){return c.col==='fechado';}).reduce(function(s,c){return s+(parseFloat(c.valor)||0);},0);
    var uidJs=(typeof _jsSq==='function')?_jsSq(u.id):u.id;
    var nomeCurto=(u.nome||'?').split(' ')[0];
    var fmt=(typeof fmtBRL==='function')?fmtBRL(valor):('R$ '+valor);
    return {u:u,ag:ag,fec:fec,tx:tx,valor:valor,fmt:fmt,uidJs:uidJs,nomeCurto:nomeCurto};
  }).sort(function(a,b){return (b.fec-a.fec)||(b.tx-a.tx)||(b.valor-a.valor);});
  el.innerHTML=rows.map(function(r,i){
    var medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':((i+1)+'º');
    return '<div class="adm-kpi" style="cursor:pointer" onclick="setTimeConsFilter(\''+r.uidJs+'\',null)" title="Ver analytics completo de '+eH(r.u.nome)+'">'
      +'<div class="adm-kpi-v" style="font-size:.95rem">'+medal+' '+eH(r.nomeCurto)+'</div>'
      +'<div class="adm-kpi-l">'+r.ag+' agend. · '+r.fec+' fech. · '+r.tx+'% · '+r.fmt+'</div>'
      +'</div>';
  }).join('');
}

/* Soma leads/negócios/fechamentos por consultor para o resumo de KPIs no topo da página Time. */
function _timeKpisHTML(users){
  var totLeads=0,totNeg=0,totFech=0;
  var rows=users.map(function(u){
    var leads=getKBFor('leads',u.id);
    var negs=getKBFor('negocios',u.id);
    var fech=negs.filter(function(c){return c.col==='fechado';}).length;
    totLeads+=leads.length;totNeg+=negs.length;totFech+=fech;
    return '<div class="adm-kpi"><div class="adm-kpi-v">'+leads.length+' / '+negs.length+' / '+fech+'</div><div class="adm-kpi-l">'+eH(u.nome.split(' ')[0])+' — Leads/Neg./Fech.</div></div>';
  });
  var resumo='<div class="adm-kpi"><div class="adm-kpi-v">'+totLeads+'</div><div class="adm-kpi-l">Total de Leads</div></div>'
    +'<div class="adm-kpi"><div class="adm-kpi-v">'+totNeg+'</div><div class="adm-kpi-l">Total de Negócios</div></div>'
    +'<div class="adm-kpi"><div class="adm-kpi-v">'+totFech+'</div><div class="adm-kpi-l">Total de Fechamentos</div></div>';
  return resumo+rows.join('');
}

function renderTimePage(){
  if(!_timePageAllowed())return;
  renderTimeConsFilter();
  _timeToggleBoards(false); // kanban somente-leitura permanece desligado por padrão (decisão: não expor movimentação de cards de outros consultores nessa tela)

  var allUsers=(typeof getDepartmentVisibleUsers==='function'?getDepartmentVisibleUsers(S&&S.userId):getUsers().filter(function(u){return u.ativo!==false;})).filter(function(u){return !S||u.id!==S.userId;});
  if(_timeViewUid&&allUsers.every(function(u){return u.id!==_timeViewUid;}))_timeViewUid=null;

  // Topo: resumo do time inteiro (quando "Todos") ou só do consultor selecionado.
  var targetUsers=_timeViewUid?allUsers.filter(function(u){return u.id===_timeViewUid;}):allUsers;
  var kpiEl=document.getElementById('time-kpis');if(kpiEl)kpiEl.innerHTML=_timeKpisHTML(targetUsers);

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
          try{ drawAnal(filtered,'time-krow','time-funil','time-psvg','time-pleg','time-metas'); }
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
  if(board==='leads'&&typeof _kbSeedLeadStageEnteredAt==='function')_kbSeedLeadStageEnteredAt(card,_kbMoveTs);
  /* CORREÇÃO 2026-08-06: "marcar No-Show não tira o card da contagem de
     atrasados". _kbHasOverdueLinkedActivity() só olha se existe uma
     atividade vinculada com scheduledAt vencido e done:false — nunca
     olha a ETAPA atual do card. Card ir pra uma etapa final (No-Show,
     Desistência, Descartado) não resolvia a atividade vinculada
     sozinho, então ela continuava "atrasada" pra sempre, mantendo a
     bolinha vermelha em Agenda mesmo sem nada pendente de verdade.
     Resolve aqui: ao entrar numa etapa de descarte, marca como
     concluída qualquer atividade vinculada a este card que ainda não
     tinha sido marcada — mesma ideia de actConfirmDone() (agenda.js),
     só que disparado pelo movimento de etapa em vez de um clique
     manual em "concluir". */
  if(typeof _kbIsDiscardStage==='function'&&_kbIsDiscardStage(board,newCol)){
    try{
      if(typeof getActivitiesLocalFor==='function'&&typeof lfSaveActivitiesFor==='function'){
        var _actList=getActivitiesLocalFor(uid)||[];
        var _actChanged=false;
        _actList.forEach(function(a){
          if(a&&!a.done&&String(a.clientId||'')===String(card.id||'')&&(!a.board||a.board===board)){
            a.done=true;a.doneAt=_kbMoveTs;_actChanged=true;
          }
        });
        if(_actChanged){
          lfSaveActivitiesFor(uid,_actList);
          if(typeof updateActBadge==='function')updateActBadge();
        }
      }
    }catch(_e){}
  }
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
        logFeedEvent('move',S.userId,c.name,'Responsavel: '+toUser.nome,board);
        if(toUid!==S.userId&&remoteOk){
          if(S&&S.userId){
            pushNotif(toUid,'transfer','🔄 "'+c.name+'" foi transferido para você por '+(S.nome||'?'),{cardId:c.id,board:board});
            /* 2026-08-07 (pedido do usuário): notificação de verdade
               (fora do app) pra movimentação de lead pra mim. */
            if(typeof sendRealPushNotif==='function')sendRealPushNotif(toUid,'🔄 Lider CRM',(S.nome||'Alguém')+' te passou o lead "'+c.name+'"',{cardId:c.id,board:board,type:'transfer'});
          }
        }
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
  if(_wcKb){
    Promise.all([
      _wcKb.kanbanList(board,toUid).then(function(doc){return (doc&&doc.list)||getKBFor(board,toUid);}).catch(function(){return getKBFor(board,toUid);}),
      _wcKb.kanbanList(board,fromUid).then(function(doc){return (doc&&doc.list)||arr;}).catch(function(){return arr;})
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
  var map={ja_comprou:'Já comprou',sem_interesse:'Sem interesse',em_tratativa:'Em tratativa'};
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
      if(S&&S.userId)logFeedEvent('delete',S.userId,c.name,'Descartado (exclusão) · '+reasonText,board);
      affected[board]=true;
      doneCount++;
      return;
    }
    var nextArr=arr.filter(function(x){return x.id!==item.id;});
    if(board==='leads'){
      var negArr=getKBFor('negocios',uid);
      var hadLinked=negArr.some(function(n){return n.originalLeadId===item.id;});
      if(hadLinked){
        var nextNegArr=negArr.filter(function(n){return n.originalLeadId!==item.id;});
        if(!saveKBFor('negocios',uid,nextNegArr))allOk=false;
        affected.negocios=true;
      }
    }
    if(!saveKBFor(board,uid,nextArr))allOk=false;
    if(S&&S.userId)logFeedEvent('delete',S.userId,c.name,'Excluído permanentemente · '+reasonText,board);
    affected[board]=true;
    doneCount++;
  });
  closeM('mo-delete-kb-reason');
  closeM('mo-kb-det');
  Object.keys(affected).forEach(function(board){renderKBLocal(board);});
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
  if(already){renderKBLocal('leads');return;}
  var targetCol=(opts&&opts.col&&KB_NEG_COLS.some(function(k){return k.id===opts.col;}))?opts.col:'retag';
  var negCard={id:'neg_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),name:c.name,tel:c.tel,nicho:c.nicho,col:targetCol,valor:(opts&&opts.valor)?(parseFloat(opts.valor)||0):0,obs:(opts&&opts.obs!=null)?opts.obs:(c.obs||''),createdAt:new Date().toISOString(),userId:uid,originalLeadId:c.id,attachments:[],historico:[]};
  _pushHistorico(negCard,'Negócio criado a partir do Lead (etapa inicial: "'+_colLabel('negocios',targetCol)+'")');
  negArr.push(negCard);
  var okConv=saveKBFor('negocios',uid,negArr);if(!okConv)_kbLastOpFailed=true;
  // CORREÇÃO (auditoria, motor de automação — gatilho 'card_created'): idem à criação manual
  // de card — o Negócio gerado aqui pela conversão também é um card novo (createdAt agora),
  // e sem rodar o motor na hora o gatilho 'card_created' (janela de 60s) quase sempre
  // expirava antes do próximo ciclo periódico do motor.
  if(okConv)runAutomationEngine('negocios',negArr,uid);
  renderKBLocal('leads');renderKBLocal('negocios');logFeedEvent('move',S.userId,c.name,'Lead -> Negocio','leads');
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
  var labels={upload:'Anexo adicionado',delete:'Anexo removido',rename:'Anexo renomeado',pin:'Anexo fixado',unpin:'Anexo desafixado'};
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
// ============================================================
var _admAtivAll=[],_ativFuturasLimit={}

function renderAdmAtividades(){
  var kEl=document.getElementById('adm-ativ-kpis');if(kEl)kEl.innerHTML='<div class="est">Carregando...</div>';
  loadAllActivitiesAdmin(function(all){
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
