(function(){
  if(window.__LF_MESSENGER_USER_REQUEST_FIX_20260715B__) return;
  window.__LF_MESSENGER_USER_REQUEST_FIX_20260715B__ = 1;

  function el(id){ return document.getElementById(id); }
  function q(sel,root){ return (root||document).querySelector(sel); }
  function qa(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function safe(fn){ try{ return fn(); }catch(_e){} }
  function esc(v){ var d=document.createElement('div'); d.textContent=String(v==null?'':v); return d.innerHTML; }
  function attr(v){ return String(v==null?'':v).replace(/[&<>\"]/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function isMobile(){ try{ return typeof isMobileView==='function' ? !!isMobileView() : window.matchMedia('(max-width:768px)').matches; }catch(_e){ return (window.innerWidth||9999)<=768; } }
  function meId(){ return typeof me==='function' ? me() : ((window.S&&S.userId)||''); }
  function roomState(r){
    var uid=meId();
    if(!r) return {};
    r.memberState=r.memberState||{};
    r.memberState[uid]=r.memberState[uid]||{ pinned:false, archived:false, muted:false, hidden:false, unreadCount:0, lastReadAt:0, lastDeliveredAt:0 };
    return r.memberState[uid];
  }
  function hiddenForMe(r){ return !!roomState(r).hidden; }
  function unreadForRoom(r){
    try{ return typeof unread==='function' ? (parseInt(unread(r),10)||0) : (parseInt(roomState(r).unreadCount,10)||0); }
    catch(_e){ return parseInt(roomState(r).unreadCount,10)||0; }
  }
  function roomMatchesSearch(r){
    var term=String((window.C&&C.search)||'').trim().toLowerCase();
    if(!term) return true;
    var hay=[
      safe(function(){ return typeof roomTitle==='function' ? roomTitle(r) : (r&&r.title)||''; })||'',
      safe(function(){ return typeof roomSub==='function' ? roomSub(r) : ''; })||'',
      (r&&r.lastMessageText)||''
    ].join(' ').toLowerCase();
    return hay.indexOf(term)>=0;
  }
  function ensureStyle(){
    if(el('lf-messenger-user-request-fix-20260715b-style')) return;
    var st=document.createElement('style');
    st.id='lf-messenger-user-request-fix-20260715b-style';
    st.textContent=''
      + '.lf-audio-actions,.lf-audio-link,.lf-audio-btn,[data-lf-msg-menu]{display:none!important}'
      + '.lf-audio-speedbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.72);border:1px solid rgba(148,163,184,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}'
      + '.lf-audio-speedchips{display:flex;align-items:center;gap:6px;flex-wrap:wrap}'
      + '.lf-audio-chip{min-height:30px;padding:6px 10px;border-radius:999px;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.68);color:#334155;font:700 .72rem/1 Outfit,sans-serif;cursor:pointer;opacity:.88}'
      + '.lf-audio-chip.on{background:rgba(37,99,235,.14);border-color:rgba(37,99,235,.34);color:#1d4ed8;opacity:1}'
      + '.lf-audio-timer{font:700 .72rem/1 Outfit,sans-serif;color:#64748b;white-space:nowrap}'
      + 'body.theme-classic .lf-audio-speedbar{background:rgba(16,21,29,.58);border-color:rgba(255,255,255,.10)}'
      + 'body.theme-classic .lf-audio-chip{background:rgba(28,33,48,.62);border-color:rgba(255,255,255,.10);color:#dbe6f5}'
      + 'body.theme-classic .lf-audio-chip.on{background:rgba(59,130,246,.18);border-color:rgba(96,165,250,.34);color:#93c5fd}'
      + 'body.theme-classic .lf-audio-timer{color:#b6c2d2}'
      + '#chat-page .lf-chat-jump-wrap{position:absolute;right:14px;bottom:156px;z-index:28;display:flex;flex-direction:column;gap:8px;opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;transform:translateY(6px)}'
      + '#chat-page .lf-chat-jump-wrap.show{opacity:1;pointer-events:auto;transform:translateY(0)}'
      + '#chat-page .lf-chat-jump-btn{width:42px;height:42px;border-radius:14px;border:1px solid rgba(148,163,184,.26);background:rgba(255,255,255,.34);color:#35506b;display:none;align-items:center;justify-content:center;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 10px 24px rgba(15,23,42,.12);cursor:pointer}'
      + '#chat-page .lf-chat-jump-btn.show{display:inline-flex}'
      + '#chat-page .lf-chat-jump-btn:hover{background:rgba(255,255,255,.48)}'
      + 'body.theme-classic #chat-page .lf-chat-jump-btn{background:rgba(28,33,48,.34);border-color:rgba(255,255,255,.12);color:#e6edf7}'
      + 'body.theme-classic #chat-page .lf-chat-jump-btn:hover{background:rgba(28,33,48,.52)}'
      + '#chat-page .chat-jump-controls,#chat-page .chat-jump-btn,#chat-jump-start,.chat-jump-start{display:none!important}'
      + '@media (max-width:768px){#chat-page .lf-chat-jump-wrap{right:12px;bottom:186px}#chat-page .lf-chat-jump-btn{width:40px;height:40px;border-radius:13px}}';
    document.head.appendChild(st);
  }

  function setRoomHidden(room, next, cb){
    if(!room || !room.id) return cb&&cb(false);
    var uid=meId();
    var st=roomState(room), prev=!!st.hidden;
    st.hidden=!!next;
    if(window.C&&C.roomMap&&C.roomMap[room.id]&&C.roomMap[room.id].memberState&&C.roomMap[room.id].memberState[uid]) C.roomMap[room.id].memberState[uid].hidden=!!next;
    safe(function(){ if(typeof renderRooms==='function') renderRooms(); });
    safe(function(){ if(typeof renderHeader==='function') renderHeader(); });
    if(next && window.C && C.active===room.id){
      C.active=null; C.msgs=[];
      safe(function(){ if(typeof renderHeader==='function') renderHeader(); });
      safe(function(){ if(typeof renderMsgs==='function') renderMsgs(); });
      safe(function(){ if(typeof closeRoomMobile==='function') closeRoomMobile(); });
    }
    if(!(window.DB_MODE==='firebase' && window.db)){
      safe(function(){ if(typeof toast==='function') toast(next?'Conversa apagada da lista.':'Conversa restaurada.'); });
      return cb&&cb(true);
    }
    var patch={};
    patch['memberState.'+uid+'.hidden']=!!next;
    db.collection(window.ROOM_COL).doc(room.id).set(patch,{merge:true}).then(function(){
      safe(function(){ if(typeof toast==='function') toast(next?'Conversa apagada da lista.':'Conversa restaurada.'); });
      cb&&cb(true);
    }).catch(function(err){
      st.hidden=prev;
      if(window.C&&C.roomMap&&C.roomMap[room.id]&&C.roomMap[room.id].memberState&&C.roomMap[room.id].memberState[uid]) C.roomMap[room.id].memberState[uid].hidden=prev;
      safe(function(){ if(typeof renderRooms==='function') renderRooms(); });
      safe(function(){ if(typeof renderHeader==='function') renderHeader(); });
      safe(function(){ if(typeof syncErr==='function') syncErr(err); });
      safe(function(){ if(typeof toast==='function') toast('Não foi possível atualizar a conversa.'); });
      cb&&cb(false);
    });
  }

  function patchFilteredRooms(){
    window.filteredRooms=function(){
      var rooms=(window.C&&C.rooms)||[];
      return rooms.filter(function(r){
        var st=roomState(r), archived=!!st.archived, pinned=!!st.pinned;
        var term=String((window.C&&C.search)||'').trim();
        if(window.C&&C.dept&&(!r.deptIds||r.deptIds.indexOf(C.dept)<0)) return false;
        if(term){
          if(!roomMatchesSearch(r)) return false;
          if(C.filter==='archived') return archived;
          if(C.filter==='pinned') return pinned;
          if(C.filter==='unread') return unreadForRoom(r)>0;
          return true;
        }
        if(hiddenForMe(r)) return false;
        if(C.filter==='archived'){
          if(!archived) return false;
        }else{
          if(archived) return false;
          if(C.filter==='unread' && !unreadForRoom(r)) return false;
          if(C.filter==='pinned' && !pinned) return false;
        }
        return true;
      });
    };
  }

  function patchRoomListEntries(){
    window.roomListEntries=function(){
      var entries=(typeof filteredRooms==='function'?filteredRooms():((window.C&&C.rooms)||[])).map(function(r){ return {kind:'room',room:r}; });
      if(window.C && C.filter==='all' && !String(C.search||'').trim() && !C.dept){
        var seen={};
        (C.rooms||[]).forEach(function(r){
          if(r&&r.type==='direct'&&!hiddenForMe(r)){
            var other=(r.memberIds||[]).filter(function(id){ return id!==meId(); })[0];
            if(other) seen[other]=1;
          }
        });
        var users=(typeof visibleUsers==='function' ? visibleUsers() : []).slice().sort(function(a,b){ return String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR',{sensitivity:'base'}); });
        users.forEach(function(u){ if(!seen[u.id]) entries.push({kind:'contact',user:u}); });
      }
      return entries;
    };
  }

  function patchOpenRoomMenu(){
    window.openRoomMenu=function(e,id){
      if(typeof id==='string') window.C.roomTarget=id;
      else if(typeof activeRoom==='function' && activeRoom()) window.C.roomTarget=activeRoom().id;
      var r=(window.C&&C.roomMap&&(C.roomMap[C.roomTarget||C.active])) || (typeof activeRoom==='function' ? activeRoom() : null);
      if(!r) return;
      var items=[
        {kind:'room',label:'🗑️ Apagar conversa',a:'deleteRoom',id:r.id},
        {kind:'room',label:roomState(r).pinned?'📍 Desfixar':'📌 Fixar',a:'pinRoom',id:r.id},
        {kind:'room',label:roomState(r).archived?'📂 Desarquivar':'🗄️ Arquivar',a:'archiveRoom',id:r.id},
        {kind:'room',label:roomState(r).muted?'🔔 Ativar':'🔕 Silenciar',a:'muteRoom',id:r.id}
      ];
      if(typeof showPop==='function') showPop((e&&e.clientX)||window.innerWidth/2,(e&&e.clientY)||110,'Conversa',items);
    };
  }

  function patchRunRoomAction(){
    var prev=window.runRoomAction;
    window.runRoomAction=function(a,id){
      var r=(window.C&&C.roomMap&&C.roomMap[id]) || (typeof activeRoom==='function' ? activeRoom() : null);
      safe(function(){ if(typeof hidePop==='function') hidePop(); });
      if(!r && typeof prev==='function') return prev.apply(this,arguments);
      if(a==='deleteRoom') return setRoomHidden(r,true);
      if(a==='pinRoom' || a==='muteRoom' || a==='archiveRoom'){
        if(typeof toggleRoomFlag==='function') return toggleRoomFlag(a==='pinRoom'?'pinned':(a==='muteRoom'?'muted':'archived'), r.id);
      }
      if(typeof prev==='function') return prev.apply(this,arguments);
    };
  }

  function patchSendMsg(){
    if(typeof window.sendMsg!=='function' || window.sendMsg.__lf20260715b) return;
    var orig=window.sendMsg;
    window.sendMsg=function(){
      var args=arguments, r=typeof activeRoom==='function' ? activeRoom() : null;
      if(r && hiddenForMe(r)) return setRoomHidden(r,false,function(ok){ if(ok!==false) orig.apply(window,args); });
      return orig.apply(this,args);
    };
    window.sendMsg.__lf20260715b=1;
  }

  function buildForwardList(){
    var current=typeof activeRoom==='function' ? activeRoom() : null;
    var list=((window.C&&C.rooms)||[]).filter(function(r){
      if(!r || (current&&r.id===current.id)) return false;
      if(hiddenForMe(r)) return false;
      return typeof roomCanWrite==='function' ? roomCanWrite(r) : true;
    });
    return list.map(function(r){
      return '<button class="chat-forward-room" type="button" data-fwd-room="'+attr(r.id)+'"><span><strong>'+esc(typeof roomTitle==='function'?roomTitle(r):(r.title||'Conversa'))+'</strong><br><span class="chat-soft">'+esc(typeof roomSub==='function'?roomSub(r):'')+'</span></span><span>Selecionar</span></button>';
    }).join('') || '<div class="est">Nenhuma outra conversa disponível para envio.</div>';
  }

  function patchForwardFlow(){
    var prev=window.runMsgAction;
    if(typeof prev==='function' && !prev.__lf20260715bForward){
      window.runMsgAction=function(a,id){
        if(a!=='forward') return prev.apply(this,arguments);
        safe(function(){ if(typeof hidePop==='function') hidePop(); });
        var msg=(window.C&&C.msgs&&C.msgs.find)?C.msgs.find(function(x){ return x&&x.id===id; }):null;
        if(!msg || msg.deleted){ safe(function(){ if(typeof toast==='function') toast('Mensagem indisponível para encaminhar.'); }); return; }
        window.C.forwardMsgId=id; window.C.forwardRoomId='';
        var note=el('chat-forward-note'); if(note) note.value='';
        var prevBox=el('chat-forward-preview');
        if(prevBox) prevBox.innerHTML='<strong>'+esc(msg.senderName||'Mensagem')+'</strong><div class="chat-soft">'+esc((msg.text||(((msg.attachments||[])[0]||{}).name||'[anexo]')).slice(0,180))+'</div>';
        var list=el('chat-forward-list'); if(list) list.innerHTML=buildForwardList();
        safe(function(){ if(typeof openM==='function') openM('mo-chat-forward'); });
      };
      window.runMsgAction.__lf20260715bForward=1;
    }

    document.addEventListener('click',function(ev){
      var btn=ev.target&&ev.target.closest?ev.target.closest('[data-fwd-room]'):null;
      if(!btn) return;
      qa('[data-fwd-room]').forEach(function(x){ x.classList.remove('on'); });
      btn.classList.add('on');
      if(window.C) C.forwardRoomId=btn.getAttribute('data-fwd-room')||'';
    },true);

    window.chatForwardNow=function(){
      var src=(window.C&&C.msgs&&C.msgs.find)?C.msgs.find(function(x){ return x&&x.id===C.forwardMsgId; }):null;
      var room=(window.C&&C.roomMap)?C.roomMap[C.forwardRoomId]:null;
      if(!src || !room){ safe(function(){ if(typeof toast==='function') toast('Selecione o destino.'); }); return; }
      if(!(window.DB_MODE==='firebase' && window.db)){ safe(function(){ if(typeof toast==='function') toast('Sem conexão com o servidor.'); }); return; }
      if(typeof roomCanWrite==='function' && !roomCanWrite(room)){ safe(function(){ if(typeof toast==='function') toast('Sem permissão para encaminhar para esta conversa.'); }); return; }
      var note=(el('chat-forward-note')&&el('chat-forward-note').value||'').trim();
      var text=note + (note&&src.text?'\n\n':'') + (src.text||'');
      var atts=(src.attachments||[]).map(function(a){ return {name:a.name||'',type:a.type||'',size:a.size||0,url:a.url||'',data:a.data||'',storagePath:a.storagePath||''}; });
      var sentAt=Date.now();
      var srcRoom=typeof activeRoom==='function' ? activeRoom() : null;
      var ref=db.collection(window.ROOM_COL).doc(room.id).collection('messages').doc((typeof uid==='function'?uid('msg'):'msg_'+sentAt));
      var msg={
        text:text,
        type:atts.length?(atts.length===1&&/^audio\//.test(atts[0].type||'')?'audio':atts.length===1&&/^image\//.test(atts[0].type||'')?'image':'file'):'text',
        createdAt:sentAt,
        senderId:meId(),
        senderName:(window.S&&S.nome)||'Usuário',
        senderCargo:(((typeof getUser==='function'&&getUser(meId()))||{}).cargo)||'',
        attachments:atts,
        forwardedFrom:{senderName:src.senderName||'',roomTitle:srcRoom&&typeof roomTitle==='function'?roomTitle(srcRoom):'',roomId:srcRoom?srcRoom.id:'',messageId:src.id},
        deliveredTo:(function(){ var o={}; o[meId()]=sentAt; return o; })(),
        readBy:(function(){ var o={}; o[meId()]=sentAt; return o; })(),
        deleted:false
      };
      var patch={updatedAt:sentAt,lastMessageAt:sentAt,lastMessageById:meId(),lastMessageText:(text||('[encaminhada] '+(((atts[0]||{}).name)||'anexo')))};
      patch['memberState.'+meId()+'.lastReadAt']=sentAt;
      patch['memberState.'+meId()+'.lastDeliveredAt']=sentAt;
      patch['memberState.'+meId()+'.unreadCount']=0;
      patch['memberState.'+meId()+'.hidden']=false;
      (room.memberIds||[]).forEach(function(id){ if(id!==meId()) patch['memberState.'+id+'.unreadCount']=fv().increment(1); });
      var batch=db.batch();
      batch.set(ref,msg,{merge:true});
      batch.set(db.collection(window.ROOM_COL).doc(room.id),patch,{merge:true});
      batch.commit().then(function(){
        if(roomState(room).hidden) roomState(room).hidden=false;
        safe(function(){ if(typeof renderRooms==='function') renderRooms(); });
        safe(function(){ if(typeof closeM==='function') closeM('mo-chat-forward'); });
        safe(function(){ if(typeof toast==='function') toast('Mensagem encaminhada!'); });
      }).catch(function(err){ safe(function(){ if(typeof syncErr==='function') syncErr(err); }); safe(function(){ if(typeof toast==='function') toast('Não foi possível encaminhar a mensagem.'); }); });
    };
  }

  function fmtTime(sec){
    sec=Math.max(0,Math.floor(sec||0));
    var m=Math.floor(sec/60), s=sec%60;
    return m+':'+String(s).padStart(2,'0');
  }

  function enhanceAudio(){
    qa('#chat-msgs audio').forEach(function(audio){
      if(!audio) return;
      qa('.lf-audio-actions', audio.parentNode||document).forEach(function(x){ if(x&&x.parentNode) x.parentNode.removeChild(x); });
      var wrap=audio.parentNode&&q('.lf-audio-speedbar', audio.parentNode);
      if(!wrap){
        wrap=document.createElement('div');
        wrap.className='lf-audio-speedbar';
        wrap.innerHTML='<div class="lf-audio-speedchips"></div><span class="lf-audio-timer">0:00 / 0:00</span>';
        if(audio.parentNode) audio.parentNode.appendChild(wrap);
      }
      var chips=q('.lf-audio-speedchips',wrap), timer=q('.lf-audio-timer',wrap);
      if(chips && !chips.dataset.ready){
        chips.dataset.ready='1';
        [0.5,1,1.5,2].forEach(function(rate){
          var b=document.createElement('button');
          b.type='button';
          b.className='lf-audio-chip';
          b.setAttribute('data-rate', String(rate));
          b.textContent=String(rate).replace('.',',')+'x';
          b.addEventListener('click',function(ev){ ev.preventDefault(); audio.playbackRate=rate; sync(); });
          chips.appendChild(b);
        });
      }
      function sync(){
        var rate=Math.round((parseFloat(audio.playbackRate||1)||1)*10)/10;
        qa('.lf-audio-chip',wrap).forEach(function(btn){ btn.classList.toggle('on', Math.abs((parseFloat(btn.getAttribute('data-rate'))||0)-rate)<0.01); });
        if(timer) timer.textContent=fmtTime(audio.currentTime||0)+' / '+fmtTime(audio.duration||0);
      }
      if(audio.dataset.lfAudioSpeedBound!=='1'){
        audio.dataset.lfAudioSpeedBound='1';
        ['loadedmetadata','durationchange','timeupdate','seeked','ratechange','play'].forEach(function(evt){ audio.addEventListener(evt,sync); });
      }
      sync();
    });
  }

  function ensureJumpControls(){
    var page=el('chat-page'), wrap=el('chat-room-wrap');
    if(!page || !wrap) return null;
    var ctrl=el('lf-chat-jump-wrap');
    if(ctrl) return ctrl;
    ctrl=document.createElement('div');
    ctrl.id='lf-chat-jump-wrap';
    ctrl.className='lf-chat-jump-wrap';
    ctrl.innerHTML='<button type="button" class="lf-chat-jump-btn" id="lf-chat-jump-top" aria-label="Ir ao topo">↑</button><button type="button" class="lf-chat-jump-btn" id="lf-chat-jump-bottom" aria-label="Ir ao final">↓</button>';
    wrap.appendChild(ctrl);
    q('#lf-chat-jump-top',ctrl).addEventListener('click',function(){ var box=el('chat-msgs'); if(box) box.scrollTo({top:0,behavior:'smooth'}); });
    q('#lf-chat-jump-bottom',ctrl).addEventListener('click',function(){ var box=el('chat-msgs'); if(box) box.scrollTo({top:box.scrollHeight,behavior:'smooth'}); });
    return ctrl;
  }

  function syncJumpControls(){
    var box=el('chat-msgs'), ctrl=ensureJumpControls();
    if(!box || !ctrl || !(typeof activeRoom==='function' && activeRoom())){ if(ctrl) ctrl.classList.remove('show'); return; }
    var topBtn=el('lf-chat-jump-top'), bottomBtn=el('lf-chat-jump-bottom');
    var scrollTop=box.scrollTop||0;
    var max=Math.max(0, box.scrollHeight - box.clientHeight);
    var gap=max-scrollTop;
    var showTop=scrollTop>180;
    var showBottom=gap>160 && scrollTop>80;
    if(topBtn) topBtn.classList.toggle('show',showTop);
    if(bottomBtn) bottomBtn.classList.toggle('show',showBottom);
    ctrl.classList.toggle('show',showTop||showBottom);
  }

  function bindMsgScroll(){
    var box=el('chat-msgs');
    if(!box || box.dataset.lfJumpBound==='1') return;
    box.dataset.lfJumpBound='1';
    box.addEventListener('scroll',syncJumpControls,{passive:true});
  }

  function patchRenderMsgs(){
    if(typeof window.renderMsgs!=='function' || window.renderMsgs.__lf20260715b) return;
    var orig=window.renderMsgs;
    window.renderMsgs=function(){
      var out=orig.apply(this,arguments);
      setTimeout(function(){ enhanceAudio(); bindMsgScroll(); syncJumpControls(); },0);
      return out;
    };
    window.renderMsgs.__lf20260715b=1;
  }

  function patchOpenRoom(){
    if(typeof window.openRoom!=='function' || window.openRoom.__lf20260715b) return;
    var orig=window.openRoom;
    window.openRoom=function(){
      var out=orig.apply(this,arguments);
      setTimeout(function(){ bindMsgScroll(); syncJumpControls(); },0);
      return out;
    };
    window.openRoom.__lf20260715b=1;
  }

  function patchToggleRoomFlag(){
    if(typeof window.toggleRoomFlag!=='function' || window.toggleRoomFlag.__lf20260715b) return;
    var orig=window.toggleRoomFlag;
    window.toggleRoomFlag=function(flag,roomId){
      var r=(window.C&&C.roomMap&&C.roomMap[roomId]) || (typeof activeRoom==='function' ? activeRoom() : null);
      if(!r) return;
      var out=orig.apply(this,arguments);
      setTimeout(function(){
        safe(function(){ if(typeof renderRooms==='function') renderRooms(); });
        safe(function(){ if(typeof renderHeader==='function') renderHeader(); });
      },50);
      return out;
    };
    window.toggleRoomFlag.__lf20260715b=1;
  }

  function boot(){
    ensureStyle();
    patchFilteredRooms();
    patchRoomListEntries();
    patchOpenRoomMenu();
    patchRunRoomAction();
    patchSendMsg();
    patchForwardFlow();
    patchRenderMsgs();
    patchOpenRoom();
    patchToggleRoomFlag();
    bindMsgScroll();
    enhanceAudio();
    syncJumpControls();
  }

  boot();
  var tries=0, tm=setInterval(function(){
    tries++;
    boot();
    if(tries>40) clearInterval(tm);
  },250);
})();
