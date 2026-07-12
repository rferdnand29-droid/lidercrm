/* =====================================================================
 * agenda.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// ============================================================
// ATIVIDADES
// ============================================================
var _actType='call',_tlActType='call',_qaType='call',_currentAlertId=null;

function actKey(){return 'lf13_acts_'+S.userId;}

function actKeyFor(uid){return 'lf13_acts_'+uid;}

function getActivities(){return sg(actKey())||[];}

function getActivitiesLocalFor(uid){return sg(actKeyFor(uid))||[];}

function saveActivities(list){ss(actKey(),list);if(DB_MODE==='firebase'&&db){syncBusy();db.collection('activities').doc(S.userId).set({list:list,ts:Date.now()}).then(syncOk).catch(syncErr);}}

// Busca as atividades de TODOS os consultores ativos (usado pelo painel do Administrador).
// Busca direto no Firestore por consultor (mesmo padrao usado em renderAdmLigacoes) e cai
// para o cache local de cada um se o Firestore estiver indisponivel.
function loadAllActivitiesAdmin(cb){
  var users=getUsers().filter(function(u){return u.id!=='adm'&&u.ativo;});
  if(!users.length){cb([]);return;}
  var results=[];var pending=users.length;
  function done(){pending--;if(pending<=0)cb(results);}
  users.forEach(function(u){
    if(DB_MODE==='firebase'&&db){
      db.collection('activities').doc(u.id).get().then(function(d){
        var list=(d.exists&&d.data().list)?d.data().list:getActivitiesLocalFor(u.id);
        ss(actKeyFor(u.id),list);
        results=results.concat(list);done();
      }).catch(function(){results=results.concat(getActivitiesLocalFor(u.id));done();});
    }else{results=results.concat(getActivitiesLocalFor(u.id));done();}
  });
}

function selActType(t,btn){_actType=t;document.querySelectorAll('#act-type-row .act-type-btn').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');}

function selTlActType(t,btn){_tlActType=t;document.querySelectorAll('#tl-act-types .tl-act-type-btn').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');}

function selQaType(t,btn){_qaType=t;document.querySelectorAll('#qa-types .qa-type').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');}

function createActivity(){
  var desc=(document.getElementById('act-inp').value||'').trim();if(!desc){toast('Descreva a atividade');return;}
  var sched=document.getElementById('act-sched').value||null;
  var list=getActivities();
  var act={id:'act_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),type:_actType,desc:desc,scheduledAt:sched,done:false,read:false,createdAt:new Date().toISOString(),userId:S.userId,clientId:null,clientNome:null};
  list.unshift(act);if(list.length>500)list=list.slice(0,500);saveActivities(list);
  document.getElementById('act-inp').value='';document.getElementById('act-sched').value='';
  if(sched){scheduleActAlert(act);scheduleNativeNotif(act);}
  renderActPanel();toast('Criada!');updateActBadge();
}

function openQuickActivity(){
  var board=_kbDetBoard,id=_kbDetId;if(!id||!board)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  var qn=document.getElementById('qa-nome');if(qn)qn.textContent=c.name;
  var qd=document.getElementById('qa-desc');if(qd)qd.value='';
  var d=new Date();d.setDate(d.getDate()+1);d.setHours(9,0,0,0);
  var qs=document.getElementById('qa-sched');if(qs)qs.value=d.toISOString().slice(0,16);
  _qaType='call';document.querySelectorAll('#qa-types .qa-type').forEach(function(b){b.classList.remove('on');});
  var f=document.querySelector('#qa-types .qa-type[data-t="call"]');if(f)f.classList.add('on');
  requestNotifPermission();openM('mo-quick-act');
}

function saveQuickActivity(){
  var desc=(document.getElementById('qa-desc').value||'').trim();if(!desc){toast('Descreva o lembrete');return;}
  var sched=document.getElementById('qa-sched').value;if(!sched){toast('Defina data e hora');return;}
  var board=_kbDetBoard,id=_kbDetId;
  if(!board||!id){toast('Erro: contexto do card perdido. Reabra o card e tente novamente.');return;}
  // CORREÇÃO (auditoria): usava activeUID(board) puro, que no modo "Todos" do ADM
  // (_kbViewUid[board] vazio) cai para S.userId (o próprio ADM), não o dono real do
  // card aberto no detalhe. Isso fazia o lembrete ser salvo silenciosamente na lista
  // pessoal do ADM (sem anexar ao card, que pertence a outro consultor) em vez de ser
  // atribuído ao dono correto — mesma classe de bug já corrigida em editKBFromDet/
  // deleteKBFromDet e nas demais ~15 funções que usam _kbDetOwnerUid.
  var uid=_kbDetOwnerUid||activeUID(board||'leads');
  var arr=board?getKBFor(board,uid):[];var c=arr.find(function(x){return x.id===id;});
  var assignedToOther=(uid&&uid!==S.userId);
  var act={id:'qa_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),type:_qaType,desc:desc,scheduledAt:sched,done:false,read:false,createdAt:new Date().toISOString(),userId:uid,clientId:id,clientNome:c?c.name:'',board:board};
  function _finishSave(){
    if(c){if(!c.activities)c.activities=[];c.activities.unshift({id:act.id,type:act.type,desc:act.desc,scheduledAt:sched,done:false,by:S.nome,byId:S.userId,createdAt:act.createdAt});saveKBFor(board,uid,arr);}
    if(assignedToOther)pushNotif(uid,'activity','🔔 Nova atividade atribuída por '+S.nome+': '+desc,{cardId:id,board:board});
    else{scheduleActAlert(act);scheduleNativeNotif(act);}
    closeM('mo-quick-act');updateActBadge();renderKBLocal(board);
    toast(assignedToOther?'Lembrete atribuído a outro consultor!':('Lembrete salvo para '+new Date(sched).toLocaleString('pt-BR')));
  }
  if(assignedToOther){
    // Busca a lista real do outro consultor no Firestore antes de acrescentar e salvar —
    // o cache local (getActivitiesLocalFor) normalmente está vazio/desatualizado neste
    // aparelho para um uid que não é o do usuário logado, o que sobrescrevia o documento
    // inteiro de atividades do destinatário com um único item (ver relatório de auditoria).
    if(DB_MODE==='firebase'&&db){
      db.collection('activities').doc(uid).get().then(function(d){
        var list=(d.exists&&d.data().list)?d.data().list:getActivitiesLocalFor(uid);
        list.unshift(act);ss(actKeyFor(uid),list);
        syncBusy();db.collection('activities').doc(uid).set({list:list,ts:Date.now()}).then(syncOk).catch(syncErr);
        _finishSave();
      }).catch(function(){
        var list=getActivitiesLocalFor(uid);list.unshift(act);ss(actKeyFor(uid),list);
        _finishSave();
      });
      return;
    }
    var list=getActivitiesLocalFor(uid);list.unshift(act);ss(actKeyFor(uid),list);
    _finishSave();
    return;
  }
  var list=getActivities();list.unshift(act);saveActivities(list);
  _finishSave();
}

function toggleActPanel(){
  var p=document.getElementById('act-panel');if(!p)return;
  var np=document.getElementById('ntf-panel');if(np)np.classList.remove('open'); // mutuamente exclusivo com Notificações
  p.classList.toggle('open');
  if(p.classList.contains('open')){renderActPanel();var acts=getActivities();acts.forEach(function(a){a.read=true;});saveActivities(acts);updateActBadge();}
}

/* Corrige bug de sobreposição: os painéis de Atividades e Notificações (dropdowns fixos
   no header) não fechavam ao clicar fora ou ao ativar outra função da página (ex: "Criar
   Negócio"), então ficavam flutuando por cima do conteúdo até o usuário clicar no X.
   Este listener único fecha qualquer um dos dois ao clicar/tocar fora deles. */
document.addEventListener('click',function(e){
  var act=document.getElementById('act-panel'),ntf=document.getElementById('ntf-panel');
  if(act&&act.classList.contains('open')&&!e.target.closest('#act-panel')&&!e.target.closest('#act-bell')&&!e.target.closest('#mtb-bell')){
    act.classList.remove('open');
  }
  if(ntf&&ntf.classList.contains('open')&&!e.target.closest('#ntf-panel')&&!e.target.closest('#ntf-bell')&&!e.target.closest('#mtb-ntf-bell')){
    ntf.classList.remove('open');
  }
},true);

function renderActPanel(){
  var el=document.getElementById('act-list');if(!el)return;
  var acts=getActivities();
  if(!acts.length){el.innerHTML='<div class="act-empty">Nenhuma atividade ainda.</div>';return;}
  var im={call:'📞',meet:'📅',task:'✅',note:'📋'};
  el.innerHTML='<div style="padding:6px 14px;border-bottom:1px solid var(--b1)"><button class="bc" style="font-size:.68rem;padding:4px 10px;width:auto" onclick="openActBulkEdit()">Editar em lote</button></div>'
    +acts.slice(0,30).map(function(a){
      var ic=im[a.type]||'📋';var lbl=(ACT_TYPES[a.type]||{lbl:a.type}).lbl;
      var dt=a.scheduledAt?new Date(a.scheduledAt).toLocaleString('pt-BR'):(a.createdAt?new Date(a.createdAt).toLocaleString('pt-BR'):'');
      var late=(a.scheduledAt&&!a.done&&new Date(a.scheduledAt)<new Date())?'<span style="color:var(--rl);font-size:.6rem"> Atrasada</span>':'';
      var client=a.clientNome?'<span style="color:var(--al);font-size:.63rem"> · '+eH(a.clientNome)+'</span>':'';
      var safeType=['call','meet','task','note'].indexOf(a.type)>=0?a.type:'task';var actIdJs=_jsSq(a.id);return '<div class="act-item'+(a.read?'':' unread')+'" style="'+(a.done?'opacity:.4;':'')+'" onclick="actItemClick(\''+actIdJs+'\')" tabindex="0" role="button"><div class="act-item-hd"><div class="act-ic '+safeType+'">'+ic+'</div><span class="act-item-name">'+lbl+client+'</span><span class="act-item-time">'+dt+'</span></div><div class="act-item-desc">'+eH(a.desc)+late+'</div>'+(a.done?'<div style="font-size:.61rem;color:var(--ok)">✓ Concluido</div>':'')+'</div>';
    }).join('');
}

function actItemClick(id){
  var acts=getActivities();var a=acts.find(function(x){return x.id===id;});if(!a)return;
  if(a.done)return;
  // Evita confirm() bloqueante (falha em iOS PWA standalone)
  var t=document.getElementById('toast'),tm=document.getElementById('tmsg');
  if(t&&tm){
    clearTimeout(t._tm);clearTimeout(t._confirmTm);
    tm.innerHTML='Marcar como conclu\u00edda? <button id="toast-act-done-btn" style="margin-left:8px;padding:2px 9px;border-radius:6px;border:none;background:var(--ok);color:#fff;font-size:.75rem;cursor:pointer;font-family:Outfit,sans-serif">Sim</button>';
    var btn=document.getElementById('toast-act-done-btn');
    if(btn){btn.dataset.actId=id;btn.addEventListener('click',function(){actConfirmDone(this.dataset.actId);},{once:true});}
    t.classList.add('show');
    t._confirmTm=setTimeout(function(){t.classList.remove('show');tm.textContent='';},4000);
  }
}

function actConfirmDone(id){
  var t=document.getElementById('toast');if(t){clearTimeout(t._confirmTm);t.classList.remove('show');}
  var acts=getActivities();var a=acts.find(function(x){return x.id===id;});if(!a||a.done)return;
  a.done=true;a.doneAt=new Date().toISOString();saveActivities(acts);renderActPanel();updateActBadge();toast('Concluída!');
}

function updateActBadge(){
  var acts=getActivities();var unread=acts.filter(function(a){return !a.read&&!a.done;}).length;
  var badge=document.getElementById('act-badge'),bell=document.getElementById('act-bell');if(!badge||!bell)return;
  if(unread>0){badge.classList.add('v');badge.textContent=unread>9?'9+':unread;bell.classList.add('ringing');setTimeout(function(){bell.classList.remove('ringing');},1400);}
  else badge.classList.remove('v');
}

var _actAlertTimers={}

function scheduleActAlert(act){
  if(!act.scheduledAt)return;
  var diff=new Date(act.scheduledAt).getTime()-Date.now();
  if(diff<0||diff>86400000)return;
  // Cancela timer anterior para esta atividade (evita acúmulo de setTimeout a cada ciclo de 60s)
  if(_actAlertTimers[act.id]){clearTimeout(_actAlertTimers[act.id]);delete _actAlertTimers[act.id];}
  _actAlertTimers[act.id]=setTimeout(function(){delete _actAlertTimers[act.id];showActAlert(act);},diff);
}

/* Notificação nativa do sistema (PC e celular), estilo "chegou mensagem no
   Messenger": som/alerta do próprio SO, aparece mesmo com a aba em segundo
   plano, e vibra no celular. Usada tanto para atividades atrasadas quanto
   para avisos internos (transferência de card, atribuição, automação). */
function fireNativeNotification(title,body,tag){
  try{
    if(navigator.vibrate)navigator.vibrate([200,100,200]);
    if('Notification' in window&&Notification.permission==='granted'){
      var n=new Notification(title,{body:body,tag:tag,requireInteraction:false,renotify:true});
      n.onclick=function(){try{window.focus();}catch(e){}n.close();};
    }
  }catch(e){}
}

function showActAlert(act){
  _currentAlertId=act.id;var bar=document.getElementById('act-alert-bar');if(!bar)return;
  var ic=(ACT_TYPES[act.type]||{ic:'🔔'}).ic;
  var body=(act.clientNome?act.clientNome+': ':'')+act.desc;
  var at=document.getElementById('act-alert-txt');if(at)at.textContent=ic+' '+body;
  var as2=document.getElementById('act-alert-sub');if(as2)as2.textContent='Agendado para '+new Date(act.scheduledAt).toLocaleString('pt-BR');
  bar.classList.add('show');
  var acts=getActivities();var a=acts.find(function(x){return x.id===act.id;});if(a){a.read=true;saveActivities(acts);updateActBadge();}
  fireNativeNotification('⏰ Atividade atrasada',body,'act-'+act.id);
}

function dismissAlert(){var bar=document.getElementById('act-alert-bar');if(bar)bar.classList.remove('show');_currentAlertId=null;}

function snoozeAlert(){
  var id=_currentAlertId;dismissAlert();if(!id)return;
  var acts=getActivities();var a=acts.find(function(x){return x.id===id;});if(!a)return;
  a.scheduledAt=new Date(Date.now()+600000).toISOString();saveActivities(acts);scheduleActAlert(a);toast('+10min');
}

// Antes só avisava atividades atrasadas até 5min após o horário (diff>-300000);
// se o usuário ficasse mais tempo sem abrir o app, a atividade nunca mais
// disparava aviso nenhum. Agora qualquer atividade vencida e ainda não lida
// dispara o aviso (uma vez só, pois showActAlert marca a.read=true).
function checkUpcomingActs(){var acts=getActivities();var now=Date.now();acts.forEach(function(a){if(!a.done&&a.scheduledAt){var diff=new Date(a.scheduledAt).getTime()-now;if(diff>0&&diff<86400000)scheduleActAlert(a);if(diff<=0&&!a.read)showActAlert(a);}});updateActBadge();}

function requestNotifPermission(){if('Notification' in window&&Notification.permission==='default')Notification.requestPermission();}

function scheduleNativeNotif(act){
  if(!('Notification' in window)||!act.scheduledAt)return;
  var diff=new Date(act.scheduledAt).getTime()-Date.now();if(diff<0||diff>7*24*3600000)return;
  setTimeout(function(){if(Notification.permission==='granted'){var ic=(ACT_TYPES[act.type]||{ic:'🔔'}).ic;new Notification('LIDER CRM - '+ic,{body:(act.clientNome?act.clientNome+': ':'')+act.desc,tag:act.id,requireInteraction:true});}},diff);
}

function toggleTlActForm(){var f=document.getElementById('tl-act-form');if(f)f.classList.toggle('open');}

function renderTlActivities(c){
  var el=document.getElementById('tl-ativ-list');if(!el)return;
  var acts=c.activities||[];
  if(!acts.length){el.innerHTML='<div class="act-empty">Nenhuma atividade.</div>';return;}
  var cIdJs=_jsSq(c.id);
  el.innerHTML=acts.map(function(a){
    var ic=(ACT_TYPES[a.type]||{ic:'📋'}).ic;var lbl=(ACT_TYPES[a.type]||{lbl:a.type}).lbl;
    var dt=a.createdAt?new Date(a.createdAt).toLocaleString('pt-BR'):'';
    var sched=a.scheduledAt?'<div style="font-size:.61rem;color:var(--al)">Agendado: '+new Date(a.scheduledAt).toLocaleString('pt-BR')+'</div>':'';
    var aIdJs=_jsSq(a.id);
    return '<div class="tl-act'+(a.done?' tl-act-done':'')+'"><div class="tl-act-hd"><span class="tl-act-ic">'+ic+'</span><span class="tl-act-type">'+lbl+'</span><span class="tl-act-by">'+eH(a.by||S.nome)+'</span>'+(a.done?'':'<button aria-label="Marcar como concluída" onclick="markTlActDone(\''+cIdJs+'\',\''+aIdJs+'\')" class="tl-done-btn">✓</button>')+'</div><div class="tl-act-txt">'+eH(a.desc)+'</div>'+sched+'<div class="tl2-date">'+dt+'</div></div>';
  }).join('');
}

function saveTlActivity(){
  var desc=(document.getElementById('tl-act-ta').value||'').trim();if(!desc){toast('Descreva');return;}
  var sched=document.getElementById('tl-act-sched').value||null;
  var uid=_tlOwnerUid||S.userId;var list=getCliLocal(uid);var c=list.find(function(x){return x.id===_tlCid;});if(!c)return;
  if(!c.activities)c.activities=[];
  var act={id:'a_'+Date.now(),type:_tlActType,desc:desc,scheduledAt:sched||null,done:false,by:S.nome,byId:S.userId,createdAt:new Date().toISOString()};
  c.activities.unshift(act);saveCli(uid,list);
  var acts=getActivities();acts.unshift({id:act.id,type:act.type,desc:act.desc,scheduledAt:sched||null,done:false,read:false,createdAt:act.createdAt,userId:S.userId,clientId:_tlCid,clientNome:c.nome});saveActivities(acts);
  if(sched){scheduleActAlert(acts[0]);scheduleNativeNotif(acts[0]);}
  renderTlActivities(c);toggleTlActForm();document.getElementById('tl-act-ta').value='';document.getElementById('tl-act-sched').value='';toast('Salvo!');
}

function markTlActDone(cid,actId){
  var uid=_tlOwnerUid||S.userId;var list=getCliLocal(uid);var c=list.find(function(x){return x.id===cid;});if(!c||!c.activities)return;
  var a=c.activities.find(function(x){return x.id===actId;});if(!a)return;a.done=true;a.doneAt=new Date().toISOString();
  saveCli(uid,list);var acts=getActivities();var ga=acts.find(function(x){return x.id===actId;});if(ga){ga.done=true;saveActivities(acts);}
  renderTlActivities(c);updateActBadge();toast('Concluida!');
}

// Bulk edit activities
var _actBulkSel=[];

var _actBulkFilter={board:'',stages:[],onlyLate:false}

/* Retorna a etapa atual (id da coluna) do card kanban ao qual a atividade está
   vinculada, olhando o quadro (leads/negocios) do próprio usuário logado — é
   sempre assim porque este modal só lista as atividades do usuário na sessão
   atual (getActivities() já é escopado por S.userId). Se a atividade não tiver
   quadro/card vinculado (ex: lembrete avulso), retorna null e ela só aparece
   quando nenhum filtro de etapa está ativo. */
var _actBulkStageCache={}

function _actBulkStageOf(a){
  if(!a.board||!a.clientId)return null;
  if(!_actBulkStageCache[a.board])_actBulkStageCache[a.board]=getKBFor(a.board,S.userId);
  var card=_actBulkStageCache[a.board].find(function(x){return x.id===a.clientId;});
  return card?card.col:null;
}

function openActBulkEdit(){
  _actBulkFilter={board:'',stages:[],onlyLate:false};
  var boardSel=document.getElementById('act-bulk-board-filter');if(boardSel)boardSel.value='';
  var lateChk=document.getElementById('act-bulk-only-late');if(lateChk)lateChk.checked=false;
  var descInp=document.getElementById('act-bulk-desc');if(descInp)descInp.value='';
  var dtInp=document.getElementById('act-bulk-dt');if(dtInp)dtInp.value='';
  _actBulkRenderStages();
  _actBulkRenderList();
  openM('mo-act-bulk');
}

function _actBulkOnBoardChange(){
  var sel=document.getElementById('act-bulk-board-filter');
  _actBulkFilter.board=sel?sel.value:'';
  _actBulkFilter.stages=[];
  _actBulkRenderStages();
  _actBulkRenderList();
}

function _actBulkOnLateChange(){
  var chk=document.getElementById('act-bulk-only-late');
  _actBulkFilter.onlyLate=chk?chk.checked:false;
  _actBulkRenderList();
}

function _actBulkRenderStages(){
  var wrap=document.getElementById('act-bulk-stage-wrap');if(!wrap)return;
  if(!_actBulkFilter.board){wrap.style.display='none';wrap.innerHTML='';return;}
  wrap.style.display='flex';
  wrap.innerHTML=kbCols(_actBulkFilter.board).map(function(col){
    var on=_actBulkFilter.stages.indexOf(col.id)>=0;
    return '<button type="button" class="act-bulk-stage-chip'+(on?' on':'')+'" onclick="_actBulkToggleStage(\''+col.id+'\')">'+eH(col.label)+'</button>';
  }).join('');
}

function _actBulkToggleStage(colId){
  var idx=_actBulkFilter.stages.indexOf(colId);
  if(idx>=0)_actBulkFilter.stages.splice(idx,1);else _actBulkFilter.stages.push(colId);
  _actBulkRenderStages();_actBulkRenderList();
}

function _actBulkRenderList(){
  _actBulkSel=[];_actBulkStageCache={};
  var el=document.getElementById('act-bulk-list');if(!el)return;
  var bar=document.getElementById('act-bulk-bar');if(bar)bar.style.display='none';
  var f=_actBulkFilter;
  var acts=getActivities().filter(function(a){
    if(a.done)return false;
    if(f.board&&a.board!==f.board)return false;
    if(f.stages.length&&f.stages.indexOf(_actBulkStageOf(a))<0)return false;
    if(f.onlyLate&&!(a.scheduledAt&&new Date(a.scheduledAt)<new Date()))return false;
    return true;
  });
  el.innerHTML=acts.map(function(a){
    var ic=(ACT_TYPES[a.type]||{ic:'📋'}).ic;
    var dt=a.scheduledAt?new Date(a.scheduledAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Sem data';
    var late=(a.scheduledAt&&new Date(a.scheduledAt)<new Date())?'⚠ ':'';
    var _stg=_actBulkStageOf(a);
    var boardLbl=a.board?(a.board==='leads'?'Lead':'Negócio')+(_stg?' · '+eH(_colLabel(a.board,_stg)):''):'';
    return '<label class="act-bulk-sel"><input type="checkbox" value="'+a.id+'" onchange="toggleActBulkSel(\''+a.id+'\')"><div class="act-bulk-sel-info"><div class="act-bulk-sel-desc">'+ic+' '+eH(a.desc)+'</div><div class="act-bulk-sel-meta">'+(a.clientNome?eH(a.clientNome)+' · ':'')+(boardLbl?boardLbl+' · ':'')+late+dt+'</div></div></label>';
  }).join('')||'<div class="act-empty">Nenhuma atividade encontrada com esse filtro.</div>';
}

function toggleActBulkSel(id){
  var idx=_actBulkSel.indexOf(id);if(idx>=0)_actBulkSel.splice(idx,1);else _actBulkSel.push(id);
  var bar=document.getElementById('act-bulk-bar');var cnt=document.getElementById('act-bulk-count');
  if(_actBulkSel.length){if(bar)bar.style.display='flex';if(cnt)cnt.textContent=_actBulkSel.length+' selecionada'+(_actBulkSel.length>1?'s':'');}
  else if(bar)bar.style.display='none';
}

function applyActBulkDate(){
  if(!_actBulkSel.length){toast('Selecione ao menos uma atividade');return;}
  var dt=document.getElementById('act-bulk-dt').value;if(!dt){toast('Selecione data/hora');return;}
  var acts=getActivities();_actBulkSel.forEach(function(id){var a=acts.find(function(x){return x.id===id;});if(a){a.scheduledAt=dt;a.read=false;}});
  saveActivities(acts);toast(_actBulkSel.length+' reagendadas!');_actBulkRenderList();updateActBadge();
}

function applyActBulkDesc(){
  if(!_actBulkSel.length){toast('Selecione ao menos uma atividade');return;}
  var descEl=document.getElementById('act-bulk-desc');var desc=(descEl&&descEl.value||'').trim();
  if(!desc){toast('Digite a nova especificação');return;}
  var acts=getActivities();var n=0;
  _actBulkSel.forEach(function(id){var a=acts.find(function(x){return x.id===id;});if(a){a.desc=desc;n++;}});
  saveActivities(acts);if(descEl)descEl.value='';
  toast(n+' atualizada'+(n>1?'s':'')+'!');_actBulkRenderList();updateActBadge();
}

function applyActBulkDone(){
  if(!_actBulkSel.length){toast('Selecione ao menos uma atividade');return;}
  var count=_actBulkSel.length;
  var acts=getActivities();
  _actBulkSel.forEach(function(id){var a=acts.find(function(x){return x.id===id;});if(a){a.done=true;a.doneAt=new Date().toISOString();}});
  saveActivities(acts);toast(count+' concluída'+(count>1?'s':'')+'!');_actBulkRenderList();updateActBadge();
}

function selectAllActs(){
  var cbs=document.querySelectorAll('#act-bulk-list input[type=checkbox]');_actBulkSel=[];
  cbs.forEach(function(cb){cb.checked=true;_actBulkSel.push(cb.value);});
  var bar=document.getElementById('act-bulk-bar');var cnt=document.getElementById('act-bulk-count');
  if(bar)bar.style.display='flex';if(cnt)cnt.textContent=_actBulkSel.length+' selecionadas';
}

function deleteActBulk(){
  var count=_actBulkSel.length;if(!count)return;
  _confirmModal({
    title:'🗑 Excluir atividades?',
    msg:'Excluir <strong>'+count+'</strong> atividade'+(count>1?'s':'')+' selecionada'+(count>1?'s':'')+' permanentemente?',
    okLabel:'Excluir',
    okClass:'bd',
    onOk:function(){
      var acts=getActivities().filter(function(a){return _actBulkSel.indexOf(a.id)<0;});
      saveActivities(acts);_actBulkSel=[];updateActBadge();_actBulkRenderList();toast('Excluidas!');
    }
  });
}

// ============================================================
// LIGAÇÕES COUNTER
// ============================================================
var _ligMarked=[],_ligWidgetOpen=false;

function ligKey(uid){return 'lf13_lig_'+(uid||S.userId)+'_'+today();}

function getLigToday(uid){return sg(ligKey(uid))||[];}

function saveLigToday(list,uid){var k=ligKey(uid);ss(k,list);if(DB_MODE==='firebase'&&db){syncBusy();db.collection('ligacoes').doc((uid||S.userId)+'_'+today()).set({list:list,uid:(uid||S.userId),date:today(),ts:Date.now()}).then(syncOk).catch(syncErr);}}

function initLigWidget(){
  var w=document.getElementById('lig-widget');if(!w)return;
  w.style.left='13px';w.style.top='120px';
  _ligMarked=getLigToday().map(function(r){return r.n;});
  buildLigGrid();
  var hd=document.getElementById('lig-drag-handle');if(!hd)return;
  var dragging=false,ox=0,oy=0;
  hd.addEventListener('mousedown',function(e){dragging=true;var r=w.getBoundingClientRect();ox=e.clientX-r.left;oy=e.clientY-r.top;e.preventDefault();});
  document.addEventListener('mousemove',function(e){if(!dragging)return;w.style.left=Math.max(0,Math.min(window.innerWidth-w.offsetWidth,e.clientX-ox))+'px';w.style.top=Math.max(56,Math.min(window.innerHeight-w.offsetHeight,e.clientY-oy))+'px';});
  document.addEventListener('mouseup',function(){dragging=false;});
  hd.addEventListener('touchstart',function(e){var t=e.touches[0];var r=w.getBoundingClientRect();ox=t.clientX-r.left;oy=t.clientY-r.top;},{passive:true});
  hd.addEventListener('touchmove',function(e){var t=e.touches[0];w.style.left=Math.max(0,Math.min(window.innerWidth-w.offsetWidth,t.clientX-ox))+'px';w.style.top=Math.max(56,Math.min(window.innerHeight-w.offsetHeight,t.clientY-oy))+'px';e.preventDefault();},{passive:false});
}

function buildLigGrid(){
  var g=document.getElementById('lig-grid');if(!g)return;g.innerHTML='';
  for(var i=1;i<=10;i++){(function(n){var cell=document.createElement('button');cell.className='lig-cell'+(_ligMarked.indexOf(n)>=0?' marked':'');cell.textContent=n;cell.addEventListener('click',function(){toggleLig(n);});g.appendChild(cell);})(i);}
  var cnt=_ligMarked.length;var lc=document.getElementById('lig-count');if(lc)lc.textContent=cnt;var fc=document.getElementById('lig-fab-count');if(fc)fc.textContent=cnt;
  if(cnt===10){g.querySelectorAll('.lig-cell').forEach(function(c){c.classList.add('bingo');});setTimeout(function(){toast('BINGO! 10 ligacoes!');},300);}
}

function toggleLig(n){
  var idx=_ligMarked.indexOf(n);
  var list=getLigToday();
  if(idx>=0){_ligMarked.splice(idx,1);list=list.filter(function(r){return r.n!==n;});}
  else{_ligMarked.push(n);list.push({n:n,hora:new Date().toISOString()});}
  saveLigToday(list);
  buildLigGrid();
}

/* Contabiliza automaticamente uma ligação no contador (marca a próxima célula livre de
   1 a 10), usada pelo botão 📞 do card/detalhe — equivalente a clicar manualmente na
   próxima célula do widget. Se já tiver marcado as 10, não faz nada (evita duplicar). */
function registerLigacao(){
  for(var n=1;n<=10;n++){
    if(_ligMarked.indexOf(n)<0){toggleLig(n);return;}
  }
}

function toggleLigWidget(e){if(e)e.stopPropagation();var w=document.getElementById('lig-widget');if(!w)return;_ligWidgetOpen=!_ligWidgetOpen;w.style.display=_ligWidgetOpen?'block':'none';if(_ligWidgetOpen){var fab=document.getElementById('lig-fab');if(fab){var r=fab.getBoundingClientRect();w.style.left=Math.max(4,r.left-160)+'px';w.style.top=Math.max(60,r.top-250)+'px';}}}

function resetLig(){_ligMarked=[];saveLigToday([]);buildLigGrid();toast('Contador reiniciado');}

// Touch-tap no .sd-wrap abre/fecha o tooltip (substitui hover que não dispara no Android)
document.addEventListener('touchstart',function(e){
  var wrap=e.target.closest('.sd-wrap');
  document.querySelectorAll('.sd-wrap.tip-open').forEach(function(el){if(el!==wrap)el.classList.remove('tip-open');});
  if(wrap&&!e.target.closest('.sd')){wrap.classList.toggle('tip-open');e.preventDefault();}
},{passive:false});

// ============================================================
// AGENDA AO VIVO — compartilhada entre todos os consultores
// ============================================================
// Modelo de dados: coleção "agenda_slots" no Firestore, UM DOCUMENTO POR
// AGENDAMENTO (não um doc por dia). Isso é o que permite editar o horário
// livremente (09:00 -> 09:30 é só trocar um campo, não mover linha de
// tabela) e evita que dois consultores sobrescrevam o mesmo documento ao
// salvar ao mesmo tempo.
//
// Tempo real: usa onSnapshot (listener), não polling nem F5. Qualquer
// consultor que cria/edita/exclui um agendamento aparece pra todo mundo
// na hora. Se a internet cair, cai pro cache local (mesmo padrão que o
// resto do app já usa em DB_MODE==='local').
var _agdCache=[];

var _agdUnsub=null;

var _agdSelDate=null;

var _agdOpened=false;

var AGD_SLOTS_PADRAO=['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'];

var AGD_NICHO_LBL={imovel:'Im\u00f3vel',caminhao:'Caminh\u00e3o',carro:'Carro/Moto',pesados:'Pesados',outro:'Outro'}

var AGD_STATUS_LBL={agendado:'Agendado',atendido:'Atendido',remarcar:'Remarcar',noshow:'No-Show'}

function agdKey(){return 'lf_agenda_cache';}

/* Ponto de entrada, chamado pelo goPage('agenda'). Só liga o listener uma
   vez (evita duplicar assinaturas do Firestore ao trocar de aba e voltar). */
function agdOpen(){
  if(!_agdSelDate)_agdSelDate=today();
  var dp=document.getElementById('agd-datepick');if(dp)dp.value=_agdSelDate;
  agdFillConsultorFilter();
  agdListen();
  agdRenderStrip(true);
  _agdOpened=true;
}

function agdSetLiveDot(ok,label){
  var dot=document.getElementById('agd-live-dot');if(dot)dot.style.background=ok?'var(--ok)':'var(--off)';
  var lbl=document.getElementById('agd-live-label');
  if(lbl)lbl.textContent=label||'Agendamentos de toda a equipe, em tempo real';
}

function agdListen(){
  if(_agdUnsub)return; // já está ouvindo — não duplica o listener
  if(DB_MODE==='firebase'&&db){
    _agdUnsub=db.collection('agenda_slots').onSnapshot(function(snap){
      var list=[];
      snap.forEach(function(doc){var d=doc.data()||{};d._id=doc.id;list.push(d);});
      _agdCache=list;
      ss(agdKey(),list);
      agdSetLiveDot(true);
      agdRenderStrip();agdRenderKPIs();agdRenderList();agdRenderFreeSlots();
    },function(err){
      console.error('agenda onSnapshot',err);
      agdSetLiveDot(false,'Sem conexão — mostrando dados salvos neste aparelho');
      _agdCache=sg(agdKey())||[];
      agdRenderStrip();agdRenderKPIs();agdRenderList();agdRenderFreeSlots();
    });
  }else{
    agdSetLiveDot(false,'Modo offline — os agendamentos ficam só neste aparelho');
    _agdCache=sg(agdKey())||[];
    agdRenderStrip();agdRenderKPIs();agdRenderList();agdRenderFreeSlots();
  }
}

/* Desliga o listener do Firestore (chamado no logout, pra não deixar
   assinatura aberta pra uma sessão que já terminou). */
function agdStopListening(){
  if(_agdUnsub){try{_agdUnsub();}catch(e){}_agdUnsub=null;}
  _agdOpened=false;
}

function agdFillConsultorFilter(){
  var sel=document.getElementById('agd-filter-cons');if(!sel)return;
  var users=getUsers().filter(function(u){return u.ativo!==false;});
  var cur=sel.value;
  sel.innerHTML='<option value="">Todos os consultores</option>'+users.map(function(u){
    return '<option value="'+u.id+'">'+_agdEsc(u.nome||'?')+'</option>';
  }).join('');
  sel.value=cur||'';
}

function agdFillConsultorSelect(){
  var sel=document.getElementById('agd-f-cons');if(!sel)return;
  var users=getUsers().filter(function(u){return u.ativo!==false;});
  sel.innerHTML=users.map(function(u){return '<option value="'+u.id+'">'+_agdEsc(u.nome||'?')+'</option>';}).join('');
}

function _agdEsc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}

function agdPickQuickSlot(h){
  var inp=document.getElementById('agd-f-hora');if(!inp)return;
  inp.value=h||'';
  agdCheckConflictLive();
  agdRenderQuickSlots();
  var cli=document.getElementById('agd-f-cli');
  if(cli&&!cli.value)setTimeout(function(){try{cli.focus();}catch(_e){}},30);
}

function agdRenderQuickSlots(){
  var wrap=document.getElementById('agd-quick-slots');if(!wrap)return;
  var help=document.getElementById('agd-quick-help');
  var data=(document.getElementById('agd-f-data')||{}).value||_agdSelDate||today();
  var consultorId=(document.getElementById('agd-f-cons')||{}).value||(S?S.userId:'');
  var cur=(document.getElementById('agd-f-hora')||{}).value||'';
  var id=(document.getElementById('agd-edit-id')||{}).value||'';
  var slots=AGD_SLOTS_PADRAO.slice();
  if(cur&&slots.indexOf(cur)===-1)slots.unshift(cur);
  slots=slots.filter(function(h,idx){return !!h&&slots.indexOf(h)===idx;});
  if(help)help.textContent=consultorId?'Horários rápidos para o consultor selecionado. Os ocupados continuam disponíveis, mas ficam sinalizados.':'Selecione o consultor para ver os horários rápidos.';
  wrap.innerHTML=slots.map(function(h){
    var busy=!!(data&&consultorId&&agdHasConflict(data,h,consultorId,id));
    var cls='agd-modal-slot'+(h===cur?' on':'')+(busy?' busy':'');
    var title=busy?'Horário já ocupado para esse consultor':'Usar '+h;
    return '<button type="button" class="'+cls+'" title="'+_htmlAttr(title)+'" onclick="agdPickQuickSlot(\''+_jsSq(h)+'\')">'+_agdEsc(h)+'</button>';
  }).join('');
}

function agdFocusPrimaryField(){
  var dataEl=document.getElementById('agd-f-data');
  var horaEl=document.getElementById('agd-f-hora');
  var cliEl=document.getElementById('agd-f-cli');
  var target=cliEl;
  if(dataEl&&!dataEl.value)target=dataEl;
  else if(horaEl&&!horaEl.value)target=horaEl;
  else if(cliEl&&!cliEl.value)target=cliEl;
  else target=horaEl||cliEl||dataEl;
  if(target)setTimeout(function(){try{target.focus();}catch(_e){}},70);
}

function agdBindQuickSlotEvents(){
  if(agdBindQuickSlotEvents._bound)return;
  agdBindQuickSlotEvents._bound=true;
  ['agd-f-data','agd-f-cons'].forEach(function(id){
    var node=document.getElementById(id);
    if(node)node.addEventListener('change',function(){agdCheckConflictLive();agdRenderQuickSlots();},{passive:true});
  });
  var hora=document.getElementById('agd-f-hora');
  if(hora){
    hora.addEventListener('input',function(){agdCheckConflictLive();agdRenderQuickSlots();},{passive:true});
    hora.addEventListener('change',function(){agdCheckConflictLive();agdRenderQuickSlots();},{passive:true});
  }
}

/* ---------- TIRA DE DIAS (navegação rápida, sem paginar mês inteiro) ---------- */
function agdRenderStrip(centerSel){
  var wrap=document.getElementById('agd-strip');if(!wrap)return;
  var base=_agdSelDate?new Date(_agdSelDate+'T12:00:00'):new Date();
  var dow=['DOM','SEG','TER','QUA','QUI','SEX','S\u00c1B'];
  var html='';
  for(var i=-3;i<=10;i++){
    var d=new Date(base.getTime());d.setDate(d.getDate()+i);
    var iso=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    var cnt=_agdCache.filter(function(a){return a.data===iso;}).length;
    var isToday=iso===today();
    var isSel=iso===_agdSelDate;
    var isoJs=_jsSq(iso);
    html+='<div class="agd-chip'+(isSel?' on':'')+(isToday?' today':'')+'" tabindex="0" role="button" aria-label="'+eH(iso)+'" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click();}" onclick="agdGoToDate(\''+isoJs+'\')">'+
      '<div class="agd-chip-dow">'+dow[d.getDay()]+'</div>'+
      '<div class="agd-chip-d">'+d.getDate()+'</div>'+
      '<div class="agd-chip-cnt">'+(cnt?cnt+' marc.':'')+'</div>'+
    '</div>';
  }
  wrap.innerHTML=html;
  if(centerSel){
    var sel=wrap.querySelector('.agd-chip.on');
    if(sel)sel.scrollIntoView({inline:'center',block:'nearest'});
  }
}

function agdGoToDate(iso){
  var dp=document.getElementById('agd-datepick');
  if(!iso){
    /* Campo de data apagado pelo usuário: não muda o dia exibido, mas
       repõe o valor no input — sem isso ele ficava em branco enquanto a
       Agenda continuava mostrando o dia anterior, parecendo travado. */
    if(dp)dp.value=_agdSelDate||today();
    return;
  }
  _agdSelDate=iso;
  if(dp)dp.value=iso;
  agdRenderStrip(true);agdRenderList();agdRenderFreeSlots();
}

function agdGoToday(){agdGoToDate(today());}

/* ---------- MINI CALENDÁRIO (ícone 🗓️) ----------
   Abre um calendário de mês inteiro (estilo Bitrix); ao clicar num dia, reaproveita
   agdGoToDate() — que já move a tira de dias, KPIs e a lista de agendamentos daquele dia
   pra baixo — e fecha o popup. Cada dia com agendamento(s) ganha uma bolinha indicadora. */
var _agdMiniCalYM=null;

function agdOpenMiniCal(){
  var base=_agdSelDate?new Date(_agdSelDate+'T12:00:00'):new Date();
  _agdMiniCalYM={y:base.getFullYear(),m:base.getMonth()};
  agdRenderMiniCal();
  openM('mo-agd-cal');
}

function agdMiniCalNav(dir){
  if(!_agdMiniCalYM)_agdMiniCalYM={y:new Date().getFullYear(),m:new Date().getMonth()};
  _agdMiniCalYM.m+=dir;
  if(_agdMiniCalYM.m<0){_agdMiniCalYM.m=11;_agdMiniCalYM.y--;}
  if(_agdMiniCalYM.m>11){_agdMiniCalYM.m=0;_agdMiniCalYM.y++;}
  agdRenderMiniCal();
}

function agdRenderMiniCal(){
  if(!_agdMiniCalYM)return;
  var y=_agdMiniCalYM.y,m=_agdMiniCalYM.m;
  var lbl=document.getElementById('agd-minical-label');if(lbl)lbl.textContent=MONTH_NAMES[m]+' '+y;
  var startDow=new Date(y,m,1).getDay();
  var daysInMonth=new Date(y,m+1,0).getDate();
  var grid=document.getElementById('agd-minical-grid');if(!grid)return;
  var html=DAY_NAMES.map(function(d){return '<div class="agd-mc-dow">'+d+'</div>';}).join('');
  for(var i=0;i<startDow;i++)html+='<div class="agd-mc-cell empty"></div>';
  for(var day=1;day<=daysInMonth;day++){
    var iso=y+'-'+String(m+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
    var cnt=_agdCache.filter(function(a){return a.data===iso;}).length;
    var isToday=iso===today();
    var isSel=iso===_agdSelDate;
    var isoJs=_jsSq(iso);
    html+='<button class="agd-mc-cell'+(isToday?' today':'')+(isSel?' sel':'')+'" onclick="agdMiniCalPick(\''+isoJs+'\')">'+day+(cnt?'<span class="agd-mc-dot" title="'+cnt+' agendamento(s)"></span>':'')+'</button>';
  }
  grid.innerHTML=html;
}

function agdMiniCalPick(iso){
  agdGoToDate(iso);
  closeM('mo-agd-cal');
}

/* ---------- KPIs / ESTATÍSTICAS ---------- */
function agdAddDays(iso,n){var d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

function agdInRange(iso,start,end){return iso>=start&&iso<=end;}

function agdRenderKPIs(){
  var el=document.getElementById('agd-kpis');if(!el)return;
  var t=today();
  var weekStart=agdAddDays(t,-6);
  var lastWeekStart=agdAddDays(t,-13),lastWeekEnd=agdAddDays(t,-7);
  var monthPrefix=t.slice(0,7);
  var hoje=_agdCache.filter(function(a){return a.data===t;}).length;
  var semana=_agdCache.filter(function(a){return agdInRange(a.data,weekStart,t);}).length;
  var semanaAnt=_agdCache.filter(function(a){return agdInRange(a.data,lastWeekStart,lastWeekEnd);}).length;
  var mes=_agdCache.filter(function(a){return (a.data||'').indexOf(monthPrefix)===0;}).length;
  var delta=semana-semanaAnt;
  var deltaTxt=delta===0?'= que 7 dias anteriores':(delta>0?'▲ +'+delta+' vs. anterior':'▼ '+delta+' vs. anterior');
  var deltaCls=delta>0?'up':(delta<0?'down':'');
  el.innerHTML=
    '<div class="agd-kpi"><div class="agd-kpi-v">'+hoje+'</div><div class="agd-kpi-l">Hoje</div></div>'+
    '<div class="agd-kpi"><div class="agd-kpi-v">'+semana+'</div><div class="agd-kpi-l">\u00daltimos 7 dias</div><div class="agd-kpi-delta '+deltaCls+'">'+deltaTxt+'</div></div>'+
    '<div class="agd-kpi"><div class="agd-kpi-v">'+semanaAnt+'</div><div class="agd-kpi-l">7 dias anteriores</div></div>'+
    '<div class="agd-kpi"><div class="agd-kpi-v">'+mes+'</div><div class="agd-kpi-l">Este m\u00eas</div></div>';
}

/* ---------- HORÁRIOS LIVRES DO DIA SELECIONADO ---------- */
function agdRenderFreeSlots(){
  var wrap=document.getElementById('agd-slots-free-wrap');if(!wrap)return;
  /* CORREÇÃO: a ocupação precisa ser calculada POR CONSULTOR (mesmo critério
     de agdHasConflict), não globalmente — senão um horário ocupado por UM
     consultor some da lista de "livres" para a equipe inteira. Quando "Todos
     os consultores" está selecionado no filtro, mantém a visão agregada
     (mostra livre só se NENHUM consultor tiver algo marcado nesse horário). */
  var consF=(document.getElementById('agd-filter-cons')||{}).value||'';
  var ocupados=_agdCache.filter(function(a){return a.data===_agdSelDate&&(!consF||a.consultorId===consF);}).map(function(a){return a.hora;});
  var livres=AGD_SLOTS_PADRAO.filter(function(h){return ocupados.indexOf(h)===-1;});
  if(!livres.length){wrap.innerHTML='';return;}
  wrap.innerHTML='<div class="agd-slots-free"><div class="agd-slots-free-title">Hor\u00e1rios livres (padr\u00e3o) nesse dia</div><div class="agd-free-chips">'+
    livres.map(function(h){var hJs=_jsSq(h),consJs=_jsSq(consF);return '<span class="agd-free-chip" tabindex="0" role="button" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click();}" onclick="agdOpenNew(\''+hJs+'\',\''+consJs+'\')">+ '+_agdEsc(h)+'</span>';}).join('')+
  '</div></div>';
}

/* ---------- LISTA DO DIA (só o dia selecionado — nunca o mês inteiro) ---------- */
function agdRenderList(){
  var el=document.getElementById('agd-list');if(!el)return;
  var consF=(document.getElementById('agd-filter-cons')||{}).value||'';
  var stF=(document.getElementById('agd-filter-status')||{}).value||'';
  var items=_agdCache.filter(function(a){
    if(a.data!==_agdSelDate)return false;
    if(consF&&a.consultorId!==consF)return false;
    if(stF&&a.status!==stF)return false;
    return true;
  }).sort(function(a,b){return (a.hora||'').localeCompare(b.hora||'');});
  if(!items.length){
    el.innerHTML='<div class="agd-empty" style="grid-column:1/-1"><div class="agd-empty-ic">📭</div>Nenhum agendamento para esse dia.<br>Toque no + para criar um.</div>';
    return;
  }
  el.innerHTML=items.map(function(a){
    var st=AGD_STATUS_LBL.hasOwnProperty(a.status)?a.status:'agendado';
    var idJs=_jsSq(a._id);
    return '<div class="agd-card st-'+st+'" tabindex="0" role="button" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click();}" onclick="agdOpenEdit(\''+idJs+'\')">'+
      '<div class="agd-card-top"><span class="agd-hora">'+_agdEsc(a.hora||'--:--')+'</span><span class="agd-status-badge st-'+st+'">'+_agdEsc(AGD_STATUS_LBL[st]||st)+'</span></div>'+
      '<div class="agd-cli">'+_agdEsc(a.cliente||'(sem nome)')+'</div>'+
      '<div class="agd-meta"><span>\uD83D\uDC64 '+_agdEsc(a.consultorNome||'-')+'</span><span>\uD83C\uDFF7 '+(AGD_NICHO_LBL[a.nicho]||_agdEsc(a.nicho)||'-')+'</span></div>'+
    '</div>';
  }).join('');
}

/* ---------- CRIAR / EDITAR ---------- */
/* consultorIdPre: vem do chip de "horário livre" quando a Agenda está
   filtrada por um consultor específico — sem isso, o agendamento sempre
   caía no usuário logado, mesmo estando na visão de outro consultor. */
function agdOpenNew(horaPre,consultorIdPre){
  agdFillConsultorSelect();
  agdBindQuickSlotEvents();
  document.getElementById('mo-agd-title').textContent='Novo Agendamento';
  document.getElementById('agd-edit-id').value='';
  document.getElementById('agd-f-data').value=_agdSelDate||today();
  document.getElementById('agd-f-hora').value=(typeof horaPre==='string')?horaPre:'';
  document.getElementById('agd-f-cons').value=consultorIdPre||(S?S.userId:'');
  document.getElementById('agd-f-cli').value='';
  document.getElementById('agd-f-nicho').value='';
  document.getElementById('agd-f-status').value='agendado';
  document.getElementById('agd-f-obs').value='';
  document.getElementById('agd-del-btn').style.display='none';
  document.getElementById('agd-conflict-warn').classList.remove('v');
  agdRenderQuickSlots();
  openM('mo-agd');
  agdFocusPrimaryField();
}

function agdOpenEdit(id){
  var a=_agdCache.find(function(x){return x._id===id;});if(!a)return;
  agdFillConsultorSelect();
  agdBindQuickSlotEvents();
  document.getElementById('mo-agd-title').textContent='Editar Agendamento';
  document.getElementById('agd-edit-id').value=id;
  document.getElementById('agd-f-data').value=a.data||today();
  document.getElementById('agd-f-hora').value=a.hora||'';
  document.getElementById('agd-f-cons').value=a.consultorId||'';
  document.getElementById('agd-f-cli').value=a.cliente||'';
  document.getElementById('agd-f-nicho').value=a.nicho||'';
  document.getElementById('agd-f-status').value=a.status||'agendado';
  document.getElementById('agd-f-obs').value=a.obs||'';
  document.getElementById('agd-del-btn').style.display='block';
  document.getElementById('agd-conflict-warn').classList.remove('v');
  agdRenderQuickSlots();
  openM('mo-agd');
  agdFocusPrimaryField();
}

/* Aviso visual (não bloqueante) enquanto a pessoa preenche o formulário —
   só avisa, quem decide se salva mesmo assim é ela, no clique de Salvar. */
function agdCheckConflictLive(){
  var data=(document.getElementById('agd-f-data')||{}).value;
  var hora=(document.getElementById('agd-f-hora')||{}).value;
  var consultorId=(document.getElementById('agd-f-cons')||{}).value;
  var id=(document.getElementById('agd-edit-id')||{}).value;
  var warn=document.getElementById('agd-conflict-warn');if(!warn)return;
  warn.classList.toggle('v',!!(data&&hora&&consultorId&&agdHasConflict(data,hora,consultorId,id)));
}

function agdHasConflict(data,hora,consultorId,excludeId){
  return _agdCache.some(function(a){
    return a._id!==excludeId&&a.data===data&&a.hora===hora&&a.consultorId===consultorId;
  });
}

function agdSave(){
  var data=document.getElementById('agd-f-data').value;
  var hora=document.getElementById('agd-f-hora').value;
  var consultorId=document.getElementById('agd-f-cons').value;
  var cliente=document.getElementById('agd-f-cli').value.trim();
  var nicho=document.getElementById('agd-f-nicho').value;
  var status=document.getElementById('agd-f-status').value;
  var obs=document.getElementById('agd-f-obs').value.trim();
  var id=document.getElementById('agd-edit-id').value;

  if(!data||!hora){toast('⚠️ Preencha data e hor\u00e1rio.');return;}
  if(!consultorId){toast('⚠️ Selecione o consultor.');return;}
  if(!cliente){toast('⚠️ Informe o nome do cliente.');return;}
  if(!nicho){toast('⚠️ Selecione o nicho.');return;}

  if(agdHasConflict(data,hora,consultorId,id)){
    _confirmModal({
      title:'⚠️ Hor\u00e1rio ocupado',
      msg:'J\u00e1 existe um agendamento nesse hor\u00e1rio para esse consultor.<br><br>Deseja salvar mesmo assim?',
      okLabel:'Salvar mesmo assim',okClass:'bp',
      onOk:function(){agdDoSave(data,hora,consultorId,cliente,nicho,status,obs,id);}
    });
    return;
  }
  agdDoSave(data,hora,consultorId,cliente,nicho,status,obs,id);
}

function agdDoSave(data,hora,consultorId,cliente,nicho,status,obs,id){
  var consultor=getUser(consultorId);
  var payload={
    data:data,hora:hora,consultorId:consultorId,consultorNome:consultor?consultor.nome:'',
    cliente:cliente,nicho:nicho,status:status,obs:obs,
    criadoPor:S?S.userId:'',ts:Date.now()
  };
  syncBusy();
  // CORREÇÃO (auditoria): antes, se a escrita no Firestore falhasse (.catch), o código só
  // chamava syncErr(e) — que exibe "Dados salvos localmente" — mas SEM realmente salvar
  // nada em localStorage. O agendamento que a pessoa acabou de preencher era perdido por
  // completo, com uma mensagem de sucesso falsa. Agora, no catch, faz o mesmo fallback
  // local-first já usado no ramo "modo local" logo abaixo (grava em _agdCache/localStorage
  // antes de avisar o usuário), e só depois mostra a mensagem real de erro de sincronização.
  function _agdLocalFallback(){
    if(id){
      var idx=_agdCache.findIndex(function(a){return a._id===id;});
      if(idx>=0)_agdCache[idx]=Object.assign({},_agdCache[idx],payload);
      else{payload._id=id;_agdCache.push(payload);}
    }else{
      payload._id='local_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
      _agdCache.push(payload);
    }
    var savedOkFb=ss(agdKey(),_agdCache);
    agdRenderStrip();agdRenderKPIs();agdRenderList();agdRenderFreeSlots();
    if(savedOkFb){toast('⚠️ Falha ao sincronizar com a nuvem. Salvo apenas neste aparelho.',4500);closeM('mo-agd');}
    else toast('❌ Falha ao sincronizar e armazenamento local cheio — agendamento pode ter sido perdido.',5000);
    var el=document.getElementById('nav-sync');if(el){el.className='nav-sync err';el.title='Erro de sincronização';}
  }
  if(DB_MODE==='firebase'&&db){
    if(id){
      db.collection('agenda_slots').doc(id).set(payload,{merge:true})
        .then(function(){syncOk();toast('✅ Agendamento atualizado!');closeM('mo-agd');})
        .catch(function(e){console.error('agdDoSave set',e);_agdLocalFallback();});
    }else{
      db.collection('agenda_slots').add(payload)
        .then(function(){syncOk();toast('✅ Agendamento criado!');closeM('mo-agd');})
        .catch(function(e){console.error('agdDoSave add',e);_agdLocalFallback();});
    }
    // onSnapshot já cuida de re-renderizar a lista pra todo mundo (inclusive
    // pra quem está salvando) assim que o Firestore confirmar a escrita.
  }else{
    // Modo local (sem Firebase disponível): guarda só neste aparelho.
    if(id){
      var idx=_agdCache.findIndex(function(a){return a._id===id;});
      if(idx>=0)_agdCache[idx]=Object.assign({},_agdCache[idx],payload);
    }else{
      payload._id='local_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
      _agdCache.push(payload);
    }
    var savedOk=ss(agdKey(),_agdCache);
    agdRenderStrip();agdRenderKPIs();agdRenderList();agdRenderFreeSlots();
    if(savedOk){syncOk();toast('✅ Salvo neste aparelho (sem conex\u00e3o com a nuvem).');closeM('mo-agd');}
    // se savedOk for false, ss() já mostrou o aviso de armazenamento cheio —
    // não fecha o modal nem mostra sucesso, pra pessoa poder tentar de novo.
  }
}

function agdDelete(){
  var id=document.getElementById('agd-edit-id').value;if(!id)return;
  _confirmModal({
    title:'🗑 Excluir agendamento?',
    msg:'Essa a\u00e7\u00e3o \u00e9 permanente e remove o agendamento para toda a equipe.',
    okLabel:'Excluir',okClass:'bd',
    onOk:function(){
      syncBusy();
      if(DB_MODE==='firebase'&&db){
        db.collection('agenda_slots').doc(id).delete()
          .then(function(){syncOk();toast('🗑 Agendamento exclu\u00eddo.');closeM('mo-agd');})
          .catch(function(e){
            // CORREÇÃO (auditoria): syncErr() sozinho mostra "Dados salvos localmente" — texto
            // pensado pra quando existe fallback local de salvamento (ver logo/capa/nome do CRM,
            // que sempre sobrescrevem com um toast próprio logo depois). Aqui não existe fallback
            // (agenda_slots é só-Firestore) e a ação é uma EXCLUSÃO, não um salvamento — a mensagem
            // genérica dava a entender que a exclusão "deu certo, só que localmente", quando na
            // verdade nada foi excluído em lugar nenhum. Toast próprio corrige isso.
            syncErr(e);
            toast('❌ Não foi possível excluir — sem conexão com a nuvem. O agendamento continua existindo.',4500);
          });
      }else{
        _agdCache=_agdCache.filter(function(a){return a._id!==id;});
        var savedOk=ss(agdKey(),_agdCache);
        agdRenderStrip();agdRenderKPIs();agdRenderList();agdRenderFreeSlots();
        if(savedOk){syncOk();closeM('mo-agd');}
        else toast('⚠️ Removido da tela, mas pode voltar ao recarregar — armazenamento local cheio.',4500);
      }
    }
  });
}
