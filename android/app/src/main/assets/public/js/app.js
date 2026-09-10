/* =====================================================================
 * app.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// ============================================================
// GUARDA DE VIBRAÇÃO — Chrome/Blink exige "sticky user activation" pra
// permitir navigator.vibrate (evita o aviso "[Intervention] Blocked call
// to navigator.vibrate" no console quando uma notificação de atividade
// atrasada dispara antes do primeiro toque do usuário na página).
// ============================================================
(function(){
  var nav=window.navigator;
  if(!nav||typeof nav.vibrate!=='function')return;
  var activated=false;
  var orig=nav.vibrate.bind(nav);
  function onGesture(){
    if(activated)return;
    activated=true;
    ['pointerdown','touchstart','keydown','mousedown'].forEach(function(ev){
      window.removeEventListener(ev,onGesture,true);
    });
  }
  ['pointerdown','touchstart','keydown','mousedown'].forEach(function(ev){
    window.addEventListener(ev,onGesture,true);
  });
  try{
    nav.vibrate=function(){
      if(!activated)return false; // ignora silenciosamente antes do 1º gesto
      return orig.apply(nav,arguments);
    };
  }catch(_e){}
})();

// ============================================================
// BOOT / STARTAPP
// ============================================================
function _lfUsuariosRuntime(){
  return ((((window.LiderCRM||{}).modules||{}).usuarios||{}).runtime)||{};
}

function _lfResolveFn(name, legacyRef){
  if(typeof legacyRef==='function')return legacyRef;
  try{ if(typeof window[name]==='function') return window[name]; }catch(_e){}
  try{
    var rt=_lfUsuariosRuntime();
    if(rt&&typeof rt[name]==='function') return rt[name];
  }catch(_e){}
  return null;
}

function _lfGetUsersSafe(){
  var fn=_lfResolveFn('getUsers',typeof getUsers!=='undefined'?getUsers:null);
  if(!fn) return [];
  try{
    var list=fn();
    return Array.isArray(list)?list:[];
  }catch(e){
    console.warn('[app] getUsers falhou',e);
    return [];
  }
}

function _lfGetUserSafe(uid){
  var fn=_lfResolveFn('getUser',typeof getUser!=='undefined'?getUser:null);
  if(fn){
    try{return fn(uid)||null;}catch(e){console.warn('[app] getUser falhou',e);}
  }
  var list=_lfGetUsersSafe();
  for(var i=0;i<list.length;i++){
    var u=list[i];
    if(u&&String(u.id)===String(uid)) return u;
  }
  return null;
}

function _lfLoadUsersDBSafe(cb){
  var fn=_lfResolveFn('loadUsersDB',typeof loadUsersDB!=='undefined'?loadUsersDB:null);
  if(typeof fn!=='function'){
    console.warn('[app] loadUsersDB indisponível — seguindo com cache local');
    if(typeof cb==='function') cb(_lfGetUsersSafe());
    return;
  }
  try{return fn(cb);}catch(e){
    console.warn('[app] loadUsersDB falhou',e);
    if(typeof cb==='function') cb(_lfGetUsersSafe());
  }
}

function _lfLoadDepartmentsRemoteSafe(cb){
  var fn=_lfResolveFn('loadDepartmentsRemote',typeof loadDepartmentsRemote!=='undefined'?loadDepartmentsRemote:null);
  if(typeof fn!=='function') return;
  try{return fn(cb||function(){});}catch(e){console.warn('app: loadDepartmentsRemote failed',e);}
}


function _lfSafeCall(fn,label){
  try{return typeof fn==='function'?fn():void 0;}catch(e){console.warn('[app] '+label,e);}
}

function _lfDefer(fn,ms){
  return setTimeout(function(){ _lfSafeCall(fn,'defer'); },ms||0);
}

function _lfAfterFirstPaint(fn){
  try{
    requestAnimationFrame(function(){ setTimeout(function(){ _lfSafeCall(fn,'afterFirstPaint'); },0); });
  }catch(_e){ _lfDefer(fn,0); }
}

function _lfBootAllowedPages(){
  return ['dash','anal','adm','leads','negocios','agenda','time','config','docs','estrutura','chat'];
}

function _lfNormalizeBootPage(p){
  p=String(p||'').trim();
  return _lfBootAllowedPages().indexOf(p)>=0?p:null;
}

/* Navegação por URL bonita (2026-08-16): /agenda, /leads, /negocios etc.
   servem index.html (ver _redirects — fallback de SPA já configurado no
   Cloudflare Pages), e o boot lê o caminho pra saber em que aba abrir.
   Só ativo na Web — apps nativos (Capacitor Android/iOS) não têm servidor
   por trás pra servir essas rotas num F5, então lá a navegação continua
   só por goPage()/estado interno, sem tocar na URL. */
function _lfIsNativeApp(){
  try{ return !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()); }
  catch(_e){ return false; }
}
function _lfUrlRoutingEnabled(){
  return !_lfIsNativeApp()&&!!(window.history&&window.history.pushState);
}
function _lfPageFromPathname(){
  try{
    var seg=String(window.location.pathname||'').replace(/^\/+|\/+$/g,'');
    return _lfNormalizeBootPage(seg);
  }catch(_e){ return null; }
}
function _lfPathForPage(p){ return '/'+p; }
/* Atualiza a barra de endereço pra refletir a aba atual, sem recarregar a
   página. push=true empilha (permite voltar com o botão Voltar do
   navegador); push=false troca sem empilhar (usado no boot inicial, pra
   não criar uma entrada de histórico extra antes do usuário navegar). */
function _lfSyncUrlForPage(p,push){
  if(!_lfUrlRoutingEnabled())return;
  try{
    var path=_lfPathForPage(p);
    if(push) window.history.pushState({lfPage:p},'',path);
    else window.history.replaceState({lfPage:p},'',path);
  }catch(_e){}
}
/* Clique numa aba: clique normal navega por dentro do SPA (rápido, sem
   reload). Botão direito, botão do meio, Ctrl/Cmd+clique e Shift+clique
   são deixados 100% para o navegador tratar nativamente — é assim que
   "abrir link em nova guia" passa a funcionar de verdade, porque agora
   as abas são links <a href> de verdade, não botões sem destino. */
function _lfNavClick(e,page){
  if(!e||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return true;
  if(e.preventDefault)e.preventDefault();
  goPage(page);
  return false;
}
if(!window.__LF_URL_POPSTATE_BOUND__){
  window.__LF_URL_POPSTATE_BOUND__=1;
  window.addEventListener('popstate',function(ev){
    if(!_lfUrlRoutingEnabled())return;
    var p=(ev.state&&ev.state.lfPage&&_lfNormalizeBootPage(ev.state.lfPage))||_lfPageFromPathname()||'dash';
    if(typeof goPage==='function')goPage(p);
  });
}

function _lfReadBootIntent(){
  try{
    var params=new URLSearchParams(window.location.search||'');
    return {
      page:_lfNormalizeBootPage(params.get('page'))||_lfPageFromPathname(),
      lite:['1','true','yes','on'].indexOf(String(params.get('lite')||'').toLowerCase())>=0,
      handoffId:String(params.get('handoff')||'').trim()||null
    };
  }catch(_e){
    return {page:null,lite:false,handoffId:null};
  }
}

function _lfGetBootTargetPage(){
  var intent=_lfReadBootIntent();
  var pending=_lfNormalizeBootPage(window.__LF_BOOT_ROUTE_PENDING);
  return intent.page||pending||'dash';
}

function _lfIsLiteBoot(){
  return !!_lfReadBootIntent().lite;
}

function _lfWarmStateKey(){ return 'lf_warm_state_v1'; }
function _lfWarmStateTTL(){ return 45000; }

function _lfCurrentVisiblePage(){
  try{
    var on=document.querySelector('.pg.on');
    return on&&on.id?String(on.id).replace(/^pg-/,''):null;
  }catch(_e){ return null; }
}

function _lfCloneWarm(value){
  try{return JSON.parse(JSON.stringify(value==null?null:value));}catch(_e){ return null; }
}

function _lfBuildWarmState(targetPage,extra){
  var current=_lfNormalizeBootPage(_lfCurrentVisiblePage())||'dash';
  var normalizedTarget=_lfNormalizeBootPage(targetPage)||current;
  return {
    id:'lfwh_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),
    ts:Date.now(),
    userId:(S&&S.userId)||null,
    sourcePage:current,
    page:normalizedTarget,
    targetPage:normalizedTarget,
    chatConvId:(typeof _chatCurrentConv!=='undefined'&&_chatCurrentConv)?String(_chatCurrentConv):null,
    kbViewUid:(typeof _kbViewUid!=='undefined')?_lfCloneWarm(_kbViewUid):null,
    mbStageFilter:(typeof _mbStageFilter!=='undefined')?_lfCloneWarm(_mbStageFilter):null,
    extra:_lfCloneWarm(extra)||null
  };
}

function _lfBroadcastWarmState(state){
  try{
    if(!window.BroadcastChannel) return;
    if(!window.__LF_WARM_STATE_BC__) window.__LF_WARM_STATE_BC__=new BroadcastChannel('lf_warm_state_v1');
    window.__LF_WARM_STATE_BC__.postMessage(state);
  }catch(_e){}
}

function _lfWriteWarmState(targetPage,extra){
  var state=_lfBuildWarmState(targetPage,extra);
  try{ localStorage.setItem(_lfWarmStateKey(),JSON.stringify(state)); }catch(_e){}
  window.__LF_LAST_WARM_STATE=state;
  _lfBroadcastWarmState(state);
  return state;
}

function _lfReadWarmState(targetPage){
  var normalizedTarget=_lfNormalizeBootPage(targetPage);
  var state=null;
  try{
    var raw=localStorage.getItem(_lfWarmStateKey());
    if(raw) state=JSON.parse(raw);
  }catch(_e){}
  if(!state && window.__LF_LAST_WARM_STATE) state=window.__LF_LAST_WARM_STATE;
  if(!state||!state.ts) return null;
  if((Date.now()-Number(state.ts||0))>_lfWarmStateTTL()) return null;
  if(normalizedTarget && state.targetPage && state.targetPage!==normalizedTarget && state.page!==normalizedTarget) return null;
  return state;
}

function _lfConsumeWarmState(targetPage){
  var state=_lfReadWarmState(targetPage);
  if(!state) return null;
  if(S&&state.userId&&S.userId&&String(state.userId)!==String(S.userId)) return null;
  try{
    if(typeof _kbViewUid!=='undefined' && state.kbViewUid){
      _kbViewUid.leads=state.kbViewUid.leads==null?null:state.kbViewUid.leads;
      _kbViewUid.negocios=state.kbViewUid.negocios==null?null:state.kbViewUid.negocios;
    }
  }catch(_e){}
  try{
    if(typeof _mbStageFilter!=='undefined' && state.mbStageFilter){
      _mbStageFilter.leads=state.mbStageFilter.leads==null?null:state.mbStageFilter.leads;
      _mbStageFilter.negocios=state.mbStageFilter.negocios==null?null:state.mbStageFilter.negocios;
    }
  }catch(_e){}
  try{
    if(state.chatConvId) localStorage.setItem('lf_chat_last_conv',String(state.chatConvId));
  }catch(_e){}
  window.__LF_BOOT_WARM_STATE=state;
  return state;
}

if(!window.__LF_WARM_STATE_BUS__){
  window.__LF_WARM_STATE_BUS__=1;
  window.addEventListener('storage',function(ev){
    try{
      if(!ev||ev.key!==_lfWarmStateKey()||!ev.newValue) return;
      window.__LF_LAST_WARM_STATE=JSON.parse(ev.newValue);
    }catch(_e){}
  });
  if(window.BroadcastChannel){
    try{
      if(!window.__LF_WARM_STATE_BC__) window.__LF_WARM_STATE_BC__=new BroadcastChannel('lf_warm_state_v1');
      window.__LF_WARM_STATE_BC__.onmessage=function(ev){
        if(ev&&ev.data) window.__LF_LAST_WARM_STATE=ev.data;
      };
    }catch(_e){}
  }
  window.addEventListener('pagehide',function(){ _lfWriteWarmState(_lfCurrentVisiblePage(),{reason:'pagehide'}); },{passive:true});
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden') _lfWriteWarmState(_lfCurrentVisiblePage(),{reason:'hidden'}); },{passive:true});
}

function _lfSoftResumeSync(reason){
  if(!S||!S.userId)return;
  console.debug('[CRM] soft resume sync:',reason||'resume');
  _lfSafeCall(function(){ if(window.LiderCRM&&window.LiderCRM.offline&&window.LiderCRM.offline.sync) window.LiderCRM.offline.sync.drain(); },'offline.sync.drain');
  _lfSafeCall(function(){ _lfLoadUsersDBSafe(function(){ try{ if(typeof renderUsers==='function')renderUsers(); }catch(_e){} try{ if(typeof buildNav==='function')buildNav(); }catch(_e){} }); },'loadUsersDB');
  _lfSafeCall(function(){ _lfLoadDepartmentsRemoteSafe(function(){}); },'loadDepartmentsRemote');
  _lfSafeCall(function(){ if(typeof _sessionsHeartbeat==='function')_sessionsHeartbeat(); },'_sessionsHeartbeat');
  _lfSafeCall(function(){ if(typeof loadNotifsRemote==='function')loadNotifsRemote(function(){ try{ if(typeof updateNotifBadge==='function')updateNotifBadge(); }catch(_e){} try{ if(typeof renderNotifPanel==='function' && document.getElementById('ntf-panel') && document.getElementById('ntf-panel').classList.contains('open')) renderNotifPanel(getNotifs(S.userId)); }catch(_e){} }); },'loadNotifsRemote');
  _lfSafeCall(function(){ if(typeof _chatEnsurePolling==='function' && document.getElementById('pg-chat') && document.getElementById('pg-chat').classList.contains('on')) _chatEnsurePolling(); if(typeof _chatPollNewMsgs==='function' && document.getElementById('pg-chat') && document.getElementById('pg-chat').classList.contains('on')) _chatPollNewMsgs(); },'chatResume');
  _lfSafeCall(function(){ if(window.LF&&typeof window.LF.fetchAndCacheActivities==='function') window.LF.fetchAndCacheActivities(S.userId).then(function(){ try{ if(typeof renderActPanel==='function')renderActPanel(); }catch(_e){} try{ if(typeof updateActBadge==='function')updateActBadge(); }catch(_e){} }).catch(function(e){console.warn('[app] soft activities sync falhou',e);}); },'fetchAndCacheActivities');
  /* CORREÇÃO 2026-08-05: faltava recarregar Clientes/Bingo aqui —
     usuários, notificações, chat e atividades já eram atualizados ao
     voltar do segundo plano, mas os dados do Bingo ("Ag"/"30s"/etc,
     status Presencial/No-Show) não. No celular, que fica indo pra
     segundo plano o tempo todo (troca de app, tela apagando), isso
     fazia o Bingo ficar visivelmente desatualizado ali enquanto o PC
     (que recarrega a página com mais frequência) mostrava o estado
     certo. Só re-renderiza se a pessoa está mesmo na tela Início
     (onde o Bingo aparece) agora — evita trabalho à toa em outras abas. */
  _lfSafeCall(function(){
    if(typeof _safeLoadCli==='function'){
      _safeLoadCli(S.userId,function(){
        try{
          var dashPg=document.getElementById('pg-dash');
          if(dashPg&&dashPg.classList.contains('on')&&typeof renderDash==='function')renderDash();
        }catch(_e){}
      });
    }
  },'clientesResume');
  /* CORREÇÃO 2026-08-17: mesmo motivo do bloco de Clientes/Bingo acima —
     Leads e Negócios também ficavam sem atualizar ao voltar de segundo
     plano/trocar de aba, e diferente do Bingo, aqui o problema afetava
     em cheio supervisor/gerente: se alguém do time move um card, altera
     responsável ou libera um lead pra "Livre" enquanto o supervisor está
     com o app aberto (mas não navegando pra fora e voltando pra Leads),
     ele só via a mudança saindo e voltando da aba — ou, no caso mais
     chato, relogando depois de um deploy. _syncKBRemoteBG já busca o
     pool certo (time inteiro pra supervisor/gerente, só a própria pra
     consultor — mesma regra de sempre), só faltava disparar aqui também. */
  _lfSafeCall(function(){
    ['leads','negocios'].forEach(function(board){
      var pg=document.getElementById('pg-'+board);
      if(pg&&pg.classList.contains('on')&&typeof _syncKBRemoteBG==='function')_syncKBRemoteBG(board);
    });
  },'kanbanResume');
}


function bootApp(){
  /* Não sobrescrever a versão controlada por
     lf-post-update-recovery-v1-20260729.js. Antes, este valor era gravado
     como "lf_v13" em TODO boot, depois do wrapper de pós-update já ter
     gravado a versão atual. Resultado: o próximo boot entendia que havia
     uma atualização nova e apagava novamente os caches do Kanban — inclusive
     anotações que ainda estavam aguardando sincronização remota. */
  try{
    if(!localStorage.getItem('lf_app_ver'))localStorage.setItem('lf_app_ver','lf_v13');
  }catch(e){console.warn("app: localStorage write failed",e);}
  // [FIX 20260829] Ativa o dreno da fila de retentativas offline
  // (src/core/offline/sync-manager.js) — já existia pronta, mas
  // nunca era iniciada (.start()), então só reagia ao evento do
  // navegador "voltou a ficar online", nunca de forma periódica nem
  // ao abrir o app. Isso deixava itens que falharam ao salvar na
  // nuvem (ex.: nota/anotação editada com internet instável) presos
  // só no armazenamento local, sem nenhuma tentativa automática de
  // reenviar depois — risco real de perda se esse armazenamento
  // local fosse limpo antes de alguém notar o aviso de erro.
  try{
    if(window.LiderCRM&&window.LiderCRM.offline&&window.LiderCRM.offline.sync){
      window.LiderCRM.offline.sync.start();
      window.LiderCRM.offline.sync.drain();
    }
  }catch(_e){}
  // [FIX 20260830] Lado que faltava da BroadcastChannel entre abas — ver
  // saveKBFor (js/kanban.js), que já mandava o aviso mas ninguém escutava.
  // Sem rede, sem espera: assim que qualquer aba salva/exclui um card, as
  // outras abas da mesma origem recebem o aviso e re-renderizam na hora
  // (o localStorage já está atualizado — só falta mandar reler e repintar).
  try{
    if('BroadcastChannel' in window){
      window.__LF_KB_BC__=window.__LF_KB_BC__||new BroadcastChannel('lf_kb_v1');
      window.__LF_KB_BC__.addEventListener('message',function(ev){
        try{
          var msg=ev&&ev.data;
          if(!msg||msg.t!=='kb'||!msg.board)return;
          var pg=document.getElementById('pg-'+msg.board);
          if(pg&&pg.classList.contains('on')&&typeof renderKBLocal==='function')renderKBLocal(msg.board);
        }catch(_e){}
      });
    }
  }catch(_e){}
  _lfGetUsersSafe();
  var le=document.getElementById('le'),lp=document.getElementById('lp');
  if(le){le.removeEventListener('keydown',_leKD);le.addEventListener('keydown',_leKD);}
  if(lp){lp.removeEventListener('keydown',_lpKD);lp.addEventListener('keydown',_lpKD);}
  var ri=document.getElementById('rename-doc-inp');
  if(ri){ri.removeEventListener('keydown',_riKD);ri.addEventListener('keydown',_riKD);}
  if(checkSes()){
    startApp();
    // CORREÇÃO (usuário criado em outro aparelho não aparece): quando a sessão já estava
    // salva neste navegador (checkSes()=true), o app pulava direto pro startApp() usando só
    // o cache local (lf6_u) e NUNCA buscava a lista de usuários na nuvem — diferente do
    // login manual, que já chama loadUsersDB(). Resultado: um usuário criado no celular
    // nunca aparecia no PC (ou vice-versa) enquanto a sessão do PC continuasse "logada",
    // porque o app nunca voltava a consultar o Firestore pra essa lista. Agora, sempre que
    // uma sessão é restaurada, buscamos a lista atualizada da nuvem em segundo plano (sem
    // travar a tela, que já abriu com o cache local) e re-renderizamos a tela de usuários
    // caso o ADM já esteja com essa aba aberta.
    var _restoreRemoteSync=function(){
      _lfLoadUsersDBSafe(function(list){
        try{renderUsers();}catch(e){console.error("app: renderUsers failed",e);}
        if(!S)return;
        var me=(list||[]).find(function(u){return u&&u.id===S.userId;});
        if(!me||me.ativo===false){
          try{toast('🔒 Sua conta foi desativada ou removida.');}catch(e){console.warn("app: toast failed",e);}
          setTimeout(_execLogout,120);
          return;
        }
        var changed=false;
        if(me.nome&&S.nome!==me.nome){S.nome=me.nome;var un=document.getElementById('nav-un');if(un)un.textContent=me.nome;changed=true;}
        if(me.email&&S.email!==me.email){S.email=me.email;changed=true;}
        if(typeof me.cor!=='undefined'&&(S.cor||0)!==(me.cor||0)){
          S.cor=me.cor||0;
          var av=document.getElementById('nav-av');
          var pic=sg('lf13_pic_'+S.userId);
          if(av&&!pic){av.textContent=(S.nome||'?').charAt(0).toUpperCase();av.style.background=AVB[(S.cor||0)%AVB.length];}
          changed=true;
        }
        if(changed)ss('lf6_s',S);
      });
      _lfLoadDepartmentsRemoteSafe(function(){});
    };
    if(_lfIsLiteBoot()) setTimeout(_restoreRemoteSync,700);
    else if(typeof window.LF_WHEN_WORKER_AUTH==='function'){
      // CORREÇÃO (2026-08-10): em boot frio (Capacitor), checkSes() restaura
      // a sessão salva e cai direto aqui ANTES do JWT ter sido espelhado em
      // S._workerToken. Sem esperar, loadUsersDB() tomava 401 do Worker e
      // caía no fallback do cache local — que num aparelho onde outro
      // usuário nunca logou fica vazio/incompleto (some da lista até
      // alguém mais logar naquele aparelho). Usa o mesmo gate genérico
      // "espera o JWT" que scope-v2/departments-crud/zombie-users já usam.
      window.LF_WHEN_WORKER_AUTH(_restoreRemoteSync);
    }
    else _restoreRemoteSync();
    return;
  }
  document.getElementById('login-screen').classList.add('vis');
}

function _leKD(e){if(e.key==='Enter')doLogin();}

function _lpKD(e){if(e.key==='Enter')doLogin();}

function _setRenameDocModalMode(mode){
  var modal=document.getElementById('mo-rename-doc');if(!modal)return;
  mode=mode==='attachment'?'attachment':'document';
  modal.dataset.renameMode=mode;
  var title=modal.querySelector('.mht');
  if(title)title.textContent=mode==='attachment'?'✏️ Renomear anexo':'✏️ Renomear documento';
  var okBtn=modal.querySelector('.bp');
  if(okBtn)okBtn.onclick=function(){return mode==='attachment'?_confirmRenameAttachment():_confirmRenameAdmDoc();};
}

function _riKD(e){
  if(e.key!=='Enter')return;
  var modal=document.getElementById('mo-rename-doc');
  var mode=modal&&modal.dataset&&modal.dataset.renameMode==='attachment'?'attachment':'document';
  if(mode==='attachment')_confirmRenameAttachment();
  else _confirmRenameAdmDoc();
}

function startApp(){
  document.getElementById('login-screen').classList.remove('vis');
  document.getElementById('app').classList.add('vis');
  var av=document.getElementById('nav-av');
  var pic=sg('lf13_pic_'+S.userId);
  if(pic)av.innerHTML='<img src="'+_htmlAttr(pic)+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
  else{av.textContent=(S.nome||'?').charAt(0).toUpperCase();av.style.background=AVB[S.cor%AVB.length];}
  document.getElementById('nav-un').textContent=S.nome;
  var now=new Date(),y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,'0');
  var d1=document.getElementById('d1'),d2=document.getElementById('d2'),nd=document.getElementById('nd');
  if(d1)d1.value=y+'-'+m+'-01';if(d2)d2.value=today();if(nd)nd.value=today();
  try{buildNav();}catch(e){console.error('buildNav',e);}
  try{if(typeof loadThemeRemote==='function')loadThemeRemote(S.userId,function(mode){if(typeof setAppThemeMode==='function')setAppThemeMode(mode,true);});}catch(e){console.error('loadThemeRemote',e);}
  try{if(typeof loadBGRemote==='function')loadBGRemote(S.userId,function(){try{if(typeof applyBG==='function')applyBG(sg('lf13_bg_'+S.userId)||'default');}catch(_e){}});}catch(e){console.error('loadBGRemote',e);}
  try{
    if(window._actPanelClickHandler)document.removeEventListener('click',window._actPanelClickHandler,{passive:true});
    window._actPanelClickHandler=function(e){
      var p=document.getElementById('act-panel');
      var actBells=[document.getElementById('act-bell'),document.getElementById('mtb-bell')];
      if(p&&p.classList.contains('open')&&!p.contains(e.target)&&!actBells.some(function(b){return b&&b.contains(e.target);}))p.classList.remove('open');
      var np=document.getElementById('ntf-panel');
      var ntfBells=[document.getElementById('ntf-bell'),document.getElementById('mtb-ntf-bell')];
      if(np&&np.classList.contains('open')&&!np.contains(e.target)&&!ntfBells.some(function(b){return b&&b.contains(e.target);}))np.classList.remove('open');
    };
    document.addEventListener('click',window._actPanelClickHandler,{passive:true});
  }catch(e){console.error('actPanelClickHandler',e);}
  try{if(typeof initLigWidget==='function')initLigWidget();}catch(e){console.error('initLigWidget',e);}

  var _bootPage=_lfGetBootTargetPage();
  // Sempre tenta consumir o "estado quente" da aba de origem, não só
  // quando lite=1 — a função já é segura sozinha (expira em 45s, confere
  // usuário, confere página-alvo), então uma aba nova aberta por link
  // nativo (botão direito "Abrir em nova guia", sem esses parâmetros)
  // também abre com o filtro/conversa de onde a pessoa estava, em vez de
  // sempre começar do zero.
  _lfConsumeWarmState(_bootPage);
  _lfSyncUrlForPage(_bootPage,false);
  goPage(_bootPage);
  requestAnimationFrame(function(){if(!document.querySelector('.pg.on'))goPage(_bootPage);});
  setTimeout(function(){if(document.getElementById('app')&&!document.querySelector('.pg.on'))goPage(_bootPage);},120);

  _lfAfterFirstPaint(function(){
    var _liteBoot=_lfIsLiteBoot();
    _lfSafeCall(function(){ if(typeof registerDeviceSession==='function')registerDeviceSession(); },'registerDeviceSession');
    _lfSafeCall(function(){
      if(window._sessInterval)clearInterval(window._sessInterval);
      if(typeof _sessionsHeartbeat==='function')window._sessInterval=setInterval(_sessionsHeartbeat,120000);
    },'_sessionsHeartbeat interval');
    _lfSafeCall(function(){ if(S&&S.userId&&typeof logFeedEvent==='function')logFeedEvent('login',S.userId,(S.nome||'Usuário'),'entrou',''); },'logFeedEvent');
    // [FIX 20260913 — item 6 do plano de estabilidade] Antes, saber que
    // havia erro novo dependia de abrir Configurações > Ver erros
    // recentes por conta própria — nada avisava proativamente. Agora,
    // se for admin, checa ao logar e avisa por toast se tiver algo novo
    // desde a última vez que essa pessoa olhou o painel.
    _lfSafeCall(function(){
      if(!(typeof hasAdminAccess==='function'&&hasAdminAccess()))return;
      setTimeout(function(){
        try{
          var wc=(window.LiderCRM&&window.LiderCRM.api&&window.LiderCRM.api.workerClient)||null;
          if(!wc||typeof wc.request!=='function')return;
          var lastSeen=localStorage.getItem('lf_client_errors_last_seen')||'';
          wc.request('/client-errors?limit=20',{method:'GET'}).then(function(res){
            var items=(res&&res.data&&res.data.data)||(res&&res.data)||[];
            if(!Array.isArray(items)||!items.length)return;
            var novos=lastSeen?items.filter(function(e){return e&&e.ts&&e.ts>lastSeen;}).length:items.length;
            if(novos>0&&typeof toast==='function'){
              toast('⚠️ '+novos+' erro'+(novos>1?'s novos':' novo')+' no sistema — veja em Configurações > Manutenção',6000);
            }
          }).catch(function(){});
        }catch(_e){}
      },2000);
    },'checkNewClientErrors');
    if(_liteBoot){
      _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof loadSavedFiltersRemote==='function')loadSavedFiltersRemote(); }catch(_e){} },250); },'lite.loadSavedFiltersRemote');
      _lfSafeCall(function(){ setTimeout(function(){ try{ _lfLoadDepartmentsRemoteSafe(function(){}); }catch(_e){} },450); },'lite.loadDepartmentsRemote');
      _lfSafeCall(function(){ setTimeout(function(){ try{ if(window.LF&&typeof window.LF.fetchAndCacheActivities==='function'&&S&&S.userId){ window.LF.fetchAndCacheActivities(S.userId).then(function(list){ if(!Array.isArray(list))return; try{if(typeof renderActPanel==='function')renderActPanel();}catch(_e){} try{if(typeof updateActBadge==='function')updateActBadge();}catch(_e){} try{if(typeof refreshLinkedActivitySummaries==='function')refreshLinkedActivitySummaries();}catch(_e){} }).catch(function(e){console.warn('[app] sync de atividades falhou',e);}); } }catch(_e){} },900); },'lite.fetchAndCacheActivities');
      _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof loadNotifsRemote==='function')loadNotifsRemote(function(){ try{ if(typeof updateNotifBadge==='function')updateNotifBadge(); }catch(_e){} }); if(window._ntfInterval)clearInterval(window._ntfInterval); if(typeof loadNotifsRemote==='function')window._ntfInterval=setInterval(function(){loadNotifsRemote(function(){ try{ if(typeof updateNotifBadge==='function')updateNotifBadge(); }catch(_e){} });},60000); }catch(_e){} },1200); },'lite.loadNotifsRemote');
      _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof checkUpcomingActs==='function')checkUpcomingActs(); }catch(_e){} },1500); if(window._actInterval)clearInterval(window._actInterval); if(typeof checkUpcomingActs==='function')window._actInterval=setInterval(checkUpcomingActs,60000); },'lite.activities interval');
      _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof _runAutomationEngineBoot==='function')_runAutomationEngineBoot(); }catch(_e){} },1700); if(window._autoEngineInterval)clearInterval(window._autoEngineInterval); if(typeof _runAutomationEngineBoot==='function')window._autoEngineInterval=setInterval(_runAutomationEngineBoot,300000); },'lite.automation');
      _lfSafeCall(function(){ requestAnimationFrame(function(){ setTimeout(function(){ try{ if(typeof loadLogoRemote==='function'&&typeof applyCustomLogo==='function')loadLogoRemote(function(savedLogo){applyCustomLogo(savedLogo);}); }catch(_e){} },500); }); },'lite.loadLogoRemote');
      _lfSafeCall(function(){ requestAnimationFrame(function(){ setTimeout(function(){ try{ if(typeof loadCRMNameRemote==='function'&&typeof applyCRMBranding==='function')loadCRMNameRemote(function(saved){applyCRMBranding(saved&&saved.name,saved&&saved.img);if(saved&&saved.name){var inp=document.getElementById('cfg-crm-name-input');if(inp)inp.value=saved.name;}}); }catch(_e){} },550); }); },'lite.loadCRMNameRemote');
      _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof requestNotifPermission==='function')requestNotifPermission(); }catch(_e){} },2200); },'lite.requestNotifPermission');
      _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof setupPushNotifications==='function')setupPushNotifications(); }catch(_e){} },2500); },'lite.setupPushNotifications');
      return;
    }
    _lfSafeCall(function(){ if(typeof loadSavedFiltersRemote==='function')loadSavedFiltersRemote(); },'loadSavedFiltersRemote');
    _lfSafeCall(function(){ _lfLoadDepartmentsRemoteSafe(function(){}); },'loadDepartmentsRemote');
    _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof checkUpcomingActs==='function')checkUpcomingActs(); }catch(_e){} },1200); if(window._actInterval)clearInterval(window._actInterval); if(typeof checkUpcomingActs==='function')window._actInterval=setInterval(checkUpcomingActs,60000); },'activities interval');
    _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof requestNotifPermission==='function')requestNotifPermission(); }catch(_e){} },2000); },'requestNotifPermission');
    _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof setupPushNotifications==='function')setupPushNotifications(); }catch(_e){} },2200); },'setupPushNotifications');
    _lfSafeCall(function(){ if(typeof loadNotifsRemote==='function')loadNotifsRemote(function(){ try{ if(typeof updateNotifBadge==='function')updateNotifBadge(); }catch(_e){} }); if(window._ntfInterval)clearInterval(window._ntfInterval); if(typeof loadNotifsRemote==='function')window._ntfInterval=setInterval(function(){loadNotifsRemote(function(){ try{ if(typeof updateNotifBadge==='function')updateNotifBadge(); }catch(_e){} });},60000); },'loadNotifsRemote');
    _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof _runAutomationEngineBoot==='function')_runAutomationEngineBoot(); }catch(_e){} },1500); if(window._autoEngineInterval)clearInterval(window._autoEngineInterval); if(typeof _runAutomationEngineBoot==='function')window._autoEngineInterval=setInterval(_runAutomationEngineBoot,300000); },'automation');
    _lfSafeCall(function(){ if(window.LF&&typeof window.LF.fetchAndCacheActivities==='function'&&S&&S.userId){ window.LF.fetchAndCacheActivities(S.userId).then(function(list){ if(!Array.isArray(list))return; try{if(typeof renderActPanel==='function')renderActPanel();}catch(_e){} try{if(typeof updateActBadge==='function')updateActBadge();}catch(_e){} try{if(typeof refreshLinkedActivitySummaries==='function')refreshLinkedActivitySummaries();}catch(_e){} }).catch(function(e){console.warn('[app] sync de atividades falhou',e);}); } },'fetchAndCacheActivities');
    _lfSafeCall(function(){ requestAnimationFrame(function(){ try{ if(typeof loadLogoRemote==='function'&&typeof applyCustomLogo==='function')loadLogoRemote(function(savedLogo){applyCustomLogo(savedLogo);}); }catch(_e){} }); },'loadLogoRemote');
    _lfSafeCall(function(){ requestAnimationFrame(function(){ try{ if(typeof loadCRMNameRemote==='function'&&typeof applyCRMBranding==='function')loadCRMNameRemote(function(saved){applyCRMBranding(saved&&saved.name,saved&&saved.img);if(saved&&saved.name){var inp=document.getElementById('cfg-crm-name-input');if(inp)inp.value=saved.name;}}); }catch(_e){} }); },'loadCRMNameRemote');
  });

  setTimeout(function(){
    try{window.dispatchEvent(new CustomEvent('lf:app-started',{detail:{userId:S&&S.userId||null}}));}catch(_e){}
  },0);
}

// ============================================================
// NAV / PAGES
// ============================================================
/* FIX (2026-08-03) — aba "Time" agora exige departamento, não só
   cargo alto. Regra confirmada: só o ADM raiz (Hudson) vê a equipe
   sem restrição; todo mundo mais — mesmo com cargo de gerente/
   supervisor/representante/administrador — só vê o time depois que o
   ADM colocar essa pessoa num departamento especificamente. Antes,
   hasSupervisorAccess() (que também conta adminUI, ou seja, QUALQUER
   admin, não só o Hudson) já liberava a aba sozinho.
   Reaproveita LF_SCOPE_V2.resolveScope() — a mesma regra já usada pra
   leads/negócios/clientes (ALL=Hudson, DEPARTMENT=cargo alto+depto,
   SELF=resto) — em vez de duplicar a lógica aqui. Se a flag do
   LF_SCOPE_V2 estiver desligada (ou o módulo não tiver carregado),
   cai no comportamento antigo (hasSupervisorAccess sozinho), pra não
   esconder a aba de ninguém por acidente numa sessão sem o patch. */
function _lfTimeTabAllowed(){
  try{
    if(typeof LF_SCOPE_V2!=='undefined' && LF_SCOPE_V2.isEnabled()){
      var scope=LF_SCOPE_V2.resolveScope();
      return scope.mode==='ALL' || scope.mode==='DEPARTMENT';
    }
  }catch(_e){}
  return hasSupervisorAccess();
}

function buildNav(){
  var t=document.getElementById('ntabs');
  function tab(page,cls,label){
    return '<a class="nt'+(cls?' '+cls:'')+'" href="'+_lfPathForPage(page)+'" onclick="return _lfNavClick(event,\''+page+'\')">'+label+'</a>';
  }
  var bingo=tab('dash','','Bingo');
  var leads=tab('leads','','Leads');
  var negs=tab('negocios','','Neg\u00f3cios');
  var agenda=tab('agenda','','\uD83D\uDCC5 Agenda');
  var chat=tab('chat','','\uD83D\uDCAC Papo');
  var anal=tab('anal','','Analytics');
  var cfg=tab('config','','\u2699\uFE0F Config');
  var time=tab('time','','\uD83D\uDC65 Time');
  var adm=hasAdminAccess()?tab('adm','at','ADM'):'';
  var timeBtn=_lfTimeTabAllowed()?time:'';
  // Documentos, Estrutura da Empresa e Dispositivos conectados deixaram de ser abas
  // próprias no topo — agora vivem dentro da aba Config (ver settings-section
  // "🧩 Ferramentas" em pg-config), a pedido do usuário, para reduzir a quantidade
  // de abas na barra principal.
  // Todos recebem as tabs de consultor + extras por nível; ADM sempre ao final
  t.innerHTML=bingo+leads+negs+agenda+chat+timeBtn+anal+cfg+adm;
}

function goPage(p){
  if(!S)return;
  p=_lfNormalizeBootPage(p)||'dash';
  var _bootWarm=window.__LF_BOOT_WARM_STATE;
  var _preserveBootState=!!(_bootWarm&&!_bootWarm.consumed&&_bootWarm.targetPage===p);
  /* R16-03: cleanup da página de chat ao sair */
  if(p!=='chat'&&typeof destroyChatPage==='function')destroyChatPage();
  if(p==='adm'&&!hasAdminAccess())p='dash';
  if(p==='time'&&!_lfTimeTabAllowed())p='dash';
  var el=document.getElementById('pg-'+p);
  if(!el){console.warn('goPage: página não encontrada',p);return;}
  if(_lfUrlRoutingEnabled()){
    var _curPath=String(window.location.pathname||'').replace(/^\/+|\/+$/g,'');
    if(_curPath!==p)_lfSyncUrlForPage(p,true);
  }
  clearBulk();
  document.querySelectorAll('.pg').forEach(function(e){e.classList.remove('on');});
  document.querySelectorAll('.nt').forEach(function(e){e.classList.remove('on');});
  el.classList.add('on');
  document.querySelectorAll('.nt').forEach(function(b){
    var txt=b.textContent.trim();
    if(p==='dash'&&txt==='Bingo')b.classList.add('on');
    if(p==='anal'&&txt==='Analytics')b.classList.add('on');
    if(p==='adm'&&txt==='ADM')b.classList.add('on');
    if(p==='leads'&&txt==='Leads')b.classList.add('on');
    if(p==='negocios'&&txt.indexOf('gócio')>=0)b.classList.add('on');
    if(p==='agenda'&&txt.indexOf('Agenda')>=0)b.classList.add('on');
    if(p==='config'&&(txt.indexOf('Config')>=0||txt.indexOf('⚙')>=0))b.classList.add('on');
    if(p==='time'&&txt.indexOf('Time')>=0)b.classList.add('on');
    if(p==='chat'&&txt.indexOf('Papo')>=0)b.classList.add('on');
    if(p==='docs'&&txt.indexOf('Documentos')>=0)b.classList.add('on');
    if(p==='estrutura'&&txt.indexOf('Estrutura')>=0)b.classList.add('on');
  });
  var fab=document.getElementById('lig-fab');if(fab)fab.classList.toggle('v',p==='leads');
  var ap=document.getElementById('act-panel');if(ap)ap.classList.remove('open');
  if(p==='dash')_lfSafeCall(function(){renderDash();},'renderDash');
  if(p==='anal')_lfSafeCall(function(){
    loadCli(S.userId,function(l){drawAnal(l,'krow','funil','psvg','pleg');drawNegKPIs(S.userId,'krow2',(typeof _analyticsDateRange==='function')?_analyticsDateRange('krow'):null);});
    // [FIX 20260906] Força sincronização fresca do Kanban antes de
    // recalcular — sem isso, dados criados por outra pessoa (ex.:
    // importação em lote de um ADM pro supervisor) podiam ainda não
    // ter chegado no cache local de quem está vendo Analytics.
    ['leads','negocios'].forEach(function(board){
      if(typeof _syncKBRemoteBG==='function')_syncKBRemoteBG(board);
    });
    setTimeout(function(){
      if(document.getElementById('pg-anal')&&document.getElementById('pg-anal').classList.contains('on')){
        loadCli(S.userId,function(l){drawAnal(l,'krow','funil','psvg','pleg');drawNegKPIs(S.userId,'krow2',(typeof _analyticsDateRange==='function')?_analyticsDateRange('krow'):null);});
      }
    },2000);
  },'renderAnalytics');
  if(p==='adm')_lfSafeCall(function(){renderAdmPage();},'renderAdmPage');
  if(p==='time'){_lfSafeCall(function(){if(typeof renderTimePageAnalytics==='function')renderTimePageAnalytics();},'renderTimePageAnalytics');}
  if(p==='chat'){
    _lfSafeCall(function(){
      if(typeof initChatPage==='function'){
        initChatPage();
        if(_bootWarm&&!_bootWarm.chatApplied&&_bootWarm.chatConvId&&typeof openChatConv==='function'){
          setTimeout(function(){ try{ openChatConv(_bootWarm.chatConvId); _bootWarm.chatApplied=true; }catch(_e){} },60);
        }
      }else console.warn('chat module not loaded');
    },'initChatPage');
  }
  if(p==='leads'){
    if(!_kbNavFromAdm&&!_preserveBootState){_kbViewUid['leads']=null;}
    _kbNavFromAdm=false;
    renderKBConsBar('leads');renderKBLocal('leads');
    setTimeout(function(){renderKB('leads');},1500);
  }
  if(p==='negocios'){
    if(!_kbNavFromAdm&&!_preserveBootState){_kbViewUid['negocios']=null;}
    _kbNavFromAdm=false;
    renderKBConsBar('negocios');renderKBLocal('negocios');
    setTimeout(function(){renderKB('negocios');},1500);
  }
  if(p!=='leads'&&p!=='negocios')_kbNavFromAdm=false;
  if(p==='agenda')_lfSafeCall(function(){agdOpen();},'agdOpen');
  if(p==='estrutura')_lfSafeCall(function(){renderEstruturaPage();},'renderEstruturaPage');
  if(p==='config')_lfSafeCall(function(){renderConfig();},'renderConfig');
  if(p==='time')_lfSafeCall(function(){
    // Sempre abre Time na sub-aba Equipe e inicia sua carga de dados.
    // Não depende de o usuário clicar em outra sub-aba primeiro.
    var equipeBtn=document.querySelector('.time-tab');
    if(typeof timeGoTab==='function')timeGoTab('equipe',equipeBtn);
    else if(typeof renderTimePage==='function')renderTimePage();
  },'renderTimePage');
  if(p==='docs')_lfSafeCall(function(){renderUserDocsPage();},'renderUserDocsPage');
  try{ if(typeof mobileSyncChrome==='function')mobileSyncChrome(p); }catch(e){ console.warn('mobileSyncChrome(goPage)',e); }
  try{ _lfWriteWarmState(p,{reason:'goPage'}); }catch(_e){}
  if(_bootWarm&&_bootWarm.targetPage===p&&!_bootWarm.consumed)_bootWarm.consumed=true;
}



// =====================================================================
// CERT-11: Indicadores visuais de sincronização.
// syncBusy() — mostra spinner/dot no header indicando operação em curso
// syncOk()  — esconde o spinner, mostra estado OK
// syncErr() — esconde o spinner, mostra erro + toast
// =====================================================================
function syncBusy(){
  var dot=document.getElementById('sync-dot');
  if(dot)dot.className='sync-dot busy';
}
function syncOk(){
  var dot=document.getElementById('sync-dot');
  if(dot){dot.className='sync-dot ok';setTimeout(function(){if(dot.className==='sync-dot ok')dot.className='sync-dot';},2000);}
}
function syncErr(){
  var dot=document.getElementById('sync-dot');
  if(dot)dot.className='sync-dot err';
}

// =====================================================================
// CERT-12: Error boundary global — captura unhandledrejection e
// window.onerror para garantir que nenhum erro fique silencioso.
// =====================================================================
if(!window._lfErrBoundaryInstalled){
  window._lfErrBoundaryInstalled=true;
  // [FIX 20260912 — item 8 do plano de estabilidade] Antes, o erro só
  // aparecia num toast que sumia em 4s e num console.error que ninguém
  // vê em produção — sem persistir em lugar nenhum, um erro em
  // produção só chegava até nós via print de tela de quem estava
  // usando na hora. Agora também envia pro servidor (endpoint novo,
  // /api/v1/client-errors), visível numa tela de administração.
  var _lfErrSentRecently={};
  function _lfReportClientError(msg,stack){
    try{
      var key=String(msg||'').slice(0,120);
      var now=Date.now();
      if(_lfErrSentRecently[key]&&(now-_lfErrSentRecently[key])<60000)return; // no máximo 1x/min por mensagem — evita inundar em loop de erro
      _lfErrSentRecently[key]=now;
      var wc=(window.LiderCRM&&window.LiderCRM.api&&window.LiderCRM.api.workerClient)||null;
      if(!wc||typeof wc.request!=='function')return;
      var isCapacitor=!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
      wc.request('/client-errors',{method:'POST',body:{
        byName:(window.S&&window.S.nome)||'',
        message:String(msg||'').slice(0,500),
        stack:String(stack||'').slice(0,3000),
        url:String(location.href||'').slice(0,500),
        userAgent:String(navigator.userAgent||'').slice(0,300),
        platform:isCapacitor?'capacitor':'web',
        buildId:(window.LiderCRM&&window.LiderCRM.config&&window.LiderCRM.config.appVersion)||window.LF_CONFIG_VERSION||'',
        ts:new Date().toISOString()
      }}).catch(function(){}); // nunca deixa uma falha AO REPORTAR virar outro erro capturado (evitaria loop)
    }catch(_e){} // idem — proteção contra loop
  }
  window.addEventListener('unhandledrejection',function(ev){
    var reason=ev&&ev.reason;
    var msg=(reason&&reason.message)||String(reason||'unknown');
    console.error('[CRM] Unhandled promise rejection:',msg);
    try{toast('⚠️ Erro interno: '+msg.slice(0,80),4000);}catch(_e){}
    try{syncErr();}catch(_e){}
    _lfReportClientError(msg,reason&&reason.stack);
  });
  window.addEventListener('error',function(ev){
    var msg=(ev&&ev.error&&ev.error.message)||(ev&&ev.message)||'unknown';
    console.error('[CRM] Uncaught error:',msg,ev&&ev.filename,ev&&ev.lineno);
    try{toast('⚠️ Erro: '+msg.slice(0,80),4000);}catch(_e){}
    try{syncErr();}catch(_e){}
    _lfReportClientError(msg,ev&&ev.error&&ev.error.stack);
  });
}


// =====================================================================
// CERT-17: Capacitor Network listener — dispara sync ao voltar online.
// Em Capacitor/Android o evento 'online' do navegador nem sempre
// dispara corretamente. Usamos o plugin @capacitor/network quando
// disponível.
// =====================================================================

if(!window.__lfSoftResumeListeners){
  window.__lfSoftResumeListeners=1;
  window.addEventListener('online',function(){ _lfSoftResumeSync('browser-online'); },{passive:true});
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible') _lfDefer(function(){ _lfSoftResumeSync('visibility-visible'); },600); },{passive:true});
  window.addEventListener('pageshow',function(ev){ if(ev&&ev.persisted) _lfDefer(function(){ _lfSoftResumeSync('pageshow'); },400); },{passive:true});
}

/* CORREÇÃO 2026-08-17: além de atualizar ao voltar de segundo plano
   (bloco acima), supervisor/gerente/ADM que fica PARADO na aba Leads ou
   Negócios (sem trocar de aba, sem minimizar) também precisa ver
   mudanças do time sem precisar fazer nada — nem sair e voltar, nem
   relogar. A cada 45s (mesmo prazo do "estado quente" de navegação),
   se a pessoa está numa dessas duas páginas AGORA, busca de novo. Não
   roda em segundo plano (document.hidden) pra não gastar bateria/dados
   à toa numa aba que ninguém está olhando. */
/* [FIX 20260821] Era 45s — pedido explícito: acelerar o aparecimento no
   PC de ações feitas no app Capacitor (ex.: criar um lead no celular e
   ele só aparecer no PC depois de um F5 manual). Reduzido pra 15s — 3x
   mais rápido, ainda com as mesmas proteções de sempre (só roda com a
   aba visível e só na página de Leads/Negócios — não gasta nada à toa
   fora disso). Como _syncKBRemoteBG já só repinta a tela quando algo
   realmente mudou (correção de sessão anterior), rodar com mais
   frequência não aumenta o risco de piscar tela — só aumenta a chance
   de pegar uma mudança mais cedo. */
if(!window.__lfKanbanPollInstalled){
  window.__lfKanbanPollInstalled=1;
  setInterval(function(){
    try{
      if(!window.S||!window.S.userId)return;
      if(document.hidden)return;
      ['leads','negocios'].forEach(function(board){
        var pg=document.getElementById('pg-'+board);
        if(pg&&pg.classList.contains('on')&&typeof _syncKBRemoteBG==='function')_syncKBRemoteBG(board);
      });
    }catch(_e){}
  },(window.LiderCRM&&window.LiderCRM.config&&window.LiderCRM.config.sync&&Number(window.LiderCRM.config.sync.kanbanPollMs))||15000);
}

if(!window._capNetworkListener){
  window._capNetworkListener=true;
  try{
    var Cap=window.Capacitor;
    if(Cap&&Cap.Plugins&&Cap.Plugins.Network){
      /* CORREÇÃO 2026-08-05: toast "Conexão restaurada" aparecendo do
         nada ao gravar áudio no app nativo. Causa: pedir permissão de
         microfone abre o diálogo nativo do Android, que pausa/retoma o
         WebView — vários plugins (Network incluso) re-emitem o status
         atual ao retomar, mesmo sem NENHUMA mudança real de conexão.
         O listener disparava o toast em TODO evento com connected:true,
         sem checar se já estava online antes. Agora só considera
         "reconectou" numa transição de verdade (estava offline, ficou
         online) — guarda o último estado conhecido pra comparar. */
      var _lfLastNetConnected=null;
      Cap.Plugins.Network.addListener('networkStatusChange',function(status){
        var wasKnownOffline=(_lfLastNetConnected===false);
        var changed=(_lfLastNetConnected!==status.connected);
        _lfLastNetConnected=status.connected;
        if(status.connected){
          console.debug('[CRM] Network: online'+(changed?' (mudou)':' (sem mudança real)'));
          if(!changed)return; // status.connected:true de novo sem ter ficado offline antes — ignora
          try{syncOk();}catch(_e){}
          try{
            var root=window.LiderCRM;
            if(root&&root.offline&&root.offline.sync){
              root.offline.sync.drain();
            }
          }catch(e){console.warn('[CRM] sync.drain falhou',e);}
          if(wasKnownOffline){ try{toast('✅ Conexão restaurada — sincronizando...');}catch(_e){} }
        }else{
          console.debug('[CRM] Network: offline');
          try{toast('⚠️ Sem conexão — dados salvos localmente');}catch(_e){}
        }
      });
      console.debug('[CRM] Capacitor Network listener registrado');
    }
  }catch(e){console.warn('[CRM] Capacitor Network listener falhou',e);}
}

// =====================================================================
// CERT-18: Capacitor Back Button — intercepta o botão voltar do
// Android para fechar modais/painéis em vez de sair do app.
// =====================================================================
if(!window._capBackButtonListener){
  window._capBackButtonListener=true;
  try{
    var Cap2=window.Capacitor;
    if(Cap2&&Cap2.Plugins&&Cap2.Plugins.App){
      Cap2.Plugins.App.addListener('backButton',function(data){
        // Se há modal aberto, fecha o modal
        var openModals=document.querySelectorAll('.mo.open');
        if(openModals.length>0){
          var last=openModals[openModals.length-1];
          if(last&&typeof closeM==='function'){
            closeM(last.id);
            return;
          }
        }
        // Se há menu mobile aberto, fecha
        var drawer=document.getElementById('mobile-menu-drawer');
        if(drawer&&drawer.classList.contains('open')){
          drawer.classList.remove('open');
          return;
        }
        // Se há painel aberto (notificações, atividades), fecha
        var openPanels=document.querySelectorAll('.act-panel.open,#ntf-panel.open');
        if(openPanels.length>0){
          openPanels.forEach(function(p){p.classList.remove('open');});
          return;
        }
        // FIX (2026-08-02): antes, se nada acima estivesse aberto, o
        // evento não fazia nada e caía no comportamento padrão do
        // Capacitor — que, sem histórico de navegação do WebView pra
        // voltar, geralmente SAI do app. Isso incluía estar parado numa
        // aba como o Papo, sem nenhum modal/painel aberto: apertar
        // voltar saía do site inteiro em vez de voltar pro início.
        // Agora, se a aba atual não é a inicial (dash), volta pra ela
        // em vez de deixar cair no comportamento padrão.
        var curPg=document.querySelector('.pg.on');
        if(curPg&&curPg.id&&curPg.id!=='pg-dash'){
          try{
            if(typeof mobileGoPage==='function')mobileGoPage('dash');
            else if(typeof goPage==='function')goPage('dash');
          }catch(_e){}
          return;
        }
        // Se não há nada para fechar, deixa o app minimizar (comportamento padrão)
        // Não chama navigator.app.exitApp() — deixamos o usuário decidir
      });
      console.debug('[CRM] Capacitor backButton listener registrado');
    }
  }catch(e){console.warn('[CRM] Capacitor backButton listener falhou',e);}
}


// =====================================================================
// CERT-19: Keyboard listener — quando o teclado abre no Capacitor,
// rola o campo focado para visível. Previne campos escondidos pelo
// teclado em formulários longos.
// =====================================================================
if(!window._capKeyboardListener){
  window._capKeyboardListener=true;
  try{
    var CapK=window.Capacitor;
    if(CapK&&CapK.Plugins&&CapK.Plugins.Keyboard){
      CapK.Plugins.Keyboard.addListener('keyboardWillShow',function(info){
        // info.keyboardHeight pode ser usado para ajustar padding
        var focused=document.activeElement;
        if(focused&&focused.scrollIntoView){
          setTimeout(function(){
            focused.scrollIntoView({behavior:'smooth',block:'center'});
          },200);
        }
        // Adiciona classe ao body para CSS adjustments
        document.body.classList.add('lf-keyboard-open');
        // Atualiza --vvh para o viewport reduzido
        var vv=window.visualViewport;
        if(vv){
          document.documentElement.style.setProperty('--vvh',vv.height+'px');
        }
      });
      CapK.Plugins.Keyboard.addListener('keyboardWillHide',function(){
        document.body.classList.remove('lf-keyboard-open');
        var vv2=window.visualViewport;
        if(vv2){
          document.documentElement.style.setProperty('--vvh',vv2.height+'px');
        }
      });
      console.debug('[CRM] Capacitor Keyboard listeners registrados');
    }
  }catch(e){console.warn('[CRM] Keyboard listener falhou',e);}
}

// =====================================================================
// CERT-20: visualViewport resize — mantém --vvh atualizado quando o
// teclado aparece/desaparece. Crítico para position:fixed e bottom nav.
// =====================================================================
if(!window._vvpListener){
  window._vvpListener=true;
  if(window.visualViewport){
    // FIX-PERF-VVP: visualViewport dispara `resize` E `scroll` separadamente em
    // UMA única mudança de teclado (Android e iOS). Antes, o handler escrevia
    // 2 style.setProperty('--vvh'/'--lf-kb-height') POR atualização — cada write
    // invalida a :root e força o engine a revalidar todos os position:fixed da
    // página (ibar, toast, nav, modal). Em webview Android isso mediu 16ms→32ms
    // por evento durante o abrir do teclado, causando o "salto" da barra inferior.
    // Solução: coalescer p/ 1 frame + deduplicação por valor.
    var _vvpRAF=null,_vvpLastH=-1,_vvpLastKb=-1;
    function _updateVVP(){
      _vvpRAF=null;
       if(window.innerWidth>768)return;
      var h=Math.max(320,Math.round(window.visualViewport.height));
      var kbH=window.innerHeight-h;
      if(h===_vvpLastH && kbH===_vvpLastKb)return;
      _vvpLastH=h;_vvpLastKb=kbH;
      document.documentElement.style.setProperty('--vvh',h+'px');
      document.documentElement.style.setProperty('--lf-kb-height',(kbH>100?kbH:0)+'px');
    }
    window.visualViewport.addEventListener('resize',function(){if(_vvpRAF)return;_vvpRAF=requestAnimationFrame(_updateVVP);});
    window.visualViewport.addEventListener('scroll',function(){if(_vvpRAF)return;_vvpRAF=requestAnimationFrame(_updateVVP);});
    _updateVVP();
    console.debug('[CRM] visualViewport resize listener registrado');
  }
}

/* R15-08/R15-09: abrir página em NOVA GUIA do navegador com estado compartilhado
   - Web: abre diretamente `app.html?page=<page>` em nova aba nomeada.
   - O handoff usa o entrypoint completo; não há uma variante lite no fluxo.
   - Reuso: se a aba da mesma página já estiver aberta, só foca e roteia sem recarregar.
   - Capacitor Android/iOS: mantém fallback nativo atual, sem SharedWorker. */
function _lfPopupBasePath(fileName){
  var path=window.location.pathname||'/';
  var dir=path.replace(/[^/]*$/,'');
  return window.location.origin+dir+String(fileName||'app.html');
}
function openPageWindow(page){
  page=_lfNormalizeBootPage(page)||'dash';
  var handoff=_lfWriteWarmState(page,{reason:'open-page-window'});
  try{
    var _sd=window.LiderCRM&&window.LiderCRM.sharedData;
    if(_sd&&typeof _sd.publishMutation==='function'){
      _sd.publishMutation('page-handoff',{page:page,handoffId:handoff&&handoff.id||null,key:'lf_warm_state_v1'});
    }
  }catch(_e){}
  var popupUrl=_lfPopupBasePath('index.html')+'?page='+encodeURIComponent(page);
  if(handoff&&handoff.id) popupUrl+='&handoff='+encodeURIComponent(handoff.id);
  var nativeUrl=(window.location.origin+window.location.pathname)+'?page='+encodeURIComponent(page);
  try{
    var isNative=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
    if(isNative){
      var Plugins=(window.Capacitor&&window.Capacitor.Plugins)||null;
      if(Plugins&&Plugins.Browser&&typeof Plugins.Browser.open==='function'){
        Plugins.Browser.open({url:nativeUrl,presentationStyle:'popover'});
        return;
      }
      window.location.href=nativeUrl;
      return;
    }
  }catch(_nativeErr){}
  var childName='lf_child_'+page;
  window.__LF_CHILD_WINDOWS__=window.__LF_CHILD_WINDOWS__||{};
  var existing=window.__LF_CHILD_WINDOWS__[childName];
  try{
    if(existing&&!existing.closed&&typeof existing.__lfFocusPage==='function'){
      if(existing.__lfFocusPage(page,handoff&&handoff.id)){
        try{existing.focus();}catch(_focusErr){}
        return existing;
      }
    }
  }catch(_reuseErr){}
  // Sem 3º argumento de features → navegador abre em NOVA GUIA (e não em nova janela/popup).
  // O `childName` como target ainda permite reusar a aba já aberta da mesma página.
  var w=window.open(popupUrl,childName);
  if(w){
    window.__LF_CHILD_WINDOWS__[childName]=w;
    try{w.focus();}catch(_focusErr2){}
    return w;
  }
  window.location.href=popupUrl;
  return null;
}
function openInNewTab(page){
  return openPageWindow(page);
}
// Detecta parâmetro ?page= na URL para abrir direto numa aba específica
(function(){
  try{
    var p=_lfGetBootTargetPage();
    if(_lfNormalizeBootPage(p)){
      window.__LF_BOOT_ROUTE_PENDING=p;
      if(window.S&&typeof goPage==='function'&&document.getElementById('app')&&document.getElementById('app').classList.contains('vis')){
        goPage(p);
      }
    }
  }catch(e){}
})();
