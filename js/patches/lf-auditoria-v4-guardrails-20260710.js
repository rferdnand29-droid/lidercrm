(function(){
  if(window.__LF_AUDITORIA_V4__)return;window.__LF_AUDITORIA_V4__=1;

  var CLOUD_PENDING_KEY='lf13_cloud_pending_ops';
  var _cloudFlushBusy=false,_cloudFlushTm=null;
  var _attUploadLocks=window._attUploadLocks||{};window._attUploadLocks=_attUploadLocks;
  var _admDocUploadLocks=window._admDocUploadLocks||{};window._admDocUploadLocks=_admDocUploadLocks;
  var _attPreviewReqSeq=0,_attPreviewActiveToken=0;
  var _attDownloadBusy=window._attDownloadBusy||{};window._attDownloadBusy=_attDownloadBusy;
  var _moFocusStack=window._moFocusStack||[];window._moFocusStack=_moFocusStack;
  var _kbDetailBase=window._kbDetailBase||{};window._kbDetailBase=_kbDetailBase;
  var _kbEditBase=window._kbEditBase||{};window._kbEditBase=_kbEditBase;

  function _pendingList(){var list=sg(CLOUD_PENDING_KEY);return Array.isArray(list)?list:[];}
  function _savePending(list){ss(CLOUD_PENDING_KEY,list);}
  function _sameOp(a,b){return !!(a&&b&&a.kind===b.kind&&(a.board||'')===(b.board||'')&&(a.uid||'')===(b.uid||'')&&(a.localKey||'')===(b.localKey||''));}
  function _queueCloudSync(op){
    if(!(DB_MODE==='firebase'&&db))return;
    op=Object.assign({kind:'',board:'',uid:'',localKey:'',queuedAt:Date.now()},op||{});
    var list=_pendingList().filter(function(x){return !_sameOp(x,op);});
    list.push(op);
    _savePending(list);
    _scheduleCloudFlush(180);
  }
  function _scheduleCloudFlush(wait){clearTimeout(_cloudFlushTm);_cloudFlushTm=setTimeout(_flushPendingCloudOps,wait||240);}
  function _buildCloudJob(op){
    if(!(DB_MODE==='firebase'&&db)||!op)return null;
    if(op.kind==='kb'&&op.board&&op.uid&&op.localKey){return{ref:db.collection('kb_'+op.board).doc(op.uid),data:{list:sg(op.localKey)||[],ts:Date.now()},merge:false};}
    if(op.kind==='adm_docs'&&op.localKey){return{ref:db.collection('config').doc('adm_docs'),data:{list:sg(op.localKey)||[],ts:Date.now()},merge:false};}
    if(op.kind==='automation_rules'&&op.localKey){return{ref:db.collection('config').doc('automation_rules'),data:{list:sg(op.localKey)||[],ts:Date.now()},merge:false};}
    if(op.kind==='activities'&&op.uid&&op.localKey){return{ref:db.collection('activities').doc(op.uid),data:{list:sg(op.localKey)||[],ts:Date.now()},merge:false};}
    return null;
  }
  function _flushPendingCloudOps(){
    if(_cloudFlushBusy)return;
    if(!(DB_MODE==='firebase'&&db)||navigator.onLine===false)return;
    var list=_pendingList();if(!list.length)return;
    var op=list[0],job=_buildCloudJob(op);
    if(!job){_savePending(list.slice(1));_scheduleCloudFlush(80);return;}
    _cloudFlushBusy=true;
    syncBusy();
    job.ref.set(job.data,{merge:!!job.merge}).then(function(){
      var cur=_pendingList().filter(function(x){return !_sameOp(x,op);});
      _savePending(cur);
      syncOk();
    }).catch(function(err){
      syncErr(err);
    }).then(function(){
      _cloudFlushBusy=false;
      if(_pendingList().length)_scheduleCloudFlush(1400);
    });
  }
  function _hasPendingKBSync(board,uid){return _pendingList().some(function(op){return op&&op.kind==='kb'&&op.board===board&&op.uid===uid;});}
  function _hasPendingAdmDocsSync(){return _pendingList().some(function(op){return op&&op.kind==='adm_docs';});}
  function _hasPendingAutomationRulesSync(){return _pendingList().some(function(op){return op&&op.kind==='automation_rules';});}

  window.addEventListener('online',function(){try{toast('🌐 Conexão restabelecida. Sincronizando em segundo plano...',2600);}catch(_e){} _scheduleCloudFlush(60);},{passive:true});
  window.addEventListener('offline',function(){try{toast('⚠️ Sem conexão. Suas alterações ficam salvas neste aparelho e serão reenviadas automaticamente.',4200);}catch(_e){}},{passive:true});

  var _origBootApp=window.bootApp;
  window.bootApp=function(){var out=_origBootApp.apply(this,arguments);_scheduleCloudFlush(300);return out;};
  var _origStartApp=window.startApp;
  window.startApp=function(){var out=_origStartApp.apply(this,arguments);_scheduleCloudFlush(250);return out;};

  window.saveKB=function(b,list){
    var key=kbKeyFor(b,S.userId),localOk=ss(key,list);
    if(DB_MODE==='firebase'&&db&&localOk){syncBusy();_queueCloudSync({kind:'kb',board:b,uid:S.userId,localKey:key});}
    return localOk;
  };
  window.saveKBFor=function(b,uid,list){
    var key=kbKeyFor(b,uid),localOk=ss(key,list);
    if(DB_MODE==='firebase'&&db&&localOk){syncBusy();_queueCloudSync({kind:'kb',board:b,uid:uid,localKey:key});}
    return localOk;
  };

  window._syncKBRemoteBG=function(board){
    if(DB_MODE!=='firebase'||!db)return;
    if(hasAdminAccess()&&!_kbViewUid[board]){
      var users=getUsers().filter(function(u){return u.ativo;});
      if(!users.find(function(u){return u.id===S.userId;}))users.push({id:S.userId,nome:S.nome||S.userId,ativo:true});
      var pending=users.length;if(!pending)return;
      users.forEach(function(u){
        if(_hasPendingKBSync(board,u.id)){_scheduleCloudFlush(80);pending--;if(pending<=0)renderKBLocal(board);return;}
        // CORREÇÃO (mesma causa do bug "usuário some", aplicada aqui aos cards do Kanban):
        // mesmo com a fila de pendências acima, ainda existia uma pequena janela onde um
        // card recém-criado podia ser sobrescrito por uma leitura antiga do servidor caso
        // essa leitura já estivesse em voo antes do card entrar na fila. Agora, em vez de
        // aceitar cegamente a lista do servidor, mesclamos com o que já está salvo neste
        // aparelho: nenhum card criado aqui é apagado por esta atualização em segundo plano.
        db.collection('kb_'+board).doc(u.id).get().then(function(d){var server=d.exists?(d.data().list||[]):[];var merged=_mergeKeepLocalOnly(server,getKBFor(board,u.id));ss(kbKeyFor(board,u.id),merged);}).catch(function(){}).then(function(){pending--;if(pending<=0)renderKBLocal(board);});
      });
      return;
    }
    var uid=activeUID(board);
    if(_hasPendingKBSync(board,uid)){
      _scheduleCloudFlush(80);
      if(uid===S.userId)runAutomationEngine(board,getKBFor(board,uid),uid);
      renderKBLocal(board);
      return;
    }
    db.collection('kb_'+board).doc(uid).get().then(function(d){var server=d.exists?(d.data().list||[]):[];var merged=_mergeKeepLocalOnly(server,getKBFor(board,uid));ss(kbKeyFor(board,uid),merged);}).catch(function(){}).then(function(){if(uid===S.userId)runAutomationEngine(board,getKBFor(board,uid),uid);renderKBLocal(board);});
  };

  function _sanitizeAutomationRules(list){
    list=Array.isArray(list)?list:[];
    var seen={};
    return list.map(function(r,idx){
      if(!r||typeof r!=='object')return null;
      var board=(r.board==='negocios')?'negocios':'leads';
      var cols=(kbCols(board)||[]).map(function(c){return c.id;});
      var triggerTipo=(r.trigger&&r.trigger.tipo)||'stale';
      if(['stale','col_enter','card_created'].indexOf(triggerTipo)<0)triggerTipo='stale';
      var triggerParams=Object.assign({},(r.trigger&&r.trigger.params)||{});
      if(triggerTipo==='stale')triggerParams={dias:Math.max(1,parseInt(triggerParams.dias,10)||7)};
      if(triggerTipo==='col_enter')triggerParams={col:cols.indexOf(triggerParams.col)>=0?triggerParams.col:(cols[0]||'')};
      if(triggerTipo==='card_created')triggerParams={};
      var actionTipo=(r.action&&r.action.tipo)||'notify';
      if(['notify','move','create_activity'].indexOf(actionTipo)<0)actionTipo='notify';
      var actionParams=Object.assign({},(r.action&&r.action.params)||{});
      if(actionTipo==='move'){
        var moveCols=cols.filter(function(c){return !(board==='leads'&&c==='conv');});
        actionParams={col:moveCols.indexOf(actionParams.col)>=0?actionParams.col:(moveCols[0]||cols[0]||'')};
      }else if(actionTipo==='notify'){
        var target=actionParams.target==='specific'?'specific':'owner';
        var uidOk=target==='specific'&&actionParams.userId&&!!getUser(actionParams.userId);
        actionParams=uidOk?{target:'specific',userId:actionParams.userId}:{target:'owner'};
      }else if(actionTipo==='create_activity'){
        actionParams={actTipo:actionParams.actTipo||'task',desc:(actionParams.desc||'Atividade automática').trim()||'Atividade automática'};
      }
      var id=String(r.id||('auto_fix_'+idx));
      if(seen[id])id=id+'_'+idx;
      seen[id]=1;
      return {id:id,nome:String(r.nome||('Regra '+(idx+1))),board:board,trigger:{tipo:triggerTipo,params:triggerParams},action:{tipo:actionTipo,params:actionParams},ativo:r.ativo!==false,createdAt:r.createdAt||new Date().toISOString()};
    }).filter(Boolean);
  }
  window.getAutomationRules=function(){return _sanitizeAutomationRules(sg(AUTOMATION_RULES_KEY)||[]);};
  window.saveAutomationRules=function(list){
    list=_sanitizeAutomationRules(list);
    var localOk=ss(AUTOMATION_RULES_KEY,list);
    if(DB_MODE==='firebase'&&db&&localOk){syncBusy();_queueCloudSync({kind:'automation_rules',localKey:AUTOMATION_RULES_KEY});}
    return localOk;
  };
  window.loadAutomationRulesRemote=function(cb){
    cb(getAutomationRules());
    if(DB_MODE==='firebase'&&db){
      if(_hasPendingAutomationRulesSync()){_scheduleCloudFlush(80);return;}
      db.collection('config').doc('automation_rules').get().then(function(d){
        var l=(d.exists&&d.data().list)?d.data().list:getAutomationRules();
        l=_sanitizeAutomationRules(l);
        ss(AUTOMATION_RULES_KEY,l);
        _autoLastRun={};
        cb(l);
      }).catch(function(){});
    }
  };

  window.saveAdmDocs=function(list){
    var localOk=ss(ADM_DOCS_KEY,list);
    if(DB_MODE==='firebase'&&db&&localOk){syncBusy();_queueCloudSync({kind:'adm_docs',localKey:ADM_DOCS_KEY});}
    return localOk;
  };
  window.loadAdmDocs=function(cb){
    cb(getAdmDocs());
    if(DB_MODE==='firebase'&&db){
      if(_hasPendingAdmDocsSync()){_scheduleCloudFlush(80);return;}
      db.collection('config').doc('adm_docs').get().then(function(d){
        var list=(d.exists&&d.data().list)?d.data().list:getAdmDocs();
        ss(ADM_DOCS_KEY,list);cb(list);
      }).catch(function(){});
    }
  };

  var _origExecAutomationAction=window._execAutomationAction;
  window._execAutomationAction=function(rule,c,board,ownerUid){
    var act=rule.action||{};
    if(act.tipo==='create_activity'){
      var p=act.params||{};
      var ownerUserId=ownerUid||c.userId||S.userId;
      var desc='⚙️ '+(p.desc||'Atividade automática')+' — '+c.name;
      var actObj={id:'auto_'+Date.now()+'_'+Math.random().toString(36).slice(2,5),type:p.actTipo||'task',desc:desc,scheduledAt:null,done:false,read:false,createdAt:new Date().toISOString(),userId:ownerUserId,clientId:c.id,clientNome:c.name,board:board};
      var list2=getActivitiesLocalFor(ownerUserId);list2.unshift(actObj);
      var actSaved=ss(actKeyFor(ownerUserId),list2);
      if(actSaved&&DB_MODE==='firebase'&&db)_queueCloudSync({kind:'activities',uid:ownerUserId,localKey:actKeyFor(ownerUserId)});
      if(!c.activities)c.activities=[];
      c.activities.unshift({id:actObj.id,type:actObj.type,desc:desc,scheduledAt:null,done:false,by:'Automação',createdAt:actObj.createdAt});
      if(ownerUserId===S.userId)updateActBadge();
      _pushHistorico(c,'⚙️ Automação "'+(rule.nome||'Regra')+'" disparada','Automação');
      return;
    }
    return _origExecAutomationAction.apply(this,arguments);
  };

  function _fileLockKey(prefix,scope,file){return prefix+'|'+scope+'|'+[(file&&file.name)||'',(file&&file.size)||0,(file&&file.type)||'',(file&&file.lastModified)||0].join('|');}
  function _storedFileFp(x){return [x&&x.name||'',x&&x.size||0,x&&x.type||''].join('|');}
  function _incomingFileFp(file){return [(file&&file.name)||'',(file&&file.size)||0,(file&&file.type)||''].join('|');}

  window.processAttFiles=function(files,c,arr,board,uid){
    var scope=[board,uid,c&&c.id||''].join('|');
    var existing=(c&&c.attachments||[]).map(_storedFileFp);
    var valid=(files||[]).filter(function(f){
      if(!_attTypeAllowed(f)){toast('❌ '+f.name+': tipo de arquivo nao permitido');return false;}
      if(existing.indexOf(_incomingFileFp(f))>=0){toast('↩️ '+f.name+' já está anexado neste card.',3200);return false;}
      var lk=_fileLockKey('att',scope,f);
      if(_attUploadLocks[lk]){toast('⏳ '+f.name+' já está sendo anexado.',3200);return false;}
      _attUploadLocks[lk]=1;
      return true;
    });
    if(!valid.length)return;
    var prog=document.getElementById('att-progress'),progLbl=document.getElementById('att-progress-lbl'),progFill=document.getElementById('att-progress-fill');
    if(prog)prog.classList.add('show');
    var done=0,ok=0,total=valid.length;
    function release(file){delete _attUploadLocks[_fileLockKey('att',scope,file)];}
    function finishOne(file){
      release(file);
      done++;
      if(progFill)progFill.style.width=Math.round(done/total*100)+'%';
      if(progLbl)progLbl.textContent='Processando '+done+'/'+total+'...';
      if(done===total){
        var savedOk=saveKBFor(board,uid,arr);
        if(prog)prog.classList.remove('show');
        if(progFill)progFill.style.width='0%';
        if(ok)logAttEvent('upload',c.name,ok+' arquivo(s)',board);
        reRenderAtt();
        if(ok&&savedOk)toast('✅ '+ok+' arquivo(s) anexado(s)!');
        else if(ok&&!savedOk)toast('⚠️ Anexo pode não ter sido salvo — armazenamento local cheio.',4000);
      }
    }
    valid.forEach(function(file){
      var attId='att_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
      if(DB_MODE==='firebase'&&fbStorage){
        var path='attachments/'+board+'/'+uid+'/'+c.id+'/'+attId+'_'+_safeStorageName(file.name);
        _uploadFileToStorage(file,path,function(err,res){
          if(err){toast('❌ Falha ao enviar '+file.name+' para a nuvem.');finishOne(file);return;}
          c.attachments.push({id:attId,name:file.name,type:file.type,url:res.url,storagePath:res.path,size:file.size,uploadedAt:new Date().toISOString(),uploadedBy:S.nome,uploadedById:S.userId});
          ok++;finishOne(file);
        });
      }else{
        var reader=new FileReader();
        reader.onload=function(e){c.attachments.push({id:attId,name:file.name,type:file.type,data:e.target.result,size:file.size,uploadedAt:new Date().toISOString(),uploadedBy:S.nome,uploadedById:S.userId});ok++;finishOne(file);};
        reader.onerror=function(){toast('❌ Erro ao ler o arquivo: '+file.name);finishOne(file);};
        reader.readAsDataURL(file);
      }
    });
  };

  window.togglePinAttachment=function(attId){
    var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
    var uid=(_kbDetOwnerUid||activeUID(board)),arr=getKBFor(board,uid),c=arr.find(function(x){return x.id===id;});if(!c)return;
    if(!c.attachments)c.attachments=[];
    var a=c.attachments.find(function(x){return x.id===attId;});if(!a)return;
    var prev=a.pinned,prevAt=a.pinnedAt||null;
    a.pinned=!a.pinned;a.pinnedAt=a.pinned?new Date().toISOString():null;
    if(!saveKBFor(board,uid,arr)){a.pinned=prev;a.pinnedAt=prevAt;toast('⚠️ Não foi possível alterar o destaque do anexo.',4200);return;}
    logAttEvent(a.pinned?'pin':'unpin',c.name,a.name,board);reRenderAtt();toast(a.pinned?'📌 Anexo fixado':'Anexo desafixado');
  };

  window._confirmRenameAttachment=function(){
    if(!_renameAttId)return;
    var inp=document.getElementById('rename-doc-inp');var novo=(inp?inp.value:'').trim();if(!novo){toast('Digite um nome para o arquivo');return;}
    var board=_kbDetBoard,id=_kbDetId;if(!board||!id){closeM('mo-rename-doc');return;}
    var uid=(_kbDetOwnerUid||activeUID(board)),arr=getKBFor(board,uid),c=arr.find(function(x){return x.id===id;});if(!c){closeM('mo-rename-doc');return;}
    var a=(c.attachments||[]).find(function(x){return x.id===_renameAttId;});if(!a){_renameAttId=null;closeM('mo-rename-doc');return;}
    if(novo===a.name){closeM('mo-rename-doc');_renameAttId=null;return;}
    var nomeAntigo=a.name,prevRenamedAt=a.renamedAt||null,prevRenamedBy=a.renamedBy||null;
    a.name=novo;a.renamedAt=new Date().toISOString();a.renamedBy=S.nome;
    if(!saveKBFor(board,uid,arr)){a.name=nomeAntigo;a.renamedAt=prevRenamedAt;a.renamedBy=prevRenamedBy;toast('⚠️ Não foi possível renomear este anexo.',4200);return;}
    logAttEvent('rename',c.name,nomeAntigo+' → '+novo,board);reRenderAtt();closeM('mo-rename-doc');_renameAttId=null;toast('✏️ Renomeado!');
    var okBtn=document.getElementById('mo-rename-doc');if(okBtn){var btn=okBtn.querySelector('.bp');if(btn)btn.onclick=function(){_confirmRenameAdmDoc();};}
  };

  window.delAttachment=function(attId){
    var canDel=hasAdminAccess();if(!canDel){toast('Sem permissão para excluir anexos');return;}
    var board=_kbDetBoard,id=_kbDetId;if(!board||!id)return;
    var uid=(_kbDetOwnerUid||activeUID(board)),arr=getKBFor(board,uid),c=arr.find(function(x){return x.id===id;});if(!c)return;
    var a=(c.attachments||[]).find(function(x){return x.id===attId;});if(!a)return;
    _confirmModal({title:'🗑 Excluir anexo?',msg:'Excluir o anexo <strong>'+eH(a.name)+'</strong>?<br><span style="font-size:.76rem;color:var(--mu)">Esta ação não pode ser desfeita.</span>',okLabel:'Excluir',okClass:'bd',onOk:function(){
      var nomeArq=a.name,prevList=(c.attachments||[]).slice();
      c.attachments=prevList.filter(function(x){return x.id!==attId;});
      if(!saveKBFor(board,uid,arr)){c.attachments=prevList;toast('⚠️ Não foi possível remover o anexo.',4200);return;}
      _deleteFromStorage(a.storagePath);logAttEvent('delete',c.name,nomeArq,board);reRenderAtt();toast('🗑 Anexo removido');
    }});
  };

  window.processAdmDocFiles=function(files){
    var existing=getAdmDocs().map(_storedFileFp);
    var valid=(files||[]).filter(function(f){
      if(!_admDocTypeAllowed(f)){toast('❌ '+f.name+': tipo de arquivo não permitido');return false;}
      if(existing.indexOf(_incomingFileFp(f))>=0){toast('↩️ '+f.name+' já existe na biblioteca.',3200);return false;}
      var lk=_fileLockKey('admdoc','global',f);
      if(_admDocUploadLocks[lk]){toast('⏳ '+f.name+' já está sendo enviado.',3200);return false;}
      _admDocUploadLocks[lk]=1;
      return true;
    });
    if(!valid.length)return;
    var docs=getAdmDocs(),prog=document.getElementById('adm-docs-progress'),progLbl=document.getElementById('adm-docs-progress-lbl'),progFill=document.getElementById('adm-docs-progress-fill');
    if(prog)prog.classList.add('show');
    var done=0,ok=0,total=valid.length;
    function release(file){delete _admDocUploadLocks[_fileLockKey('admdoc','global',file)];}
    function finishOne(file){
      release(file);
      done++;
      if(progFill)progFill.style.width=Math.round(done/total*100)+'%';
      if(progLbl)progLbl.textContent='Processando '+done+'/'+total+'...';
      if(done===total){
        var savedOk=saveAdmDocs(docs);
        if(prog)prog.classList.remove('show');
        if(progFill)progFill.style.width='0%';
        reRenderAdmDocs();
        if(ok&&savedOk)toast('✅ '+ok+' documento(s) adicionado(s)!');
        else if(ok&&!savedOk)toast('⚠️ Documento pode não ter sido salvo — armazenamento local cheio.',4000);
      }
    }
    valid.forEach(function(file){
      var docId='admdoc_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
      if(DB_MODE==='firebase'&&fbStorage){
        var path='adm_docs/'+docId+'_'+_safeStorageName(file.name);
        _uploadFileToStorage(file,path,function(err,res){
          if(err){toast('❌ Falha ao enviar '+file.name+' para a nuvem.');finishOne(file);return;}
          docs.push({id:docId,name:file.name,type:file.type,url:res.url,storagePath:res.path,size:file.size,uploadedAt:new Date().toISOString(),uploadedBy:S.nome,pinned:false});
          ok++;finishOne(file);
        });
      }else{
        var reader=new FileReader();
        reader.onload=function(e){docs.push({id:docId,name:file.name,type:file.type,data:e.target.result,size:file.size,uploadedAt:new Date().toISOString(),uploadedBy:S.nome,pinned:false});ok++;finishOne(file);};
        reader.onerror=function(){toast('❌ Erro ao ler o arquivo: '+file.name);finishOne(file);};
        reader.readAsDataURL(file);
      }
    });
  };

  window.toggleAdmDocPin=function(docId){
    if(!hasAdminAccess()){toast('Sem permissão');return;}
    var docs=getAdmDocs(),a=docs.find(function(x){return x.id===docId;});if(!a)return;
    var prev=a.pinned;a.pinned=!a.pinned;
    if(!saveAdmDocs(docs)){a.pinned=prev;toast('⚠️ Não foi possível alterar o destaque do documento.',4200);return;}
    reRenderAdmDocs();toast(a.pinned?'📌 Documento fixado':'Documento desafixado');
  };

  window._confirmRenameAdmDoc=function(){
    if(!_renameDocId)return;
    var inp=document.getElementById('rename-doc-inp');var novo=(inp?inp.value:'').trim();if(!novo){toast('Digite um nome para o arquivo');return;}
    var docs=getAdmDocs(),a=docs.find(function(x){return x.id===_renameDocId;});if(!a){_renameDocId=null;closeM('mo-rename-doc');return;}
    if(novo===a.name){closeM('mo-rename-doc');_renameDocId=null;return;}
    var old=a.name;a.name=novo;
    if(!saveAdmDocs(docs)){a.name=old;toast('⚠️ Não foi possível renomear este documento.',4200);return;}
    reRenderAdmDocs();closeM('mo-rename-doc');_renameDocId=null;toast('✏️ Renomeado!');
  };

  window._confirmDelAdmDoc=function(docId){
    var t=document.getElementById('toast');if(t){clearTimeout(t._confirmTm);t.classList.remove('show');}
    if(!hasAdminAccess())return;
    var all=getAdmDocs(),a=all.find(function(x){return x.id===docId;});
    var docs=all.filter(function(x){return x.id!==docId;});
    if(!saveAdmDocs(docs)){toast('⚠️ Não foi possível remover este documento.',4200);return;}
    if(a)_deleteFromStorage(a.storagePath);
    reRenderAdmDocs();toast('🗑 Documento removido');
  };


  function _kbBaseKey(board,uid,id){return [board||'',uid||'',id||''].join('|');}
  function _kbCardStamp(card){return String((card&&(card.updatedAt||card.createdAt||card.ts||''))||'');}
  function _setKBBase(store,board,uid,id,card){if(!store||!board||!uid||!id||!card)return;store[_kbBaseKey(board,uid,id)]={stamp:_kbCardStamp(card),at:Date.now()};}
  function _getKBBase(store,board,uid,id){return store?store[_kbBaseKey(board,uid,id)]||null:null;}
  function _clearKBBase(store,board,uid,id){if(store)delete store[_kbBaseKey(board,uid,id)];}
  function _cloneJson(v){try{return JSON.parse(JSON.stringify(v));}catch(_e){return v;}}
  function _mergeRemoteCardIntoLocal(board,uid,remoteCard){
    if(!remoteCard||!remoteCard.id)return false;
    var arr=getKBFor(board,uid).slice();
    var idx=arr.findIndex(function(x){return x.id===remoteCard.id;});
    if(idx<0)return false;
    arr[idx]=_cloneJson(remoteCard);
    var ok=ss(kbKeyFor(board,uid),arr);
    renderKBLocal(board);
    return ok;
  }
  function _fetchRemoteCardIfPossible(board,uid,cardId,cb){
    if(!(DB_MODE==='firebase'&&db)||navigator.onLine===false||!board||!uid||!cardId){cb(null,null,null);return;}
    db.collection('kb_'+board).doc(uid).get().then(function(d){
      var list=d.exists?(d.data().list||[]):[];
      var card=(list||[]).find(function(x){return x.id===cardId;})||null;
      cb(null,list,card);
    }).catch(function(err){cb(err,null,null);});
  }
  function _reopenEditWithLatest(board,uid,cardId){
    try{closeM('mo-kb');}catch(_e){}
    try{openKBDet(cardId,board,uid,!!window._kbDetReadOnly);}catch(_e){}
    setTimeout(function(){try{editKBFromDet();}catch(_e){}},90);
  }
  function _handleKBConflict(mode,board,uid,cardId,remoteList,remoteCard){
    if(Array.isArray(remoteList)&&!remoteCard){
      if(typeof _syncKBRemoteBG==='function')_syncKBRemoteBG(board);
      if(mode==='edit')try{closeM('mo-kb');}catch(_e){}
      toast('⚠️ Este card já não existe mais na nuvem. Reabra o quadro para confirmar o estado mais recente.',5600);
      return;
    }
    if(!remoteCard){toast('⚠️ Houve alteração concorrente neste card, mas a versão mais recente não pôde ser carregada.',5600);return;}
    _mergeRemoteCardIntoLocal(board,uid,remoteCard);
    _setKBBase(mode==='edit'?_kbEditBase:_kbDetailBase,board,uid,cardId,remoteCard);
    if(mode==='edit'){
      _reopenEditWithLatest(board,uid,cardId);
      toast('⚠️ Este card foi alterado em outro aparelho. A versão mais recente foi recarregada antes de editar.',5600);
      return;
    }
    var keepAtt=false;
    try{keepAtt=!!(document.getElementById('det-pane-att')&&document.getElementById('det-pane-att').classList.contains('on'));}catch(_e){}
    try{openKBDet(cardId,board,uid,!!window._kbDetReadOnly);}catch(_e){}
    if(keepAtt){setTimeout(function(){var btn=document.getElementById('det-tab-att');if(btn&&typeof switchDetTab==='function')switchDetTab('att',btn);},40);}
    toast('⚠️ Este card foi atualizado em outro aparelho. Os campos visíveis foram recarregados para evitar sobrescrever dados.',5600);
  }
  function _guardCardWrite(mode,board,uid,cardId,onSafe){
    var store=mode==='edit'?_kbEditBase:_kbDetailBase;
    var base=_getKBBase(store,board,uid,cardId);
    if(!base||!(DB_MODE==='firebase'&&db)||navigator.onLine===false){onSafe();return;}
    _fetchRemoteCardIfPossible(board,uid,cardId,function(err,remoteList,remoteCard){
      if(err){onSafe();return;}
      if(Array.isArray(remoteList)&&!remoteCard){_handleKBConflict(mode,board,uid,cardId,remoteList,remoteCard);return;}
      var remoteStamp=_kbCardStamp(remoteCard);
      if(base.stamp&&remoteStamp&&remoteStamp!==base.stamp){_handleKBConflict(mode,board,uid,cardId,remoteList,remoteCard);return;}
      onSafe(remoteCard);
    });
  }

  var _origOpenKBDetAudit=window.openKBDet;
  window.openKBDet=function(cardId,board,ownerUid,readOnly){
    var out=_origOpenKBDetAudit.apply(this,arguments);
    try{
      var uid=ownerUid||activeUID(board);
      var arr=getKBFor(board,uid)||[];
      var c=arr.find(function(x){return x.id===cardId;});
      if(c)_setKBBase(_kbDetailBase,board,uid,cardId,c);
    }catch(_e){}
    return out;
  };

  var _origEditKBFromDetAudit=window.editKBFromDet;
  window.editKBFromDet=function(){
    var board=window._kbDetBoard,id=window._kbDetId,uid=(window._kbDetOwnerUid||activeUID(board));
    var out=_origEditKBFromDetAudit.apply(this,arguments);
    try{
      var arr=getKBFor(board,uid)||[];
      var c=arr.find(function(x){return x.id===id;});
      if(c)_setKBBase(_kbEditBase,board,uid,id,c);
    }catch(_e){}
    return out;
  };

  var _origAutoSaveKBObsAudit=window.autoSaveKBObs;
  window.autoSaveKBObs=function(){
    var board=window._kbDetBoard,id=window._kbDetId;if(!board||!id)return;
    var uid=(window._kbDetOwnerUid||activeUID(board));
    _guardCardWrite('detail',board,uid,id,function(){
      _origAutoSaveKBObsAudit.apply(this,arguments);
      try{var arr=getKBFor(board,uid)||[];var c=arr.find(function(x){return x.id===id;});if(c)_setKBBase(_kbDetailBase,board,uid,id,c);}catch(_e){}
    });
  };

  var _origAutoSaveKBValorAudit=window.autoSaveKBValor;
  window.autoSaveKBValor=function(){
    var board=window._kbDetBoard,id=window._kbDetId;if(!board||!id)return;
    var uid=(window._kbDetOwnerUid||activeUID(board));
    _guardCardWrite('detail',board,uid,id,function(){
      _origAutoSaveKBValorAudit.apply(this,arguments);
      try{var arr=getKBFor(board,uid)||[];var c=arr.find(function(x){return x.id===id;});if(c)_setKBBase(_kbDetailBase,board,uid,id,c);}catch(_e){}
    });
  };

  var _origSaveKBCardAudit=window.saveKBCard;
  window.saveKBCard=function(){
    var editId=(document.getElementById('kb-edit-id')||{}).value;
    if(!editId)return _origSaveKBCardAudit.apply(this,arguments);
    var board=(document.getElementById('kb-board-type')||{}).value||window._kbEditBoard;
    var uid=(window._kbEditOwnerUid||activeUID(board));
    _guardCardWrite('edit',board,uid,editId,function(){
      _origSaveKBCardAudit.apply(this,arguments);
      try{var arr=getKBFor(board,uid)||[];var c=arr.find(function(x){return x.id===editId;});if(c)_setKBBase(_kbEditBase,board,uid,editId,c);}catch(_e){}
    });
  };

  function _attDownloadKey(scope,id,a){return [scope||'',id||'',(a&&a.name)||'',(a&&a.size)||0].join('|');}
  function _safeDownloadAttachment(a,key){
    if(!a)return;
    if(_attDownloadBusy[key]){toast('⏳ Preparando download: '+a.name,2800);return;}
    _attDownloadBusy[key]=1;
    if(a.url&&!a.data)toast('⏳ Preparando download: '+a.name,2200);
    _attDownloadHref(a,function(href){
      delete _attDownloadBusy[key];
      if(!href){toast('❌ Não foi possível baixar este arquivo.');return;}
      var link=document.createElement('a');link.href=href;link.download=a.name;
      document.body.appendChild(link);link.click();document.body.removeChild(link);
      if(/^blob:/i.test(href)&&!a.data){setTimeout(function(){try{URL.revokeObjectURL(href);}catch(_e){}},15000);}
      toast('⬇ Baixando: '+a.name);
    });
  }

  var _origViewAttachmentAudit=window.viewAttachment;
  window.viewAttachment=function(attId){_attPreviewActiveToken=++_attPreviewReqSeq;return _origViewAttachmentAudit.apply(this,arguments);};
  var _origViewAdmDocAudit=window.viewAdmDoc;
  window.viewAdmDoc=function(docId){_attPreviewActiveToken=++_attPreviewReqSeq;return _origViewAdmDocAudit.apply(this,arguments);};

  window._attPreviewPdf=function(a,ab,attId,downloadFn){
    var reqToken=_attPreviewActiveToken||(++_attPreviewReqSeq);
    _attPreviewActiveToken=reqToken;
    function stillActive(){return reqToken===_attPreviewActiveToken&&document.getElementById('mo-att-view')&&document.getElementById('mo-att-view').classList.contains('open');}
    function fallback(){
      if(!stillActive()||!ab)return;
      var attIdJs=_jsSq(attId);
      ab.innerHTML='<div style="padding:30px;color:var(--mu);font-size:.82rem">Não foi possível pré-visualizar este PDF. <button class="bp" style="margin-top:12px" onclick="'+downloadFn+'(\''+attIdJs+'\')">⬇ Baixar arquivo</button></div>';
    }
    function renderBlob(blob){
      if(!stillActive()||!ab)return;
      try{_releaseAttViewBlobUrl();}catch(_e){}
      var bUrl=URL.createObjectURL(blob);
      _attViewBlobUrl=bUrl;
      if(stillActive())ab.innerHTML='<iframe src="'+bUrl+'" style="width:100%;height:65vh;border:none;border-radius:8px"></iframe>';
    }
    if(a.data){
      var bUrl=_dataUrlToBlobUrl(a.data);
      if(!stillActive()||!ab)return;
      ab.innerHTML=bUrl?'<iframe src="'+bUrl+'" style="width:100%;height:65vh;border:none;border-radius:8px"></iframe>':'';
      _attViewBlobUrl=bUrl;
      if(!bUrl)fallback();
      return;
    }
    if(a.url){
      if(ab)ab.innerHTML='<div style="padding:40px;text-align:center;color:var(--mu);font-size:.8rem"><div class="spinner-sm" style="margin:0 auto 10px"></div>Carregando pré-visualização...'+(a.size&&a.size>8*1024*1024?'<div style="margin-top:8px;font-size:.72rem">Arquivo grande, isso pode levar alguns segundos.</div>':'')+'</div>';
      fetch(a.url).then(function(r){return r.blob();}).then(function(blob){renderBlob(blob);}).catch(function(){fallback();});
      return;
    }
    fallback();
  };

  window.downloadAttachment=function(attId){
    if(!attId)return;
    var board=window._kbDetBoard,id=window._kbDetId;if(!board||!id)return;
    var uid=(window._kbDetOwnerUid||activeUID(board));
    var arr=getKBFor(board,uid)||[];var c=arr.find(function(x){return x.id===id;});if(!c)return;
    var a=(c.attachments||[]).find(function(x){return x.id===attId;});if(!a)return;
    _safeDownloadAttachment(a,_attDownloadKey('card',attId,a));
  };

  window.downloadAdmDoc=function(docId){
    if(!docId)return;
    var docs=getAdmDocs()||[];var a=docs.find(function(x){return x.id===docId;});if(!a)return;
    _safeDownloadAttachment(a,_attDownloadKey('admdoc',docId,a));
  };

  window.runAutomationEngine=function(board,list,ownerUid){
    if(!list||!list.length)return false;
    var rules=getAutomationRules().filter(function(r){return r.ativo&&r.board===board;});
    if(!rules.length)return false;
    var key=board+'_'+(ownerUid||S.userId);
    var now=Date.now();
    if(_autoLastRun[key]&&(now-_autoLastRun[key])<15000)return false;
    _autoLastRun[key]=now;
    var changed=false;
    var closedCols=['fechado','conv','desc','noshow','desist'];
    var origCols={};list.forEach(function(c){origCols[c.id]=c.col;});
    var movedThisPass={};
    var execCount={};
    rules.forEach(function(rule){
      list.forEach(function(c){
        if(!c._autoFired)c._autoFired={};
        if(c._autoFired[rule.id])return;
        if((execCount[c.id]||0)>=4)return;
        if(rule.action&&rule.action.tipo==='move'&&movedThisPass[c.id])return;
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
        if(!fire)return;
        _execAutomationAction(rule,c,board,ownerUid);
        c._autoFired[rule.id]=now;
        execCount[c.id]=(execCount[c.id]||0)+1;
        if(rule.action&&rule.action.tipo==='move')movedThisPass[c.id]=1;
        changed=true;
      });
    });
    if(changed)saveKBFor(board,ownerUid||S.userId,list);
    return changed;
  };

  function _ensureAuditModalStackStyle(){
    if(document.getElementById('lf-audit-modal-stack-style'))return;
    var st=document.createElement('style');
    st.id='lf-audit-modal-stack-style';
    st.textContent='@media (max-width:768px){.mo[data-modal-depth]{padding-top:max(env(safe-area-inset-top),0px)}.mo[aria-hidden="true"] .mb{pointer-events:none}.mo[data-modal-depth="2"] .mb,.mo[data-modal-depth="3"] .mb,.mo[data-modal-depth="4"] .mb{max-height:calc(var(--vvh,100vh) - env(safe-area-inset-top));margin-top:auto}}';
    document.head.appendChild(st);
  }

  var _origOpenMStackAudit=window.openM;
  window.openM=function(id){
    var opener=document.activeElement;
    _ensureAuditModalStackStyle();
    var out=_origOpenMStackAudit.apply(this,arguments);
    var e=document.getElementById(id);
    for(var i=_moFocusStack.length-1;i>=0;i--){if(_moFocusStack[i].id===id)_moFocusStack.splice(i,1);}
    _moFocusStack.push({id:id,opener:opener});
    var openMos=[].slice.call(document.querySelectorAll('.mo.open'));
    openMos.forEach(function(m,idx){m.dataset.modalDepth=String(idx+1);if(m.id!==id)m.setAttribute('aria-hidden','true');else m.removeAttribute('aria-hidden');});
    return out;
  };

  var _origCloseMStackAudit=window.closeM;
  window.closeM=function(id){
    var out=_origCloseMStackAudit.apply(this,arguments);
    for(var i=_moFocusStack.length-1;i>=0;i--){if(_moFocusStack[i].id===id){_moFocusStack.splice(i,1);break;}}
    var openMos=[].slice.call(document.querySelectorAll('.mo.open'));
    openMos.forEach(function(m,idx){m.dataset.modalDepth=String(idx+1);if(idx<openMos.length-1)m.setAttribute('aria-hidden','true');else m.removeAttribute('aria-hidden');});
    if(openMos.length){
      var topMo=openMos.reduce(function(a,b){return (parseInt(window.getComputedStyle(b).zIndex,10)||0)>=(parseInt(window.getComputedStyle(a).zIndex,10)||0)?b:a;});
      var focusables=[].slice.call(topMo.querySelectorAll('input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(function(el){return el.offsetParent!==null;});
      if(focusables[0])setTimeout(function(){try{focusables[0].focus();}catch(_e){}},0);
    }
    if(id==='mo-kb-det'){try{_clearKBBase(_kbDetailBase,window._kbDetBoard,window._kbDetOwnerUid,window._kbDetId);}catch(_e){}}
    if(id==='mo-kb'){try{_clearKBBase(_kbEditBase,window._kbEditBoard,window._kbEditOwnerUid,window._kbEditId);}catch(_e){}}
    return out;
  };

  function _ensureAuditModalPatch(){
    if(document.getElementById('lf-audit-modal-hotfix-style'))return;
    var st=document.createElement('style');
    st.id='lf-audit-modal-hotfix-style';
    st.textContent='@media (max-width:768px){.mo{padding:max(env(safe-area-inset-top),0px) 0 0 0;align-items:flex-end}.mo .mb{width:100vw;max-width:none;margin:0;border-radius:18px 18px 0 0;max-height:calc(var(--vvh,100vh) - env(safe-area-inset-top));padding-bottom:calc(16px + env(safe-area-inset-bottom));overscroll-behavior:contain}#mo-kb-det .mb,#mo-att-view .mb,#mo-auto-edit .mb,#mo-confirm-del .mb,#mo-rename-doc .mb{height:min(calc(var(--vvh,100vh) - env(safe-area-inset-top)),100dvh);max-height:none}.mbtns{position:sticky;bottom:0;background:linear-gradient(180deg,rgba(17,20,24,0),rgba(17,20,24,.94) 24%,rgba(17,20,24,.98));padding-bottom:calc(10px + env(safe-area-inset-bottom));margin-bottom:calc(-10px - env(safe-area-inset-bottom))}#mo-att-view #att-view-body iframe,#mo-att-view #att-view-body video,#mo-att-view #att-view-body audio{max-height:48vh}}';
    document.head.appendChild(st);
  }
  function _fitAuditModals(){
    _ensureAuditModalPatch();
    try{_syncViewportMetrics();}catch(_e){}
    if(window.innerWidth>768)return;
    document.querySelectorAll('.mo.open .mb').forEach(function(mb){mb.style.maxHeight='calc(var(--vvh,100vh) - env(safe-area-inset-top))';});
  }
  var _origOpenM=window.openM;
  window.openM=function(id){_ensureAuditModalPatch();var out=_origOpenM.apply(this,arguments);requestAnimationFrame(_fitAuditModals);return out;};
  window.addEventListener('resize',function(){requestAnimationFrame(_fitAuditModals);},{passive:true});
  if(window.visualViewport){window.visualViewport.addEventListener('resize',function(){requestAnimationFrame(_fitAuditModals);},{passive:true});window.visualViewport.addEventListener('scroll',function(){requestAnimationFrame(_fitAuditModals);},{passive:true});}
})();
