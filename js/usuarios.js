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
// getUsers() precisa ser síncrona (chamada em dezenas de lugares no app),
// então o admin padrão é criado com o hash legado sh() aqui — ele é
// automaticamente migrado pro hash seguro (shSecure) no primeiro login,
// via verifyPw() em doLogin().
function getUsers(){var u=sg('lf6_u')||[];if(!u.some(function(x){return x.id==='adm';})){u.unshift({id:'adm',nome:'Administrador',email:ADM_EMAIL,cargo:'ADM',ph:sh('Lider@Adm2024'),data:today(),role:'adm',ativo:true,cor:0});ss('lf6_u',u);}return u;}

function getUser(id){return getUsers().find(function(u){return u.id===id;})||null;}

// ============================================================
// CORREÇÃO (condição de corrida em config/users): a coleção inteira de
// usuários vivia num ÚNICO doc Firestore ({list:[...todos]}), e toda gravação
// (criar, editar, ativar/desativar, upgrade de hash, trocar senha, etc.)
// escrevia o array INTEIRO de volta baseado numa leitura anterior. Duas
// gravações concorrentes (ex.: ADM editando o cargo de um usuário enquanto
// esse mesmo usuário loga e dispara o upgrade de hash) corriam risco de
// "última escrita vence", uma sobrescrevendo silenciosamente a outra.
//
// Solução em duas camadas:
// 1) Cada usuário tem seu PRÓPRIO doc na subcoleção config/users/items/{uid}
//    — duas edições em usuários DIFERENTES nunca mais colidem entre si.
// 2) Cada gravação manda só um PATCH com os campos que de fato mudaram (ex.:
//    {cargo:'Gerente'}, {ph:novoHash}), e saveUserDoc aplica esse patch numa
//    TRANSAÇÃO do Firestore: ela lê o estado atual do doc no servidor e
//    escreve o patch por cima dele, atomicamente. Isso cobre até o caso de
//    duas edições no MESMO usuário ao mesmo tempo (ex.: upgrade de hash e
//    troca de senha disparando juntos) — nenhuma das duas apaga campos que a
//    outra alterou nesse meio-tempo, porque a transação sempre parte do
//    estado mais recente do servidor, não de uma cópia local potencialmente
//    desatualizada.
function saveUserDoc(uid,patch){
  if(!(DB_MODE==='firebase'&&db)||!uid||!patch)return;
  syncBusy();
  var ref=db.collection('config').doc('users').collection('items').doc(uid);
  db.runTransaction(function(tx){
    return tx.get(ref).then(function(snap){
      var current=snap.exists?snap.data():{};
      var merged=Object.assign({},current,patch,{id:uid});
      tx.set(ref,merged);
    });
  }).then(syncOk).catch(syncErr);
}

function deleteUserDoc(uid){
  if(!(DB_MODE==='firebase'&&db)||!uid)return;
  syncBusy();
  db.collection('config').doc('users').collection('items').doc(uid).delete().then(syncOk).catch(syncErr);
}

// list = array local completo (continua igual, é só o cache local/offline).
// uid+patch = qual usuário mudou e SÓ os campos que mudaram — vai numa
// transação (ver saveUserDoc). Se omitidos (caller antigo/desconhecido), cai
// num fallback mais lento que regrava cada usuário por inteiro, mas nunca
// mais como um array só num doc único.
function saveUsersLocal(list,uid,patch){
  var localOk=ss('lf6_u',list);
  if(uid&&patch){
    saveUserDoc(uid,patch);
  }else if(DB_MODE==='firebase'&&db){
    list.forEach(function(u){if(u&&u.id)saveUserDoc(u.id,u);});
  }
  return localOk;
}

// Migração automática, uma única vez: se a subcoleção ainda estiver vazia mas
// o doc legado config/users ({list:[...]}) tiver dados, copia cada usuário
// para seu próprio doc em config/users/items/{uid}. Depois disso a app nunca
// mais lê nem grava no doc legado (ele fica só como registro histórico).
function migrateUsersLegacyDoc(cb){
  db.collection('config').doc('users').get().then(function(d){
    if(d.exists&&d.data().list&&d.data().list.length){
      var r=d.data().list;
      syncBusy();
      var batch=db.batch();
      r.forEach(function(u){
        if(u&&u.id)batch.set(db.collection('config').doc('users').collection('items').doc(u.id),u,{merge:true});
      });
      batch.commit().then(syncOk).catch(syncErr);
      ss('lf6_u',r);
      cb(r);
    }else{
      cb(getUsers());
    }
  }).catch(function(){cb(getUsers());});
}

function loadUsersDB(cb){
  if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('users').collection('items').get().then(function(snap){
      if(!snap.empty){
        var r=[];
        snap.forEach(function(d){r.push(d.data());});
        // CORREÇÃO ("usuário criado some depois de sair e entrar"): antes esta
        // função SUBSTITUÍA a lista local inteira pela lista vinda do servidor.
        // Se a gravação de um usuário recém-criado no Firestore (saveUserDoc,
        // disparada em segundo plano, sem esperar o resultado) ainda não tinha
        // terminado — ou falhou por qualquer motivo de rede/regra — o próximo
        // load (ex.: ao sair e entrar de novo) baixava uma lista do servidor
        // SEM esse usuário e apagava ele do localStorage também, fazendo-o
        // "sumir" mesmo tendo sido criado com sucesso na tela. Agora qualquer
        // usuário que já existe localmente mas ainda não apareceu no servidor
        // é mantido na lista final e tem sua gravação tentada de novo.
        var local=sg('lf6_u')||[];
        var serverIds={};r.forEach(function(u){if(u&&u.id)serverIds[u.id]=true;});
        local.forEach(function(u){
          if(u&&u.id&&!serverIds[u.id]){
            r.push(u);
            saveUserDoc(u.id,u);
          }
        });
        ss('lf6_u',r);
        cb(r);
      }else{
        migrateUsersLegacyDoc(cb);
      }
    }).catch(function(){cb(getUsers());});
  }else{cb(getUsers());}
}

// ============================================================
// ESTRUTURA DA EMPRESA / DEPARTAMENTOS — estilo "Estrutura da empresa" do Bitrix24.
// Dado único e compartilhado por toda a empresa (config/departments no Firestore, com
// merge automático de sincronização como o resto do app). O ADM cria/edita/exclui
// departamentos (nome, supervisor, supervisor adjunto opcional, departamento pai opcional
// pra aninhar sub-departamentos, e a lista de colaboradores). Usuários comuns só
// enxergam os departamentos dos quais fazem parte (como supervisor, adjunto ou membro) —
// se não fizerem parte de nenhum, a página fica vazia, como pedido.
// ============================================================
function getDepartments(){return sg('lf_departments')||[];}

function saveDepartmentsList(list){
  ss('lf_departments',list);
  if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('departments').set({list:list,ts:Date.now()}).then(syncOk).catch(syncErr);}
}

/* Local-first: desenha na hora com o cache local e só then atualiza em segundo plano. */
function loadDepartmentsRemote(cb){
  if(cb)cb(getDepartments());
  if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('departments').get().then(function(d){
      var l=d.exists?(d.data().list||[]):[];ss('lf_departments',l);if(cb)cb(l);
    }).catch(function(){});
  }
}

function _deptUserBelongs(dept,uid){
  return dept.supervisorId===uid||dept.supervisorAdjId===uid||(dept.memberIds||[]).indexOf(uid)>=0;
}

var _deptSelectedId=null;

function renderEstruturaPage(){
  var admBar=document.getElementById('estrutura-adm-bar');if(admBar)admBar.style.display=hasAdminAccess()?'':'none';
  loadDepartmentsRemote(function(all){
    var isAdm=hasAdminAccess();
    var list=isAdm?all:all.filter(function(d){return _deptUserBelongs(d,S.userId);});
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
  document.getElementById('dept-id').value=id||'';
  document.getElementById('dept-nome').value=d?d.nome:'';
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
  var all=getDepartments();
  var idx=all.findIndex(function(x){return x.id===id;});
  var obj={id:id,nome:nome,parentId:parentId,supervisorId:supervisorId,supervisorAdjId:supervisorAdjId,memberIds:memberIds,ts:Date.now()};
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
function _deviceId(){
  var id=null;try{id=localStorage.getItem('lf_device_id');}catch(e){}
  if(!id){id='dev_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);try{localStorage.setItem('lf_device_id',id);}catch(e){}}
  return id;
}

function _deviceLabel(){
  var ua=navigator.userAgent||'';
  var os='Dispositivo';
  if(/iPhone/.test(ua))os='iPhone';
  else if(/iPad/.test(ua))os='iPad';
  else if(/Android/.test(ua))os='Android';
  else if(/Windows/.test(ua))os='Windows';
  else if(/Macintosh/.test(ua))os='Mac';
  else if(/Linux/.test(ua))os='Linux';
  var browser='Navegador';
  if(/Edg\//.test(ua))browser='Edge';
  else if(/OPR\//.test(ua))browser='Opera';
  else if(/Chrome\//.test(ua)&&!/OPR\/|Edg\//.test(ua))browser='Chrome';
  else if(/Firefox\//.test(ua))browser='Firefox';
  else if(/Safari\//.test(ua)&&!/Chrome\//.test(ua))browser='Safari';
  var isPWA=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;
  return (isPWA?'App instalado':browser)+' · '+os;
}

function sessionsKey(uid){return 'lf_sessions_'+uid;}

function getSessions(uid){return sg(sessionsKey(uid))||[];}

/* Local-first: desenha na hora com o cache local e só then atualiza em segundo plano. */
function loadSessionsRemote(cb){
  if(!S)return cb&&cb([]);
  if(cb)cb(getSessions(S.userId));
  if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('sessions_'+S.userId).get().then(function(d){
      var l=d.exists?(d.data().list||[]):[];ss(sessionsKey(S.userId),l);if(cb)cb(l);
    }).catch(function(){});
  }
}

/* Chamada no boot e logo após o login: garante que este dispositivo apareça na lista de
   sessões do usuário, atualizando "último acesso" se já existia. */
function registerDeviceSession(){
  if(!S)return;
  var uid=S.userId,devId=_deviceId(),now=Date.now();
  var apply=function(list){
    list=(list||[]).slice();
    var mine=list.find(function(s){return s.deviceId===devId;});
    if(mine){mine.lastActive=now;mine.label=_deviceLabel();}
    else list.push({deviceId:devId,label:_deviceLabel(),loggedInAt:now,lastActive:now});
    ss(sessionsKey(uid),list);
    if(DB_MODE==='firebase'&&db)db.collection('config').doc('sessions_'+uid).set({list:list,ts:now}).catch(function(){});
  };
  if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('sessions_'+uid).get().then(function(d){apply(d.exists?(d.data().list||[]):[]);}).catch(function(){apply(getSessions(uid));});
  } else apply(getSessions(uid));
}

/* Roda a cada 2 min enquanto o app está aberto: atualiza "último acesso" e detecta se
   ESTE dispositivo foi desconectado remotamente (não está mais na lista) — nesse caso,
   desloga automaticamente com um aviso, em vez de deixar o usuário mexendo numa sessão
   que o admin/ele mesmo já revogou de outro aparelho. */
function _sessionsHeartbeat(){
  if(!S||DB_MODE!=='firebase'||!db)return;
  var uid=S.userId,devId=_deviceId();
  db.collection('config').doc('sessions_'+uid).get().then(function(d){
    var list=d.exists?(d.data().list||[]):[];
    var mine=list.find(function(s){return s.deviceId===devId;});
    if(!mine){
      toast('🔒 Esta sessão foi desconectada remotamente em outro dispositivo.',5000);
      setTimeout(_execLogout,1200);
      return;
    }
    mine.lastActive=Date.now();
    ss(sessionsKey(uid),list);
    db.collection('config').doc('sessions_'+uid).set({list:list,ts:Date.now()}).catch(function(){});
  }).catch(function(){});
}

function _fmtLastSeen(ts){
  if(!ts)return '—';
  var diff=Date.now()-ts;
  if(diff<120000)return 'agora mesmo';
  if(diff<3600000)return 'há '+Math.floor(diff/60000)+' min';
  if(diff<86400000)return 'há '+Math.floor(diff/3600000)+'h';
  return new Date(ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
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
  var list=getSessions(S.userId).filter(function(s){return s.deviceId!==deviceId;});
  ss(sessionsKey(S.userId),list);
  if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('sessions_'+S.userId).set({list:list,ts:Date.now()}).then(syncOk).catch(syncErr);}
  toast('Dispositivo desconectado.');
  renderSessionsPanel();
}

// ============================================================
// ADM
// ============================================================
function createUser(){
  var nome=(document.getElementById('nn').value||'').trim();
  var email=(document.getElementById('ne').value||'').trim().toLowerCase();
  var cargo=document.getElementById('nc').value;
  var pw=(document.getElementById('np').value||'').trim()||('Lider@'+Math.random().toString(36).slice(2,8));
  var data=document.getElementById('nd').value||today();
  var err=document.getElementById('ferr');err.textContent='';
  if(!nome||!email){err.textContent='Nome e e-mail obrigatorios.';return;}
  var users=getUsers();if(users.some(function(u){return u.email.toLowerCase()===email;})){err.textContent='E-mail ja cadastrado.';return;}
  shSecure(pw).then(function(hash){
    var newU={id:'u'+Date.now()+'_'+Math.random().toString(36).slice(2,5),nome:nome,email:email,cargo:cargo,ph:hash,data:data,role:'user',ativo:true,cor:users.length%5};
    users.push(newU);saveUsersLocal(users,newU.id,newU);try{window.dispatchEvent(new CustomEvent('crm:user-created',{detail:{id:newU.id}}));}catch(_e){}
    document.getElementById('nn').value='';document.getElementById('ne').value='';document.getElementById('np').value='';
    renderUsers();toast('Usuario criado!');showCred(newU.id,pw);
  }).catch(function(){err.textContent='Nao foi possivel gerar a senha neste dispositivo. Tente novamente.';});
}

function showCred(uid,pw){
  var u=getUser(uid);if(!u)return;
  document.getElementById('k-uid').value=uid;
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
  saveUsersLocal(users,u.id,patch);renderUsers();
  toast('Cargo de '+u.nome.split(' ')[0]+' atualizado para '+cargo+'!');
}

function renderUsers(){
  var users=getUsers().filter(function(u){return u.id!=='adm';});
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
  document.getElementById('eu-id').value=u.id;
  document.getElementById('eu-nome').value=u.nome||'';
  document.getElementById('eu-email').value=u.email||'';
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
  var users=getUsers();
  if(users.some(function(u){return u.id!==id&&u.email.toLowerCase()===email;})){err.textContent='E-mail ja usado por outro usuario.';return;}
  var u=users.find(function(x){return x.id===id;});if(!u)return;
  var eraAdmin=hasAdminAccess(id);
  u.nome=nome;u.email=email;u.cargo=cargo;
  var patch={nome:nome,email:email,cargo:cargo};
  // BUG CORRIGIDO (Tarefa 4): esta era a causa raiz — a caixa "Ativar acesso ao Painel ADM"
  // era renderizada, mostrada/ocultada conforme o cargo (toggleAdminNote), mas seu valor
  // NUNCA era lido aqui. O ADM marcava a opção, clicava Salvar, e nada acontecia (Supervisor
  // continuava sem acesso, sem nenhum erro ou aviso — bug silencioso).
  var euCheck=document.getElementById('eu-admin-check');if(euCheck){u.admExtra=euCheck.checked;patch.admExtra=euCheck.checked;}
  saveUsersLocal(users,u.id,patch);closeM('mo-edit-user');renderUsers();
  var ehAdminAgora=hasAdminAccess(id);
  if(ehAdminAgora&&!eraAdmin)toast('Salvo! '+nome.split(' ')[0]+' agora tem acesso de Administrador.');
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
  closeDU();
  renderUsers();
  toast('Excluído');
}
