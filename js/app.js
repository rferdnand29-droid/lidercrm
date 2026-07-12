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
function bootApp(){
  try{localStorage.setItem('lf_app_ver','lf_v13');}catch(e){}getUsers();
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
    loadUsersDB(function(){try{renderUsers();}catch(e){}});
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
  // CORREÇÃO (bug "tela Início em branco"): antes, se QUALQUER uma das chamadas abaixo
  // (buildNav/loadBGRemote/initLigWidget/etc.) lançasse uma exceção síncrona — por exemplo
  // por causa de falha de conexão/permissão com o Firebase — o restante da função startApp()
  // parava de executar ali mesmo, e junto com ela o goPage('dash') (e até as suas próprias
  // redes de segurança, que ficavam DEPOIS do ponto que travou) nunca rodavam. O menu
  // aparecia (é HTML estático), mas a área de conteúdo ficava em branco pra sempre. Agora
  // cada etapa roda dentro de try/catch isolado: uma falha em qualquer uma delas é só
  // logada no console, sem impedir as demais nem o goPage('dash') final de rodar.
  try{buildNav();}catch(e){console.error('buildNav',e);}
  try{
    // CORREÇÃO "CAPA NÃO SALVA UNIVERSAL": busca o fundo/capa salvo na nuvem pra este usuário
    // antes de aplicar, assim um dispositivo novo mostra a mesma capa configurada em outro.
    loadBGRemote(S.userId,function(){applyBG(sg('lf13_bg_'+S.userId)||'default');});
  }catch(e){console.error('loadBGRemote',e);}
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
  try{initLigWidget();}catch(e){console.error('initLigWidget',e);}
  try{loadSavedFiltersRemote();}catch(e){console.error('loadSavedFiltersRemote',e);}
  try{registerDeviceSession();}catch(e){console.error('registerDeviceSession',e);}
  try{
    if(window._sessInterval)clearInterval(window._sessInterval);window._sessInterval=setInterval(_sessionsHeartbeat,120000);
    setTimeout(checkUpcomingActs,1200);if(window._actInterval)clearInterval(window._actInterval);window._actInterval=setInterval(checkUpcomingActs,60000);
    setTimeout(requestNotifPermission,2000);
    setTimeout(setupPushNotifications,2200); // registra/atualiza o token de push deste usuário/aparelho
    loadNotifsRemote(function(){updateNotifBadge();});
    if(window._ntfInterval)clearInterval(window._ntfInterval);window._ntfInterval=setInterval(function(){loadNotifsRemote(function(){updateNotifBadge();});},60000);
    setTimeout(_runAutomationEngineBoot,1500);
    if(window._autoEngineInterval)clearInterval(window._autoEngineInterval);window._autoEngineInterval=setInterval(_runAutomationEngineBoot,300000);
    logFeedEvent('login',S.userId,S.nome,'entrou','');
  }catch(e){console.error('startApp intervals/log',e);}
  goPage('dash'); // mostra a primeira aba imediatamente e evita tela preta inicial
  requestAnimationFrame(function(){if(!document.querySelector('.pg.on'))goPage('dash');});
  setTimeout(function(){if(document.getElementById('app')&& !document.querySelector('.pg.on'))goPage('dash');},120);
  // Aplica logo customizada salva pelo ADM (ou a oficial, se nenhuma foi definida).
  // CORREÇÃO "LOGO NÃO SALVA UNIVERSAL": busca a versão mais recente na nuvem (loadLogoRemote)
  // em vez de confiar só no que já estava em localStorage neste aparelho — assim um
  // dispositivo novo mostra a mesma logo configurada pelo ADM em qualquer outro lugar.
  requestAnimationFrame(function(){loadLogoRemote(function(savedLogo){applyCustomLogo(savedLogo);});});
  // Aplica o nome do CRM customizado pelo ADM (texto ou imagem), ou "LIDER CRM" padrão.
  requestAnimationFrame(function(){loadCRMNameRemote(function(saved){applyCRMBranding(saved&&saved.name,saved&&saved.img);if(saved&&saved.name){var inp=document.getElementById('cfg-crm-name-input');if(inp)inp.value=saved.name;}});});
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
  t.innerHTML=bingo+leads+negs+agenda+timeBtn+anal+dic+cfg+adm;
}

function goPage(p){
  if(!S)return;
  if(p==='adm'&&!hasAdminAccess())p='dash';
  if(p==='time'&&!hasSupervisorAccess())p='dash';
  clearBulk();
  document.querySelectorAll('.pg').forEach(function(e){e.classList.remove('on');});
  document.querySelectorAll('.nt').forEach(function(e){e.classList.remove('on');});
  var el=document.getElementById('pg-'+p);if(!el)return;el.classList.add('on');
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
    if(p==='docs'&&txt.indexOf('Documentos')>=0)b.classList.add('on');
    if(p==='estrutura'&&txt.indexOf('Estrutura')>=0)b.classList.add('on');
  });
  var fab=document.getElementById('lig-fab');if(fab)fab.classList.toggle('v',p==='leads');
  var ap=document.getElementById('act-panel');if(ap)ap.classList.remove('open');
  if(p==='dash')renderDash();
  if(p==='anal')loadCli(S.userId,function(l){drawAnal(l,'krow','funil','psvg','pleg','metas');drawNegKPIs(S.userId);});
  if(p==='adm')renderAdmPage();
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
  if(p==='agenda')agdOpen();
  if(p==='estrutura')renderEstruturaPage();
  if(p==='dic')dicInit();
    if(p==='config')renderConfig();
  if(p==='time')renderTimePage();
  if(p==='docs')renderUserDocsPage();
  mobileSyncChrome(p);
}
