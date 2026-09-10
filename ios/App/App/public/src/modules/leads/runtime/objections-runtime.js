(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var leads = modules.leads = modules.leads || {};

  // Dicionário estático movido para src/modules/leads/data/objections-dictionary.js
  // (extração da rodada 2026-07-17, parte 2). Esse arquivo de dado deve carregar antes deste runtime.
  var dicionarioObjecoes = (leads.data && leads.data.dicionarioObjecoes) || [];

  var CUSTOM_OBJ_KEY='lf_custom_objecoes';

function getCustomObjecoes(){try{return JSON.parse(localStorage.getItem(CUSTOM_OBJ_KEY)||'[]');}catch(e){return [];}}

// FIX: objeções customizadas só eram salvas em localStorage local — nunca sincronizavam
// com o Firebase, então "visível para toda a equipe" (texto do toast) não era verdade em
// outros dispositivos. Agora segue o mesmo padrão de saveAdmDocs()/loadAdmDocs().
// FASE 3.3 (parte 5, 2026-07-17): saveCustomObjecoes()/loadCustomObjecoes()
// (e as outras 3 pares abaixo: obj_edits, obj_deleted, user_objecoes)
// passam a preferir LiderCRM.api.workerClient.getConfig/putConfig(name)
// — reaproveita o endpoint genérico /api/v1/usuarios/config (Fase 3.2),
// já usado por outras telas, em vez de
// db.collection('config').doc(name).{get,set}() do adaptador legado.
// Fallback pro caminho antigo só se o Worker não estiver disponível.
function _cfgWorkerClient(){
  var root=window.LiderCRM;
  var wc=root&&root.api&&root.api.workerClient;
  return (root&&root.config&&root.config.useWorkerApi&&wc&&typeof wc.getConfig==='function')?wc:null;
}

function saveCustomObjecoes(arr){
  try{localStorage.setItem(CUSTOM_OBJ_KEY,JSON.stringify(arr));}catch(e){toast('❌ Erro ao salvar: armazenamento cheio ou modo privado.');return false;}
  var wc=_cfgWorkerClient();
  if(wc){syncBusy();wc.putConfig('custom_objecoes',{list:arr,ts:Date.now()}).then(syncOk).catch(syncErr);}
  else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('custom_objecoes').set({list:arr,ts:Date.now()}).then(syncOk).catch(syncErr);}
  return true;
}

// CORREÇÃO (auditoria, Etapa 1 — consistência local-first): idem loadBGRemote — cb() agora
// roda imediatamente com o cache local antes de esperar o Firestore/Worker.
function loadCustomObjecoes(cb){
  cb(getCustomObjecoes());
  var wc=_cfgWorkerClient();
  if(wc){
    wc.getConfig('custom_objecoes').then(function(doc){
      var list=(doc&&doc.list)?doc.list:getCustomObjecoes();
      try{localStorage.setItem(CUSTOM_OBJ_KEY,JSON.stringify(list));}catch(e){}
      cb(list);
    }).catch(function(e){console.warn("[obj] sync bg falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('custom_objecoes').get().then(function(d){
      var list=(d.exists&&d.data().list)?d.data().list:getCustomObjecoes();
      try{localStorage.setItem(CUSTOM_OBJ_KEY,JSON.stringify(list));}catch(e){}
      cb(list);
    }).catch(function(e){console.warn("[obj] sync bg falhou",e);});
  }
}

function admAddObjecao(){
  var texto=(document.getElementById('new-obj-texto').value||'').trim();
  var cat=(document.getElementById('new-obj-cat').value||'').trim();
  var canal=document.getElementById('new-obj-canal').value;
  var ini=(document.getElementById('new-obj-ini').value||'').trim();
  var inter=(document.getElementById('new-obj-int').value||'').trim();
  var exp=(document.getElementById('new-obj-exp').value||'').trim();
  if(!texto||!ini){toast('❌ Preencha ao menos a objeção e a resposta iniciante');return;}
  var arr=getCustomObjecoes();
  arr.push({id:'custom_'+Date.now(),objecao:texto,categoria:cat||'Geral',canal:canal,respostas:{iniciante:ini,intermediario:inter,experiente:exp}});
  if(!saveCustomObjecoes(arr))return;
  ['new-obj-texto','new-obj-cat','new-obj-ini','new-obj-int','new-obj-exp'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  renderObjBank();
  toast('✅ Objeção adicionada! Visível para toda a equipe.');
}

// ============================================================
// EDITAR / EXCLUIR QUALQUER OBJEÇÃO DO BANCO (somente ADM)
// As 50 objeções fixas vivem no código (array dicionarioObjecoes) e não podem
// ser reescritas em tempo real, então edição/exclusão delas é guardada como uma
// camada por cima ("patch" por id em OBJ_EDITS_KEY / lista de ids ocultos em
// OBJ_DELETED_KEY), aplicada no momento da renderização. Já as objeções criadas
// pelo próprio ADM (custom_...) são editadas/excluídas direto no array delas,
// como já funcionava. Sincroniza com Firestore no mesmo padrão de custom_objecoes.
// ============================================================
var OBJ_EDITS_KEY='lf_obj_edits';

var OBJ_DELETED_KEY='lf_obj_deleted';

function getObjEdits(){try{return JSON.parse(localStorage.getItem(OBJ_EDITS_KEY)||'{}');}catch(e){return {};}}

function saveObjEdits(map){
  try{localStorage.setItem(OBJ_EDITS_KEY,JSON.stringify(map));}catch(e){toast('❌ Erro ao salvar: armazenamento cheio ou modo privado.');return false;}
  var wc=_cfgWorkerClient();
  if(wc){syncBusy();wc.putConfig('obj_edits',{map:map,ts:Date.now()}).then(syncOk).catch(syncErr);}
  else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('obj_edits').set({map:map,ts:Date.now()}).then(syncOk).catch(syncErr);}
  return true;
}

function loadObjEdits(cb){
  cb(getObjEdits());
  var wc=_cfgWorkerClient();
  if(wc){
    wc.getConfig('obj_edits').then(function(doc){
      var map=(doc&&doc.map)?doc.map:getObjEdits();
      try{localStorage.setItem(OBJ_EDITS_KEY,JSON.stringify(map));}catch(e){}
      cb(map);
    }).catch(function(e){console.warn("[obj] sync bg falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('obj_edits').get().then(function(d){
      var map=(d.exists&&d.data().map)?d.data().map:getObjEdits();
      try{localStorage.setItem(OBJ_EDITS_KEY,JSON.stringify(map));}catch(e){}
      cb(map);
    }).catch(function(e){console.warn("[obj] sync bg falhou",e);});
  }
}

function getObjDeletedIds(){try{return JSON.parse(localStorage.getItem(OBJ_DELETED_KEY)||'[]');}catch(e){return [];}}

function saveObjDeletedIds(arr){
  try{localStorage.setItem(OBJ_DELETED_KEY,JSON.stringify(arr));}catch(e){toast('❌ Erro ao salvar: armazenamento cheio ou modo privado.');return false;}
  var wc=_cfgWorkerClient();
  if(wc){syncBusy();wc.putConfig('obj_deleted',{list:arr,ts:Date.now()}).then(syncOk).catch(syncErr);}
  else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('obj_deleted').set({list:arr,ts:Date.now()}).then(syncOk).catch(syncErr);}
  return true;
}

function loadObjDeletedIds(cb){
  cb(getObjDeletedIds());
  var wc=_cfgWorkerClient();
  if(wc){
    wc.getConfig('obj_deleted').then(function(doc){
      var list=(doc&&doc.list)?doc.list:getObjDeletedIds();
      try{localStorage.setItem(OBJ_DELETED_KEY,JSON.stringify(list));}catch(e){}
      cb(list);
    }).catch(function(e){console.warn("[obj] sync bg falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('obj_deleted').get().then(function(d){
      var list=(d.exists&&d.data().list)?d.data().list:getObjDeletedIds();
      try{localStorage.setItem(OBJ_DELETED_KEY,JSON.stringify(list));}catch(e){}
      cb(list);
    }).catch(function(e){console.warn("[obj] sync bg falhou",e);});
  }
}

// Retorna a objeção (fixa ou custom) já com eventuais edições do ADM aplicadas por cima.
function _objBancoResolved(id){
  var todosObjs=dicionarioObjecoes.concat(getCustomObjecoes());
  var o=todosObjs.find(function(x){return String(x.id)===String(id);});
  if(!o)return null;
  var edits=getObjEdits();
  var patch=edits[id]||edits[String(id)];
  if(patch)o=Object.assign({},o,patch,{respostas:Object.assign({},o.respostas,patch.respostas||{})});
  return o;
}

function admOpenEditObjecao(id){
  if(!hasAdminAccess()){toast('Apenas ADM pode editar objeções do Banco.');return;}
  var o=_objBancoResolved(id);if(!o)return;
  document.getElementById('edit-obj-id').value=id;
  document.getElementById('edit-obj-texto').value=o.objecao||'';
  document.getElementById('edit-obj-cat').value=o.categoria||'';
  document.getElementById('edit-obj-canal').value=o.canal||'zap_ou_ligacao';
  document.getElementById('edit-obj-ini').value=(o.respostas||{}).iniciante||'';
  document.getElementById('edit-obj-int').value=(o.respostas||{}).intermediario||'';
  document.getElementById('edit-obj-exp').value=(o.respostas||{}).experiente||'';
  openM('mo-obj-edit');
}

function admSaveEditObjecao(){
  var id=document.getElementById('edit-obj-id').value;
  var texto=(document.getElementById('edit-obj-texto').value||'').trim();
  var cat=(document.getElementById('edit-obj-cat').value||'').trim();
  var canal=document.getElementById('edit-obj-canal').value;
  var ini=(document.getElementById('edit-obj-ini').value||'').trim();
  var inter=(document.getElementById('edit-obj-int').value||'').trim();
  var exp=(document.getElementById('edit-obj-exp').value||'').trim();
  if(!texto||!ini){toast('❌ Preencha ao menos a objeção e a resposta iniciante');return;}
  var patch={objecao:texto,categoria:cat||'Geral',canal:canal,respostas:{iniciante:ini,intermediario:inter,experiente:exp}};
  if(String(id).indexOf('custom_')===0){
    var arr=getCustomObjecoes();
    var idx=arr.findIndex(function(o){return String(o.id)===String(id);});
    if(idx<0){toast('Objeção não encontrada.');return;}
    arr[idx]=Object.assign({},arr[idx],patch);
    if(!saveCustomObjecoes(arr))return;
  }else{
    var edits=getObjEdits();
    edits[id]=patch;
    if(!saveObjEdits(edits))return;
  }
  // Registra no feed de atividades da equipe (visível ao ADM em ADM > Feed) que esta
  // objeção do Banco foi editada — quem editou, quando e o canal dela.
  logFeedEvent('obj_edit',S.userId,texto,'Banco de Objeções','dicionario',_canalToFeedTag(canal));
  closeM('mo-obj-edit');
  renderObjBank();
  toast('✅ Objeção atualizada!');
}

function admDeleteBancoObjecao(id){
  if(!hasAdminAccess()){toast('Apenas ADM pode excluir objeções do Banco.');return;}
  // Captura o texto/canal ANTES de excluir, para registrar no feed de atividades da equipe.
  var oRef=_objBancoResolved(id);
  _confirmModal({
    title:'🗑 Remover objeção?',
    msg:'Remover esta objeção do Banco?<br><span style="font-size:.76rem;color:var(--mu)">A objeção deixará de aparecer para toda a equipe.</span>',
    okLabel:'Remover',
    okClass:'bd',
    onOk:function(){
      if(String(id).indexOf('custom_')===0){
        var arr=getCustomObjecoes().filter(function(o){return String(o.id)!==String(id);});
        saveCustomObjecoes(arr);
      }else{
        var del=getObjDeletedIds();
        var sid=String(id);
        if(del.map(String).indexOf(sid)<0)del.push(sid);
        saveObjDeletedIds(del);
      }
      logFeedEvent('obj_delete',S.userId,(oRef&&oRef.objecao)||'Objeção','Banco de Objeções','dicionario',oRef?_canalToFeedTag(oRef.canal):null);
      renderObjBank();toast('Objeção removida');
    }
  });
}

  var USER_OBJ_KEY='lf_user_objecoes';

var _userObjCanal=null;

var _userObjSoMinhas=false;

function getUserObjecoes(){try{return JSON.parse(localStorage.getItem(USER_OBJ_KEY)||'[]');}catch(e){return [];}}

function saveUserObjecoes(arr){
  try{localStorage.setItem(USER_OBJ_KEY,JSON.stringify(arr));}catch(e){toast('❌ Erro ao salvar: armazenamento cheio ou modo privado.');return false;}
  var wc=_cfgWorkerClient();
  if(wc){syncBusy();wc.putConfig('user_objecoes',{list:arr,ts:Date.now()}).then(syncOk).catch(syncErr);}
  else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('user_objecoes').set({list:arr,ts:Date.now()}).then(syncOk).catch(syncErr);}
  return true;
}

function loadUserObjecoes(cb){
  cb(getUserObjecoes());
  var wc=_cfgWorkerClient();
  if(wc){
    wc.getConfig('user_objecoes').then(function(doc){
      var list=(doc&&doc.list)?doc.list:getUserObjecoes();
      try{localStorage.setItem(USER_OBJ_KEY,JSON.stringify(list));}catch(e){}
      cb(list);
    }).catch(function(e){console.warn("[obj] sync bg falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('user_objecoes').get().then(function(d){
      var list=(d.exists&&d.data().list)?d.data().list:getUserObjecoes();
      try{localStorage.setItem(USER_OBJ_KEY,JSON.stringify(list));}catch(e){}
      cb(list);
    }).catch(function(e){console.warn("[obj] sync bg falhou",e);});
  }
}

function userObjFilterCanal(canal,btn){
  _userObjCanal=canal;
  document.querySelectorAll('#dic-pane-equipe .obj-bank-toolbar .canal-filter').forEach(function(b){b.classList.remove('on');});
  if(btn)btn.classList.add('on');
  renderUserObjBank();
}

function userObjFilterAutor(modo,btn){
  _userObjSoMinhas=(modo==='minhas');
  document.getElementById('user-obj-filter-autor-all').classList.toggle('on',modo!=='minhas');
  document.getElementById('user-obj-filter-autor-mine').classList.toggle('on',modo==='minhas');
  renderUserObjBank();
}

function userAddObjecao(){
  var texto=(document.getElementById('new-uobj-texto').value||'').trim();
  var canal=document.getElementById('new-uobj-canal').value;
  var resposta=(document.getElementById('new-uobj-resposta').value||'').trim();
  if(!texto||!resposta){toast('❌ Preencha a objeção e a resposta.');return;}
  var arr=getUserObjecoes();
  arr.push({id:'uobj_'+Date.now(),objecao:texto,canal:canal,resposta:resposta,autorId:S.userId,autorNome:S.nome||'?',criadoEm:Date.now()});
  if(!saveUserObjecoes(arr))return;
  ['new-uobj-texto','new-uobj-resposta'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('new-uobj-canal').value='whatsapp';
  renderUserObjBank();
  toast('✅ Objeção adicionada! Visível para toda a equipe.');
}

function _podeEditarUserObj(o){return hasAdminAccess()||(S&&o.autorId===S.userId);}

function userOpenEditObjecao(id){
  var o=getUserObjecoes().find(function(x){return x.id===id;});
  if(!o)return;
  if(!_podeEditarUserObj(o)){toast('Você só pode editar objeções que você mesmo lançou.');return;}
  document.getElementById('edit-uobj-id').value=id;
  document.getElementById('edit-uobj-texto').value=o.objecao||'';
  document.getElementById('edit-uobj-canal').value=o.canal||'whatsapp';
  document.getElementById('edit-uobj-resposta').value=o.resposta||'';
  openM('mo-user-obj-edit');
}

function userSaveEditObjecao(){
  var id=document.getElementById('edit-uobj-id').value;
  var arr=getUserObjecoes();
  var idx=arr.findIndex(function(o){return o.id===id;});
  if(idx<0){toast('Objeção não encontrada.');return;}
  if(!_podeEditarUserObj(arr[idx])){toast('Você só pode editar objeções que você mesmo lançou.');return;}
  var texto=(document.getElementById('edit-uobj-texto').value||'').trim();
  var canal=document.getElementById('edit-uobj-canal').value;
  var resposta=(document.getElementById('edit-uobj-resposta').value||'').trim();
  if(!texto||!resposta){toast('❌ Preencha a objeção e a resposta.');return;}
  arr[idx]=Object.assign({},arr[idx],{objecao:texto,canal:canal,resposta:resposta});
  if(!saveUserObjecoes(arr))return;
  // Registra no feed de atividades da equipe — o ADM vê quem editou qual objeção da equipe.
  logFeedEvent('obj_edit',S.userId,texto,'Objeção da Equipe (autor: '+(arr[idx].autorNome||'?')+')','dicionario',_canalToFeedTag(canal));
  closeM('mo-user-obj-edit');
  renderUserObjBank();
  toast('✅ Objeção atualizada!');
}

function userDeleteObjecao(id){
  var arr=getUserObjecoes();
  var o=arr.find(function(x){return x.id===id;});
  if(!o)return;
  if(!_podeEditarUserObj(o)){toast('Você só pode excluir objeções que você mesmo lançou.');return;}
  _confirmModal({
    title:'🗑 Remover objeção?',
    msg:'Remover esta objeção da equipe?',
    okLabel:'Remover',
    okClass:'bd',
    onOk:function(){
      saveUserObjecoes(getUserObjecoes().filter(function(x){return x.id!==id;}));
      // Registra no feed de atividades da equipe — o ADM vê quem excluiu qual objeção da equipe.
      logFeedEvent('obj_delete',S.userId,o.objecao,'Objeção da Equipe (autor: '+(o.autorNome||'?')+')','dicionario',_canalToFeedTag(o.canal));
      renderUserObjBank();toast('Objeção removida');
    }
  });
}

function copyObjecaoEquipe(id){
  var o=getUserObjecoes().find(function(x){return x.id===id;});if(!o)return;
  copyToClipboard('Objeção: '+o.objecao+'\n\nResposta: '+o.resposta,'📋 Objeção copiada!');
}

function renderUserObjBank(){
  var el=document.getElementById('user-obj-list');if(!el)return;
  var q=(document.getElementById('user-obj-search')||{}).value||'';
  q=q.toLowerCase().trim();
  var canalLbl={whatsapp:'&#128241; WhatsApp',ligacao:'&#9742;&#65039; Ligação',ambos:'&#128260; Ambos'};
  var list=getUserObjecoes().filter(function(o){
    if(_userObjCanal&&o.canal!==_userObjCanal)return false;
    if(_userObjSoMinhas&&!(S&&o.autorId===S.userId))return false;
    if(!q)return true;
    return (o.objecao||'').toLowerCase().indexOf(q)>=0||(o.resposta||'').toLowerCase().indexOf(q)>=0;
  }).sort(function(a,b){return (b.criadoEm||0)-(a.criadoEm||0);});
  if(!list.length){el.innerHTML='<div class="obj-empty">Nenhuma objeção da equipe encontrada. Que tal adicionar a primeira abaixo?</div>';return;}
  el.innerHTML=list.map(function(o){
    var podeGerenciar=_podeEditarUserObj(o);
    var dt='';try{dt=new Date(o.criadoEm).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){}
    var actions='<div class="obj-card-actions">'
      +'<button class="obj-act-btn copy" onclick="event.stopPropagation();copyObjecaoEquipe(\''+o.id+'\')" title="Copiar">📋</button>'
      +(podeGerenciar?'<button class="obj-act-btn edit" onclick="event.stopPropagation();userOpenEditObjecao(\''+o.id+'\')" title="Editar">✏️</button><button class="obj-act-btn del" onclick="event.stopPropagation();userDeleteObjecao(\''+o.id+'\')" title="Excluir">✕</button>':'')
      +'</div>';
    return '<div class="obj-card"><div class="obj-card-hd"><div class="obj-card-q">'+eH(o.objecao)+'</div><span class="canal-badge '+eH(o.canal)+'">'+(canalLbl[o.canal]||'')+'</span>'+actions+'</div>'
      +'<div class="obj-levels"><div class="obj-level"><div class="obj-level-txt">'+eH(o.resposta)+'</div></div></div>'
      +'<div class="obj-meta"><span class="who">👤 '+eH(o.autorNome||'?')+'</span><span>·</span><span>🗓 '+dt+'</span></div>'
      +'</div>';
  }).join('');
}

  
  /* R14-14: expor funções ao escopo global */
  if(typeof getCustomObjecoes === 'function') global.getCustomObjecoes = getCustomObjecoes;
  if(typeof _cfgWorkerClient === 'function') global._cfgWorkerClient = _cfgWorkerClient;
  if(typeof saveCustomObjecoes === 'function') global.saveCustomObjecoes = saveCustomObjecoes;
  if(typeof loadCustomObjecoes === 'function') global.loadCustomObjecoes = loadCustomObjecoes;
  if(typeof admAddObjecao === 'function') global.admAddObjecao = admAddObjecao;
  if(typeof getObjEdits === 'function') global.getObjEdits = getObjEdits;
  if(typeof saveObjEdits === 'function') global.saveObjEdits = saveObjEdits;
  if(typeof loadObjEdits === 'function') global.loadObjEdits = loadObjEdits;
  if(typeof getObjDeletedIds === 'function') global.getObjDeletedIds = getObjDeletedIds;
  if(typeof saveObjDeletedIds === 'function') global.saveObjDeletedIds = saveObjDeletedIds;
  if(typeof loadObjDeletedIds === 'function') global.loadObjDeletedIds = loadObjDeletedIds;
  if(typeof _objBancoResolved === 'function') global._objBancoResolved = _objBancoResolved;
  if(typeof admOpenEditObjecao === 'function') global.admOpenEditObjecao = admOpenEditObjecao;
  if(typeof admSaveEditObjecao === 'function') global.admSaveEditObjecao = admSaveEditObjecao;
  if(typeof admDeleteBancoObjecao === 'function') global.admDeleteBancoObjecao = admDeleteBancoObjecao;
  if(typeof getUserObjecoes === 'function') global.getUserObjecoes = getUserObjecoes;
  if(typeof saveUserObjecoes === 'function') global.saveUserObjecoes = saveUserObjecoes;
  if(typeof loadUserObjecoes === 'function') global.loadUserObjecoes = loadUserObjecoes;
  if(typeof userObjFilterCanal === 'function') global.userObjFilterCanal = userObjFilterCanal;
  if(typeof userObjFilterAutor === 'function') global.userObjFilterAutor = userObjFilterAutor;
  if(typeof userAddObjecao === 'function') global.userAddObjecao = userAddObjecao;
  if(typeof _podeEditarUserObj === 'function') global._podeEditarUserObj = _podeEditarUserObj;
  if(typeof userOpenEditObjecao === 'function') global.userOpenEditObjecao = userOpenEditObjecao;
  if(typeof userSaveEditObjecao === 'function') global.userSaveEditObjecao = userSaveEditObjecao;
  if(typeof userDeleteObjecao === 'function') global.userDeleteObjecao = userDeleteObjecao;
  if(typeof copyObjecaoEquipe === 'function') global.copyObjecaoEquipe = copyObjecaoEquipe;
  if(typeof renderUserObjBank === 'function') global.renderUserObjBank = renderUserObjBank;

leads.runtime = {
    dicionarioObjecoes: dicionarioObjecoes,
    CUSTOM_OBJ_KEY: CUSTOM_OBJ_KEY,
    getCustomObjecoes: getCustomObjecoes,
    _cfgWorkerClient: _cfgWorkerClient,
    saveCustomObjecoes: saveCustomObjecoes,
    loadCustomObjecoes: loadCustomObjecoes,
    admAddObjecao: admAddObjecao,
    OBJ_EDITS_KEY: OBJ_EDITS_KEY,
    OBJ_DELETED_KEY: OBJ_DELETED_KEY,
    getObjEdits: getObjEdits,
    saveObjEdits: saveObjEdits,
    loadObjEdits: loadObjEdits,
    getObjDeletedIds: getObjDeletedIds,
    saveObjDeletedIds: saveObjDeletedIds,
    loadObjDeletedIds: loadObjDeletedIds,
    _objBancoResolved: _objBancoResolved,
    admOpenEditObjecao: admOpenEditObjecao,
    admSaveEditObjecao: admSaveEditObjecao,
    admDeleteBancoObjecao: admDeleteBancoObjecao,
    USER_OBJ_KEY: USER_OBJ_KEY,
    getUserObjecoes: getUserObjecoes,
    saveUserObjecoes: saveUserObjecoes,
    loadUserObjecoes: loadUserObjecoes,
    userObjFilterCanal: userObjFilterCanal,
    userObjFilterAutor: userObjFilterAutor,
    userAddObjecao: userAddObjecao,
    _podeEditarUserObj: _podeEditarUserObj,
    userOpenEditObjecao: userOpenEditObjecao,
    userSaveEditObjecao: userSaveEditObjecao,
    userDeleteObjecao: userDeleteObjecao,
    copyObjecaoEquipe: copyObjecaoEquipe,
    renderUserObjBank: renderUserObjBank
  };
})(window);
