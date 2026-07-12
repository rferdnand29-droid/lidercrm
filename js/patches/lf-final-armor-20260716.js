(function(){
  if(window.__LF_FINAL_ARMOR__)return;window.__LF_FINAL_ARMOR__=1;

  /* -------- 1) PERSISTÊNCIA OFFLINE DO FIRESTORE -------- */
  function _armorEnablePersistence(){
    try{
      if(typeof firebase==='undefined'||!firebase.firestore)return;
      firebase.firestore().enablePersistence({synchronizeTabs:true})
        .catch(function(err){
          if(err&&err.code==='failed-precondition'){
            console.warn('[armor] outra aba já reservou — sem problemas');
          }else if(err&&err.code==='unimplemented'){
            console.warn('[armor] navegador sem suporte offline — modo memória');
          }
        });
    }catch(e){console.warn('[armor] persistence',e);}
  }

  /* -------- 2) FILA PERSISTENTE DE ESCRITAS QUE FALHARAM --------
     Mantida APENAS para rotinas que ainda não possuem fila própria no app.
     Evita conflito com a fila nativa já existente para KB/automations. */
  var _pending=[];
  try{_pending=JSON.parse(localStorage.getItem('lf_armor_pending')||'[]');}catch(_e){}
  function _saveQueue(){try{localStorage.setItem('lf_armor_pending',JSON.stringify(_pending.slice(-200)));}catch(_e){}}
  function _enqueue(op){_pending.push({t:Date.now(),op:op});_saveQueue();}
  function _replay(){
    if(!_pending.length)return;
    if(typeof firebase==='undefined'||!window.db)return;
    if(!navigator.onLine)return;
    var rest=[];
    var ps=_pending.map(function(it){
      return new Promise(function(done){
        if(!it||!it.op){done();return;}
        try{
          var col=window.db.collection(it.op.col);
          var ref=it.op.doc?col.doc(it.op.doc):col.doc();
          var p=(it.op.type==='update')
            ? ref.update(it.op.data||{})
            : ref.set(it.op.data||{},it.op.options||{merge:true});
          p.then(function(){done();}).catch(function(){rest.push(it);done();});
        }catch(_e){rest.push(it);done();}
      });
    });
    Promise.all(ps).then(function(){
      _pending=rest;_saveQueue();
      if(rest.length===0){
        try{typeof toast==='function'&&toast('✅ Sincronização pendente concluída',2600);}catch(_e){}
      }
    });
  }

  /* -------- 3) WRAPPERS SEM CONFLITO --------
     saveKB/saveKBFor/saveAutomationRules já possuem fila própria no app.
     Aqui blindamos só o que ainda ficava sem replay persistente. */
  function _wrap(origName){
    var orig=window[origName];if(typeof orig!=='function')return;
    window[origName]=function(){
      var a=Array.prototype.slice.call(arguments);
      var r;try{r=orig.apply(this,a);}catch(e){console.warn('[armor] '+origName+' threw',e);}
      try{
        var col='config',opDoc=null,opData=null,opOpts={merge:true};
        if(origName==='saveCli'&&a.length>=2){
          opDoc=a[0];opData={list:a[1],uid:a[0],ts:Date.now()};
          _enqueue({col:'clientes',doc:opDoc,type:'set',data:opData,options:opOpts});
        }else if(origName==='saveDepartmentsList'&&a.length>=1){
          opDoc='departments';opData={list:Array.isArray(a[0])?a[0]:[],ts:Date.now()};
          _enqueue({col:col,doc:opDoc,type:'set',data:opData,options:opOpts});
        }else if(origName==='saveFeed'&&a.length>=1){
          var trimmed=Array.isArray(a[0])?a[0].slice(0,200):[];
          opDoc='feed';opData={list:trimmed,ts:Date.now()};
          _enqueue({col:col,doc:opDoc,type:'set',data:opData,options:opOpts});
        }
      }catch(_e){}
      return r;
    };
  }
  ['saveCli','saveDepartmentsList','saveFeed'].forEach(_wrap);

  /* -------- 4) RECONEXÃO AUTOMÁTICA DO MESSENGER -------- */
  function _chatRevive(){
    try{
      if(typeof firebase==='undefined'||!window.db)return;
      window.db.collection('crm_chat_rooms_v3').limit(1).get()
        .then(function(){try{typeof toast==='function'&&toast('🟢 Messenger reconectado',2200);}catch(_e){}})
        .catch(function(e){
          if(e&&e.code==='permission-denied'){
            console.warn('[armor] messenger bloqueado por regra — verifique Firestore rules');
          }
        });
    }catch(_e){}
  }

  /* -------- 5) EVENTOS DE REDE --------
     Sem toasts duplicados: o app já possui avisos próprios para online/offline. */
  window.addEventListener('online',function(){
    _armorEnablePersistence();
    setTimeout(_replay,400);
    setTimeout(_chatRevive,800);
  });
  window.addEventListener('offline',function(){});
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){
      setTimeout(_replay,500);
      setTimeout(_chatRevive,900);
      try{typeof _sessionsHeartbeat==='function'&&_sessionsHeartbeat();}catch(_e){}
    }
  });
  setInterval(function(){if(navigator.onLine){_replay();_chatRevive();}},30000);

  /* -------- 6) Z-INDEX GUARD -------- */
  function _zGuard(){
    try{
      var ap=document.getElementById('act-panel');if(ap&&parseInt(getComputedStyle(ap).zIndex||'0',10)>490)ap.style.zIndex='480';
      var np=document.getElementById('ntf-panel');if(np&&parseInt(getComputedStyle(np).zIndex||'0',10)>490)np.style.zIndex='480';
      var fab=document.getElementById('lig-fab');if(fab&&parseInt(getComputedStyle(fab).zIndex||'0',10)>480)fab.style.zIndex='475';
    }catch(_e){}
  }

  /* -------- 7) RECUPERAÇÃO DO INITDB -------- */
  var _origInitDB=window.initDB;
  window.initDB=function(){
    if(typeof _origInitDB==='function')_origInitDB();
    setTimeout(_armorEnablePersistence,300);
    setTimeout(_replay,1500);
    setTimeout(_chatRevive,2200);
  };

  /* -------- 8) ERROS GLOBAIS -------- */
  window.addEventListener('error',function(e){
    try{typeof toast==='function'&&toast('⚠️ Erro recuperado automaticamente. Se persistir, Ctrl+R.',2800);}catch(_e){}
    console.error('[armor] window error',e&&e.error);
  });
  window.addEventListener('unhandledrejection',function(e){
    try{typeof toast==='function'&&toast('⚠️ Conexão instável — re-tentando em 2s',2200);}catch(_e){}
    console.warn('[armor] unhandled rejection',e&&e.reason);
    setTimeout(_replay,1500);
  });

  /* -------- 9) SAFE RELOAD -------- */
  window.lfSafeReload=function(){
    var ok=confirm('Recarregar agora?\n\nSe o problema é só conexão, deixe a aba em paz — a blindagem reconecta sozinha e sincroniza tudo o que foi salvo offline.\n\nRecarregar agora?');
    if(ok)window.location.reload();
    else{try{typeof toast==='function'&&toast('Recarregamento cancelado. Reconexão automática em curso.',3000);}catch(_e){}}
  };

  /* -------- 10) INICIALIZAÇÃO IMEDIATA -------- */
  function _boot(){
    _zGuard();
    if(typeof firebase!=='undefined'&&window.db){
      _armorEnablePersistence();
      _replay();
      _chatRevive();
    }else{
      var t=0;
      var iv=setInterval(function(){
        t++;
        if(typeof firebase!=='undefined'&&window.db){
          clearInterval(iv);
          _armorEnablePersistence();
          _replay();
          _chatRevive();
        }else if(t>24){clearInterval(iv);}
      },250);
    }
  }
  if(document.readyState==='complete'||document.readyState==='interactive')setTimeout(_boot,80);
  else document.addEventListener('DOMContentLoaded',function(){setTimeout(_boot,80);});

  console.log('[LF ARMOR v1.1] ativo — sem conflito com a fila nativa, replay para clientes/feed/departments, z-guard e recovery');
})();
