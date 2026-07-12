(function(){
  if(window.__LF_ROBUSTNESS_ARMOR_20260711B__)return;
  window.__LF_ROBUSTNESS_ARMOR_20260711B__=1;

  var _roomRetryTm=null,_msgRetryTm=null,_healTm=null;
  var _roomRetryCount=0,_msgRetryCount=0,_healBusy=0;

  function _rtDelay(n){return Math.min(15000,Math.round(800*Math.pow(1.8,Math.max(0,n||0))));}
  function _uidNow(){try{return typeof me==='function'?me():((window.S&&S.userId)||'');}catch(_e){return '';}}
  function _safeToast(msg,dur){try{if(typeof toast==='function')toast(msg,dur||2600);}catch(_e){}}
  function _recoverable(err){var c=String(err&&err.code||'');return !c||c==='unavailable'||c==='deadline-exceeded'||c==='aborted'||c==='resource-exhausted'||c==='failed-precondition';}
  function _authErr(err){var c=String(err&&err.code||'');return c==='unauthenticated'||c==='auth/network-request-failed';}
  function _permErr(err){return String(err&&err.code||'')==='permission-denied';}
  function _later(fn,ms){return setTimeout(function(){try{fn();}catch(_e){}},ms||0);}
  function _chatPageEl(){return document.getElementById('chat-page');}

  function _ensureAnon(cb){
    try{
      if(typeof firebase==='undefined'||!firebase.auth||!(DB_MODE==='firebase'&&window.db)){cb(false);return;}
      var auth=firebase.auth();
      if(auth.currentUser){cb(true);return;}
      auth.signInAnonymously().then(function(){cb(true);}).catch(function(err){console.warn('[robust] reauth falhou',err);cb(false);});
    }catch(err){console.warn('[robust] ensureAnon',err);cb(false);}
  }

  function _scheduleRoomRetry(silent){
    if(_roomRetryTm||!(DB_MODE==='firebase'&&window.db))return;
    var wait=_rtDelay(++_roomRetryCount);
    if(!silent)_safeToast('Reconectando conversas em segundo plano…',2400);
    _roomRetryTm=setTimeout(function(){
      _roomRetryTm=null;
      if(navigator.onLine===false)return;
      _ensureAnon(function(){try{if(typeof startRooms==='function')startRooms();}catch(_e){}});
    },wait);
  }

  function _scheduleMsgRetry(roomId,silent){
    if(_msgRetryTm||!roomId||!(DB_MODE==='firebase'&&window.db))return;
    var wait=_rtDelay(++_msgRetryCount);
    if(!silent)_safeToast('Reconectando a conversa em segundo plano…',2400);
    _msgRetryTm=setTimeout(function(){
      _msgRetryTm=null;
      if(navigator.onLine===false)return;
      _ensureAnon(function(){
        try{
          if(window.C&&C.roomMap&&C.roomMap[roomId]&&typeof openRoom==='function')openRoom(roomId,true);
        }catch(_e){}
      });
    },wait);
  }

  function _softHeal(origin){
    clearTimeout(_healTm);
    if(_healBusy)return;
    _healBusy=1;
    _healTm=setTimeout(function(){
      _healBusy=0;
      try{
        var app=document.getElementById('app');
        if(app&&app.classList.contains('vis')&&!document.querySelector('.pg.on')&&typeof goPage==='function'){
          goPage(window.__lfLastPage||'dash');
        }
      }catch(_e){}
      try{
        if(_chatPageEl()&&typeof ensureMarkup==='function')ensureMarkup();
        if(_chatPageEl()&&typeof renderAll==='function')renderAll();
      }catch(_e){}
      try{
        if(typeof activeRoom==='function'){
          var ar=activeRoom();
          if(ar&&ar.id&&navigator.onLine!==false&&typeof openRoom==='function')openRoom(ar.id,true);
        }
      }catch(_e){}
      try{
        var ag=document.getElementById('pg-agenda');
        if(ag&&ag.classList.contains('on')&&typeof agdListen==='function')agdListen();
      }catch(_e){}
      try{
        var cfg=document.getElementById('pg-config');
        if(cfg&&cfg.classList.contains('on')&&typeof renderConfig==='function')renderConfig();
      }catch(_e){}
    }, origin==='watchdog'?220:120);
  }

  if(typeof window.goPage==='function'&&!window.goPage._lfRobustWrapped){
    var _origGoPage=window.goPage;
    window.goPage=function(p){
      window.__lfLastPage=p||window.__lfLastPage||'dash';
      try{return _origGoPage.apply(this,arguments);}catch(err){console.error('[robust] goPage',err);_safeToast('⚠️ A tela falhou, recuperando automaticamente…',2800);_later(function(){_softHeal('goPage');},100);}
    };
    window.goPage._lfRobustWrapped=1;
  }
  if(!window.__lfLastPage)window.__lfLastPage='dash';

  window.lfSafeReload=function(){
    _safeToast('Recuperando sem recarregar a página…',2400);
    _softHeal('safe-reload');
    _scheduleRoomRetry(true);
    try{var ar=typeof activeRoom==='function'&&activeRoom();if(ar&&ar.id)_scheduleMsgRetry(ar.id,true);}catch(_e){}
  };

  if(typeof window.startRooms==='function'){
    window.startRooms=function(){
      var uid0=_uidNow();
      if(!(DB_MODE==='firebase'&&window.db&&uid0))return;
      stopRooms();
      if(typeof _chatSetSync==='function')_chatSetSync('busy','Sincronizando conversas…');
      var seq=(window.__lfRoomListSeq||0)+1;window.__lfRoomListSeq=seq;
      try{
        C.roomUnsub=db.collection(ROOM_COL).where('memberIds','array-contains',uid0).onSnapshot(function(snap){
          if(window.__lfRoomListSeq!==seq)return;
          _roomRetryCount=0;
          var prevActive=C.active,prevMap=C.roomMap||{},wasRoomOpen=(typeof _chatRoomOpen==='function'?_chatRoomOpen():false),list=[];
          snap.forEach(function(doc){
            var d=doc.data()||{};
            d.id=doc.id;
            d.createdAt=ms(d.createdAt||d.createdAtMs||d.ts)||d.createdAt||0;
            d.updatedAt=ms(d.updatedAt||d.updatedAtMs)||d.lastMessageAt||0;
            d.lastMessageAt=ms(d.lastMessageAt)||d.lastMessageAt||0;
            d.memberIds=d.memberIds||[];
            d.memberState=d.memberState||{};
            d.deptIds=d.deptIds||[];
            d.adminIds=d.adminIds||[];
            d.blockedUserIds=d.blockedUserIds||[];
            if(typeof v4CanSeeRoom!=='function'||v4CanSeeRoom(d)){
              list.push(d);
              try{if(typeof notifyIfNeeded==='function')notifyIfNeeded(d);}catch(_e){}
            }
          });
          list.sort(roomSort);
          var nextMap={};list.forEach(function(r){nextMap[r.id]=r;});
          C.rooms=list;C.roomMap=nextMap;
          var sig=list.map(function(r){return typeof _chatRoomSig==='function'?_chatRoomSig(r):(String(r.id||'')+'|'+String(r.updatedAt||0)+'|'+String(r.lastMessageAt||0));}).join('§');
          var roomsChanged=sig!==C._lastRoomsSig;
          C._lastRoomsSig=sig;
          var activeTypingChanged=!!(prevActive&&prevMap[prevActive]&&nextMap[prevActive]&&(typeof _chatTypingSig==='function'?(_chatTypingSig(prevMap[prevActive])!==_chatTypingSig(nextMap[prevActive])):false));
          if(roomsChanged)renderRooms();
          updateNavBadge();
          try{populateDeptSelects();}catch(_e){}
          if(C.pendingOpenId&&nextMap[C.pendingOpenId]){
            var want=C.pendingOpenId;C.pendingOpenId=null;openRoom(want,false);if(typeof _chatSetSync==='function')_chatSetSync('ok','Conversa pronta');return;
          }
          if(prevActive&&nextMap[prevActive]){
            if(C.active!==prevActive||!C.msgUnsub)openRoom(prevActive,!(wasRoomOpen&&isMobileView()));
            else if(activeTypingChanged||roomsChanged)renderHeader();
            if(wasRoomOpen&&isMobileView()&&_chatPageEl())_chatPageEl().classList.add('room-open');
          }else if(!C.active&&list.length&&C.filter!=='archived'){
            if(isMobileView()){
              C.active=null;C.msgs=[];renderHeader();closeRoomMobile();
            }else{
              openRoom(list[0].id,false);
            }
          }else if(C.active&&!nextMap[C.active]){
            C.active=null;C.msgs=[];renderHeader();renderMsgs();if(isMobileView())closeRoomMobile();
          }else if(roomsChanged||activeTypingChanged){
            renderHeader();
          }
          if(typeof _chatSetSync==='function')_chatSetSync('ok','Sincronizado');
        },function(err){
          if(window.__lfRoomListSeq!==seq)return;
          console.warn('[robust] room-list listener',err);
          try{if(typeof syncErr==='function')syncErr(err);}catch(_e){}
          if(typeof _chatSetSync==='function')_chatSetSync('error',_permErr(err)?'Sem permissão para listar conversas':'Falha ao sincronizar');
          if(_authErr(err)){_ensureAnon(function(ok){if(ok)_scheduleRoomRetry(true);});return;}
          if(_permErr(err)){_safeToast('⚠️ O Firestore recusou a lista de conversas. A sessão local segue aberta.',4200);return;}
          if(_recoverable(err)||navigator.onLine===false)_scheduleRoomRetry(false);
        });
      }catch(err){
        console.error('[robust] startRooms',err);
        if(typeof _chatSetSync==='function')_chatSetSync('error','Falha ao iniciar conversas');
        _scheduleRoomRetry(false);
      }
    };
  }

  window.openRoom=function(id,silent){
    if(!id||!window.C||!C.roomMap||!C.roomMap[id])return;
    var preserveMobile=(typeof _chatRoomOpen==='function'&&_chatRoomOpen())||silent===false||C.pendingOpenId===id;
    C.forceScrollBottom=true;
    if(C.active===id&&C.msgUnsub){
      renderRooms();renderHeader();
      if(!silent&&_chatPageEl())_chatPageEl().classList.add('room-open');
      requestAnimationFrame(function(){try{if(typeof _chatAutoFocusComposer==='function')_chatAutoFocusComposer(false);}catch(_e){}});
      if(typeof _chatSetSync==='function')_chatSetSync('ok','Conversa pronta');
      return;
    }
    C.active=id;
    renderRooms();renderHeader();
    if(!silent&&_chatPageEl())_chatPageEl().classList.add('room-open');
    if(C.msgUnsub)try{C.msgUnsub();}catch(_e){}
    if(!(DB_MODE==='firebase'&&window.db)){
      requestAnimationFrame(function(){try{if(typeof _chatAutoFocusComposer==='function')_chatAutoFocusComposer(false);}catch(_e){}});
      return;
    }
    var roomId=id;
    var seq=(window.__lfMsgStreamSeq||0)+1;window.__lfMsgStreamSeq=seq;
    if(typeof _chatSetSync==='function')_chatSetSync('busy','Abrindo conversa…');
    try{
      C.msgUnsub=db.collection(ROOM_COL).doc(roomId).collection('messages').orderBy('createdAt','asc').onSnapshot(function(snap){
        if(window.__lfMsgStreamSeq!==seq||C.active!==roomId)return;
        _msgRetryCount=0;
        var arr=[];
        snap.forEach(function(doc){
          var m=doc.data()||{};
          m.id=doc.id;
          m.createdAt=ms(m.createdAt)||m.createdAt||0;
          m.replyTo=m.replyTo||null;
          m.attachments=m.attachments||[];
          m.deliveredTo=m.deliveredTo||{};
          m.readBy=m.readBy||{};
          arr.push(m);
        });
        C.msgs=arr;
        renderMsgs();
        markRead(activeRoom());
        if(typeof _chatSetSync==='function')_chatSetSync('ok','Conversa pronta');
      },function(err){
        if(window.__lfMsgStreamSeq!==seq||C.active!==roomId)return;
        console.warn('[robust] msg-listener',roomId,err);
        try{if(typeof syncErr==='function')syncErr(err);}catch(_e){}
        if(typeof _chatSetSync==='function')_chatSetSync('error',_permErr(err)?'Sem permissão para abrir a conversa':'Falha ao abrir conversa');
        if(_authErr(err)){_ensureAnon(function(ok){if(ok)_scheduleMsgRetry(roomId,true);});return;}
        if(_permErr(err)){_safeToast('⚠️ Sem permissão para abrir esta conversa agora.',3800);return;}
        if(_recoverable(err)||navigator.onLine===false)_scheduleMsgRetry(roomId,false);
      });
    }catch(err){
      console.error('[robust] openRoom',err);
      if(typeof _chatSetSync==='function')_chatSetSync('error','Falha ao abrir conversa');
      _scheduleMsgRetry(roomId,false);
    }
    if(preserveMobile&&isMobileView()&&_chatPageEl())_chatPageEl().classList.add('room-open');
    requestAnimationFrame(function(){try{if(typeof _chatAutoFocusComposer==='function')_chatAutoFocusComposer(false);}catch(_e){}});
  };

  window.addEventListener('online',function(){_roomRetryCount=0;_msgRetryCount=0;_scheduleRoomRetry(true);try{var ar=typeof activeRoom==='function'&&activeRoom();if(ar&&ar.id)_scheduleMsgRetry(ar.id,true);}catch(_e){}_softHeal('online');},{passive:true});
  window.addEventListener('error',function(){_softHeal('window-error');},{passive:true});
  window.addEventListener('unhandledrejection',function(){_softHeal('promise-rejection');},{passive:true});
  document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')_softHeal('visible');},{passive:true});
  setInterval(function(){if(document.visibilityState==='visible')_softHeal('watchdog');},45000);

  console.log('[LF ROBUSTNESS ARMOR v2] ativo — retry com backoff, reauth anônima, self-heal sem reload e guardas contra tela branca.');
})();
