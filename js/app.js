/* =====================================================================
 * app.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

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
}


function bootApp(){
  try{localStorage.setItem('lf_app_ver','lf_v13');}catch(e){console.warn("app: localStorage write failed",e);}
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

  goPage('dash');
  requestAnimationFrame(function(){if(!document.querySelector('.pg.on'))goPage('dash');});
  setTimeout(function(){if(document.getElementById('app')&&!document.querySelector('.pg.on'))goPage('dash');},120);

  _lfAfterFirstPaint(function(){
    _lfSafeCall(function(){ if(typeof loadSavedFiltersRemote==='function')loadSavedFiltersRemote(); },'loadSavedFiltersRemote');
    _lfSafeCall(function(){ _lfLoadDepartmentsRemoteSafe(function(){}); },'loadDepartmentsRemote');
    _lfSafeCall(function(){ if(typeof registerDeviceSession==='function')registerDeviceSession(); },'registerDeviceSession');
    _lfSafeCall(function(){
      if(window._sessInterval)clearInterval(window._sessInterval);
      if(typeof _sessionsHeartbeat==='function')window._sessInterval=setInterval(_sessionsHeartbeat,120000);
    },'_sessionsHeartbeat interval');
    _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof checkUpcomingActs==='function')checkUpcomingActs(); }catch(_e){} },1200); if(window._actInterval)clearInterval(window._actInterval); if(typeof checkUpcomingActs==='function')window._actInterval=setInterval(checkUpcomingActs,60000); },'activities interval');
    _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof requestNotifPermission==='function')requestNotifPermission(); }catch(_e){} },2000); },'requestNotifPermission');
    _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof setupPushNotifications==='function')setupPushNotifications(); }catch(_e){} },2200); },'setupPushNotifications');
    _lfSafeCall(function(){ if(typeof loadNotifsRemote==='function')loadNotifsRemote(function(){ try{ if(typeof updateNotifBadge==='function')updateNotifBadge(); }catch(_e){} }); if(window._ntfInterval)clearInterval(window._ntfInterval); if(typeof loadNotifsRemote==='function')window._ntfInterval=setInterval(function(){loadNotifsRemote(function(){ try{ if(typeof updateNotifBadge==='function')updateNotifBadge(); }catch(_e){} });},60000); },'loadNotifsRemote');
    _lfSafeCall(function(){ setTimeout(function(){ try{ if(typeof _runAutomationEngineBoot==='function')_runAutomationEngineBoot(); }catch(_e){} },1500); if(window._autoEngineInterval)clearInterval(window._autoEngineInterval); if(typeof _runAutomationEngineBoot==='function')window._autoEngineInterval=setInterval(_runAutomationEngineBoot,300000); },'automation');
    _lfSafeCall(function(){ if(S&&S.userId&&typeof logFeedEvent==='function')logFeedEvent('login',S.userId,(S.nome||'Usuário'),'entrou',''); },'logFeedEvent');
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
function buildNav(){
  var t=document.getElementById('ntabs');
  var bingo='<button class="nt" onclick="goPage(\'dash\')">Bingo</button>';
  var leads='<button class="nt" onclick="goPage(\'leads\')">Leads</button>';
  var negs='<button class="nt" onclick="goPage(\'negocios\')">Neg\u00f3cios</button>';
  var agenda='<button class="nt" onclick="goPage(\'agenda\')">\uD83D\uDCC5 Agenda</button>';
  var chat='<button class="nt" onclick="goPage(\'chat\')">\uD83D\uDCAC Papo</button>';
  var anal='<button class="nt" onclick="goPage(\'anal\')">Analytics</button>';
  var dic='<button class="nt" onclick="goPage(\'dic\')">Dicion\u00e1rio</button>';
  var cfg='<button class="nt" onclick="goPage(\'config\')">\u2699\uFE0F Config</button>';
  var time='<button class="nt" onclick="goPage(\'time\')">\uD83D\uDC65 Time</button>';
  var adm=hasAdminAccess()?'<button class="nt at" onclick="goPage(\'adm\')">ADM</button>':'';
  var timeBtn=hasSupervisorAccess()?time:'';
  // Documentos, Estrutura da Empresa e Dispositivos conectados deixaram de ser abas
  // próprias no topo — agora vivem dentro da aba Config (ver settings-section
  // "🧩 Ferramentas" em pg-config), a pedido do usuário, para reduzir a quantidade
  // de abas na barra principal.
  // Todos recebem as tabs de consultor + extras por nível; ADM sempre ao final
  t.innerHTML=bingo+leads+negs+agenda+chat+timeBtn+anal+dic+cfg+adm;
}

function goPage(p){
  if(!S)return;
  /* R16-03: cleanup da página de chat ao sair */
  if(p!=='chat'&&typeof destroyChatPage==='function')destroyChatPage();
  if(p==='adm'&&!hasAdminAccess())p='dash';
  if(p==='time'&&!hasSupervisorAccess())p='dash';
  var el=document.getElementById('pg-'+p);
  if(!el){console.warn('goPage: página não encontrada',p);return;}
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
    if(p==='negocios'&&txt.indexOf('g\u00f3cio')>=0)b.classList.add('on');
    if(p==='agenda'&&txt.indexOf('Agenda')>=0)b.classList.add('on');
    if(p==='dic'&&txt.indexOf('icion')>=0)b.classList.add('on');
    if(p==='config'&&(txt.indexOf('Config')>=0||txt.indexOf('\u2699')>=0))b.classList.add('on');
    if(p==='time'&&txt.indexOf('Time')>=0)b.classList.add('on');
    if(p==='chat'&&txt.indexOf('Papo')>=0)b.classList.add('on');
    if(p==='docs'&&txt.indexOf('Documentos')>=0)b.classList.add('on');
    if(p==='estrutura'&&txt.indexOf('Estrutura')>=0)b.classList.add('on');
  });
  var fab=document.getElementById('lig-fab');if(fab)fab.classList.toggle('v',p==='leads');
  var ap=document.getElementById('act-panel');if(ap)ap.classList.remove('open');
  if(p==='dash')_lfSafeCall(function(){renderDash();},'renderDash');
  if(p==='anal')_lfSafeCall(function(){loadCli(S.userId,function(l){drawAnal(l,'krow','funil','psvg','pleg','metas');drawNegKPIs(S.userId);});},'renderAnalytics');
  if(p==='adm')_lfSafeCall(function(){renderAdmPage();},'renderAdmPage');
  if(p==='time'){_lfSafeCall(function(){if(typeof renderTimePageAnalytics==='function')renderTimePageAnalytics();},'renderTimePageAnalytics');}
  if(p==='chat'){_lfSafeCall(function(){if(typeof initChatPage==='function')initChatPage();else console.warn('chat module not loaded');},'initChatPage');}
  if(p==='leads'){
    // Só reseta o filtro de consultor se veio do menu (não de admViewBoard).
    // admViewBoard define _kbViewUid ANTES de chamar goPage, então se for diferente
    // de null quando chega aqui por menu-direto, força reset para "Todos".
    if(!_kbNavFromAdm){_kbViewUid['leads']=null;}
    _kbNavFromAdm=false;
    renderKBConsBar('leads');renderKBLocal('leads');
    // Sync silencioso em background — atualiza dados de outros dispositivos sem travar a UI
    setTimeout(function(){renderKB('leads');},1500);
  }
  if(p==='negocios'){
    if(!_kbNavFromAdm){_kbViewUid['negocios']=null;}
    _kbNavFromAdm=false;
    renderKBConsBar('negocios');renderKBLocal('negocios');
    setTimeout(function(){renderKB('negocios');},1500);
  }
  // Garante reset da flag mesmo ao navegar para outras páginas (não-kanban)
  if(p!=='leads'&&p!=='negocios')_kbNavFromAdm=false;
  if(p==='agenda')_lfSafeCall(function(){agdOpen();},'agdOpen');
  if(p==='estrutura')_lfSafeCall(function(){renderEstruturaPage();},'renderEstruturaPage');
  if(p==='dic')_lfSafeCall(function(){dicInit();},'dicInit');
  if(p==='config')_lfSafeCall(function(){renderConfig();},'renderConfig');
  if(p==='time')_lfSafeCall(function(){renderTimePage();},'renderTimePage');
  if(p==='docs')_lfSafeCall(function(){renderUserDocsPage();},'renderUserDocsPage');
  try{ if(typeof mobileSyncChrome==='function')mobileSyncChrome(p); }catch(e){ console.warn('mobileSyncChrome(goPage)',e); }
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
  // FIX (2026-07-23): reseta flag global de health assim que 1 request volta
  // OK — corrige caso o ping tenha marcado offline por lentidão momentânea.
  try{ window.__LF_HEALTH_OK = true; }catch(_e){}
}
function syncErr(err){
  var dot=document.getElementById('sync-dot');
  if(dot)dot.className='sync-dot err';
  // FIX (2026-07-23): silencia toast de erro quando o dado JÁ FOI salvo
  // localmente e o problema é só rede (internet ruim / worker fora).
  // O RetryQueue vai reenviar quando voltar. Toast agressivo em cada
  // digitação em zona 3G quebrava a UX (edição de leads próprios travava
  // com "⚠️ Falha ao sincronizar" toda hora). Agora só marca o dot
  // vermelho — o usuário continua digitando sem interrupção.
  try{
    var isNet = err && (err.status===0 || err.status===408 || err.status===502 || err.status===503 || err.status===504 ||
                        (err.details && (err.details.code==='NETWORK_ERROR' || err.details.code==='REQUEST_TIMEOUT')));
    if(isNet){ window.__LF_HEALTH_OK = false; return; } // silencioso — RetryQueue cuida
  }catch(_e){}
}

// =====================================================================
// CERT-12: Error boundary global — captura unhandledrejection e
// window.onerror para garantir que nenhum erro fique silencioso.
// =====================================================================
if(!window._lfErrBoundaryInstalled){
  window._lfErrBoundaryInstalled=true;
  // FIX (2026-07-23): filtra erros de rede transientes (fetch abortado,
  // NetworkError, TypeError "Failed to fetch") para NUNCA popup em internet ruim.
  function _isNetworkNoise(msg){
    var s=String(msg||'').toLowerCase();
    return s.indexOf('failed to fetch')>=0 || s.indexOf('networkerror')>=0 ||
           s.indexOf('load failed')>=0 || s.indexOf('abort')>=0 ||
           s.indexOf('timeout')>=0 || s.indexOf('tempo limite')>=0 ||
           s.indexOf('network')>=0 || s.indexOf('http 0')>=0 ||
           s.indexOf('http 502')>=0 || s.indexOf('http 503')>=0 || s.indexOf('http 504')>=0;
  }
  window.addEventListener('unhandledrejection',function(ev){
    var reason=ev&&ev.reason;
    var msg=(reason&&reason.message)||String(reason||'unknown');
    if(_isNetworkNoise(msg)){
      // internet ruim — apenas marca sync com erro; RetryQueue reenvia.
      try{ window.__LF_HEALTH_OK = false; syncErr(reason); }catch(_e){}
      try{ ev.preventDefault && ev.preventDefault(); }catch(_e){}
      return;
    }
    console.error('[CRM] Unhandled promise rejection:',msg);
    try{toast('⚠️ Erro interno: '+msg.slice(0,80),4000);}catch(_e){}
    try{syncErr(reason);}catch(_e){}
  });
  window.addEventListener('error',function(ev){
    var msg=(ev&&ev.error&&ev.error.message)||(ev&&ev.message)||'unknown';
    if(_isNetworkNoise(msg)){ try{ window.__LF_HEALTH_OK=false; }catch(_e){} return; }
    console.error('[CRM] Uncaught error:',msg,ev&&ev.filename,ev&&ev.lineno);
    try{toast('⚠️ Erro: '+msg.slice(0,80),4000);}catch(_e){}
    try{syncErr(ev&&ev.error);}catch(_e){}
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

if(!window._capNetworkListener){
  window._capNetworkListener=true;
  try{
    var Cap=window.Capacitor;
    if(Cap&&Cap.Plugins&&Cap.Plugins.Network){
      Cap.Plugins.Network.addListener('networkStatusChange',function(status){
        if(status.connected){
          console.debug('[CRM] Network: online — disparando sync');
          try{syncOk();}catch(_e){}
          try{
            var root=window.LiderCRM;
            if(root&&root.offline&&root.offline.sync){
              root.offline.sync.drain();
            }
          }catch(e){console.warn('[CRM] sync.drain falhou',e);}
          try{toast('✅ Conexão restaurada — sincronizando...');}catch(_e){}
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
        // Se há painel aberto (notificações, atividades), fecha
        var openPanels=document.querySelectorAll('.act-panel.open,#ntf-panel.open');
        if(openPanels.length>0){
          openPanels.forEach(function(p){p.classList.remove('open');});
          return;
        }
        // Se há menu mobile aberto, fecha
        var drawer=document.getElementById('mobile-menu-drawer');
        if(drawer&&drawer.classList.contains('open')){
          drawer.classList.remove('open');
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
    var _updateVVP=function(){
      var h=Math.max(320,Math.round(window.visualViewport.height));
      document.documentElement.style.setProperty('--vvh',h+'px');
      // Ajusta também variável de teclado para CSS
      var kbH=window.innerHeight-h;
      if(kbH>100){
        document.documentElement.style.setProperty('--lf-kb-height',kbH+'px');
      }else{
        document.documentElement.style.setProperty('--lf-kb-height','0px');
      }
    };
    window.visualViewport.addEventListener('resize',_updateVVP);
    window.visualViewport.addEventListener('scroll',_updateVVP);
    _updateVVP();
    console.debug('[CRM] visualViewport resize listener registrado');
  }
}

/* R15-08: abrir em nova guia
   FIX Capacitor: window.open('_blank') falha silenciosamente no Android WebView.
   Usa @capacitor/browser quando disponível; senão window.open com fallback. */
function openInNewTab(page){
  var url=window.location.origin+window.location.pathname+'?page='+page;
  try{
    var isNative=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
    if(isNative){
      var Plugins=(window.Capacitor&&window.Capacitor.Plugins)||null;
      if(Plugins&&Plugins.Browser&&typeof Plugins.Browser.open==='function'){
        Plugins.Browser.open({url:url,presentationStyle:'popover'});
        return;
      }
      // fallback: navega na mesma webview (melhor que silenciar)
      window.location.href=url;
      return;
    }
  }catch(_e){}
  var w=window.open(url,'_blank','noopener,noreferrer');
  if(!w){window.location.href=url;}
}
// Detecta parâmetro ?page= na URL para abrir direto numa aba específica
(function(){
  try{
    var params=new URLSearchParams(window.location.search);
    var p=params.get('page');
    if(p&&['dash','anal','adm','leads','negocios','agenda','time','config','docs','estrutura','chat','dic'].indexOf(p)>=0){
      setTimeout(function(){if(typeof goPage==='function')goPage(p);},800);
    }
  }catch(e){}
})();
