/* =====================================================================
 * js/chat.js — Módulo "Papo da Empresa" (Chat Corporativo)
 * -----------------------------------------------------------------------
 * Chat interno estilo WhatsApp/Bitrix24, integrado ao CRM.
 * Funciona em Web, Mobile (Capacitor) e PWA.
 * Sincronização via Supabase/Firestore + fallback localStorage offline.
 *
 * FIX #15/#16 (2026-07-20) — Caça-Bugs:
 *  • Nomes de usuário apareciam como "Usuário" genérico:
 *    - _chatResolveUser agora aceita id/uid/userId/_id/email (case-insensitive).
 *    - _chatNormalizeConv re-resolve nomes SEMPRE (sobrescreve rótulo antigo).
 *    - initChatPage dispara loadUsersDB antes de renderizar a lista.
 *    - Hook 'crm:users-updated' re-normaliza todas as conversas.
 *  • Nem todos os usuários apareciam no modal "Nova Conversa":
 *    - Filtro antigo exigia u.ativo truthy → usuários com ativo=undefined sumiam.
 *      Agora só remove quem tem ativo===false explícito.
 *    - Modal abre imediatamente com cache local e refaz render após loadUsersDB.
 *    - Ordenação alfabética e contador de usuários disponíveis.
 * ===================================================================== */

var CHAT_KEY='lf13_chat_convs';
/* 2026-08-06: "cemitério" de IDs de mensagem apagada — ver
   _chatMarkMsgDeleted()/_chatIsMsgDeleted() mais abaixo. Complementa a
   sincronização da exclusão (chatCtxAction 'delete'): mesmo que outro
   poll/realtime já esteja "em voo" com a lista antiga do servidor no
   momento exato da exclusão, essa lista local impede a mensagem de
   voltar a aparecer, porque toda mesclagem (poll e realtime) descarta
   qualquer ID presente aqui antes de aceitar como "mensagem nova". */
var CHAT_DELETED_MSGS_KEY='lf13_chat_deleted_msgids';
var CHAT_DELETED_MSGS_MAX=500; // trava de tamanho — não cresce pra sempre
/* 2026-08-07 (relatado: "excluir conversa, falar de novo com a mesma
   pessoa, mensagens antigas voltam"): o ID de uma conversa 1:1 é
   SEMPRE o mesmo pro mesmo par de pessoas (_chatConvId —
   determinístico, [a,b].sort().join('__')). Excluir só limpava o
   cache local — a mensagem de verdade continua salva no servidor,
   COMPARTILHADA com a outra pessoa (não dá pra simplesmente apagar o
   documento do servidor: isso apagaria a conversa dela também, não só
   a sua — "excluir só pra mim" é o comportamento correto/esperado,
   igual em qualquer app de mensagem). Em vez disso, guarda uma marca
   "apaguei tudo até aqui" por conversa, só NESTE aparelho — toda
   busca/sincronização de mensagens (poll, realtime, carregamento
   inicial) descarta qualquer mensagem de antes dessa marca. */
var CHAT_CLEARED_AT_KEY='lf13_chat_cleared_at';
/* 2026-08-07 (relatado: "excluir no Capacitor faz sumir do PC também"):
   a exclusão de conversa usava _chatRemoveInboxEntryForUsers, que mexe
   no índice de caixa de entrada NA NUVEM (chat_inbox_{uid}) — esse
   índice é da CONTA, compartilhado entre todos os aparelhos do mesmo
   usuário logado, não do aparelho. Excluir "só deste aparelho" (como
   a própria caixa de confirmação promete) estava na prática apagando
   de TODOS os aparelhos, já que mexia numa fonte compartilhada.
   Só que remover essa chamada sem mais nada reintroduziria um bug
   MAIS ANTIGO (ver comentário no FIX 2026-08-03 logo abaixo, em
   chatDeleteConv): sem avisar a nuvem de alguma forma, o PRÓPRIO
   aparelho que excluiu voltava a puxar a conversa de volta no
   próximo _chatPullInboxConvs(). A solução correta pras duas coisas
   ao mesmo tempo: uma lápide só LOCAL (como as de mensagem acima) —
   impede ESTE aparelho de trazer a conversa de volta, sem tocar em
   nada que os OUTROS aparelhos leem. */
var CHAT_DELETED_CONVS_KEY='lf13_chat_deleted_convids';
var CHAT_DELETED_CONVS_MAX=300;
var CHAT_MSG_PREFIX='lf13_chat_msgs_';
var _chatCurrentConv=null;
var _chatPollTimer=null;
var _chatPollInFlight=false;
var _chatTypingTimer=null;
var _chatIsTyping=false;
var _chatUnreadCount=0;
var _chatLastMsgTs={};
var _chatNewConvMode='dm';       // 'dm' | 'group'
var _chatNewGroupSel={};         // { uid: true }

/* ── PATCH FASE 1 (2026-07-22): Realtime + Presence + Push ────── */
var _chatRealtimeChannels={};    // convId → Supabase channel handle
var _chatPresenceChannel=null;   // canal global de presence
var _chatOnlineUsers={};         // uid → { onlineAt, heartbeat }
/* 2026-08-05: timers de tolerância antes de marcar alguém como offline —
   ver _chatStartPresence(). Evita que sair do app por poucos segundos
   (trocar de app, tela apagar) já pisque a pessoa como offline pros
   outros. uid → id do setTimeout pendente. */
var _chatOfflineGraceTimers={};
var _chatPresenceHbTimer=null;   // heartbeat timer (30 s)
var _chatPresenceWarnedNoSb=false;
var _chatUploadViaWorker=true;   // flag: usar Worker /api/v1/upload/binary
/* ─────────────────────────────────────────────────────────────── */

function _chatTrimId(v){ return String(v==null?'':v).trim(); }
function _chatAliasMatch(a,b){
  a=_chatTrimId(a); b=_chatTrimId(b);
  if(!a||!b) return false;
  return a===b || a.toLowerCase()===b.toLowerCase();
}
function _chatCanonicalUid(uid){
  uid=_chatTrimId(uid);
  if(!uid) return '';
  var meCands=[S&&S.userId,S&&S.uid,S&&S.id,S&&S._id,S&&S.email];
  for(var i=0;i<meCands.length;i++) if(_chatAliasMatch(meCands[i],uid)) return _chatTrimId((S&&S.userId)||uid).toLowerCase();
  var u=_chatResolveUser(uid);
  if(u){
    var cands=[u.id,u.uid,u.userId,u._id,u.email].map(_chatTrimId).filter(Boolean);
    if(cands.length) return cands[0].toLowerCase();
  }
  return uid.toLowerCase();
}
function _chatConvIdentityKey(conv){
  conv=conv||{};
  if(conv.isGroup) return 'grp:'+_chatTrimId(conv.id);
  var parts=_chatNormalizeParticipants(conv.participants).map(_chatCanonicalUid).filter(Boolean).sort();
  return parts.length ? ('dm:'+parts.join('|')) : ('dm-id:'+_chatTrimId(conv.id));
}
function _chatMsgDedupKey(m){
  if(m&&m.id) return 'id:'+m.id;
  return 'fallback:'+[
    m&&m.convId,m&&m.fromUid,m&&m.toUid,m&&m.ts,m&&m.text,m&&m.attachmentName,m&&m.attachmentUrl
  ].map(function(x){ return _chatTrimId(x); }).join('|');
}
function _chatMergeMsgLists(a,b){
  var map={};
  [].concat(a||[],b||[]).forEach(function(m){
    if(!m) return;
    var k=_chatMsgDedupKey(m);
    map[k]=Object.assign({},map[k]||{},m);
  });
  return Object.keys(map).map(function(k){ return map[k]; }).sort(function(x,y){
    return String((x&&x.ts)||'').localeCompare(String((y&&y.ts)||''));
  });
}
function _chatMergeConvMeta(a,b){
  var merged=Object.assign({},a||{},b||{});
  merged.id=_chatTrimId((a&&a.id)||(b&&b.id)||('conv_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)));
  merged.isGroup=!!((a&&a.isGroup)||(b&&b.isGroup));
  merged.name=(b&&b.name)||(a&&a.name)||'';
  merged.participants=_chatNormalizeParticipants([].concat((a&&a.participants)||[],(b&&b.participants)||[]));
  merged.participantNames=Object.assign({},(a&&a.participantNames)||{},(b&&b.participantNames)||{});
  var created=[a&&a.createdAt,b&&b.createdAt].filter(Boolean).sort();
  var updated=[a&&a.updatedAt,b&&b.updatedAt].filter(Boolean).sort();
  merged.createdAt=created[0]||merged.createdAt||new Date().toISOString();
  merged.updatedAt=updated.length?updated[updated.length-1]:(merged.updatedAt||merged.createdAt);
  merged.pinned=!!((a&&a.pinned)||(b&&b.pinned));
  merged.muted=!!((a&&a.muted)||(b&&b.muted));
  merged.archived=!!((a&&a.archived)&&(b&&b.archived));
  return _chatNormalizeConv(merged);
}
function _chatRepairConvBuckets(list,persist){
  var raw=Array.isArray(list)?list:[];
  var byKey={};
  var out=[];
  var changed=false;
  raw.forEach(function(item){
    var conv=_chatNormalizeConv(item);
    if(!conv||!conv.id) return;
    var key=_chatConvIdentityKey(conv);
    if(!byKey[key]){
      byKey[key]=conv;
      out.push(conv);
      return;
    }
    var primary=byKey[key];
    var secondary=conv;
    if(primary.id!==secondary.id){
      var primaryMsgs=sg(CHAT_MSG_PREFIX+primary.id)||[];
      var secondaryMsgs=sg(CHAT_MSG_PREFIX+secondary.id)||[];
      ss(CHAT_MSG_PREFIX+primary.id,_chatMergeMsgLists(primaryMsgs,secondaryMsgs).slice(-500));
      try{ localStorage.removeItem(CHAT_MSG_PREFIX+secondary.id); }catch(_e){}
      changed=true;
    }
    var merged=_chatMergeConvMeta(primary,secondary);
    byKey[key]=merged;
    for(var i=0;i<out.length;i++){
      if(out[i]&&out[i].id===primary.id){ out[i]=merged; break; }
    }
    changed=true;
  });
  var seen={};
  out=out.filter(function(conv){
    if(!conv||!conv.id) return false;
    if(seen[conv.id]){ changed=true; return false; }
    seen[conv.id]=1;
    return true;
  }).map(_chatNormalizeConv);
  if(persist&&changed) ss(CHAT_KEY,out);
  return out;
}

/* ─── Storage helpers ─── */
// FIX (2026-07-21): persist=false na leitura — evita que o repair auto-salve
// e mescle/remova conversas acidentalmente a cada chamada de leitura.
// A persistência continua ocorrendo apenas via _chatSaveConvs (chamada explícita).
function _chatGetConvs(){ return _chatRepairConvBuckets(sg(CHAT_KEY)||[], false); }
function _chatNormalizeParticipants(parts){
  var out=[];
  (Array.isArray(parts)?parts:[]).forEach(function(uid){
    uid=String(uid||'').trim();
    if(uid&&out.indexOf(uid)<0)out.push(uid);
  });
  return out;
}
function _chatResolveUser(uid){
  // FIX #15 (2026-07-20): resolução robusta de usuário
  //  - antes só batia por list[i].id === uid. Vários registros vindos do worker/legacy
  //    usam uid/userId/_id/email como identificador → getUser() retornava null e a
  //    conversa ficava com o nome genérico "Usuário".
  //  - também tolera comparação case-insensitive em e-mails.
  uid=String(uid||'').trim();
  if(!uid) return null;
  if(S&&uid===S.userId) return {id:uid,nome:(S.nome||S.email||uid),email:S.email||'',cor:S.cor||0,ativo:true};
  var u=(typeof getUser==='function')?getUser(uid):null;
  if(u) return u;
  var list=(typeof getUsers==='function')?getUsers():[];
  if(Array.isArray(list)){
    var uidLc=uid.toLowerCase();
    for(var i=0;i<list.length;i++){
      var it=list[i]; if(!it) continue;
      var cands=[it.id,it.uid,it.userId,it._id,it.email];
      for(var j=0;j<cands.length;j++){
        var c=cands[j]; if(c==null) continue;
        var cs=String(c);
        if(cs===uid || cs.toLowerCase()===uidLc) return it;
      }
    }
  }
  return null;
}
function _chatOtherUid(conv){
  var myId=(S&&S.userId)||'';
  var parts=_chatNormalizeParticipants(conv&&conv.participants);
  return parts.find(function(p){ return p!==myId; }) || parts[0] || '';
}
function _chatGuessNameFromMsgs(conv, uid){
  uid=uid||_chatOtherUid(conv);
  if(!uid||!conv||!conv.id) return '';
  var msgs=sg(CHAT_MSG_PREFIX+conv.id)||[];
  for(var i=msgs.length-1;i>=0;i--){
    var m=msgs[i]||{};
    if(String(m.fromUid||'')===String(uid) && (m.fromName||m.senderName)) return m.fromName||m.senderName||'';
    if(String(m.toUid||'')===String(uid) && m.toName) return m.toName||'';
  }
  return '';
}
function _chatNormalizeConv(conv){
  // FIX #15 (2026-07-20): SEMPRE re-resolver nome fresco do cadastro de usuários.
  // Antes, se participantNames[uid] já existisse (ex.: 'Usuário' salvo por engano
  // ou nome antigo), a resolução nova era ignorada e o rótulo travava.
  conv=conv&&typeof conv==='object'?Object.assign({},conv):{};
  conv.id=conv.id||('conv_'+Date.now()+'_'+Math.random().toString(36).slice(2,6));
  conv.participants=_chatNormalizeParticipants(conv.participants);
  conv.admins=_chatNormalizeParticipants(conv.admins);
  if(conv.isGroup){
    var _creator = String(conv.createdBy||'').trim();
    if(_creator){
      if(conv.participants.indexOf(_creator) < 0) conv.participants.unshift(_creator);
      if(conv.admins.indexOf(_creator) < 0) conv.admins.unshift(_creator);
    }
  }
  if(!conv.participantNames||typeof conv.participantNames!=='object') conv.participantNames={};
  conv.participants.forEach(function(uid){
    var u=_chatResolveUser(uid);
    if(u){
      var nm=u.nome||u.email||'';
      if(nm) conv.participantNames[uid]=nm; // sobrescreve rótulo antigo/genérico
    }
  });
  if(!conv.isGroup){
    var otherUid=_chatOtherUid(conv);
    if(otherUid){
      var cur=conv.participantNames[otherUid];
      // Se rótulo atual está vazio ou é o UID puro / 'Usuário' → tenta adivinhar pelas msgs
      if(!cur || cur===otherUid || cur==='Usuário'){
        var guessed=_chatGuessNameFromMsgs(conv,otherUid);
        if(guessed) conv.participantNames[otherUid]=guessed;
      }
    }
  }
  return conv;
}
function _chatSaveConvs(list){
  list=_chatRepairConvBuckets((Array.isArray(list)?list:[]).map(_chatNormalizeConv), false);
  ss(CHAT_KEY, list);
}
function _chatGetMsgs(convId){
  // FIX #13 (2026-07-20): filtrar por participants — impede consultor ver msgs de ADM
  var _list = sg(CHAT_MSG_PREFIX+convId)||[];
  if(!S||!S.userId) return [];
  var _convs = sg(CHAT_KEY)||[];
  var _c = _convs.find(function(x){return x && x.id===convId;});
  if(!_c) return [];
  /* CORREÇÃO 2026-08-07 (log real: "[chat] acesso a conv alheia
     bloqueado" bloqueando uma conversa 1:1 legítima do próprio
     usuário): esta checagem comparava S.userId contra
     _c.participants com indexOf puro (string exata) — mas o mesmo
     usuário pode estar representado de formas ligeiramente
     diferentes entre o registro da conversa e a sessão atual (por
     isso _chatParticipantsInclude()/_chatCanonicalUid() já existem e
     são usados em outros pontos deste mesmo arquivo para exatamente
     este tipo de comparação). Trocado pra usar a mesma checagem
     normalizada — evita bloquear acesso a uma conversa que é
     realmente do usuário só por causa de uma diferença de formato no
     ID salvo. */
  if(!_chatParticipantsInclude(_c.participants, S.userId)){
    console.warn('[chat] acesso a conv alheia bloqueado:', convId);
    return [];
  }
  return _list;
}
function _chatSaveMsgs(convId, list){ ss(CHAT_MSG_PREFIX+convId, list.slice(-500)); }
function _chatMsgKey(convId){ return CHAT_MSG_PREFIX+convId; }

/* ─── 2026-08-06: cemitério de mensagens apagadas (ver comentário na
   declaração de CHAT_DELETED_MSGS_KEY acima) ─── */
function _chatGetDeletedMsgIds(){
  try{ return sg(CHAT_DELETED_MSGS_KEY)||[]; }catch(_e){ return []; }
}
function _chatMarkMsgDeleted(msgId){
  if(!msgId) return;
  try{
    var arr=_chatGetDeletedMsgIds();
    if(arr.indexOf(msgId)<0){
      arr.push(msgId);
      if(arr.length>CHAT_DELETED_MSGS_MAX) arr=arr.slice(arr.length-CHAT_DELETED_MSGS_MAX);
      ss(CHAT_DELETED_MSGS_KEY,arr);
    }
  }catch(_e){}
}
function _chatIsMsgDeleted(msgId){
  if(!msgId) return false;
  try{ return _chatGetDeletedMsgIds().indexOf(msgId)>=0; }catch(_e){ return false; }
}

/* ─── 2026-08-07: marca "apaguei tudo até aqui" por conversa (ver
   comentário na declaração de CHAT_CLEARED_AT_KEY acima) ─── */
function _chatGetClearedAtMap(){
  try{ return sg(CHAT_CLEARED_AT_KEY)||{}; }catch(_e){ return {}; }
}
function _chatMarkConvCleared(convId){
  if(!convId) return;
  try{
    var map=_chatGetClearedAtMap();
    map[convId]=new Date().toISOString();
    ss(CHAT_CLEARED_AT_KEY,map);
  }catch(_e){}
}
function _chatGetClearedAt(convId){
  if(!convId) return null;
  try{ return _chatGetClearedAtMap()[convId]||null; }catch(_e){ return null; }
}
function _chatClearedAtFilter(convId){
  var cutoff=_chatGetClearedAt(convId);
  if(!cutoff) return function(){return true;}; // nada marcado — não filtra nada
  return function(m){ return !!(m && m.ts && m.ts>cutoff); };
}

/* ─── 2026-08-07: lápide LOCAL de conversas excluídas (ver comentário
   na declaração de CHAT_DELETED_CONVS_KEY acima) ─── */
function _chatGetDeletedConvIds(){
  try{ return sg(CHAT_DELETED_CONVS_KEY)||[]; }catch(_e){ return []; }
}
function _chatMarkConvDeleted(convId){
  if(!convId) return;
  try{
    var arr=_chatGetDeletedConvIds();
    if(arr.indexOf(convId)<0){
      arr.push(convId);
      if(arr.length>CHAT_DELETED_CONVS_MAX) arr=arr.slice(arr.length-CHAT_DELETED_CONVS_MAX);
      ss(CHAT_DELETED_CONVS_KEY,arr);
    }
  }catch(_e){}
}
function _chatIsConvDeleted(convId){
  if(!convId) return false;
  try{ return _chatGetDeletedConvIds().indexOf(convId)>=0; }catch(_e){ return false; }
}
function _chatUnmarkConvDeleted(convId){
  if(!convId) return;
  try{
    var arr=_chatGetDeletedConvIds();
    var idx=arr.indexOf(convId);
    if(idx>=0){ arr.splice(idx,1); ss(CHAT_DELETED_CONVS_KEY,arr); }
  }catch(_e){}
}

function _chatTouchConv(convId, ts){
  var convs = _chatGetConvs();
  var conv = convs.find(function(c){ return c && c.id === convId; });
  if(!conv) return null;
  conv.updatedAt = ts || new Date().toISOString();
  _chatLastMsgTs[convId] = conv.updatedAt;
  _chatSaveConvs(convs);
  return conv;
}

/* ─── Conversa helpers ─── */
function _chatConvId(a, b){
  return [a, b].sort().join('__');
}

function _chatGetOrCreateConv(otherUid, isGroup, groupName){
  if(!S||!S.userId){console.warn('[chat] _chatGetOrCreateConv: sessão não iniciada');return null;}
  // FIX #14 (2026-07-20): grupos só podem ser criados por ADM
  // [patch: chat-group-gate-failclosed v1] (2026-07-21): fail-closed — se o resolver de privilégio
  // não estiver disponível, negar em vez de permitir. Backstop de defesa em profundidade.
  if(isGroup){
    if(typeof hasAdminAccess !== 'function' || !hasAdminAccess()){
      console.warn('[chat] criação de grupo bloqueada: sem privilégio admin (ou resolver indisponível)');
      if(typeof toast==='function') toast('⚠ Somente administradores podem criar grupos.');
      return null;
    }
  }
  var convs = _chatGetConvs();
  var cid;
  if(isGroup){
    cid = 'grp_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  } else {
    cid = _chatConvId((S&&S.userId)||'', otherUid);
  }
  /* CORREÇÃO 2026-08-07: se essa conversa tinha sido excluída (lápide
     local, ver CHAT_DELETED_CONVS_KEY) e a pessoa está iniciando ela
     de novo de propósito, remove a lápide — senão este aparelho
     ficaria permanentemente recusando sincronizar essa conversa da
     nuvem, mesmo depois de decidir conversar de novo. */
  if(typeof _chatUnmarkConvDeleted==='function') _chatUnmarkConvDeleted(cid);
  var wantedConv = _chatNormalizeConv({
    id: cid,
    isGroup: !!isGroup,
    name: groupName || '',
    participants: isGroup ? [(S&&S.userId)||'', otherUid] : [(S&&S.userId)||'', otherUid],
    pinned: false,
    muted: false,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  var wantedKey = _chatConvIdentityKey(wantedConv);
  var existing = convs.find(function(c){ return c.id === cid || (!isGroup && _chatConvIdentityKey(c) === wantedKey); });
  if(existing) return _chatNormalizeConv(existing);
  var conv = wantedConv;
  convs.push(conv);
  _chatSaveConvs(convs);
  return conv;
}

function _chatOtherUserName(conv){
  // FIX #15 (2026-07-20): prioriza cadastro atual (getUser) > cache salvo > msgs > UID.
  conv=_chatNormalizeConv(conv||{});
  if(conv.isGroup) return conv.name || 'Grupo';
  var otherUid = _chatOtherUid(conv);
  var u = _chatResolveUser(otherUid);
  if(u){
    var nm = u.nome || u.email;
    if(nm) return nm;
  }
  if(conv.participantNames && conv.participantNames[otherUid] && conv.participantNames[otherUid]!==otherUid) return conv.participantNames[otherUid];
  var guessed=_chatGuessNameFromMsgs(conv,otherUid);
  return guessed || otherUid || 'Usuário';
}

function _chatOtherUserAvatar(conv){
  conv=_chatNormalizeConv(conv||{});
  if(conv.isGroup) return '👥';
  var otherUid = _chatOtherUid(conv);
  var u = _chatResolveUser(otherUid);
  var nome=(u&&(u.nome||u.email)) || (conv.participantNames&&conv.participantNames[otherUid]) || _chatGuessNameFromMsgs(conv,otherUid) || otherUid || '?';
  return String(nome||'?').charAt(0).toUpperCase();
}

function _chatOtherUserColor(conv){
  conv=_chatNormalizeConv(conv||{});
  if(conv.isGroup) return 'linear-gradient(135deg,#41285A,#A070CC)';
  var otherUid = _chatOtherUid(conv);
  var u = _chatResolveUser(otherUid);
  if(u) return AVB[(u.cor||0)%AVB.length];
  return AVB[0];
}

/* ─── Render: lista de conversas ─── */
function renderChatList(){
  if(!S||!S.userId)return;
  var container = document.getElementById('chat-conv-list');
  if(!container) return;
  var convs = _chatGetConvs().filter(function(c){ return !c.archived; });
  // Sort: pinned first, then by last message time
  convs.sort(function(a, b){
    if(a.pinned && !b.pinned) return -1;
    if(!a.pinned && b.pinned) return 1;
    var at = _chatLastMsgTs[a.id] || a.updatedAt || '';
    var bt = _chatLastMsgTs[b.id] || b.updatedAt || '';
    return bt.localeCompare(at);
  });
  if(!convs.length){
    container.innerHTML = '<div class="chat-empty">💬 Nenhuma conversa ainda.<br>Toque em <strong>+</strong> para iniciar.</div>';
    return;
  }
  container.innerHTML = convs.map(function(c){
    var msgs = _chatGetMsgs(c.id);
    var lastMsg = msgs.length ? msgs[msgs.length-1] : null;
    /* FIX R4 (2026-07-22): grupos usam toUid=''; checamos fromUid para não contar msgs enviadas por nós */
    var _myId = S && S.userId;
    var unread = msgs.filter(function(m){
      if(m.read) return false;
      return c.isGroup ? (m.fromUid !== _myId) : (m.toUid === _myId);
    }).length;
    var preview = lastMsg ? (lastMsg.text || (lastMsg.attachmentName ? '📎 ' + lastMsg.attachmentName : '')) : '';
    if(preview.length > 40) preview = preview.slice(0, 40) + '...';
    var timeStr = lastMsg ? _chatFmtTime(lastMsg.ts) : '';
    var name = eH(_chatOtherUserName(c));
    var avatar = _chatOtherUserAvatar(c);
    var color = _chatOtherUserColor(c);
    var isOnline = {};
    if(!c.isGroup){
      // FIX #15 (2026-07-20): usar _chatOtherUid + _chatResolveUser em vez de
      // participants.find direto → cobre conversa consigo mesmo e resolução por email/uid.
      var _oUid=_chatOtherUid(c);
      var _oUsr=_oUid?_chatResolveUser(_oUid):null;
      isOnline=_oUsr||{};
    }
        /* FIX 2026-07-28: usar presence real (_chatIsOnline) em vez do flag cadastral .ativo */
    var onlineDot = (!c.isGroup && _oUid && typeof _chatIsOnline==='function' && _chatIsOnline(_oUid)) ? '<span class="chat-online-dot"></span>' : '';
    var pinIcon = c.pinned ? '📌' : '';
    var muteIcon = c.muted ? '🔕' : '';
    return '<div class="chat-conv-item'+(c.id===_chatCurrentConv?' active':'')+'" data-conv-id="'+_jsSq(c.id)+'" onclick="openChatConv(\''+_jsSq(c.id)+'\')">'+
      '<div class="chat-conv-avatar" style="background:'+color+'">'+avatar+onlineDot+'</div>'+
      '<div class="chat-conv-body">'+
        '<div class="chat-conv-top">'+
          '<span class="chat-conv-name">'+name+' '+pinIcon+' '+muteIcon+'</span>'+
          '<span class="chat-conv-time">'+timeStr+'</span>'+
        '</div>'+
        '<div class="chat-conv-bottom">'+
          '<span class="chat-conv-preview">'+eH(preview)+'</span>'+
          (unread ? '<span class="chat-conv-badge">'+unread+'</span>' : '')+
        '</div>'+
      '</div>'+
    '</div>';
  }).join('');
  _chatUpdateUnreadBadge();
}

/* ─── Render: área de conversa ─── */
function openChatConv(convId){
  if(!S||!S.userId){toast('Sessão expirada.');return;}
  _chatCurrentConv = convId;
  /* PATCH FASE 1: subscrever Realtime para a nova conversa */
  try{ _chatSubscribeRealtime(convId); }catch(_e){}
  /* 2026-08-05: marca no sininho qualquer notificação de chat dessa
     conversa como lida — ver notifAutoMarkReadForConv() em
     js/notificacoes.js. */
  try{ if(typeof notifAutoMarkReadForConv==='function') notifAutoMarkReadForConv(convId); }catch(_e){}
  var convs = _chatGetConvs();
  var conv = convs.find(function(c){ return c.id === convId; });
  if(!conv) return;
  // Mark messages as read — só quando a tela de chat está genuinamente
  // visível pro usuário agora (aba em foco E #pg-chat é a página ativa).
  // openChatConv é chamada por vários hooks em segundo plano (troca de
  // usuário atualizado, refresh de realtime, restauração de boot) além
  // do toque direto do usuário — sem essa checagem, uma mensagem que
  // chegou enquanto o usuário estava em outra aba/página já aparecia
  // como lida antes dele realmente entrar na conversa.
  var _pgChatEl = document.getElementById('pg-chat');
  var _genuinelyVisible = (document.visibilityState !== 'hidden') && (!_pgChatEl || _pgChatEl.classList.contains('on'));
  var msgs = _chatGetMsgs(convId);
  var changed = false;
  if(_genuinelyVisible){
    /* FIX R4 (2026-07-22): grupos usam toUid=''; marcar como lida por fromUid != eu */
    var _myId2 = S && S.userId;
    msgs.forEach(function(m){
      if(m.read) return;
      var isForMe = conv.isGroup ? (m.fromUid !== _myId2) : (m.toUid === _myId2);
      if(isForMe){ m.read = true; changed = true; }
    });
    if(changed) _chatSaveMsgs(convId, msgs);
  }
  // Show chat area
  var listEl = document.getElementById('chat-list-panel');
  var convEl = document.getElementById('chat-conv-panel');
  var headerEl = document.getElementById('chat-conv-header');
  if(listEl) listEl.classList.remove('full');
  if(convEl) convEl.classList.add('open');
  // Header
  if(headerEl){
    var name = _chatOtherUserName(conv);
    var avatar = _chatOtherUserAvatar(conv);
    var color = _chatOtherUserColor(conv);
    headerEl.innerHTML =
      '<button class="chat-back-btn" onclick="closeChatConv()" aria-label="Voltar">‹</button>'+
      '<div class="chat-conv-hd-avatar" style="background:'+color+'">'+avatar+'</div>'+
      '<div class="chat-conv-hd-info">'+
        '<div class="chat-conv-hd-name">'+eH(name)+'</div>'+
        /* R5-4: guard Array.isArray para conv.participants potencialmente null/undefined em dados corrompidos */
        '<div class="chat-conv-hd-status">'+(conv.isGroup ? (Array.isArray(conv.participants) ? conv.participants.length : 0)+' participantes' : ((function(){try{var _u=_chatOtherUid(conv);return (_u && typeof _chatIsOnline==='function' && _chatIsOnline(_u))?'online':'offline';}catch(_e){return '';}})()))+'</div>'+
      '</div>'+
      '<button class="chat-conv-hd-menu" onclick="chatShowConvInfo()" aria-label="Info da conversa" title="Info da conversa" style="background:none;border:0;color:inherit;font-size:1.1rem;cursor:pointer;padding:6px 10px">ℹ</button>'+
      '<button class="chat-conv-hd-menu" onclick="closeChatConv()" aria-label="Sair" title="Sair da conversa" style="background:none;border:0;color:inherit;font-size:1.1rem;cursor:pointer;padding:6px 10px">✕</button>'+
      (conv.isGroup ? '<button class="chat-conv-hd-menu" onclick="chatConvMenu(\''+_jsSq(convId)+'\')" aria-label="Opções">⋯</button>' : '');
  }
  // Messages
  renderChatMsgs(convId);
  /* CORREÇÃO 2026-08-07 (relatado: "ao entrar mostra mensagens um
     pouco antigas, não as mais recentes"): o cache local pode estar
     desatualizado por 1-2 mensagens (chegaram enquanto o app estava
     fechado/em segundo plano, antes da inscrição em tempo real ficar
     ativa de novo). _chatPollNewMsgs() já sabe atualizar a tela se
     essa conversa estiver aberta (linha "if(_chatCurrentConv===c.id)
     renderChatMsgs(...)") — só faltava disparar ele NA HORA de abrir,
     em vez de esperar o próximo ciclo automático (que podia demorar
     alguns segundos). Tem proteção própria contra chamada dupla
     (_chatPollInFlight), então é seguro chamar aqui sem risco de
     concorrência com o ciclo periódico. */
  try{ if(typeof _chatPollNewMsgs==='function') _chatPollNewMsgs(); }catch(_e){}
  // Input area
  var inputEl = document.getElementById('chat-input-area');
  if(inputEl){
    inputEl.style.display = 'flex';
  }
  renderChatList(); // update active state
  if(typeof _chatSyncMobileLayout==='function')setTimeout(function(){_chatSyncMobileLayout(true);},30);
}

function closeChatConv(){
  _chatCurrentConv = null;
  var listEl = document.getElementById('chat-list-panel');
  var convEl = document.getElementById('chat-conv-panel');
  if(listEl) listEl.classList.add('full');
  if(convEl) convEl.classList.remove('open');
  var inputEl = document.getElementById('chat-input-area');
  if(inputEl) inputEl.style.display = 'none';
  renderChatList();
  if(typeof _chatSyncMobileLayout==='function')setTimeout(function(){_chatSyncMobileLayout(false);},20);
}

function renderChatMsgs(convId){
  var container = document.getElementById('chat-msgs');
  if(!container) return;
  var msgs = _chatGetMsgs(convId);
  // FIX #12 (2026-07-20): mensagens fixadas primeiro no topo (sticky)
  var pinned = msgs.filter(function(m){ return m && m.pinned; });
  if(!msgs.length){
    container.innerHTML = '<div class="chat-msgs-empty">💬 Inicie a conversa!</div>';
    _chatUpdateNavBtns();
    return;
  }
  function _renderOne(m){
    var isMe = m.fromUid === (S&&S.userId);
    var time = _chatFmtTime(m.ts, true);
    var senderName = '';
    if(!isMe && m.senderName) senderName = '<div class="chat-msg-sender">'+eH(m.senderName)+'</div>';
    var statusIcon = isMe ? (m.read ? '✓✓' : '✓') : '';
    var editedTag = m.editedAt ? ' <span class="chat-msg-edited" title="Editada">(editada)</span>' : '';
    var pinTag = m.pinned ? ' 📌' : '';
    // Anexos
    var attachHTML = '';
    if(m.attachmentName){
      var ext = (m.attachmentName.split('.').pop()||'').toLowerCase();
      var isImg = ['jpg','jpeg','png','gif','webp','svg'].indexOf(ext) >= 0;
      var isAudio = ['mp3','wav','ogg','webm','m4a','aac'].indexOf(ext) >= 0 || m.attachmentKind === 'audio';
      var src = m.attachmentData || m.attachmentUrl || '';
      if(isAudio && src){
        // FIX #12: player de áudio com controles + long-press abre velocidades
        attachHTML = '<audio class="chat-msg-audio" controls preload="metadata" src="'+src+'" data-audio-src="'+src+'"></audio>';
      } else if(isImg && src){
        attachHTML = '<img class="chat-msg-img" src="'+src+'" alt="'+eH(m.attachmentName)+'" loading="lazy">';
      } else if(src){
        attachHTML = '<a href="'+src+'" target="_blank" class="chat-msg-file">📎 '+eH(m.attachmentName)+' ↗</a>';
      } else {
        attachHTML = '<div class="chat-msg-file">📎 '+eH(m.attachmentName)+'</div>';
      }
    }
    // FIX #12: reações
    var reactionsHTML = '';
    if(m.reactions && Object.keys(m.reactions).length){
      var counts = {};
      Object.keys(m.reactions).forEach(function(uid){ var e = m.reactions[uid]; counts[e] = (counts[e]||0) + 1; });
      reactionsHTML = '<div class="chat-msg-reactions">' +
        Object.keys(counts).map(function(e){ return '<span class="chat-msg-reaction" title="'+counts[e]+' reações">'+e+' '+counts[e]+'</span>'; }).join('') +
      '</div>';
    }
    // FIX #12: mensagem encaminhada
    var fwdTag = m.forwardedFrom ? '<div class="chat-msg-forwarded" style="font-size:.66rem;color:var(--mu);opacity:.7;margin-bottom:2px">➡ Encaminhada</div>' : '';
    // FIX (2026-07-21) — Reply inline: bloco de citação clicável (usa chatJumpToMsg)
    var replyHTML = '';
    if(m.replyToId && m.replyMeta){
      var _rPrev = m.replyMeta.text || m.replyMeta.attachmentName || '📎 Anexo';
      replyHTML =
        '<div class="chat-msg-reply" onclick="return chatJumpToMsg(event,\''+_jsSq(m.replyToId)+'\')">' +
          '<div class="chat-msg-reply-name">'+eH(m.replyMeta.fromName || 'Mensagem')+'</div>' +
          '<div class="chat-msg-reply-text">'+eH(_rPrev)+'</div>' +
        '</div>';
    }
    /* 2026-08-06 (pedido do usuário): "não consigo apagar mensagem/foto/
       áudio". O menu de contexto (⋯) já existia, mas só abria via
       toque-e-segure (mobile) ou botão direito (PC) — e o player de
       áudio nativo (<audio controls>) pode "engolir" o toque antes dele
       virar um long-press de verdade, especialmente em cima da barra de
       progresso/play. Um botão ⋮ fixo, sempre clicável, contorna isso
       de vez — não depende de detectar gesto nenhum. Só em mensagens
       próprias (onde Editar/Apagar fazem sentido). */
    var ownMenuBtn = isMe ? '<button type="button" class="chat-msg-menu-btn" aria-label="Opções da mensagem" onclick="openMsgCtxMenuBtn(this,event)">⋮</button>' : '';
    return '<div class="chat-msg'+(isMe?' me':' them')+(m.pinned?' pinned':'')+'" data-msg-id="'+_jsSq(m.id)+'">'+
      ownMenuBtn+
      senderName+
      fwdTag+
      replyHTML+
      (m.text ? '<div class="chat-msg-text">'+eH(m.text)+'</div>' : '')+
      attachHTML+
      reactionsHTML+
      '<div class="chat-msg-meta">'+pinTag+time+editedTag+' <span class="chat-msg-status">'+statusIcon+'</span></div>'+
    '</div>';
  }
  var pinnedHTML = '';
  if(pinned.length){
    pinnedHTML = '<div class="chat-pinned-bar" style="position:sticky;top:0;z-index:5;background:rgba(195,154,45,.08);border-bottom:1px solid rgba(195,154,45,.2);padding:6px 10px;font-size:.7rem;color:var(--al,#c39a2d)">📌 '+pinned.length+' mensagem'+(pinned.length>1?'s':'')+' fixada'+(pinned.length>1?'s':'')+'</div>';
  }
  container.innerHTML = pinnedHTML + msgs.map(_renderOne).join('');
  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
  try{container.scrollTo({top:container.scrollHeight,behavior:'smooth'});}catch(e){}
  /* CORREÇÃO 2026-08-07 (relatado: "abre um pouco acima, quero ver as
     mais recentes"): a rolagem acima acontece no MOMENTO da renderização
     — se tiver alguma imagem ainda carregando naquele instante (avatar,
     foto anexada), o navegador ainda não sabe a altura final dela, então
     scrollHeight usado aqui já fica desatualizado assim que a imagem
     termina de carregar e a conversa "cresce" — sobrando um vão entre
     onde a rolagem parou e o fim de verdade. Reforça a rolagem de novo
     toda vez que uma imagem dentro da conversa termina de carregar, só
     se a pessoa ainda não tiver rolado pra cima nesse meio-tempo (não
     queremos puxar a rolagem à força se ela já está lendo o histórico). */
  var _imgsLoading = container.querySelectorAll('img');
  _imgsLoading.forEach(function(img){
    if(img.complete) return;
    img.addEventListener('load', function(){
      var nearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 400;
      if(nearBottom) container.scrollTop = container.scrollHeight;
    }, {once:true});
  });
  _chatUpdateNavBtns();
}

// FIX #12 (2026-07-20): botões flutuantes de navegação (início/final da conversa)
function _chatUpdateNavBtns(){
  var c = document.getElementById('chat-msgs');
  var topBtn = document.getElementById('chat-nav-top');
  var botBtn = document.getElementById('chat-nav-bot');
  if(!c || !topBtn || !botBtn) return;
  var sc = c.scrollTop, mx = c.scrollHeight - c.clientHeight;
  topBtn.style.display = (sc > 200) ? 'flex' : 'none';
  botBtn.style.display = (sc < mx - 200 && mx > 100) ? 'flex' : 'none';
}
function chatScrollToTop(){
  var c = document.getElementById('chat-msgs'); if(c) c.scrollTo({top:0, behavior:'smooth'});
}
function chatScrollToBottom(){
  var c = document.getElementById('chat-msgs'); if(c) c.scrollTo({top:c.scrollHeight, behavior:'smooth'});
}

// FIX #12: menu contextual (right-click PC + long-press mobile)
var _chatCtxTimer = null;
var _chatCtxStartX = 0, _chatCtxStartY = 0;
var _chatCtxActiveMsg = null;

function _chatCloseCtxMenu(){
  var m = document.getElementById('chat-ctx-menu');
  if(m) m.remove();
  var b = document.getElementById('chat-ctx-backdrop');
  if(b) b.remove();
  // Remove destaque da mensagem-alvo
  if(_chatCtxActiveMsg && _chatCtxActiveMsg.classList) _chatCtxActiveMsg.classList.remove('ctx-target');
  _chatCtxActiveMsg = null;
}
function _chatFindMsgEl(el){
  while(el && el !== document.body){
    if(el.classList && el.classList.contains('chat-msg') && el.getAttribute('data-msg-id')) return el;
    el = el.parentNode;
  }
  return null;
}
function _chatFindConvEl(el){
  while(el && el !== document.body){
    if(el.classList && el.classList.contains('chat-conv-item') && el.getAttribute('data-conv-id')) return el;
    el = el.parentNode;
  }
  return null;
}
function _chatOpenConvCtxMenu(x, y, convEl){
  _chatCloseCtxMenu();
  if(!convEl) return;
  _chatCtxActiveMsg = convEl;
  if(convEl.classList) convEl.classList.add('ctx-target');
  var convId = convEl.getAttribute('data-conv-id');
  var conv = _chatGetConvs().find(function(c){ return c && c.id === convId; });
  if(!conv) return;
  // FIX (2026-07-21) — Passo 3: ADM do grupo pode adicionar participantes
  var _myUid = (S && S.userId) || '';
  var _isGroupAdmin = !!(conv.isGroup && Array.isArray(conv.admins) && conv.admins.indexOf(_myUid) >= 0);
  var backdrop = document.createElement('div');
  backdrop.id = 'chat-ctx-backdrop';
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', _chatCloseCtxMenu, true);
  backdrop.addEventListener('touchstart', function(ev){ ev.preventDefault(); _chatCloseCtxMenu(); }, {passive:false});
  backdrop.addEventListener('contextmenu', function(ev){ ev.preventDefault(); _chatCloseCtxMenu(); }, true);
  var menu = document.createElement('div');
  menu.id = 'chat-ctx-menu';
  menu.className = 'chat-ctx-menu';
  menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg2,#1a1e26);color:var(--tx,#eee);border:1px solid var(--b1,rgba(255,255,255,.18));border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.65);padding:6px;min-width:240px;max-width:92vw;max-height:80vh;overflow-y:auto;font-family:Outfit,sans-serif;font-size:.85rem;pointer-events:auto;-webkit-user-select:none;user-select:none';
  menu.addEventListener('touchstart', function(ev){ ev.stopPropagation(); }, {passive:true});
  menu.addEventListener('contextmenu', function(ev){ ev.preventDefault(); ev.stopPropagation(); }, true);
  menu.innerHTML = ''
    + '<button class="chat-ctx-btn" data-act="pin" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">'+(conv.pinned?'📌 Desafixar':'📌 Fixar no topo')+'</button>'
    + '<button class="chat-ctx-btn" data-act="mute" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">'+(conv.muted?'🔔 Reativar notificações':'🔕 Silenciar')+'</button>'
    + '<button class="chat-ctx-btn" data-act="archive" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">📦 Arquivar</button>'
    + (_isGroupAdmin
        ? '<div style="height:1px;background:var(--b1,rgba(255,255,255,.1));margin:4px 0"></div>'
          +'<button class="chat-ctx-btn" data-act="add-member" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">➕ Adicionar participante</button>'
        : '')
    + '<div style="height:1px;background:var(--b1,rgba(255,255,255,.1));margin:4px 0"></div>'
    + '<button class="chat-ctx-btn" data-act="delete-conv" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:var(--rl,#ef4444);padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">🗑 Excluir conversa</button>';
  document.body.appendChild(menu);
  var vw = window.innerWidth  || document.documentElement.clientWidth;
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var mw = menu.offsetWidth  || 240;
  var mh = menu.offsetHeight || 220;
  var pad = 8;
  var isTouchLike = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var left = x;
  var top  = y;
  if(left + mw + pad > vw) left = vw - mw - pad;
  if(left < pad) left = pad;
  var wantAbove = isTouchLike ? (y > vh * 0.55) : (y + mh + pad > vh);
  if(wantAbove){
    top = y - mh - 12;
    if(top < pad) top = pad;
  } else if(top + mh + pad > vh){
    top = vh - mh - pad;
  }
  if(top < pad) top = pad;
  menu.style.left = left + 'px';
  menu.style.top  = top  + 'px';
  menu.querySelectorAll('.chat-ctx-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var act = btn.getAttribute('data-act');
      if(act === 'pin') chatTogglePin(convId);
      else if(act === 'mute') chatToggleMute(convId);
      else if(act === 'archive') chatArchive(convId);
      else if(act === 'add-member'){ _chatCloseCtxMenu(); chatOpenAddMemberModal(convId); }
      else if(act === 'delete-conv') chatDeleteConv(convId);
    });
  });
}
function _chatOpenCtxMenu(x, y, msgEl){
  _chatCloseCtxMenu();
  if(!msgEl) return;
  _chatCtxActiveMsg = msgEl;
  if(msgEl.classList) msgEl.classList.add('ctx-target');
  var msgId = msgEl.getAttribute('data-msg-id');
  var isMine = msgEl.classList.contains('me');
  var isAudio = !!msgEl.querySelector('audio');
  // Backdrop transparente por baixo do menu — captura clique/toque fora
  // sem deixar o menu "vazar" para o scroll do chat.
  var backdrop = document.createElement('div');
  backdrop.id = 'chat-ctx-backdrop';
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', _chatCloseCtxMenu, true);
  backdrop.addEventListener('touchstart', function(ev){ ev.preventDefault(); _chatCloseCtxMenu(); }, {passive:false});
  backdrop.addEventListener('contextmenu', function(ev){ ev.preventDefault(); _chatCloseCtxMenu(); }, true);
  var menu = document.createElement('div');
  menu.id = 'chat-ctx-menu';
  menu.className = 'chat-ctx-menu';
  menu.style.cssText = 'position:fixed;z-index:99999;background:var(--bg2,#1a1e26);color:var(--tx,#eee);border:1px solid var(--b1,rgba(255,255,255,.18));border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.65);padding:6px;min-width:240px;max-width:92vw;max-height:80vh;overflow-y:auto;font-family:Outfit,sans-serif;font-size:.85rem;pointer-events:auto;-webkit-user-select:none;user-select:none';
  // Impede que o toque no próprio menu re-dispare o long-press global
  menu.addEventListener('touchstart', function(ev){ ev.stopPropagation(); }, {passive:true});
  menu.addEventListener('contextmenu', function(ev){ ev.preventDefault(); ev.stopPropagation(); }, true);
  var html = '';
  if(isAudio){
    html += '<div class="chat-ctx-row" style="display:flex;gap:4px;padding:4px">'
         + '<button class="chat-ctx-spd" data-spd="0.5" style="flex:1;padding:6px;background:none;border:1px solid var(--b1);color:inherit;border-radius:6px;cursor:pointer;font-size:.78rem">0.5x</button>'
         + '<button class="chat-ctx-spd" data-spd="1"   style="flex:1;padding:6px;background:none;border:1px solid var(--b1);color:inherit;border-radius:6px;cursor:pointer;font-size:.78rem">1x</button>'
         + '<button class="chat-ctx-spd" data-spd="1.5" style="flex:1;padding:6px;background:none;border:1px solid var(--b1);color:inherit;border-radius:6px;cursor:pointer;font-size:.78rem">1.5x</button>'
         + '<button class="chat-ctx-spd" data-spd="2"   style="flex:1;padding:6px;background:none;border:1px solid var(--b1);color:inherit;border-radius:6px;cursor:pointer;font-size:.78rem">2x</button>'
         + '</div>'
         + '<div style="height:1px;background:var(--b1,rgba(255,255,255,.1));margin:4px 0"></div>'
         + '<button class="chat-ctx-btn" data-act="download" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">⬇ Baixar áudio</button>';
  }
  html += '<button class="chat-ctx-btn" data-act="reply" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">↩ Responder</button>'
       + '<button class="chat-ctx-btn" data-act="copy" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">📋 Copiar</button>'
       + '<button class="chat-ctx-btn" data-act="forward" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">➡ Encaminhar</button>'
       + '<button class="chat-ctx-btn" data-act="pin" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">📌 Fixar / Desfixar</button>';
  if(isMine) html += '<button class="chat-ctx-btn" data-act="edit" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:inherit;padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">✏ Editar</button>';
  html += '<div class="chat-ctx-row" style="display:flex;gap:4px;padding:4px">'
       + '<button class="chat-ctx-react" data-emoji="👍" style="flex:1;padding:6px;background:none;border:0;font-size:1.2rem;cursor:pointer">👍</button>'
       + '<button class="chat-ctx-react" data-emoji="❤️" style="flex:1;padding:6px;background:none;border:0;font-size:1.2rem;cursor:pointer">❤️</button>'
       + '<button class="chat-ctx-react" data-emoji="😂" style="flex:1;padding:6px;background:none;border:0;font-size:1.2rem;cursor:pointer">😂</button>'
       + '<button class="chat-ctx-react" data-emoji="😮" style="flex:1;padding:6px;background:none;border:0;font-size:1.2rem;cursor:pointer">😮</button>'
       + '<button class="chat-ctx-react" data-emoji="😢" style="flex:1;padding:6px;background:none;border:0;font-size:1.2rem;cursor:pointer">😢</button>'
       + '<button class="chat-ctx-react" data-emoji="😡" style="flex:1;padding:6px;background:none;border:0;font-size:1.2rem;cursor:pointer">😡</button>'
       + '</div>';
  if(isMine) html += '<div style="height:1px;background:var(--b1,rgba(255,255,255,.1));margin:4px 0"></div>'
                  + '<button class="chat-ctx-btn" data-act="delete" style="display:flex;align-items:center;gap:8px;width:100%;background:none;border:0;color:var(--rl,#ef4444);padding:8px 10px;text-align:left;border-radius:6px;cursor:pointer;font-size:.82rem">🗑 Apagar</button>';
  menu.innerHTML = html;
  document.body.appendChild(menu);
  // Posicionamento inteligente: mede o menu real e evita sair da tela.
  // Em mobile, se o toque ficou na metade inferior, ancora ACIMA do dedo
  // para as opções não nascerem cobertas pela mão / teclado virtual.
  var vw = window.innerWidth  || document.documentElement.clientWidth;
  var vh = window.innerHeight || document.documentElement.clientHeight;
  var mw = menu.offsetWidth  || 240;
  var mh = menu.offsetHeight || 260;
  var pad = 8;
  var isTouchLike = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  var left = x;
  var top  = y;
  // Horizontal: nunca vaza pela direita/esquerda
  if(left + mw + pad > vw) left = vw - mw - pad;
  if(left < pad) left = pad;
  // Vertical: se toque está na metade de baixo (mobile) ou não cabe abaixo,
  // ancora acima do ponto do toque.
  var wantAbove = isTouchLike ? (y > vh * 0.55) : (y + mh + pad > vh);
  if(wantAbove){
    top = y - mh - 12;
    if(top < pad) top = pad;
  } else if(top + mh + pad > vh){
    top = vh - mh - pad;
  }
  if(top < pad) top = pad;
  menu.style.left = left + 'px';
  menu.style.top  = top  + 'px';
  // Listeners
  menu.querySelectorAll('.chat-ctx-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ chatCtxAction(btn.getAttribute('data-act'), msgId, msgEl); });
  });
  menu.querySelectorAll('.chat-ctx-react').forEach(function(btn){
    btn.addEventListener('click', function(){ chatCtxReact(btn.getAttribute('data-emoji'), msgId); });
  });
  menu.querySelectorAll('.chat-ctx-spd').forEach(function(btn){
    btn.addEventListener('click', function(){ chatCtxAudioSpeed(parseFloat(btn.getAttribute('data-spd')), msgEl); });
  });
}

function chatCtxAction(act, msgId, msgEl){
  try {
    var msgs = _chatGetMsgs(_chatCurrentConv);
    var m = msgs.find(function(x){ return x.id === msgId; });
    if(!m){ _chatCloseCtxMenu(); return; }
    if(act === 'copy'){
      var txt = m.text || m.attachmentName || '';
      // CORREÇÃO: usar fallback para clipboard API que pode falhar em contextos não seguros
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(function(){
          if(typeof toast === 'function') toast('📋 Copiado');
        }).catch(function(){
          // Fallback para método antigo
          var ta = document.createElement('textarea');
          ta.value = txt;
          ta.style.position = 'fixed';
          ta.style.left = '-9999px';
          document.body.appendChild(ta);
          ta.select();
          try{
            document.execCommand('copy');
            if(typeof toast === 'function') toast('📋 Copiado');
          }catch(e){
            if(typeof toast === 'function') toast('❌ Não foi possível copiar');
          }
          document.body.removeChild(ta);
        });
      }else{
        // Fallback direto para navegadores antigos
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        try{
          document.execCommand('copy');
          if(typeof toast === 'function') toast('📋 Copiado');
        }catch(e){
          if(typeof toast === 'function') toast('❌ Não foi possível copiar');
        }
        document.body.removeChild(ta);
      }
    } else if(act === 'reply'){
      chatStartReply(msgId);
    } else if(act === 'forward'){
      chatForwardMsg(msgId);
    } else if(act === 'pin'){
      m.pinned = !m.pinned;
      _chatSaveMsgs(_chatCurrentConv, msgs);
      renderChatMsgs(_chatCurrentConv);
      if(typeof toast === 'function') toast(m.pinned ? '📌 Fixada' : 'Desfixada');
    } else if(act === 'edit'){
      var nv = prompt('Editar mensagem:', m.text || '');
      if(nv != null && nv !== (m.text||'')){
        m.text = nv;
        m.editedAt = new Date().toISOString();
        _chatSaveMsgs(_chatCurrentConv, msgs);
        renderChatMsgs(_chatCurrentConv);
      }
    } else if(act === 'delete'){
      if(confirm('Apagar esta mensagem?')){
        msgs = msgs.filter(function(x){ return x.id !== msgId; });
        _chatSaveMsgs(_chatCurrentConv, msgs);
        _chatMarkMsgDeleted(msgId);
        renderChatMsgs(_chatCurrentConv);
        /* CORREÇÃO 2026-08-06: apagar mensagem só mexia no localStorage
           deste aparelho — nunca avisava o servidor. _chatPollNewMsgs()/
           _chatSubscribeRealtime() comparam IDs conhecidos vs IDs no
           servidor pra decidir o que é "mensagem nova"; sem sincronizar
           a exclusão, o ID apagado continuava existindo no servidor, e
           na próxima sincronização (abrir a conversa de novo, mandar
           outra mensagem, poll automático) ele era lido como "mensagem
           que ainda não vi" e voltava — exatamente o relatado ("excluir
           e mandar mensagem de novo, as antigas voltam"). Sincronizar
           aqui garante que o servidor reflita a exclusão antes que
           qualquer coisa possa mesclar o estado antigo de volta. */
        try{ _chatSyncMsg({convId:_chatCurrentConv, ts:new Date().toISOString()}); }catch(_e){}
      }
    } else if(act === 'download'){
      var au = msgEl && msgEl.querySelector('audio');
      if(au && au.src){
        var a = document.createElement('a');
        a.href = au.src;
        a.download = 'audio-'+msgId+'.webm';
        a.click();
      }
    }
  } catch(e){ console.warn('[chat] ctx action', act, e); }
  _chatCloseCtxMenu();
}

function chatCtxReact(emoji, msgId){
  try {
    var msgs = _chatGetMsgs(_chatCurrentConv);
    var m = msgs.find(function(x){ return x.id === msgId; });
    if(!m){ _chatCloseCtxMenu(); return; }
    m.reactions = m.reactions || {};
    var uid = (S && S.userId) || 'anon';
    if(m.reactions[uid] === emoji) delete m.reactions[uid];
    else m.reactions[uid] = emoji;
    _chatSaveMsgs(_chatCurrentConv, msgs);
    renderChatMsgs(_chatCurrentConv);
  } catch(e){}
  _chatCloseCtxMenu();
}

function chatCtxAudioSpeed(v, msgEl){
  try {
    var au = msgEl && msgEl.querySelector('audio');
    if(au){
      au.playbackRate = v;
      if(!au.paused) au.play();
      else au.play();
      if(typeof toast === 'function') toast('▶ '+v+'x');
    }
  } catch(e){}
  _chatCloseCtxMenu();
}

// FIX #12: encaminhar mensagem
function chatForwardMsg(msgId){
  var msgs = _chatGetMsgs(_chatCurrentConv);
  var m = msgs.find(function(x){ return x.id === msgId; });
  if(!m) return;
  var convs = _chatGetConvs().filter(function(c){ return c.id !== _chatCurrentConv && !c.archived; });
  if(!convs.length){ if(typeof toast === 'function') toast('Nenhuma outra conversa'); return; }
  // Modal simples de seleção
  var host = document.getElementById('chat-forward-modal') || (function(){
    var d = document.createElement('div');
    d.id = 'chat-forward-modal';
    d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
    document.body.appendChild(d);
    return d;
  })();
  host.innerHTML = '<div style="background:var(--bg2,#1a1e26);color:var(--tx,#eee);border-radius:12px;padding:16px;max-width:400px;width:100%;max-height:70vh;overflow:auto;font-family:Outfit,sans-serif">'
    + '<h3 style="margin:0 0 12px 0;font-size:1rem">Encaminhar para...</h3>'
    + convs.map(function(c){
        var nm = c.isGroup ? (c.name || 'Grupo') : _chatOtherUserName(c);
        return '<button class="chat-fwd-target" data-conv="'+_jsSq(c.id)+'" style="display:block;width:100%;text-align:left;padding:10px 12px;margin:4px 0;background:rgba(195,154,45,.06);border:1px solid rgba(195,154,45,.15);border-radius:8px;color:inherit;cursor:pointer;font-size:.85rem">'+(c.isGroup?'👥 ':'💬 ')+eH(nm)+'</button>';
      }).join('')
    + '<button onclick="document.getElementById(\'chat-forward-modal\').remove()" style="width:100%;margin-top:10px;padding:8px;background:none;border:1px solid var(--b1);color:inherit;border-radius:8px;cursor:pointer">Cancelar</button>'
    + '</div>';
  host.querySelectorAll('.chat-fwd-target').forEach(function(btn){
    btn.addEventListener('click', function(){
      var targetConvId = btn.getAttribute('data-conv');
      var targetMsgs = _chatGetMsgs(targetConvId);
      var newMsg = {
        id: 'msg_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
        convId: targetConvId,
        fromUid: (S&&S.userId)||'',
        fromName: (S&&S.nome)||'?',
        text: m.text || '',
        attachmentName: m.attachmentName || null,
        attachmentData: m.attachmentData || null,
        attachmentUrl: m.attachmentUrl || null,
        attachmentKind: m.attachmentKind || null,
        forwardedFrom: m.fromName || m.fromUid || '?',
        ts: new Date().toISOString(),
        read: false
      };
      targetMsgs.push(newMsg);
      _chatSaveMsgs(targetConvId, targetMsgs);
      host.remove();
      if(typeof toast === 'function') toast('➡ Encaminhada');
    });
  });
}

// FIX #12: gravação de áudio (Web Audio API + MediaRecorder)
var _chatMediaRecorder = null;
var _chatAudioChunks = [];
var _chatRecStart = 0;

function chatRecordAudio(){
  if(!_chatCurrentConv){ if(typeof toast==='function') toast('Abra uma conversa primeiro'); return; }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder){
    if(typeof toast === 'function') toast('⚠ Navegador não suporta áudio');
    return;
  }
  if(_chatMediaRecorder && _chatMediaRecorder.state === 'recording'){
    _chatMediaRecorder.stop();
    return;
  }
  navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}}).then(function(stream){
    _chatAudioChunks = [];
    var mime = '';
    try{
      ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].some(function(candidate){
        if(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(candidate)){ mime = candidate; return true; }
        return false;
      });
    }catch(_mimeErr){}
    try{
      _chatMediaRecorder = mime ? new MediaRecorder(stream, {mimeType: mime}) : new MediaRecorder(stream);
    }catch(recErr){
      console.warn('[chat] MediaRecorder mime falhou, usando fallback padrão', recErr);
      _chatMediaRecorder = new MediaRecorder(stream);
      mime = _chatMediaRecorder.mimeType || mime || 'audio/webm';
    }
    _chatMediaRecorder.ondataavailable = function(e){ if(e.data && e.data.size > 0) _chatAudioChunks.push(e.data); };
    _chatMediaRecorder.onstop = function(){
      var finalMime = (_chatMediaRecorder && _chatMediaRecorder.mimeType) || mime || 'audio/webm';
      var blob = new Blob(_chatAudioChunks, {type: finalMime});
      var dur = ((Date.now()-_chatRecStart)/1000).toFixed(1);
      stream.getTracks().forEach(function(t){ t.stop(); });
      var reader = new FileReader();
      reader.onload = function(ev){
        var ext = finalMime.indexOf('ogg')>=0 ? 'ogg' : (finalMime.indexOf('mp4')>=0 || finalMime.indexOf('m4a')>=0 ? 'm4a' : 'webm');
        var fname = 'audio-'+Date.now()+'.'+ext;
        if(typeof _chatSendAttachment === 'function'){
          _chatSendAttachment(fname, ev.target.result, {kind:'audio', durationSec: parseFloat(dur), mimeType: finalMime});
        }
        if(typeof _chatSyncMobileLayout==='function')setTimeout(function(){_chatSyncMobileLayout(true);},40);
      };
      reader.readAsDataURL(blob);
      var btn = document.getElementById('chat-audio-btn');
      if(btn){ btn.textContent = '🎤'; btn.classList.remove('recording'); btn.setAttribute('aria-pressed','false'); }
      if(typeof toast === 'function') toast('🎤 Áudio enviado ('+dur+'s)');
    };
    _chatMediaRecorder.start();
    _chatRecStart = Date.now();
    var btn = document.getElementById('chat-audio-btn');
    if(btn){ btn.textContent = '⏹'; btn.classList.add('recording'); btn.setAttribute('aria-pressed','true'); }
    if(typeof _chatSyncMobileLayout==='function')_chatSyncMobileLayout(true);
    if(typeof toast === 'function') toast('🎤 Gravando... toque novamente para parar');
  }).catch(function(err){
    if(typeof toast === 'function') toast('⚠ Sem permissão de microfone');
    console.warn('[chat] audio', err);
  });
}

// FIX #12: pular até uma mensagem específica (usado pela grade de mídias)
/* 2026-08-06: abre o menu de contexto (editar/apagar/etc) a partir do
   botão ⋮ fixo na mensagem — ver comentário em renderChatMsgs(). Não
   depende de long-press/right-click, então funciona igual em cima de
   áudio, foto ou texto. */
function openMsgCtxMenuBtn(btn,ev){
  if(ev){ev.preventDefault();ev.stopPropagation();}
  var msgEl=_chatFindMsgEl(btn);
  if(!msgEl)return;
  var r=btn.getBoundingClientRect();
  _chatOpenCtxMenu(r.left,r.bottom+4,msgEl);
}

function chatJumpToMsg(ev, msgId){
  // Deixa Ctrl/Cmd/Meta-clique e botão do meio abrirem em nova aba (comportamento nativo do <a href>)
  if(ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1)) return true;
  if(!msgId) return true;
  // Fecha o modal de info
  var modal = document.getElementById('chat-info-modal');
  if(modal) modal.remove();
  // Localiza a mensagem no container de mensagens
  var container = document.getElementById('chat-msgs');
  if(!container){ return true; }
  var el = container.querySelector('.chat-msg[data-msg-id="'+String(msgId).replace(/"/g,'\\"')+'"]');
  if(!el){
    if(typeof toast === 'function') toast('Mensagem não encontrada nesta conversa');
    return true; // deixa o <a href> abrir o anexo como fallback
  }
  // Rola até a mensagem e aplica o destaque
  try { el.scrollIntoView({ behavior:'smooth', block:'center' }); }
  catch(_){ el.scrollIntoView(); }
  el.classList.remove('chat-msg-highlight');
  // Força reflow para reiniciar a animação se o usuário clicar duas vezes
  void el.offsetWidth;
  el.classList.add('chat-msg-highlight');
  setTimeout(function(){ el.classList.remove('chat-msg-highlight'); }, 1600);
  // Impede a navegação do <a href> (queremos scroll interno, não abrir o anexo)
  if(ev){ ev.preventDefault(); ev.stopPropagation(); }
  return false;
}

// FIX #12: info da conversa (mídias, telefone, observações, cargo)
function chatShowConvInfo(){
  if(!_chatCurrentConv) return;
  var conv = _chatGetConvs().find(function(c){ return c.id === _chatCurrentConv; });
  if(!conv) return;
  var msgs = _chatGetMsgs(_chatCurrentConv);
  var medias = msgs.filter(function(m){ return m.attachmentName; });
  var otherUid = conv.isGroup ? null : conv.participants.find(function(p){ return p !== (S&&S.userId); });
  var user = otherUid && typeof getUser === 'function' ? getUser(otherUid) : null;
  var host = document.getElementById('chat-info-modal') || (function(){
    var d = document.createElement('div');
    d.id = 'chat-info-modal';
    d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
    document.body.appendChild(d);
    return d;
  })();
  var infoHTML = '<div style="background:var(--bg2,#1a1e26);color:var(--tx,#eee);border-radius:12px;padding:20px;max-width:420px;width:100%;max-height:80vh;overflow:auto;font-family:Outfit,sans-serif">'
    + '<h3 style="margin:0 0 12px 0;font-size:1.05rem">'+eH(_chatOtherUserName(conv))+'</h3>';
  if(user){
    if(user.cargo)     infoHTML += '<div style="margin:6px 0;font-size:.85rem"><strong>Cargo:</strong> '+eH(user.cargo)+'</div>';
    if(user.telefone)  infoHTML += '<div style="margin:6px 0;font-size:.85rem"><strong>Telefone:</strong> <a href="tel:'+user.telefone+'" style="color:var(--al,#c39a2d)">'+eH(user.telefone)+'</a></div>';
    if(user.email)     infoHTML += '<div style="margin:6px 0;font-size:.85rem"><strong>Email:</strong> '+eH(user.email)+'</div>';
    if(user.obs)       infoHTML += '<div style="margin:6px 0;font-size:.85rem"><strong>Observações:</strong> '+eH(user.obs)+'</div>';
  }
  if(conv.isGroup){
    infoHTML += '<div style="margin:6px 0;font-size:.85rem"><strong>Participantes:</strong> '+conv.participants.length+'</div>';
  }
  infoHTML += '<div style="margin:14px 0 6px 0;font-size:.9rem;font-weight:600;color:var(--al,#c39a2d)">📎 Mídias compartilhadas ('+medias.length+')</div>';
  if(medias.length){
    infoHTML += '<div class="chat-media-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;margin-top:6px">'
      + medias.slice(-30).reverse().map(function(m){
          var src = m.attachmentData || m.attachmentUrl || '';
          var ext = (m.attachmentName.split('.').pop()||'').toLowerCase();
          var isImg = ['jpg','jpeg','png','gif','webp'].indexOf(ext) >= 0;
          var mid  = _jsSq(m.id || '');
          var href = src ? ('href="'+src+'" target="_blank" rel="noopener"') : '';
          var common = 'data-msg-id="'+mid+'" '+href+
                       ' onclick="return chatJumpToMsg(event,\''+mid+'\')"'+
                       ' title="Clique: ir para a mensagem • Botão direito / Ctrl+clique: abrir em nova aba"';
          if(isImg && src){
            return '<a '+common+' style="display:block"><img src="'+src+'" style="width:100%;height:70px;object-fit:cover;border-radius:6px" alt=""></a>';
          }
          return '<a '+common+' style="display:flex;align-items:center;justify-content:center;background:rgba(195,154,45,.08);padding:8px;border-radius:6px;font-size:.65rem;text-align:center;color:inherit;text-decoration:none">📎 '+eH(m.attachmentName.slice(0,15))+'</a>';
        }).join('')
      + '</div>';
  } else {
    infoHTML += '<div style="color:var(--mu);font-size:.8rem">Nenhuma mídia ainda.</div>';
  }
  infoHTML += '<button onclick="document.getElementById(\'chat-info-modal\').remove()" style="width:100%;margin-top:16px;padding:10px;background:rgba(195,154,45,.1);border:1px solid rgba(195,154,45,.25);color:inherit;border-radius:8px;cursor:pointer;font-size:.85rem">Fechar</button>'
    + '</div>';
  host.innerHTML = infoHTML;
}

// FIX #12: registro global de handlers do chat (uma vez só)
if(!window.__LF_CHAT_CTX_BOUND__){
  window.__LF_CHAT_CTX_BOUND__ = true;
  // right-click PC
  document.addEventListener('contextmenu', function(e){
    if(e.target && e.target.closest && e.target.closest('#chat-info-modal')) return;
    var msg = _chatFindMsgEl(e.target);
    if(msg){
      e.preventDefault(); e.stopPropagation();
      _chatOpenCtxMenu(e.clientX, e.clientY, msg);
      return;
    }
    var conv = _chatFindConvEl(e.target);
    if(!conv) return;
    e.preventDefault(); e.stopPropagation();
    _chatOpenConvCtxMenu(e.clientX, e.clientY, conv);
  }, true);
  // long-press mobile — cancela se dedo se mover >10px (para não conflitar com scroll ou drag)
  document.addEventListener('touchstart', function(e){
    // Se o menu já está aberto, o toque fora é tratado pelo backdrop.
    if(document.getElementById('chat-ctx-backdrop')) return;
    var msg = _chatFindMsgEl(e.target);
    var conv = msg ? null : _chatFindConvEl(e.target);
    if(!msg && !conv) return;
    if(!e.touches || !e.touches[0]) return;
    _chatCtxStartX = e.touches[0].clientX;
    _chatCtxStartY = e.touches[0].clientY;
    _chatCtxTimer = setTimeout(function(){
      try { if(navigator.vibrate) navigator.vibrate(15); } catch(_){}
      if(msg) _chatOpenCtxMenu(_chatCtxStartX, _chatCtxStartY, msg);
      else _chatOpenConvCtxMenu(_chatCtxStartX, _chatCtxStartY, conv);
    }, 550);
  }, {passive: true});
  document.addEventListener('touchmove', function(e){
    if(!_chatCtxTimer) return;
    if(!e.touches || !e.touches[0]) return;
    var dx = Math.abs(e.touches[0].clientX - _chatCtxStartX);
    var dy = Math.abs(e.touches[0].clientY - _chatCtxStartY);
    if(dx > 10 || dy > 10){ clearTimeout(_chatCtxTimer); _chatCtxTimer = null; }
  }, {passive: true});
  ['touchend','touchcancel'].forEach(function(ev){
    document.addEventListener(ev, function(){
      if(_chatCtxTimer){ clearTimeout(_chatCtxTimer); _chatCtxTimer = null; }
    }, {passive: true});
  });
  // Fecha menu ao clicar fora
  document.addEventListener('click', function(e){
    var menu = document.getElementById('chat-ctx-menu');
    if(!menu) return;
    if(!menu.contains(e.target)) _chatCloseCtxMenu();
  }, true);
  // Fecha menu com ESC (acessibilidade PC)
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && document.getElementById('chat-ctx-menu')) _chatCloseCtxMenu();
  }, true);
  // FIX-PERF-CHAT-SCROLL: havia DOIS `scroll` listeners no document (capture:true) que
  // rodavam em TODA rolagem de QUALQUER painel (chat-msgs, chat-conv-list, document, etc).
  // Cada rolagem disparava 2 passes de listener → 2 hits a getElementById('chat-ctx-menu') →
  // 2 _chatUpdateNavBtns(). Em conversa longa, isso travava o scroll em 30fps no Android.
  // Solução: 1 ÚNICO listener com captura coalesced por RAF + early return quando não há
  // menu aberto (o caso comum) e quando o target não bate. Mantém o comportamento original.
  var _chatScrollRAF=null,_chatScrollLastTarget=null;
  document.addEventListener('scroll', function(e){
    _chatScrollLastTarget=e.target;
    if(_chatScrollRAF)return;
    _chatScrollRAF=requestAnimationFrame(function(){
      _chatScrollRAF=null;
      var t=_chatScrollLastTarget;
      // Fecha menu ao rolar (comportamento original)
      var menu=document.getElementById('chat-ctx-menu');
      if(menu && t && (t.id==='chat-msgs' || t.id==='chat-conv-list' || t===document)){
        _chatCloseCtxMenu();
      }
      // Atualiza botões de navegação (somente do chat-msgs)
      if(t && t.id==='chat-msgs') _chatUpdateNavBtns();
    });
  }, true);
  window.addEventListener('resize', function(){
    if(document.getElementById('chat-ctx-menu')) _chatCloseCtxMenu();
  });
}

/* ─── FIX (2026-07-21) — Reply inline: estado + helpers ─── */
var _chatReplyTo = null;

function chatStartReply(msgId){
  var msgs = _chatGetMsgs(_chatCurrentConv);
  var m = msgs.find(function(x){ return x.id === msgId; });
  if(!m) return;
  _chatReplyTo = {
    id: m.id,
    text: m.text || '',
    fromName: m.fromName || m.senderName || '',
    attachmentName: m.attachmentName || ''
  };
  var box = document.getElementById('chat-reply-preview');
  if(box){
    box.style.display = 'block';
    box.innerHTML =
      '<div class="chat-reply-head">↩ Respondendo a '+eH(_chatReplyTo.fromName || 'mensagem')+'</div>' +
      '<div class="chat-reply-body">'+eH(_chatReplyTo.text || _chatReplyTo.attachmentName || '📎 Anexo')+'</div>' +
      '<button type="button" class="chat-reply-cancel" onclick="chatCancelReply()" aria-label="Cancelar resposta">✕</button>';
  }
  var input = document.getElementById('chat-input');
  if(input){ try{ input.focus(); }catch(_){ } }
}

function chatCancelReply(){
  _chatReplyTo = null;
  var box = document.getElementById('chat-reply-preview');
  if(box){
    box.style.display = 'none';
    box.innerHTML = '';
  }
}

/* ─── Enviar mensagem ─── */
function sendChatMsg(){
  if(!S||!S.userId){toast('Sessão expirada. Faça login novamente.');return;}
  var input = document.getElementById('chat-input');
  if(!input) return;
  var text = input.value.trim();
  if(!text || !_chatCurrentConv) return;
  var conv = _chatGetConvs().find(function(c){ return c.id === _chatCurrentConv; });
  if(!conv) return;
  var msg = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    convId: _chatCurrentConv,
    fromUid: (S&&S.userId) || '',
    fromName: (S&&S.nome) || '?',
    toUid: conv.isGroup ? '' : conv.participants.find(function(p){ return p !== (S&&S.userId); }),
    text: text,
    ts: new Date().toISOString(),
    read: false,
    /* FIX (2026-07-21) — Reply inline: preserva referência à mensagem original */
    replyToId: _chatReplyTo ? _chatReplyTo.id : null,
    replyMeta: _chatReplyTo ? {
      text: _chatReplyTo.text || '',
      fromName: _chatReplyTo.fromName || '',
      attachmentName: _chatReplyTo.attachmentName || ''
    } : null
  };
  /* Limpa o estado de reply após capturar no msg */
  _chatReplyTo = null;
  if(typeof chatCancelReply === 'function') chatCancelReply();
  var msgs = _chatGetMsgs(_chatCurrentConv);
  msgs.push(msg);
  _chatSaveMsgs(_chatCurrentConv, msgs);
  // Update conv timestamp
  _chatTouchConv(conv.id, msg.ts);
  input.value = '';
  input.style.height='auto';/* R16-18: reset altura do textarea */
  if(window.innerWidth>768){try{input.focus();}catch(_e){}}
  renderChatMsgs(_chatCurrentConv);
  renderChatList();
  _chatStopTyping();
  if(typeof _chatSyncMobileLayout==='function')_chatSyncMobileLayout(true);
  // Sync to cloud / índice / notificação
  _chatSyncMsg(msg);
  _chatNotifyRecipients(msg, conv);
}

/* ─── Anexo de arquivo ─── */
function chatAttachFile(){
  var input = document.getElementById('chat-file-input');
  if(input) input.click();
}

function chatFileSelected(){
  if(!S||!S.userId){toast('Sessão expirada.');return;}
  var input = document.getElementById('chat-file-input');
  if(!input || !input.files || !input.files[0]) return;
  var file = input.files[0];
  if(file.size > 5*1024*1024){ toast('Arquivo muito grande (máx 5MB)'); input.value=''; return; }
  var reader = new FileReader();
  reader.onload = function(e){
    var mime = file.type || 'application/octet-stream';
    var kind = mime.indexOf('image/')===0 ? 'image' : (mime.indexOf('audio/')===0 ? 'audio' : 'file');
    _chatSendAttachment(file.name, e.target.result, {kind:kind,mimeType:mime});
    if(typeof _chatSyncMobileLayout==='function')setTimeout(function(){_chatSyncMobileLayout(true);},40);
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function _chatSendAttachment(name, data, meta){
  if(!S||!S.userId){toast('Sessão expirada.');return;}
  if(!_chatCurrentConv) return;
  var conv = _chatGetConvs().find(function(c){ return c.id === _chatCurrentConv; });
  if(!conv) return;

  /* PATCH FASE 1 (2026-07-22): upload binário seguro via Worker
   * Prioridade: 1) Worker /api/v1/upload/binary  (chaves B2 no servidor)
   *             2) B2 direto via b2UploadBase64   (fallback, chaves no env)
   *             3) localStorage inline             (último recurso offline)
   * O cliente NUNCA precisa das chaves B2 quando o Worker está disponível. */
  var _wc = window.LiderCRM && window.LiderCRM.api && window.LiderCRM.api.workerClient;
  var _useWorkerApi = window.LiderCRM && window.LiderCRM.config && window.LiderCRM.config.useWorkerApi;

  if(_chatUploadViaWorker && _useWorkerApi && _wc && data){
    toast('Enviando arquivo...');
    _chatUploadBinaryViaWorker(name, data, meta, conv);
  } else if(typeof b2UploadBase64==='function' && b2IsAvailable && b2IsAvailable() && data){
    toast('Enviando arquivo...');
    b2UploadBase64(data, name, null, function(err, res){
      if(err){
        console.warn('[chat] B2 direto falhou, salvando local:', err.message);
        _chatSendAttachmentLocal(name, data, conv, meta);
      }else{
        _chatSendAttachmentRemote(name, res.url, res.path, conv, meta);
      }
    }).catch(function(){
      _chatSendAttachmentLocal(name, data, conv, meta);
    });
  }else{
    _chatSendAttachmentLocal(name, data, conv, meta);
  }
}

/* ── Upload binário via Worker (stream, sem double-base64) ── */
function _chatUploadBinaryViaWorker(name, dataUrl, meta, conv){
  /* Converte data-URL → Blob → ArrayBuffer → envia como octet-stream */
  try{
    var arr   = dataUrl.split(',');
    var mime  = arr[0].match(/:(.*?);/);
    var ct    = (mime ? mime[1] : null) || (meta && meta.mimeType) || 'application/octet-stream';
    var bstr  = atob(arr[1] || arr[0]);
    var bytes = new Uint8Array(bstr.length);
    for(var i=0;i<bstr.length;i++) bytes[i]=bstr.charCodeAt(i);
    var buffer = bytes.buffer;
  } catch(convErr){
    console.warn('[chat] base64→buffer falhou:', convErr.message);
    _chatSendAttachmentLocal(name, dataUrl, conv, meta);
    return;
  }

  var folder = (meta && meta.kind === 'audio') ? 'audio' : 'chat';
  var _jwtToken = (S && S._workerToken) || (S && S.token) || '';

  fetch('/api/v1/upload/binary', {
    method: 'POST',
    headers: {
      'Authorization':  'Bearer ' + _jwtToken,
      'Content-Type':   ct,
      'X-Filename':     name,
      'X-Folder':       folder,
    },
    body: buffer,
  })
  .then(function(res){
    if(!res.ok){
      return res.text().then(function(t){ throw new Error('Worker upload '+res.status+': '+t); });
    }
    return res.json();
  })
  .then(function(json){
    var d = json && json.data;
    if(!d || !d.url) throw new Error('Resposta inválida do Worker');
    _chatSendAttachmentRemote(name, d.url, d.path, conv, meta);
  })
  .catch(function(workerErr){
    console.warn('[chat] Worker upload falhou, tentando B2 direto:', workerErr.message);
    /* Fallback 2: B2 direto */
    if(typeof b2UploadBase64==='function' && b2IsAvailable && b2IsAvailable() && dataUrl){
      b2UploadBase64(dataUrl, name, null, function(err2, res2){
        if(err2){
          console.warn('[chat] B2 direto tb falhou, local:', err2.message);
          _chatSendAttachmentLocal(name, dataUrl, conv, meta);
        } else {
          _chatSendAttachmentRemote(name, res2.url, res2.path, conv, meta);
        }
      });
    } else {
      _chatSendAttachmentLocal(name, dataUrl, conv, meta);
    }
  });
}

function _chatSendAttachmentLocal(name, data, conv, meta){
  var msg = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    convId: _chatCurrentConv,
    fromUid: (S&&S.userId) || '',
    fromName: (S&&S.nome) || '?',
    toUid: conv.isGroup ? '' : conv.participants.find(function(p){ return p !== (S&&S.userId); }),
    text: '',
    attachmentName: name,
    attachmentData: data,
    attachmentUrl: null,
    attachmentKind: meta && meta.kind || null,
    attachmentDurationSec: meta && meta.durationSec || null,
    attachmentMimeType: meta && meta.mimeType || null,
    ts: new Date().toISOString(),
    read: false
  };
  _chatPushMsg(msg, conv);
}

function _chatSendAttachmentRemote(name, url, filePath, conv, meta){
  var msg = {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    convId: _chatCurrentConv,
    fromUid: (S&&S.userId) || '',
    fromName: (S&&S.nome) || '?',
    toUid: conv.isGroup ? '' : conv.participants.find(function(p){ return p !== (S&&S.userId); }),
    text: '',
    attachmentName: name,
    attachmentData: null,
    attachmentUrl: url,
    attachmentPath: filePath,
    attachmentKind: meta && meta.kind || null,
    attachmentDurationSec: meta && meta.durationSec || null,
    attachmentMimeType: meta && meta.mimeType || null,
    ts: new Date().toISOString(),
    read: false
  };
  _chatPushMsg(msg, conv);
}

function _chatSyncMobileLayout(forceBottom){
  var page=document.getElementById('pg-chat');
  var convPanel=document.getElementById('chat-conv-panel');
  var msgs=document.getElementById('chat-msgs');
  var inputArea=document.getElementById('chat-input-area');
  var active=document.activeElement;
  var isMobile=(typeof isMobileView==='function')?!!isMobileView():(window.innerWidth<=768);
  var roomOpen=!!(_chatCurrentConv&&convPanel&&convPanel.classList.contains('open'));
  var vv=window.visualViewport;
  var kbH=0;
  if(vv){
    var diff=(window.innerHeight||document.documentElement.clientHeight||0)-Math.round(vv.height)-Math.max(0,Math.round(vv.offsetTop||0));
    kbH=diff>90?diff:0;
  }else if(active&&active.id==='chat-input'){
    kbH=160;
  }
  document.body.classList.toggle('lf-chat-room-open',roomOpen);
  document.body.classList.toggle('lf-chat-kb-open',!!(roomOpen&&kbH>0));
  /* CORREÇÃO 2026-08-07 (relatado: "arrastar em qualquer lugar da tela
     move tudo junto, inclusive o cabeçalho/busca"): lf-chat-room-open
     só é true com uma conversa ABERTA — a lista de conversas (busca +
     topo) nunca ganhava proteção nenhuma. Esta classe nova cobre as
     DUAS situações (lista OU conversa), usada em css/style.css pra
     bloquear a rolagem da página inteira (html/body) enquanto está no
     Papo — sem isso, uma regra antiga de outra correção (rolagem por
     roda do mouse no centro do CRM) deixava html/body arrastáveis em
     QUALQUER tela do app, inclusive aqui, fazendo tudo se mover junto
     ao arrastar (já que não é só #chat-msgs/#chat-conv-list que rolam,
     a página toda também rolava). */
  document.body.classList.toggle('lf-chat-page-active',!!(page&&page.classList.contains('on')));
  if(!page||!isMobile)return;

  /* CORREÇÃO 2026-08-05, revisada: barra de digitação "sumindo"/cabeçalho
     não fixo/tem que rolar pra achar a barra (relatado pelo usuário,
     persistiu mesmo depois da primeira correção — ver histórico abaixo).

     Histórico: a 1ª versão desta correção só forçava altura via JS
     quando o teclado estava aberto, e delegava pro CSS
     (`height:calc(100dvh - 60px)`) o resto do tempo, pra não competir
     com o resize nativo do Capacitor (Keyboard.resize:"body"). Isso
     evitava a competição, mas dvh (dynamic viewport height) é uma
     unidade CSS relativamente nova — WebView do Android varia MUITO de
     versão por fabricante/aparelho, e em versões mais antigas ela pode
     não funcionar como esperado, deixando #pg-chat sem altura definida
     nenhuma (nem a manual, nem a do CSS) — reproduzindo exatamente os
     sintomas relatados de novo.

     FIX revisado: volta a forçar altura manual SEMPRE (não só com
     teclado aberto) — não depende de dvh, funciona em qualquer versão
     de WebView — mas agora lê a altura de `window.innerHeight`, que o
     PRÓPRIO resize nativo do Capacitor já ajusta quando o teclado
     abre/fecha. Ou seja: não calcula a altura do teclado por conta
     própria (removia o cálculo via visualViewport que competia com o
     nativo) — só lê o resultado que o nativo já corrigiu. Sem
     competição, com compatibilidade universal. */
  var viewportH=Math.round(window.innerHeight||document.documentElement.clientHeight||0);
  var top=Math.max(0,Math.round(page.getBoundingClientRect().top));
  var bottomNav=0;
  var nav=document.getElementById('mobile-bottom-nav');
  if(nav&&!document.body.classList.contains('lf-chat-kb-open')){
    try{ if(getComputedStyle(nav).display!=='none') bottomNav=Math.round(nav.getBoundingClientRect().height||0); }catch(_e){}
  }
  /* CORREÇÃO 2026-08-08 (relatado: "mesmo ajustando -40px em Configurações,
     a barra de digitar continua cortada pela barra de navegação do
     Android"): achei a causa real — o app inteiro reserva espaço embaixo
     usando as variáveis --lf-sab (área segura física do aparelho) e
     --lf-sab-extra (o ajuste MANUAL que a pessoa faz na ferramenta
     "Ajustar posição do Papo"/"Ajustar visualização", ver
     js/patches/lf-mobile-display-calibration-20260713f.js) — só que
     este cálculo de altura, em JS, nunca olhava pra nenhuma das duas.
     Por isso o ajuste manual do usuário não tinha efeito nenhum aqui:
     eu tava sobrescrevendo a altura via JS por cima de qualquer coisa
     que o CSS/a calibração tentasse fazer. Lê as duas agora e reserva
     esse espaço também, igual o resto do app já faz. */
  var safeBottom=0;
  try{
    var _cs=getComputedStyle(document.documentElement);
    var _sabExtra=parseFloat(_cs.getPropertyValue('--lf-sab-extra'))||0;
    var _probe=document.createElement('div');
    _probe.style.cssText='position:fixed;bottom:0;left:-9999px;padding-bottom:env(safe-area-inset-bottom,0px);pointer-events:none;visibility:hidden;';
    document.body.appendChild(_probe);
    var _sabDevice=parseFloat(getComputedStyle(_probe).paddingBottom)||0;
    document.body.removeChild(_probe);
    safeBottom=Math.max(0,_sabDevice+_sabExtra);
  }catch(_e){}
  var liveH=Math.max(280,viewportH-top-bottomNav-safeBottom);
  /* CORREÇÃO 2026-08-07, REVERTIDA em seguida (relatado: "não dá pra
     digitar, barra de digitação não aparece" — logo depois desta
     mudança ter sido publicada): a versão anterior desta correção
     tinha uma trava (só reaplicava altura se a diferença fosse >3px)
     pra evitar um jitter visual durante rolagem ativa em alguns
     WebViews. Como não consegui confirmar com certeza que a trava
     NÃO é a causa do sumiço da barra (o timing bate — foi a mudança
     mais recente antes do relato), e "não dar pra digitar" é muito
     mais grave que o jitter que a trava evitava, voltei ao
     comportamento anterior (reaplica sempre) como precaução imediata,
     enquanto investigo a causa real com mais calma. */
  page.style.height=liveH+'px';
  page.style.minHeight=liveH+'px';
  if(convPanel&&roomOpen){
    convPanel.style.height='100%';
    convPanel.style.minHeight='0';
  }
  if(inputArea&&roomOpen)inputArea.style.display='flex';
  if(forceBottom&&msgs){
    setTimeout(function(){
      try{ msgs.scrollTo({top:msgs.scrollHeight,behavior:'smooth'}); }
      catch(_e){ msgs.scrollTop=msgs.scrollHeight; }
    },60);
  }
}

/* FASE 2 (2026-08-05): quem deve ser avisado de uma mensagem nova —
   compartilhado entre sendChatMsg() (texto) e _chatPushMsg() (anexo/áudio),
   que antes tinham essa conta duplicada só num dos dois lugares (texto
   não notificava ninguém, nem em-app nem por push real). Dispara:
     1) pushNotif(...) — toast/badge dentro do próprio app, se aberto
     2) POST /api/v1/push/send — notificação de verdade fora do app
        (FCM). Sempre tentado — se FCM_SERVICE_ACCOUNT_JSON não estiver
        configurado no Worker, o endpoint responde 200 sem enviar nada
        (ver push-send-controller.js), então não há erro nem custo
        perceptível em rodar isso incondicionalmente. */
function _chatNotifyRecipients(msg, conv){
  var _myUid=(S&&S.userId)||'';
  var _preview=msg.text || (msg.attachmentKind==='audio' ? '🎤 Áudio' : (msg.attachmentName ? '📎 '+msg.attachmentName : 'Nova mensagem'));
  var _notifTargets=[];
  if(msg.toUid && msg.toUid!==_myUid){
    _notifTargets=[msg.toUid];
  }else if(conv && conv.isGroup){
    _notifTargets=(conv.participants||[]).filter(function(p){ return p && p!==_myUid; });
  }
  if(!_notifTargets.length) return;
  var _title='💬 '+((S&&S.nome)||'?');
  var _body=String(_preview).slice(0,50);
  if(typeof pushNotif==='function'){
    _notifTargets.forEach(function(uid){
      try{ pushNotif(uid,'chat',_title+': '+_body,{convId: msg.convId||_chatCurrentConv}); }catch(_e){}
    });
  }
  /* Push de verdade (fora do app) — best-effort, nunca bloqueia o envio
     nem mostra erro pro usuário se falhar/não estiver configurado. */
  try{
    var _jwtToken=(S&&S._workerToken)||(S&&S.token)||'';
    if(_jwtToken){
      fetch('/api/v1/push/send',{
        method:'POST',
        headers:{'Authorization':'Bearer '+_jwtToken,'Content-Type':'application/json'},
        body:JSON.stringify({
          toUserIds:_notifTargets,
          title:_title,
          body:_body,
          data:{convId:msg.convId||_chatCurrentConv||''}
        })
      }).catch(function(_e){ /* sem internet, worker fora do ar etc — silencioso */ });
    }
  }catch(_e){}
}

function _chatPushMsg(msg, conv){
  var msgs = _chatGetMsgs(_chatCurrentConv);
  msgs.push(msg);
  _chatSaveMsgs(_chatCurrentConv, msgs);
  _chatTouchConv(msg.convId || _chatCurrentConv, msg.ts);
  renderChatMsgs(_chatCurrentConv);
  renderChatList();
  _chatSyncMsg(msg);
  _chatNotifyRecipients(msg, conv);
}

/* ─── Typing indicator ─── */
function chatOnInput(){
  var input=document.getElementById('chat-input');
  if(input){
    input.style.height='auto';
    input.style.height=Math.min(120,Math.max(40,input.scrollHeight||40))+'px';
  }
  if(!_chatIsTyping){
    _chatIsTyping = true;
    // Could sync typing status to cloud here
  }
  clearTimeout(_chatTypingTimer);
  _chatTypingTimer = setTimeout(_chatStopTyping, 2000);
  if(typeof _chatSyncMobileLayout==='function')_chatSyncMobileLayout(true);
}

function _chatStopTyping(){
  _chatIsTyping = false;
  clearTimeout(_chatTypingTimer);
}

/* ─── Nova conversa ─── */
function _chatBuildParticipantNames(parts){
  var map={};
  _chatNormalizeParticipants(parts).forEach(function(uid){
    var u=_chatResolveUser(uid);
    var nm=(u&&(u.nome||u.email)) || uid;
    if(nm) map[uid]=nm;
  });
  return map;
}

function _chatSyncConvUpsert(conv){
  conv=_chatNormalizeConv(conv||{});
  if(!conv.id) return Promise.resolve(conv);
  var payload={
    id: conv.id,
    isGroup: !!conv.isGroup,
    name: conv.name || '',
    participants: _chatNormalizeParticipants(conv.participants||[]),
    participantNames: Object.assign({}, conv.participantNames||{}),
    admins: _chatNormalizeParticipants(conv.admins||[]),
    createdBy: conv.createdBy || '',
    createdAt: conv.createdAt || new Date().toISOString(),
    updatedAt: conv.updatedAt || conv.createdAt || new Date().toISOString(),
    msgs: _chatGetMsgs(conv.id)
  };
  function _removedUsers(prevParts){
    prevParts=_chatNormalizeParticipants(prevParts||[]);
    return prevParts.filter(function(uid){ return payload.participants.indexOf(uid) < 0; });
  }
  try{
    var root = window.LiderCRM;
    var wc = root && root.api && root.api.workerClient;
    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.putConfig === 'function' && typeof wc.getConfig === 'function'){
      return wc.getConfig('chat_conv_' + conv.id).catch(function(){ return null; }).then(function(prevDoc){
        var removed=_removedUsers(prevDoc && prevDoc.participants);
        return wc.putConfig('chat_conv_' + conv.id, payload)
          .then(function(){ return _chatSyncConvIndex(conv, null); })
          .then(function(){ return _chatRemoveInboxEntryForUsers(conv.id, removed); })
          .then(function(){ return conv; });
      }).catch(function(e){ console.warn('[chat] sync conv upsert falhou', e); return conv; });
    }
    if(DB_MODE === 'firebase' && db){
      var ref = db.collection('config').doc('chat_conv_' + conv.id);
      return ref.get().then(function(snap){
        var prevDoc = snap && snap.exists ? (snap.data() || {}) : null;
        var removed = _removedUsers(prevDoc && prevDoc.participants);
        return ref.set(payload)
          .then(function(){ return _chatSyncConvIndex(conv, null); })
          .then(function(){ return _chatRemoveInboxEntryForUsers(conv.id, removed); })
          .then(function(){ return conv; });
      }).catch(function(e){ console.warn('[chat] firebase conv upsert falhou', e); return conv; });
    }
  }catch(e){ console.warn('[chat] sync conv upsert error', e); }
  return Promise.resolve(conv);
}

function chatSwitchNewMode(mode){
  _chatNewConvMode = (mode === 'group') ? 'group' : 'dm';
  if(_chatNewConvMode !== 'group') _chatNewGroupSel = {};
  _chatRenderNewConvList();
}

function chatToggleGroupMember(uid, checked){
  uid=String(uid||'').trim();
  if(!uid) return;
  if(checked) _chatNewGroupSel[uid]=true;
  else delete _chatNewGroupSel[uid];
}

function chatCreateGroupFromModal(){
  if(!S||!S.userId){ if(typeof toast==='function') toast('Sessão expirada.'); return; }
  if(!(typeof hasAdminAccess==='function' && hasAdminAccess())){
    if(typeof toast==='function') toast('⚠ Somente administradores podem criar grupos.');
    return;
  }
  var nameEl=document.getElementById('chat-new-group-name');
  var groupName=String(nameEl&&nameEl.value||'').trim();
  if(!groupName){ if(typeof toast==='function') toast('Informe o nome do grupo'); if(nameEl&&nameEl.focus) nameEl.focus(); return; }
  var selected=Object.keys(_chatNewGroupSel).filter(function(uid){ return !!_chatNewGroupSel[uid]; });
  if(!selected.length){ if(typeof toast==='function') toast('Selecione pelo menos 1 participante'); return; }
  var participants=_chatNormalizeParticipants([S.userId].concat(selected));
  var conv=_chatGetOrCreateConv(selected[0]||S.userId, true, groupName);
  if(!conv || !conv.id) return;
  conv.isGroup=true;
  conv.name=groupName;
  conv.participants=participants;
  conv.participantNames=_chatBuildParticipantNames(participants);
  conv.createdBy=conv.createdBy || S.userId;
  conv.admins=_chatNormalizeParticipants([conv.createdBy].concat(conv.admins||[]));
  conv.createdAt=conv.createdAt || new Date().toISOString();
  conv.updatedAt=new Date().toISOString();

  var convs=_chatGetConvs();
  var idx=convs.findIndex(function(x){ return x && x.id===conv.id; });
  if(idx>=0) convs[idx]=_chatNormalizeConv(Object.assign({}, convs[idx], conv));
  else convs.push(_chatNormalizeConv(conv));
  _chatSaveConvs(convs);
  _chatSaveMsgs(conv.id, _chatGetMsgs(conv.id));
  _chatLastMsgTs[conv.id]=conv.updatedAt;

  _chatNewGroupSel={};
  _chatNewConvMode='dm';
  closeM('mo-chat-new');
  renderChatList();
  openChatConv(conv.id);
  _chatSyncConvUpsert(conv);
  if(typeof toast==='function') toast('✅ Grupo criado com sucesso');
}

// FIX #16 (2026-07-20): render do modal separado da busca dos usuários
// para permitir refresh após loadUsersDB retornar.
function _chatRenderNewConvList(){
  if(!S||!S.userId) return;
  var myId=S.userId;
  var isAdm = (typeof hasAdminAccess==='function') && hasAdminAccess();
  var raw = (typeof getUsers === 'function') ? (getUsers()||[]) : [];
  var users = raw.filter(function(u){
    if(!u) return false;
    var uid = u.id || u.uid || u.userId || u._id || u.email;
    if(!uid || String(uid) === String(myId)) return false;
    if(u.ativo === false) return false;
    return true;
  }).map(function(u){
    u.id = u.id || u.uid || u.userId || u._id || u.email;
    return u;
  });
  users.sort(function(a,b){ return (a.nome||a.email||'').localeCompare(b.nome||b.email||''); });

  var modalBody = document.querySelector('#mo-chat-new .mb');
  if(!modalBody) return;

  var tabs = isAdm
    ? '<div class="chat-new-tabs" style="display:flex;gap:6px;margin-bottom:10px">'
      + '<button type="button" class="chat-new-tab'+(_chatNewConvMode==='dm'?' on':'')+'" onclick="chatSwitchNewMode(\'dm\')">💬 Individual</button>'
      + '<button type="button" class="chat-new-tab'+(_chatNewConvMode==='group'?' on':'')+'" onclick="chatSwitchNewMode(\'group\')">👥 Novo Grupo</button>'
      + '</div>'
    : '';

  var listHTML;
  if(!users.length){
    listHTML = '<div style="padding:20px;text-align:center;color:var(--mu);font-size:.85rem">Nenhum outro usuário cadastrado.</div>';
  } else if(_chatNewConvMode === 'group' && isAdm){
    listHTML =
      '<input id="chat-new-group-name" placeholder="Nome do grupo" '
      +'style="width:100%;padding:10px;margin-bottom:10px;background:rgba(255,255,255,.04);border:1px solid rgba(195,154,45,.2);border-radius:8px;color:inherit;font-size:.9rem">'
      +'<div style="font-size:.75rem;color:var(--mu);margin-bottom:6px">Marque os participantes:</div>'
      +'<div class="chat-new-list">'
      + users.map(function(u){
          var nome=u.nome||u.email||'?', av=String(nome).charAt(0).toUpperCase();
          var color=AVB[(u.cor||0)%AVB.length];
          var checked = _chatNewGroupSel[u.id] ? 'checked' : '';
          return '<label class="chat-new-item" style="cursor:pointer">'
            +'<input type="checkbox" '+checked+' onchange="chatToggleGroupMember(\''+_jsSq(u.id)+'\',this.checked)" style="margin-right:8px">'
            +'<div class="chat-new-avatar" style="background:'+color+'">'+av+'</div>'
            +'<div class="chat-new-info"><div class="chat-new-name">'+eH(nome)+'</div><div class="chat-new-role">'+eH(u.cargo||'Consultor')+'</div></div>'
          +'</label>';
        }).join('')
      +'</div>';
  } else {
    listHTML = '<div class="chat-new-list">'
      + users.map(function(u){
          var nome=u.nome||u.email||'?', av=String(nome).charAt(0).toUpperCase();
          var color=AVB[(u.cor||0)%AVB.length];
          return '<div class="chat-new-item" onclick="chatStartConv(\''+_jsSq(u.id)+'\')">'
            +'<div class="chat-new-avatar" style="background:'+color+'">'+av+'</div>'
            +'<div class="chat-new-info"><div class="chat-new-name">'+eH(nome)+'</div><div class="chat-new-role">'+eH(u.cargo||'Consultor')+'</div></div>'
          +'</div>';
        }).join('')
      +'</div>';
  }

  var footer = (_chatNewConvMode==='group' && isAdm)
    ? '<div class="mbtns"><button class="bc" onclick="closeM(\'mo-chat-new\')">Cancelar</button>'
      +'<button class="bp" onclick="chatCreateGroupFromModal()">Criar grupo</button></div>'
    : '<div class="mbtns"><button class="bc" onclick="closeM(\'mo-chat-new\')">Cancelar</button></div>';

  modalBody.innerHTML = '<h2>'+(_chatNewConvMode==='group'?'👥 Novo Grupo':'💬 Nova Conversa')+'</h2>'
    + tabs
    + '<div style="font-size:.78rem;color:var(--mu);margin-bottom:12px">'
      +(_chatNewConvMode==='group' ? 'Somente ADM pode criar grupos.' : 'Selecione um colaborador ('+users.length+' disponíveis):')
    +'</div>'
    + listHTML + footer;
}

function chatNewConv(){
  if(!S||!S.userId){toast('Sessão expirada.');return;}
  // FIX #16 (2026-07-20): abrir modal já com o que temos em cache e disparar
  // loadUsersDB em paralelo. Antes, se o cache local só tivesse 1-2 usuários
  // (comum logo após login), o modal ficava incompleto sem chance de refresh.
  _chatRenderNewConvList();
  var modalBody = document.querySelector('#mo-chat-new .mb');
  if(modalBody) openM('mo-chat-new');
  if(typeof loadUsersDB === 'function'){
    try{
      loadUsersDB(function(){
        // só re-renderiza se o modal ainda estiver aberto
        var m = document.getElementById('mo-chat-new');
        if(m && m.classList && m.classList.contains('on')) _chatRenderNewConvList();
      });
    }catch(e){ console.warn('[chat] loadUsersDB falhou em chatNewConv', e); }
  }
}

function chatStartConv(uid){
  closeM('mo-chat-new');
  var conv = _chatGetOrCreateConv(uid, false);
  if(!conv || !conv.id) return;
  openChatConv(conv.id);
}

/* ─── Menu de conversa (pin, mute, archive) ─── */
function chatConvMenu(convId){
  var target = document.querySelector('.chat-conv-item[data-conv-id="'+_jsSq(convId)+'"]');
  var x = Math.max(24, (window.innerWidth||360) - 36);
  var y = 84;
  if(target){
    var rect = target.getBoundingClientRect();
    x = Math.min((window.innerWidth||360)-24, rect.right - 10);
    y = Math.max(24, rect.top + 16);
  }
  if(!target){
    target = document.createElement('div');
    target.setAttribute('data-conv-id', convId);
  }
  _chatOpenConvCtxMenu(x, y, target);
}

/* ─── FIX (2026-07-21) — Passo 3: Adicionar participante a grupo existente ─── */
var _chatAddMemberConvId = null;

function chatOpenAddMemberModal(convId){
  if(!S||!S.userId){ if(typeof toast==='function') toast('Sessão expirada.'); return; }
  var convs = _chatGetConvs();
  var c = convs.find(function(x){ return x && x.id===convId; });
  if(!c || !c.isGroup){ if(typeof toast==='function') toast('Conversa inválida'); return; }
  if(!(Array.isArray(c.admins) && c.admins.indexOf(S.userId) >= 0)){
    if(typeof toast==='function') toast('Sem permissão');
    return;
  }
  _chatAddMemberConvId = convId;
  _chatEnsureAddMemberModal();
  _chatRenderAddMemberList();
  openM('mo-chat-add-member');
  if(typeof loadUsersDB === 'function'){
    try{
      loadUsersDB(function(){
        var m = document.getElementById('mo-chat-add-member');
        if(m && m.classList && m.classList.contains('on')) _chatRenderAddMemberList();
      });
    }catch(e){ console.warn('[chat] loadUsersDB falhou em chatOpenAddMemberModal', e); }
  }
}

function _chatEnsureAddMemberModal(){
  if(document.getElementById('mo-chat-add-member')) return;
  var mo = document.createElement('div');
  mo.id = 'mo-chat-add-member';
  mo.className = 'mo';
  mo.innerHTML = '<div class="mc"><div class="mb"></div></div>';
  document.body.appendChild(mo);
  // clique no backdrop fecha (padrão do app)
  mo.addEventListener('click', function(ev){
    if(ev.target === mo) closeM('mo-chat-add-member');
  });
}

function _chatRenderAddMemberList(){
  var convId = _chatAddMemberConvId;
  if(!convId) return;
  var convs = _chatGetConvs();
  var c = convs.find(function(x){ return x && x.id===convId; });
  if(!c) return;
  var modalBody = document.querySelector('#mo-chat-add-member .mb');
  if(!modalBody) return;
  var myId = S && S.userId;
  var raw = (typeof getUsers === 'function') ? (getUsers()||[]) : [];
  var already = (c.participants||[]).slice();
  var users = raw.filter(function(u){
    if(!u) return false;
    var uid = u.id || u.uid || u.userId || u._id || u.email;
    if(!uid) return false;
    if(String(uid) === String(myId)) return false;
    if(u.ativo === false) return false;
    if(already.indexOf(uid) >= 0) return false;
    return true;
  }).map(function(u){
    u.id = u.id || u.uid || u.userId || u._id || u.email;
    return u;
  });
  users.sort(function(a,b){ return (a.nome||a.email||'').localeCompare(b.nome||b.email||''); });

  var listHTML;
  if(!users.length){
    listHTML = '<div style="padding:20px;text-align:center;color:var(--mu);font-size:.85rem">Nenhum usuário disponível para adicionar.</div>';
  } else {
    listHTML = '<div class="chat-new-list">'
      + users.map(function(u){
          var nome=u.nome||u.email||'?', av=String(nome).charAt(0).toUpperCase();
          var color=AVB[(u.cor||0)%AVB.length];
          return '<div class="chat-new-item" onclick="chatAddGroupMember(\''+_jsSq(convId)+'\',\''+_jsSq(u.id)+'\')" style="cursor:pointer">'
            +'<div class="chat-new-avatar" style="background:'+color+'">'+av+'</div>'
            +'<div class="chat-new-info"><div class="chat-new-name">'+eH(nome)+'</div><div class="chat-new-role">'+eH(u.cargo||'Consultor')+'</div></div>'
          +'</div>';
        }).join('')
      +'</div>';
  }

  var gname = c.name || 'Grupo';
  modalBody.innerHTML = '<h2>➕ Adicionar participante</h2>'
    + '<div style="font-size:.78rem;color:var(--mu);margin-bottom:12px">Grupo: <b>'+eH(gname)+'</b> · Selecione um usuário para adicionar ('+users.length+' disponíveis):</div>'
    + listHTML
    + '<div class="mbtns"><button class="bc" onclick="closeM(\'mo-chat-add-member\')">Fechar</button></div>';
}

function chatAddGroupMember(convId, uid){
  var convs = _chatGetConvs();
  var c = convs.find(function(x){ return x.id===convId; });
  if(!c || !c.isGroup) return;
  if(!(c.admins||[]).includes(S.userId)){ toast('Sem permissão'); return; }
  if(c.participants.indexOf(uid) < 0){
    c.participants.push(uid);
    // Cache do nome para render imediato
    try{
      var u = _chatResolveUser(uid);
      if(u){
        c.participantNames = c.participantNames || {};
        var nm = u.nome || u.email;
        if(nm) c.participantNames[uid] = nm;
      }
    }catch(_e){}
    c.updatedAt = new Date().toISOString();
    _chatSaveConvs(convs);
    renderChatList();
    if(typeof _chatSyncConvUpsert==='function') _chatSyncConvUpsert(c);
    toast('Participante adicionado');
    // Refresh do modal (para que o usuário adicionado suma da lista) e do header, se aberto
    _chatRenderAddMemberList();
    if(_chatCurrentConv === convId && typeof openChatConv === 'function'){
      try{ openChatConv(convId); }catch(_e){}
    }
  } else {
    toast('Usuário já está no grupo');
  }
}

function chatTogglePin(convId){
  var convs = _chatGetConvs();
  var c = convs.find(function(x){ return x.id === convId; });
  if(c){ c.pinned = !c.pinned; _chatSaveConvs(convs); renderChatList(); }
  _chatCloseCtxMenu();
}

function chatToggleMute(convId){
  var convs = _chatGetConvs();
  var c = convs.find(function(x){ return x.id === convId; });
  if(c){ c.muted = !c.muted; _chatSaveConvs(convs); renderChatList(); }
  _chatCloseCtxMenu();
}

function chatArchive(convId){
  var convs = _chatGetConvs();
  var c = convs.find(function(x){ return x.id === convId; });
  if(c){ c.archived = true; _chatSaveConvs(convs); if(_chatCurrentConv===convId) closeChatConv(); renderChatList(); toast('Conversa arquivada'); }
  _chatCloseCtxMenu();
}

function chatDeleteConv(convId){
  var convs = _chatGetConvs();
  var c = convs.find(function(x){ return x && x.id === convId; });
  if(!c){ _chatCloseCtxMenu(); return; }
  // FIX (2026-08-03): antes só apagava do localStorage deste
  // aparelho — o inbox na nuvem (chat_inbox_{uid}) nunca era tocado,
  // então _chatPullInboxConvs() trazia a conversa de volta na próxima
  // sincronização (era isso que causava "a conversa voltava"). Agora
  // remove também do inbox do PRÓPRIO usuário na nuvem — não mexe no
  // inbox do outro participante, que continua vendo a conversa dele
  // normalmente (mesmo comportamento de "excluir só pra mim" comum
  // em apps de mensagem).
  // CORREÇÃO 2026-08-07: _chatRemoveInboxEntryForUsers mexia na nuvem
  // (afetava todos os aparelhos do usuário) — trocado por lápide local,
  // ver comentário na declaração de CHAT_DELETED_CONVS_KEY no topo do
  // arquivo. _chatMarkConvDeleted(convId) chamado direto nos dois
  // pontos abaixo (onOk e no fallback sem _confirmModal).
  function _persistDeleteRemote(){
    _chatMarkConvDeleted(convId);
  }
  // CORREÇÃO: usar _confirmModal se disponível para UX consistente
  if(typeof _confirmModal === 'function'){
    _confirmModal({
      title:'🗑 Excluir conversa?',
      msg:'Esta ação remove a conversa deste aparelho. As mensagens não podem ser recuperadas.',
      okLabel:'Excluir',okClass:'bd',
      onOk:function(){
        convs = convs.filter(function(x){ return !(x && x.id === convId); });
        _chatSaveConvs(convs);
        try{ localStorage.removeItem(CHAT_MSG_PREFIX + convId); }catch(_e){}
        _chatMarkConvCleared(convId);
        _persistDeleteRemote();
        if(_chatCurrentConv === convId) closeChatConv();
        renderChatList();
        _chatUpdateUnreadBadge();
        if(typeof toast === 'function') toast('🗑 Conversa excluída');
        _chatCloseCtxMenu();
      }
    });
  }else{
    if(!confirm('Excluir esta conversa deste aparelho?')){ _chatCloseCtxMenu(); return; }
    convs = convs.filter(function(x){ return !(x && x.id === convId); });
    _chatSaveConvs(convs);
    try{ localStorage.removeItem(CHAT_MSG_PREFIX + convId); }catch(_e){}
    _chatMarkConvCleared(convId);
    _persistDeleteRemote();
    if(_chatCurrentConv === convId) closeChatConv();
    renderChatList();
    _chatUpdateUnreadBadge();
    if(typeof toast === 'function') toast('🗑 Conversa excluída');
    _chatCloseCtxMenu();
  }
}

/* ─── Buscar conversas ─── */
function chatSearch(q){
  q = String(q || '').toLowerCase();
  var items = document.querySelectorAll('.chat-conv-item');
  items.forEach(function(el){
    var name = el.querySelector('.chat-conv-name');
    var text = name ? name.textContent.toLowerCase() : '';
    el.style.display = text.indexOf(q) >= 0 ? '' : 'none';
  });
}

/* ─── Sync com nuvem ─── */
function _chatInboxDocName(uid){ return 'chat_inbox_' + String(uid||''); }
function _chatParticipantsInclude(parts, uid){
  uid=_chatCanonicalUid(uid);
  if(!uid) return false;
  return _chatNormalizeParticipants(parts).some(function(p){
    return _chatCanonicalUid(p) === uid;
  });
}
function _chatPurgeLocalConv(convId, reason){
  convId=String(convId||'').trim();
  if(!convId) return false;
  var convs=_chatGetConvs();
  var before=convs.length;
  convs=convs.filter(function(c){ return !(c && c.id===convId); });
  if(before===convs.length) return false;
  _chatSaveConvs(convs);
  try{ localStorage.removeItem(CHAT_MSG_PREFIX + convId); }catch(_e){}
  try{ delete _chatLastMsgTs[convId]; }catch(_e){}
  if(_chatCurrentConv===convId) _chatCurrentConv=null;
  console.warn('[chat] conv local higienizada:', convId, reason||'sem-motivo');
  return true;
}
function _chatPurgeForeignLocalConvs(reason){
  if(!S||!S.userId) return [];
  var convs=_chatGetConvs();
  var removed=[];
  convs.forEach(function(c){
    if(!c || !c.id) return;
    if(_chatParticipantsInclude(c.participants||[], S.userId)) return;
    removed.push(c.id);
  });
  removed.forEach(function(convId){ _chatPurgeLocalConv(convId, reason||'foreign-local'); });
  return removed;
}
function _chatRemoveInboxEntryForUsers(convId, userIds){
  convId=String(convId||'').trim();
  var targets=_chatNormalizeParticipants(userIds||[]).filter(Boolean);
  if(!convId || !targets.length) return Promise.resolve();
  try{
    var root = window.LiderCRM;
    var wc = root && root.api && root.api.workerClient;
    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.getConfig === 'function' && typeof wc.putConfig === 'function'){
      return Promise.all(targets.map(function(uid){
        var docName=_chatInboxDocName(uid);
        return wc.getConfig(docName).catch(function(){ return null; }).then(function(doc){
          var payload = doc && typeof doc === 'object' ? doc : {};
          var list = Array.isArray(payload.list) ? payload.list : [];
          var next = list.filter(function(item){ return !(item && item.id === convId); });
          if(next.length === list.length) return null;
          payload.list = next;
          payload.ts = Date.now();
          return wc.putConfig(docName, payload).catch(function(){});
        });
      }));
    }
    if(DB_MODE === 'firebase' && db){
      return Promise.all(targets.map(function(uid){
        var ref = db.collection('config').doc(_chatInboxDocName(uid));
        return ref.get().then(function(snap){
          var payload = snap && snap.exists ? (snap.data() || {}) : {};
          var list = Array.isArray(payload.list) ? payload.list : [];
          var next = list.filter(function(item){ return !(item && item.id === convId); });
          if(next.length === list.length) return null;
          payload.list = next;
          payload.ts = Date.now();
          return ref.set(payload);
        }).catch(function(){});
      }));
    }
  }catch(_e){}
  return Promise.resolve();
}
function _chatInboxPreview(msg){
  if(!msg) return '';
  if(msg.text) return msg.text;
  if(msg.attachmentKind === 'audio') return '🎤 Áudio';
  if(msg.attachmentName) return '📎 ' + msg.attachmentName;
  return '';
}
function _chatUpsertInboxEntry(list, entry){
  var arr = Array.isArray(list) ? list.slice() : [];
  var idx = arr.findIndex(function(x){ return x && x.id === entry.id; });
  if(idx >= 0) arr[idx] = Object.assign({}, arr[idx], entry);
  else arr.push(entry);
  arr.sort(function(a,b){ return String((b&&b.updatedAt)||'').localeCompare(String((a&&a.updatedAt)||'')); });
  return arr.slice(0,200);
}
function _chatSyncConvIndex(conv, msg){
  conv = _chatNormalizeConv(conv||{});
  var participants = _chatNormalizeParticipants(conv.participants||[]);
  if(!participants.length) return Promise.resolve();
  var entry = {
    id: conv.id,
    isGroup: !!conv.isGroup,
    name: conv.name || '',
    participants: participants,
    participantNames: conv.participantNames || {},
    updatedAt: (msg && msg.ts) || conv.updatedAt || new Date().toISOString(),
    preview: _chatInboxPreview(msg)
  };
  try{
    var root = window.LiderCRM;
    var wc = root && root.api && root.api.workerClient;
    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.getConfig === 'function' && typeof wc.putConfig === 'function'){
      return Promise.all(participants.map(function(uid){
        return wc.getConfig(_chatInboxDocName(uid)).catch(function(){ return null; }).then(function(doc){
          var payload = doc && typeof doc === 'object' ? doc : {};
          payload.list = _chatUpsertInboxEntry(payload.list, entry);
          payload.ts = Date.now();
          return wc.putConfig(_chatInboxDocName(uid), payload).catch(function(){});
        });
      }));
    }
    if(DB_MODE === 'firebase' && db){
      return Promise.all(participants.map(function(uid){
        return db.collection('config').doc(_chatInboxDocName(uid)).get().then(function(snap){
          var payload = snap && snap.exists ? (snap.data() || {}) : {};
          payload.list = _chatUpsertInboxEntry(payload.list, entry);
          payload.ts = Date.now();
          return db.collection('config').doc(_chatInboxDocName(uid)).set(payload);
        }).catch(function(){});
      }));
    }
  }catch(_e){}
  return Promise.resolve();
}
function _chatPullInboxConvs(){
  if(!S || !S.userId) return Promise.resolve();
  function applyInbox(doc){
    var list = doc && Array.isArray(doc.list) ? doc.list : [];
    if(!list.length){
      _chatPurgeForeignLocalConvs('inbox-empty');
      return;
    }
    var convs = _chatGetConvs();
    var changed = false;
    list.forEach(function(item){
      if(!item || !item.id) return;
      /* CORREÇÃO 2026-08-07: pula qualquer conversa marcada como
         excluída NESTE aparelho (lápide local) — é isso que impede
         ela de voltar sozinha, sem precisar mexer no índice
         compartilhado da nuvem (que afetaria os outros aparelhos do
         mesmo usuário). Ver comentário completo na declaração de
         CHAT_DELETED_CONVS_KEY. */
      if(_chatIsConvDeleted(item.id)) return;
      var parts = _chatNormalizeParticipants(item.participants || []);
      if(!parts.length || !_chatParticipantsInclude(parts, S.userId)){
        _chatPurgeLocalConv(item.id, 'inbox-foreign');
        _chatRemoveInboxEntryForUsers(item.id, [S.userId]).catch(function(){});
        return;
      }
      var idx = convs.findIndex(function(c){ return c && c.id === item.id; });
      var merged = _chatNormalizeConv(Object.assign({}, (idx >= 0 ? convs[idx] : {}), item));
      if(idx >= 0){
        var prev = JSON.stringify(convs[idx]);
        var next = JSON.stringify(merged);
        if(prev !== next){ convs[idx] = merged; changed = true; }
      }else{
        convs.push(merged);
        changed = true;
      }
      if(item.updatedAt) _chatLastMsgTs[item.id] = item.updatedAt;
    });
    if(changed) _chatSaveConvs(convs);
    _chatPurgeForeignLocalConvs('post-inbox-merge');
  }
  try{
    var root = window.LiderCRM;
    var wc = root && root.api && root.api.workerClient;
    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.getConfig === 'function'){
      return wc.getConfig(_chatInboxDocName(S.userId)).then(function(doc){ applyInbox(doc||{}); }).catch(function(){});
    }
    if(DB_MODE === 'firebase' && db){
      return db.collection('config').doc(_chatInboxDocName(S.userId)).get().then(function(snap){
        applyInbox(snap && snap.exists ? (snap.data() || {}) : {});
      }).catch(function(){});
    }
  }catch(_e){}
  return Promise.resolve();
}
function _chatSyncMsg(msg){
  if(!S||!S.userId||!msg||!msg.convId)return;
  try{
    var root = window.LiderCRM;
    var wc = root && root.api && root.api.workerClient;
    var payload = {
      id: msg.convId,
      updatedAt: msg.ts || new Date().toISOString(),
      msgs: _chatGetMsgs(msg.convId)
    };
    var conv = _chatGetConvs().find(function(c){ return c && c.id === msg.convId; });
    if(conv){
      conv = _chatNormalizeConv(conv);
      payload.isGroup = !!conv.isGroup;
      payload.name = conv.name || '';
      payload.participants = conv.participants || [];
      payload.participantNames = conv.participantNames || {};
    }
    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.putConfig === 'function'){
      wc.putConfig('chat_conv_' + msg.convId, payload).catch(function(e){
        console.warn('[chat] sync falhou', e);
        /* CORREÇÃO 2026-08-07 (relatado: "mensagem existe no Capacitor
           mas não no PC, ficou presa só no aparelho"): antes, uma falha
           aqui só virava um aviso no console — a mensagem nunca mais
           tentava sincronizar sozinha. Agora enfileira no mesmo sistema
           de retry já usado por atividades/ligações/agenda (fila
           persistente, tenta de novo automaticamente a cada ~15s e ao
           voltar a ficar online, com backoff — não é preciso reenviar
           manualmente nem reabrir a conversa). */
        try{
          if(window.LF && typeof window.LF.enqueueChatMsg==='function'){
            window.LF.enqueueChatMsg(msg.convId, payload);
          }
        }catch(_e2){}
      });
      if(conv) _chatSyncConvIndex(conv, msg).catch(function(){});
    } else if(DB_MODE === 'firebase' && db){
      db.collection('config').doc('chat_conv_' + msg.convId).set(payload).catch(function(e){ console.warn('[chat] firebase sync falhou', e); });
      if(conv) _chatSyncConvIndex(conv, msg).catch(function(){});
    }
  }catch(e){ console.warn('[chat] sync error', e); }
}

function _chatPollNewMsgs(){
  if(!S || !S.userId) return;
  if(_chatPollInFlight) return;
  if(document && document.visibilityState==='hidden') return;
  _chatPollInFlight=true;
  try{
    var root = window.LiderCRM;
    var wc = root && root.api && root.api.workerClient;
    if(root && root.config && root.config.useWorkerApi && wc && typeof wc.getConfig === 'function'){
      _chatPullInboxConvs().then(function(){
        _chatPurgeForeignLocalConvs('poll-before-fetch');
        var convs = _chatGetConvs();
        return Promise.all((convs||[]).map(function(c){
        return wc.getConfig('chat_conv_' + c.id).then(function(doc){
          if(!(doc && doc.msgs)) return;
          if(doc && (doc.participants || doc.participantNames || typeof doc.name==='string')){
            var convs=_chatGetConvs();
            var idx=convs.findIndex(function(x){ return x && x.id===c.id; });
            if(idx>=0){
              convs[idx]=_chatNormalizeConv(Object.assign({},convs[idx],{
                isGroup: typeof doc.isGroup==='boolean' ? doc.isGroup : convs[idx].isGroup,
                name: typeof doc.name==='string' ? doc.name : convs[idx].name,
                participants: doc.participants || convs[idx].participants,
                participantNames: Object.assign({}, (convs[idx].participantNames||{}), (doc.participantNames||{})),
                // FIX Passo 4 (2026-07-21) — receber metadados de grupo
                admins: Array.isArray(doc.admins) ? doc.admins : convs[idx].admins,
                createdBy: typeof doc.createdBy==='string' && doc.createdBy ? doc.createdBy : convs[idx].createdBy
              }));
              _chatSaveConvs(convs);
              c=convs[idx];
            }
          }
          var localMsgs = _chatGetMsgs(c.id);
          var known = new Set((localMsgs||[]).map(function(m){ return m && m.id; }));
          /* 2026-08-06: descarta qualquer ID marcado como apagado — ver
             _chatMarkMsgDeleted()/CHAT_DELETED_MSGS_KEY. Sem isso, o
             mesmo filtro "ID desconhecido = mensagem nova" que serve
             pra trazer mensagens de verdade também trazia de volta
             mensagens apagadas cujo ID só sumiu do lado local.
             2026-08-07: descarta também qualquer mensagem de antes da
             conversa ter sido excluída (_chatGetClearedAt) — sem isso,
             excluir a conversa e depois falar de novo com a MESMA
             pessoa trazia as mensagens antigas de volta no primeiro
             poll, já que o documento no servidor nunca foi realmente
             apagado (é compartilhado com a outra pessoa). */
          var clearedOk = _chatClearedAtFilter(c.id);
          var incoming = (doc.msgs || []).filter(function(m){ return m && m.id && !known.has(m.id) && !_chatIsMsgDeleted(m.id) && clearedOk(m); });
          if(!incoming.length) return;
          var all = localMsgs.concat(incoming).filter(Boolean);
          var byId = {};
          all.forEach(function(m){ if(m && m.id) byId[m.id]=m; });
          all = Object.keys(byId).map(function(k){ return byId[k]; }).sort(function(a,b){ return String(a.ts||'').localeCompare(String(b.ts||'')); });
          _chatSaveMsgs(c.id, all);
          _chatLastMsgTs[c.id] = all.length ? all[all.length-1].ts : null;
          if(_chatCurrentConv === c.id) renderChatMsgs(c.id);
          renderChatList();
          _chatUpdateUnreadBadge();
          incoming.forEach(function(m){
            if(m.fromUid !== S.userId && !c.muted){
              if(typeof fireNativeNotification === 'function') fireNativeNotification('💬 '+(m.fromName||'?'), m.text||'📎 Arquivo', m.id, 'chat');
              else if(typeof _playNotifSound === 'function') _playNotifSound('chat');
            }
          });
        }).catch(function(){});
        }));
      }).finally(function(){ _chatPollInFlight=false; });
      return;
    }
  }catch(e){console.warn('[chat] poll error',e);}
  _chatPollInFlight=false;
}

/* ─── Badge de não lidas ─── */
function _chatUpdateUnreadBadge(){
  if(!S||!S.userId)return;
  var convs = _chatGetConvs();
  var total = 0;
  convs.forEach(function(c){
    var msgs = _chatGetMsgs(c.id);
    /* FIX R4 (2026-07-22): grupos usam toUid=''; usar fromUid para grupos */
    var _myIdBadge = S && S.userId;
    total += msgs.filter(function(m){
      if(m.read) return false;
      return c.isGroup ? (m.fromUid !== _myIdBadge) : (m.toUid === _myIdBadge);
    }).length;
  });
  _chatUnreadCount = total;
  var badge = document.getElementById('chat-badge');
  if(badge) badge.textContent = total > 0 ? (total > 99 ? '99+' : total) : '';
  // Also update mobile nav badge
  var mobileBadge = document.querySelector('[data-page="chat"] .mbn-dot');
  if(mobileBadge) mobileBadge.style.opacity = total > 0 ? '1' : '0';
}

/* ─── Formatar tempo ─── */
function _chatFmtTime(ts, withTime){
  if(!ts) return '';
  try{
    var d = new Date(ts);
    if(isNaN(d.getTime())) return '';
    var now = new Date();
    var isToday = d.toDateString() === now.toDateString();
    if(withTime){
      var h = String(d.getHours()).padStart(2,'0');
      var m = String(d.getMinutes()).padStart(2,'0');
      return h + ':' + m;
    }
    if(isToday){
      var h2 = String(d.getHours()).padStart(2,'0');
      var m2 = String(d.getMinutes()).padStart(2,'0');
      return h2 + ':' + m2;
    }
    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate()-1);
    if(d.toDateString() === yesterday.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'});
  }catch(e){ return ''; }
}

/* ─── PATCH FASE 1 (2026-07-22): Realtime via Supabase + fallback poll ─── */

/**
 * _chatSubscribeRealtime(convId)
 * Assina o canal Realtime de fs_documents para chat_conv_<convId>.
 * Quando o doc muda no servidor, dispara _chatPollNewMsgs() imediatamente.
 * Fallback: se Supabase Realtime não estiver disponível, mantém polling de 3 s.
 */
function _chatSubscribeRealtime(convId){
  if(!convId) return;
  if(_chatRealtimeChannels[convId]) return; // já subscrito

  var _sb = (window.supabase && typeof window.supabase.channel === 'function')
            ? window.supabase
            : (window._supabaseClient || null);

  if(!_sb) return; // Supabase não disponível — polling cobre

  try{
    var docKey = 'chat_conv_' + convId;
    var ch = _sb.channel('rt-chat-' + convId, { config: { broadcast: { self: false } } })
      .on('postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'fs_documents',
          filter: 'path=eq.' + docKey,
        },
        function(payload){
          try{
            if(payload && payload.new && payload.new.data){
              /* Mesclar dados recebidos diretamente — evita round-trip */
              var doc = payload.new.data;
              if(doc && doc.msgs && Array.isArray(doc.msgs)){
                var localMsgs = _chatGetMsgs(convId);
                var known     = new Set((localMsgs||[]).map(function(m){ return m&&m.id; }));
                /* 2026-08-06/07: mesma proteção do poll — ver comentário lá. */
                var clearedOkRt = _chatClearedAtFilter(convId);
                var incoming  = doc.msgs.filter(function(m){ return m&&m.id&&!known.has(m.id)&&!_chatIsMsgDeleted(m.id)&&clearedOkRt(m); });
                if(incoming.length){
                  var all = _chatMergeMsgLists(localMsgs, incoming);
                  _chatSaveMsgs(convId, all);
                  _chatLastMsgTs[convId] = all.length ? all[all.length-1].ts : null;
                  if(_chatCurrentConv === convId) renderChatMsgs(convId);
                  renderChatList();
                  _chatUpdateUnreadBadge();
                  var conv = _chatGetConvs().find(function(c){ return c&&c.id===convId; });
                  incoming.forEach(function(m){
                    if(m.fromUid !== (S&&S.userId) && !(conv&&conv.muted)){
                      if(typeof fireNativeNotification==='function')
                        fireNativeNotification('💬 '+(m.fromName||'?'), m.text||'📎 Arquivo', m.id, 'chat');
                      else if(typeof _playNotifSound==='function') _playNotifSound('chat');
                    }
                  });
                }
              }
            } else {
              /* Sem payload direto — forçar pull */
              try{ _chatPollNewMsgs(); }catch(_e){}
            }
          }catch(e){ console.warn('[chat] realtime handler erro',e); }
        }
      )
      .subscribe(function(status){
        if(status === 'SUBSCRIBED'){
          console.info('[chat] Realtime OK para conv', convId);
        } else if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
          console.warn('[chat] Realtime falhou para conv', convId, '— usando polling');
          _chatEnsurePolling();
        }
      });
    _chatRealtimeChannels[convId] = ch;
  }catch(rtErr){
    console.warn('[chat] Realtime subscribe erro:', rtErr.message);
  }
}

/**
 * _chatUnsubscribeRealtime(convId)
 * Remove canal Realtime de uma conversa (ao fechar o chat ou trocar de conv).
 */
function _chatUnsubscribeRealtime(convId){
  if(!convId || !_chatRealtimeChannels[convId]) return;
  try{
    var _sb = (window.supabase && typeof window.supabase.removeChannel==='function')
              ? window.supabase : null;
    if(_sb) _sb.removeChannel(_chatRealtimeChannels[convId]);
  }catch(_e){}
  delete _chatRealtimeChannels[convId];
}

/**
 * _chatUnsubscribeAllRealtime()
 * Limpa todos os canais ao sair do chat.
 */
function _chatUnsubscribeAllRealtime(){
  Object.keys(_chatRealtimeChannels).forEach(_chatUnsubscribeRealtime);
  _chatRealtimeChannels = {};
}

/* ─── Presence: quem está online agora ──────────────────────────── */

/**
 * _chatStartPresence()
 * Entra no canal de presence global. Cada usuário faz track() com seu uid.
 * Atualiza _chatOnlineUsers e dispara re-render da lista.
 * Heartbeat a cada 30 s para manter presença.
 */
function _chatStartPresence(){
  if(_chatPresenceChannel) return; // já iniciado
  if(!S||!S.userId) return;

  /* FIX 2026-08-04: o CLIENTE Supabase (com .channel()) é exposto como
     window.supabaseClient por js/supabase.js depois do createClient —
     window.supabase é só o SDK. Antes este check olhava só o SDK e a
     presença nunca inicializava ("Supabase indisponível"). */
  var _sb = (window.supabaseClient && typeof window.supabaseClient.channel==='function')
            ? window.supabaseClient
            : ((window.supabase && typeof window.supabase.channel==='function')
               ? window.supabase : null);
  if(!_sb){
    if(!_chatPresenceWarnedNoSb){
      _chatPresenceWarnedNoSb=true;
      console.warn('[chat] Presence: cliente Supabase ainda indisponível — aguardando initDB (re-tenta no próximo heartbeat)');
      /* agenda nova tentativa — o initDB expõe supabaseClient de forma assíncrona */
      setTimeout(function(){ _chatPresenceWarnedNoSb=false; _chatStartPresence(); }, 3000);
    }
    return;
  }
  _chatPresenceWarnedNoSb=false;

  try{
    _chatPresenceChannel = _sb.channel('chat-presence', {
      config: { presence: { key: String(S.userId) } },
    });

    _chatPresenceChannel
      .on('presence', { event: 'sync' }, function(){
        try{
          var state = _chatPresenceChannel.presenceState();
          var seenNow = {};
          Object.keys(state).forEach(function(uid){
            seenNow[uid] = true;
            _chatOnlineUsers[uid] = { onlineAt: Date.now() };
            /* está de volta (ou nunca saiu) — cancela remoção pendente, se tinha */
            if(_chatOfflineGraceTimers[uid]){ clearTimeout(_chatOfflineGraceTimers[uid]); delete _chatOfflineGraceTimers[uid]; }
          });
          /* remove só quem realmente não está no state novo E não tem
             tolerância pendente (ela mesma cuida de remover depois) */
          Object.keys(_chatOnlineUsers).forEach(function(uid){
            if(!seenNow[uid] && !_chatOfflineGraceTimers[uid]) delete _chatOnlineUsers[uid];
          });
          if(document.getElementById('pg-chat')&&document.getElementById('pg-chat').classList.contains('on')){
            renderChatList();
          }
        }catch(_e){}
      })
      .on('presence', { event: 'join' }, function(payload){
        try{
          if(payload&&payload.key){
            _chatOnlineUsers[payload.key] = { onlineAt: Date.now() };
            /* voltou — cancela a remoção agendada, se tinha */
            if(_chatOfflineGraceTimers[payload.key]){ clearTimeout(_chatOfflineGraceTimers[payload.key]); delete _chatOfflineGraceTimers[payload.key]; }
          }
          if(document.getElementById('pg-chat')&&document.getElementById('pg-chat').classList.contains('on')){
            renderChatList();
          }
        }catch(_e){}
      })
      .on('presence', { event: 'leave' }, function(payload){
        /* 2026-08-05: TOLERÂNCIA de 45s antes de marcar offline de verdade.
           Sem isso, uma queda rápida de socket (app em segundo plano por
           poucos segundos, tela apagando, troca de rede) já apagava o
           usuário de _chatOnlineUsers na hora, piscando "offline" pros
           outros mesmo quando a pessoa nem saiu de fato do app. Se um
           'join'/'sync' chegar antes dos 45s confirmando que a pessoa
           voltou, a remoção agendada aqui é cancelada (ver acima) e
           _chatOnlineUsers nem chega a perder a entrada. */
        try{
          if(payload&&payload.key){
            var uid=payload.key;
            if(_chatOfflineGraceTimers[uid]) clearTimeout(_chatOfflineGraceTimers[uid]);
            _chatOfflineGraceTimers[uid]=setTimeout(function(){
              delete _chatOnlineUsers[uid];
              delete _chatOfflineGraceTimers[uid];
              if(document.getElementById('pg-chat')&&document.getElementById('pg-chat').classList.contains('on')){
                renderChatList();
              }
            },45000);
          }
        }catch(_e){}
      })
      .subscribe(function(status){
        if(status === 'SUBSCRIBED'){
          _chatPresenceChannel.track({
            uid:      String(S.userId),
            nome:     S.nome || '?',
            onlineAt: new Date().toISOString(),
          }).catch(function(){});
          /* Heartbeat a cada 30 s */
          if(_chatPresenceHbTimer) clearInterval(_chatPresenceHbTimer);
          _chatPresenceHbTimer = setInterval(function(){
            try{
              if(_chatPresenceChannel && S && S.userId){
                _chatPresenceChannel.track({
                  uid:      String(S.userId),
                  nome:     S.nome || '?',
                  onlineAt: new Date().toISOString(),
                }).catch(function(){});
              }
            }catch(_e){}
          }, 30000);
          console.info('[chat] Presence iniciado para', S.userId);
        } else if(status === 'CHANNEL_ERROR'){
          console.warn('[chat] Presence canal erro — sem dot online');
        }
      });
  }catch(pErr){
    console.warn('[chat] Presence erro ao iniciar:', pErr.message);
  }
}

/**
 * _chatStopPresence()
 * Sai do canal de presence (ao fazer logout ou fechar o chat).
 */
function _chatStopPresence(){
  if(_chatPresenceHbTimer){ clearInterval(_chatPresenceHbTimer); _chatPresenceHbTimer=null; }
  if(_chatPresenceChannel){
    try{
      var _sb = window.supabase && typeof window.supabase.removeChannel==='function' ? window.supabase : null;
      if(_sb) _sb.removeChannel(_chatPresenceChannel);
    }catch(_e){}
    _chatPresenceChannel = null;
  }
  Object.keys(_chatOfflineGraceTimers).forEach(function(uid){ clearTimeout(_chatOfflineGraceTimers[uid]); });
  _chatOfflineGraceTimers = {};
  _chatOnlineUsers = {};
}

/**
 * _chatIsOnline(uid)
 * Retorna true se o uid tiver presence ativa.
 */
function _chatIsOnline(uid){
  if(!uid) return false;
  return !!_chatOnlineUsers[String(uid)];
}

/* ─── Init: start Realtime quando o chat é aberto ─── */
function _chatEnsurePolling(){
  /* Mantido por compatibilidade — agora inicia Realtime para conv atual
     e usa polling apenas como fallback quando Realtime não está disponível. */
  if(_chatCurrentConv) _chatSubscribeRealtime(_chatCurrentConv);

  /* Polling de fallback: 3 s (era 1.2 s) — só dispara se não há canal RT */
  if(_chatPollTimer){ clearInterval(_chatPollTimer); _chatPollTimer = null; }
  if(document && document.visibilityState==='hidden') return;
  var _hasRealtime = Object.keys(_chatRealtimeChannels).length > 0;
  var _pollInterval = _hasRealtime ? 10000 : 3000; // RT ativo: poll de backup a 10 s
  _chatPollTimer = setInterval(function(){
    try{ _chatPollNewMsgs(); }catch(e){ console.warn('[chat] poll tick falhou',e); }
  }, _pollInterval);
}

function initChatPage(){
  if(!S||!S.userId){console.warn('[chat] initChatPage: sessão não iniciada');return;}
  try{ if(window.LiderCRM&&window.LiderCRM.diagnostics&&window.LiderCRM.diagnostics.crashReporter) window.LiderCRM.diagnostics.crashReporter.breadcrumb('initChatPage:start'); }catch(_e){}
  _chatPurgeForeignLocalConvs('init-chat-page');
  _chatSaveConvs(_chatGetConvs());
  // FIX #16 (2026-07-20): ao abrir a página Papo, garante que o cadastro
  // de usuários está fresco. Sem isso, renderChatList renderizava "Usuário"
  // genérico quando o cache local ainda não tinha sido preenchido.
  if(typeof loadUsersDB === 'function'){
    try{
      loadUsersDB(function(){
        try{ renderChatList(); }catch(_e){}
      });
    }catch(e){ console.warn('[chat] loadUsersDB falhou em initChatPage', e); }
  }
  renderChatList();
  try{ if(typeof startRooms==='function') startRooms(); }catch(e){ console.warn('[chat] startRooms falhou',e); }

  /* PATCH FASE 1 (2026-07-22): Presence + Realtime + Push */
  try{ _chatStartPresence(); }catch(e){ console.warn('[chat] presence start falhou',e); }
  _chatEnsurePolling();
  try{ _chatPollNewMsgs(); }catch(e){ console.warn('[chat] poll inicial falhou',e); }
  /* Subscrever Realtime para a conversa atual, se houver */
  if(_chatCurrentConv) try{ _chatSubscribeRealtime(_chatCurrentConv); }catch(_e){}
  /* Registrar device push (esqueleto Fase 2) */
  try{ if(window.LiderCRM&&window.LiderCRM.diagnostics&&window.LiderCRM.diagnostics.crashReporter) window.LiderCRM.diagnostics.crashReporter.breadcrumb('initChatPage:antes-registerPushDevice'); }catch(_e){}
  try{ _chatRegisterPushDevice(); }catch(_e){}

  _chatUpdateUnreadBadge();
  try{ if(window.LiderCRM&&window.LiderCRM.diagnostics&&window.LiderCRM.diagnostics.crashReporter) window.LiderCRM.diagnostics.crashReporter.breadcrumb('initChatPage:fim'); }catch(_e){}
  /* CORREÇÃO 2026-08-06 (relatório do usuário: "chat fecha sozinho ao
     rolar mensagens, sem clicar em X, volta pra lista de conversas").
     CAUSA RAIZ: initChatPage() reseta pra visão de LISTA sem
     condição nenhuma, toda vez que roda — e ela roda de novo toda vez
     que a pessoa toca no ícone "Papo" na barra inferior, mesmo se já
     estiver DENTRO de uma conversa (mobileGoPage não pula reinicialização
     ao tocar na aba já ativa). Um toque sem querer na barra de
     navegação — bem fácil de acontecer arrastando o dedo pra cima perto
     do rodapé da tela, que é exatamente onde ela fica — bastava pra
     descartar a conversa aberta e devolver a lista, sem nenhum "X" ter
     sido clicado (batendo com o relatado). Agora só reseta pra lista
     se NÃO houver conversa aberta no momento — reabrir a mesma aba com
     uma conversa já ativa simplesmente não mexe em nada dessa parte. */
  if(!_chatCurrentConv){
    var listEl = document.getElementById('chat-list-panel');
    if(listEl) listEl.classList.add('full');
    var convEl = document.getElementById('chat-conv-panel');
    if(convEl) convEl.classList.remove('open');
  }
  /* CORREÇÃO 2026-08-07: "lista de conversas E dentro da conversa, os
     dois ainda não ficam fixos". A correção de altura mais robusta
     (que não depende de dvh, cálculo direto de window.innerHeight —
     ver _chatSyncMobileLayout) só era chamada de dentro de
     openChatConv()/closeChatConv() — ou seja, só depois que uma
     conversa específica era aberta pelo menos uma vez. Quem só entrava
     no Papo e ficava olhando a LISTA (sem tocar em ninguém ainda)
     nunca disparava essa correção — #pg-chat ficava só com o CSS
     baseado em dvh, sem o reforço em JS. Chamando aqui também, a
     lista já entra corrigida, sem precisar abrir uma conversa primeiro. */
  if(typeof _chatSyncMobileLayout==='function')setTimeout(function(){_chatSyncMobileLayout(false);},30);
}

function destroyChatPage(){
  if(_chatPollTimer){ clearInterval(_chatPollTimer); _chatPollTimer = null; }
  /* PATCH FASE 1 (2026-07-22): cleanup Realtime + Presence ao sair do chat */
  try{ _chatUnsubscribeAllRealtime(); }catch(_e){}
  try{ _chatStopPresence(); }catch(_e){}
  _chatCurrentConv = null;
  try{ document.body.classList.remove('lf-chat-room-open','lf-chat-kb-open','lf-chat-page-active'); }catch(_e){}
}

if(!window.__lfChatUsersUpdatedHook){
  window.__lfChatUsersUpdatedHook=1;
  window.addEventListener('crm:users-updated',function(){
    try{
      // FIX #15 (2026-07-20): quando o cadastro de usuários é atualizado (loadUsersDB
      // termina, admin edita nome, etc.), re-normaliza TODAS as conversas para
      // recomputar participantNames com os nomes reais.
      var convs=_chatGetConvs();
      if(convs&&convs.length)_chatSaveConvs(convs);
      if(document.getElementById('pg-chat')&&document.getElementById('pg-chat').classList.contains('on')){
        renderChatList();
        if(_chatCurrentConv) openChatConv(_chatCurrentConv);
      }
      // FIX #16: se o modal "Nova Conversa" estiver aberto, atualiza a lista
      var newConvModal = document.getElementById('mo-chat-new');
      if(newConvModal && newConvModal.classList && newConvModal.classList.contains('on')){
        if(typeof _chatRenderNewConvList==='function') _chatRenderNewConvList();
      }
    }catch(e){ console.warn('[chat] users-updated hook falhou',e); }
  });
}

if(!window.__lfChatVisibilityHook){
  window.__lfChatVisibilityHook=1;
  document.addEventListener('visibilitychange',function(){
    try{
      var _pgChat = document.getElementById('pg-chat');
      var _chatOn = _pgChat && _pgChat.classList.contains('on');
      if(document.visibilityState==='visible'){
        if(_chatOn){
          /* PATCH FASE 1: retomar Realtime + Presence ao voltar para foreground */
          try{ _chatStartPresence(); }catch(_e){}
          if(_chatCurrentConv) try{ _chatSubscribeRealtime(_chatCurrentConv); }catch(_e){}
          if(typeof _chatEnsurePolling==='function') _chatEnsurePolling();
          if(typeof _chatPollNewMsgs==='function') _chatPollNewMsgs();
        }
      }else{
        /* App foi para background: parar poll (Realtime continua, WS mantido pelo browser) */
        if(_chatPollTimer){ clearInterval(_chatPollTimer); _chatPollTimer=null; }
      }
    }catch(e){ console.warn('[chat] visibility hook falhou',e); }
  },{passive:true});
}


/* ══════════════════════════════════════════════════════════════════
 * PATCH FASE 1 (2026-07-22) — Esqueleto de Registro de Device Push
 * ──────────────────────────────────────────────────────────────────
 * _chatRegisterPushDevice()   — registra FCM/APNS/WebPush token via Worker
 * _chatUnregisterPushDevice() — remove token ao fazer logout
 *
 * Em Fase 2 será integrado ao Service Worker + FCM SDK.
 * Por ora: detecta platform, obtém token (FCM mock ou Web Push VAPID),
 * e envia para POST /api/v1/push/register com JWT.
 * Falhas são silenciosas (não-crítico para UX).
 * ══════════════════════════════════════════════════════════════════ */

var _chatPushDeviceRegistered = false;

/* ══════════════════════════════════════════════════════════════════
 * CORRIGIDO 2026-08-05 — CRASH CONFIRMADO (log real enviado pelo usuário
 * via "Enviar feedback" do Android):
 *
 *   Caused by: java.lang.IllegalStateException: Default FirebaseApp is
 *   not initialized in this process com.liderfinanceira.lidercrm. Make
 *   sure to call FirebaseApp.initializeApp(Context) first.
 *     at com.google.firebase.FirebaseApp.getInstance(FirebaseApp.java:179)
 *     at com.google.firebase.messaging.FirebaseMessaging.getInstance(...)
 *     at com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin.register(...)
 *
 * CAUSA RAIZ: initChatPage() chama _chatRegisterPushDevice() toda vez
 * que a aba Papo abre → _chatGetPushToken() → Push.register() (plugin
 * nativo @capacitor/push-notifications). Sem android/app/google-services.json
 * no projeto (ver docs/CAPACITOR-BUILD-SETUP-20260804.md, item 6 —
 * pendente, depende de vocês criarem o projeto Firebase), o Firebase
 * nunca inicializa nativamente, e QUALQUER chamada a FirebaseMessaging
 * lança essa exceção — do lado JAVA, numa HandlerThread em BACKGROUND.
 *
 * Por isso nenhum dos try/catch em JS (aqui, em _chatRegisterPushDevice,
 * em initChatPage) protegia: a exceção nunca chega a virar uma rejeição
 * de Promise capturável em JS — ela derruba a thread nativa direto,
 * e o handler padrão de exceção não-capturada do Android mata o app
 * inteiro. Não tem como "proteger" isso só com try/catch em JS.
 *
 * FIX: trava o registro de push nativo atrás de uma flag, OFF por
 * padrão. Assim que o google-services.json (Android) e a capability de
 * Push Notifications (iOS, precisa de conta Apple Developer + Xcode)
 * estiverem configurados de verdade, troque pra `true` nesta linha —
 * uma mudança de uma palavra, sem precisar mexer em mais nada. Push via
 * Web (VAPID/service worker, fora do Capacitor) continua funcionando
 * normalmente, não é afetado por esta flag. */
var LF_PUSH_NATIVE_ENABLED = true;

function _chatRegisterPushDevice(){
  if(_chatPushDeviceRegistered) return;
  if(!S || !S.userId) return;

  var _jwtToken = (S && S._workerToken) || (S && S.token) || '';
  if(!_jwtToken) return;

  /* Detectar platform */
  var platform = 'web';
  if(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
    platform = (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) === 'ios' ? 'ios' : 'android';
  }

  /* Guard de crash — ver comentário acima. Só bloqueia o caminho nativo
     (Android/iOS); Web Push (platform==='web') segue liberado. */
  if(platform !== 'web' && !LF_PUSH_NATIVE_ENABLED){
    console.info('[chat-push] Registro nativo pulado de propósito (LF_PUSH_NATIVE_ENABLED=false) — Firebase/APNs ainda não configurado. Ver js/chat.js linha ~2529.');
    return;
  }

  /* Obter token push */
  _chatGetPushToken(platform).then(function(tokenData){
    if(!tokenData || !tokenData.token) return;

    return fetch('/api/v1/push/register', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + _jwtToken,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        token:        tokenData.token,
        platform:     platform,
        provider:     tokenData.provider || 'fcm',
        endpoint:     tokenData.endpoint  || null,
        p256dh:       tokenData.p256dh    || null,
        auth_secret:  tokenData.auth      || null,
        device_label: _chatGetDeviceLabel(),
        app_version:  (window.LiderCRM && window.LiderCRM.version) || '1.0',
      }),
    })
    .then(function(res){
      if(res.ok){
        _chatPushDeviceRegistered = true;
        console.info('[chat-push] Device registrado:', platform);
        /* Salvar token no localStorage para unregister no logout */
        try{ ss('lf13_push_token', tokenData.token); }catch(_e){}
      } else {
        console.warn('[chat-push] Registro falhou:', res.status);
      }
    });
  }).catch(function(e){
    console.warn('[chat-push] _chatGetPushToken falhou (non-fatal):', e.message);
  });
}

/**
 * _chatGetPushToken(platform)
 * Retorna Promise<{ token, provider, endpoint?, p256dh?, auth? }>
 *
 * Fase 1: esqueleto com suporte a Web Push VAPID e FCM via Capacitor.
 * Fase 2: integrar FCM SDK completo.
 */
function _chatGetPushToken(platform){
  /* ── Web Push VAPID (PWA / browser) ── */
  if(platform === 'web' && 'serviceWorker' in navigator && 'PushManager' in window){
    var VAPID_PUBLIC_KEY = window.LF_VAPID_PUBLIC_KEY || '';
    if(!VAPID_PUBLIC_KEY){
      /* VAPID não configurado ainda — retornar token sintético para registrar device */
      return Promise.resolve({
        token:    'web-nopush-' + (S && S.userId || 'anon') + '-' + Date.now(),
        provider: 'web-push',
      });
    }
    return navigator.serviceWorker.ready.then(function(reg){
      return reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: _chatUrlBase64ToUint8(VAPID_PUBLIC_KEY),
      });
    }).then(function(sub){
      var json = sub.toJSON();
      return {
        token:    json.endpoint,
        provider: 'web-push',
        endpoint: json.endpoint,
        p256dh:   json.keys && json.keys.p256dh,
        auth:     json.keys && json.keys.auth,
      };
    });
  }

  /* ── Capacitor (Android/iOS) via FCM plugin ── */
  if((platform === 'android' || platform === 'ios') &&
      window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications){
    var Push = window.Capacitor.Plugins.PushNotifications;
    return Push.requestPermissions().then(function(perm){
      if(perm.receive !== 'granted') throw new Error('permissão negada');
      return Push.register();
    }).then(function(){
      return new Promise(function(resolve, reject){
        var _timeout = setTimeout(function(){ reject(new Error('FCM token timeout')); }, 8000);
        Push.addListener('registration', function(data){
          clearTimeout(_timeout);
          resolve({ token: data.value, provider: 'fcm' });
        });
        Push.addListener('registrationError', function(err){
          clearTimeout(_timeout);
          reject(new Error(err.error || 'FCM registration error'));
        });
      });
    });
  }

  /* ── Fallback: sem suporte push ── */
  return Promise.resolve(null);
}

/** Helper VAPID key → Uint8Array */
function _chatUrlBase64ToUint8(base64String){
  var padding   = '='.repeat((4 - base64String.length % 4) % 4);
  var base64    = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData   = atob(base64);
  var outputArr = new Uint8Array(rawData.length);
  for(var i = 0; i < rawData.length; i++) outputArr[i] = rawData.charCodeAt(i);
  return outputArr;
}

/** Retorna um label legível do device */
function _chatGetDeviceLabel(){
  try{
    var ua = navigator.userAgent || '';
    if(/iPhone/.test(ua))   return 'iPhone';
    if(/iPad/.test(ua))     return 'iPad';
    if(/Android/.test(ua))  return 'Android';
    if(/Windows/.test(ua))  return 'Windows PC';
    if(/Macintosh/.test(ua)) return 'Mac';
    return 'Web Browser';
  }catch(_e){ return 'Unknown'; }
}

/**
 * _chatUnregisterPushDevice()
 * Chamado no logout para remover o token do servidor.
 */
function _chatUnregisterPushDevice(){
  var _jwtToken = (S && S._workerToken) || (S && S.token) || '';
  var token;
  try{ token = sg('lf13_push_token'); }catch(_e){ token = null; }
  if(!token || !_jwtToken){ _chatPushDeviceRegistered = false; return; }

  fetch('/api/v1/push/register', {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer ' + _jwtToken,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ token }),
  }).then(function(){
    try{ localStorage.removeItem('lf13_push_token'); }catch(_e){}
    _chatPushDeviceRegistered = false;
    console.info('[chat-push] Device desregistrado.');
  }).catch(function(e){
    console.warn('[chat-push] Unregister falhou (non-fatal):', e.message);
    _chatPushDeviceRegistered = false;
  });
}

/* Expor para uso no logout global */
window._chatUnregisterPushDevice = _chatUnregisterPushDevice;

if(!window.__LF_CHAT_MOBILE_LAYOUT_BOUND__){
  window.__LF_CHAT_MOBILE_LAYOUT_BOUND__=true;
  window.addEventListener('resize',function(){setTimeout(function(){_chatSyncMobileLayout(false);},40);},{passive:true});
  window.addEventListener('orientationchange',function(){setTimeout(function(){_chatSyncMobileLayout(false);},140);},{passive:true});
  document.addEventListener('focusin',function(e){
    if(e.target&&e.target.closest&&e.target.closest('#pg-chat'))setTimeout(function(){_chatSyncMobileLayout(true);},30);
  },true);
  document.addEventListener('focusout',function(e){
    if(e.target&&e.target.closest&&e.target.closest('#pg-chat'))setTimeout(function(){_chatSyncMobileLayout(false);},140);
  },true);
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',function(){setTimeout(function(){_chatSyncMobileLayout(false);},20);},{passive:true});
    window.visualViewport.addEventListener('scroll',function(){setTimeout(function(){_chatSyncMobileLayout(false);},20);},{passive:true});
  }
}

/* ══════════════════════════════════════════════════════════════════
 * DIAGNÓSTICO TEMPORÁRIO (2026-08-05) — _chatPushSelfTest()
 * ──────────────────────────────────────────────────────────────────
 * Botão "🔔 Testar notificação push" — movido (2026-08-05) da lista de
 * conversas pra Configurações > Manutenção (só visível pra ADM). Chama
 * /api/v1/push/selftest, que checa passo a passo (credencial
 * configurada → autenticação com o Google → device registrado → envio
 * de teste de verdade) e mostra o resultado num modal, pra saber
 * exatamente ONDE está travando em vez de só "não chegou notificação".
 * Remover este bloco + o botão no HTML quando push estiver confirmado
 * funcionando em produção — é ferramenta de investigação, não feature.
 * ══════════════════════════════════════════════════════════════════ */
function _chatPushSelfTest(){
  var _jwtToken=(S&&S._workerToken)||(S&&S.token)||'';
  if(!_jwtToken){ if(typeof toast==='function') toast('Sessão expirada.'); return; }

  var host=document.getElementById('chat-selftest-modal')||(function(){
    var d=document.createElement('div');
    d.id='chat-selftest-modal';
    d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
    document.body.appendChild(d);
    return d;
  })();
  host.innerHTML='<div style="background:var(--bg2,#1a1e26);color:var(--tx,#eee);border-radius:12px;padding:20px;max-width:440px;width:100%;max-height:80vh;overflow:auto;font-family:Outfit,sans-serif"><h3 style="margin:0 0 12px 0;font-size:1rem">🔔 Testando notificação push...</h3><div style="color:var(--mu);font-size:.85rem">Aguarde, isso pode levar alguns segundos.</div></div>';

  fetch('/api/v1/push/selftest',{
    method:'POST',
    headers:{'Authorization':'Bearer '+_jwtToken,'Content-Type':'application/json'},
  }).then(function(res){ return res.json().then(function(json){ return {status:res.status, json:json}; }); })
  .then(function(r){
    var data=(r.json && r.json.data) || {};
    var steps=data.steps || [];
    var stepsHTML=steps.map(function(s, i){
      var icon = s.ok ? '✅' : '❌';
      var detail = s.detail!=null ? '<div style="font-size:.72rem;color:var(--mu);margin-top:2px;word-break:break-word">'+eH(typeof s.detail==='string'?s.detail:JSON.stringify(s.detail))+'</div>' : '';
      return '<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)">'
        +'<div style="font-size:.85rem">'+icon+' <b>Passo '+(i+1)+':</b> '+eH(s.step)+'</div>'
        +detail
      +'</div>';
    }).join('');
    var overall = data.overallOk
      ? '<div style="margin-top:12px;padding:10px;background:rgba(27,138,94,.15);border:1px solid rgba(27,138,94,.3);border-radius:8px;font-size:.85rem">✅ Deu tudo certo — a notificação de teste foi enviada. Se não apareceu no celular, o problema é do lado do Android (permissão de notificação negada, economia de bateria bloqueando o app, etc.), não do servidor.</div>'
      : '<div style="margin-top:12px;padding:10px;background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.3);border-radius:8px;font-size:.85rem">❌ Parou num dos passos acima (marcado com ❌) — é ali que está o problema. Tira print desta tela e manda.</div>';
    host.querySelector('div').innerHTML = '<h3 style="margin:0 0 12px 0;font-size:1rem">🔔 Resultado do teste de push</h3>'
      + (r.status!==200 ? '<div style="color:var(--rl,#ef4444);font-size:.85rem;margin-bottom:10px">HTTP '+r.status+' — '+eH((r.json&&r.json.error&&r.json.error.message)||'erro desconhecido')+'</div>' : '')
      + stepsHTML + overall
      + '<button onclick="document.getElementById(\'chat-selftest-modal\').remove()" style="width:100%;margin-top:16px;padding:10px;background:rgba(195,154,45,.1);border:1px solid rgba(195,154,45,.25);color:inherit;border-radius:8px;cursor:pointer;font-size:.85rem">Fechar</button>';
  }).catch(function(err){
    host.querySelector('div').innerHTML = '<h3 style="margin:0 0 12px 0;font-size:1rem">🔔 Resultado do teste de push</h3>'
      + '<div style="color:var(--rl,#ef4444);font-size:.85rem">Não consegui nem chamar o servidor: '+eH(String(err&&err.message||err))+'</div>'
      + '<button onclick="document.getElementById(\'chat-selftest-modal\').remove()" style="width:100%;margin-top:16px;padding:10px;background:rgba(195,154,45,.1);border:1px solid rgba(195,154,45,.25);color:inherit;border-radius:8px;cursor:pointer;font-size:.85rem">Fechar</button>';
  });
}
window._chatPushSelfTest=_chatPushSelfTest;

/* ─── Enter para enviar ─── */
function chatOnKeyDown(e){
  if(e.key === 'Enter' && !e.shiftKey){
    e.preventDefault();
    sendChatMsg();
  }
}
