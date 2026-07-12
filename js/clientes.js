/* =====================================================================
 * clientes.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

function ck(uid){return 'lf6_c_'+uid;}

function getCliLocal(uid){return sg(ck(uid))||[];}

function saveCli(uid,list){var okS=ss(ck(uid),list);if(DB_MODE==='firebase'&&db){syncBusy();db.collection('clientes').doc(uid).set({list:list,uid:uid,ts:Date.now()}).then(syncOk).catch(syncErr);}return okS;}

function renderTable(list){
  var filtered=list.filter(function(c){
    var st=c.status||STATUS_NORMAL;
    if(_dashTab==='normal'&&st!==STATUS_NORMAL&&st!==STATUS_ATENDIDO)return false;
    if(_dashTab==='atendido'&&st!==STATUS_ATENDIDO)return false;
    if(_dashTab==='remarcar'&&st!==STATUS_REMARCAR)return false;
    if(_dashTab==='noshow'&&st!==STATUS_NOSHOW)return false;
    if(_searchQ&&(c.nome||"").toLowerCase().indexOf(_searchQ)<0)return false;
    if(_fltNicho&&(c.nicho||'')!==_fltNicho)return false;
    if(_fltDate&&(c.data||'').slice(0,10)!==_fltDate)return false;
    if(_fltLate&&!_isOverdue(c))return false;
    return true;
  });
  var lb=document.getElementById('twt-label');
  if(lb){var labs={normal:'Clientes Ativos',atendido:'Atendimentos',remarcar:'Para Remarcar',noshow:'No-Shows'};lb.textContent=labs[_dashTab]||'Clientes';}
  var tb=document.getElementById('tbody');if(!tb)return;
  if(!filtered.length){tb.innerHTML='<tr><td colspan="9" class="est">Nenhum cliente.</td></tr>';return;}
  tb.innerHTML=filtered.map(function(c){
    var stp=ETP.map(function(_,i){var done=c.steps&&c.steps[i];var dcClass=done?(i===6?'cls':'done'):'pend';var tipDate=done&&c.stepDates&&c.stepDates[i]?' — '+new Date(c.stepDates[i]).toLocaleString('pt-BR'):'';var tipText=ETP[i]+tipDate;return '<td><div class="sd-wrap"><span class="sd '+dcClass+'" onclick="toggleStep(\''+c.id+'\','+i+')" title="'+ETP[i]+'">'+SLB[i]+'</span><div class="sd-tip">'+eH(tipText)+'</div></div></td>';}).join('');
    var sbadge='';if(c.status===STATUS_REMARCAR)sbadge='<span class="sbadge rem">Remarcar</span>';if(c.status===STATUS_NOSHOW)sbadge='<span class="sbadge nsh">No-Show</span>';
    return '<tr><td class="tdn" onclick="openTimeline(\''+c.id+'\')" style="cursor:pointer">'+eH(c.nome)+sbadge+'</td>'+stp+'<td><button class="bdl" aria-label="Remover cliente" onclick="openDelCli(\''+c.id+'\')">&#128465;</button></td></tr>';
  }).join('');
}

// Dashboard clientes CRUD
function openLancar(){openM('mo-l');}

function saveC(){
  var n=(document.getElementById('in-n').value||'').trim();
  var e=parseInt(document.getElementById('in-e').value,10)||1;
  if(!n){toast('Nome obrigatorio');return;}
  var list=getCliLocal(S.userId);
  var steps=Array(7).fill(false);for(var si=0;si<e;si++)steps[si]=true;
  var stepDates=Array(7).fill(null);var now=new Date().toISOString();for(var sj=0;sj<e;sj++)stepDates[sj]=now;
  list.push({id:'c'+Date.now()+'_'+Math.random().toString(36).slice(2,5),nome:n,steps:steps,stepDates:stepDates,data:now,status:STATUS_NORMAL,statusDates:{},obs:'',obsHistory:[],remarkHistory:[]});
  saveCli(S.userId,list);closeM('mo-l');document.getElementById('in-n').value='';renderDash();toast('Cliente lancado!');
  logFeedEvent('create',S.userId,n,'Dashboard','dashboard');
}

function toggleStep(cid,idx){var list=getCliLocal(S.userId);var c=list.find(function(x){return x.id===cid;});if(!c)return;if(!c.steps)c.steps=Array(7).fill(false);if(!c.stepDates)c.stepDates=Array(7).fill(null);c.steps[idx]=!c.steps[idx];c.stepDates[idx]=c.steps[idx]?new Date().toISOString():null;saveCli(S.userId,list);renderDash();}

function openDelCli(id){_dcId=id;var l=getCliLocal(S.userId);var c=l.find(function(x){return x.id===id;});var m=document.getElementById('dcmsg');if(m)m.textContent='Remover '+(c?c.nome:'')+' ?';openM('mo-dc');}

function closeDC(){closeM('mo-dc');_dcId=null;}

function confirmDC(){if(!_dcId)return;var l=getCliLocal(S.userId).filter(function(x){return x.id!==_dcId;});saveCli(S.userId,l);closeDC();renderDash();toast('Removido');}

function openMyModal(){openM('mo-c');document.getElementById('mch').textContent='Meus Clientes';loadCli(S.userId,function(l){var mcb=document.getElementById('mcb');if(mcb)mcb.innerHTML=l.length?l.map(function(c){return '<div style="padding:8px 0;border-bottom:1px solid var(--b1);font-size:.8rem">'+eH(c.nome)+'</div>';}).join(''):'<div class="est">Nenhum</div>';});}

// No-Show modal
function selNshOpt(n){_nshOpt=n;document.querySelectorAll('.nsh-radio').forEach(function(r){r.classList.remove('sel');});var el=document.getElementById('nsh-opt-'+n);if(el)el.classList.add('sel');var cb=document.getElementById('nsh-confirm-btn');if(cb)cb.disabled=false;}

function confirmNoShow(){
  if(!_nshCid||!_nshOpt)return;
  var list=getCliLocal(S.userId);var c=list.find(function(x){return x.id===_nshCid;});if(!c)return;
  var labels={1:'Sumiu',2:'Cancelou a reuniao'};
  if(!c.statusDates)c.statusDates={};if(!c.remarkHistory)c.remarkHistory=[];
  c.remarkHistory.push({n:(c.remarkHistory.length+1),steps:(c.steps||Array(7).fill(false)).slice(),stepDates:(c.stepDates||[]).slice(),motivo:STATUS_NOSHOW,virou:new Date().toISOString()});
  c.status=STATUS_NOSHOW;c.statusDates[STATUS_NOSHOW]=new Date().toISOString();c.nshMotivoLabel=labels[_nshOpt];c.steps=Array(7).fill(false);c.stepDates=Array(7).fill(null);
  saveCli(S.userId,list);closeM('mo-nsh');renderDash();toast('No-Show registrado');
}

// ============================================================
// TIMELINE
// ============================================================
function openTimeline(cid){
  var uid=_tlOwnerUid||S.userId;
  var list=getCliLocal(uid);var c=list.find(function(x){return x.id===cid;});if(!c)return;
  _tlCid=cid;
  document.querySelectorAll('#mo-tl .mo-tab-pane').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('#mo-tl .mo-tab').forEach(function(b){b.classList.remove('on');});
  var fp=document.getElementById('tl-pane-tl'),fb=document.querySelector('#mo-tl .mo-tab');if(fp)fp.classList.add('on');if(fb)fb.classList.add('on');
  document.getElementById('tl-nome').textContent=c.nome;
  var dt=c.data?_parseLocalDate(c.data).toLocaleString('pt-BR'):'';
  document.getElementById('tl-datacad').textContent=dt?'Cadastrado em '+dt:'';
  // Responsavel
  var rs=document.getElementById('tl-resp-sel');
  if(rs){var users=getUsers().filter(function(u){return u.id!=='adm'&&u.ativo;});var oUid=c.responsavelId||uid;rs.innerHTML=users.map(function(u){return '<option value="'+u.id+'"'+(u.id===oUid?' selected':'')+'>'+eH(u.nome.split(' ')[0])+'</option>';}).join('');rs.disabled=!hasAdminAccess();}
  // Status buttons
  var st=c.status||STATUS_NORMAL,btns='',cIdJs=_jsSq(c.id);
  if(st!==STATUS_REMARCAR)btns+='<button class="bstat rem" onclick="setCliStatus(\''+cIdJs+'\',\'remarcar\')">Remarcar</button>';else btns+='<button class="bstat rev" onclick="setCliStatus(\''+cIdJs+'\',\'remarcar\')">Desfazer Remarcar</button>';
  if(st!==STATUS_NOSHOW)btns+='<button class="bstat nsh" onclick="setCliStatus(\''+cIdJs+'\',\'noshow\')">No-Show</button>';else btns+='<button class="bstat rev" onclick="setCliStatus(\''+cIdJs+'\',\'noshow\')">Desfazer No-Show</button>';
  document.getElementById('tl-status-btns').innerHTML=btns;
  // Timeline body
  var sd=c.stepDates||[],html='<div class="tl2">';
  for(var i=0;i<ETP.length;i++){var done=c.steps&&c.steps[i];var dc=done?(i===6?'cls':'done'):'pend';var last=i===ETP.length-1;html+='<div class="tl2-item"><div class="tl2-left"><div class="tl2-dot '+dc+'"></div>'+(last?'':'<div class="tl2-line"></div>')+'</div><div class="tl2-content"><div class="tl2-label'+(done?'':' pend')+'">'+(done?'<span style="color:var(--ok)">✓</span> ':'')+ETP[i]+'</div>'+(done&&sd[i]?'<div class="tl2-date">'+new Date(sd[i]).toLocaleString('pt-BR')+'</div>':'<div class="tl2-date" style="color:var(--m2)">Pendente</div>')+'</div></div>';}
  if(c.status&&c.status!==STATUS_NORMAL&&c.statusDates&&c.statusDates[c.status]){var sL={atendido:'Atendimento',remarcar:'Remarcado',noshow:'No-Show'};html+='<div class="tl2-item"><div class="tl2-left"><div class="tl2-dot act"></div></div><div class="tl2-content"><div class="tl2-label">'+sL[c.status]+'</div><div class="tl2-date">'+new Date(c.statusDates[c.status]).toLocaleString('pt-BR')+'</div></div></div>';}
  if(c.respHistory&&c.respHistory.length){c.respHistory.forEach(function(rh){html+='<div class="tl2-item"><div class="tl2-left"><div class="tl2-dot sys"></div></div><div class="tl2-content"><div class="tl2-label" style="color:var(--bl)">Responsavel alterado</div><div class="tl2-note">De: '+eH(rh.from)+' - Para: '+eH(rh.to)+'</div><div class="tl2-date">'+new Date(rh.ts).toLocaleString('pt-BR')+'</div></div></div>';});}
  html+='</div>';document.getElementById('tl-body').innerHTML=html;
  renderTlActivities(c);
  document.getElementById('tl-obs').value=c.obs||'';document.getElementById('obs-saved-msg').textContent='';
  var oh=c.obsHistory||[],ohH='';
  if(oh.length>1){ohH='<div style="font-size:.65rem;color:var(--mu);margin-top:10px">Versoes anteriores:</div>';oh.slice().reverse().slice(1,4).forEach(function(o){ohH+='<div class="obs-note">'+eH(o.txt)+'<div class="obs-note-ts">'+new Date(o.ts).toLocaleString('pt-BR')+'</div></div>';});}
  document.getElementById('tl-obs-hist').innerHTML=ohH;
  var rh=c.remarkHistory||[],rmH='';
  if(!rh.length){rmH='<p style="color:var(--mu);font-size:.8rem">Nenhuma remarcacao.</p>';}
  else{var mL={remarcar:'Remarcado',noshow:'No-Show',normal:'Reativado',atendido:'Atendido'};rh.slice().reverse().forEach(function(r){var dH=ETP.map(function(_,i){var dn=r.steps&&r.steps[i];var cl=dn?(i===6?'cls':'done'):'pend';return '<span class="sd '+cl+'" style="font-size:.62rem">'+SLB[i]+'</span>';}).join('');rmH+='<div class="rem-item"><div class="rem-item-n">Ciclo '+r.n+' → '+(mL[r.motivo]||r.motivo)+'</div><div class="rem-item-steps">'+dH+'</div><div class="rem-item-date">'+new Date(r.virou).toLocaleString('pt-BR')+'</div></div>';});}
  document.getElementById('tl-rem-body').innerHTML=rmH;
  var af=document.getElementById('tl-act-form');if(af)af.classList.remove('open');
  openM('mo-tl');
}

function setCliStatus(cid,tipo){
  var uid=_tlOwnerUid||S.userId;var list=getCliLocal(uid);var c=list.find(function(x){return x.id===cid;});if(!c)return;
  if(!c.statusDates)c.statusDates={};
  if(c.status===tipo){c.status=STATUS_NORMAL;delete c.statusDates[tipo];}
  else{if(c.status&&c.status!==STATUS_NORMAL){if(!c.remarkHistory)c.remarkHistory=[];c.remarkHistory.push({n:(c.remarkHistory.length+1),steps:(c.steps||Array(7).fill(false)).slice(),stepDates:(c.stepDates||[]).slice(),motivo:tipo,virou:new Date().toISOString()});c.steps=Array(7).fill(false);c.stepDates=Array(7).fill(null);}c.status=tipo;c.statusDates[tipo]=new Date().toISOString();}
  saveCli(uid,list);renderDash();closeM('mo-tl');openTimeline(cid);
}

function autoSaveObs(){
  var uid=_tlOwnerUid||S.userId;var list=getCliLocal(uid);var c=list.find(function(x){return x.id===_tlCid;});if(!c)return;
  var txt=document.getElementById('tl-obs').value||'';if(!c.obsHistory)c.obsHistory=[];if(!c.obsHistory.length||c.obsHistory[c.obsHistory.length-1].txt!==txt)c.obsHistory.push({txt:txt,ts:new Date().toISOString()});c.obs=txt;saveCli(uid,list);
  var m=document.getElementById('obs-saved-msg');if(m){m.textContent='Salvo';setTimeout(function(){m.textContent='';},1500);}
}

function changeResponsible(newUid){
  var uid=_tlOwnerUid||S.userId;var list=getCliLocal(uid);var c=list.find(function(x){return x.id===_tlCid;});if(!c)return;var currentResp=c.responsavelId||uid;if(newUid===currentResp)return;
  var fromUser=getUser(uid),toUser=getUser(newUid);if(!toUser)return;
  if(!c.respHistory)c.respHistory=[];c.respHistory.push({from:fromUser?fromUser.nome:'?',fromId:uid,to:toUser.nome,toId:newUid,ts:new Date().toISOString(),by:S.nome});c.responsavelId=newUid;
  // Grava no destino ANTES de remover da origem (mesma correção do _kbTransferCard): evita
  // perder o cliente por completo se o armazenamento estiver cheio ao salvar no novo responsável.
  var newList=getCliLocal(newUid);newList.push(c);
  var okTo=saveCli(newUid,newList);
  var okFrom=okTo&&saveCli(uid,list.filter(function(x){return x.id!==_tlCid;}));
  if(!okTo)toast('⚠️ Não foi possível transferir — armazenamento local cheio.',4500);
  else if(!okFrom)toast('⚠️ Cliente duplicado temporariamente (falha ao remover da lista de origem) — armazenamento local cheio.',4500);
  else toast('Transferido para '+toUser.nome.split(' ')[0]);
  closeM('mo-tl');renderDash();
}

function admOpenTimeline(uid,cid){_tlOwnerUid=uid;var list=getCliLocal(uid);var c=list.find(function(x){return x.id===cid;});if(!c){toast('Nao encontrado');_tlOwnerUid=null;return;}openTimeline(cid);}
