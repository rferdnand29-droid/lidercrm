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
var _actEditType='call',_actEditId=null,_actEditOwnerUid=null,_actEditBoard=null,_actEditCardId=null;
var _actPanelLastList=[]; // FIX #4 (2026-07-19 real): guarda a lista mesclada (todos os usuários) pra actItemClick/actConfirmDone localizarem o item certo

var __agendaRuntime=(typeof window.LiderCRM!=='undefined'&&window.LiderCRM.modules&&window.LiderCRM.modules.agenda&&window.LiderCRM.modules.agenda.runtime)||{};
var actKey=__agendaRuntime.actKey||function(){};
var actKeyFor=__agendaRuntime.actKeyFor||function(){};
var getActivities=__agendaRuntime.getActivities||function(){};
var getActivitiesLocalFor=__agendaRuntime.getActivitiesLocalFor||function(){};
var _linkedActsForCard=__agendaRuntime._linkedActsForCard||function(){};
var _linkedActsSortOpen=__agendaRuntime._linkedActsSortOpen||function(){};
var _linkedActsSortDone=__agendaRuntime._linkedActsSortDone||function(){};
var _linkedActCardHTML=__agendaRuntime._linkedActCardHTML||function(){};
var _linkedActsSummaryHTML=__agendaRuntime._linkedActsSummaryHTML||function(){};
var _agdWorkerClient=__agendaRuntime._agdWorkerClient||function(){};
var saveActivities=__agendaRuntime.saveActivities||function(){};
var lfSaveActivitiesFor=__agendaRuntime.lfSaveActivitiesFor||function(){};
var ligKey=__agendaRuntime.ligKey||function(){};
var getLigToday=__agendaRuntime.getLigToday||function(){};
var saveLigToday=__agendaRuntime.saveLigToday||function(){};

// Busca as atividades de TODOS os consultores ativos (usado pelo painel do Administrador).
// Busca direto no Firestore por consultor (mesmo padrao usado em renderAdmLigacoes) e cai
// para o cache local de cada um se o Firestore estiver indisponivel.
function loadAllActivitiesAdmin(cb){
  var users=getUsers().filter(function(u){return u.ativo!==false;});
  if(!users.length){cb([]);return;}
  var results=[];var pending=users.length;
  function done(){pending--;if(pending<=0)cb(results);}
  var wc=_agdWorkerClient();
  users.forEach(function(u){
    if(wc){
      wc.atividadesList(u.id).then(function(doc){
        var list=(doc&&doc.list)?doc.list:getActivitiesLocalFor(u.id);
        ss(actKeyFor(u.id),list);
        results=results.concat(list);done();
      }).catch(function(){results=results.concat(getActivitiesLocalFor(u.id));done();});
    }else if(DB_MODE==='firebase'&&db){
      db.collection('activities').doc(u.id).get().then(function(d){
        var list=(d.exists&&d.data().list)?d.data().list:getActivitiesLocalFor(u.id);
        ss(actKeyFor(u.id),list);
        results=results.concat(list);done();
      }).catch(function(){results=results.concat(getActivitiesLocalFor(u.id));done();});
    }else{results=results.concat(getActivitiesLocalFor(u.id));done();}
  });
}

function _loadActivitiesForOwner(uid,cb){
  uid=uid||((S&&S.userId)||'');
  cb=typeof cb==='function'?cb:function(){};
  if(!uid){cb([]);return;}
  if(S&&uid===S.userId){cb(getActivities());return;}
  var local=(typeof getActivitiesLocalFor==='function')?(getActivitiesLocalFor(uid)||[]):[];
  function finish(list){
    list=Array.isArray(list)?list:local;
    try{ if(typeof actKeyFor==='function') ss(actKeyFor(uid),list); }catch(_e){}
    cb(list);
  }
  var wc=_agdWorkerClient();
  if(wc&&typeof wc.atividadesList==='function'){
    wc.atividadesList(uid).then(function(doc){
      var list=(doc&&doc.list)?doc.list:local;
      finish(list);
    }).catch(function(){ finish(local); });
    return;
  }
  if(DB_MODE==='firebase'&&db){
    db.collection('activities').doc(uid).get().then(function(d){
      var list=(d.exists&&d.data().list)?d.data().list:local;
      finish(list);
    }).catch(function(){ finish(local); });
    return;
  }
  finish(local);
}

function selActType(t,btn){_actType=t;document.querySelectorAll('#act-type-row .act-type-btn').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');}

function selTlActType(t,btn){_tlActType=t;document.querySelectorAll('#tl-act-types .tl-act-type-btn').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');}

function selQaType(t,btn){_qaType=t;document.querySelectorAll('#qa-types .qa-type').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');}

function createActivity(){
  if(!S||!S.userId){toast('Sessão expirada. Faça login novamente.');return;}
  var desc=(document.getElementById('act-inp').value||'').trim();if(!desc){toast('Descreva a atividade');return;}
  var sched=document.getElementById('act-sched').value||null;
  // FIX #3 (2026-07-19 real): ADM pode escolher o responsável; qualquer outro usuário
  // continua agendando só pra si mesmo (comportamento antigo preservado).
  var isAdmin=(typeof hasAdminAccess==='function' && hasAdminAccess());
  var ownerSel=document.getElementById('act-owner-select');
  var targetUid=(isAdmin && ownerSel && ownerSel.value) ? ownerSel.value : S.userId;
  var isSelf=(targetUid===S.userId);
  var act={id:'act_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),type:_actType,desc:desc,scheduledAt:sched,done:false,read:false,createdAt:new Date().toISOString(),userId:targetUid,clientId:null,clientNome:null};
  document.getElementById('act-inp').value='';document.getElementById('act-sched').value='';
  function _afterCreate(){
    if(sched && isSelf){scheduleActAlert(act);scheduleNativeNotif(act);}
    if(!isSelf){
      try{ if(typeof pushNotif==='function') pushNotif(targetUid,'activity','🔔 Novo agendamento criado por '+((S&&S.nome)||'Alguém')+': '+desc,{}); }catch(_e){}
    }
    renderActPanel();
    var ownerNome=isSelf?null:(function(){var u=(typeof getUser==='function')?getUser(targetUid):null;return u?(u.nome||u.email||targetUid):targetUid;})();
    toast(isSelf?'Criada!':'Criada para '+ownerNome+'!');
    updateActBadge();
  }
  if(isSelf){
    var list=getActivities();
    list.unshift(act);if(list.length>500)list=list.slice(0,500);
    saveActivities(list);
    _afterCreate();
    return;
  }
  _loadActivitiesForOwner(targetUid,function(list){
    list=Array.isArray(list)?list:[];
    list.unshift(act);if(list.length>500)list=list.slice(0,500);
    if(typeof lfSaveActivitiesFor==='function'){ lfSaveActivitiesFor(targetUid,list); }
    else { saveActivities(list); }
    _afterCreate();
  });
}

function renderQuickActivitySummary(board,cardId,ownerUid){
  var el=document.getElementById('qa-activity-summary');if(!el)return;
  el.innerHTML=_linkedActsSummaryHTML(board,cardId,ownerUid,true);
}

function renderKBEditActivitySummary(board,cardId,ownerUid){
  var wrap=document.getElementById('kb-edit-activity-wrap');
  var el=document.getElementById('kb-edit-activity-summary');
  if(!wrap||!el)return;
  if(!cardId){wrap.style.display='none';el.innerHTML='';return;}
  wrap.style.display='block';
  el.innerHTML=_linkedActsSummaryHTML(board,cardId,ownerUid,true);
}

function _setActEditType(t){
  _actEditType=t;
  document.querySelectorAll('#act-edit-types .qa-type').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-t')===t);});
}

function openLinkedActivityEditor(actId,ownerUid,board,cardId){
  var uid=ownerUid||(S&&S.userId);
  var list=getActivitiesLocalFor(uid);
  var act=list.find(function(x){return x.id===actId;});
  if(!act){toast('Atividade não encontrada.');return;}
  _actEditId=actId;_actEditOwnerUid=uid;_actEditBoard=board||act.board||'';_actEditCardId=cardId||act.clientId||'';
  _setActEditType(act.type||'call');
  var ta=document.getElementById('act-edit-desc');if(ta)ta.value=act.desc||'';
  var dt=document.getElementById('act-edit-dt');if(dt)dt.value=act.scheduledAt?_toDateTimeLocalValue(act.scheduledAt):'';
  var nm=document.getElementById('act-edit-title');if(nm)nm.textContent='Editar atividade';
  openM('mo-act-edit');
}

function saveLinkedActivityEdit(){
  if(!_actEditId||!_actEditOwnerUid){toast('Atividade não selecionada.');return;}
  var desc=(document.getElementById('act-edit-desc').value||'').trim();
  if(!desc){toast('Descreva a atividade');return;}
  var sched=(document.getElementById('act-edit-dt').value||'').trim();
  var uid=_actEditOwnerUid;
  _loadActivitiesForOwner(uid,function(list){
    list=Array.isArray(list)?list:[];
    var act=list.find(function(x){return x.id===_actEditId;});
    if(!act){toast('Atividade não encontrada.');return;}
    act.type=_actEditType||act.type||'call';
    act.desc=desc;
    act.scheduledAt=sched||null;
    act.updatedAt=new Date().toISOString();
    if(uid===(S&&S.userId)){ saveActivities(list); }
    else if(typeof lfSaveActivitiesFor==='function'){ lfSaveActivitiesFor(uid,list); }
    else { saveActivities(list); }
    if(_actEditBoard&&_actEditCardId){
      var arr=getKBFor(_actEditBoard,uid);var c=arr.find(function(x){return x.id===_actEditCardId;});
      if(c&&c.activities&&c.activities.length){
        var ca=c.activities.find(function(x){return x.id===act.id;});
        if(ca){ca.type=act.type;ca.desc=act.desc;ca.scheduledAt=act.scheduledAt;ca.updatedAt=act.updatedAt;saveKBFor(_actEditBoard,uid,arr);}
      }
    }
    if(S&&uid===S.userId&&!act.done&&act.scheduledAt){scheduleActAlert(act);scheduleNativeNotif(act);}
    closeM('mo-act-edit');
    renderActPanel();updateActBadge();refreshLinkedActivitySummaries();
    toast('Atividade atualizada!');
  });
}

function refreshLinkedActivitySummaries(){
  if(_kbDetBoard&&_kbDetId){
    try{renderQuickActivitySummary(_kbDetBoard,_kbDetId,_kbDetOwnerUid||activeUID(_kbDetBoard));}catch(e){console.warn("agenda: renderQuickActivitySummary failed",e);}
  }
  if(_kbEditBoard&&_kbEditId){
    try{renderKBEditActivitySummary(_kbEditBoard,_kbEditId,_kbEditOwnerUid||activeUID(_kbEditBoard));}catch(e){console.warn("agenda: renderKBEditActivitySummary failed",e);}
  }
}

function openQuickActivity(){
  var board=_kbDetBoard,id=_kbDetId;if(!id||!board)return;
  var uid=(_kbDetOwnerUid||activeUID(board));var arr=getKBFor(board,uid);var c=arr.find(function(x){return x.id===id;});if(!c)return;
  var qn=document.getElementById('qa-nome');if(qn)qn.textContent=c.name;
  var qd=document.getElementById('qa-desc');if(qd)qd.value='';
  var d=new Date();d.setDate(d.getDate()+1);d.setHours(9,0,0,0);
  var qs=document.getElementById('qa-sched');if(qs)qs.value=_toDateTimeLocalValue(d);
  _qaType='call';document.querySelectorAll('#qa-types .qa-type').forEach(function(b){b.classList.remove('on');});
  var f=document.querySelector('#qa-types .qa-type[data-t="call"]');if(f)f.classList.add('on');
  renderQuickActivitySummary(board,id,uid);
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
  var assignedToOther=(uid&&uid!==(S&&S.userId));
  var act={id:'qa_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),type:_qaType,desc:desc,scheduledAt:sched,done:false,read:false,createdAt:new Date().toISOString(),userId:uid,clientId:id,clientNome:c?c.name:'',board:board};
  function _finishSave(){
    if(c){if(!c.activities)c.activities=[];c.activities.unshift({id:act.id,type:act.type,desc:act.desc,scheduledAt:sched,done:false,by:(S&&S.nome)||'?',byId:(S&&S.userId)||null,createdAt:act.createdAt});saveKBFor(board,uid,arr);}
    if(assignedToOther)pushNotif(uid,'activity','🔔 Nova atividade atribuída por '+((S&&S.nome)||'Alguém')+': '+desc,{cardId:id,board:board});
    else{scheduleActAlert(act);scheduleNativeNotif(act);}
    closeM('mo-quick-act');updateActBadge();renderKBLocal(board);refreshLinkedActivitySummaries();
    toast(assignedToOther?'Lembrete atribuído a outro consultor!':('Lembrete salvo para '+(typeof _formatScheduledAt==='function'?_formatScheduledAt(sched):new Date(sched).toLocaleString('pt-BR'))));
  }
  if(assignedToOther){
    // Busca a lista real do outro consultor no Firestore antes de acrescentar e salvar —
    // o cache local (getActivitiesLocalFor) normalmente está vazio/desatualizado neste
    // aparelho para um uid que não é o do usuário logado, o que sobrescrevia o documento
    // inteiro de atividades do destinatário com um único item (ver relatório de auditoria).
    var wc=_agdWorkerClient();
    if(wc){
      wc.atividadesList(uid).then(function(doc){
        var list=(doc&&doc.list)?doc.list:getActivitiesLocalFor(uid);
        list.unshift(act);lfSaveActivitiesFor(uid,list);
        _finishSave();
      }).catch(function(){
        var list=getActivitiesLocalFor(uid);list.unshift(act);lfSaveActivitiesFor(uid,list);
        _finishSave();
      });
      return;
    }
    if(DB_MODE==='firebase'&&db){
      db.collection('activities').doc(uid).get().then(function(d){
        var list=(d.exists&&d.data().list)?d.data().list:getActivitiesLocalFor(uid);
        list.unshift(act);lfSaveActivitiesFor(uid,list);
        _finishSave();
      }).catch(function(){
        var list=getActivitiesLocalFor(uid);list.unshift(act);lfSaveActivitiesFor(uid,list);
        _finishSave();
      });
      return;
    }
    var list=getActivitiesLocalFor(uid);list.unshift(act);lfSaveActivitiesFor(uid,list);
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
  if(p.classList.contains('open')){
    _actPopulateOwnerSelect();
    renderActPanel(); // render imediato com o que já está em cache local (sem esperar a rede)
    // FIX #4 (2026-07-19 real): carrega do servidor a lista de TODOS os consultores ativos
    // (antes só rodava pra ADM) e renderiza de novo quando chegar, pra qualquer usuário
    // ver os agendamentos de todo mundo, não só os seus.
    try{ loadAllActivitiesAdmin(function(){ renderActPanel(); }); }catch(_e){}
    var acts=getActivities();acts.forEach(function(a){a.read=true;});saveActivities(acts);updateActBadge();
  }
}

// FIX #3 (2026-07-19 real): mostra o seletor de "responsável" no formulário de criar
// atividade só pra quem tem acesso ADM — permite agendar em nome de qualquer consultor,
// e não só em nome de si mesmo.
function _actPopulateOwnerSelect(){
  var row=document.getElementById('act-owner-row');
  var sel=document.getElementById('act-owner-select');
  if(!row||!sel)return;
  if(!(typeof hasAdminAccess==='function' && hasAdminAccess())){
    row.style.display='none';
    return;
  }
  var users=(typeof getUsers==='function'?getUsers():[]).filter(function(u){return u&&u.ativo!==false;});
  var prev=sel.value;
  sel.innerHTML=users.map(function(u){
    var nome=u.nome||u.email||u.id;
    var isSelf=(S&&u.id===S.userId);
    return '<option value="'+eH(u.id)+'">'+eH(nome)+(isSelf?' (você)':'')+'</option>';
  }).join('');
  if(prev && users.some(function(u){return u.id===prev;})) sel.value=prev;
  else if(S&&S.userId) sel.value=S.userId;
  row.style.display=users.length>1?'':'none';
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
  // FIX #4 (2026-07-19 real): TODOS os usuários veem os agendamentos de TODOS
  // (antes só ADM via essa mesclagem — o pedido original é "todos os usuários do CRM").
  var acts = [];
  var _users = (typeof getUsers==='function') ? getUsers().filter(function(u){return u && u.ativo!==false;}) : [];
  if(_users.length){
    _users.forEach(function(u){
      try {
        var isSelf=(S&&u.id===S.userId);
        var arr = isSelf ? getActivities() : ((typeof getActivitiesLocalFor==='function') ? (getActivitiesLocalFor(u.id)||[]) : []);
        arr.forEach(function(a){
          if(!a) return;
          var clone = Object.assign({}, a);
          clone._ownerId = u.id;
          clone._ownerNome = u.nome || u.email || u.id;
          acts.push(clone);
        });
      } catch(_e){}
    });
  } else {
    acts = getActivities();
  }
  acts.sort(function(a,b){
    var ta = new Date(a.scheduledAt||a.createdAt||0).getTime();
    var tb = new Date(b.scheduledAt||b.createdAt||0).getTime();
    return tb - ta;
  });
  if(acts.length > 500) acts = acts.slice(0, 500);
  _actPanelLastList = acts; // pra actItemClick/actConfirmDone acharem o item certo, seja de quem for
  if(!acts.length){el.innerHTML='<div class="act-empty">Nenhuma atividade ainda.</div>';return;}
  var im={call:'📞',meet:'📅',task:'✅',note:'📋'};
  el.innerHTML='<div style="padding:6px 14px;border-bottom:1px solid var(--b1)"><button class="bc" style="font-size:.68rem;padding:4px 10px;width:auto" onclick="openActBulkEdit()">Editar em lote</button></div>'
    +acts.slice(0,30).map(function(a){
      var ic=im[a.type]||'📋';var lbl=(ACT_TYPES[a.type]||{lbl:a.type}).lbl;
      var dt=a.scheduledAt?_formatScheduledAt(a.scheduledAt):(a.createdAt?new Date(a.createdAt).toLocaleString('pt-BR'):'');
      var late=(a.scheduledAt&&!a.done&&_isScheduledExpired(a.scheduledAt))?'<span style="color:var(--rl);font-size:.6rem"> Atrasada</span>':'';
      var client=a.clientNome?'<span style="color:var(--al);font-size:.63rem"> · '+eH(a.clientNome)+'</span>':'';
      var owner=a._ownerNome?'<span style="color:var(--mu);font-size:.6rem"> [' +eH(a._ownerNome)+ ']</span>':'';
      var safeType=['call','meet','task','note'].indexOf(a.type)>=0?a.type:'task';var actIdJs=_jsSq(a.id);return '<div class="act-item'+(a.read?'':' unread')+'" style="'+(a.done?'opacity:.4;':'')+'" onclick="actItemClick(\''+actIdJs+'\')" tabindex="0" role="button"><div class="act-item-hd"><div class="act-ic '+safeType+'">'+ic+'</div><span class="act-item-name">'+lbl+client+owner+'</span><span class="act-item-time">'+dt+'</span></div><div class="act-item-desc">'+eH(a.desc)+late+'</div>'+(a.done?'<div style="font-size:.61rem;color:var(--ok)">✓ Concluido</div>':'')+'</div>';
    }).join('');
}

function actItemClick(id){
  // FIX #4 (2026-07-19 real): agora a lista pode ter atividades de outros usuários também
  var a=_actPanelLastList.find(function(x){return x.id===id;});
  if(!a){var acts=getActivities();a=acts.find(function(x){return x.id===id;});}
  if(!a)return;
  if(a.done)return;
  var ownerId=a._ownerId||(S&&S.userId);
  var canManage=(ownerId===(S&&S.userId))||(typeof hasAdminAccess==='function'&&hasAdminAccess());
  if(!canManage){
    toast('📋 Atividade de '+(a._ownerNome||'outro usuário')+' — só o responsável ou um ADM pode concluir.');
    return;
  }
  // Evita confirm() bloqueante (falha em iOS PWA standalone)
  var t=document.getElementById('toast'),tm=document.getElementById('tmsg');
  if(t&&tm){
    clearTimeout(t._tm);clearTimeout(t._confirmTm);
    tm.innerHTML='Marcar como conclu\u00edda? <button id="toast-act-done-btn" style="margin-left:8px;padding:2px 9px;border-radius:6px;border:none;background:var(--ok);color:#fff;font-size:.75rem;cursor:pointer;font-family:Outfit,sans-serif">Sim</button>';
    var btn=document.getElementById('toast-act-done-btn');
    if(btn){btn.dataset.actId=id;btn.dataset.ownerId=ownerId;btn.addEventListener('click',function(){actConfirmDone(this.dataset.actId,this.dataset.ownerId);},{once:true});}
    t.classList.add('show');
    t._confirmTm=setTimeout(function(){t.classList.remove('show');tm.textContent='';},4000);
  }
}

function actConfirmDone(id,ownerId){
  var t=document.getElementById('toast');if(t){clearTimeout(t._confirmTm);t.classList.remove('show');}
  ownerId=ownerId||(S&&S.userId);
  var isSelf=(ownerId===(S&&S.userId));
  _loadActivitiesForOwner(ownerId,function(list){
    list=Array.isArray(list)?list:[];
    var a=list.find(function(x){return x.id===id;});if(!a||a.done)return;
    a.done=true;a.doneAt=new Date().toISOString();
    if(isSelf){ saveActivities(list); }
    else if(typeof lfSaveActivitiesFor==='function'){ lfSaveActivitiesFor(ownerId,list); }
    else { saveActivities(list); }
    renderActPanel();updateActBadge();refreshLinkedActivitySummaries();toast('Concluída!');
  });
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
  var diff=_scheduledAtTs(act.scheduledAt)-Date.now();
  if(!isFinite(diff)||diff<0||diff>86400000)return;
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
    if(typeof _playNotifSound==='function')_playNotifSound();/* R15-03: som na notificação nativa */
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
  var as2=document.getElementById('act-alert-sub');if(as2)as2.textContent='Agendado para '+_formatScheduledAt(act.scheduledAt);
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
//
// CORREÇÃO (2026-07-21, caça-bugs agenda — família activities):
// checkUpcomingActs roda em setInterval a cada 60s e, através de
// showActAlert, chama saveActivities(acts) — o que ANTES podia rodar
// concorrentemente com uma criação/edição em andamento (agdDoSave,
// actConfirmDone, applyActBulk*) e sobrescrever o item ainda-não-
// confirmado com uma cópia "velha" da lista. Agora:
//  a) se activities-store.pending.has(uid) sinaliza que existe alguma
//     atividade com _pending:true (gravação em voo), o tick pula
//     saveActivities cegos deste ciclo — apenas reagenda alertas em
//     memória e atualiza o badge. O próximo tick (60s depois) já
//     verá o cache com _pending limpo pela confirmação remota.
//  b) mesmo quando não há pendências, as gravações agora passam pelo
//     mutex serial de activities-store (_enqueueSave) — ou seja,
//     nunca correm em paralelo com um agdDoSave em voo.
function checkUpcomingActs(){
  var acts=getActivities();var now=Date.now();
  var uid=(S&&S.userId)||null;
  var pendingApi=(window.LiderCRM&&window.LiderCRM.modules&&window.LiderCRM.modules.agenda&&window.LiderCRM.modules.agenda.runtime&&window.LiderCRM.modules.agenda.runtime.pending)||null;
  var hasPending=!!(pendingApi&&uid&&pendingApi.has(uid));
  acts.forEach(function(a){
    if(!a.done&&a.scheduledAt){
      var diff=_scheduledAtTs(a.scheduledAt)-now;
      if(diff>0&&diff<86400000)scheduleActAlert(a);
      if(diff<=0&&!a.read&&isFinite(diff)){
        // Se existe gravação otimista em voo, adia o showActAlert
        // pra este item — mostrar agora forçaria um saveActivities
        // concorrente que pode sobrescrever o _pending. Pula só a
        // ATUALIZAÇÃO PERSISTIDA de read=true; o alerta visual
        // será exibido no próximo tick, quando o _pending já
        // tiver sido confirmado.
        if(hasPending) return;
        showActAlert(a);
      }
    }
  });
  updateActBadge();
}

function requestNotifPermission(){try{if(!('Notification' in window))return;if(document&&document.visibilityState&&document.visibilityState!=='visible')return;if(Notification.permission!=='default')return;var p=Notification.requestPermission();if(p&&typeof p.catch==='function')p.catch(function(){});}catch(e){console.warn('[agenda] requestNotifPermission falhou',e);}}

// R10-14-native-notif-bg-warning: ATENÇÃO: setTimeout não é confiável em background no iOS/Android.
// Para notificações nativas confiáveis no app Capacitor, use @capacitor/local-notifications.
// Implementação atual funciona apenas se o app estiver em foreground.
function scheduleNativeNotif(act){
  if(!('Notification' in window)||!act.scheduledAt)return;
  var diff=_scheduledAtTs(act.scheduledAt)-Date.now();if(!isFinite(diff)||diff<0||diff>7*24*3600000)return;
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
    var sched=a.scheduledAt?'<div style="font-size:.61rem;color:var(--al)">Agendado: '+_formatScheduledAt(a.scheduledAt)+'</div>':'';
    var aIdJs=_jsSq(a.id);
    return '<div class="tl-act'+(a.done?' tl-act-done':'')+'"><div class="tl-act-hd"><span class="tl-act-ic">'+ic+'</span><span class="tl-act-type">'+lbl+'</span><span class="tl-act-by">'+eH(a.by||(S&&S.nome)||'?')+'</span>'+(a.done?'':'<button aria-label="Marcar como concluída" onclick="markTlActDone(\''+cIdJs+'\',\''+aIdJs+'\')" class="tl-done-btn">✓</button>')+'</div><div class="tl-act-txt">'+eH(a.desc)+'</div>'+sched+'<div class="tl2-date">'+dt+'</div></div>';
  }).join('');
}

function saveTlActivity(){
  if(!S||!S.userId){toast('Sessão expirada.');return;}
  var desc=(document.getElementById('tl-act-ta').value||'').trim();if(!desc){toast('Descreva');return;}
  var sched=document.getElementById('tl-act-sched').value||null;
  var uid=_tlOwnerUid||(S&&S.userId);var list=getCliLocal(uid);var c=list.find(function(x){return x.id===_tlCid;});if(!c)return;
  if(!c.activities)c.activities=[];
  var act={id:'a_'+Date.now(),type:_tlActType,desc:desc,scheduledAt:sched||null,done:false,by:(S&&S.nome)||'?',byId:(S&&S.userId)||null,createdAt:new Date().toISOString()};
  c.activities.unshift(act);saveCli(uid,list);
  var acts=getActivities();acts.unshift({id:act.id,type:act.type,desc:act.desc,scheduledAt:sched||null,done:false,read:false,createdAt:act.createdAt,userId:(S&&S.userId)||null,clientId:_tlCid,clientNome:c.nome});saveActivities(acts);
  if(sched){scheduleActAlert(acts[0]);scheduleNativeNotif(acts[0]);}
  renderTlActivities(c);toggleTlActForm();document.getElementById('tl-act-ta').value='';document.getElementById('tl-act-sched').value='';toast('Salvo!');
}

function markTlActDone(cid,actId){
  var uid=_tlOwnerUid||(S&&S.userId);var list=getCliLocal(uid);var c=list.find(function(x){return x.id===cid;});if(!c||!c.activities)return;
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
  if(!_actBulkStageCache[a.board])_actBulkStageCache[a.board]=getKBFor(a.board,(S&&S.userId)||'');
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
    if(f.onlyLate&&!(a.scheduledAt&&_isScheduledExpired(a.scheduledAt)))return false;
    return true;
  });
  el.innerHTML=acts.map(function(a){
    var ic=(ACT_TYPES[a.type]||{ic:'📋'}).ic;
    var dt=a.scheduledAt?_formatScheduledAt(a.scheduledAt,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Sem data';
    var late=(a.scheduledAt&&_isScheduledExpired(a.scheduledAt))?'⚠ ':'';
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
  if(typeof _confirmModal!=='function'){toast('Ação bloqueada: módulo de confirmação não carregado.');return;}

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

// ligKey/getLigToday/saveLigToday foram extraídas nesta rodada (7) para
// src/modules/agenda/runtime/ligacoes-store.js (mesmo padrão de actKey/
// getActivities/saveActivities em activities-store.js) — ver var
// __agendaRuntime no topo deste arquivo. Comportamento idêntico, incluindo o
// PUT /api/v1/ligacoes/list?uid=&date= via workerClient.saveLigacoesList.

function initLigWidget(){
  var w=document.getElementById('lig-widget');if(!w)return;
  w.style.left='13px';w.style.top='120px';
  _ligMarked=getLigToday().map(function(r){return r.n;});
  buildLigGrid();
  // FIX R5 (2026-07-22): impede empilhamento de listeners document-level em chamadas múltiplas
  // (startApp → initLigWidget pode ocorrer mais de uma vez por sessão, ex: logout+relogin).
  // document.addEventListener('mousemove'/'mouseup') sem remoção acumularia N listeners por sessão,
  // degradando toda interação de mouse do app. Guard via flag no próprio elemento DOM.
  if(w._lfDragBound)return;
  w._lfDragBound=true;
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

// FASE 3.3 (parte 6): timer do polling usado quando o Worker está ativo
// (substitui o onSnapshot do Firestore — ver agdListen). Intervalo de 6s:
// rápido o bastante pra parecer "quase em tempo real" na tela de agenda
// (compartilhada pela equipe), sem gerar tráfego excessivo.
var _agdPollTimer=null;
var AGD_POLL_MS=6000;

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
  try{
    if(window.LF&&typeof window.LF.fetchAndCacheActivities==='function'&&S&&S.userId){
      if(S&&S.userId)window.LF.fetchAndCacheActivities(S.userId).then(function(list){
        if(!Array.isArray(list))return;
        try{if(typeof renderActPanel==='function')renderActPanel();}catch(_e){}
        try{if(typeof updateActBadge==='function')updateActBadge();}catch(_e){}
        try{if(typeof refreshLinkedActivitySummaries==='function')refreshLinkedActivitySummaries();}catch(_e){}
      }).catch(function(e){console.warn("[agenda] fetchAndCacheActivities falhou",e);});
    }
    if(window.SyncManager&&typeof window.SyncManager.drain==='function')setTimeout(function(){try{window.SyncManager.drain();}catch(_e){}},60);
  }catch(_e){}
}

function agdSetLiveDot(ok,label){
  var dot=document.getElementById('agd-live-dot');if(dot)dot.style.background=ok?'var(--ok)':'var(--off)';
  var lbl=document.getElementById('agd-live-label');
  if(lbl)lbl.textContent=label||'Agendamentos de toda a equipe, em tempo real';
}

/* CORREÇÃO (2026-07-14, mesma família do fix do Messenger): o listener em
   tempo real pode disparar vários snapshots quase juntos (ex.: escrita local
   otimista + confirmação do servidor). Antes, cada disparo rodava as 4
   funções de render na hora, então rajadas de eventos geravam várias
   reconstruções de tela redundantes em sequência. Agora agrupamos por
   requestAnimationFrame: não importa quantos snapshots cheguem colados,
   só renderiza 1 vez por frame. */
var _agdRenderScheduled=false;
function agdRenderAll(){
  if(_agdRenderScheduled)return;
  _agdRenderScheduled=true;
  (window.requestAnimationFrame||function(cb){setTimeout(cb,16);})(function(){
    _agdRenderScheduled=false;
    agdRenderStrip();agdRenderKPIs();agdRenderList();agdRenderFreeSlots();
  });
}

function _agdWc(){
  var root=window.LiderCRM;
  var wc=root&&root.api&&root.api.workerClient;
  return (root&&root.config&&root.config.useWorkerApi&&wc&&typeof wc.agendaSlotsList==='function')?wc:null;
}

// FASE 3.3 (parte 6, 2026-07-18): o Worker/Cloudflare não tem um
// equivalente nativo do onSnapshot do Firestore (push em tempo real).
// Quando o Worker está ativo, "tempo real" vira POLLING a cada
// AGD_POLL_MS — degradação deliberada e documentada (latência de
// alguns segundos em vez de instantâneo), não um bug. O onSnapshot do
// Firestore continua existindo como fallback só se o Worker não
// estiver disponível (useWorkerApi desligado), pra não perder o
// comportamente em tempo real de quem ainda depende do legado.
function _agdPollOnce(){
  if(!_agdCache)_agdCache=[];
  var wc=_agdWc();if(!wc)return;
  wc.agendaSlotsList().then(function(list){
    // CORREÇÃO (2026-07-20, caça-bugs agenda): antes fazíamos
    //   _agdCache = Array.isArray(list) ? list : [];
    // que substituía o cache local INTEIRO pelo que voltou do servidor.
    // Problema: se o usuário acabou de criar/editar um slot em modo
    // otimista (lf-user-instant-mobile-fix ou agdDoSave) e a requisição
    // POST/PUT ainda não confirmou (ou falhou silenciosamente), o poll
    // subsequente sobrescrevia o cache — o agendamento sumia da tela
    // E do localStorage. Agora preservamos entradas locais que ainda
    // não constam no servidor: slots com _id iniciado por 'local_' ou
    // 'agd_' (IDs otimistas do patch mobile) ou marcados com _pending
    // são mesclados de volta ao _agdCache até o servidor confirmá-los.
    var remote = Array.isArray(list) ? list : [];
    var remoteIds = {};
    remote.forEach(function(a){ if(a && a._id) remoteIds[a._id] = true; });
    var localPending = (_agdCache || []).filter(function(a){
      if(!a || !a._id) return false;
      if(remoteIds[a._id]) return false; // já veio do servidor
      // otimistas locais ainda não confirmados
      return /^(local_|agd_)/.test(a._id) || a._pending === true;
    });
    _agdCache = remote.concat(localPending);
    ss(agdKey(),_agdCache);
    agdSetLiveDot(true,'Agendamentos de toda a equipe (atualiza a cada 6s)');
    agdRenderAll();
  }).catch(function(err){
    console.error('agenda-slots poll',err);
    agdSetLiveDot(false,'Sem conexão — mostrando dados salvos neste aparelho');
    // CORREÇÃO (2026-07-20): antes sobrescrevíamos _agdCache com o
    // que estava em localStorage — mas _agdCache já era a fonte de
    // verdade mais recente (inclusive com escritas otimistas dessa
    // sessão). Só recarrega do storage se o cache em memória estiver
    // vazio; caso contrário, mantém o que já está pintado na tela.
    if(!_agdCache || !_agdCache.length){
      _agdCache = sg(agdKey()) || [];
    }
    agdRenderAll();
  });
}

function agdListen(){
  if(_agdUnsub||_agdPollTimer)return; // já está ouvindo/pollando — não duplica
  var wc=_agdWc();
  if(wc){
    _agdPollOnce();
    _agdPollTimer=setInterval(_agdPollOnce,AGD_POLL_MS);
  }else if(DB_MODE==='firebase'&&db){
    _agdUnsub=db.collection('agenda_slots').onSnapshot(function(snap){
      var list=[];
      snap.forEach(function(doc){var d=doc.data()||{};d._id=doc.id;list.push(d);});
      // CORREÇÃO (2026-07-20): preservar entradas locais pendentes no onSnapshot,
      // igual ao que foi feito no _agdPollOnce para evitar perder agendamentos
      // que ainda não foram sincronizados com o servidor
      var remoteIds={};
      list.forEach(function(a){if(a&&a._id)remoteIds[a._id]=true;});
      var localPending=(_agdCache||[]).filter(function(a){
        if(!a||!a._id)return false;
        if(remoteIds[a._id])return false;
        return /^(local_|agd_)/.test(a._id)||a._pending===true;
      });
      _agdCache=list.concat(localPending);
      ss(agdKey(),_agdCache);
      agdSetLiveDot(true);
      agdRenderAll();
    },function(err){
      console.error('agenda onSnapshot',err);
      agdSetLiveDot(false,'Sem conexão — mostrando dados salvos neste aparelho');
      if(!_agdCache||!_agdCache.length){
        _agdCache=sg(agdKey())||[];
      }
      agdRenderAll();
    });
  }else{
    agdSetLiveDot(false,'Modo offline — os agendamentos ficam só neste aparelho');
    _agdCache=sg(agdKey())||[];
    agdRenderAll();
  }
}

/* Desliga o listener/polling (chamado no logout, pra não deixar
   assinatura ou timer abertos pra uma sessão que já terminou). */
function agdStopListening(){
  if(_agdUnsub){try{_agdUnsub();}catch(e){}_agdUnsub=null;}
  if(_agdPollTimer){clearInterval(_agdPollTimer);_agdPollTimer=null;}
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
function agdAddDays(iso,n){if(!iso||typeof iso!=='string')return today();var d=new Date(iso+'T12:00:00');if(isNaN(d.getTime()))return today();d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}

function agdInRange(iso,start,end){return iso>=start&&iso<=end;}

function agdRenderKPIs(){
  if(!S||!S.userId)return;
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
    // FIX #4 (2026-07-20 v3): card agora mostra explicitamente RESPONSÁVEL + CLIENTE + DATA + HORÁRIO + SITUAÇÃO,
    // conforme documento CORRECOES_E_MELHORIAS_CRM (item 4). Antes faltava a DATA no card.
    var dtBr='';
    try{if(a.data){var _p=String(a.data).split('-');if(_p.length===3)dtBr=_p[2]+'/'+_p[1]+'/'+_p[0];else dtBr=a.data;}}catch(_e){dtBr=a.data||'';}
    return '<div class="agd-card st-'+st+'" tabindex="0" role="button" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();this.click();}" onclick="agdOpenEdit(\''+idJs+'\')">'+
      '<div class="agd-card-top"><span class="agd-hora">'+_agdEsc(a.hora||'--:--')+'</span><span class="agd-status-badge st-'+st+'">'+_agdEsc(AGD_STATUS_LBL[st]||st)+'</span></div>'+
      '<div class="agd-cli">'+_agdEsc(a.cliente||'(sem nome)')+'</div>'+
      '<div class="agd-meta"><span>\uD83D\uDC64 '+_agdEsc(a.consultorNome||'-')+'</span>'+(dtBr?'<span>\uD83D\uDCC5 '+_agdEsc(dtBr)+'</span>':'')+'<span>\uD83C\uDFF7 '+(AGD_NICHO_LBL[a.nicho]||_agdEsc(a.nicho)||'-')+'</span></div>'+
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
  var _at=document.getElementById('mo-agd-title');if(_at)_at.textContent='Novo Agendamento';
  var _ae=document.getElementById('agd-edit-id');if(_ae)_ae.value='';
  var _ad=document.getElementById('agd-f-data');if(_ad)_ad.value=_agdSelDate||today();
  var _ah=document.getElementById('agd-f-hora');if(_ah)_ah.value=(typeof horaPre==='string')?horaPre:'';
  var _ac=document.getElementById('agd-f-cons');if(_ac)_ac.value=consultorIdPre||(S?S.userId:'');
  var _acl=document.getElementById('agd-f-cli');if(_acl)_acl.value='';
  var _an=document.getElementById('agd-f-nicho');if(_an)_an.value='';
  var _as=document.getElementById('agd-f-status');if(_as)_as.value='agendado';
  var _ao=document.getElementById('agd-f-obs');if(_ao)_ao.value='';
  var _adl=document.getElementById('agd-del-btn');if(_adl)_adl.style.display='none';
  var _acw=document.getElementById('agd-conflict-warn');if(_acw)_acw.classList.remove('v');
  agdRenderQuickSlots();
  openM('mo-agd');
  agdFocusPrimaryField();
}

function agdOpenEdit(id){
  var a=_agdCache.find(function(x){return x._id===id;});if(!a)return;
  agdFillConsultorSelect();
  agdBindQuickSlotEvents();
  var _et=document.getElementById('mo-agd-title');if(_et)_et.textContent='Editar Agendamento';
  var _ee=document.getElementById('agd-edit-id');if(_ee)_ee.value=id;
  var _ed=document.getElementById('agd-f-data');if(_ed)_ed.value=a.data||today();
  var _eh=document.getElementById('agd-f-hora');if(_eh)_eh.value=a.hora||'';
  var _ec=document.getElementById('agd-f-cons');if(_ec)_ec.value=a.consultorId||'';
  var _ecl=document.getElementById('agd-f-cli');if(_ecl)_ecl.value=a.cliente||'';
  var _en=document.getElementById('agd-f-nicho');if(_en)_en.value=a.nicho||'';
  var _es=document.getElementById('agd-f-status');if(_es)_es.value=a.status||'agendado';
  var _eo=document.getElementById('agd-f-obs');if(_eo)_eo.value=a.obs||'';
  var _edl=document.getElementById('agd-del-btn');if(_edl)_edl.style.display='block';
  var _ecw=document.getElementById('agd-conflict-warn');if(_ecw)_ecw.classList.remove('v');
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
    if(typeof _confirmModal!=='function'){toast('Ação bloqueada: módulo de confirmação não carregado.');return;}

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
  // CORREÇÃO (2026-07-20, caça-bugs agenda): gravação otimista ANTES de tentar
  // sincronizar com a nuvem. Antes, o cache local só era atualizado dentro do
  // _agdLocalFallback (ramo .catch), o que dependia de o worker-client rejeitar
  // em erros HTTP — comportamento que não existia até este patch. Se o POST
  // falhava silenciosamente (200 vazio, ou 4xx tratado como sucesso), o
  // agendamento nunca era persistido em localStorage e sumia no próximo poll.
  // Agora, salvamos primeiro (com _pending:true) e depois tentamos remotar.
  var optimisticId = id || ('local_'+Date.now()+'_'+Math.random().toString(36).slice(2,7));
  var optimisticIdx = _agdCache.findIndex(function(a){return a._id===optimisticId;});
  var optimisticEntry = Object.assign({_id:optimisticId,_pending:true},payload);
  if(optimisticIdx>=0)_agdCache[optimisticIdx]=Object.assign({},_agdCache[optimisticIdx],optimisticEntry);
  else _agdCache.push(optimisticEntry);
  ss(agdKey(),_agdCache);

  // CORREÇÃO (auditoria): antes, se a escrita no Firestore falhasse (.catch), o código só
  // chamava syncErr(e) — que exibe "Dados salvos localmente" — mas SEM realmente salvar
  // nada em localStorage. O agendamento que a pessoa acabou de preencher era perdido por
  // completo, com uma mensagem de sucesso falsa. Agora, no catch, faz o mesmo fallback
  // local-first já usado no ramo "modo local" logo abaixo (grava em _agdCache/localStorage
  // antes de avisar o usuário), e só depois mostra a mensagem real de erro de sincronização.
  function _agdLocalFallback(err){
    // idempotente: o payload já está no _agdCache (gravação otimista acima).
    // Aqui só garantimos a persistência final e enfileiramos retry.
    var savedOkFb=ss(agdKey(),_agdCache);
    agdRenderStrip();agdRenderKPIs();agdRenderList();agdRenderFreeSlots();
    try{
      if(window.LF && typeof window.LF.enqueueAgendaSlot==='function'){
        window.LF.enqueueAgendaSlot(id?'update':'create', optimisticId, payload);
      }
    }catch(_e){}
    if(savedOkFb){toast('⚠️ Falha ao sincronizar com a nuvem. Salvo apenas neste aparelho.',4500);closeM('mo-agd');}
    else toast('❌ Falha ao sincronizar e armazenamento local cheio — agendamento pode ter sido perdido.',5000);
    var el=document.getElementById('nav-sync');if(el){el.className='nav-sync err';el.title='Erro de sincronização';}
  }
  function _agdConfirmRemote(res){
    var remoteId=(res&&res._id)||optimisticId;
    var idx2=_agdCache.findIndex(function(a){return a._id===optimisticId;});
    if(idx2>=0){
      _agdCache[idx2]=Object.assign({},_agdCache[idx2],payload,{_id:remoteId});
      delete _agdCache[idx2]._pending;
    }
    ss(agdKey(),_agdCache);
  }
  var wc=_agdWc();
  if(wc){
    // FASE 3.3 (parte 6): sem onSnapshot no Worker, um poll manual logo após
    // salvar mostra o resultado pra quem acabou de agir sem esperar o
    // próximo tick do polling (até AGD_POLL_MS de latência pros demais).
    if(id){
      wc.updateAgendaSlot(id,payload)
        .then(function(res){_agdConfirmRemote(res);syncOk();toast('✅ Agendamento atualizado!');closeM('mo-agd');_agdPollOnce();})
        .catch(function(e){console.error('agdDoSave update',e && (e.status||e.message)?{status:e.status,msg:e.message}:e);_agdLocalFallback(e);});
    }else{
      wc.createAgendaSlot(payload)
        .then(function(res){_agdConfirmRemote(res);syncOk();toast('✅ Agendamento criado!');closeM('mo-agd');_agdPollOnce();})
        .catch(function(e){console.error('agdDoSave create',e && (e.status||e.message)?{status:e.status,msg:e.message}:e);_agdLocalFallback(e);});
    }
  }else if(DB_MODE==='firebase'&&db){
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
      // CORREÇÃO (auditoria): se o id do agendamento em edição não for mais encontrado no
      // cache local (ex.: cache desatualizado/corrompido), o código antes simplesmente não
      // fazia nada neste bloco — mas como _agdCache não tinha mudado, ss(agdKey(),_agdCache)
      // "salvava com sucesso" a mesma lista de sempre, e a função seguia direto para o toast
      // de sucesso "✅ Salvo neste aparelho" + fechava o modal. Resultado: falso sucesso —
      // a edição feita pela pessoa era descartada sem nenhum aviso. Mesma proteção já usada
      // em _agdLocalFallback (fallback do modo Firebase): se não achar o id, recria o
      // registro com esse mesmo _id em vez de perder a edição silenciosamente.
      if(idx>=0)_agdCache[idx]=Object.assign({},_agdCache[idx],payload);
      else{payload._id=id;_agdCache.push(payload);}
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
  if(typeof _confirmModal!=='function'){toast('Ação bloqueada: módulo de confirmação não carregado.');return;}

  _confirmModal({
    title:'🗑 Excluir agendamento?',
    msg:'Essa a\u00e7\u00e3o \u00e9 permanente e remove o agendamento para toda a equipe.',
    okLabel:'Excluir',okClass:'bd',
    onOk:function(){
      syncBusy();
      var wc=_agdWc();
      if(wc){
        wc.deleteAgendaSlot(id)
          .then(function(){syncOk();toast('🗑 Agendamento exclu\u00eddo.');closeM('mo-agd');_agdPollOnce();})
          .catch(function(e){
            syncErr(e);
            toast('❌ Não foi possível excluir — sem conexão com a nuvem. O agendamento continua existindo.',4500);
          });
      }else if(DB_MODE==='firebase'&&db){
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
