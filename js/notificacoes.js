/* =====================================================================
 * notificacoes.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// ============================================================
// MOTOR DE AUTOMAÇÕES "SE ISSO, ENTÃO AQUILO" (Feature 1)
// Regras configuráveis pelo ADM (painel ADM > Automações), guardadas em
// localStorage (lf_automation_rules) e replicadas via Firestore (config/automation_rules)
// pra ficarem visíveis em qualquer dispositivo — igual ao padrão já usado por
// admDocs/admLogo. Cada regra tem um quadro (leads/negocios), um gatilho (SE) e
// uma ação (ENTÃO); ao disparar, reusa o sistema de notificações da Feature 2.
//
// LIMITAÇÃO DE ARQUITETURA (documentada, não é bug): como o app não tem backend/cron,
// o motor roda contra os cards já carregados no navegador de CADA consultor (no boot
// e a cada render do próprio Kanban) — não roda em segundo plano nem sobre os cards de
// outros consultores que o usuário atual não tenha carregado. Isso é consistente com o
// resto da arquitetura local-first do projeto: cada consultor "varre" os próprios cards
// quando está com o app aberto.
// ============================================================
// ============================================================
// AUTOMACAO DE LEMBRETE (abre sozinho a tela de "Adicionar Lembrete/Atividade")
// Dispara em 2 situacoes, sempre que ativada (ligada por padrao, com botao pra
// desligar em Configuracoes > Automacao de Lembretes):
//  1) Um card do quadro Negocios entra na etapa "AG Video" ou "Presencial";
//  2) Um Lead vira Negocio (qualquer etapa inicial escolhida).
// So dispara pra 1 card por vez, de uma acao explicita do usuario (mover 1 card,
// converter 1 lead) — nunca em massa (bulk move / conversao em lote), pra nao abrir
// varios modais em sequencia.
// ============================================================
var AUTO_REMINDER_KEY='lf_auto_reminder_on';

function isAutoReminderOn(){var v=sg(AUTO_REMINDER_KEY);return(v===null||v===undefined)?true:!!v;}

function setAutoReminderOn(v){ss(AUTO_REMINDER_KEY,!!v);}
function _notifService(){return window.LiderCRM&&window.LiderCRM.services&&window.LiderCRM.services.notifications||null;}
/* R15-03: som de notificação */
var _notifAudioCtx=null;
function _playNotifSound(){
  try{
    // Toca um beep curto usando Web Audio API (não precisa de arquivo .mp3)
    if(!_notifAudioCtx)_notifAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
    var ctx=_notifAudioCtx;
    if(ctx.state==='suspended')ctx.resume();
    var osc=ctx.createOscillator();
    var gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880,ctx.currentTime); // Lá5
    osc.frequency.setValueAtTime(660,ctx.currentTime+0.1); // Mi5
    gain.gain.setValueAtTime(0.15,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01,ctx.currentTime+0.3);
    osc.start(ctx.currentTime);osc.stop(ctx.currentTime+0.3);
  }catch(e){console.warn('[notif] som falhou',e);}
}


/* Abre o modal de lembrete rapido para um card especifico, sem depender do usuario
   ja estar com o detalhe desse card aberto — usada pelos gatilhos automaticos acima. */
function _autoOpenReminderFor(cardId,board,ownerUid){
  if(!isAutoReminderOn())return;
  if(!S||!S.userId)return;
  var ou=ownerUid||S.userId;
  setTimeout(function(){_kbDetId=cardId;_kbDetBoard=board;_kbDetOwnerUid=ou;openQuickActivity();},260);
}

var AUTOMATION_RULES_KEY='lf_automation_rules';

function getAutomationRules(){return sg(AUTOMATION_RULES_KEY)||[];}

function saveAutomationRules(list){
  ss(AUTOMATION_RULES_KEY,list);
  var svc=_notifService();
  if(DB_MODE==='firebase'&&svc&&typeof svc.saveAutomationRules==='function')svc.saveAutomationRules(list);
}

/* Local-first: desenha na hora com o cache local e só then atualiza em segundo plano. */
function loadAutomationRulesRemote(cb){
  cb(getAutomationRules());
  var svc=_notifService();
  if(DB_MODE==='firebase'&&svc&&typeof svc.loadAutomationRules==='function'){
    svc.loadAutomationRules(function(l){
      _autoLastRun={};
      cb(l);
    });
  }
}

/* Atalho usado no boot e no intervalo periódico: sincroniza as regras e roda o motor
   contra os dois quadros (Leads e Negócios) do próprio usuário logado. */
function _runAutomationEngineBoot(){
  if(!S)return;
  loadAutomationRulesRemote(function(){
    runAutomationEngine('leads',getKB('leads'),S.userId);
    runAutomationEngine('negocios',getKB('negocios'),S.userId);
  });
}

var _autoLastRun={}

 // throttle por board+dono, evita rodar o motor a cada pequena re-renderização
/* Roda as regras ativas contra "list" (cards do quadro "board" pertencentes a "ownerUid").
   Só dispara cada regra UMA VEZ por card (guardado em c._autoFired), pra não repetir
   notificação/ação a cada render. silent não se aplica aqui — ações de automação nunca
   mostram toast individual (evita poluir a tela quando vários cards disparam juntos). */
function runAutomationEngine(board,list,ownerUid){
  if(!list||!list.length)return false;
  var rules=getAutomationRules().filter(function(r){return r.ativo&&r.board===board;});
  if(!rules.length)return false;
  var key=board+'_'+(ownerUid||S.userId);
  var now=Date.now();
  if(_autoLastRun[key]&&(now-_autoLastRun[key])<15000)return false; // no máx. 1x a cada 15s por quadro
  _autoLastRun[key]=now;
  var changed=false;
  var closedCols=['fechado','conv','desc','noshow','desist'];
  // CORREÇÃO (auditoria, motor de automação — cascata entre regras): antes, o gatilho
  // 'col_enter'/'stale' de cada regra lia c.col AO VIVO, que a ação 'move' de uma regra
  // processada antes (mesma chamada, mesma lista) já podia ter alterado. Com duas regras
  // "espelhadas" (ex.: A: entra em X -> move pra Y; B: entra em Y -> move pra X), a Regra B
  // disparava na mesma passada só porque a Regra A tinha acabado de mover o card pra Y,
  // mesmo o card nunca tendo realmente "entrado" em Y do ponto de vista do usuário — eram
  // disparos em cascata dependentes da ordem de criação das regras, não do estado real do
  // quadro no início do ciclo. Agora tiramos uma "foto" da coluna de cada card ANTES de
  // rodar qualquer regra, e usamos essa foto (origCols) para avaliar os gatilhos — a ação
  // ainda grava em c.col normalmente, só a checagem do gatilho fica imune ao que outra
  // regra já fez nesta mesma passada. _autoFired continua garantindo no máx. 1 disparo por
  // regra por card por "entrada" (loop infinito já não era possível; isto é sobre disparo
  // indevido, não sobre loop).
  var origCols={};list.forEach(function(c){origCols[c.id]=c.col;});
  rules.forEach(function(rule){
    list.forEach(function(c){
      if(!c._autoFired)c._autoFired={};
      if(c._autoFired[rule.id])return; // já disparou pra este card nesta "entrada" — evita loop/spam
      var fire=false;
      if(rule.trigger.tipo==='stale'){
        var dias=parseInt(rule.trigger.params.dias,10)||7;
        var last=c.updatedAt||c.createdAt;
        if(last&&closedCols.indexOf(origCols[c.id])<0&&(now-new Date(last).getTime())>dias*86400000)fire=true;
      }else if(rule.trigger.tipo==='col_enter'){
        if(origCols[c.id]===rule.trigger.params.col)fire=true;
      }else if(rule.trigger.tipo==='card_created'){
        if(c.createdAt&&(now-new Date(c.createdAt).getTime())<60000)fire=true;
      }
      if(fire){
        _execAutomationAction(rule,c,board,ownerUid);
        c._autoFired[rule.id]=now;
        changed=true;
      }
    });
  });
  if(changed)saveKBFor(board,ownerUid||S.userId,list);
  return changed;
}

function _automationMsg(rule,c){
  if(rule.trigger.tipo==='stale')return '⏰ "'+c.name+'" parado há '+(parseInt(rule.trigger.params.dias,10)||7)+' dias';
  if(rule.trigger.tipo==='col_enter')return '📍 "'+c.name+'" entrou em "'+_colLabel(rule.board,rule.trigger.params.col)+'"';
  if(rule.trigger.tipo==='card_created')return '🆕 Novo card criado: "'+c.name+'"';
  return 'Regra "'+(rule.nome||'')+'" disparada para "'+c.name+'"';
}

function _execAutomationAction(rule,c,board,ownerUid){
  var act=rule.action||{};
  if(!S||!S.userId)return;
  var ownerUserId=ownerUid||c.userId||S.userId;
  if(act.tipo==='notify'){
    var targetUid=(act.params&&act.params.target==='specific'&&act.params.userId)?act.params.userId:ownerUserId;
    pushNotif(targetUid,'automation',_automationMsg(rule,c),{cardId:c.id,board:board});
  }else if(act.tipo==='move'&&act.params&&act.params.col&&act.params.col!==c.col&&!(board==='leads'&&act.params.col==='conv')){
    // IMPORTANTE: muda "c" diretamente (o mesmo objeto que está dentro do "list" que o
    // runAutomationEngine vai salvar no final, tudo de uma vez). NÃO chama _kbMoveCard
    // aqui — ela faz seu próprio get+save da storage, e como o motor já faz um save em
    // lote no final, as duas escritas colidiam e a movimentação era desfeita pelo save
    // do motor logo em seguida (bug pego em teste antes de entregar a feature).
    c.col=act.params.col;c.updatedAt=new Date().toISOString();
    if(S&&S.userId)logFeedEvent('move',S.userId,c.name,_colLabel(board,act.params.col),board);
  }else if(act.tipo==='create_activity'){
    var p=act.params||{};
    var desc='⚙️ '+(p.desc||'Atividade automática')+' — '+c.name;
    var actObj={id:'auto_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),type:p.actTipo||'task',desc:desc,scheduledAt:null,done:false,read:false,createdAt:new Date().toISOString(),userId:ownerUserId,clientId:c.id,clientNome:c.name,board:board};
    var list2=getActivitiesLocalFor(ownerUserId);list2.unshift(actObj);lfSaveActivitiesFor(ownerUserId,list2);
    if(!c.activities)c.activities=[];c.activities.unshift({id:actObj.id,type:actObj.type,desc:desc,scheduledAt:null,done:false,by:'Automação',createdAt:actObj.createdAt});
    if(ownerUserId===S.userId)updateActBadge();
  }
  _pushHistorico(c,'⚙️ Automação "'+(rule.nome||'Regra')+'" disparada','Automação');
}

// ---- UI do construtor de regras (painel ADM > Automações) ----
function onAutoBoardChange(){
  var board=document.getElementById('auto-board').value;
  var allCols=kbCols(board);
  var triggerOpts=allCols.map(function(c){return '<option value="'+c.id+'">'+eH(c.label)+'</option>';}).join('');
  var moveCols=allCols.filter(function(c){return !(board==='leads'&&c.id==='conv');});
  var moveOpts=moveCols.map(function(c){return '<option value="'+c.id+'">'+eH(c.label)+'</option>';}).join('');
  var c1=document.getElementById('auto-trigger-col'),c2=document.getElementById('auto-action-col');
  if(c1)c1.innerHTML=triggerOpts;
  if(c2)c2.innerHTML=moveOpts;
}

function onAutoTriggerChange(){
  var t=document.getElementById('auto-trigger-tipo').value;
  document.getElementById('auto-trigger-dias-wrap').style.display=(t==='stale')?'block':'none';
  document.getElementById('auto-trigger-col-wrap').style.display=(t==='col_enter')?'block':'none';
}

function onAutoActionChange(){
  var t=document.getElementById('auto-action-tipo').value;
  document.getElementById('auto-action-move-wrap').style.display=(t==='move')?'block':'none';
  document.getElementById('auto-action-act-wrap').style.display=(t==='create_activity')?'block':'none';
  document.getElementById('auto-action-notify-wrap').style.display=(t==='notify')?'block':'none';
}

function onAutoNotifyTargetChange(){
  var sel=document.getElementById('auto-action-notify-target').value;
  document.getElementById('auto-action-notify-uid').style.display=(sel==='specific')?'block':'none';
}

function openAutoRuleEditor(id){
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode gerenciar automações');return;}
  var r=id?getAutomationRules().find(function(x){return x.id===id;}):null;
  document.getElementById('auto-edit-title').textContent=r?'🤖 Editar Regra':'🤖 Nova Regra de Automação';
  document.getElementById('auto-edit-id').value=r?r.id:'';
  document.getElementById('auto-nome').value=r?r.nome:'';
  document.getElementById('auto-board').value=r?r.board:'leads';
  onAutoBoardChange();
  document.getElementById('auto-trigger-tipo').value=r?r.trigger.tipo:'stale';
  onAutoTriggerChange();
  document.getElementById('auto-trigger-dias').value=(r&&r.trigger.params&&r.trigger.params.dias)?r.trigger.params.dias:7;
  if(r&&r.trigger.tipo==='col_enter'&&r.trigger.params.col)document.getElementById('auto-trigger-col').value=r.trigger.params.col;
  document.getElementById('auto-action-tipo').value=r?r.action.tipo:'notify';
  onAutoActionChange();
  if(r&&r.action.tipo==='move'&&r.action.params.col)document.getElementById('auto-action-col').value=r.action.params.col;
  document.getElementById('auto-action-act-tipo').value=(r&&r.action.params&&r.action.params.actTipo)?r.action.params.actTipo:'call';
  document.getElementById('auto-action-act-desc').value=(r&&r.action.params&&r.action.params.desc)?r.action.params.desc:'';
  var nu=getUsers().filter(function(u){return u.ativo;});
  var uSel=document.getElementById('auto-action-notify-uid');
  if(uSel)uSel.innerHTML=nu.map(function(u){return '<option value="'+u.id+'">'+eH(u.nome)+'</option>';}).join('');
  document.getElementById('auto-action-notify-target').value=(r&&r.action.params&&r.action.params.target)||'owner';
  onAutoNotifyTargetChange();
  if(r&&r.action.params&&r.action.params.userId&&uSel)uSel.value=r.action.params.userId;
  document.getElementById('auto-ativo').checked=r?!!r.ativo:true;
  openM('mo-auto-edit');
}

function saveAutoRule(){
  // CORREÇÃO (auditoria — controle de acesso, mesma classe do bug de Duplicatas/Logo/Nome
  // do CRM): só openAutoRuleEditor() tinha hasAdminAccess(); saveAutoRule(), abaixo, e
  // toggleAutoRuleActive()/deleteAutoRule() não tinham — um consultor comum podia chamar
  // essas funções direto (console) e criar/ativar/excluir regra de automação pra equipe
  // inteira, mesmo sem nunca conseguir abrir o editor pela UI.
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode gerenciar automações');return;}
  var nome=(document.getElementById('auto-nome').value||'').trim();if(!nome){toast('Dê um nome à regra');return;}
  var board=document.getElementById('auto-board').value;
  var triggerTipo=document.getElementById('auto-trigger-tipo').value;
  var triggerParams={};
  if(triggerTipo==='stale')triggerParams.dias=parseInt(document.getElementById('auto-trigger-dias').value,10)||7;
  if(triggerTipo==='col_enter')triggerParams.col=document.getElementById('auto-trigger-col').value;
  var actionTipo=document.getElementById('auto-action-tipo').value;
  var actionParams={};
  if(actionTipo==='move')actionParams.col=document.getElementById('auto-action-col').value;
  if(actionTipo==='create_activity'){actionParams.actTipo=document.getElementById('auto-action-act-tipo').value;actionParams.desc=(document.getElementById('auto-action-act-desc').value||'Atividade automática').trim();}
  if(actionTipo==='notify'){actionParams.target=document.getElementById('auto-action-notify-target').value;if(actionParams.target==='specific')actionParams.userId=document.getElementById('auto-action-notify-uid').value;}
  var ativo=document.getElementById('auto-ativo').checked;
  var editId=document.getElementById('auto-edit-id').value;
  var rules=getAutomationRules();
  if(editId){
    var r=rules.find(function(x){return x.id===editId;});
    if(r){r.nome=nome;r.board=board;r.trigger={tipo:triggerTipo,params:triggerParams};r.action={tipo:actionTipo,params:actionParams};r.ativo=ativo;}
  }else{
    rules.push({id:'auto_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),nome:nome,board:board,trigger:{tipo:triggerTipo,params:triggerParams},action:{tipo:actionTipo,params:actionParams},ativo:ativo,createdAt:new Date().toISOString()});
  }
  saveAutomationRules(rules);closeM('mo-auto-edit');renderAutoRules();toast('Regra salva!');
}

function toggleAutoRuleActive(id){
  // CORREÇÃO (auditoria — controle de acesso): ver comentário em saveAutoRule().
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode gerenciar automações');return;}
  var rules=getAutomationRules();var r=rules.find(function(x){return x.id===id;});if(!r)return;
  r.ativo=!r.ativo;saveAutomationRules(rules);renderAutoRules();
}

function deleteAutoRule(id){
  // CORREÇÃO (auditoria — controle de acesso): ver comentário em saveAutoRule().
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode gerenciar automações');return;}
  if(typeof _confirmModal!=='function'){if(confirm('Excluir esta regra de automação?')){var rules=getAutomationRules().filter(function(x){return x.id!==id;});saveAutomationRules(rules);renderAutoRules();toast('Regra excluída');}return;}
  _confirmModal({title:'🗑 Excluir regra?',msg:'Essa automação deixará de funcionar pra todo mundo.',okLabel:'Excluir',okClass:'bd',onOk:function(){
    var rules=getAutomationRules().filter(function(x){return x.id!==id;});saveAutomationRules(rules);renderAutoRules();toast('Regra excluída');
  }});
}

function _autoTriggerLabel(rule){
  if(rule.trigger.tipo==='stale')return 'Parado há '+(parseInt(rule.trigger.params.dias,10)||7)+' dias';
  if(rule.trigger.tipo==='col_enter')return 'Movido para "'+_colLabel(rule.board,rule.trigger.params.col)+'"';
  if(rule.trigger.tipo==='card_created')return 'Card criado';
  return '?';
}

function _autoActionLabel(rule){
  if(rule.action.tipo==='notify'){
    if(rule.action.params.target==='specific'){var u=getUser(rule.action.params.userId);return 'Notificar '+(u?u.nome.split(' ')[0]:'usuário');}
    return 'Notificar responsável';
  }
  if(rule.action.tipo==='move')return 'Mover para "'+_colLabel(rule.board,rule.action.params.col)+'"';
  if(rule.action.tipo==='create_activity')return 'Criar atividade ('+((ACT_TYPES[rule.action.params.actTipo]||{lbl:'?'}).lbl)+')';
  return '?';
}

function renderAutoRules(){
  var el=document.getElementById('auto-rules-list');if(!el)return;
  var rules=getAutomationRules();
  if(!rules.length){el.innerHTML='<div class="est">Nenhuma regra criada ainda. Clique em "+ Nova Regra" pra começar.</div>';return;}
  el.innerHTML=rules.map(function(r){
    return '<div class="tw" style="margin-bottom:8px"><div style="padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">'
      +'<div><div style="font-weight:600;font-size:.84rem;color:'+(r.ativo?'var(--al)':'var(--mu)')+'">'+eH(r.nome)+(r.ativo?'':' (inativa)')+'</div>'
      +'<div style="font-size:.68rem;color:var(--mu);margin-top:2px">'+(r.board==='leads'?'Leads':'Negócios')+' · SE '+eH(_autoTriggerLabel(r))+' → ENTÃO '+eH(_autoActionLabel(r))+'</div></div>'
      +'<div style="display:flex;gap:5px;flex-shrink:0">'
      +'<button class="bc" style="padding:5px 9px;font-size:.66rem;width:auto" onclick="toggleAutoRuleActive(\''+r.id+'\')">'+(r.ativo?'Desativar':'Ativar')+'</button>'
      +'<button class="bc" style="padding:5px 9px;font-size:.66rem;width:auto" onclick="openAutoRuleEditor(\''+r.id+'\')">✎ Editar</button>'
      +'<button class="bc" aria-label="Excluir regra" style="padding:5px 9px;font-size:.66rem;width:auto;color:var(--rl)" onclick="deleteAutoRule(\''+r.id+'\')">🗑</button>'
      +'</div></div></div>';
  }).join('');
}

// ============================================================
// INBOX DE NOTIFICAÇÕES INTERNAS (Feature 2)
// Distinta do painel de "Atividades" acima (que é o lembrete agendado pelo próprio
// usuário) — esta é a caixa de entrada de EVENTOS DO SISTEMA: card transferido pra
// você, atividade atribuída por outro usuário, regra de automação disparada. Não
// depende de permissão de push do navegador — é 100% interna ao app.
// Guardada por usuário DESTINATÁRIO (lf_notif_<userId>). Em modo Firebase, a escrita
// vai pro documento do destinatário (config cross-device); em modo local, só é
// visível se o destinatário usar o mesmo navegador/sessão — limitação esperada de
// um app sem backend central, igual já acontece com o resto do projeto.
// ============================================================
var NTF_ICONS={transfer:'🔄',activity:'🔔',automation:'⚙️'}

var NTF_IC_CLASS={transfer:'meet',activity:'task',automation:'note'}

function notifKey(uid){return 'lf_notif_'+(uid||(S&&S.userId)||'anon');}

function getNotifs(uid){return sg(notifKey(uid))||[];}

function saveNotifsFor(uid,list){
  uid=uid||S.userId;
  list=list.slice(0,150);
  ss(notifKey(uid),list);
  var svc=_notifService();
  if(DB_MODE==='firebase'&&svc&&typeof svc.saveNotifs==='function'){
    var p=svc.saveNotifs(uid,list);
    if(p&&typeof p.catch==='function')p.catch(function(e){console.warn('[notif] saveNotifsFor falhou',e);});
  }
}

/* Busca as notificações do usuário logado no Firestore (pra refletir notificações
   geradas em outro dispositivo/sessão) e cai pro cache local se offline. */
/* Local-first: desenha na hora com o cache local e só then atualiza em segundo plano. */
var _seenNotifIds=null;

/* Compara a lista recebida com a última conhecida e dispara notificação nativa
   (PC/celular) para qualquer item novo e ainda não lido — mesmo comportamento
   de apps de mensagem (Messenger etc): som/alerta do sistema ao chegar algo novo. */
function _alertNewNotifs(list){
  if(!_seenNotifIds){_seenNotifIds=new Set((list||[]).map(function(n){return n.id;}));return;}
  (list||[]).forEach(function(n){
    if(!_seenNotifIds.has(n.id)){
      _seenNotifIds.add(n.id);
      if(!n.lida)fireNativeNotification('🔔 Novo aviso — LIDER CRM',n.text,n.id);
    }
  });
}

function loadNotifsRemote(cb){
  cb=typeof cb==='function'?cb:function(){};
  if(!S||!S.userId){cb([]);return;}
  var uid=S.userId;
  var local=getNotifs(uid);
  _alertNewNotifs(local);
  cb(local);
  var svc=_notifService();
  if(DB_MODE==='firebase'&&svc&&typeof svc.loadNotifs==='function'){
    svc.loadNotifs(uid,function(l){
      l=Array.isArray(l)?l:local;
      try{saveNotifsFor(uid,l);}catch(_e){}
      _alertNewNotifs(l);
      cb(l);
    });
  }
}

/* Cria e entrega uma notificação para o usuário "toUid". type: 'transfer'|'activity'|'automation'.
   opts (opcional): {cardId, board} pra permitir abrir o card direto a partir da notificação. */
function pushNotif(toUid,type,text,opts){
  if(!toUid)return;
  if(toUid===(S&&S.userId))_playNotifSound();
  if(!S||!S.userId)return;
  opts=opts||{};
  var svc=_notifService();
  if(svc&&typeof svc.pushNotif==='function'){
    svc.pushNotif(toUid,type,text,opts);
    return;
  }
  var entry={id:'ntf_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),type:type,text:text,ts:new Date().toISOString(),lida:false,cardId:opts.cardId||null,board:opts.board||null};
  var list=getNotifs(toUid);
  list.unshift(entry);
  if(list.length>200)list=list.slice(0,200);
  saveNotifsFor(toUid,list);
  if(toUid===S.userId)updateNotifBadge();
}

function toggleNotifPanel(){
  var p=document.getElementById('ntf-panel');if(!p)return;
  var willOpen=!p.classList.contains('open');
  var ap=document.getElementById('act-panel');if(ap)ap.classList.remove('open'); // mutuamente exclusivo com o painel de Atividades
  p.classList.toggle('open',willOpen);
  if(willOpen){
    loadNotifsRemote(function(list){
      renderNotifPanel(list);
      list.forEach(function(n){n.lida=true;});
      saveNotifsFor(S.userId,list);
      updateNotifBadge();
    });
  }
}

function renderNotifPanel(list){
  var el=document.getElementById('ntf-list');if(!el)return;
  list=list||getNotifs(S.userId);
  if(!list.length){el.innerHTML='<div class="act-empty">Nenhuma notificação ainda.</div>';return;}
  el.innerHTML=list.slice(0,40).map(function(n){
    var ic=NTF_ICONS[n.type]||'🔔';
    var dt=n.ts?new Date(n.ts).toLocaleString('pt-BR'):'';
    var notifIdJs=_jsSq(n.id);
    return '<div class="act-item'+(n.lida?'':' unread')+'" onclick="notifItemClick(\''+notifIdJs+'\')" tabindex="0" role="button"><div class="act-item-hd"><div class="act-ic '+(NTF_IC_CLASS[n.type]||'task')+'">'+ic+'</div><span class="act-item-name">'+eH(n.text)+'</span><span class="act-item-time">'+dt+'</span></div></div>';
  }).join('');
}

function notifItemClick(id){
  var list=getNotifs(S.userId);var n=list.find(function(x){return x.id===id;});if(!n)return;
  n.lida=true;saveNotifsFor(S.userId,list);renderNotifPanel(list);updateNotifBadge();
  if(n.cardId&&n.board){
    toggleNotifPanel();
    var arr=getKBFor(n.board,S.userId);
    if(arr.some(function(x){return x.id===n.cardId;}))openKBDet(n.cardId,n.board,S.userId);
    else toast('Esse card não está mais disponível');
  }
}

function markAllNotifsRead(){
  var list=getNotifs(S.userId);if(!list.length){toast('Nenhuma notificação');return;}
  list.forEach(function(n){n.lida=true;});saveNotifsFor(S.userId,list);
  renderNotifPanel(list);updateNotifBadge();toast('Tudo marcado como lido');
}

function updateNotifBadge(){
  var list=getNotifs(S.userId);var unread=list.filter(function(n){return !n.lida;}).length;
  var badge=document.getElementById('ntf-badge'),mBadge=document.getElementById('mtb-ntf-badge');
  [badge,mBadge].forEach(function(b){if(!b)return;if(unread>0){b.classList.add('v');b.textContent=unread>9?'9+':unread;}else b.classList.remove('v');});
  var bell=document.getElementById('ntf-bell');
  if(bell&&unread>0){bell.classList.add('ringing');setTimeout(function(){bell.classList.remove('ringing');},1400);}
}
