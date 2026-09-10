(function(){
  if(window.__LF_USER_INSTANT_MOBILE_FIX_20260713__) return;
  window.__LF_USER_INSTANT_MOBILE_FIX_20260713__ = 1;

  function byId(id){ return document.getElementById(id); }
  function clone(v){ try{return JSON.parse(JSON.stringify(v));}catch(_e){ return v; } }
  function isMobile(){ return !!(window.matchMedia && window.matchMedia('(max-width:768px)').matches); }
  function safe(fn){ try{return fn();}catch(_e){} }

  function ensureStyle(){
    if(byId('lf-user-instant-mobile-fix-20260713-style')) return;
    var st=document.createElement('style');
    st.id='lf-user-instant-mobile-fix-20260713-style';
    st.textContent='\
      .lf-logo-img[src=""]{opacity:0!important}\\n\
      @media (max-width:768px){\\n\
        #ibar{left:10px!important;right:10px!important;bottom:calc(76px + env(safe-area-inset-bottom,0px))!important;border-radius:16px!important;padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px))!important;z-index:650!important}\\n\
        #ibar .ibb{gap:8px!important}\\n\
        #ibar .bins,#ibar .bskp{min-height:44px!important;padding:10px 14px!important;font-size:.84rem!important}\\n\
        body.lf-chat-room-open #mobile-top-bar{display:none!important}\\n\
        body.lf-chat-room-open #mobile-bottom-nav,body.lf-chat-kb-open #mobile-bottom-nav,body.lf-chat-kb-open #ibar{display:none!important}\\n\
        body:not(.lf-chat-can-create) #chat-fab-create{display:none!important}\\n\
        body.lf-chat-room-open #chat-fab-create{display:none!important}\\n\
        body.lf-chat-room-open #pg-chat{padding-bottom:0!important}\\n\
        body.lf-chat-room-open #chat-page .chat-shell{height:var(--lf-chat-live-h,auto)!important;min-height:var(--lf-chat-live-h,auto)!important}\\n\
        body.lf-chat-room-open #chat-page .chat-main,body.lf-chat-room-open #chat-room-wrap{display:flex!important;height:100%!important;min-height:0!important;flex-direction:column!important}\\n\
        body.lf-chat-room-open #chat-page .chat-msgs{flex:1 1 auto!important;min-height:0!important;overflow:auto!important;padding-bottom:10px!important}\\n\
        body.lf-chat-room-open #chat-page .chat-compose{position:sticky!important;bottom:0!important;z-index:25!important;background:#fff!important}\\n\
      }';
    document.head.appendChild(st);
  }

  function patchToast(){
    if(typeof window.toast!=='function' || window.toast.__lfUserFix20260713) return;
    var orig=window.toast;
    var lastReconnectToastAt=0;
    window.toast=function(msg){
      var txt=String(msg==null?'':msg);
      if(/messenger reconectado/i.test(txt)){
        var now=Date.now();
        if(now-lastReconnectToastAt<10*60*1000) return;
        lastReconnectToastAt=now;
        return;
      }
      return orig.apply(this,arguments);
    };
    window.toast.__lfUserFix20260713=1;
  }

  function renderAgendaNow(){
    safe(function(){ agdRenderStrip(); });
    safe(function(){ agdRenderKPIs(); });
    safe(function(){ agdRenderList(); });
    safe(function(){ agdRenderFreeSlots(); });
  }

  function persistAgendaLocal(){
    try{return ss(agdKey(),_agdCache);}catch(_e){ return false; }
  }

  function agendaSyncErrorToast(){
    var el=byId('nav-sync');
    if(el){ el.className='nav-sync err'; el.title='Erro de sincronização'; }
    if(typeof toast==='function') toast('⚠️ Sem sincronizar com a nuvem. Mudança salva apenas neste aparelho.',4500);
  }

  function patchAgendaInstant(){
    if(window.agdDoSave && !window.agdDoSave.__lfInstant20260713){
      window.agdDoSave=function(data,hora,consultorId,cliente,nicho,status,obs,id){
        var consultor=safe(function(){ return getUser(consultorId); }) || null;
        var docId=id||('agd_'+Date.now()+'_'+Math.random().toString(36).slice(2,7));
        var payload={
          data:data,hora:hora,consultorId:consultorId,consultorNome:consultor?consultor.nome:'',
          cliente:cliente,nicho:nicho,status:status,obs:obs,
          criadoPor:window.S&&S.userId?S.userId:'',ts:Date.now()
        };

        // CORREÇÃO (2026-07-20, caça-bugs agenda): marca o slot como _pending até o
        // servidor confirmar. Assim, se o próximo _agdPollOnce chegar antes do POST
        // terminar (ou se o POST falhar silenciosamente), o poll preserva a entrada
        // local em vez de sobrescrever _agdCache e fazer o agendamento sumir.
        var optimistic=Object.assign({_id:docId,_pending:true},payload);
        var idx=_agdCache.findIndex(function(a){ return a._id===docId; });
        if(idx>=0)_agdCache[idx]=Object.assign({},_agdCache[idx],optimistic);
        else _agdCache.unshift(optimistic);
        var savedLocalOk=persistAgendaLocal();
        renderAgendaNow();
        safe(function(){ closeM('mo-agd'); });
        if(!savedLocalOk && typeof toast==='function'){
          toast('⚠️ Armazenamento local cheio — o agendamento pode não sobreviver a um reload.',5000);
        }

        var wc=safe(function(){ return (typeof _agdWc==='function')?_agdWc():null; }) || null;
        if(wc){
          safe(function(){ syncBusy(); });
          var req=id?wc.updateAgendaSlot(docId,payload):wc.createAgendaSlot(payload);
          Promise.resolve(req)
            .then(function(res){
              var remoteId=(res&&res._id)||docId;
              var idx2=_agdCache.findIndex(function(a){ return a._id===docId; });
              // CORREÇÃO (2026-07-20): remove o flag _pending após a confirmação
              // real do servidor e adota o _id remoto (que pode diferir do otimista).
              var confirmed=Object.assign({},payload,{_id:remoteId});
              if(idx2>=0)_agdCache[idx2]=Object.assign({},_agdCache[idx2],confirmed,{_pending:false});
              else _agdCache.unshift(confirmed);
              // remove _pending explicitamente (Object.assign com false não basta se
              // algum consumidor checar hasOwnProperty)
              if(idx2>=0 && _agdCache[idx2]) delete _agdCache[idx2]._pending;
              persistAgendaLocal();
              renderAgendaNow();
              safe(function(){ syncOk(); });
              if(typeof toast==='function') toast(id?'✅ Agendamento atualizado!':'✅ Agendamento criado!');
              safe(function(){ if(typeof _agdPollOnce==='function') _agdPollOnce(); });
            })
            .catch(function(e){
              // CORREÇÃO (2026-07-20): agora que worker-client.req() rejeita em
              // HTTP 4xx/5xx, este .catch é realmente acionado. Mantemos o slot
              // marcado como _pending no cache local para o RetryQueue/SyncManager
              // tentar sincronizar depois, e avisamos o usuário honestamente que
              // ficou salvo apenas neste aparelho.
              console.error('agdDoSave optimistic worker',e && (e.status||e.message) ? {status:e.status,msg:e.message,details:e.details}:e);
              persistAgendaLocal();
              renderAgendaNow();
              try{
                if(window.LF && typeof window.LF.enqueueAgendaSlot==='function'){
                  window.LF.enqueueAgendaSlot(id?'update':'create', docId, payload);
                }
              }catch(_e){}
              agendaSyncErrorToast();
            });
          return;
        }

        if(DB_MODE==='firebase'&&db){
          safe(function(){ syncBusy(); });
          db.collection('agenda_slots').doc(docId).set(payload,{merge:true})
            .then(function(){
              safe(function(){ syncOk(); });
              if(typeof toast==='function') toast(id?'✅ Agendamento atualizado!':'✅ Agendamento criado!');
            })
            .catch(function(e){
              console.error('agdDoSave optimistic',e);
              persistAgendaLocal();
              renderAgendaNow();
              agendaSyncErrorToast();
            });
          return;
        }

        if(persistAgendaLocal()){
          safe(function(){ syncOk(); });
          if(typeof toast==='function') toast('✅ Salvo neste aparelho.');
        }else if(typeof toast==='function'){
          toast('❌ Armazenamento local cheio — agendamento pode não ter sido salvo.',5000);
        }
      };
      window.agdDoSave.__lfInstant20260713=1;
    }

    if(window.agdDelete && !window.agdDelete.__lfInstant20260713){
      window.agdDelete=function(){
        var id=byId('agd-edit-id')&&byId('agd-edit-id').value;
        if(!id) return;
        _confirmModal({
          title:'🗑 Excluir agendamento?',
          msg:'Essa ação é permanente e remove o agendamento para toda a equipe.',
          okLabel:'Excluir',
          okClass:'bd',
          onOk:function(){
            var idx=_agdCache.findIndex(function(a){ return a._id===id; });
            var backup=idx>=0?clone(_agdCache[idx]):null;
            if(idx>=0)_agdCache.splice(idx,1);
            persistAgendaLocal();
            renderAgendaNow();
            safe(function(){ closeM('mo-agd'); });

            var wc=safe(function(){ return (typeof _agdWc==='function')?_agdWc():null; }) || null;
            if(wc){
              safe(function(){ syncBusy(); });
              Promise.resolve(wc.deleteAgendaSlot(id))
                .then(function(){
                  safe(function(){ syncOk(); });
                  if(typeof toast==='function') toast('🗑 Agendamento excluído.');
                  safe(function(){ if(typeof _agdPollOnce==='function') _agdPollOnce(); });
                })
                .catch(function(e){
                  console.error('agdDelete optimistic worker',e);
                  if(backup){
                    if(idx>=0 && idx<=_agdCache.length)_agdCache.splice(idx,0,backup);
                    else _agdCache.unshift(backup);
                    persistAgendaLocal();
                    renderAgendaNow();
                  }
                  safe(function(){ syncErr(e); });
                  if(typeof toast==='function') toast('❌ Não foi possível excluir — o agendamento foi restaurado.',4500);
                });
              return;
            }

            if(DB_MODE==='firebase'&&db){
              safe(function(){ syncBusy(); });
              db.collection('agenda_slots').doc(id).delete()
                .then(function(){
                  safe(function(){ syncOk(); });
                  if(typeof toast==='function') toast('🗑 Agendamento excluído.');
                })
                .catch(function(e){
                  console.error('agdDelete optimistic',e);
                  if(backup){
                    if(idx>=0 && idx<=_agdCache.length)_agdCache.splice(idx,0,backup);
                    else _agdCache.unshift(backup);
                    persistAgendaLocal();
                    renderAgendaNow();
                  }
                  safe(function(){ syncErr(e); });
                  if(typeof toast==='function') toast('❌ Não foi possível excluir — o agendamento foi restaurado.',4500);
                });
              return;
            }

            if(persistAgendaLocal()){
              safe(function(){ syncOk(); });
              if(typeof toast==='function') toast('🗑 Agendamento excluído.');
            }else if(typeof toast==='function'){
              toast('❌ Armazenamento local cheio — exclusão pode não ter sido salva.',5000);
            }
          }
        });
      };
      window.agdDelete.__lfInstant20260713=1;
    }
  }

  function patchChatDeleteInstant(){
    if(typeof window.runMsgAction!=='function' || window.runMsgAction.__lfInstantDelete20260713) return;
    var orig=window.runMsgAction;
    window.runMsgAction=function(a,id){
      if(a!=='delete') return orig.apply(this,arguments);
      if(!(DB_MODE==='firebase'&&db)) return orig.apply(this,arguments);
      var r=(typeof activeRoom==='function')?activeRoom():null;
      var m=window.C&&Array.isArray(C.msgs)?C.msgs.find(function(x){ return x.id===id; }):null;
      if(!r || !m) return orig.apply(this,arguments);
      safe(function(){ if(typeof hidePop==='function') hidePop(); });
      _confirmModal({
        title:'🗑 Excluir mensagem?',
        msg:'A mensagem será ocultada para todos nesta conversa.',
        okLabel:'Excluir',
        okClass:'bd',
        onOk:function(){
          var backup=clone(m);
          var roomPatch={};
          if(typeof _chatIsCurrentLastMessage==='function' && _chatIsCurrentLastMessage(m.id)) roomPatch.lastMessageText='Mensagem excluída';
          if(r.pinnedMessageId===m.id){ roomPatch.pinnedMessageId=''; roomPatch.pinnedMessageText=''; }

          m.deleted=true;
          m.text='';
          m.attachments=[];
          m.deletedAt=Date.now();
          m.deletedById=(window.S&&S.userId)||'';
          if(window.C&&C.roomMap&&C.roomMap[r.id]){
            C.roomMap[r.id]=Object.assign({},C.roomMap[r.id],roomPatch);
          }
          safe(function(){ renderMsgs(); });
          safe(function(){ renderRooms(); });
          safe(function(){ renderHeader(); });

          var batch=db.batch();
          batch.set(db.collection('crm_chat_rooms_v3').doc(r.id).collection('messages').doc(m.id),{deleted:true,text:'',attachments:[],deletedAt:Date.now(),deletedById:(window.S&&S.userId)||''},{merge:true});
          if(Object.keys(roomPatch).length) batch.set(db.collection('crm_chat_rooms_v3').doc(r.id),roomPatch,{merge:true});
          batch.commit().then(function(){
            safe(function(){ if(typeof _chatApplyRoomPatch==='function') _chatApplyRoomPatch(r,roomPatch); });
            if(typeof toast==='function') toast('Mensagem excluída.');
          }).catch(function(e){
            console.error('chat delete optimistic',e);
            if(window.C&&Array.isArray(C.msgs)){
              var idx=C.msgs.findIndex(function(x){ return x.id===backup.id; });
              if(idx>=0) C.msgs[idx]=backup;
            }
            if(window.C&&C.roomMap&&C.roomMap[r.id]){
              if(typeof _chatApplyRoomPatch==='function') safe(function(){ _chatApplyRoomPatch(r,{}); });
            }
            safe(function(){ renderMsgs(); });
            safe(function(){ renderRooms(); });
            safe(function(){ renderHeader(); });
            safe(function(){ syncErr(e); });
            if(typeof toast==='function') toast('❌ Não foi possível excluir a mensagem.',4200);
          });
        }
      });
      return;
    };
    window.runMsgAction.__lfInstantDelete20260713=1;
  }

  function syncChatViewport(){
    ensureStyle();
    var page=byId('chat-page');
    var canCreate=!!(typeof hasAdminAccess==='function' && hasAdminAccess());
    document.body.classList.toggle('lf-chat-can-create',canCreate);
    if(!page){
      document.body.classList.remove('lf-chat-room-open');
      document.body.classList.remove('lf-chat-kb-open');
      return;
    }
    var roomOpen=page.classList.contains('room-open');
    document.body.classList.toggle('lf-chat-room-open',roomOpen);

    var active=document.activeElement;
    var vv=window.visualViewport;
    var keyboardOpen=!!(roomOpen && ((vv && (window.innerHeight - vv.height > 120)) || (active && /^(chat-text|chat-search|chat-msg-search)$/i.test(active.id||''))));
    document.body.classList.toggle('lf-chat-kb-open',keyboardOpen);

    if(!isMobile()) return;
    var shell=page.querySelector('.chat-shell');
    if(!shell) return;
    var viewportH=vv?Math.round(vv.height):window.innerHeight;
    var top=page.getBoundingClientRect().top + (vv?Math.round(vv.offsetTop||0):0);
    var bottomNav=0;
    var nav=byId('mobile-bottom-nav');
    if(nav && !keyboardOpen && getComputedStyle(nav).display!=='none') bottomNav=Math.round(nav.getBoundingClientRect().height||0);
    var liveH=Math.max(280, viewportH-top-bottomNav);
    document.body.style.setProperty('--lf-chat-live-h',liveH+'px');
    if(roomOpen){
      shell.style.height=liveH+'px';
      shell.style.minHeight=liveH+'px';
      safe(function(){
        var msgs=byId('chat-msgs');
        if(msgs && (keyboardOpen || active && active.id==='chat-text')) msgs.scrollTop=msgs.scrollHeight;
      });
    }else{
      shell.style.removeProperty('height');
      shell.style.removeProperty('min-height');
    }
  }

  function wrapAfter(name,delay){
    if(typeof window[name]!=='function' || window[name].__lfWrap20260713) return;
    var orig=window[name];
    window[name]=function(){
      var out=orig.apply(this,arguments);
      setTimeout(syncChatViewport,delay||0);
      return out;
    };
    window[name].__lfWrap20260713=1;
  }

  function bindViewportEvents(){
    if(window.__LF_USER_INSTANT_MOBILE_FIX_BIND__) return;
    window.__LF_USER_INSTANT_MOBILE_FIX_BIND__=1;
    ['goPage','mobileGoPage','openRoom','closeRoomMobile','renderComposer','renderHeader','renderRooms'].forEach(function(name){ wrapAfter(name,20); });
    window.addEventListener('resize',function(){ setTimeout(syncChatViewport,30); },{passive:true});
    window.addEventListener('orientationchange',function(){ setTimeout(syncChatViewport,120); },{passive:true});
    document.addEventListener('focusin',function(){ setTimeout(syncChatViewport,30); },true);
    document.addEventListener('focusout',function(){ setTimeout(syncChatViewport,120); },true);
    document.addEventListener('click',function(){ setTimeout(syncChatViewport,20); },true);
    if(window.visualViewport){
      visualViewport.addEventListener('resize',function(){ setTimeout(syncChatViewport,20); },{passive:true});
      visualViewport.addEventListener('scroll',function(){ setTimeout(syncChatViewport,20); },{passive:true});
    }
    setInterval(function(){ safe(syncChatViewport); },1200);
  }

  function boot(){
    ensureStyle();
    patchToast();
    patchAgendaInstant();
    patchChatDeleteInstant();
    bindViewportEvents();
    syncChatViewport();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
