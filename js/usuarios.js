/* =====================================================================
 * usuarios.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// ============================================================
// USUARIOS / SESSAO
// ============================================================
// CORREÇÃO DE SEGURANÇA (pedido do usuário — melhorua_reforcado):
// (1) removida a SENHA PADRÃO do ADM ('Lider@Adm2024') que era embutida
//     literalmente no JavaScript distribuído pra todo navegador/APK.
// (2) removido também o HASH DA SENHA do ADM (sh('Lider@Adm2024')) —
//     como sh() é DJB2 32-bit sem salt, o hash sozinho já é reversível
//     por força bruta e servia como "backdoor" a partir do bundle.
//
// Consequência: getUsers() NÃO cria mais uma conta ADM local com
// credencial embutida. O ADM passa a existir SOMENTE no backend
// (Supabase `fs_documents` -> config/users/items/adm), e a
// autenticação passa obrigatoriamente pelo Worker
// (POST /api/v1/login), que valida o hash s2$saltHex$hashHex do
// registro do servidor. Nenhum usuário ADM aparece "do nada" só
// porque abriu o app num dispositivo novo.
//
// Se, após um login legítimo bem-sucedido via Worker, o servidor
// devolver um user ADM, o próprio doLogin (js/auth.js) hidrata
// window.S / lf6_s com esses dados — quem precisar de um cache
// local do ADM (ex.: getUser('adm') em telas offline) recebe o que
// foi vindo da rede, não uma seed hard-coded no bundle.
var __usuariosRuntime=(((window.LiderCRM||{}).modules||{}).usuarios||{}).runtime||{};
var getUsers=__usuariosRuntime.getUsers||function(){return [];};
var getUser=__usuariosRuntime.getUser||function(){return null;};
var _crmDispatchBuffered=__usuariosRuntime._crmDispatchBuffered;
var _crmEmitUsersUpdated=__usuariosRuntime._crmEmitUsersUpdated;
var _crmEmitDepartmentsUpdated=__usuariosRuntime._crmEmitDepartmentsUpdated;
var _usuariosRepo=__usuariosRuntime._usuariosRepo;
var saveUserDoc=__usuariosRuntime.saveUserDoc;
var deleteUserDoc=__usuariosRuntime.deleteUserDoc;
var saveUsersLocal=__usuariosRuntime.saveUsersLocal;
var _seedDefaultUsersToCloud=__usuariosRuntime._seedDefaultUsersToCloud;
var migrateUsersLegacyDoc=__usuariosRuntime.migrateUsersLegacyDoc;
var loadUsersDB=__usuariosRuntime.loadUsersDB;
var getDepartments=__usuariosRuntime.getDepartments;
var saveDepartmentsList=__usuariosRuntime.saveDepartmentsList;
var loadDepartmentsRemote=__usuariosRuntime.loadDepartmentsRemote;
var _deviceId=__usuariosRuntime._deviceId;
var _deviceLabel=__usuariosRuntime._deviceLabel;
var _normalizeSessionsList=__usuariosRuntime._normalizeSessionsList;
var _fmtLastSeen=__usuariosRuntime._fmtLastSeen;

function _deptUserBelongs(dept,uid){
  return dept.supervisorId===uid||dept.supervisorAdjId===uid||(dept.memberIds||[]).indexOf(uid)>=0;
}

function _normalizeDeptRefsForUsers(dept,usersMap){
  if(!dept)return dept;
  var changed=false;
  var supervisorId=dept.supervisorId||null;
  if(supervisorId&&usersMap&&!usersMap[supervisorId]){supervisorId=null;changed=true;}
  var supervisorAdjId=dept.supervisorAdjId||null;
  if(supervisorAdjId&&usersMap&&!usersMap[supervisorAdjId]){supervisorAdjId=null;changed=true;}
  if(supervisorAdjId&&supervisorAdjId===supervisorId){supervisorAdjId=null;changed=true;}
  var seen={},src=Array.isArray(dept.memberIds)?dept.memberIds:[];
  var memberIds=src.filter(function(uid){
    if(!uid||uid===supervisorId||uid===supervisorAdjId||seen[uid])return false;
    if(usersMap&&!usersMap[uid])return false;
    seen[uid]=1;
    return true;
  });
  if(memberIds.length!==src.length||memberIds.some(function(uid,i){return uid!==src[i];}))changed=true;
  if(!changed)return dept;
  return Object.assign({},dept,{supervisorId:supervisorId,supervisorAdjId:supervisorAdjId,memberIds:memberIds,ts:Date.now()});
}

function _cleanupDepartmentsForRemovedUser(uid){
  if(!uid)return false;
  var usersMap={};
  getUsers().forEach(function(u){if(u&&u.id)usersMap[u.id]=u;});
  var all=getDepartments(),changed=false;
  var next=all.map(function(d){
    if(!d)return d;
    var base=d;
    if(d.supervisorId===uid||d.supervisorAdjId===uid||(d.memberIds||[]).indexOf(uid)>=0){
      base=Object.assign({},d,{
        supervisorId:d.supervisorId===uid?null:d.supervisorId,
        supervisorAdjId:d.supervisorAdjId===uid?null:d.supervisorAdjId,
        memberIds:(d.memberIds||[]).filter(function(x){return x!==uid;})
      });
    }
    var cleaned=_normalizeDeptRefsForUsers(base,usersMap);
    if(cleaned!==d)changed=true;
    return cleaned;
  });
  if(!changed)return false;
  saveDepartmentsList(next);
  if(_deptSelectedId){
    var stillThere=next.some(function(d){return d&&d.id===_deptSelectedId;});
    if(!stillThere)_deptSelectedId=null;
  }
  return true;
}

function getDepartmentVisibleUsers(uid){
  uid=uid||(S&&S.userId);
  var allUsers=getUsers().filter(function(u){return u&&u.ativo!==false;});
  if(!uid)return allUsers;
  if(hasAdminAccess&&hasAdminAccess(uid))return allUsers;
  if(!(hasSupervisorAccess&&hasSupervisorAccess(uid)))return allUsers.filter(function(u){return u.id===uid;});
  var deptIds=(getDepartments()||[]).filter(function(d){return _deptUserBelongs(d,uid);}).map(function(d){return d.id;});
  if(!deptIds.length)return allUsers.filter(function(u){return u.id===uid;});
  return allUsers.filter(function(u){
    if(u.id===uid)return true;
    return (getDepartments()||[]).some(function(d){return deptIds.indexOf(d.id)>=0&&_deptUserBelongs(d,u.id);});
  });
}

var _deptSelectedId=null;
var _estruturaRefreshTm=0;
function _scheduleEstruturaRefresh(){
  clearTimeout(_estruturaRefreshTm);
  _estruturaRefreshTm=setTimeout(function(){
    var pg=document.getElementById('pg-estrutura');
    if(pg&&pg.classList.contains('on'))renderEstruturaPage();
  },80);
}
window.addEventListener('crm:departments-updated',_scheduleEstruturaRefresh);
window.addEventListener('crm:users-updated',_scheduleEstruturaRefresh);

function renderEstruturaPage(){
  var admBar=document.getElementById('estrutura-adm-bar');if(admBar)admBar.style.display=hasAdminAccess()?'':'none';
  loadDepartmentsRemote(function(all){
    var isAdm=hasAdminAccess();
    var list=isAdm?all:all.filter(function(d){return S&&_deptUserBelongs(d,S.userId);});
    var empty=document.getElementById('estrutura-empty'),body=document.getElementById('estrutura-body');
    if(!list.length){
      if(empty)empty.style.display='';
      if(body)body.style.display='none';
      return;
    }
    if(empty)empty.style.display='none';
    if(body)body.style.display='flex';
    var visibleIds=list.map(function(d){return d.id;});
    var byParent={};
    list.forEach(function(d){
      var pid=(d.parentId&&visibleIds.indexOf(d.parentId)>=0)?d.parentId:'_root';
      if(!byParent[pid])byParent[pid]=[];
      byParent[pid].push(d);
    });
    var tree=document.getElementById('estrutura-tree');
    function renderLevel(pid){
      var items=byParent[pid]||[];
      if(!items.length)return '';
      return '<div class="estr-level">'+items.map(function(d){
        var subHtml=renderLevel(d.id);
        return '<div class="estr-branch">'
          +(pid!=='_root'?'<div class="estr-connector"></div>':'')
          +_deptCardHtml(d,all)
          +(subHtml?'<div class="estr-down-arrow">&#8595;</div>'+subHtml:'')
          +'</div>';
      }).join('')+'</div>';
    }
    if(tree)tree.innerHTML=renderLevel('_root');
    var panel=document.getElementById('estrutura-panel');
    if(_deptSelectedId&&visibleIds.indexOf(_deptSelectedId)>=0)deptSelectCard(_deptSelectedId);
    else if(panel)panel.innerHTML='<div class="est" style="padding:30px 10px;text-align:center;color:var(--mu)">Toque num departamento pra ver os detalhes.</div>';
  });
}

function _deptCardHtml(d,all){
  var sup=getUser(d.supervisorId);
  var adj=d.supervisorAdjId?getUser(d.supervisorAdjId):null;
  var members=(d.memberIds||[]).map(getUser).filter(Boolean);
  var mine=S&&_deptUserBelongs(d,S.userId);
  var childCount=all.filter(function(x){return x.parentId===d.id;}).length;
  return '<div class="estr-card'+(mine?' mine':'')+(_deptSelectedId===d.id?' sel':'')+'" onclick="deptSelectCard(\''+d.id+'\')" tabindex="0" role="button" aria-label="Selecionar '+eH(d.nome||'departamento')+'">'
    +(mine?'<div class="estr-mine-tag">SEU DEPARTAMENTO</div>':'')
    +(hasAdminAccess()?'<button class="estr-edit-btn" onclick="event.stopPropagation();openDeptEditor(\''+d.id+'\')" title="Editar">&#9998;</button>':'')
    +'<div class="estr-card-title">'+eH(d.nome)+'</div>'
    +(sup?'<div class="estr-person-mini"><span class="estr-av" style="background:'+AVB[(sup.cor||0)%AVB.length]+'">'+eH(sup.nome.charAt(0))+'</span>'+eH(sup.nome)+'</div>':'<div class="estr-person-mini muted">Sem supervisor</div>')
    +'<div class="estr-card-foot"><span class="estr-chip">'+members.length+' colaborador'+(members.length===1?'':'es')+'</span>'
    +(adj?'<span class="estr-chip">Adjunto: '+eH(adj.nome.split(' ')[0])+'</span>':'')
    +(childCount?'<span class="estr-chip">'+childCount+' sub-depto'+(childCount===1?'':'s')+'</span>':'')+'</div>'
    +'</div>';
}

function deptSelectCard(id){
  _deptSelectedId=id;
  document.querySelectorAll('.estr-card').forEach(function(c){c.classList.remove('sel');});
  var all=getDepartments();var d=all.find(function(x){return x.id===id;});
  var panel=document.getElementById('estrutura-panel');if(!panel||!d)return;
  var sup=getUser(d.supervisorId),adj=d.supervisorAdjId?getUser(d.supervisorAdjId):null;
  var members=(d.memberIds||[]).map(getUser).filter(Boolean);
  var sups=[sup,adj].filter(Boolean);
  function personRow(u,tag){return '<div class="estr-person-row"><span class="estr-av" style="background:'+AVB[(u.cor||0)%AVB.length]+'">'+eH(u.nome.charAt(0))+'</span><div><div class="estr-person-name">'+eH(u.nome)+'</div><div class="estr-person-cargo">'+eH(u.cargo||'')+'</div></div>'+(tag?'<span class="estr-badge">'+tag+'</span>':'')+'</div>';}
  panel.innerHTML='<div class="estr-panel-title">'+eH(d.nome)+'</div>'
    +'<div class="estr-panel-total">Total de colaboradores: '+((sups.length)+members.length)+'</div>'
    +(sups.length?'<div class="estr-panel-sec">Supervisores ('+sups.length+')</div>'+sups.map(function(u){return personRow(u,u.id===d.supervisorId?'Supervisor':'Adjunto');}).join(''):'')
    +(members.length?'<div class="estr-panel-sec">Colaboradores ('+members.length+')</div>'+members.map(function(u){return personRow(u,'');}).join(''):'')
    +(!sups.length&&!members.length?'<div class="est" style="color:var(--mu)">Nenhum integrante ainda.</div>':'');
  document.querySelectorAll('.estr-card').forEach(function(c){if(c.getAttribute('onclick')==="deptSelectCard('"+id+"')")c.classList.add('sel');});
}

function openDeptEditor(id){
  if(!hasAdminAccess()){toast('Apenas o ADM pode gerenciar departamentos.');return;}
  var all=getDepartments();var d=id?all.find(function(x){return x.id===id;}):null;
  document.getElementById('dept-mo-title').textContent=d?'Editar Departamento':'Novo Departamento';
  var _di=document.getElementById('dept-id');if(_di)_di.value=id||'';
  var _dn=document.getElementById('dept-nome');if(_dn)_dn.value=d?d.nome:'';
  var users=getUsers().filter(function(u){return u.ativo;});
  var parentSel=document.getElementById('dept-parent');
  parentSel.innerHTML='<option value="">Nenhum — departamento raiz</option>'+all.filter(function(x){return x.id!==id;}).map(function(x){return '<option value="'+x.id+'"'+(d&&d.parentId===x.id?' selected':'')+'>'+eH(x.nome)+'</option>';}).join('');
  var supSel=document.getElementById('dept-sup');
  supSel.innerHTML='<option value="">Selecione...</option>'+users.map(function(u){return '<option value="'+u.id+'"'+(d&&d.supervisorId===u.id?' selected':'')+'>'+eH(u.nome)+'</option>';}).join('');
  var adjSel=document.getElementById('dept-sup-adj');
  adjSel.innerHTML='<option value="">Nenhum</option>'+users.map(function(u){return '<option value="'+u.id+'"'+(d&&d.supervisorAdjId===u.id?' selected':'')+'>'+eH(u.nome)+'</option>';}).join('');
  var memWrap=document.getElementById('dept-members-list');
  memWrap.innerHTML=users.map(function(u){var checked=d&&(d.memberIds||[]).indexOf(u.id)>=0;return '<label style="display:flex;align-items:center;gap:8px;padding:5px 4px;font-size:.78rem;cursor:pointer"><input type="checkbox" value="'+u.id+'" class="dept-member-cb"'+(checked?' checked':'')+'> '+eH(u.nome)+'</label>';}).join('');
  document.getElementById('dept-del-btn').style.display=d?'':'none';
  openM('mo-dept');
}

function saveDept(){
  // CORREÇÃO (auditoria — controle de acesso): só openDeptEditor() tinha hasAdminAccess();
  // saveDept(), abaixo, e deleteDept() confiavam só no botão estar escondido na UI.
  if(!hasAdminAccess()){toast('Apenas o ADM pode gerenciar departamentos.');return;}
  var id=document.getElementById('dept-id').value||('dept_'+Date.now().toString(36));
  var nome=(document.getElementById('dept-nome').value||'').trim();
  if(!nome){toast('Digite o nome do departamento');return;}
  var parentId=document.getElementById('dept-parent').value||null;
  // Bloqueia nao so ser pai de si mesmo, mas qualquer ciclo mais longo (ex.: A vira filho de
  // B, e depois B vira filho de A) — sem essa checagem, renderEstruturaPage/renderLevel
  // entraria em recursao infinita ao montar a arvore (trava a pagina Estrutura).
  if(parentId){
    var _allDeptsChk=getDepartments(),_chain=parentId,_guard=0;
    while(_chain&&_guard++<200){
      if(_chain===id){toast('Esse departamento nao pode ser descendente dele mesmo (ciclo na hierarquia).');return;}
      var _pd=_allDeptsChk.find(function(x){return x.id===_chain;});
      _chain=_pd?_pd.parentId:null;
    }
  }
  var supervisorId=document.getElementById('dept-sup').value||null;
  var supervisorAdjId=document.getElementById('dept-sup-adj').value||null;
  var memberIds=Array.prototype.slice.call(document.querySelectorAll('.dept-member-cb:checked')).map(function(c){return c.value;});
  var usersMap={};
  getUsers().forEach(function(u){if(u&&u.id&&u.ativo)usersMap[u.id]=u;});
  var all=getDepartments();
  var idx=all.findIndex(function(x){return x.id===id;});
  var obj=_normalizeDeptRefsForUsers({id:id,nome:nome,parentId:parentId,supervisorId:supervisorId,supervisorAdjId:supervisorAdjId,memberIds:memberIds,ts:Date.now()},usersMap);
  if(idx>=0)all[idx]=obj;else all.push(obj);
  saveDepartmentsList(all);
  closeM('mo-dept');
  toast('✅ Departamento salvo!');
  renderEstruturaPage();
}

function deleteDept(){
  // CORREÇÃO (auditoria — controle de acesso): ver comentário em saveDept().
  if(!hasAdminAccess()){toast('Apenas o ADM pode gerenciar departamentos.');return;}
  var id=document.getElementById('dept-id').value;if(!id)return;
  var t=document.getElementById('toast'),tm=document.getElementById('tmsg');
  var doDelete=function(){
    var all=getDepartments().filter(function(x){return x.id!==id;});
    // Sub-departamentos órfãos viram raiz, em vez de sumir da estrutura.
    all.forEach(function(x){if(x.parentId===id)x.parentId=null;});
    saveDepartmentsList(all);
    closeM('mo-dept');
    toast('Departamento excluído.');
    renderEstruturaPage();
  };
  if(!t||!tm){doDelete();return;}
  clearTimeout(t._tm);clearTimeout(t._confirmTm);
  tm.innerHTML='Excluir este departamento? <button id="toast-deptdel-btn" style="margin-left:8px;padding:2px 9px;border-radius:6px;border:none;background:var(--red);color:#fff;font-size:.75rem;cursor:pointer;font-family:Outfit,sans-serif">Excluir</button>';
  var btn=document.getElementById('toast-deptdel-btn');
  if(btn)btn.addEventListener('click',function(){clearTimeout(t._confirmTm);t.classList.remove('show');doDelete();},{once:true});
  t.classList.add('show');
  t._confirmTm=setTimeout(function(){t.classList.remove('show');tm.textContent='';},4000);
}

// ============================================================
// DISPOSITIVOS CONECTADOS — "em quantos aparelhos estou logado, quais são, e desconectar
// um deles". Cada navegador/instalação ganha um ID único (lf_device_id) que sobrevive a
// logout/login (só some se limparem os dados do navegador). A lista fica em
// Firestore (config/sessions_<uid>) e cada dispositivo aberto manda um "heartbeat" a cada
// 2 min pra atualizar "último acesso" e checar se foi removido da lista remotamente —
// nesse caso, é deslogado automaticamente (é assim que o botão "Desconectar" funciona).
// ============================================================
function sessionsKey(uid){return 'lf_sessions_'+uid;}

function getSessions(uid){return sg(sessionsKey(uid))||[];}

function _mutateSessionsList(uid,mutator,opts){
  opts=opts||{};
  if(!uid)return Promise.resolve([]);
  function nextFrom(base){
    var normalized=_normalizeSessionsList(base);
    var next=mutator?mutator(normalized.slice()):normalized.slice();
    return _normalizeSessionsList(next);
  }
  var repo=_usuariosRepo();
  if(!(DB_MODE==='firebase')||!repo||typeof repo.runConfigDocTransaction!=='function'){
    var localOnly=nextFrom(getSessions(uid));
    ss(sessionsKey(uid),localOnly);
    return Promise.resolve(localOnly);
  }
  if(opts.syncUi)syncBusy();
  return repo.runConfigDocTransaction('sessions_'+uid,function(current){
    var next=nextFrom(current&&current.list?current.list:[]);
    return {list:next,ts:Date.now()};
  }).then(function(doc){
    var next=nextFrom(doc&&doc.list?doc.list:[]);
    ss(sessionsKey(uid),next);
    if(opts.syncUi)syncOk();
    return next;
  }).catch(function(err){
    if(opts.syncUi)syncErr(err);
    if(opts.allowLocalFallback){
      var localFallback=nextFrom(getSessions(uid));
      ss(sessionsKey(uid),localFallback);
      return localFallback;
    }
    throw err;
  });
}

function _clearUserSessionsRemote(uid){
  if(!uid)return;
  try{localStorage.removeItem(sessionsKey(uid));}catch(e){console.warn("usuarios: removeItem sessionsKey failed",e);}
  var repo=_usuariosRepo();
  if(DB_MODE==='firebase'&&repo&&typeof repo.setConfigDoc==='function'){
    repo.setConfigDoc('sessions_'+uid,{list:[],ts:Date.now()}).catch(function(e){console.warn("[usr] clearSessions falhou",e);});
  }
}

/* Local-first: desenha na hora com o cache local e só then atualiza em segundo plano. */
function loadSessionsRemote(cb){
  if(!S)return cb&&cb([]);
  if(cb)cb(_normalizeSessionsList(getSessions(S.userId)));
  var repo=_usuariosRepo();
  if(DB_MODE==='firebase'&&repo&&typeof repo.getConfigDoc==='function'){
    repo.getConfigDoc('sessions_'+S.userId).then(function(d){
      var l=_normalizeSessionsList(d&&d.list?d.list:[]);ss(sessionsKey(S.userId),l);if(cb)cb(l);
    }).catch(function(e){console.warn("[usr] loadSessionsRemote falhou",e);});
  }
}

/* Chamada no boot e logo após o login: garante que este dispositivo apareça na lista de
   sessões do usuário, atualizando "último acesso" se já existia. */
function registerDeviceSession(){
  if(!S)return;
  var uid=S.userId,devId=_deviceId(),now=Date.now();
  _mutateSessionsList(uid,function(list){
    var mine=list.find(function(s){return s.deviceId===devId;});
    if(mine){
      mine.lastActive=now;
      mine.label=_deviceLabel();
      if(!mine.loggedInAt)mine.loggedInAt=now;
    }else{
      list.push({deviceId:devId,label:_deviceLabel(),loggedInAt:now,lastActive:now});
    }
    return list;
  },{allowLocalFallback:true}).catch(function(e){console.warn("[usr] registerDeviceSession falhou",e);});
}

/* Roda a cada 2 min enquanto o app está aberto: atualiza "último acesso" e detecta se
   ESTE dispositivo foi desconectado remotamente (não está mais na lista) — nesse caso,
   desloga automaticamente com um aviso, em vez de deixar o usuário mexendo numa sessão
   que o admin/ele mesmo já revogou de outro aparelho. */
function _sessionsHeartbeat(){
  if(window.__lfHeartbeatBusy)return;
  if(!S||DB_MODE!=='firebase')return;
  var repo=_usuariosRepo();
  if(!repo)return;
  var uid=S.userId,devId=_deviceId();
  window.__lfHeartbeatBusy=1;
  Promise.all([
    (typeof repo.listUsers==='function'?repo.listUsers():Promise.resolve([])),
    (typeof repo.runConfigDocTransaction==='function'
      ? repo.runConfigDocTransaction('sessions_'+uid,function(current){
          var list=_normalizeSessionsList(current&&current.list?current.list:[]);
          var mine=list.find(function(s){return s.deviceId===devId;});
          if(mine){
            mine.lastActive=Date.now();
            mine.label=_deviceLabel();
            if(!mine.loggedInAt)mine.loggedInAt=mine.lastActive;
          }
          return {list:list,ts:Date.now()};
        })
      : Promise.resolve({list:getSessions(uid)}))
  ]).then(function(res){
    var users=Array.isArray(res[0])?res[0]:[];
    var me=users.find(function(u){return u&&u.id===uid;});
    if(!me||me.ativo===false){
      _clearUserSessionsRemote(uid);
      toast('🔒 Sua conta foi desativada ou removida.',5000);
      setTimeout(_execLogout,1200);
      return;
    }
    var doc=res[1]||{};
    var list=_normalizeSessionsList(doc&&doc.list?doc.list:[]);
    var mine=list.find(function(s){return s.deviceId===devId;});
    if(!mine){
      var localList=_normalizeSessionsList(getSessions(uid));
      var localMine=localList.find(function(s){return s.deviceId===devId;});
      if(localMine&&!window.__lfSessionRepairing){
        window.__lfSessionRepairing=1;
        console.warn('[usr] sessão remota ausente; tentando re-registrar este aparelho');
        _mutateSessionsList(uid,function(repairList){
          var found=repairList.find(function(s){return s.deviceId===devId;});
          if(found){
            found.lastActive=Date.now();
            found.label=_deviceLabel();
            if(!found.loggedInAt)found.loggedInAt=found.lastActive;
          }else{
            repairList.push({deviceId:devId,label:_deviceLabel(),loggedInAt:Date.now(),lastActive:Date.now()});
          }
          return repairList;
        },{allowLocalFallback:true}).finally(function(){ window.__lfSessionRepairing=0; });
        return;
      }
      toast('🔒 Esta sessão foi desconectada remotamente em outro dispositivo.',5000);
      setTimeout(_execLogout,1200);
      return;
    }
    ss(sessionsKey(uid),list);
  }).catch(function(e){console.warn("[usr] mutateSessionsList falhou",e);syncErr&&syncErr(e);}).finally(function(){ window.__lfHeartbeatBusy=0; });
}

function renderSessionsPanel(){
  var wrap=document.getElementById('sessions-list');if(!wrap)return;
  wrap.innerHTML='<div class="est">Carregando…</div>';
  loadSessionsRemote(function(list){
    var devId=_deviceId();
    list=(list||[]).slice().sort(function(a,b){return (b.lastActive||0)-(a.lastActive||0);});
    var cnt=document.getElementById('sessions-count');if(cnt)cnt.textContent=list.length;
    wrap.innerHTML=list.length?list.map(function(s){
      var isMe=s.deviceId===devId;
      return '<div class="sess-row'+(isMe?' me':'')+'">'
        +'<div class="sess-ic">'+(isMe?'📍':'📱')+'</div>'
        +'<div class="sess-body"><div class="sess-label">'+eH(s.label||'Dispositivo')+(isMe?' <span class="sess-tag">este aparelho</span>':'')+'</div>'
        +'<div class="sess-meta">Último acesso: '+_fmtLastSeen(s.lastActive)+'</div></div>'
        +(isMe?'':'<button class="sess-disc" onclick="disconnectSession(\''+s.deviceId+'\')">Desconectar</button>')
        +'</div>';
    }).join(''):'<div class="est">Nenhuma sessão encontrada.</div>';
  });
}

function openSessionsPanel(){
  if(!S){toast('Faça login primeiro.');return;}
  renderSessionsPanel();
  openM('mo-sessions');
}

function _disconnectSessionNow(deviceId){
  if(!S||!deviceId)return;
  _mutateSessionsList(S.userId,function(list){
    return list.filter(function(s){return s.deviceId!==deviceId;});
  },{syncUi:true,allowLocalFallback:true}).then(function(){
    toast('Dispositivo desconectado.');
    renderSessionsPanel();
  }).catch(function(e){console.warn("[usr] operação bg falhou",e);});
}

// ============================================================
// ADM
// ============================================================
function createUser(){
  // FIX (2026-07-22): defesa em profundidade — bloqueia chamada direta pelo console
  if(typeof hasAdminAccess==='function'&&!hasAdminAccess()){toast('Apenas ADM/Gestor pode criar usuários.');return;}
  var nome=(document.getElementById('nn').value||'').trim();
  var email=(document.getElementById('ne').value||'').trim().toLowerCase();
  var cargo=document.getElementById('nc').value;
  var pw=(document.getElementById('np').value||'').trim()||('Lider@'+Math.random().toString(36).slice(2,8));
  var data=document.getElementById('nd').value||today();
  var err=document.getElementById('ferr');err.textContent='';
  if(!nome||!email){err.textContent='Nome e e-mail obrigatorios.';return;}
  // FIX: validação de formato de e-mail antes de criar o usuário
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){err.textContent='E-mail inválido. Use o formato: nome@dominio.com';return;}
  var users=getUsers();if(users.some(function(u){return (u.email||'').toLowerCase()===email;})){err.textContent='E-mail ja cadastrado.';return;}
  shSecure(pw).then(function(hash){
    var newU={id:'u'+Date.now()+'_'+Math.random().toString(36).slice(2,5),nome:nome,email:email,cargo:cargo,ph:hash,data:data,role:'user',ativo:true,cor:users.length%5};
    users.push(newU);saveUsersLocal(users,newU.id,newU);try{window.dispatchEvent(new CustomEvent('crm:user-created',{detail:{id:newU.id}}));}catch(_e){}
    var _nn=document.getElementById('nn');if(_nn)_nn.value='';var _ne=document.getElementById('ne');if(_ne)_ne.value='';var _np=document.getElementById('np');if(_np)_np.value='';
    renderUsers();toast('Usuario criado!');showCred(newU.id,pw);
  }).catch(function(){err.textContent='Nao foi possivel gerar a senha neste dispositivo. Tente novamente.';});
}

function showCred(uid,pw){
  var u=getUser(uid);if(!u)return;
  var _ku=document.getElementById('k-uid');if(_ku)_ku.value=uid;
  var mh=document.getElementById('mkh');if(mh)mh.textContent='Acesso: '+u.nome;
  var ke=document.getElementById('k-email');if(ke)ke.textContent=u.email;
  var ks=document.getElementById('k-senha');if(ks)ks.textContent=pw||'(somente o usuário sabe a senha atual)';
  var km=document.getElementById('k-msg');
  if(km)km.value='Ola '+u.nome.split(' ')[0]+'!\n\nAcesse o LIDER CRM:\n'+window.location.href.split('?')[0]+'\n\nEmail: '+u.email+(pw?'\nSenha: '+pw:'');
  var cargoSel=document.getElementById('k-cargo');
  if(cargoSel){
    var cargoAtual=u.cargo||'Consultor';
    var temOpcao=Array.from(cargoSel.options).some(function(o){return o.value===cargoAtual;});
    if(!temOpcao){var opt=document.createElement('option');opt.value=cargoAtual;opt.textContent=cargoAtual;cargoSel.appendChild(opt);}
    cargoSel.value=cargoAtual;
    toggleAdminNote('k-cargo','k-admin-note');
  }
  // BUG CORRIGIDO (Tarefa 4): a caixa "Ativar acesso ao Painel ADM" nunca era preenchida com
  // o estado real salvo do usuário — sempre abria desmarcada, mesmo se já tivesse sido ativada.
  var kCheck=document.getElementById('k-admin-check');if(kCheck)kCheck.checked=!!u.admExtra;
  openM('mo-k');
}

/* Muda o cargo do usuario direto no modal de Acesso/Cred. — nao precisa abrir "Editar" so
   pra isso. As funcoes extras de cargos administrativos (Gerente/Supervisor) sao aplicadas
   automaticamente em todo o sistema, porque tudo passa por hasAdminAccess(), que sempre lê
   o cargo atual do usuário — não precisa de nenhum passo a mais aqui. */
function saveCredCargo(){
  // CORREÇÃO (auditoria — controle de acesso): esta função troca o cargo do usuário e o
  // flag admExtra (que dá acesso ADM); dependia só da página 'adm' estar bloqueada na
  // navegação para não-admins, sem checagem própria.
  if(!hasAdminAccess()){toast('Sem permissão');return;}
  var uid=document.getElementById('k-uid').value;if(!uid)return;
  var cargo=document.getElementById('k-cargo').value;
  var users=getUsers();var u=users.find(function(x){return x.id===uid;});if(!u)return;
  u.cargo=cargo;
  var patch={cargo:cargo};
  // BUG CORRIGIDO (Tarefa 4): a caixa "Ativar acesso ao Painel ADM" era exibida/ocultada
  // (toggleAdminNote) mas o valor marcado nunca era lido nem salvo — a caixa não fazia nada.
  var kCheck=document.getElementById('k-admin-check');if(kCheck){u.admExtra=kCheck.checked;patch.admExtra=kCheck.checked;}
  // ORIENTADOR: aceita tanto o textarea legado quanto o multiselect novo
  // do modal de credenciais (k-orientar-de).
  var orInput=document.getElementById('k-orientados')||document.getElementById('eu-orientados');
  if(orInput){
    var orIds=String(orInput.value||'').split(/[\s,;]+/).map(function(x){return x.trim();}).filter(Boolean);
    u.orientadosIds=orIds;patch.orientadosIds=orIds;
  }else{
    var orSel=document.getElementById('k-orientar-de');
    if(orSel){
      var ids=Array.prototype.slice.call(orSel.selectedOptions||[]).map(function(o){return o.value;}).filter(Boolean);
      u.orientadosIds=ids;patch.orientadosIds=ids;
    }
  }
  saveUsersLocal(users,u.id,patch);renderUsers();
  toast('Cargo de '+(u.nome||(u.id||'usuário')).split(' ')[0]+' atualizado para '+cargo+'!');
}

function renderUsers(){
  // FIX #11 (2026-07-20 v3): o documento CORRECOES_E_MELHORIAS_CRM exige que TODOS os usuários
  // apareçam nas listas do CRM, e o ADM só possa se ocultar OPCIONALMENTE via Configurações
  // (flag adm_hidden_in_lists / prefs.hideAdmInLists). Antes existia um filtro hard-coded
  // u.id!=='adm' que escondia o ADM em qualquer cenário — violava o requisito.
  var _hideAdm=false;
  try{
    var _prefs=(typeof getPrefs==='function')?(getPrefs()||{}):{};
    if(_prefs&&(_prefs.hideAdmInLists===true||_prefs.adm_hidden_in_lists===true))_hideAdm=true;
    if(!_hideAdm){var _ls=localStorage.getItem('lf_hide_adm_lists');if(_ls==='1'||_ls==='true')_hideAdm=true;}
  }catch(_e){}
  var users=getUsers().filter(function(u){return _hideAdm?u.id!=='adm':true;});
  var el=document.getElementById('ugrid');if(!el)return;
  if(!users.length){el.innerHTML='<div class="est">Nenhum usuario.</div>';return;}
  el.innerHTML=users.map(function(u){
    var badge=hasAdminAccess(u.id)?' <span class="perm-badge full" title="Mesmo acesso do Administrador">&#128737; Acesso Total</span>':'';
    var uidJs=_jsSq(u.id);
    return '<div class="uc"><div class="uct"><div class="ucav" style="background:'+AVB[u.cor%AVB.length]+'">'+u.nome.charAt(0).toUpperCase()+'</div><div class="uci"><div class="ucn">'+eH(u.nome)+'</div><div class="ucc">'+eH(u.cargo||'Consultor')+badge+'</div></div><div class="sti '+(u.ativo?'sa':'si')+'"><div class="sd2"></div>'+(u.ativo?'Ativo':'Inativo')+'</div></div><div class="ucb"><div class="ucm"><span>'+eH(u.email)+'</span><span>Desde '+eH(u.data||'')+'</span></div><div class="uca"><button class="bsm bse" onclick="openEditUser(\''+uidJs+'\')">&#9999;&#65039; Editar</button><button class="bsm bsl" onclick="showCred(\''+uidJs+'\')">Cred.</button><button class="bsm bst" onclick="toggleUser(\''+uidJs+'\')">'+( u.ativo?'Desativar':'Ativar')+'</button><button class="bsm bsd" onclick="openDelUser(\''+uidJs+'\')">Excluir</button></div></div></div>';
  }).join('');
}

function openEditUser(uid){
  var u=getUser(uid);if(!u)return;
  var _eid=document.getElementById('eu-id');if(_eid)_eid.value=u.id;
  var _enm=document.getElementById('eu-nome');if(_enm)_enm.value=u.nome||'';
  var _eem=document.getElementById('eu-email');if(_eem)_eem.value=u.email||'';
  var sel=document.getElementById('eu-cargo');
  var cargoAtual=u.cargo||'Consultor';
  var temOpcao=Array.from(sel.options).some(function(o){return o.value===cargoAtual;});
  if(!temOpcao){var opt=document.createElement('option');opt.value=cargoAtual;opt.textContent=cargoAtual;sel.appendChild(opt);}
  sel.value=cargoAtual;
  document.getElementById('eu-err').textContent='';
  toggleAdminNote('eu-cargo','eu-admin-note');
  // BUG CORRIGIDO (Tarefa 4): idem showCred() — a caixa sempre abria desmarcada, mesmo
  // quando o usuário já tinha acesso extra ativado anteriormente.
  var euCheck=document.getElementById('eu-admin-check');if(euCheck)euCheck.checked=!!u.admExtra;
  openM('mo-edit-user');
}

function saveEditUser(){
  // CORREÇÃO (auditoria — controle de acesso): o hasAdminAccess(id) mais abaixo checava
  // o usuário-ALVO (só pra decidir o texto do toast), não quem estava chamando a função —
  // ou seja, qualquer usuário logado podia editar nome/email/cargo/admExtra de qualquer
  // outro usuário, inclusive se autopromover a ADM.
  if(!hasAdminAccess()){toast('Sem permissão');return;}
  var id=document.getElementById('eu-id').value;
  var nome=(document.getElementById('eu-nome').value||'').trim();
  var email=(document.getElementById('eu-email').value||'').trim().toLowerCase();
  var cargo=document.getElementById('eu-cargo').value;
  var err=document.getElementById('eu-err');err.textContent='';
  if(!nome||!email){err.textContent='Nome e e-mail obrigatorios.';return;}
  // FIX: validação de formato de e-mail no editUser
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){err.textContent='E-mail inválido. Use o formato: nome@dominio.com';return;}
  var users=getUsers();
  if(users.some(function(u){return u.id!==id&&(u.email||'').toLowerCase()===email;})){err.textContent='E-mail ja usado por outro usuario.';return;}
  var u=users.find(function(x){return x.id===id;});if(!u)return;
  var eraAdmin=hasAdminAccess(id);
  u.nome=nome;u.email=email;u.cargo=cargo;
  var patch={nome:nome,email:email,cargo:cargo};
  // BUG CORRIGIDO (Tarefa 4): esta era a causa raiz — a caixa "Ativar acesso ao Painel ADM"
  // era renderizada, mostrada/ocultada conforme o cargo (toggleAdminNote), mas seu valor
  // NUNCA era lido aqui. O ADM marcava a opção, clicava Salvar, e nada acontecia (Supervisor
  // continuava sem acesso, sem nenhum erro ou aviso — bug silencioso).
  var euCheck=document.getElementById('eu-admin-check');if(euCheck){u.admExtra=euCheck.checked;patch.admExtra=euCheck.checked;}
  // ORIENTADOR (rollup v21): persistir lista de UIDs que este usuario orienta.
  // Le o textarea #eu-orientados (se existir) e salva no doc do usuario.
  // Lista aplicada tambem no <select> #eu-orientar-de se existir.
  var orText=document.getElementById('eu-orientados');
  if(orText){
    var orIds=String(orText.value||'').split(/[\s,;]+/).map(function(x){return x.trim();}).filter(Boolean);
    u.orientadosIds=orIds;patch.orientadosIds=orIds;
  }else{
    var orSel=document.getElementById('eu-orientar-de');
    if(orSel){
      var ids=Array.prototype.slice.call(orSel.selectedOptions||[]).map(function(o){return o.value;}).filter(Boolean);
      u.orientadosIds=ids;patch.orientadosIds=ids;
    }
  }
  saveUsersLocal(users,u.id,patch);closeM('mo-edit-user');renderUsers();
  var ehAdminAgora=hasAdminAccess(id);
  if(ehAdminAgora&&!eraAdmin)toast('Salvo! '+(nome||'Usuário').split(' ')[0]+' agora tem acesso de Administrador.');
  else toast('Usuario atualizado!');
}

function toggleUser(uid){
  // CORREÇÃO (auditoria — controle de acesso): ativa/desativa qualquer conta; dependia só
  // da página 'adm' estar bloqueada na navegação, sem checagem própria.
  if(!hasAdminAccess()){toast('Sem permissão');return;}
  // CORREÇÃO (auditoria, login/sessão): gestor/ADM podia desativar a PRÓPRIA conta enquanto
  // estava logado. Isso deixava a sessão atual viva até o próximo refresh/sync, criando um
  // estado incoerente (usuário desativado mas ainda operando). O próprio usuário não pode
  // se desativar; outro admin precisa fazer isso.
  if(S&&uid===S.userId){toast('Você não pode desativar a própria conta enquanto está usando o sistema.');return;}
  var users=getUsers();var u=users.find(function(x){return x.id===uid;});if(!u)return;
  u.ativo=!u.ativo;
  var savedOk=saveUsersLocal(users,u.id,{ativo:u.ativo});
  if(!u.ativo)_clearUserSessionsRemote(uid);
  renderUsers();
  if(savedOk)toast(u.ativo?'Ativado':'Desativado');
}

function openDelUser(uid){_duId=uid;var u=getUser(uid);var m=document.getElementById('dumsg');if(m)m.textContent='Excluir '+(u?u.nome:'')+' ?';openM('mo-du');}

function closeDU(){closeM('mo-du');_duId=null;}

function confirmDU(){
  // CORREÇÃO (auditoria — controle de acesso): excluía a conta de qualquer usuário sem
  // checagem própria, confiando só no botão 'Excluir' estar escondido na UI.
  if(!hasAdminAccess()){toast('Sem permissão');return;}
  if(!_duId)return;
  var delId=_duId;
  // CORREÇÃO (auditoria, login/sessão): evitar auto-exclusão do usuário logado. Sem isso,
  // a sessão atual podia continuar aberta por alguns instantes com um usuário já removido.
  if(S&&delId===S.userId){toast('Você não pode excluir a própria conta enquanto está usando o sistema.');return;}
  var users=getUsers().filter(function(u){return u.id!==delId;});
  // CORREÇÃO (auditoria, Etapa 7 — quota/localStorage): antes sempre mostrava "Excluído"
  // mesmo que o cache local falhasse. Agora só continua para a remoção remota depois da
  // gravação local ter sido confirmada.
  if(!ss('lf6_u',users))return;
  deleteUserDoc(delId);
  _clearUserSessionsRemote(delId);
  var cleanedDepts=_cleanupDepartmentsForRemovedUser(delId);
  closeDU();
  renderUsers();
  if(cleanedDepts&&document.getElementById('pg-estrutura')&&document.getElementById('pg-estrutura').classList.contains('on'))renderEstruturaPage();
  toast(cleanedDepts?'Excluído e removido da estrutura.':'Excluído');
}
