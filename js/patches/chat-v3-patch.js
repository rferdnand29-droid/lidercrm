(function(){
if(window.__CHAT_PATCH_V3__)return;window.__CHAT_PATCH_V3__=1;
var ROOM_COL='crm_chat_rooms_v3';
var C={rooms:[],roomMap:{},active:null,msgs:[],roomUnsub:null,msgUnsub:null,reply:null,queue:[],holdTm:null,rec:null,recChunks:[],typingTm:null,lastTypingAt:0,lastNotified:{},filter:'all',search:'',dept:'',roomTarget:null,msgTarget:null};
function q(s,p){return (p||document).querySelector(s)}
function qa(s,p){return Array.prototype.slice.call((p||document).querySelectorAll(s))}
function el(id){return document.getElementById(id)}
function me(){return window.S&&S.userId?S.userId:null}
function now(){return Date.now()}
function uid(p){return (p||'id')+'_'+now().toString(36)+'_'+Math.random().toString(36).slice(2,8)}
function fv(){return firebase.firestore.FieldValue}
function ms(v){if(!v)return 0;if(typeof v==='number')return v;if(v.toMillis)return v.toMillis();if(v.seconds)return v.seconds*1000+Math.floor((v.nanoseconds||0)/1e6);return 0}
function esc(s){return eH(String(s==null?'':s))}
function jsq(s){return _jsSq(String(s==null?'':s))}
function attr(s){return _htmlAttr(String(s==null?'':s))}
function fmtClock(v){var d=new Date(v||0);if(!v)return '';return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}
function fmtDay(v){if(!v)return '';var d=new Date(v),t=new Date();var same=d.toDateString()===t.toDateString();return same?fmtClock(v):d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' '+fmtClock(v)}
function shortTxt(s,n){s=String(s||'').trim();return s.length>(n||70)?s.slice(0,(n||70)-1)+'…':s}
function activeRoom(){return C.roomMap[C.active]||null}
function myState(r){return (r&&r.memberState&&r.memberState[me()])||{}}
function unread(r){return parseInt((myState(r).unreadCount)||0,10)||0}
function roleLevel(uid0){return typeof getCargoNivel==='function'?getCargoNivel(uid0||me()):1}
function roomCanManage(r){return !!(r&&(hasAdminAccess&&hasAdminAccess()||r.createdById===me()||((r.adminIds||[]).indexOf(me())>=0)))}
function roomCanWrite(r){if(!r)return false;if((r.memberIds||[]).indexOf(me())<0)return false;if((r.blockedUserIds||[]).indexOf(me())>=0&&!roomCanManage(r))return false;var min=parseInt(r.writeMinLevel||1,10)||1;return roomCanManage(r)||roleLevel()>=min}
function roomTitle(r){if(!r)return 'Conversa';if(r.type==='direct'){var other=(r.memberIds||[]).filter(function(id){return id!==me()})[0];var u=other?getUser(other):null;return u?u.nome:(r.title||'Conversa direta');}return r.title||'Grupo';}
function roomSub(r){if(!r)return '';var t=[];if(r.type==='direct'){var other=(r.memberIds||[]).filter(function(id){return id!==me()})[0];var u=other?getUser(other):null;if(u&&u.cargo)t.push(u.cargo);}else t.push((r.memberIds||[]).length+' participante'+((r.memberIds||[]).length===1?'':'s'));if(r.writeMinLevel&&r.writeMinLevel>1)t.push('somente '+permLabel(r.writeMinLevel)+' envia');return t.join(' • ')}
function permLabel(v){v=parseInt(v||1,10);if(v>=5)return 'ADM';if(v>=4)return 'Gestor/ADM';if(v>=3)return 'Supervisor+';return 'todos';}
function roomSort(a,b){var ap=!!myState(a).pinned,bp=!!myState(b).pinned;if(ap!==bp)return ap?-1:1;return (b.updatedAt||0)-(a.updatedAt||0)}
function userDeptIds(uid0){if(typeof getDepartments!=='function')return [];return (getDepartments()||[]).filter(function(d){return _deptUserBelongs&&_deptUserBelongs(d,uid0)}).map(function(d){return d.id})}
function shareDept(uidA,uidB){var a=userDeptIds(uidA),b=userDeptIds(uidB);return a.some(function(x){return b.indexOf(x)>=0})}
function deptName(id){var d=(getDepartments&&getDepartments()||[]).find(function(x){return x.id===id});return d?d.nome:'Sem departamento'}
function visibleUsers(){return (getUsers&&getUsers()||[]).filter(function(u){return u&&u.ativo&&u.id!==me()})}
function defaultState(ids){var o={};(ids||[]).forEach(function(id){o[id]={pinned:false,archived:false,muted:false,unreadCount:0,lastReadAt:0,lastDeliveredAt:0};});return o}
function ensureStyle(){
if(el('chat-v3-style'))return;
var st=document.createElement('style');
st.id='chat-v3-style';
st.textContent=`
#pg-chat{padding-bottom:18px}
#pg-chat .ph h1{color:#2b2f38}
#pg-chat .ph p{color:#6f7785}
.chat-shell{display:grid;grid-template-columns:360px minmax(0,1fr);gap:18px;min-height:calc(100vh - 168px)}
.chat-side,.chat-main{background:#fff;border:1px solid #e6ebf2;border-radius:24px;overflow:hidden;box-shadow:0 16px 45px rgba(18,38,63,.08)}
.chat-side{display:flex;flex-direction:column;min-width:0}
.chat-main{display:flex;flex-direction:column;min-width:0;background:#f7f9fc}
.chat-hd{padding:16px 16px 12px;border-bottom:1px solid #edf1f6;background:linear-gradient(180deg,#ffffff 0%,#f9fbff 100%)}
.chat-sync-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}
.chat-sync-left{display:flex;align-items:center;gap:8px;color:#687385;font-size:.82rem;font-weight:600}
.chat-sync-spinner{width:14px;height:14px;border:2px solid #d6e7ff;border-top-color:#2f7cf6;border-radius:50%;animation:chatSpin .85s linear infinite}
@keyframes chatSpin{to{transform:rotate(360deg)}}
.chat-hd-row{display:flex;gap:10px;align-items:center;justify-content:space-between}
.chat-hd h2{font-size:1.02rem;line-height:1.2;margin:0;color:#1f2633}
.chat-top-pill{display:none;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:#eef4ff;color:#2f6fec;font-size:.72rem;font-weight:700;white-space:nowrap}
.chat-actions{display:flex;gap:8px;flex-wrap:wrap}
.chat-mini{padding:9px 12px;border-radius:12px;border:1px solid #dbe5f2;background:#fff;color:#334155;font:600 .79rem Outfit,sans-serif;cursor:pointer;transition:background .15s ease,border-color .15s ease,transform .15s ease,box-shadow .15s ease;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.chat-mini:hover{background:#f8fbff;border-color:#bfd3f7;box-shadow:0 8px 20px rgba(47,124,246,.08)}
.chat-mini:active{transform:scale(.96)}
.chat-mini.on{border-color:#91b8ff;background:#eef4ff;color:#245fd4}
.chat-side-tools{padding:14px 14px 12px;border-bottom:1px solid #edf1f6;display:grid;gap:10px;background:#fff}
.chat-input,.chat-select{width:100%;background:#fff;border:1px solid #d7e2ee;border-radius:14px;padding:11px 13px;color:#243041;font:500 .92rem Outfit,sans-serif;outline:none}
.chat-input::placeholder{color:#98a2b3}
.chat-input:focus,.chat-select:focus{border-color:#9cbcf9;box-shadow:0 0 0 3px rgba(47,124,246,.12)}
.chat-filter-row{display:flex;gap:8px;flex-wrap:wrap}
.chat-filter-row .chat-mini{padding:8px 12px;border-radius:999px;background:#f7f9fc}
.chat-filter-row .chat-mini.on{background:#edf4ff;color:#245fd4;border-color:#b9d0fb}
.chat-room-list{flex:1;overflow:auto;padding:10px;background:#fff;display:flex;flex-direction:column;gap:6px}
.chat-room{padding:11px 12px;border-radius:18px;background:#fff;border:1px solid transparent;cursor:pointer;display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:10px;align-items:center;transition:background .15s,border-color .15s,box-shadow .15s}
.chat-room:hover{background:#f9fbff;border-color:#dce7f5}
.chat-room.on{background:#eaf3ff;border-color:#bfdbfe;box-shadow:inset 0 0 0 1px rgba(47,124,246,.08)}
.chat-av{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:.95rem;box-shadow:0 8px 22px rgba(47,124,246,.18)}
.chat-room-name{font-weight:700;font-size:.92rem;color:#1f2937;line-height:1.25}
.chat-room-sub,.chat-room-last,.chat-empty-sub,.chat-subtle{font-size:.72rem;color:#7b8594}
.chat-room-sub{margin-top:2px}
.chat-room-last{margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;color:#5f6b7a}
.chat-room-meta{display:flex;flex-direction:column;align-items:flex-end;gap:7px;padding-left:6px}
.chat-room-time{font-size:.7rem;color:#8c96a5;white-space:nowrap}
.chat-badge{min-width:21px;height:21px;padding:0 7px;border-radius:999px;background:#2f7cf6;color:#fff;font-size:.65rem;display:inline-flex;align-items:center;justify-content:center;font-weight:700;box-shadow:0 8px 18px rgba(47,124,246,.22)}
.chat-soft{font-size:.74rem;color:#98a2b3}
.chat-pin-tag{color:#e09b13}
.chat-top{padding:16px 18px;border-bottom:1px solid #e9eef5;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:12px}
.chat-top-left{display:flex;align-items:center;gap:12px;min-width:0}
.chat-top-title{font-weight:700;font-size:1rem;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chat-top-sub{font-size:.74rem;color:#768395;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.chat-back{display:none}
.chat-top-right{display:flex;align-items:center;gap:8px}
.chat-pin-bar{margin:0 16px;padding:9px 12px;border-bottom:1px dashed #d9e5f6;font-size:.74rem;color:#607086;background:#fbfdff}
.chat-pin-bar b{color:#245fd4}
.chat-msgs{flex:1;overflow:auto;padding:18px;background:radial-gradient(circle at top left,rgba(237,244,255,.92),rgba(247,249,252,.95) 35%,rgba(244,247,250,.96) 100%);display:flex;flex-direction:column;gap:10px}
.chat-day{align-self:center;background:#ffffff;border:1px solid #dfe7f2;padding:4px 10px;border-radius:999px;font-size:.68rem;color:#7b8594;margin:6px 0;box-shadow:0 3px 10px rgba(15,23,42,.04)}
.chat-row{display:flex}
.chat-row.me{justify-content:flex-end}
.chat-bubble{max-width:min(78%,560px);background:#fff;border:1px solid #e6ebf2;border-radius:18px 18px 18px 8px;padding:11px 13px 9px;color:#243041;position:relative;box-shadow:0 8px 20px rgba(15,23,42,.05)}
.chat-row.me .chat-bubble{background:linear-gradient(180deg,#eef9c9,#e6f5b6);border-color:#d2eaa0;border-radius:18px 18px 8px 18px}
.chat-author{font-size:.66rem;color:#245fd4;margin-bottom:5px;font-weight:700}
.chat-fwd{font-size:.66rem;color:#718096;margin-bottom:6px}
.chat-text{white-space:pre-wrap;word-break:break-word;font-size:.9rem;line-height:1.56;color:#1f2937}
.chat-meta{display:flex;justify-content:flex-end;gap:8px;align-items:center;margin-top:7px;font-size:.64rem;color:#8792a2}
.chat-row:not(.me) .chat-meta{color:#98a2b3}
.chat-status.read{color:#2f7cf6}
.chat-edit-flag{font-style:italic}
.chat-reply{border-left:3px solid #b9d0fb;padding:7px 8px;margin-bottom:8px;background:#f6f9fd;border-radius:10px;font-size:.72rem;color:#4b5565}
.chat-reply b{display:block;color:#245fd4;margin-bottom:2px}
.chat-att-list{display:grid;gap:8px;margin-top:8px}
.chat-att{border:1px solid #e3eaf4;border-radius:12px;padding:8px;background:#fff}
.chat-att img{width:100%;max-height:220px;object-fit:cover;border-radius:10px;display:block}
.chat-att a{color:#245fd4;text-decoration:none;font-weight:600}
.chat-att small{display:block;color:#8b95a5;margin-top:4px}
.chat-compose{padding:12px 14px;border-top:1px solid #e9eef5;display:grid;gap:8px;background:#fff}
.chat-compose-row{display:grid;grid-template-columns:auto auto 1fr auto;gap:8px;align-items:end}
.chat-compose textarea{min-height:52px;max-height:132px;resize:none;border-radius:16px}
.chat-reply-box,.chat-queue{background:#f7fafe;border:1px solid #dce8f7;border-radius:14px;padding:8px 10px}
.chat-queue-items{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
.chat-qi{padding:6px 8px;border-radius:10px;background:#eef4ff;font-size:.72rem;color:#334155}
.chat-empty{height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:28px;text-align:center;color:#667085}
.chat-empty-hero{width:120px;height:120px;border-radius:32px;background:linear-gradient(135deg,#eef4ff,#ffffff);border:1px solid #dce7f8;display:flex;align-items:center;justify-content:center;box-shadow:0 20px 45px rgba(47,124,246,.08);font-size:3rem;color:#2f7cf6;margin-bottom:14px}
.chat-empty h3{margin:8px 0 4px;font-size:1.12rem;color:#1f2937}
.chat-pop{position:fixed;z-index:650;background:#fff;border:1px solid #d9e3f0;border-radius:16px;box-shadow:0 20px 45px rgba(15,23,42,.18);min-width:220px;overflow:hidden;display:none}
.chat-pop.open{display:block}
.chat-pop-hd{padding:10px 12px;font-size:.72rem;color:#6b7280;border-bottom:1px solid #edf1f6;background:#f8fbff}
.chat-pop button{width:100%;text-align:left;border:none;background:none;color:#243041;padding:11px 12px;font:500 .84rem Outfit,sans-serif;cursor:pointer}
.chat-pop button:hover{background:#f6f9fd}
.chat-pop .danger{color:#d92d20}
.chat-read-list{display:grid;gap:8px;max-height:48vh;overflow:auto}
.chat-read-row{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid #e5ecf5;border-radius:12px;background:#fff}
.chat-stat-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.chat-rec.on{background:#fff1f1;border-color:#f3b0b0;color:#c62828}
.chat-nav-badge{position:absolute;top:5px;right:10px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#2f7cf6;color:#fff;font:700 .58rem Outfit,sans-serif;display:none;align-items:center;justify-content:center}
.mbn-item.chat-has-badge .chat-nav-badge{display:inline-flex}
@media (min-width:769px){
  #pg-chat .ph{margin-bottom:12px}
}
@media (max-width:768px){
  #pg-chat{padding:8px 0 88px}
  #pg-chat .ph{display:none}
  .chat-shell{grid-template-columns:1fr;gap:0;min-height:calc(100vh - 118px)}
  .chat-side,.chat-main{border-radius:0;border-left:none;border-right:none;box-shadow:none}
  /* CORREÇÃO (bug de layout mobile — lista de conversas e conversa aberta apareciam
     empilhadas ao mesmo tempo): #pg-chat .chat-side{display:flex} (mais abaixo, dentro
     do chrome "Messenger") usa um seletor com ID, que tem MAIS especificidade CSS do
     que estas duas regras de classe — então ele sempre vencia e a lista nunca era
     escondida ao abrir uma conversa no celular. !important garante que a troca
     lista↔conversa funcione de fato no mobile. */
  .chat-page.room-open .chat-side{display:none!important}
  .chat-page:not(.room-open) .chat-main{display:none!important}
  .chat-hd{padding:14px 14px 10px}
  .chat-sync-row{margin-bottom:10px}
  .chat-actions{gap:6px}
  .chat-actions .chat-mini{padding:8px 10px;font-size:.74rem}
  .chat-side-tools{padding:12px}
  .chat-room-list{padding:6px 10px 10px}
  .chat-room{padding:11px 10px;border-radius:16px}
  .chat-back{display:inline-flex;align-items:center;justify-content:center}
  .chat-top{padding:12px;border-radius:0}
  .chat-msgs{padding:12px 10px}
  .chat-bubble{max-width:92%}
  .chat-compose{padding:10px 10px calc(10px + env(safe-area-inset-bottom,0px))}
  .chat-compose-row{grid-template-columns:auto auto 1fr auto}
}
`;
document.head.appendChild(st)
}
function ensureMarkup(){
ensureStyle();
if(el('pg-chat'))return;
var pg=document.createElement('div');
pg.className='pg';
pg.id='pg-chat';
pg.innerHTML='<div class="chat-page" id="chat-page"><div class="ph"><h1>💬 Messenger</h1><div class="aline"></div><p>Mensagens em tempo real, grupos por equipe e histórico salvo no Firestore</p></div><div class="chat-shell"><aside class="chat-side"><div class="chat-hd"><div class="chat-sync-row"><div class="chat-sync-left"><span class="chat-sync-spinner"></span><span>Atualizando...</span></div><span class="chat-top-pill" id="chat-top-pill" style="display:none"></span></div><div class="chat-hd-row"><h2>Inbox</h2><div class="chat-actions"><button class="chat-mini" id="chat-new-direct">+ Direta</button><button class="chat-mini" id="chat-new-group">+ Grupo</button></div></div></div><div class="chat-side-tools"><input class="chat-input" id="chat-search" type="text" placeholder="Buscar conversa ou mensagem"><select class="chat-select" id="chat-dept"><option value="">Todos departamentos</option></select><div class="chat-filter-row"><button class="chat-mini on" data-chat-filter="all">Todas</button><button class="chat-mini" data-chat-filter="unread">Não lidas</button><button class="chat-mini" data-chat-filter="pinned">Fixadas</button><button class="chat-mini" data-chat-filter="archived">Arquivadas</button></div></div><div class="chat-room-list" id="chat-room-list"></div></aside><section class="chat-main"><div class="chat-empty" id="chat-empty"><div class="chat-empty-hero">💬</div><h3>Abra uma conversa</h3><div class="chat-empty-sub">Selecione uma conversa à esquerda para começar a se comunicar.</div></div><div id="chat-room-wrap" style="display:none;height:100%;display:flex;flex-direction:column"><div class="chat-top"><div class="chat-top-left"><button class="chat-mini chat-back" id="chat-back-btn">←</button><div class="chat-av" id="chat-top-av">?</div><div style="min-width:0"><div class="chat-top-title" id="chat-top-title">-</div><div class="chat-top-sub" id="chat-top-sub">-</div></div></div><div class="chat-top-right"><button class="chat-mini" id="chat-room-menu">⋯</button></div></div><div class="chat-pin-bar" id="chat-pin-bar" style="display:none"></div><div class="chat-msgs" id="chat-msgs"></div><div class="chat-compose"><div class="chat-reply-box" id="chat-reply-box" style="display:none"></div><div class="chat-queue" id="chat-queue" style="display:none"></div><div class="chat-compose-row"><button class="chat-mini" id="chat-attach">📎</button><button class="chat-mini chat-rec" id="chat-rec">🎙️</button><textarea class="chat-input" id="chat-text" placeholder="Digite uma mensagem..."></textarea><button class="chat-mini" id="chat-send">Enviar</button></div><input type="file" id="chat-file" multiple style="display:none" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,audio/*,video/*"></div></div></section></div></div>';
var anchor=el('pg-config')||q('#app .pg:last-of-type');
/* CORREÇÃO (auditoria — bootstrap resiliente da aba Conversas): em layouts/rodadas onde
   #pg-config ou .pg:last-of-type ainda não existiam no momento do mount, este insertBefore()
   quebrava com parentNode null e impedia a aba de Conversas inteira de nascer. Agora faz
   fallback seguro para #app (appendChild) sem depender desse anchor existir. */
var host=(anchor&&anchor.parentNode)?anchor.parentNode:el('app');
if(!host)return;
if(anchor&&anchor.parentNode===host)host.insertBefore(pg,anchor);else host.appendChild(pg);
var pop=document.createElement('div');pop.id='chat-pop';pop.className='chat-pop';document.body.appendChild(pop);
var m1=document.createElement('div');m1.className='mo';m1.id='mo-chat-new';m1.onclick=function(e){if(e.target===this)closeM('mo-chat-new')};m1.innerHTML='<div class="mb" style="max-width:560px"><h2 id="chat-new-title">Nova conversa</h2><div class="mbs"></div><div class="mf"><label>Tipo</label><select id="chat-new-type"><option value="direct">Direta</option><option value="group">Grupo</option></select></div><div class="mf"><label>Título do grupo</label><input type="text" id="chat-new-name" placeholder="Ex: Comercial / Recuperação" autocomplete="off"></div><div class="mf"><label>Departamento</label><select id="chat-new-dept"><option value="">Automático / opcional</option></select></div><div class="mf"><label>Participantes</label><div id="chat-user-pick" style="max-height:260px;overflow:auto;border:1px solid var(--b1);border-radius:12px;padding:8px;background:var(--bg3)"></div></div><div class="mf"><label>Permissão para enviar</label><select id="chat-new-perm"><option value="1">Todos participantes</option><option value="3">Supervisor+</option><option value="4">Gestor/ADM</option><option value="5">ADM somente</option></select></div><div class="mbtns"><button class="bc" onclick="closeM(&#39;mo-chat-new&#39;)">Cancelar</button><button class="bp" id="chat-new-save">Salvar conversa</button></div></div>';document.body.appendChild(m1);
var m2=document.createElement('div');m2.className='mo';m2.id='mo-chat-read';m2.onclick=function(e){if(e.target===this)closeM('mo-chat-read')};m2.innerHTML='<div class="mb" style="max-width:520px"><h2>📬 Lido por / Entregue</h2><div class="mbs"></div><div class="chat-read-list" id="chat-read-list"></div><div class="mbtns"><button class="bc" onclick="closeM(&#39;mo-chat-read&#39;)">Fechar</button></div></div>';document.body.appendChild(m2);
var nav=el('mobile-bottom-nav');if(nav&&!q('[data-page="chat"]',nav)){var b=document.createElement('button');b.className='mbn-item';b.dataset.page='chat';b.innerHTML='<span class="mbn-ic">💬</span><span class="mbn-lbl">Messenger</span><span class="mbn-dot"></span><span class="chat-nav-badge" id="chat-mb-badge">0</span>';b.onclick=function(){mobileGoPage('chat')};var ag=q('[data-page="agenda"]',nav);nav.insertBefore(b,ag||null)}
var md=q('#mobile-menu-drawer .mmd-links');if(md&&!el('mmd-chat-link')){var btn=document.createElement('button');btn.className='mmd-link';btn.id='mmd-chat-link';btn.textContent='💬 Messenger';btn.onclick=function(){mobileGoPage('chat')};var dic=md.children[1];md.insertBefore(btn,dic?dic.nextSibling:null)}
if(MOBILE_PAGE_TITLES)MOBILE_PAGE_TITLES.chat='Messenger';
bindUI()
}
function bindUI(){if(bindUI._ok)return;bindUI._ok=1;document.addEventListener('click',function(e){var t=e.target;if(t.closest('[data-chat-filter]')){C.filter=t.closest('[data-chat-filter]').getAttribute('data-chat-filter')||'all';renderRooms();if(C.filter==='archived'&&el('chat-page'))el('chat-page').classList.remove('room-open');return}if(t.closest('#chat-new-direct'))return openNew('direct');if(t.closest('#chat-new-group'))return openNew('group');if(t.closest('#chat-back-btn'))return closeRoomMobile();if(t.closest('#chat-send'))return sendMsg();if(t.closest('#chat-attach'))return el('chat-file').click();if(t.closest('#chat-pin-room'))return toggleRoomFlag('pinned');if(t.closest('#chat-mute-room'))return toggleRoomFlag('muted');if(t.closest('#chat-archive-room'))return toggleRoomFlag('archived');if(t.closest('#chat-room-menu'))return openRoomMenu(e);var room=t.closest('.chat-room');if(room){var directUid=room.getAttribute('data-user-direct');if(directUid)return createDirectRoom(directUid,true);return openRoom(room.getAttribute('data-room'));}if(t.closest('.chat-open-att')){e.preventDefault();var u=t.closest('.chat-open-att').getAttribute('data-url');if(u)window.open(u,'_blank','noopener,noreferrer');return}if(t.closest('.chat-copy-msg')){copyText(t.closest('.chat-copy-msg').getAttribute('data-copy')||'','Copiado');return}if(t.closest('[data-msg-action]')){runMsgAction(t.closest('[data-msg-action]').getAttribute('data-msg-action'),t.closest('[data-msg-action]').getAttribute('data-msg'));return}if(t.closest('[data-room-action]')){runRoomAction(t.closest('[data-room-action]').getAttribute('data-room-action'),t.closest('[data-room-action]').getAttribute('data-room'));return}if(!t.closest('#chat-pop'))hidePop()});document.addEventListener('contextmenu',function(e){var m=e.target.closest('.chat-msg'),r=e.target.closest('.chat-room');if(m){e.preventDefault();openMsgMenu(e,m.getAttribute('data-msg'))}else if(r&&e.target.closest('#pg-chat')){/* CORREÇÃO (auditoria — menu contextual em linha-fantasma): cards de contato sem data-room
  podiam cair em openRoomMenu(null) e abrir o menu da conversa ativa errada. */if(r.getAttribute('data-user-direct')&&!r.getAttribute('data-room'))return;e.preventDefault();openRoomMenu(e,r.getAttribute('data-room'))}});document.addEventListener('touchstart',function(e){var m=e.target.closest('.chat-msg'),r=e.target.closest('.chat-room');if(!m&&!r)return;clearTimeout(C.holdTm);C.holdTm=setTimeout(function(){var rect=(m||r).getBoundingClientRect();if(m)openMsgMenu({clientX:Math.min(rect.left+30,window.innerWidth-220),clientY:Math.min(rect.top+20,window.innerHeight-220)},m.getAttribute('data-msg'));else{/* CORREÇÃO (auditoria — mobile/long-press): não abrir menu de sala em linha-fantasma de
  contato sugerido; além disso, o hold é cancelado em touchmove/touchcancel logo abaixo pra
  não disparar menu acidental durante rolagem no celular. */if(r.getAttribute('data-user-direct')&&!r.getAttribute('data-room'))return;openRoomMenu({clientX:Math.min(rect.left+30,window.innerWidth-220),clientY:Math.min(rect.top+20,window.innerHeight-220)},r.getAttribute('data-room'));}},550)},{passive:true});document.addEventListener('touchend',function(){clearTimeout(C.holdTm)},{passive:true});document.addEventListener('touchmove',function(){clearTimeout(C.holdTm)},{passive:true});document.addEventListener('touchcancel',function(){clearTimeout(C.holdTm)},{passive:true});el('chat-search').addEventListener('input',function(){C.search=(this.value||'').toLowerCase();renderRooms()});el('chat-dept').addEventListener('change',function(){C.dept=this.value||'';renderRooms()});el('chat-file').addEventListener('change',function(){queueFiles(this.files||[]);this.value=''});el('chat-text').addEventListener('input',function(){autoGrow(this);typingPulse()});el('chat-text').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMsg()}});el('chat-rec').addEventListener('click',toggleRecord);el('chat-new-type').addEventListener('change',syncNewModal);el('chat-new-save').addEventListener('click',saveNewRoom);document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key==='6'){e.preventDefault();goPage('chat')}})}
function autoGrow(t){t.style.height='50px';t.style.height=Math.min(t.scrollHeight,132)+'px'}
function syncNewModal(){var type=el('chat-new-type').value;var g=type==='group';el('chat-new-name').parentNode.style.display=g?'':'none';el('chat-new-perm').parentNode.style.display=g?'':'none'}
function populateDeptSelects(){var ds=(getDepartments&&getDepartments()||[]).filter(function(d){return hasAdminAccess&&hasAdminAccess()||(_deptUserBelongs&&_deptUserBelongs(d,me()))});['chat-dept','chat-new-dept'].forEach(function(id){var s=el(id);if(!s)return;var cur=s.value||'';s.innerHTML='<option value="">Todos departamentos</option>'+ds.map(function(d){return '<option value="'+attr(d.id)+'">'+esc(d.nome)+'</option>'}).join('');s.value=cur})}
function buildUserPick(selected){selected=selected||[];var vs=visibleUsers().slice().sort(function(a,b){return String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR',{sensitivity:'base'})});el('chat-user-pick').innerHTML=vs.length?vs.map(function(u){var checked=selected.indexOf(u.id)>=0?' checked':'';var deptIds=userDeptIds(u.id)||[];var meta=[u.cargo||'Usuário'];if(deptIds.length)meta.push(deptName(deptIds[0]));return '<label style="display:flex;gap:8px;align-items:flex-start;padding:8px 6px;border-bottom:1px solid rgba(15,23,42,.06);cursor:pointer"><input type="checkbox" class="chat-user-cb" value="'+attr(u.id)+'"'+checked+'><span><strong>'+esc(u.nome)+'</strong><br><span class="chat-soft">'+esc(meta.filter(Boolean).join(' • '))+'</span></span></label>'}).join(''):'<div class="est">Nenhum usuário ativo no CRM.</div>'}
function openNew(type){ensureMarkup();populateDeptSelects();buildUserPick([]);el('chat-new-title').textContent=type==='group'?'Novo grupo':'Nova conversa direta';el('chat-new-type').value=type;el('chat-new-name').value='';el('chat-new-dept').value='';el('chat-new-perm').value='1';syncNewModal();openM('mo-chat-new')}
function directKey(ids){return ids.slice().sort().join('|')}
function existingDirect(otherId){var key=directKey([me(),otherId]);return C.rooms.find(function(r){return r.type==='direct'&&directKey(r.memberIds||[])===key})||null}
function saveNewRoom(){if(!(DB_MODE==='firebase'&&db)){toast('Chat requer Firestore conectado.');return}var type=el('chat-new-type').value;var picked=qa('.chat-user-cb:checked',el('chat-user-pick')).map(function(x){return x.value});if(type==='direct'){if(picked.length!==1){toast('Selecione 1 usuário para conversa direta.');return}createDirectRoom(picked[0],false).then(function(){closeM('mo-chat-new')});return}
var name=(el('chat-new-name').value||'').trim();if(!name){toast('Informe o nome do grupo.');return}if(!picked.length){toast('Selecione ao menos 1 participante.');return}var ids=[me()].concat(picked.filter(function(x,i,a){return a.indexOf(x)===i&&x!==me()}));var room2={type:'group',title:name,memberIds:ids,deptIds:el('chat-new-dept').value?[el('chat-new-dept').value]:[],createdById:me(),createdAt:now(),updatedAt:now(),lastMessageText:'',lastMessageAt:0,lastMessageById:'',memberState:defaultState(ids),adminIds:[me()],blockedUserIds:[],writeMinLevel:parseInt(el('chat-new-perm').value||1,10)};db.collection(ROOM_COL).doc(uid('room')).set(room2,{merge:true}).then(function(){closeM('mo-chat-new');toast('Grupo criado!')}).catch(syncErr)}

function ensureBitrixChrome(){
if(el('chat-bitrix-style'))return;
var st=document.createElement('style');
st.id='chat-bitrix-style';
st.textContent=`
#app>nav.bx24-topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:nowrap;padding:7px 16px 8px;background:linear-gradient(180deg,#0f6bdc 0%,#0a5ec6 62%,#0956b6 100%);border:none;border-radius:0;box-shadow:0 2px 0 rgba(255,255,255,.08) inset,0 10px 24px rgba(7,49,115,.16);position:sticky;top:0;z-index:40}
#app>nav.bx24-topbar .nbr{gap:10px;min-width:0;flex:0 0 auto}
#app>nav.bx24-topbar .nmo{width:30px;height:30px;border-radius:8px;background:rgba(255,255,255,.16);box-shadow:0 1px 0 rgba(255,255,255,.18) inset}
#app>nav.bx24-topbar .nmn{color:#fff;font-family:Inter,Outfit,sans-serif;font-size:.89rem;font-weight:700;letter-spacing:-.01em}
#app>nav.bx24-topbar .nsb{color:rgba(255,255,255,.70);font-size:.53rem;letter-spacing:.14em}
#app>nav.bx24-topbar .ntabs{display:flex;align-items:center;gap:2px;flex:1 1 auto;min-width:0;overflow:auto;flex-wrap:nowrap;padding:0 10px;scrollbar-width:none}
#app>nav.bx24-topbar .ntabs::-webkit-scrollbar{display:none}
#app>nav.bx24-topbar .nt{padding:9px 11px;border-radius:8px;border:none;background:transparent;color:rgba(255,255,255,.84);font:500 .76rem Inter,Outfit,sans-serif;line-height:1;white-space:nowrap}
#app>nav.bx24-topbar .nt:hover,#app>nav.bx24-topbar .nt.on{background:rgba(255,255,255,.13);color:#fff}
#app>nav.bx24-topbar .nt.at{color:#fff;background:rgba(255,255,255,.08)}
#app>nav.bx24-topbar .nri{display:flex;align-items:center;gap:8px;margin-left:auto;flex:0 0 auto}
#app>nav.bx24-topbar .nri>.nav-sync,#app>nav.bx24-topbar .nri>.act-bell,#app>nav.bx24-topbar .nri>.nav-av,#app>nav.bx24-topbar .nri>.bsair,#app>nav.bx24-topbar .nri>button[title*='Busca']{box-shadow:none}
#app>nav.bx24-topbar .nri>button[title*='Busca']{background:rgba(255,255,255,.10)!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:8px!important;color:#fff!important;font-size:.78rem!important;padding:6px 10px!important}
#app>nav.bx24-topbar .nav-sync{width:8px;height:8px;background:rgba(255,255,255,.94)}
#app>nav.bx24-topbar .act-bell,#app>nav.bx24-topbar .nav-un,#app>nav.bx24-topbar .bsair{color:#fff}
#app>nav.bx24-topbar .act-bell{width:31px;height:31px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;background:rgba(255,255,255,.10)}
#app>nav.bx24-topbar .act-bell:hover{background:rgba(255,255,255,.16)}
#app>nav.bx24-topbar .nav-un{max-width:96px;color:rgba(255,255,255,.82)}
#app>nav.bx24-topbar .bsair{padding:6px 11px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);border-radius:8px}
#app>nav.bx24-topbar .bsair:hover{background:rgba(255,255,255,.14);color:#fff}
#app>nav.bx24-topbar .nav-av{width:30px;height:30px;color:#0f4b9e;background:#f4f9ff;box-shadow:0 1px 0 rgba(255,255,255,.28) inset}
#pg-chat{max-width:1480px;padding-top:16px}
#pg-chat .ph{display:none}
#pg-chat .chat-shell{grid-template-columns:332px minmax(0,1fr);gap:0;min-height:calc(100vh - 116px);border-radius:20px;overflow:hidden;box-shadow:0 20px 54px rgba(14,30,58,.12);background:#fff;border:1px solid #dbe5f0}
#pg-chat .chat-side,#pg-chat .chat-main{border:none;border-radius:0;box-shadow:none}
#pg-chat .chat-side{display:flex;flex-direction:column;border-right:1px solid #e7edf5;background:linear-gradient(180deg,#ffffff 0%,#fbfdff 100%)}
#pg-chat .chat-main{background:#f7fbff}
#pg-chat .chat-hd{padding:12px 12px 8px;background:#fff;border-bottom:1px solid #edf2f7}
#pg-chat .chat-sync-row{margin-bottom:10px}
#pg-chat .chat-sync-left{font-size:.76rem;color:#6f7d90;font-weight:600}
#pg-chat .chat-hd h2{font:700 1.05rem/1.2 Inter,Outfit,sans-serif;color:#1d2939;letter-spacing:-.01em}
#pg-chat .chat-actions{gap:6px}
#pg-chat .chat-mini{border-radius:10px;border:1px solid #d8e4f1;background:#fff;color:#48607b;box-shadow:none;font:600 .77rem Inter,Outfit,sans-serif}
#pg-chat .chat-mini:hover{background:#f7fbff;border-color:#c8d7eb;box-shadow:none}
#pg-chat #chat-new-direct,#pg-chat #chat-new-group{min-width:34px;height:34px;padding:0;font-size:1rem;line-height:1}
#pg-chat .chat-side-tools{padding:10px 12px 8px;background:#fff;border-bottom:1px solid #edf2f7;gap:8px}
#pg-chat .chat-input,#pg-chat .chat-select{font:500 .9rem Inter,Outfit,sans-serif;border-radius:12px;border:1px solid #dbe3ee;padding:11px 12px;color:#1f2937}
#pg-chat .chat-input::placeholder{color:#9aa6b2}
#pg-chat .chat-filter-row{gap:6px;overflow:auto;flex-wrap:nowrap;padding-bottom:2px;scrollbar-width:none}
#pg-chat .chat-filter-row::-webkit-scrollbar{display:none}
#pg-chat .chat-filter-row .chat-mini{border-radius:16px;padding:7px 12px;background:#fff;border:1px solid #d8dee8;color:#5d6b7c;white-space:nowrap}
#pg-chat .chat-filter-row .chat-mini.on{background:#eef5ff;border-color:#c8daf9;color:#1764d8}
#pg-chat .chat-room-list{padding:0;background:#fff;gap:0;overflow:auto;scrollbar-color:#d6e2f2 transparent;scrollbar-width:thin}
#pg-chat .chat-room{padding:10px 12px 10px 14px;border-radius:0;border:none;border-bottom:1px solid #eef2f6;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;min-height:72px;box-shadow:none;position:relative}
#pg-chat .chat-room::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:0 3px 3px 0;background:transparent;transition:background .15s ease}
#pg-chat .chat-room:hover{background:#f8fbff;border-color:#eef2f6}
#pg-chat .chat-room.on{background:#eaf3ff}
#pg-chat .chat-room.on::before{background:#2f7cf6}
#pg-chat .chat-room.is-contact{background:#fff}
#pg-chat .chat-room.is-contact .chat-room-last{color:#2f7cf6}
#pg-chat .chat-room.is-contact .chat-room-meta{align-self:center}
#pg-chat .chat-av{width:42px;height:42px;font-size:.88rem;box-shadow:none}
#pg-chat .chat-room-name{font:600 .94rem/1.24 Inter,Outfit,sans-serif;color:#1f2937}
#pg-chat .chat-room-sub{margin-top:1px;font-size:.73rem;color:#7a8699}
#pg-chat .chat-room-last{margin-top:4px;font-size:.78rem;color:#5c6675}
#pg-chat .chat-room-meta{gap:6px;padding-left:0}
#pg-chat .chat-room-time{font-size:.71rem;color:#8e99a7}
#pg-chat .chat-badge{min-width:20px;height:20px;font-size:.64rem;padding:0 6px;background:#2f7cf6;box-shadow:none}
#pg-chat .chat-top{padding:12px 16px;background:#fff;border-bottom:1px solid #e8edf4}
#pg-chat .chat-top-title{font:700 .98rem/1.2 Inter,Outfit,sans-serif;color:#1f2937}
#pg-chat .chat-top-sub{font-size:.75rem;color:#7a8798}
#pg-chat .chat-msgs{padding:16px 18px;background:linear-gradient(180deg,#eef6ff 0%,#f7fbff 14%,#f5f9fe 100%)}
#pg-chat .chat-bubble{max-width:min(76%,620px);border-radius:14px 14px 14px 6px;padding:10px 12px 8px;box-shadow:0 4px 14px rgba(14,30,58,.05);border:1px solid #e4ebf4}
#pg-chat .chat-row.me .chat-bubble{background:#e4f3cc;border-color:#cfe4a9;border-radius:14px 14px 6px 14px}
#pg-chat .chat-text{font-size:.93rem;line-height:1.52;color:#202939}
#pg-chat .chat-compose{padding:10px 12px;background:#fff;border-top:1px solid #e7edf5}
#pg-chat .chat-compose-row{grid-template-columns:auto auto 1fr auto;gap:8px;align-items:center}
#pg-chat .chat-compose textarea{min-height:46px;max-height:120px;border-radius:22px;padding:12px 14px}
#pg-chat .chat-empty-hero{width:110px;height:110px;border-radius:28px}
.chat-bitrix-tabs{display:flex;align-items:center;gap:8px;overflow:auto;padding:2px 0 0;scrollbar-width:none}
.chat-bitrix-tabs::-webkit-scrollbar{display:none}
.chat-bitrix-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:16px;border:1px solid #d8e0ea;background:#fff;color:#5f6b7a;font:500 .88rem Inter,Outfit,sans-serif;white-space:nowrap}
.chat-bitrix-chip.on{background:#fff;color:#1f2937;box-shadow:0 1px 0 rgba(15,23,42,.04)}
.chat-bitrix-chip-muted{background:#f8fafc;color:#8b95a5}
.chat-bitrix-chip-badge{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ff5b55;color:#fff;font:700 .66rem/1 Inter,Outfit,sans-serif}
.chat-bitrix-chip-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#e8f1ff;color:#1663d6;font:700 .66rem/1 Inter,Outfit,sans-serif}
.chat-room-ghost{opacity:.92}
@media (max-width: 1100px){
  #app>nav.bx24-topbar{padding:8px 12px;gap:10px}
  #app>nav.bx24-topbar .ntabs{padding:0 4px}
  #pg-chat .chat-shell{grid-template-columns:318px minmax(0,1fr)}
}
@media (max-width: 900px){
  #app>nav.bx24-topbar{padding:8px 10px}
  #app>nav.bx24-topbar .nmn,#app>nav.bx24-topbar .nsb,#app>nav.bx24-topbar .nav-un{display:none}
  #app>nav.bx24-topbar .nri>button[title*='Busca']{padding:6px 8px!important}
  #pg-chat .chat-shell{grid-template-columns:1fr;min-height:calc(100vh - 96px)}
}
@media (max-width: 768px){
  #pg-chat .chat-shell{border-radius:0;border:none;box-shadow:none}
  #pg-chat .chat-hd{padding:12px 10px 8px}
  #pg-chat .chat-bitrix-tabs{padding-top:4px}
  #pg-chat .chat-room{padding:10px 10px 10px 12px;min-height:70px}
}
`;
document.head.appendChild(st);
}
function mountBitrixChrome(){
ensureBitrixChrome();
var nav=q('#app > nav');
if(nav)nav.classList.add('bx24-topbar');
var hd=q('#chat-page .chat-hd');
if(hd&&!el('chat-bitrix-tabs')){
  var row=document.createElement('div');
  row.className='chat-bitrix-tabs';
  row.id='chat-bitrix-tabs';
  row.innerHTML='<span class="chat-bitrix-chip on">Conversas <span class="chat-bitrix-chip-count" id="chat-bitrix-all">0</span></span><span class="chat-bitrix-chip chat-bitrix-chip-muted">Bate-papos de tarefas <span class="chat-bitrix-chip-badge" id="chat-bitrix-unread">0</span></span><span class="chat-bitrix-chip chat-bitrix-chip-muted">Canais</span>';
  var ref=q('.chat-hd-row',hd);
  hd.insertBefore(row,ref||null);
 }
 var h2=q('#chat-page .chat-hd h2');
 if(h2)h2.textContent='Messenger';
 var direct=el('chat-new-direct');
 if(direct){direct.textContent='✎';direct.title='Nova conversa';direct.setAttribute('aria-label','Nova conversa');}
 var group=el('chat-new-group');
 if(group){group.textContent='＋';group.title='Novo grupo';group.setAttribute('aria-label','Novo grupo');}
 var search=el('chat-search');
 if(search)search.placeholder='Encontrar colaborador ou bate-papo';
}
function syncBitrixChrome(){
mountBitrixChrome();
var all=el('chat-bitrix-all');
 if(all)all.textContent=String((C.rooms||[]).length||0);
 var unreadTotal=(C.rooms||[]).reduce(function(sum,r){return sum+unread(r)},0);
 var unreadEl=el('chat-bitrix-unread');
 if(unreadEl)unreadEl.textContent=unreadTotal>99?'99+':String(unreadTotal||0);
}
function createDirectRoom(otherId,autoOpen){
if(!otherId)return;
var ex=existingDirect(otherId);
if(ex){if(autoOpen!==false)openRoom(ex.id);return Promise.resolve(ex.id)}
if(!(DB_MODE==='firebase'&&db)){toast('Chat requer Firestore conectado.');return Promise.resolve(null)}
var ids=[me(),otherId],other=getUser(otherId),newId=uid('room');
var depts=userDeptIds(me()).filter(function(id){return userDeptIds(otherId).indexOf(id)>=0});
var room={type:'direct',title:other?other.nome:'Conversa',memberIds:ids,deptIds:depts,createdById:me(),createdAt:now(),updatedAt:now(),lastMessageText:'',lastMessageAt:0,lastMessageById:'',memberState:defaultState(ids),adminIds:[me()],blockedUserIds:[],writeMinLevel:1};
return db.collection(ROOM_COL).doc(newId).set(room,{merge:true}).then(function(){
  startRooms();
  /* CORREÇÃO (auditoria — createDirectRoom respeitar autoOpen): a função sempre abria a nova
     conversa após criar, ignorando autoOpen=false. Isso fazia o fluxo do modal "Nova conversa
     direta" saltar para dentro da sala mesmo quando o chamador queria apenas criar/fechar o
     modal. Agora a abertura automática só acontece quando explicitamente permitida. */
  setTimeout(function(){
    if(autoOpen!==false&&C.roomMap[newId])openRoom(newId);
    else renderRooms();
  },260);
  toast('Conversa criada!');
  return newId;
}).catch(syncErr)
}
function roomListEntries(){
var entries=filteredRooms().map(function(r){return {kind:'room',room:r}});
if(C.filter==='all'&&!C.search&&!C.dept){
  var seen={};
  (C.rooms||[]).forEach(function(r){
    if(r&&r.type==='direct'){
      var other=(r.memberIds||[]).filter(function(id){return id!==me()})[0];
      if(other)seen[other]=1;
    }
  });
  visibleUsers().slice().sort(function(a,b){return String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR',{sensitivity:'base'})}).forEach(function(u){
    if(!seen[u.id])entries.push({kind:'contact',user:u});
  });
}
return entries;
}
function directRoomMarkup(r){
var st=myState(r),u=unread(r);var last=r.lastMessageText||((r.type==='group'||r.type==='direct')?'Sem mensagens ainda':'');
var badges=(st.pinned?'<span class="chat-soft chat-pin-tag">📌</span>':'')+(st.muted?'<span class="chat-soft">🔕</span>':'');
return '<div class="chat-room'+(C.active===r.id?' on':'')+'" data-room="'+attr(r.id)+'"><div>'+roomAvatar(r)+'</div><div style="min-width:0"><div class="chat-room-name">'+esc(roomTitle(r))+'</div><div class="chat-room-sub">'+esc(roomSub(r))+'</div><div class="chat-room-last">'+esc(shortTxt(last,72))+'</div></div><div class="chat-room-meta"><div class="chat-room-time">'+fmtDay(r.lastMessageAt||r.updatedAt)+'</div>'+(u?'<span class="chat-badge">'+u+'</span>':badges||'<span class="chat-soft">⋯</span>')+'</div></div>';
}
function directContactMarkup(u){
var deptIds=userDeptIds(u.id)||[];var meta=[u.cargo||'Usuário'];if(deptIds.length)meta.push(deptName(deptIds[0]));
var idx=(typeof u.cor!=='undefined'?u.cor:0)||0;
return '<div class="chat-room is-contact chat-room-ghost" data-user-direct="'+attr(u.id)+'"><div><div class="chat-av" style="background:'+AVB[idx%AVB.length]+'">'+esc((u.nome||'?').charAt(0).toUpperCase())+'</div></div><div style="min-width:0"><div class="chat-room-name">'+esc(u.nome||'Usuário')+'</div><div class="chat-room-sub">'+esc(meta.filter(Boolean).join(' • '))+'</div><div class="chat-room-last">Iniciar conversa</div></div><div class="chat-room-meta"><div class="chat-room-time">CRM</div><span class="chat-soft">＋</span></div></div>';
}

function patchCore(){if(patchCore._ok)return;patchCore._ok=1;var ob=window.buildNav;window.buildNav=function(){ob.apply(this,arguments);mountBitrixChrome();var t=el('ntabs');if(t&&!q('.nt[data-chat-tab]',t)){var b=document.createElement('button');b.className='nt';b.dataset.chatTab='1';b.textContent='Messenger';b.onclick=function(){goPage('chat')};var cfg=qa('.nt',t).find(function(x){return /Config/i.test(x.textContent)});t.insertBefore(b,cfg||null)}};var og=window.goPage;window.goPage=function(p){og.apply(this,arguments);if(p==='chat'){ensureMarkup();mountBitrixChrome();startRooms();renderAll();var nt=q('.nt[data-chat-tab]');if(nt){qa('.nt').forEach(function(x){if(x!==nt)x.classList.remove('on')});nt.classList.add('on')}}else if(el('chat-page'))el('chat-page').classList.remove('room-open')};var os=window.startApp;window.startApp=function(){os.apply(this,arguments);ensureMarkup();mountBitrixChrome();populateDeptSelects();renderAll();startRooms()};var ol=window.doLogout;window.doLogout=function(){stopRooms();if(ol)return ol.apply(this,arguments)};document.addEventListener('visibilitychange',function(){if(!document.hidden&&activeRoom())markRead(activeRoom())})}
function notifyIfNeeded(room){if(document.hidden&&'Notification' in window&&Notification.permission==='granted'&&room.lastMessageById&&room.lastMessageById!==me()&&unread(room)>0&&!myState(room).muted){var key=room.id+':'+room.lastMessageAt;if(C.lastNotified[key])return;C.lastNotified[key]=1;try{new Notification(roomTitle(room),{body:room.lastMessageText||'Nova mensagem'})}catch(e){}}}
function startRooms(){if(!(DB_MODE==='firebase'&&db&&me()))return;stopRooms();C.roomUnsub=db.collection(ROOM_COL).where('memberIds','array-contains',me()).onSnapshot(function(snap){var prev=C.active;var list=[];snap.forEach(function(doc){var d=doc.data()||{};d.id=doc.id;d.createdAt=ms(d.createdAt||d.createdAtMs||d.ts)||d.createdAt||0;d.updatedAt=ms(d.updatedAt||d.updatedAtMs)||d.lastMessageAt||0;d.lastMessageAt=ms(d.lastMessageAt)||d.lastMessageAt||0;d.memberIds=d.memberIds||[];d.memberState=d.memberState||{};d.deptIds=d.deptIds||[];d.adminIds=d.adminIds||[];d.blockedUserIds=d.blockedUserIds||[];list.push(d);notifyIfNeeded(d)});list.sort(roomSort);C.rooms=list;C.roomMap={};list.forEach(function(r){C.roomMap[r.id]=r});renderRooms();updateNavBadge();populateDeptSelects();if(prev&&C.roomMap[prev]){openRoom(prev,true)}else if(!C.active&&list.length&&C.filter!=='archived'){if(isMobileView()){C.active=null;C.msgs=[];renderHeader();closeRoomMobile();}else openRoom(list[0].id,false)}else renderHeader()})}
function stopRooms(){try{if(C.roomUnsub)C.roomUnsub()}catch(e){}try{if(C.msgUnsub)C.msgUnsub()}catch(e){}C.roomUnsub=null;C.msgUnsub=null;C.rooms=[];C.roomMap={};C.msgs=[];C.active=null;C.reply=null;C.queue=[];renderAll();hidePop()}
function filteredRooms(){return C.rooms.filter(function(r){var st=myState(r),ok=!st.archived||C.filter==='archived';if(!ok)return false;if(C.filter==='unread'&&!unread(r))return false;if(C.filter==='pinned'&&!st.pinned)return false;if(C.filter==='all'&&st.archived)return false;if(C.dept&&(!r.deptIds||r.deptIds.indexOf(C.dept)<0))return false;if(C.search){var hay=(roomTitle(r)+' '+(r.lastMessageText||'')).toLowerCase();if(hay.indexOf(C.search)<0)return false}return true})}
function roomAvatar(r){var t=roomTitle(r);var idx=((getUser(me())||{}).cor||0);var other=(r.memberIds||[]).filter(function(id){return id!==me()})[0];if(other){var u=getUser(other);if(u)idx=u.cor||0}return '<div class="chat-av" style="background:'+AVB[idx%AVB.length]+'">'+esc((t||'?').charAt(0).toUpperCase())+'</div>'}
function renderRooms(){ensureMarkup();syncBitrixChrome();var list=roomListEntries(),wrap=el('chat-room-list');if(!wrap)return;wrap.innerHTML=list.length?list.map(function(item){return item.kind==='room'?directRoomMarkup(item.room):directContactMarkup(item.user)}).join(''):'<div class="est" style="padding:26px 12px;color:#6b7280;background:#fff;border:1px dashed #d8e2ee;border-radius:16px">Nenhuma conversa neste filtro.</div>';qa('[data-chat-filter]').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-chat-filter')===C.filter)});syncBitrixChrome()}
function updateNavBadge(){var n=C.rooms.reduce(function(a,r){return a+unread(r)},0);var b=el('chat-mb-badge');if(b)b.textContent=n>99?'99+':String(n||0);var item=b?b.closest('.mbn-item'):null;if(item)item.classList.toggle('chat-has-badge',n>0);var dt=q('.nt[data-chat-tab]');if(dt){var ex=q('.chat-nav-badge',dt);if(!ex){ex=document.createElement('span');ex.className='chat-nav-badge';dt.style.position='relative';dt.appendChild(ex)}ex.textContent=n>99?'99+':String(n||0);ex.style.display=n>0?'inline-flex':'none'}}
function openRoom(id,silent){
  if(!id||!C.roomMap[id])return;
  // CORREÇÃO (auditoria, Seção J — performance percebida): startRooms() chama
  // openRoom(prev,true) toda vez que QUALQUER sala do usuário muda (inclusive o campo
  // "typing.<uid>", escrito por qualquer participante a cada ~1.2s). Antes, isso
  // desmontava e reassinava do zero o listener de mensagens da sala já aberta mesmo sem
  // ela ter mudado — releitura completa do histórico + markRead() disparado de novo a
  // cada "digitando" alheio, podendo travar/piscar a conversa ativa numa sala movimentada.
  // Agora, se a sala pedida já é a ativa e o listener de mensagens já existe, só
  // atualiza a lista/cabeçalho (já cobertos acima) e sai sem reassinar nada.
  if(C.active===id&&C.msgUnsub){renderRooms();renderHeader();if(!silent&&el('chat-page'))el('chat-page').classList.add('room-open');return;}
  C.active=id;renderRooms();renderHeader();if(!silent&&el('chat-page'))el('chat-page').classList.add('room-open');if(C.msgUnsub)try{C.msgUnsub()}catch(e){}C.msgUnsub=db.collection(ROOM_COL).doc(id).collection('messages').orderBy('createdAt','asc').onSnapshot(function(snap){var arr=[];snap.forEach(function(doc){var m=doc.data()||{};m.id=doc.id;m.createdAt=ms(m.createdAt)||m.createdAt||0;m.replyTo=m.replyTo||null;m.attachments=m.attachments||[];m.deliveredTo=m.deliveredTo||{};m.readBy=m.readBy||{};arr.push(m)});C.msgs=arr;renderMsgs();markRead(activeRoom())})}
function closeRoomMobile(){if(el('chat-page'))el('chat-page').classList.remove('room-open')}
function renderHeader(){ensureMarkup();var r=activeRoom(),wrap=el('chat-room-wrap'),empty=el('chat-empty');if(!r){if(wrap)wrap.style.display='none';if(empty)empty.style.display='flex';return}if(wrap)wrap.style.display='flex';if(empty)empty.style.display='none';el('chat-top-av').outerHTML=roomAvatar(r).replace('class="chat-av"','class="chat-av" id="chat-top-av"');el('chat-top-title').textContent=roomTitle(r);var typing=typingUsers(r).join(', ');el('chat-top-sub').textContent=typing?('digitando: '+typing):roomSub(r);setFlagBtn('chat-pin-room',!!myState(r).pinned,'📌','📍');setFlagBtn('chat-mute-room',!!myState(r).muted,'🔕','🔔');setFlagBtn('chat-archive-room',!!myState(r).archived,'🗄️','📂');var pb=el('chat-pin-bar');if(r.pinnedMessageId&&r.pinnedMessageText){pb.style.display='block';pb.innerHTML='<b>📌 Mensagem fixada:</b> '+esc(shortTxt(r.pinnedMessageText,120))}else pb.style.display='none';renderComposer()}
function setFlagBtn(id,on,a,b){var x=el(id);if(!x)return;x.classList.toggle('on',!!on);x.textContent=on?b:a}
function typingUsers(r){var t=r&&r.typing||{},list=[];Object.keys(t).forEach(function(uid0){if(uid0===me())return;var age=now()-parseInt(t[uid0]||0,10);if(age<6000){var u=getUser(uid0);list.push(u?u.nome.split(' ')[0]:'alguém')}});return list}
function renderMsgs(){var box=el('chat-msgs'),r=activeRoom();if(!box||!r)return;var lastDay='';box.innerHTML=C.msgs.length?C.msgs.map(function(m){var day=new Date(m.createdAt||0).toLocaleDateString('pt-BR');var sep=day!==lastDay?'<div class="chat-day">'+day+'</div>':'';lastDay=day;var mine=m.senderId===me();var del=m.deleted;var reply=m.replyTo?'<div class="chat-reply"><b>'+esc(m.replyTo.senderName||'Resposta')+'</b>'+esc(shortTxt(m.replyTo.text||'[anexo]',90))+'</div>':'';var atts=(m.attachments||[]).length?'<div class="chat-att-list">'+m.attachments.map(renderAtt).join('')+'</div>':'';var txt=del?'<div class="chat-text" style="font-style:italic;color:var(--mu)">Mensagem excluída</div>':'<div class="chat-text">'+esc(m.text||'')+'</div>';var author=!mine&&r.type==='group'?'<div class="chat-author">'+esc(m.senderName||'Usuário')+'</div>':'';return sep+'<div class="chat-row'+(mine?' me':'')+'"><div class="chat-bubble chat-msg" data-msg="'+attr(m.id)+'">'+author+reply+txt+atts+'<div class="chat-meta"><span>'+fmtClock(m.createdAt)+'</span>'+(mine?('<span class="chat-status '+statusCls(m,r)+'"><span class="chat-check">'+statusTxt(m,r)+'</span></span>'):'')+'</div></div></div>'}).join(''):'<div class="chat-empty"><div style="font-size:1.8rem">👋</div><h3>Comece a conversa</h3><div class="chat-empty-sub">Envie texto, imagem, documento ou nota de voz.</div></div>';box.scrollTop=box.scrollHeight}
function renderAtt(a){var type=(a.type||'').toLowerCase(),img=/image/.test(type),aud=/audio/.test(type),vid=/video/.test(type),url=a.url||a.data||'';var head=img&&url?'<img src="'+attr(url)+'" alt="'+esc(a.name||'Imagem')+'">':(aud&&url?'<audio controls style="width:100%" src="'+attr(url)+'"></audio>':(vid&&url?'<video controls playsinline style="width:100%;border-radius:10px" src="'+attr(url)+'"></video>':'<div><a href="#" class="chat-open-att" data-url="'+attr(url)+'">📄 '+esc(a.name||'Arquivo')+'</a></div>'));return '<div class="chat-att">'+head+(img?'<a href="#" class="chat-open-att" data-url="'+attr(url)+'">Abrir imagem</a>':'')+'<small>'+(a.name?esc(a.name)+' • ':'')+(a.size?fmtBytes(a.size):'')+'</small></div>'}
function statusCounts(m,r){var others=(r.memberIds||[]).filter(function(id){return id!==me()}).length;var d=0,rd=0;Object.keys(m.deliveredTo||{}).forEach(function(id){if(id!==me())d++});Object.keys(m.readBy||{}).forEach(function(id){if(id!==me())rd++});return {others:others,del:d,read:rd}}
function statusTxt(m,r){var c=statusCounts(m,r);if(c.read>0)return '✓✓ '+c.read+'/'+(c.others||c.read);if(c.del>0)return '✓✓';return '✓'}
function statusCls(m,r){var c=statusCounts(m,r);return c.read>0?'read':''}
function renderComposer(){var r=activeRoom(),txt=el('chat-text');if(!txt)return;var can=roomCanWrite(r);txt.disabled=!can;el('chat-send').disabled=!can;el('chat-attach').disabled=!can;el('chat-rec').disabled=!can;txt.placeholder=can?'Digite uma mensagem...':'Conversa bloqueada para seu cargo';var rb=el('chat-reply-box');if(C.reply){rb.style.display='block';rb.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px"><div><strong>Respondendo '+esc(C.reply.senderName||'')+'</strong><div class="chat-soft">'+esc(shortTxt(C.reply.text||'[anexo]',120))+'</div></div><button class="chat-mini" onclick="window.chatClearReply()">✕</button></div>'}else rb.style.display='none';var qb=el('chat-queue');if(C.queue.length){qb.style.display='block';qb.innerHTML='<strong>Pronto para enviar</strong><div class="chat-queue-items">'+C.queue.map(function(f,i){return '<div class="chat-qi">'+esc(f.name||('arquivo '+(i+1)))+' <button class="chat-mini" style="padding:2px 7px;font-size:.62rem" onclick="window.chatRemoveQueue('+i+')">✕</button></div>'}).join('')+'</div>'}else qb.style.display='none'}
window.chatClearReply=function(){C.reply=null;renderComposer()};window.chatRemoveQueue=function(i){C.queue.splice(i,1);renderComposer()};
function queueFiles(files){var hasCloud=cloudinaryReady()||(DB_MODE==='firebase'&&fbStorage);var limit=hasCloud?10*1024*1024:700*1024;Array.prototype.slice.call(files||[]).forEach(function(f){if(f.size>limit){toast(hasCloud?('Arquivo "'+f.name+'" acima de 10MB, nao enviado.'):('Sem servico de upload configurado: "'+f.name+'" precisa ter menos de 700KB.'),4200);return}C.queue.push({file:f,name:f.name,type:f.type,size:f.size})});renderComposer()}
function typingPulse(){var r=activeRoom();if(!r||!(DB_MODE==='firebase'&&db))return;var n=now();if(n-C.lastTypingAt<1200)return;C.lastTypingAt=n;var patch={};patch['typing.'+me()]=n;db.collection(ROOM_COL).doc(r.id).set(patch,{merge:true}).catch(function(){})}
function uploadOne(item){return new Promise(function(resolve,reject){if(!item||!item.file){resolve(item);return}
  var meta={name:item.name||item.file.name,type:item.type||item.file.type,size:item.size||item.file.size};
  if(cloudinaryReady()){
    _uploadFileToCloudinary(item.file,function(err,res){
      if(err){toast('Falha no upload (Cloudinary). Tentando modo local...',3200);fallbackLocal();return}
      resolve(Object.assign({},meta,{url:res.url,storagePath:res.path}));
    });
    return;
  }
  if(DB_MODE==='firebase'&&fbStorage){var path='chat/'+me()+'/'+uid('att')+'_'+_safeStorageName(item.name||item.file.name||'arquivo');_uploadFileToStorage(item.file,path,function(err,res){if(err){fallbackLocal();return}resolve(Object.assign({},meta,{url:res.url,storagePath:res.path}))});return}
  fallbackLocal();
  function fallbackLocal(){var fr=new FileReader();fr.onload=function(e){resolve(Object.assign({},meta,{data:e.target.result}))};fr.onerror=reject;fr.readAsDataURL(item.file)}
})}
function sendMsg(){var r=activeRoom();if(!r){toast('Abra uma conversa primeiro.');return}if(!roomCanWrite(r)){toast('Sem permissão para enviar nesta conversa.');return}var text=(el('chat-text').value||'').trim();if(!text&&!C.queue.length){toast('Digite algo ou anexe um arquivo.');return}
  // CORREÇÃO (auditoria, Seção G — feedback de ação/duplo envio): enviar com anexo passa
  // por upload (uploadOne) + Promise.all antes do batch.commit(), o que pode levar bem
  // mais que ~200ms em conexão lenta. O botão "Enviar" ficava clicável o tempo todo nesse
  // meio-tempo, sem nenhum spinner/estado de "enviando", e um duplo toque (comum em touch)
  // disparava sendMsg() duas vezes, criando duas mensagens (dois docs, dois uid('msg') e
  // dois anexos enviados). Agora o botão trava e mostra "Enviando..." até o commit
  // terminar (sucesso ou erro), sem alterar o restante do fluxo.
  var sendBtn=el('chat-send');if(sendBtn&&sendBtn.disabled)return;if(sendBtn){sendBtn.disabled=true;sendBtn.dataset.origLabel=sendBtn.textContent;sendBtn.textContent='Enviando...';}
  function _restoreSendBtn(){if(sendBtn){sendBtn.disabled=!roomCanWrite(activeRoom());sendBtn.textContent=sendBtn.dataset.origLabel||'Enviar';}}
  // CORREÇÃO ("botão fica em Enviando... e diz que não foi possível enviar"): esta função
  // usava "db.collection(...)" direto, sem checar se "db" existia. Quando o Firebase não
  // estava conectado (DB_MODE!=='firebase', db===null), essa linha lançava um erro
  // ANTES mesmo do upload/Promise.all rodar — um erro síncrono que não caía no .catch()
  // lá embaixo, deixando o botão preso em "Enviando..." pra sempre, sem nenhum aviso.
  // Agora checamos a conexão logo no início e damos um aviso claro, restaurando o botão.
  if(!(DB_MODE==='firebase'&&db)){toast('Sem conexão com o servidor. Verifique sua internet e tente novamente.',4200);_restoreSendBtn();return}
  var ref=db.collection(ROOM_COL).doc(r.id).collection('messages').doc(uid('msg'));var sentAt=now();Promise.all(C.queue.map(uploadOne)).then(function(atts){var msg={text:text,type:atts.length?(atts.length===1&&/^audio\//.test(atts[0].type||'')?'audio':atts.length===1&&/^image\//.test(atts[0].type||'')?'image':'file'):'text',createdAt:sentAt,senderId:me(),senderName:(S&&S.nome)||'Usuário',senderCargo:(getUser(me())||{}).cargo||'',attachments:atts,replyTo:C.reply?{id:C.reply.id,text:C.reply.text||'[anexo]',senderName:C.reply.senderName||''}:null,deliveredTo:(function(){var o={};o[me()]=sentAt;return o})(),readBy:(function(){var o={};o[me()]=sentAt;return o})(),deleted:false};var batch=db.batch();batch.set(ref,msg,{merge:true});var patch={updatedAt:sentAt,lastMessageAt:sentAt,lastMessageById:me(),lastMessageText:text||((atts[0]&&atts[0].name)?('[anexo] '+atts[0].name):'[anexo]')};patch['memberState.'+me()+'.lastReadAt']=sentAt;patch['memberState.'+me()+'.lastDeliveredAt']=sentAt;patch['memberState.'+me()+'.unreadCount']=0;(r.memberIds||[]).forEach(function(id){if(id!==me())patch['memberState.'+id+'.unreadCount']=fv().increment(1)});batch.set(db.collection(ROOM_COL).doc(r.id),patch,{merge:true});return batch.commit()}).then(function(){el('chat-text').value='';autoGrow(el('chat-text'));C.queue=[];C.reply=null;renderComposer();_restoreSendBtn()}).catch(function(e){syncErr(e);toast('Não foi possível enviar a mensagem.',4200);_restoreSendBtn()})}
function markRead(r){if(!r||!(DB_MODE==='firebase'&&db)||!C.msgs.length)return;var mine=me(),stamp=now(),batch=db.batch(),changed=0;C.msgs.slice(-80).forEach(function(m){if(m.senderId===mine||m.deleted)return;var upd={};if(!(m.deliveredTo||{})[mine])upd['deliveredTo.'+mine]=stamp;if(!(m.readBy||{})[mine])upd['readBy.'+mine]=stamp;if(Object.keys(upd).length){batch.set(db.collection(ROOM_COL).doc(r.id).collection('messages').doc(m.id),upd,{merge:true});changed++}});var rp={};rp['memberState.'+mine+'.lastReadAt']=stamp;rp['memberState.'+mine+'.lastDeliveredAt']=stamp;rp['memberState.'+mine+'.unreadCount']=0;batch.set(db.collection(ROOM_COL).doc(r.id),rp,{merge:true});if(changed||unread(r))batch.commit().catch(function(){})}
function toggleRoomFlag(flag,roomId){var r=roomId?(C.roomMap[roomId]||activeRoom()):activeRoom();if(!r)return;var cur=!!((r.memberState&&r.memberState[me()]||{})[flag]),p={};p['memberState.'+me()+'.'+flag]=!cur;db.collection(ROOM_COL).doc(r.id).set(p,{merge:true}).then(function(){toast(flag==='pinned'?(cur?'Conversa desafixada.':'Conversa fixada.'):(flag==='muted'?(cur?'Alertas reativados.':'Conversa silenciada.'):(cur?'Conversa desarquivada.':'Conversa arquivada.')))}).catch(syncErr)}
function openMsgMenu(e,id){var m=C.msgs.find(function(x){return x.id===id});if(!m)return;C.msgTarget=id;showPop(e.clientX,e.clientY,'Mensagem',[{kind:'msg',label:'↩️ Responder',a:'reply',id:id},{kind:'msg',label:'📌 Fixar mensagem',a:'pin',id:id},{kind:'msg',label:'📬 Lido por / Entregue',a:'reads',id:id},{kind:'msg',label:'📋 Copiar texto',a:'copy',id:id},{kind:'msg',label:'🗑️ Excluir mensagem',a:'delete',id:id,danger:1,show:m.senderId===me()||roomCanManage(activeRoom())}].filter(function(x){return x.show!==false}))}
function openRoomMenu(e,id){if(typeof id==='string'){C.roomTarget=id}else if(activeRoom())C.roomTarget=activeRoom().id;var r=C.roomMap[C.roomTarget||C.active];if(!r)return;showPop(e.clientX,e.clientY,'Conversa',[{kind:'room',label:myState(r).pinned?'📍 Desfixar conversa':'📌 Fixar conversa',a:'pinRoom',id:r.id},{kind:'room',label:myState(r).muted?'🔔 Reativar alertas':'🔕 Silenciar conversa',a:'muteRoom',id:r.id},{kind:'room',label:myState(r).archived?'📂 Desarquivar':'🗄️ Arquivar conversa',a:'archiveRoom',id:r.id},{kind:'room',label:'🔒 Alternar restrição por cargo',a:'lockRoom',id:r.id,show:roomCanManage(r)},{kind:'room',label:'👥 Ver membros',a:'members',id:r.id},
  // CORREÇÃO (auditoria — feature solicitada: apagar conversa): exclusão permanente só fica
  // disponível pra quem tem gestão da sala (mesma regra de roomCanManage() já usada em
  // lockRoom), pra não deixar qualquer participante apagar a conversa pra todo mundo.
  {kind:'room',label:'🗑️ Apagar conversa',a:'deleteRoom',id:r.id,show:roomCanManage(r)}].filter(function(x){return x.show!==false}))}
function showPop(x,y,title,items){var p=el('chat-pop');if(!p)return;var html='<div class="chat-pop-hd">'+esc(title)+'</div>'+items.map(function(i){var k=i.kind==='room'?'room':'msg';return '<button class="'+(i.danger?'danger':'')+'" data-'+k+'-action="'+attr(i.a)+'" data-'+k+'="'+attr(i.id)+'">'+esc(i.label)+'</button>'}).join('');p.innerHTML=html;var maxX=window.innerWidth-220,maxY=window.innerHeight-240;p.style.left=Math.max(8,Math.min(x||20,maxX))+'px';p.style.top=Math.max(8,Math.min(y||20,maxY))+'px';p.classList.add('open')}
function hidePop(){var p=el('chat-pop');if(p)p.classList.remove('open')}
function runMsgAction(a,id){hidePop();var m=C.msgs.find(function(x){return x.id===id}),r=activeRoom();if(!m||!r)return;if(a==='reply'){C.reply={id:m.id,text:m.text||((m.attachments||[])[0]&&((m.attachments||[])[0].name||'[anexo]'))||'',senderName:m.senderName||''};renderComposer();el('chat-text').focus();return}if(a==='copy'){copyText(m.text||'',m.text?'Copiado!':'Sem texto para copiar');return}if(a==='pin'){db.collection(ROOM_COL).doc(r.id).set({pinnedMessageId:m.id,pinnedMessageText:m.text||((m.attachments||[])[0]&&((m.attachments||[])[0].name||'[anexo]'))||'[mensagem]'}, {merge:true}).then(function(){toast('Mensagem fixada!')}).catch(syncErr);return}if(a==='reads'){var rows=(r.memberIds||[]).map(function(uid0){var u=getUser(uid0)||{nome:uid0};var rd=m.readBy&&m.readBy[uid0]?fmtDay(m.readBy[uid0]):'—';var dl=m.deliveredTo&&m.deliveredTo[uid0]?fmtDay(m.deliveredTo[uid0]):'—';return '<div class="chat-read-row"><div><strong>'+esc(u.nome)+'</strong><div class="chat-soft">'+esc(u.cargo||'')+'</div></div><div style="text-align:right"><div>Lido: '+esc(rd)+'</div><div class="chat-soft">Entregue: '+esc(dl)+'</div></div></div>'}).join('');el('chat-read-list').innerHTML=rows;openM('mo-chat-read');return}if(a==='delete'){
  // CORREÇÃO (auditoria, Seção A — enforcement de ownership na execução, não só na UI):
  // o item de menu já escondia "Excluir mensagem" pra quem não é dono nem gestor
  // (show:m.senderId===me()||roomCanManage(r)), mas essa checagem nunca existiu aqui
  // dentro, na função que de fato grava no Firestore. Chamar runMsgAction('delete',id)
  // diretamente (ex.: console do navegador) apagava a mensagem de QUALQUER pessoa.
  if(m.senderId!==me()&&!roomCanManage(r)){toast('Sem permissão para excluir esta mensagem.');return}
  _confirmModal({title:'🗑 Excluir mensagem?',msg:'A mensagem será ocultada para todos nesta conversa.',okLabel:'Excluir',okClass:'bd',onOk:function(){var roomPatch={};if(_chatIsCurrentLastMessage(m.id))roomPatch.lastMessageText='Mensagem excluída';if(r.pinnedMessageId===m.id){roomPatch.pinnedMessageId='';roomPatch.pinnedMessageText='';}var batch=db.batch();batch.set(db.collection(ROOM_COL).doc(r.id).collection('messages').doc(m.id),{deleted:true,text:'',attachments:[],deletedAt:now(),deletedById:me()},{merge:true});if(Object.keys(roomPatch).length)batch.set(db.collection(ROOM_COL).doc(r.id),roomPatch,{merge:true});batch.commit().then(function(){_chatApplyRoomPatch(r,roomPatch);toast('Mensagem excluída.')}).catch(syncErr)}});return}}
function runRoomAction(a,id){var r=C.roomMap[id]||activeRoom();hidePop();if(!r)return;if(a==='pinRoom')return toggleRoomFlag('pinned',r.id);if(a==='muteRoom')return toggleRoomFlag('muted',r.id);if(a==='archiveRoom'){toggleRoomFlag('archived',r.id);if(el('chat-page'))el('chat-page').classList.remove('room-open');return}if(a==='lockRoom'){if(!roomCanManage(r)){toast('Sem permissão');return}var next=r.writeMinLevel&&r.writeMinLevel>1?1:4;db.collection(ROOM_COL).doc(r.id).set({writeMinLevel:next},{merge:true}).then(function(){toast(next===1?'Conversa liberada para todos.':'Somente gestor/ADM pode enviar.')}).catch(syncErr);return}if(a==='members'){el('chat-read-list').innerHTML=(r.memberIds||[]).map(function(uid0){var u=getUser(uid0)||{nome:uid0};return '<div class="chat-read-row"><div><strong>'+esc(u.nome)+'</strong><div class="chat-soft">'+esc(u.cargo||'')+'</div></div><div class="chat-soft">'+esc((userDeptIds(uid0)||[]).map(deptName).join(', ')||'Sem depto')+'</div></div>'}).join('');openM('mo-chat-read');return}
  // CORREÇÃO (auditoria — feature solicitada: apagar conversa): checa permissão de novo aqui
  // (não confiar só em o botão estar escondido no menu — mesmo cuidado de controle de acesso
  // já aplicado em lockRoom acima) antes de abrir a confirmação de exclusão permanente.
  if(a==='deleteRoom'){if(!roomCanManage(r)){toast('Sem permissão para apagar esta conversa.');return}return deleteRoomHard(r)}}
function toggleRecord(){var btn=el('chat-rec');if(C.rec&&C.rec.state==='recording'){C.rec.stop();return}if(!navigator.mediaDevices||!window.MediaRecorder){toast('Seu navegador não suporta nota de voz.');return}navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){C.recChunks=[];C.rec=new MediaRecorder(stream);C.rec.ondataavailable=function(ev){if(ev.data&&ev.data.size)C.recChunks.push(ev.data)};C.rec.onstop=function(){stream.getTracks().forEach(function(t){t.stop()});var blob=new Blob(C.recChunks,{type:'audio/webm'});C.queue.push({file:new File([blob],'nota-voz-'+now()+'.webm',{type:'audio/webm'}),name:'Nota de voz',type:'audio/webm',size:blob.size});renderComposer();btn.classList.remove('on');btn.textContent='🎙️'};C.rec.start();btn.classList.add('on');btn.textContent='⏹️';toast('Gravando nota de voz...')}).catch(function(){toast('Permissão de microfone negada.')})}
// CORREÇÃO (auditoria — feature solicitada: apagar conversa na aba de Conversas): apaga a
// sala inteira (documento em ROOM_COL + toda a subcoleção "messages") de forma permanente.
// Segue o mesmo padrão já usado em agdDelete(): confirmação custom (_confirmModal, nunca
// confirm() nativo — bloqueado em iOS Safari/PWA), feedback de sync (syncBusy/syncOk) e,
// em caso de falha, um toast PRÓPRIO explicando que nada foi apagado (syncErr() sozinho diria
// "dados salvos localmente", que não faz sentido nenhum pra uma exclusão que falhou).
// Não é otimista (a UI só é atualizada depois da confirmação real do Firestore): diferente do
// Kanban, salas de chat não têm fallback local (DB_MODE==='firebase' é pré-requisito de todo
// o módulo — ver startRooms()), então não existe "salvar local e sincronizar depois" aqui;
// remover da tela antes de confirmar no servidor arriscaria a sala "ressuscitar" ao recarregar.
function deleteRoomHard(r){
  if(!r||!r.id)return;
  var titulo=roomTitle(r);
  _confirmModal({
    title:'🗑️ Apagar conversa?',
    msg:'Isso vai apagar <b>'+esc(titulo)+'</b> e todo o histórico de mensagens, para todos os participantes. Essa ação não pode ser desfeita.',
    okLabel:'Apagar',okClass:'bd',
    onOk:function(){
      if(!(DB_MODE==='firebase'&&db)){toast('Apagar conversa exige conexão com a nuvem.');return}
      syncBusy();
      var roomRef=db.collection(ROOM_COL).doc(r.id);
      roomRef.collection('messages').get().then(function(snap){
        // Firestore não tem "delete recursivo" no SDK client-side — apaga as mensagens em
        // lotes (limite de 500 operações por batch) antes de apagar o documento da sala.
        var docs=snap.docs,chunks=[];
        for(var i=0;i<docs.length;i+=450)chunks.push(docs.slice(i,i+450));
        var p=Promise.resolve();
        chunks.forEach(function(chunk){
          p=p.then(function(){var b=db.batch();chunk.forEach(function(d){b.delete(d.ref)});return b.commit()});
        });
        return p.then(function(){return roomRef.delete()});
      }).then(function(){
        syncOk();
        toast('🗑️ Conversa apagada.');
        // Limpa o estado local só depois do Firestore confirmar a exclusão de verdade.
        if(C.active===r.id){
          if(C.msgUnsub){try{C.msgUnsub()}catch(_e){}C.msgUnsub=null;}
          C.active=null;C.msgs=[];
          if(el('chat-page'))el('chat-page').classList.remove('room-open');
        }
        delete C.roomMap[r.id];
        C.rooms=C.rooms.filter(function(x){return x.id!==r.id});
        renderRooms();renderHeader();updateNavBadge();
      }).catch(function(e){
        syncErr(e);
        toast('❌ Não foi possível apagar — sem conexão com a nuvem. A conversa continua existindo.',4500);
      });
    }
  });
}
function renderAll(){ensureMarkup();renderRooms();renderHeader();renderMsgs();renderComposer();updateNavBadge()}
/* CHAT/DICT V4 PATCH */
window.copyText=window.copyText||copyToClipboard;
function v4Norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()}
function v4Uniq(a){return (a||[]).filter(function(x,i,b){return b.indexOf(x)===i})}
C.msgSearch=C.msgSearch||'';C.editing=null;C.manageRoomId=null;C.forwardMsgId=null;C.forwardRoomId=null;
function v4CanSeeRoom(r){if(!r||!me()||(r.memberIds||[]).indexOf(me())<0)return false;if(r.type==='direct')return true;if(hasAdminAccess&&hasAdminAccess())return true;var mine=userDeptIds(me());if(r.deptIds&&r.deptIds.length)return r.deptIds.some(function(id){return mine.indexOf(id)>=0});return (r.memberIds||[]).every(function(id){return id===me()||shareDept(me(),id)})}
function v4Mark(s,q){s=String(s||'');q=String(q||'').trim();if(!q)return esc(s);var low=s.toLowerCase(),qq=q.toLowerCase(),out='',i=0,p;while((p=low.indexOf(qq,i))>=0){out+=esc(s.slice(i,p))+'<mark class="chat-mark">'+esc(s.slice(p,p+qq.length))+'</mark>';i=p+qq.length}return out+esc(s.slice(i))}
function v4MsgMatch(m,q){q=v4Norm(q);if(!q)return false;var blob=[m.text,((m.replyTo||{}).text||''),((m.forwardedFrom||{}).senderName||''),((m.forwardedFrom||{}).roomTitle||'')].join(' ')+' '+(m.attachments||[]).map(function(a){return a.name||''}).join(' ');return v4Norm(blob).indexOf(q)>=0}
function v4FileExt(a){var n=((a&&a.name)||'').toLowerCase(),m=n.match(/\.([a-z0-9]{2,5})$/);return m?m[1].toUpperCase():'ARQ'}
function v4TypeFlags(a){var t=((a&&a.type)||'').toLowerCase(),n=((a&&a.name)||'').toLowerCase();return{img:/image/.test(t),aud:/audio/.test(t),vid:/video/.test(t),pdf:/pdf/.test(t)||/\.pdf$/.test(n),doc:/(msword|wordprocessingml|officedocument|spreadsheet|presentation)/.test(t)||/\.(doc|docx|xls|xlsx|ppt|pptx)$/.test(n)}}
function v4ReactionHtml(m){if(m.deleted)return '';var rx=m.reactions||{},h=Object.keys(rx).map(function(k){var ids=Object.keys(rx[k]||{});if(!ids.length)return '';return '<button class="chat-react'+(ids.indexOf(me())>=0?' on':'')+'" data-rx="'+attr(m.id)+'" data-emoji="'+attr(k)+'">'+esc(k)+' <span>'+ids.length+'</span></button>'}).join('');return '<div class="chat-rx-row">'+h+'<button class="chat-react add" data-rx-open="'+attr(m.id)+'">+</button></div>'}
function v4ShowRx(id,x,y){var p=el('chat-pop');if(!p)return;var em=['👍','❤️','😂','🔥','👏','😮','😢'];p.innerHTML='<div class="chat-pop-hd">Reagir</div>'+em.map(function(e){return '<button data-rx-pick="'+attr(id)+'" data-emoji="'+attr(e)+'">'+esc(e)+'</button>'}).join('');p.style.left=Math.max(8,Math.min(x||20,window.innerWidth-220))+'px';p.style.top=Math.max(8,Math.min(y||20,window.innerHeight-240))+'px';p.classList.add('open')}
function v4ToggleRx(id,emoji){var r=activeRoom(),m=C.msgs.find(function(x){return x.id===id});if(!r||!m||m.deleted)return;var rx=JSON.parse(JSON.stringify(m.reactions||{}));rx[emoji]=rx[emoji]||{};if(rx[emoji][me()])delete rx[emoji][me()];else rx[emoji][me()]=now();if(!Object.keys(rx[emoji]).length)delete rx[emoji];db.collection(ROOM_COL).doc(r.id).collection('messages').doc(id).set({reactions:rx},{merge:true}).catch(syncErr)}
function v4Ensure(){if(!el('chat-v4-style')){var st=document.createElement('style');st.id='chat-v4-style';st.textContent='#chat-msg-search-row{display:none;grid-template-columns:1fr auto;gap:8px;padding:10px 16px;border-bottom:1px solid var(--b1)}#chat-msg-search-meta{font-size:.68rem;color:var(--mu);display:flex;align-items:center}.chat-mark{background:rgba(255,215,64,.25);color:#fff;padding:0 2px;border-radius:4px}.chat-hit{box-shadow:0 0 0 1px rgba(255,215,64,.35),0 8px 18px rgba(0,0,0,.18)}.chat-rx-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.chat-react{border:1px solid var(--b1);background:rgba(255,255,255,.04);color:var(--tx);padding:3px 8px;border-radius:999px;font:600 .7rem Outfit,sans-serif;cursor:pointer}.chat-react.on{border-color:rgba(27,138,94,.55);background:rgba(27,138,94,.14)}.chat-react.add{padding:3px 9px}.chat-fwd{font-size:.68rem;color:var(--al);margin-bottom:6px}.chat-edit-flag{margin-left:6px;color:var(--mu)}.chat-doc{display:grid;gap:8px}.chat-doc-card{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}.chat-doc-ic{width:42px;height:42px;border-radius:12px;background:rgba(195,154,45,.18);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--al)}.chat-doc-actions{display:flex;gap:8px;flex-wrap:wrap}.chat-doc-actions a{padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.05);border:1px solid var(--b1)}.chat-pdf-frame{width:100%;height:240px;border:none;border-radius:10px;background:#fff}.chat-edit-box{display:none}.chat-manage-list,.chat-add-list,.chat-forward-list{display:grid;gap:8px;max-height:34vh;overflow:auto}.chat-member-row,.chat-forward-room{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border:1px solid var(--b1);border-radius:10px;background:var(--bg3);align-items:center}.chat-forward-room.on{border-color:rgba(27,138,94,.55)}.chat-top-pill{position:fixed;top:14px;right:18px;z-index:99;display:none;padding:8px 12px;border-radius:999px;background:#1b8a5e;color:#fff;font:700 .78rem Outfit,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.28)}@media (max-width:768px){.chat-top-pill{display:none!important}}';document.head.appendChild(st)}
if(el('chat-pin-bar')&&!el('chat-msg-search-row')){var sr=document.createElement('div');sr.id='chat-msg-search-row';sr.innerHTML='<input id="chat-msg-search" class="chat-input" type="text" placeholder="Buscar nesta conversa"><div id="chat-msg-search-meta"></div>';el('chat-pin-bar').parentNode.insertBefore(sr,el('chat-pin-bar').nextSibling)}
if(el('chat-compose')&&!el('chat-edit-box')){var eb=document.createElement('div');eb.id='chat-edit-box';eb.className='chat-reply-box chat-edit-box';el('chat-compose').insertBefore(eb,el('chat-reply-box'))}
if(!el('chat-top-pill')){var tp=document.createElement('div');tp.id='chat-top-pill';tp.className='chat-top-pill';document.body.appendChild(tp)}
if(!el('mo-chat-manage')){var m=document.createElement('div');m.className='mo';m.id='mo-chat-manage';m.onclick=function(e){if(e.target===this)closeM('mo-chat-manage')};m.innerHTML='<div class="mb" style="max-width:720px"><h2>👥 Gerenciar participantes</h2><div class="mbs"></div><div id="chat-manage-current" class="chat-manage-list"></div><div class="mf"><label>Adicionar participantes</label><div id="chat-manage-add" class="chat-add-list"></div></div><div class="mbtns"><button class="bc" onclick="closeM(\'mo-chat-manage\')">Fechar</button><button class="bp" onclick="window.chatManageAddMembers()">Salvar alterações</button></div></div>';document.body.appendChild(m)}
if(!el('mo-chat-forward')){var f=document.createElement('div');f.className='mo';f.id='mo-chat-forward';f.onclick=function(e){if(e.target===this)closeM('mo-chat-forward')};f.innerHTML='<div class="mb" style="max-width:640px"><h2>↪️ Encaminhar mensagem</h2><div class="mbs"></div><div id="chat-forward-preview" class="chat-reply-box" style="display:block"></div><div class="mf"><label>Observação adicional</label><textarea id="chat-forward-note" class="mi" rows="3" placeholder="Opcional"></textarea></div><div class="mf"><label>Destino</label><div id="chat-forward-list" class="chat-forward-list"></div></div><div class="mbtns"><button class="bc" onclick="closeM(\'mo-chat-forward\')">Cancelar</button><button class="bp" onclick="window.chatForwardNow()">Encaminhar</button></div></div>';document.body.appendChild(f)} }
function v4WireSearch(){var inp=el('chat-msg-search');if(inp&&!inp._v4){inp._v4=1;inp.addEventListener('input',function(){C.msgSearch=this.value||'';renderMsgs()})}}
function v4Bind(){if(v4Bind._ok)return;v4Bind._ok=1;document.addEventListener('click',function(e){var t=e.target.closest('[data-rx],[data-rx-open],[data-rx-pick]');if(t&&t.getAttribute('data-rx')){e.preventDefault();v4ToggleRx(t.getAttribute('data-rx'),t.getAttribute('data-emoji'));return}if(t&&t.getAttribute('data-rx-open')){e.preventDefault();v4ShowRx(t.getAttribute('data-rx-open'),e.clientX,e.clientY);return}if(t&&t.getAttribute('data-rx-pick')){e.preventDefault();hidePop();v4ToggleRx(t.getAttribute('data-rx-pick'),t.getAttribute('data-emoji'));return}});v4WireSearch()}
var _ensureMarkup=ensureMarkup;ensureMarkup=function(){_ensureMarkup();v4Ensure();v4Bind()};
visibleUsers=function(){var list=(getUsers&&getUsers()||[]).filter(function(u){return u&&u.ativo&&u.id!==me()});if(hasAdminAccess&&hasAdminAccess())return list;return list.filter(function(u){return shareDept(me(),u.id)})};
populateDeptSelects=function(){var ds=(getDepartments&&getDepartments()||[]).filter(function(d){return hasAdminAccess&&hasAdminAccess()||(_deptUserBelongs&&_deptUserBelongs(d,me()))});var a=el('chat-dept'),b=el('chat-new-dept');if(a){var av=a.value||'';a.innerHTML='<option value="">Todos departamentos</option>'+ds.map(function(d){return '<option value="'+attr(d.id)+'">'+esc(d.nome)+'</option>'}).join('');a.value=av}if(b){var bv=b.value||'';b.innerHTML='<option value="">Automático / opcional</option>'+ds.map(function(d){return '<option value="'+attr(d.id)+'">'+esc(d.nome)+'</option>'}).join('');b.value=bv}};
saveNewRoom=function(){if(!(DB_MODE==='firebase'&&db)){toast('Chat requer Firestore conectado.');return}var type=el('chat-new-type').value,picked=qa('.chat-user-cb:checked',el('chat-user-pick')).map(function(x){return x.value}),allowed=visibleUsers().map(function(u){return u.id});if(type==='direct'){if(picked.length!==1){toast('Selecione 1 usuário para conversa direta.');return}if(allowed.indexOf(picked[0])<0&&!hasAdminAccess()){toast('Você só pode abrir conversa direta com pessoas do seu departamento.');return}var ex=existingDirect(picked[0]);if(ex){closeM('mo-chat-new');openRoom(ex.id);return}var ids=[me(),picked[0]],depts=userDeptIds(me()).filter(function(id){return userDeptIds(picked[0]).indexOf(id)>=0});if(!depts.length&&!hasAdminAccess()){toast('Sem departamento em comum para conversa direta.');return}db.collection(ROOM_COL).doc(uid('room')).set({type:'direct',title:(getUser(picked[0])||{}).nome||'Conversa',memberIds:ids,deptIds:depts,createdById:me(),createdAt:now(),updatedAt:now(),lastMessageText:'',lastMessageAt:0,lastMessageById:'',memberState:defaultState(ids),adminIds:[me()],blockedUserIds:[],writeMinLevel:1},{merge:true}).then(function(){closeM('mo-chat-new');toast('Conversa criada!')}).catch(syncErr);return}var name=(el('chat-new-name').value||'').trim(),dept=el('chat-new-dept').value||'';if(!name){toast('Informe o nome do grupo.');return}if(!picked.length){toast('Selecione ao menos 1 participante.');return}if(!hasAdminAccess()&&picked.some(function(id){return allowed.indexOf(id)<0})){toast('Só é permitido adicionar pessoas do seu departamento.');return}var ids=v4Uniq([me()].concat(picked.filter(function(x){return x!==me()})));if(dept&&ids.some(function(id){return userDeptIds(id).indexOf(dept)<0})&&!hasAdminAccess()){toast('Todos os participantes precisam pertencer ao departamento escolhido.');return}var common=userDeptIds(me()).filter(function(id){return ids.every(function(uid0){return userDeptIds(uid0).indexOf(id)>=0})});var roomDeptIds=dept?[dept]:common;db.collection(ROOM_COL).doc(uid('room')).set({type:'group',title:name,memberIds:ids,deptIds:roomDeptIds,createdById:me(),createdAt:now(),updatedAt:now(),lastMessageText:'',lastMessageAt:0,lastMessageById:'',memberState:defaultState(ids),adminIds:[me()],blockedUserIds:[],writeMinLevel:parseInt(el('chat-new-perm').value||1,10)},{merge:true}).then(function(){closeM('mo-chat-new');toast('Grupo criado!')}).catch(syncErr)};
startRooms=function(){if(!(DB_MODE==='firebase'&&db&&me()))return;stopRooms();C.roomUnsub=db.collection(ROOM_COL).where('memberIds','array-contains',me()).onSnapshot(function(snap){var prev=C.active,list=[];snap.forEach(function(doc){var d=doc.data()||{};d.id=doc.id;d.createdAt=ms(d.createdAt||d.createdAtMs||d.ts)||d.createdAt||0;d.updatedAt=ms(d.updatedAt||d.updatedAtMs)||d.lastMessageAt||0;d.lastMessageAt=ms(d.lastMessageAt)||d.lastMessageAt||0;d.memberIds=d.memberIds||[];d.memberState=d.memberState||{};d.deptIds=d.deptIds||[];d.adminIds=d.adminIds||[];d.blockedUserIds=d.blockedUserIds||[];if(v4CanSeeRoom(d)){list.push(d);notifyIfNeeded(d)}});list.sort(roomSort);C.rooms=list;C.roomMap={};list.forEach(function(r){C.roomMap[r.id]=r});renderRooms();updateNavBadge();populateDeptSelects();if(prev&&C.roomMap[prev])openRoom(prev,true);else if(!C.active&&list.length&&C.filter!=='archived')openRoom(list[0].id,true);else renderHeader()})};
var _renderHeader=renderHeader;renderHeader=function(){_renderHeader();v4WireSearch();var row=el('chat-msg-search-row');if(row)row.style.display=activeRoom()?'grid':'none'};
renderAtt=function(a){var f=v4TypeFlags(a),url=a.url||a.data||'';if(f.img&&url)return '<div class="chat-att"><img src="'+attr(url)+'" alt="'+esc(a.name||'Imagem')+'"><a href="#" class="chat-open-att" data-url="'+attr(url)+'">Abrir imagem</a><small>'+(a.name?esc(a.name)+' • ':'')+(a.size?fmtBytes(a.size):'')+'</small></div>';if(f.aud&&url)return '<div class="chat-att"><audio controls style="width:100%" src="'+attr(url)+'"></audio><small>'+(a.name?esc(a.name)+' • ':'')+(a.size?fmtBytes(a.size):'')+'</small></div>';if(f.vid&&url)return '<div class="chat-att"><video controls playsinline style="width:100%;border-radius:10px" src="'+attr(url)+'"></video><small>'+(a.name?esc(a.name)+' • ':'')+(a.size?fmtBytes(a.size):'')+'</small></div>';if(f.pdf||f.doc){var ext=v4FileExt(a),iframe=f.pdf&&url?'<iframe class="chat-pdf-frame" src="'+attr(url)+'#toolbar=0"></iframe>':'';return '<div class="chat-att chat-doc">'+iframe+'<div class="chat-doc-card"><div style="display:flex;gap:10px;align-items:center"><div class="chat-doc-ic">'+ext+'</div><div><div><strong>'+esc(a.name||'Documento')+'</strong></div><div class="chat-soft">'+(a.size?fmtBytes(a.size):'Arquivo')+'</div></div></div><div class="chat-doc-actions"><a href="#" class="chat-open-att" data-url="'+attr(url)+'">Abrir</a></div></div></div>'}return '<div class="chat-att"><div><a href="#" class="chat-open-att" data-url="'+attr(url)+'">📄 '+esc(a.name||'Arquivo')+'</a></div><small>'+(a.name?esc(a.name)+' • ':'')+(a.size?fmtBytes(a.size):'')+'</small></div>'};
renderMsgs=function(){var box=el('chat-msgs'),r=activeRoom(),q=(C.msgSearch||'').trim();if(!box||!r)return;var lastDay='',hits=0;box.innerHTML=C.msgs.length?C.msgs.map(function(m){var day=new Date(m.createdAt||0).toLocaleDateString('pt-BR');var sep=day!==lastDay?'<div class="chat-day">'+day+'</div>':'';lastDay=day;var mine=m.senderId===me(),del=m.deleted,hit=q&&v4MsgMatch(m,q);if(hit)hits++;var reply=m.replyTo?'<div class="chat-reply"><b>'+esc(m.replyTo.senderName||'Resposta')+'</b>'+v4Mark(shortTxt(m.replyTo.text||'[anexo]',90),q)+'</div>':'';var atts=(m.attachments||[]).length?'<div class="chat-att-list">'+m.attachments.map(renderAtt).join('')+'</div>':'';var fwd=m.forwardedFrom?'<div class="chat-fwd">↪️ Encaminhada de '+esc(m.forwardedFrom.senderName||'')+(m.forwardedFrom.roomTitle?' • '+esc(m.forwardedFrom.roomTitle):'')+'</div>':'';var txt=del?'<div class="chat-text" style="font-style:italic;color:var(--mu)">Mensagem excluída</div>':'<div class="chat-text">'+v4Mark(m.text||'',q)+'</div>';var author=!mine&&r.type==='group'?'<div class="chat-author">'+esc(m.senderName||'Usuário')+'</div>':'';var edit=m.editedAt?'<span class="chat-edit-flag">editada</span>':'';return sep+'<div class="chat-row'+(mine?' me':'')+'"><div class="chat-bubble chat-msg'+(hit?' chat-hit':'')+'" data-msg="'+attr(m.id)+'">'+author+fwd+reply+txt+atts+v4ReactionHtml(m)+'<div class="chat-meta"><span>'+fmtClock(m.createdAt)+'</span>'+edit+(mine?('<span class="chat-status '+statusCls(m,r)+'"><span class="chat-check">'+statusTxt(m,r)+'</span></span>'):'')+'</div></div></div>'}).join(''):'<div class="chat-empty"><div style="font-size:1.8rem">👋</div><h3>Comece a conversa</h3><div class="chat-empty-sub">Envie texto, imagem, documento ou nota de voz.</div></div>';if(el('chat-msg-search-meta'))el('chat-msg-search-meta').textContent=q?(hits+' resultado(s) nesta conversa'):'';box.scrollTop=box.scrollHeight};
var _renderComposer=renderComposer;renderComposer=function(){_renderComposer();var eb=el('chat-edit-box');if(!eb)return;if(C.editing){eb.style.display='block';eb.innerHTML='<div style="display:flex;justify-content:space-between;gap:10px"><div><strong>Editando mensagem</strong><div class="chat-soft">Ao enviar, a mensagem original será atualizada.</div></div><button class="chat-mini" onclick="window.chatCancelEdit()">✕</button></div>'}else eb.style.display='none'};window.chatCancelEdit=function(){C.editing=null;var t=el('chat-text');if(t){t.value='';autoGrow(t)}renderComposer()};
var _sendMsg=sendMsg;sendMsg=function(){if(C.editing&&C.editing.id){var r=activeRoom(),m=C.msgs.find(function(x){return x.id===C.editing.id});if(!r||!m)return;if(m.senderId!==me()&&!roomCanManage(r)){toast('Sem permissão para editar.');return}var text=(el('chat-text').value||'').trim();if(!text){toast('Digite o novo texto da mensagem.');return}var roomPatch={};if(_chatIsCurrentLastMessage(m.id))roomPatch.lastMessageText=text;if(r.pinnedMessageId===m.id)roomPatch.pinnedMessageText=text||'[mensagem]';var batch=db.batch();batch.set(db.collection(ROOM_COL).doc(r.id).collection('messages').doc(m.id),{text:text,editedAt:now(),editedById:me()},{merge:true});if(Object.keys(roomPatch).length)batch.set(db.collection(ROOM_COL).doc(r.id),roomPatch,{merge:true});batch.commit().then(function(){C.editing=null;el('chat-text').value='';autoGrow(el('chat-text'));renderComposer();_chatApplyRoomPatch(r,roomPatch);toast('Mensagem editada!')}).catch(syncErr);return}return _sendMsg.apply(this,arguments)};
openMsgMenu=function(e,id){var m=C.msgs.find(function(x){return x.id===id}),r=activeRoom();if(!m||!r)return;C.msgTarget=id;showPop(e.clientX,e.clientY,'Mensagem',[{kind:'msg',label:'↩️ Responder',a:'reply',id:id},{kind:'msg',label:'😊 Reagir',a:'react',id:id,show:!m.deleted},{kind:'msg',label:'✏️ Editar mensagem',a:'edit',id:id,show:!m.deleted&&(m.senderId===me()||roomCanManage(r))},{kind:'msg',label:'↪️ Encaminhar',a:'forward',id:id,show:!m.deleted},{kind:'msg',label:'📌 Fixar mensagem',a:'pin',id:id},{kind:'msg',label:'📬 Lido por / Entregue',a:'reads',id:id},{kind:'msg',label:'📋 Copiar texto',a:'copy',id:id},{kind:'msg',label:'🗑️ Excluir mensagem',a:'delete',id:id,danger:1,show:m.senderId===me()||roomCanManage(r)}].filter(function(x){return x.show!==false}))};
var _runMsgAction=runMsgAction;runMsgAction=function(a,id){var m=C.msgs.find(function(x){return x.id===id});if(a==='react'){hidePop();v4ShowRx(id,window.innerWidth/2,120);return}if(a==='edit'){hidePop();if(!m)return;C.editing={id:id};el('chat-text').value=m.text||'';autoGrow(el('chat-text'));renderComposer();el('chat-text').focus();return}if(a==='forward'){hidePop();if(!m)return;C.forwardMsgId=id;C.forwardRoomId='';el('chat-forward-note').value='';el('chat-forward-preview').innerHTML='<strong>'+esc(m.senderName||'Mensagem')+'</strong><div class="chat-soft">'+esc(shortTxt(m.text||((m.attachments||[])[0]&&((m.attachments||[])[0].name||'[anexo]'))||'',180))+'</div>';/* CORREÇÃO (auditoria — forward não pode burlar roomCanWrite): antes o modal listava TODO
  destino exceto a sala atual, inclusive salas arquivadas/bloqueadas/restritas para o usuário.
  O envio encaminhado então gravava mesmo sem permissão. Agora só lista destinos onde o usuário
  realmente pode escrever. */el('chat-forward-list').innerHTML=C.rooms.filter(function(r){return r.id!==activeRoom().id&&roomCanWrite(r)}).map(function(r){return '<button class="chat-forward-room" type="button" data-fwd-room="'+attr(r.id)+'"><span><strong>'+esc(roomTitle(r))+'</strong><br><span class="chat-soft">'+esc(roomSub(r))+'</span></span><span>Selecionar</span></button>'}).join('')||'<div class="est">Nenhuma outra conversa disponível para envio.</div>';openM('mo-chat-forward');return}return _runMsgAction(a,id)};
document.addEventListener('click',function(e){var b=e.target.closest('[data-fwd-room]');if(!b)return;qa('[data-fwd-room]').forEach(function(x){x.classList.remove('on')});b.classList.add('on');C.forwardRoomId=b.getAttribute('data-fwd-room')});
window.chatForwardNow=function(){var src=C.msgs.find(function(x){return x.id===C.forwardMsgId}),room=C.roomMap[C.forwardRoomId];if(!src||!room){toast('Selecione o destino.');return}/* CORREÇÃO (auditoria — enforcement de permissão no forward): além de filtrar o modal,
   valida aqui na execução real para impedir bypass por console/estado stale da UI. */if(!roomCanWrite(room)){toast('Sem permissão para encaminhar para esta conversa.');return}var sentAt=now(),atts=(src.attachments||[]).map(function(a){return{name:a.name||'',type:a.type||'',size:a.size||0,url:a.url||'',data:a.data||'',storagePath:a.storagePath||''}}),note=(el('chat-forward-note').value||'').trim(),text=note+(note&&src.text?'\n\n':'')+(src.text||'');var srcRoom=activeRoom();var ref=db.collection(ROOM_COL).doc(room.id).collection('messages').doc(uid('msg'));var msg={text:text,type:atts.length?(atts.length===1&&/^audio\//.test(atts[0].type||'')?'audio':atts.length===1&&/^image\//.test(atts[0].type||'')?'image':'file'):'text',createdAt:sentAt,senderId:me(),senderName:(S&&S.nome)||'Usuário',senderCargo:(getUser(me())||{}).cargo||'',attachments:atts,forwardedFrom:{senderName:src.senderName||'',roomTitle:srcRoom?roomTitle(srcRoom):'',roomId:srcRoom?srcRoom.id:'',messageId:src.id},deliveredTo:(function(){var o={};o[me()]=sentAt;return o})(),readBy:(function(){var o={};o[me()]=sentAt;return o})(),deleted:false};var batch=db.batch();batch.set(ref,msg,{merge:true});var patch={updatedAt:sentAt,lastMessageAt:sentAt,lastMessageById:me(),lastMessageText:(text||('[encaminhada] '+((atts[0]&&atts[0].name)||'anexo')))};patch['memberState.'+me()+'.lastReadAt']=sentAt;patch['memberState.'+me()+'.lastDeliveredAt']=sentAt;patch['memberState.'+me()+'.unreadCount']=0;(room.memberIds||[]).forEach(function(id){if(id!==me())patch['memberState.'+id+'.unreadCount']=fv().increment(1)});batch.set(db.collection(ROOM_COL).doc(room.id),patch,{merge:true});batch.commit().then(function(){closeM('mo-chat-forward');toast('Mensagem encaminhada!')}).catch(syncErr)};
openRoomMenu=function(e,id){if(typeof id==='string')C.roomTarget=id;else if(activeRoom())C.roomTarget=activeRoom().id;var r=C.roomMap[C.roomTarget||C.active];if(!r)return;showPop(e.clientX,e.clientY,'Conversa',[{kind:'room',label:myState(r).pinned?'📍 Desfixar conversa':'📌 Fixar conversa',a:'pinRoom',id:r.id},{kind:'room',label:myState(r).muted?'🔔 Reativar alertas':'🔕 Silenciar conversa',a:'muteRoom',id:r.id},{kind:'room',label:myState(r).archived?'📂 Desarquivar':'🗄️ Arquivar conversa',a:'archiveRoom',id:r.id},{kind:'room',label:'🔒 Alternar restrição por cargo',a:'lockRoom',id:r.id,show:roomCanManage(r)},{kind:'room',label:'👥 Ver membros',a:'members',id:r.id},{kind:'room',label:'🛠️ Gerenciar participantes',a:'manage',id:r.id,show:r.type==='group'&&roomCanManage(r)},/* CORREÇÃO (auditoria — regressão de menu): um override posterior removeu o item de apagar
  conversa do menu final, deixando deleteRoomHard() inacessível na UI. Reexpõe a ação com a
  mesma regra de permissão de gestão já aplicada no backend. */{kind:'room',label:'🗑️ Apagar conversa',a:'deleteRoom',id:r.id,show:roomCanManage(r)}].filter(function(x){return x.show!==false}))};
var _runRoomAction=runRoomAction;runRoomAction=function(a,id){var r=C.roomMap[id]||activeRoom();if(a==='manage'){hidePop();if(!r||r.type!=='group'){toast('Disponível apenas para grupos.');return}if(!roomCanManage(r)){toast('Sem permissão para gerenciar esta conversa.');return}C.manageRoomId=r.id;var cur=el('chat-manage-current'),add=el('chat-manage-add');cur.innerHTML=(r.memberIds||[]).map(function(uid0){var u=getUser(uid0)||{nome:uid0},blocked=(r.blockedUserIds||[]).indexOf(uid0)>=0;return '<div class="chat-member-row"><div><strong>'+esc(u.nome)+'</strong><br><span class="chat-soft">'+esc((u.cargo||'')+' • '+((userDeptIds(uid0)||[]).map(deptName).join(', ')||'Sem depto'))+'</span></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="chat-mini" onclick="window.chatToggleBlock(\''+jsq(uid0)+'\')">'+(blocked?'Desbloquear':'Bloquear')+'</button>'+(uid0!==me()?'<button class="chat-mini" onclick="window.chatRemoveMember(\''+jsq(uid0)+'\')">Remover</button>':'')+'</div></div>'}).join('');add.innerHTML=visibleUsers().filter(function(u){return (r.memberIds||[]).indexOf(u.id)<0&&(!(r.deptIds||[]).length||(r.deptIds||[]).some(function(d){return userDeptIds(u.id).indexOf(d)>=0}))}).map(function(u){return '<label class="chat-member-row"><span><strong>'+esc(u.nome)+'</strong><br><span class="chat-soft">'+esc((u.cargo||'')+' • '+((userDeptIds(u.id)||[]).map(deptName).join(', ')||'Sem depto'))+'</span></span><input type="checkbox" class="chat-add-cb" value="'+attr(u.id)+'"></label>'}).join('')||'<div class="est">Nenhum participante extra disponível.</div>';openM('mo-chat-manage');return}return _runRoomAction(a,id)};
window.chatManageAddMembers=function(){var r=C.roomMap[C.manageRoomId],picked=qa('.chat-add-cb:checked',el('chat-manage-add')).map(function(x){return x.value});if(!r||!picked.length){toast('Selecione ao menos 1 participante.');return}if(!roomCanManage(r)){toast('Sem permissão para gerenciar esta conversa.');return}
  // CORREÇÃO (auditoria — condição de corrida em memberIds/memberState): antes este
  // handler recalculava memberIds/memberState inteiros a partir do snapshot local
  // (r.memberIds/r.memberState) e regravava os objetos completos com set(...,{merge:true}).
  // merge:true substitui o VALOR INTEIRO de um campo de nível superior — não faz merge
  // elemento-a-elemento de array nem chave-a-chave de mapa. Dois gestores agindo quase ao
  // mesmo tempo (ou este handler correndo contra markRead/sendMsg, que também escrevem em
  // memberState. via dot-path) podiam se sobrescrever em last-write-wins: a ação de um
  // gestor "reaparecia" desfeita, ou uma leitura de mensagem de outro usuário era perdida.
  // Agora memberIds usa arrayUnion (atômico no servidor, imune a estado local desatualizado)
  // e memberState é gravado por dot-path por usuário (só cria a entrada que falta, sem
  // tocar nas entradas de outros usuários que possam estar sendo escritas em paralelo).
  var patch={updatedAt:now()};patch.memberIds=fv().arrayUnion.apply(null,picked);picked.forEach(function(id){if(!(r.memberState&&r.memberState[id]))patch['memberState.'+id]={pinned:false,archived:false,muted:false,unreadCount:0,lastReadAt:0,lastDeliveredAt:0}});
  db.collection(ROOM_COL).doc(r.id).set(patch,{merge:true}).then(function(){toast('Participantes adicionados!');runRoomAction('manage',r.id)}).catch(syncErr)};
window.chatRemoveMember=function(uid0){var r=C.roomMap[C.manageRoomId];if(!r||uid0===me()){toast('Você não pode se remover por aqui.');return}if(!roomCanManage(r)){toast('Sem permissão para gerenciar esta conversa.');return}
  // CORREÇÃO (auditoria — mesma condição de corrida do chatManageAddMembers, agora na
  // remoção): memberIds/adminIds/blockedUserIds passam a usar arrayRemove (atômico) em vez
  // de filter() sobre o array local; memberState usa fv().delete() por dot-path em vez de
  // reconstruir o mapa inteiro, para não apagar uma atualização concorrente (ex.: outro
  // usuário marcando mensagem como lida) de um membro que não está sendo removido.
  var patch={updatedAt:now()};patch.memberIds=fv().arrayRemove(uid0);patch.adminIds=fv().arrayRemove(uid0);patch.blockedUserIds=fv().arrayRemove(uid0);patch['memberState.'+uid0]=fv().delete();
  db.collection(ROOM_COL).doc(r.id).set(patch,{merge:true}).then(function(){toast('Participante removido.');runRoomAction('manage',r.id)}).catch(syncErr)};
window.chatToggleBlock=function(uid0){var r=C.roomMap[C.manageRoomId];if(!r||uid0===me()){toast('Não é possível bloquear a si mesmo.');return}if(!roomCanManage(r)){toast('Sem permissão para gerenciar esta conversa.');return}
  // CORREÇÃO (auditoria — mesma condição de corrida): bloquear/desbloquear via arrayUnion/
  // arrayRemove atômico em vez de slice()+indexOf()+splice() sobre o array local.
  var wasBlocked=(r.blockedUserIds||[]).indexOf(uid0)>=0;
  db.collection(ROOM_COL).doc(r.id).set({blockedUserIds:wasBlocked?fv().arrayRemove(uid0):fv().arrayUnion(uid0),updatedAt:now()},{merge:true}).then(function(){toast(wasBlocked?'Participante desbloqueado.':'Participante bloqueado para enviar mensagens.');runRoomAction('manage',r.id)}).catch(syncErr)};
updateNavBadge=function(){var n=C.rooms.reduce(function(a,r){return a+unread(r)},0),b=el('chat-mb-badge');if(b)b.textContent=n>99?'99+':String(n||0);var item=b?b.closest('.mbn-item'):null;if(item)item.classList.toggle('chat-has-badge',n>0);var dt=q('.nt[data-chat-tab]');if(dt){var ex=q('.chat-nav-badge',dt);if(!ex){ex=document.createElement('span');ex.className='chat-nav-badge';dt.style.position='relative';dt.appendChild(ex)}ex.textContent=n>99?'99+':String(n||0);ex.style.display=n>0?'inline-flex':'none'}var tp=el('chat-top-pill');if(tp){tp.textContent='💬 '+(n>99?'99+':String(n||0))+' não lidas';tp.style.display=n>0?'inline-flex':'none'}};
(function(){var _renderObjBank=window.renderObjBank,_admAdd=window.admAddObjecao,_usrAdd=window.userAddObjecao;function existsObj(txt){var q=v4Norm(txt);return dicionarioObjecoes.concat(getCustomObjecoes()).some(function(o){return v4Norm(o.objecao)===q})}window.admAddObjecao=function(){var t=(document.getElementById('new-obj-texto').value||'').trim();if(t&&existsObj(t)){toast('Já existe uma objeção igual no banco.');return}return _admAdd.apply(this,arguments)};window.userAddObjecao=function(){var t=(document.getElementById('new-uobj-texto').value||'').trim();if(t&&existsObj(t)){toast('Essa objeção já existe no banco principal.');return}return _usrAdd.apply(this,arguments)};window.renderObjBank=function(){var el0=document.getElementById('obj-bank-list');if(!el0)return;var q=(document.getElementById('obj-bank-search')||{}).value||'',nq=v4Norm(q),edits=getObjEdits(),deleted=getObjDeletedIds().map(String),seen={},dup=0,canalLbl={zap_ou_ligacao:'&#128241; Zap e ligação',preferir_ligacao:'&#9742;&#65039; Prefere ligação',somente_ligacao:'&#128274; Somente ligação'};var base=dicionarioObjecoes.concat(getCustomObjecoes()).filter(function(o){return deleted.indexOf(String(o.id))<0}).map(function(o){var p=edits[o.id]||edits[String(o.id)];return p?Object.assign({},o,p,{respostas:Object.assign({},o.respostas,p.respostas||{})}):o}).filter(function(o){var key=v4Norm((o.objecao||'')+'|'+(o.categoria||''));if(seen[key]){dup++;return false}seen[key]=1;return true}).filter(function(o){if(_objBankCanal&&o.canal!==_objBankCanal)return false;if(!nq)return true;return v4Norm([o.objecao,o.categoria,(o.respostas||{}).iniciante,(o.respostas||{}).intermediario,(o.respostas||{}).experiente].join(' ')).indexOf(nq)>=0});if(!base.length){el0.innerHTML='<div class="obj-empty">Nenhuma objeção encontrada.</div>';return}var isAdm=hasAdminAccess();function card(o){var isCustom=String(o.id).indexOf('custom_')===0,acts='<div class="obj-card-actions"><button class="obj-act-btn copy" onclick="event.stopPropagation();copyObjecaoBanco(\''+o.id+'\')" title="Copiar">📋</button>'+(isAdm?'<button class="obj-act-btn edit" onclick="event.stopPropagation();admOpenEditObjecao(\''+o.id+'\')" title="Editar">✏️</button><button class="obj-act-btn del" onclick="event.stopPropagation();admDeleteBancoObjecao(\''+o.id+'\')" title="Excluir">✕</button>':'')+'</div>';return '<div class="obj-card"><div class="obj-card-hd"><div class="obj-card-q">'+eH(o.objecao)+(isCustom?'<span style="font-size:.6rem;color:var(--ok);margin-left:6px;background:rgba(27,138,94,.12);padding:1px 5px;border-radius:10px">✦ ADM</span>':'')+'</div><span class="canal-badge '+o.canal+'">'+canalLbl[o.canal]+'</span>'+acts+'</div><div class="obj-cat">'+eH(o.categoria)+'</div><div class="obj-levels">'+['iniciante','intermediario','experiente'].map(function(lv){var lbl={iniciante:'Iniciante',intermediario:'Intermediário',experiente:'Experiente'}[lv];return '<div class="obj-level"><div class="obj-level-lbl '+lv+'">'+lbl+'</div><div class="obj-level-txt">'+eH((o.respostas||{})[lv]||'')+'</div></div>'}).join('')+'</div></div>'}var html='<div class="obj-empty" style="margin-bottom:10px">'+base.length+' objeção(ões) exibida(s)'+(dup?' • '+dup+' duplicada(s) ocultada(s)':'')+'</div>';if(_objBankCanal)html+=base.map(card).join('');else html+=['preferir_ligacao','somente_ligacao','zap_ou_ligacao'].map(function(c){var items=base.filter(function(o){return o.canal===c});return items.length?'<div class="obj-group-hd">'+canalLbl[c]+' <span class="obj-group-cnt">('+items.length+')</span></div>'+items.map(card).join(''):''}).join('');el0.innerHTML=html};setTimeout(function(){var inp=document.getElementById('obj-bank-search');if(inp)inp.placeholder='Buscar objeção, categoria ou resposta...';window.renderObjBank&&window.renderObjBank()},200)})();

/* chat-hotfix-20260710 */
C.pendingOpenId=C.pendingOpenId||null;
C.forceScrollBottom=false;
C._markReadTm=null;
C._markReadSig='';
C._lastRoomsSig='';
C._syncHideTm=null;
C._detailTab='media';
function _chatRoomOpen(){return !!(el('chat-page')&&el('chat-page').classList.contains('room-open'))}
function _chatSetSync(mode,text){
  var row=el('chat-page')?q('.chat-sync-left',el('chat-page')):null;if(!row)return;
  row.classList.remove('busy','idle','error');
  row.classList.add(mode==='error'?'error':(mode==='busy'?'busy':'idle'));
  var txt=row.querySelector('.chat-sync-txt')||row.querySelector('span:last-child');
  if(txt)txt.textContent=text||(mode==='busy'?'Sincronizando em segundo plano…':(mode==='error'?'Falha ao sincronizar':'Sincronizado'));
  var host=q('.chat-sync-row',el('chat-page'));
  if(host)host.style.opacity='1';
  clearTimeout(C._syncHideTm);
  if(mode!=='busy'&&host){C._syncHideTm=setTimeout(function(){if(host)host.style.opacity='.86';},1200)}
}
function _chatRoomSig(r){
  var st=myState(r)||{};
  return [r.id||'',r.type||'',r.title||'',r.lastMessageAt||0,r.lastMessageText||'',r.updatedAt||0,!!st.pinned,!!st.archived,!!st.muted,parseInt(st.unreadCount||0,10)||0,r.writeMinLevel||1,r.pinnedMessageId||'',r.pinnedMessageText||'',(r.memberIds||[]).join(','),(r.adminIds||[]).join(','),(r.blockedUserIds||[]).join(','),(r.deptIds||[]).join(',')].join('¦');
}
function _chatTypingSig(r){try{return JSON.stringify((r&&r.typing)||{})}catch(_e){return ''}}
function _chatNeedBottom(box){return !box||((box.scrollHeight-box.scrollTop-box.clientHeight)<120)}
function _chatIsCurrentLastMessage(id){for(var i=C.msgs.length-1;i>=0;i--){var m=C.msgs[i];if(!m||m._localPending)continue;return m.id===id}return false}
function _chatApplyRoomPatch(room,patch){if(!room||!patch||!Object.keys(patch).length)return;Object.keys(patch).forEach(function(k){room[k]=patch[k];if(C.roomMap[room.id])C.roomMap[room.id][k]=patch[k]});renderRooms();renderHeader()}
function _chatAutoFocusComposer(force){var t=el('chat-text');if(!t||!activeRoom())return;if(isMobileView()&&!force)return;try{t.focus({preventScroll:true})}catch(_e){try{t.focus()}catch(_e2){}}}
function _chatEnsureHotfixUI(){
  if(!el('chat-hotfix-style')){
    var st=document.createElement('style');
    st.id='chat-hotfix-style';
    st.textContent=`
    #pg-chat .chat-sync-left.idle .chat-sync-spinner{animation:none;border-color:#cfe7d8;border-top-color:#2da66a}
    #pg-chat .chat-sync-left.error .chat-sync-spinner{animation:none;border-color:#f5c2c7;border-top-color:#d92d20}
    #pg-chat .chat-top-left.chat-contact-launch{cursor:pointer}
    #pg-chat .chat-top-left.chat-contact-launch:hover .chat-top-title{text-decoration:underline}
    #pg-chat .chat-bubble.pending{opacity:.76}
    #pg-chat .chat-pending-status{font-style:italic;color:#7a8699}
    #mo-chat-inspect .mb{max-width:980px;width:min(980px,94vw);padding:0;overflow:hidden;background:#fff}
    .chat-inspect-head{padding:18px 20px 14px;border-bottom:1px solid #e8edf4;background:linear-gradient(180deg,#fff,#f8fbff)}
    .chat-inspect-title{display:flex;align-items:center;gap:12px}
    .chat-inspect-title .chat-av{width:56px;height:56px;font-size:1.05rem;box-shadow:none}
    .chat-inspect-name{font:700 1.02rem/1.2 Inter,Outfit,sans-serif;color:#1f2937}
    .chat-inspect-sub{font-size:.78rem;color:#7a8699;margin-top:3px}
    .chat-inspect-tabs{display:flex;gap:8px;overflow:auto;padding:12px 20px 0;scrollbar-width:none}
    .chat-inspect-tabs::-webkit-scrollbar{display:none}
    .chat-inspect-tab{border:1px solid #d8e0ea;background:#fff;color:#5f6b7a;border-radius:16px;padding:8px 14px;font:600 .82rem Inter,Outfit,sans-serif;cursor:pointer;white-space:nowrap}
    .chat-inspect-tab.on{background:#eef5ff;border-color:#c8daf9;color:#1764d8}
    .chat-inspect-body{padding:16px 20px 20px;max-height:min(70vh,760px);overflow:auto;background:#fbfdff}
    .chat-inspect-empty{padding:32px 16px;text-align:center;color:#7b8594}
    .chat-inspect-month{font:700 .8rem/1.2 Inter,Outfit,sans-serif;color:#5f6b7a;margin:18px 0 10px}
    .chat-inspect-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(136px,1fr));gap:10px}
    .chat-inspect-card{border:1px solid #e3eaf4;border-radius:14px;overflow:hidden;background:#fff;text-decoration:none;color:inherit;display:flex;flex-direction:column;min-width:0}
    .chat-inspect-thumb{aspect-ratio:1/1;background:#eef4ff;display:flex;align-items:center;justify-content:center;color:#245fd4;font-size:1.6rem}
    .chat-inspect-thumb img,.chat-inspect-thumb video{width:100%;height:100%;object-fit:cover;display:block}
    .chat-inspect-meta{padding:9px 10px;font-size:.73rem;color:#667085;display:grid;gap:4px}
    .chat-inspect-meta b{font-size:.8rem;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .chat-inspect-list{display:grid;gap:10px}
    .chat-inspect-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid #e3eaf4;border-radius:14px;background:#fff;padding:12px 14px}
    .chat-inspect-row-main{min-width:0}
    .chat-inspect-row-main b{display:block;color:#1f2937;font-size:.86rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .chat-inspect-row-main span{display:block;color:#667085;font-size:.74rem;margin-top:3px}
    .chat-inspect-open{border:1px solid #d8e0ea;background:#fff;color:#1764d8;border-radius:12px;padding:8px 12px;font:600 .78rem Inter,Outfit,sans-serif;text-decoration:none;white-space:nowrap}
    @media (max-width:768px){
      #mo-chat-inspect .mb{width:100vw;max-width:none;height:100dvh;border-radius:0}
      #mo-chat-inspect .chat-inspect-head{padding:16px 14px 12px}
      #mo-chat-inspect .chat-inspect-tabs{padding:10px 14px 0}
      #mo-chat-inspect .chat-inspect-body{padding:14px;max-height:none;height:calc(100dvh - 150px)}
      #mo-chat-inspect .chat-inspect-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      #mo-chat-inspect .mbtns{padding:12px 14px 14px}
      #pg-chat .chat-compose-row{grid-template-columns:42px 42px minmax(0,1fr) auto;align-items:end}
      #pg-chat #chat-attach,#pg-chat #chat-rec,#pg-chat #chat-back-btn,#pg-chat #chat-room-menu{width:42px;height:42px;padding:0;display:inline-flex;align-items:center;justify-content:center}
      #pg-chat #chat-send{min-height:42px;padding:0 14px}
      #pg-chat #chat-text{scroll-margin-bottom:96px}
    }`;
    document.head.appendChild(st);
  }
  if(!el('mo-chat-inspect')){
    var m=document.createElement('div');
    m.className='mo';
    m.id='mo-chat-inspect';
    m.onclick=function(e){if(e.target===this)closeM('mo-chat-inspect')};
    m.innerHTML='<div class="mb"><div class="chat-inspect-head"><div class="chat-inspect-title"><div id="chat-inspect-av"></div><div style="min-width:0"><div class="chat-inspect-name" id="chat-inspect-name">Conversa</div><div class="chat-inspect-sub" id="chat-inspect-sub"></div></div></div><div class="chat-inspect-tabs"><button class="chat-inspect-tab on" data-chat-detail-tab="media">Mídia</button><button class="chat-inspect-tab" data-chat-detail-tab="files">Arquivos</button><button class="chat-inspect-tab" data-chat-detail-tab="links">Links</button><button class="chat-inspect-tab" data-chat-detail-tab="audio">Áudio</button></div></div><div class="chat-inspect-body" id="chat-inspect-body"></div><div class="mbtns" style="padding:0 20px 18px"><button class="bc" onclick="closeM(\'mo-chat-inspect\')">Fechar</button></div></div>';
    document.body.appendChild(m);
  }
}
function _chatCollectAssets(r){
  var out={media:[],files:[],links:[],audio:[]};
  (C.msgs||[]).slice().sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0)}).forEach(function(m){
    var ts=m.createdAt||0,when=fmtDay(ts),sender=m.senderName||'Usuário';
    (m.attachments||[]).forEach(function(a){
      var f=v4TypeFlags(a),url=a.url||a.data||'',item={ts:ts,when:when,sender:sender,name:a.name||'Arquivo',type:a.type||'',size:a.size||0,url:url};
      if((f.img||f.vid)&&url)out.media.push(item);
      else if(f.aud&&url)out.audio.push(item);
      else out.files.push(item);
    });
    (String(m.text||'').match(/https?:\/\/[^\s<]+/g)||[]).forEach(function(link){out.links.push({ts:ts,when:when,sender:sender,name:link,url:link})});
  });
  return out;
}
function _chatMonthLabel(ts){return new Date(ts||0).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}
function _chatGroupByMonth(items){
  var map=[];
  items.forEach(function(it){
    var key=_chatMonthLabel(it.ts),last=map[map.length-1];
    if(!last||last.key!==key){last={key:key,items:[]};map.push(last)}
    last.items.push(it);
  });
  return map;
}
function _chatRenderInspect(){
  _chatEnsureHotfixUI();
  var r=activeRoom(),body=el('chat-inspect-body');if(!r||!body)return;
  el('chat-inspect-av').innerHTML=roomAvatar(r).replace('class="chat-av"','class="chat-av"');
  el('chat-inspect-name').textContent=roomTitle(r);
  el('chat-inspect-sub').textContent=roomSub(r)||'Histórico compartilhado nesta conversa';
  qa('[data-chat-detail-tab]',el('mo-chat-inspect')).forEach(function(b){b.classList.toggle('on',b.getAttribute('data-chat-detail-tab')===C._detailTab)});
  var bundle=_chatCollectAssets(r),tab=C._detailTab||'media',items=bundle[tab]||[];
  if(!items.length){body.innerHTML='<div class="chat-inspect-empty">Nada encontrado nesta aba ainda.</div>';return}
  if(tab==='media'){
    body.innerHTML=_chatGroupByMonth(items).map(function(group){
      return '<div class="chat-inspect-month">'+esc(group.key)+'</div><div class="chat-inspect-grid">'+group.items.map(function(it){
        var isVideo=/^video\//.test(it.type||'');
        var thumb=isVideo?'<video muted playsinline preload="metadata" src="'+attr(it.url)+'"></video>':'<img src="'+attr(it.url)+'" alt="'+esc(it.name)+'">';
        return '<a class="chat-inspect-card" href="'+attr(it.url)+'" target="_blank" rel="noopener noreferrer"><div class="chat-inspect-thumb">'+thumb+'</div><div class="chat-inspect-meta"><b>'+esc(it.name||'Mídia')+'</b><span>'+esc(it.when)+' • '+esc(it.sender)+'</span></div></a>';
      }).join('')+'</div>';
    }).join('');
    return;
  }
  if(tab==='audio'){
    body.innerHTML='<div class="chat-inspect-list">'+items.map(function(it){
      return '<div class="chat-inspect-row"><div class="chat-inspect-row-main"><b>'+esc(it.name||'Áudio')+'</b><span>'+esc(it.when)+' • '+esc(it.sender)+(it.size?' • '+esc(fmtBytes(it.size)):'')+'</span><audio controls style="width:100%;margin-top:8px" src="'+attr(it.url)+'"></audio></div></div>';
    }).join('')+'</div>';
    return;
  }
  body.innerHTML='<div class="chat-inspect-list">'+items.map(function(it){
    var label=tab==='links'?(it.url||it.name):(it.name||'Arquivo');
    var meta=tab==='links'?(it.when+' • '+it.sender):(it.when+' • '+it.sender+(it.size?' • '+fmtBytes(it.size):''));
    return '<div class="chat-inspect-row"><div class="chat-inspect-row-main"><b>'+esc(label)+'</b><span>'+esc(meta)+'</span></div><a class="chat-inspect-open" href="'+attr(it.url)+'" target="_blank" rel="noopener noreferrer">Abrir</a></div>';
  }).join('')+'</div>';
}
function _chatOpenInspect(tab){if(!activeRoom())return;C._detailTab=tab||C._detailTab||'media';_chatRenderInspect();openM('mo-chat-inspect')}
var _origMountBitrixChrome=mountBitrixChrome;
mountBitrixChrome=function(){_origMountBitrixChrome.apply(this,arguments);var nav=q('#app > nav');if(nav)nav.classList.remove('bx24-topbar');};
var _origRenderHeader=renderHeader;
renderHeader=function(){_origRenderHeader.apply(this,arguments);var left=q('#chat-room-wrap .chat-top-left');if(left){left.classList.add('chat-contact-launch');left.setAttribute('title','Abrir mídia, arquivos, links e áudio da conversa');}}
var _origCreateDirectRoom=createDirectRoom;
createDirectRoom=function(otherId,autoOpen){
  return Promise.resolve(_origCreateDirectRoom.apply(this,arguments)).then(function(id){
    if(autoOpen!==false&&id){C.pendingOpenId=id;C.forceScrollBottom=true;setTimeout(function(){if(C.roomMap[id]){openRoom(id,false);C.pendingOpenId=null;}},900)}
    return id;
  });
};
var _origOpenRoom=openRoom;
openRoom=function(id,silent){
  var preserveMobile=_chatRoomOpen()||silent===false||C.pendingOpenId===id;
  C.forceScrollBottom=true;
  _origOpenRoom.apply(this,arguments);
  if(preserveMobile&&isMobileView()&&el('chat-page'))el('chat-page').classList.add('room-open');
  requestAnimationFrame(function(){_chatAutoFocusComposer(false)});
};
var _origMarkRead=markRead;
markRead=function(r){
  if(!r||!C.msgs.length)return;
  clearTimeout(C._markReadTm);
  var rid=r.id;
  C._markReadTm=setTimeout(function(){
    var room=C.roomMap[rid]||r,last=C.msgs[C.msgs.length-1]||{};
    var sig=[rid,last.id||'',last.createdAt||0,unread(room)].join('|');
    if(C._markReadSig===sig&&unread(room)===0)return;
    C._markReadSig=sig;
    _origMarkRead(room);
  },140);
};
startRooms=function(){
  if(!(DB_MODE==='firebase'&&db&&me()))return;
  stopRooms();
  _chatSetSync('busy','Sincronizando conversas…');
  C.roomUnsub=db.collection(ROOM_COL).where('memberIds','array-contains',me()).onSnapshot(function(snap){
    var prevActive=C.active,prevMap=C.roomMap||{},wasRoomOpen=_chatRoomOpen(),list=[];
    snap.forEach(function(doc){
      var d=doc.data()||{};d.id=doc.id;d.createdAt=ms(d.createdAt||d.createdAtMs||d.ts)||d.createdAt||0;d.updatedAt=ms(d.updatedAt||d.updatedAtMs)||d.lastMessageAt||0;d.lastMessageAt=ms(d.lastMessageAt)||d.lastMessageAt||0;d.memberIds=d.memberIds||[];d.memberState=d.memberState||{};d.deptIds=d.deptIds||[];d.adminIds=d.adminIds||[];d.blockedUserIds=d.blockedUserIds||[];
      if(v4CanSeeRoom(d)){list.push(d);notifyIfNeeded(d)}
    });
    list.sort(roomSort);
    var nextMap={};list.forEach(function(r){nextMap[r.id]=r});
    C.rooms=list;C.roomMap=nextMap;
    var sig=list.map(_chatRoomSig).join('§');
    var roomsChanged=sig!==C._lastRoomsSig;
    C._lastRoomsSig=sig;
    var activeTypingChanged=!!(prevActive&&prevMap[prevActive]&&nextMap[prevActive]&&_chatTypingSig(prevMap[prevActive])!==_chatTypingSig(nextMap[prevActive]));
    if(roomsChanged)renderRooms();
    updateNavBadge();populateDeptSelects();
    if(C.pendingOpenId&&nextMap[C.pendingOpenId]){var want=C.pendingOpenId;C.pendingOpenId=null;openRoom(want,false);_chatSetSync('ok','Conversa pronta');return}
    if(prevActive&&nextMap[prevActive]){
      if(C.active!==prevActive||!C.msgUnsub)openRoom(prevActive,!(wasRoomOpen&&isMobileView()));
      else if(activeTypingChanged||roomsChanged)renderHeader();
      if(wasRoomOpen&&isMobileView()&&el('chat-page'))el('chat-page').classList.add('room-open');
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
    _chatSetSync('ok','Sincronizado');
  },function(err){syncErr(err);_chatSetSync('error','Falha ao sincronizar')});
};
// CORREÇÃO (auditoria — bug crítico "mensagem não enviada"): as 3 definições de renderMsgs no
// arquivo chamavam statusCls(m) passando só 1 argumento, mas statusCls(m,r) precisa do 2º
// (a sala) pra repassar a statusCounts(m,r), que lê r.memberIds. Sem o 2º argumento, r chegava
// undefined e r.memberIds explodia (TypeError) toda vez que a lista precisava renderizar
// QUALQUER mensagem própria já confirmada (não-pendente). Como sendMsg (mais abaixo) chama
// renderMsgs() de forma síncrona dentro do .then() do Promise.all(), esse erro virava uma
// promise rejeitada e caía direto no .catch() do envio — mostrando "Não foi possível enviar a
// mensagem" mesmo quando a mensagem muitas vezes nem chegava a tentar gravar no Firestore
// (o catch disparava antes do batch.commit()). Em qualquer conversa onde o usuário já tinha ao
// menos uma mensagem própria confirmada, TODO envio subsequente caía nesse erro. Corrigido nas
// 3 definições (statusCls(m) -> statusCls(m,r)); esta é a que roda de fato (última atribuição
// a "renderMsgs" no arquivo).
renderMsgs=function(){
  var box=el('chat-msgs'),r=activeRoom(),q0=(C.msgSearch||'').trim();if(!box||!r)return;
  var keepBottom=_chatNeedBottom(box),bottomGap=box.scrollHeight-box.scrollTop,lastDay='',hits=0;
  box.innerHTML=C.msgs.length?C.msgs.map(function(m){
    var day=new Date(m.createdAt||0).toLocaleDateString('pt-BR');
    var sep=day!==lastDay?'<div class="chat-day">'+day+'</div>':'';lastDay=day;
    var mine=m.senderId===me(),del=m.deleted,hit=q0&&v4MsgMatch(m,q0);if(hit)hits++;
    var reply=m.replyTo?'<div class="chat-reply"><b>'+esc(m.replyTo.senderName||'Resposta')+'</b>'+v4Mark(shortTxt(m.replyTo.text||'[anexo]',90),q0)+'</div>':'';
    var atts=(m.attachments||[]).length?'<div class="chat-att-list">'+m.attachments.map(renderAtt).join('')+'</div>':'';
    var fwd=m.forwardedFrom?'<div class="chat-fwd">↪️ Encaminhada de '+esc(m.forwardedFrom.senderName||'')+(m.forwardedFrom.roomTitle?' • '+esc(m.forwardedFrom.roomTitle):'')+'</div>':'';
    var txt=del?'<div class="chat-text" style="font-style:italic;color:var(--mu)">Mensagem excluída</div>':'<div class="chat-text">'+v4Mark(m.text||'',q0)+'</div>';
    var author=!mine&&r.type==='group'?'<div class="chat-author">'+esc(m.senderName||'Usuário')+'</div>':'';
    var edit=m.editedAt?'<span class="chat-edit-flag">editada</span>':'';
    var pending=m._localPending?'<span class="chat-pending-status">enviando…</span>':'';
    var status=mine?(m._localPending?pending:('<span class="chat-status '+statusCls(m,r)+'"><span class="chat-check">'+statusTxt(m,r)+'</span></span>')):'';
    return sep+'<div class="chat-row'+(mine?' me':'')+'"><div class="chat-bubble chat-msg'+(hit?' chat-hit':'')+(m._localPending?' pending':'')+'" data-msg="'+attr(m.id)+'">'+author+fwd+reply+txt+atts+v4ReactionHtml(m)+'<div class="chat-meta"><span>'+fmtClock(m.createdAt)+'</span>'+edit+status+'</div></div></div>';
  }).join(''):'<div class="chat-empty"><div style="font-size:1.8rem">👋</div><h3>Comece a conversa</h3><div class="chat-empty-sub">Envie texto, imagem, documento ou nota de voz.</div></div>';
  if(el('chat-msg-search-meta'))el('chat-msg-search-meta').textContent=q0?(hits+' resultado(s) nesta conversa'):'';
  if(C.forceScrollBottom||keepBottom)box.scrollTop=box.scrollHeight;else box.scrollTop=Math.max(0,box.scrollHeight-bottomGap);
  C.forceScrollBottom=false;
};
var _origSendMsg=sendMsg;
sendMsg=function(){
  if(C.editing&&C.editing.id)return _origSendMsg.apply(this,arguments);
  var r=activeRoom();if(!r){toast('Abra uma conversa primeiro.');return}
  if(!roomCanWrite(r)){toast('Sem permissão para enviar nesta conversa.');return}
  var input=el('chat-text');
  var draftText=(input&&input.value||'').trim(),draftQueue=C.queue.slice(),draftReply=C.reply?JSON.parse(JSON.stringify(C.reply)):null;
  if(!draftText&&!draftQueue.length){toast('Digite algo ou anexe um arquivo.');return}
  var sendBtn=el('chat-send');if(sendBtn&&sendBtn.disabled)return;
  if(sendBtn){sendBtn.disabled=true;sendBtn.dataset.origLabel=sendBtn.textContent;sendBtn.textContent='Enviando...';}
  function restoreBtn(){if(sendBtn){sendBtn.disabled=!roomCanWrite(activeRoom());sendBtn.textContent=sendBtn.dataset.origLabel||'Enviar';}}
  if(input){input.value='';autoGrow(input)}
  C.queue=[];C.reply=null;renderComposer();
  // CORREÇÃO (auditoria — envio duplicado): renderComposer() (linha acima) reseta
  // el('chat-send').disabled com base em roomCanWrite(), sem saber que acabamos de travar o
  // botão pra evitar clique duplo — isso reabilitava o botão "Enviar" logo em seguida (o texto
  // ficava "Enviando..." mas era clicável de novo), permitindo criar mensagens duplicadas com
  // um segundo toque/clique rápido. Reaplica o travamento depois do renderComposer().
  if(sendBtn){sendBtn.disabled=true;sendBtn.textContent='Enviando...';}
  requestAnimationFrame(function(){_chatAutoFocusComposer(false)});
  var ref=db.collection(ROOM_COL).doc(r.id).collection('messages').doc(uid('msg'));var sentAt=now();
  _chatSetSync('busy','Enviando em segundo plano…');
  Promise.all(draftQueue.map(uploadOne)).then(function(atts){
    var localMsg={id:ref.id,text:draftText,type:atts.length?(atts.length===1&&/^audio\//.test(atts[0].type||'')?'audio':atts.length===1&&/^image\//.test(atts[0].type||'')?'image':'file'):'text',createdAt:sentAt,senderId:me(),senderName:(S&&S.nome)||'Usuário',senderCargo:(getUser(me())||{}).cargo||'',attachments:atts,replyTo:draftReply?{id:draftReply.id,text:draftReply.text||'[anexo]',senderName:draftReply.senderName||''}:null,deliveredTo:(function(){var o={};o[me()]=sentAt;return o})(),readBy:(function(){var o={};o[me()]=sentAt;return o})(),deleted:false,_localPending:true};
    C.msgs=C.msgs.concat([localMsg]);C.forceScrollBottom=true;renderMsgs();
    var batch=db.batch();
    var msg={text:draftText,type:localMsg.type,createdAt:sentAt,senderId:me(),senderName:(S&&S.nome)||'Usuário',senderCargo:(getUser(me())||{}).cargo||'',attachments:atts,replyTo:localMsg.replyTo,deliveredTo:localMsg.deliveredTo,readBy:localMsg.readBy,deleted:false};
    batch.set(ref,msg,{merge:true});
    var patch={updatedAt:sentAt,lastMessageAt:sentAt,lastMessageById:me(),lastMessageText:draftText||((atts[0]&&atts[0].name)?('[anexo] '+atts[0].name):'[anexo]')};
    patch['memberState.'+me()+'.lastReadAt']=sentAt;patch['memberState.'+me()+'.lastDeliveredAt']=sentAt;patch['memberState.'+me()+'.unreadCount']=0;
    (r.memberIds||[]).forEach(function(id){if(id!==me())patch['memberState.'+id+'.unreadCount']=fv().increment(1)});
    batch.set(db.collection(ROOM_COL).doc(r.id),patch,{merge:true});
    return batch.commit().then(function(){C.msgs=C.msgs.filter(function(m){return !(m.id===ref.id&&m._localPending)});restoreBtn();_chatSetSync('ok','Mensagem enviada');renderComposer();requestAnimationFrame(function(){_chatAutoFocusComposer(false)});triggerChatPush(r,msg);});
  }).catch(function(e){
    C.msgs=C.msgs.filter(function(m){return !(m.id===ref.id&&m._localPending)});
    if(input&&!input.value){input.value=draftText;autoGrow(input)}
    C.queue=draftQueue;C.reply=draftReply;renderComposer();restoreBtn();syncErr(e);toast('Não foi possível enviar a mensagem.',4200);_chatSetSync('error','Falha ao enviar');
  });
};
var _origToggleRoomFlag=toggleRoomFlag;
toggleRoomFlag=function(flag,roomId){
  var r=roomId?(C.roomMap[roomId]||activeRoom()):activeRoom();if(!r)return;
  var mine=me(),st=(r.memberState=r.memberState||{});st[mine]=st[mine]||{pinned:false,archived:false,muted:false,unreadCount:0,lastReadAt:0,lastDeliveredAt:0};
  var cur=!!st[mine][flag],next=!cur;st[mine][flag]=next;
  if(C.roomMap[r.id]&&C.roomMap[r.id].memberState&&C.roomMap[r.id].memberState[mine])C.roomMap[r.id].memberState[mine][flag]=next;
  renderRooms();renderHeader();
  var out=_origToggleRoomFlag.apply(this,arguments);
  if(flag==='archived'){
    setTimeout(function(){
      renderRooms();
      if(C.filter==='archived'&&!next&&C.active===r.id){
        var vis=filteredRooms();
        if(isMobileView()){C.active=null;renderHeader();closeRoomMobile();}
        else if(vis.length)openRoom(vis[0].id,true);else{C.active=null;renderHeader();}
      }
      if(C.filter!=='archived'&&next&&C.active===r.id){
        var vis2=filteredRooms();
        if(isMobileView()){C.active=null;renderHeader();closeRoomMobile();}
        else if(vis2.length)openRoom(vis2[0].id,true);else{C.active=null;renderHeader();}
      }
    },60);
  }
  return out;
};
document.addEventListener('click',function(e){
  var tl=e.target.closest('#chat-top-title,#chat-top-sub,#chat-top-av,.chat-contact-launch');
  if(tl&&activeRoom()){e.preventDefault();_chatOpenInspect('media');return}
  var tab=e.target.closest('[data-chat-detail-tab]');
  if(tab&&tab.closest('#mo-chat-inspect')){e.preventDefault();C._detailTab=tab.getAttribute('data-chat-detail-tab')||'media';_chatRenderInspect();return}
},true);
_chatEnsureHotfixUI();
setTimeout(function(){try{mountBitrixChrome();_chatSetSync('ok','Sincronizado');}catch(_e){}},0);


function _crmUniqIds(arr){var out=[];(arr||[]).forEach(function(id){id=String(id||'').trim();if(id&&out.indexOf(id)<0)out.push(id)});return out}
function _crmUserDeptsGlobal(uid0){return (typeof getDepartments==='function'?getDepartments():[]).filter(function(d){return window._deptUserBelongs&&_deptUserBelongs(d,uid0)}).map(function(d){return d.id})}
function _crmCommonDeptIds(ids){ids=_crmUniqIds(ids);if(!ids.length)return [];var base=_crmUserDeptsGlobal(ids[0]);return base.filter(function(dep){return ids.every(function(uid0){return _crmUserDeptsGlobal(uid0).indexOf(dep)>=0})})}
function _crmPhoneRaw(u){return String(u&&(u.whatsapp||u.telefone||u.phone||u.celular)||'').trim()}
function _crmPhoneDigits(v){return String(v||'').replace(/\D/g,'')}
function _crmFmtPhone(v){var d=_crmPhoneDigits(v);if(!d)return '';if(d.length===13&&d.indexOf('55')===0)return '+'+d.slice(0,2)+' ('+d.slice(2,4)+') '+d.slice(4,9)+'-'+d.slice(9);if(d.length===12&&d.indexOf('55')===0)return '+'+d.slice(0,2)+' ('+d.slice(2,4)+') '+d.slice(4,8)+'-'+d.slice(8);if(d.length===11)return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7);if(d.length===10)return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6);return String(v||'')}
window.crmChatGetActiveRoom=function(){var r=activeRoom();return r?JSON.parse(JSON.stringify(r)):null};
window.crmChatOpenRoom=function(id,silent){try{goPage('chat')}catch(_e){}setTimeout(function(){try{openRoom(id,silent===false?false:true)}catch(_e){}},120);return id};
window.crmChatUpsertLeadThread=function(payload){
  payload=payload||{};
  if(!(DB_MODE==='firebase'&&db&&me()))return Promise.reject(new Error('Chat requer Firestore conectado.'));
  var board=payload.board||'leads';
  var ownerUid=payload.ownerUid||me();
  var card=payload.card||{};
  var cardId=payload.cardId||card.id||'';
  var actorId=me();
  var ids=_crmUniqIds([ownerUid,actorId]);
  var key=[board,cardId].join('|');
  var title=(board==='leads'?'Lead':'Negócio')+' • '+String(card.name||payload.cardName||'Card');
  var stageLabel=payload.stageLabel||(typeof _colLabel==='function'?_colLabel(board,card.col||payload.col||''):(card.col||payload.col||''));
  var summaryLines=[
    '💬 Comentário sobre '+(board==='leads'?'Lead':'Negócio')+': '+String(card.name||payload.cardName||'Card'),
    'Etapa: '+String(stageLabel||'-'),
    'Responsável: '+String(((getUser&&getUser(ownerUid))||{}).nome||ownerUid||'-')
  ];
  var comment=String(payload.comment||'').trim();
  if(!comment)return Promise.reject(new Error('Comentário vazio.'));
  return db.collection(ROOM_COL).where('linkedCardKey','==',key).limit(1).get().then(function(snap){
    var exists=!snap.empty;
    var roomRef=exists?snap.docs[0].ref:db.collection(ROOM_COL).doc(uid('room'));
    var roomId=roomRef.id;
    var patch={
      title:title,
      updatedAt:now(),
      linkedCardKey:key,
      roomKind:'lead_comment',
      linkedCardRef:{board:board,ownerUid:ownerUid,cardId:cardId,name:String(card.name||payload.cardName||''),col:String(card.col||payload.col||''),stageLabel:String(stageLabel||''),responsavelNome:String(((getUser&&getUser(ownerUid))||{}).nome||'')}
    };
    if(exists){
      patch.memberIds=fv().arrayUnion.apply(null,ids);
      patch.adminIds=fv().arrayUnion(actorId);
    }else{
      patch.type='group';
      patch.memberIds=ids;
      patch.deptIds=_crmCommonDeptIds(ids);
      patch.createdById=actorId;
      patch.createdAt=now();
      patch.lastMessageText='';
      patch.lastMessageAt=0;
      patch.lastMessageById='';
      patch.memberState=defaultState(ids);
      patch.adminIds=[actorId];
      patch.blockedUserIds=[];
      patch.writeMinLevel=1;
    }
    ids.forEach(function(id){patch['memberState.'+id]=patch['memberState.'+id]||{pinned:false,archived:false,muted:false,unreadCount:0,lastReadAt:0,lastDeliveredAt:0}});
    var sentAt=now();
    var body=summaryLines.concat(['',comment]).join('\n');
    var msgRef=roomRef.collection('messages').doc(uid('msg'));
    var msg={text:body,type:'text',createdAt:sentAt,senderId:actorId,senderName:(S&&S.nome)||'Usuário',senderCargo:((getUser&&getUser(actorId))||{}).cargo||'',attachments:[],replyTo:null,deliveredTo:(function(){var o={};o[actorId]=sentAt;return o})(),readBy:(function(){var o={};o[actorId]=sentAt;return o})(),deleted:false};
    patch.updatedAt=sentAt;
    patch.lastMessageAt=sentAt;
    patch.lastMessageById=actorId;
    patch.lastMessageText='💬 '+String(comment).replace(/\s+/g,' ').slice(0,120);
    patch['memberState.'+actorId+'.lastReadAt']=sentAt;
    patch['memberState.'+actorId+'.lastDeliveredAt']=sentAt;
    patch['memberState.'+actorId+'.unreadCount']=0;
    ids.forEach(function(id){if(id!==actorId)patch['memberState.'+id+'.unreadCount']=fv().increment(1)});
    var batch=db.batch();
    batch.set(roomRef,patch,{merge:true});
    batch.set(msgRef,msg,{merge:true});
    return batch.commit().then(function(){
      try{goPage('chat')}catch(_e){}
      setTimeout(function(){try{openRoom(roomId,false)}catch(_e){}},260);
      return {roomId:roomId,newRoom:!exists};
    });
  });
};
(function(){
  var _origEnsure=_chatEnsureHotfixUI;
  _chatEnsureHotfixUI=function(){
    _origEnsure();
    if(!el('chat-contact-style')){
      var st=document.createElement('style');
      st.id='chat-contact-style';
      st.textContent=' .chat-contact-grid{display:grid;gap:10px}.chat-contact-card{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid #e3eaf4;border-radius:14px;background:#fff;padding:12px 14px}.chat-contact-meta{min-width:0}.chat-contact-meta b{display:block;color:#1f2937;font-size:.88rem}.chat-contact-meta span{display:block;color:#667085;font-size:.74rem;margin-top:3px}.chat-contact-actions{display:flex;gap:8px;flex-wrap:wrap}.chat-contact-actions a,.chat-contact-actions button{border:1px solid #d8e0ea;background:#fff;color:#1764d8;border-radius:12px;padding:8px 12px;font:600 .78rem Inter,Outfit,sans-serif;text-decoration:none;cursor:pointer}.chat-contact-missing{color:#98a2b3;font-size:.74rem}';
      document.head.appendChild(st);
    }
    var modal=el('mo-chat-inspect');
    var tabs=modal?q('.chat-inspect-tabs',modal):null;
    if(tabs&&!q('[data-chat-detail-tab="contact"]',tabs)){
      var btn=document.createElement('button');
      btn.className='chat-inspect-tab';
      btn.setAttribute('data-chat-detail-tab','contact');
      btn.textContent='Contato';
      tabs.appendChild(btn);
    }
  };
  function _contactsForRoom(r){
    return (r&&r.memberIds||[]).map(function(uid0){
      var u=(getUser&&getUser(uid0))||{id:uid0,nome:uid0,cargo:''};
      var raw=_crmPhoneRaw(u),dig=_crmPhoneDigits(raw);
      return {id:uid0,nome:u.nome||uid0,cargo:u.cargo||'',raw:raw,digits:dig,fmt:_crmFmtPhone(raw),wa:dig?('https://wa.me/'+dig):''};
    });
  }
  var _origInspect=_chatRenderInspect;
  _chatRenderInspect=function(){
    _chatEnsureHotfixUI();
    var r=activeRoom(),body=el('chat-inspect-body');
    if(!r||!body)return;
    var tab=C._detailTab||'media';
    if(tab==='contact'){
      el('chat-inspect-av').innerHTML=roomAvatar(r).replace('class="chat-av"','class="chat-av"');
      el('chat-inspect-name').textContent=roomTitle(r);
      var list=_contactsForRoom(r);
      var phoneSummary=list.filter(function(x){return x.fmt}).map(function(x){return x.nome.split(' ')[0]+': '+x.fmt}).join(' • ');
      el('chat-inspect-sub').textContent=(roomSub(r)||'Contatos da conversa')+(phoneSummary?' • '+phoneSummary:'');
      qa('[data-chat-detail-tab]',el('mo-chat-inspect')).forEach(function(b){b.classList.toggle('on',b.getAttribute('data-chat-detail-tab')===tab)});
      body.innerHTML=list.length?('<div class="chat-contact-grid">'+list.map(function(x){return '<div class="chat-contact-card"><div class="chat-contact-meta"><b>'+esc(x.nome)+'</b><span>'+esc(x.cargo||'Usuário')+'</span><span>'+(x.fmt?esc(x.fmt):'<span class="chat-contact-missing">WhatsApp não informado</span>')+'</span></div><div class="chat-contact-actions">'+(x.wa?('<a href="'+attr(x.wa)+'" target="_blank" rel="noopener noreferrer">WhatsApp</a>'):'')+'</div></div>'}).join('')+'</div>'):'<div class="chat-inspect-empty">Nenhum participante encontrado.</div>';
      return;
    }
    _origInspect.apply(this,arguments);
    var list2=_contactsForRoom(r).filter(function(x){return x.fmt});
    if(list2.length){
      var sub=el('chat-inspect-sub');
      if(sub){
        var extra=list2.map(function(x){return x.nome.split(' ')[0]+': '+x.fmt}).join(' • ');
        sub.textContent=(roomSub(r)||'Histórico compartilhado nesta conversa')+' • '+extra;
      }
    }
  };
})();
window.addEventListener('crm:user-created',function(){try{mountBitrixChrome();renderRooms();buildUserPick([]);populateDeptSelects();syncBitrixChrome()}catch(_e){}});patchCore();ensureMarkup();mountBitrixChrome();

})();
