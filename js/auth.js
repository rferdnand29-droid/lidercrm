/* =====================================================================
 * auth.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

function sh(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);return(h>>>0).toString(36);}

/* Correção de segurança: sh() (DJB2, 32 bits, sem salt) não é adequado pra
   senha — é reversível por força bruta em segundos. Mantido só como formato
   legado para não travar contas já cadastradas antes desta correção.
   shSecure()/verifyPw() usam SHA-256 com salt aleatório por usuário via
   Web Crypto API. Formato salvo: "s2$<saltHex>$<hashHex>". */
function _bufToHex(buf){return Array.prototype.map.call(new Uint8Array(buf),function(b){return b.toString(16).padStart(2,'0');}).join('');}

function shSecure(pw){
  if(!(window.crypto&&crypto.subtle&&crypto.getRandomValues)){
    // Contexto sem Web Crypto (ex.: http:// não-seguro): usa o hash antigo
    // em vez de quebrar cadastro/login. Migra assim que possível.
    return Promise.resolve(sh(pw));
  }
  var saltHex=_bufToHex(crypto.getRandomValues(new Uint8Array(16)));
  var enc=new TextEncoder().encode(saltHex+':'+pw);
  return crypto.subtle.digest('SHA-256',enc).then(function(buf){return 's2$'+saltHex+'$'+_bufToHex(buf);});
}

function verifyPw(u,pw){
  var ph=(u&&u.ph)||'';
  if(ph.indexOf('s2$')===0){
    if(!(window.crypto&&crypto.subtle))return Promise.reject(new Error('crypto_unavailable'));
    var parts=ph.split('$'),saltHex=parts[1],hashHex=parts[2];
    var enc=new TextEncoder().encode(saltHex+':'+pw);
    return crypto.subtle.digest('SHA-256',enc).then(function(buf){return _bufToHex(buf)===hashHex;});
  }
  // Formato legado (DJB2) — aceito só pra permitir o upgrade automático
  // no primeiro login de contas criadas antes desta correção.
  return Promise.resolve(sh(pw)===ph);
}

// ============================================================
// PERMISSOES CENTRALIZADAS (TAREFA 4)
// Qualquer cargo cujo texto contenha uma destas palavras passa a ter
// o MESMO nivel de acesso do Administrador (telas, relatorios,
// edicao de outros usuarios). Para dar acesso de admin a um novo
// cargo no futuro, basta acrescentar a palavra aqui — nao espalhe
// "if(S.role==='adm')" pelo resto do codigo.
//
// ATUALIZACAO (hierarquia de cargos): Supervisor deixou de ter acesso
// total de ADM. Agora SOMENTE Gerente (e os sinonimos "Gestor",
// "Representante" e "Master") tem acesso administrativo completo.
// Supervisor passou a ser um nivel intermediario com acesso de "Time"
// (ve a equipe, mas nao gerencia usuarios nem ve metricas/feed globais).
// "Funcionário" fica no nivel basico (igual Consultor), sem funções de ADM.
//
// ATUALIZACAO 2 (pedido do usuario — Orientador = Supervisor): Orientador
// deixou de ser um nivel intermediario proprio (que so via os "orientados"
// configurados em u.orientadosIds) e passou a ser tratado como SINONIMO DE
// SUPERVISOR — mesmo nivel (3), mesmas telas, mesma visao de equipe completa
// (sem filtro por orientadosIds) e mesma ausencia de painel ADM. Feito aqui,
// na fonte de verdade (CARGO_NIVEIS), entao hasSupervisorAccess() e
// getVisibleOwnerIds() (patch v22) ja passam a tratar Orientador exatamente
// como Supervisor automaticamente, sem precisar mexer em cada tela.
// hasOrientadorAccess() (mais abaixo) fica sem efeito pratico, pois nenhum
// cargo mapeia mais para o nivel 2 — mantida so por compatibilidade com
// patches antigos que a chamam com verificacao typeof.
// ============================================================
var CARGOS_NIVEL_ADMIN=['gerente','gestor','representante','master'];

// Hierarquia de cargos. Quanto maior o nivel, mais acesso.
// 1=Consultor/Funcionário, 2=(nao usado mais — ver nota acima),
// 3=Supervisor e Orientador (mesmas funcoes: ve a equipe do mesmo time,
// mas SEM painel ADM),
// 4=Gerente/Gestor/Representante/Master (acesso total, igual ADM), 5=ADM (nivel maximo).
var CARGO_NIVEIS=[
  {nivel:1,match:['consultor','funcionário','funcionario']},
  {nivel:3,match:['supervisor','orientador']},
  {nivel:4,match:['gerente','gestor','representante','master']}
];

/* Retorna o nivel numerico do cargo do usuario. ADM sempre é o nível máximo (5).
   Cargos nao reconhecidos caem no nivel 1 (acesso basico), por seguranca. */
function getCargoNivel(uid){
  uid=uid||(S?S.userId:null);if(!uid)return 1;
  if(uid==='adm')return 5;
  var u=getUser(uid);
  if(!u){
    // CORREÇÃO (2026-07-17f): mesmo motivo do hasAdminAccess() acima — sem
    // cache local ainda, usa o role já confirmado pelo login (S.role) em
    // vez de cair no nível básico (1) por padrão.
    if(S&&S.userId===uid&&S.role==='adm')return 5;
    return 1;
  }
  if(u.role==='adm')return 5;
  var c=(u.cargo||'').toLowerCase();
  for(var i=CARGO_NIVEIS.length-1;i>=0;i--){
    if(CARGO_NIVEIS[i].match.some(function(k){return c.indexOf(k)>=0;}))return CARGO_NIVEIS[i].nivel;
  }
  return 1;
}

/* true para Supervisor, Gerente e ADM (nivel >= 3). Usado para a aba "Time" e para
   permissoes intermediarias (ex: reatribuir agendamentos) que o Supervisor tambem tem. */
function hasSupervisorAccess(uid){return getCargoNivel(uid)>=3;}

/* HISTORICO: Orientador já foi um nivel intermediário próprio (entre
   Consultor=1 e Supervisor=3), com acesso limitado aos "orientados"
   configurados em u.orientadosIds[].
   ATUALIZACAO (pedido do usuario): Orientador agora tem as MESMAS funções
   de Supervisor — CARGO_NIVEIS mapeia 'orientador' direto pro nivel 3 (ver
   acima), então hasSupervisorAccess() já retorna true pra Orientador e
   getVisibleOwnerIds() (patch v22) já retorna "sem filtro" (vê a equipe
   inteira, não só orientadosIds) antes mesmo de chegar aqui.
   Por isso esta função nunca mais retorna true na prática (nenhum cargo
   mapeia pro nivel 2) — mantida apenas para não quebrar patches antigos que
   a chamam com verificação typeof==='function'. */
function hasOrientadorAccess(uid){
  uid=uid||(S?S.userId:null);if(!uid)return false;
  if(uid==='adm')return false;
  var u=getUser(uid);if(!u)return false;
  if(u.role==='adm')return false;
  return getCargoNivel(uid)===2;
}

/* Retorna a lista (sempre array) de UIDs que ESTE usuario orienta.
   Lê o campo u.orientadosIds salvo no doc local. Se vazio, retorna []. */
function getOrientadosIds(uid){
  uid=uid||(S?S.userId:null);if(!uid)return [];
  var u=getUser(uid);if(!u)return [];
  var arr=Array.isArray(u.orientadosIds)?u.orientadosIds:[];
  return arr.filter(Boolean);
}

/* Filtro utilitario: dado um array de objetos com .ownerId ou .uid,
   retorna so os que pertencem ao proprio usuario OU aos que ele orienta. */
function filterItemsForOrientador(items){
  if(!Array.isArray(items))return [];
  var myId=(S&&S.userId)||null;
  var orIds=getOrientadosIds(myId);
  if(!orIds.length)return items.filter(function(x){return x&&(x.ownerId===myId||x.uid===myId);});
  var allow=orIds.concat([myId]);
  return items.filter(function(x){return x&&allow.indexOf(x.ownerId||x.uid)>=0;});
}


function hasAdminAccess(uid){
  uid=uid||(S?S.userId:null);if(!uid)return false;
  if(uid==='adm')return true;
  var u=getUser(uid);
  if(!u){
    // CORREÇÃO (2026-07-17f): logo após um login novo (doLogin), a lista
    // local de usuários (lf6_u) ainda pode não ter sido baixada da nuvem
    // (loadUsersDB roda em paralelo/depois) — getUser(uid) retornava null
    // e hasAdminAccess() negava acesso de ADM mesmo pra quem tinha acabado
    // de logar como ADM de verdade (o Worker já confirmou isso no JWT).
    // Agora, sem registro local ainda, confiamos no role que já veio do
    // login (S.role) em vez de negar acesso por falta de cache.
    if(S&&S.userId===uid&&S.role==='adm')return true;
    return false;
  }
  if(u.role==='adm')return true;
  // BUG CORRIGIDO (Tarefa 4): o checkbox "Ativar acesso ao Painel ADM" (eu-admin-check /
  // k-admin-check), mostrado para Supervisor, nunca era lido ao salvar nem consultado aqui —
  // marcar a caixa e clicar em Salvar não tinha efeito nenhum. Agora u.admExtra é persistido
  // (ver saveEditUser/saveCredCargo) e consultado antes do cargo.
  if(u.admExtra)return true;
  var c=(u.cargo||'').toLowerCase();
  return CARGOS_NIVEL_ADMIN.some(function(k){return c.indexOf(k)>=0;});
}

function toggleAdminNote(selId,noteId){
  var sel=document.getElementById(selId),note=document.getElementById(noteId);if(!sel||!note)return;
  var c=(sel.value||'').toLowerCase();
  var isAdmin=CARGOS_NIVEL_ADMIN.some(function(k){return c.indexOf(k)>=0;});
  // Orientador agora tem exatamente as mesmas funções de Supervisor (pedido
  // do usuário) — trata os dois como o mesmo caso aqui na nota informativa,
  // senão a tela de edição mostraria "sem nota" pra Orientador mesmo com
  // acesso de equipe igual ao Supervisor.
  var isSupervisor=!isAdmin&&(c.indexOf('supervisor')>=0||c.indexOf('orientador')>=0);
  var adminToggle=document.getElementById(selId==='k-cargo'?'k-admin-toggle':'eu-admin-toggle');
  if(adminToggle)adminToggle.style.display=(isAdmin||isSupervisor)?'block':'none';
  if(isAdmin){
    note.style.display='block';
    note.innerHTML='&#128737; Este cargo tem acesso ao Painel ADM (métricas, usuários, feed), igual ao Gerente. As funções de consultor continuam normalmente.';
  }else if(isSupervisor){
    note.style.display='block';
    note.innerHTML='&#128065; Cargo Supervisor/Orientador: vê leads e negócios da equipe (aba Time), mas NÃO acessa o painel ADM.';
  }else{
    note.style.display='none';
  }
}

/* CORREÇÃO DE LENTIDÃO (mesmo princípio já aplicado à movimentação de cards no Kanban):
   antes, TODA busca/filtro/troca de aba na tela de Clientes esperava uma ida-e-volta ao
   Firestore antes de desenhar qualquer coisa — cada letra digitada na busca disparava uma
   consulta de rede, deixando a digitação "engasgada". Agora loadCli() é local-first: desenha
   IMEDIATAMENTE com o que já está salvo neste aparelho (instantâneo, sem rede) e, se estiver
   em modo nuvem, busca a versão mais recente em segundo plano e redesenha de novo somente
   quando a resposta chegar — sem bloquear a tela nem a digitação. */
// FASE 3.3 (parte 2): busca em segundo plano passa a preferir
// LiderCRM.api.workerClient.clientesList() (GET /api/v1/clientes/list)
// em vez de db.collection('clientes').doc(uid).get() — mesmo formato
// de documento ({ list, uid, ts }), só trocando o transporte. Fallback
// pro caminho antigo só se o Worker não estiver disponível.
function loadCli(uid,cb){
  var localList=getCliLocal(uid);
  var localSig=(window.__LF_PERF_R4&&window.__LF_PERF_R4.signature)?window.__LF_PERF_R4.signature(localList):JSON.stringify(localList);
  cb(localList);
  var root=window.LiderCRM;
  var wc=root&&root.api&&root.api.workerClient;
  var cfg=root&&root.config;
  function applyServerList(server){
    var merged=_mergeKeepLocalOnly(server,getCliLocal(uid));
    ss(ck(uid),merged);
    if(merged.length!==server.length)saveCli(uid,merged); // reenvia o(s) item(ns) local(is) que ainda não estavam no servidor
    var mergedSig=(window.__LF_PERF_R4&&window.__LF_PERF_R4.signature)?window.__LF_PERF_R4.signature(merged):JSON.stringify(merged);
    if(mergedSig!==localSig)cb(merged);
  }
  if(cfg&&cfg.useWorkerApi&&wc&&typeof wc.clientesList==='function'){
    wc.clientesList(uid).then(function(doc){applyServerList((doc&&doc.list)||[]);}).catch(function(e){console.warn("[auth] clientesList falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('clientes').doc(uid).get().then(function(d){
      applyServerList(d.exists?(d.data().list||[]):[]);
    }).catch(function(e){console.warn("[auth] loadCli firebase falhou",e);});
  }
}

// CORREÇÃO (auditoria, Etapa 5 — login/sessão): _loginAttempts/_loginLockUntil eram só
// variáveis em memória — um F5 na tela de login zerava o contador e o bloqueio de 30s,
// bastando recarregar a página pra "resetar" as tentativas. Agora o estado do lockout é
// persistido em localStorage (chave lf_login_lock) e recarregado no boot do script, então
// sobrevive a reload/fechar aba. (Limitação já documentada à parte: como é um app 100%
// client-side, alguém com acesso ao console do navegador ainda pode chamar verifyPw()
// diretamente e contornar qualquer lockout de UI — isso não é uma vulnerabilidade nova
// desta correção, é inerente a não ter um backend de autenticação.)
var _loginLockState=(function(){try{return JSON.parse(localStorage.getItem('lf_login_lock'))||{a:0,u:0};}catch(e){return {a:0,u:0};}})();

var _loginAttempts=_loginLockState.a||0,_loginLockUntil=_loginLockState.u||0;

function _persistLoginLock(){try{localStorage.setItem('lf_login_lock',JSON.stringify({a:_loginAttempts,u:_loginLockUntil}));}catch(e){}}


function _lfAuthUsuariosRuntime(){
  return ((((window.LiderCRM||{}).modules||{}).usuarios||{}).runtime)||{};
}

function _lfAuthResolveFn(name, legacyRef){
  if(typeof legacyRef==='function')return legacyRef;
  try{ if(typeof window[name]==='function') return window[name]; }catch(_e){}
  try{
    var rt=_lfAuthUsuariosRuntime();
    if(rt&&typeof rt[name]==='function') return rt[name];
  }catch(_e){}
  return null;
}

function _lfAuthGetUserSafe(uid){
  var fn=_lfAuthResolveFn('getUser',typeof getUser!=='undefined'?getUser:null);
  if(fn){
    try{return fn(uid)||null;}catch(_e){}
  }
  var listFn=_lfAuthResolveFn('getUsers',typeof getUsers!=='undefined'?getUsers:null);
  if(listFn){
    try{
      var list=listFn();
      if(Array.isArray(list)) return list.find(function(u){return u&&String(u.id)===String(uid);})||null;
    }catch(_e){}
  }
  return null;
}

function _lfAuthLoadUsersDBSafe(cb){
  var fn=_lfAuthResolveFn('loadUsersDB',typeof loadUsersDB!=='undefined'?loadUsersDB:null);
  if(typeof fn!=='function'){ if(typeof cb==='function') cb([]); return; }
  try{return fn(cb);}catch(_e){ if(typeof cb==='function') cb([]); }
}

function _lfAuthResolveWorkerClient(){
  try{
    var root=window.LiderCRM;
    var wc=root&&root.api&&root.api.workerClient;
    return (wc&&typeof wc.login==='function')?wc:null;
  }catch(_e){ return null; }
}

function _lfAuthWaitForWorkerClient(timeoutMs){
  timeoutMs=Math.max(0,timeoutMs||0);
  return new Promise(function(resolve){
    var started=Date.now();
    (function probe(){
      var wc=_lfAuthResolveWorkerClient();
      if(wc) return resolve(wc);
      if(Date.now()-started>=timeoutMs) return resolve(null);
      setTimeout(probe,120);
    })();
  });
}

// FASE 3.3 (2026-07-17): doLogin() deixou de ler/verificar a senha
// localmente via loadUsersDB()/verifyPw(). Agora chama diretamente
// POST /api/v1/login (LiderCRM.api.workerClient.login), que faz a
// dupla verificação no Worker (users legíveis de fs_documents, com
// fallback pra Supabase Auth) e devolve o JWT pronto.
//
// CORREÇÃO DE SEGURANÇA (pedido do usuário — melhorua_reforcado):
// REMOVIDO o fallback client-side (verifyPw(localUser,pw)) que
// permitia autenticar contra o hash da senha guardado em lf6_u no
// próprio navegador — esse caminho, combinado com a seed embutida
// do ADM (js/usuarios.js), fazia com que a senha padrão do bundle
// funcionasse mesmo sem o Worker responder. Agora o login SEMPRE
// exige o Worker: se o Worker não estiver acessível, o login falha
// (“Não foi possível entrar”) em vez de silenciosamente cair pra
// verificação local. sh()/shSecure()/verifyPw() continuam
// existindo só como formato de hash de referência usado em outros
// fluxos (ex.: assinar HMAC da ponte legada em /session/legacy-*).
//
// getUser(u.id) é usado só pra decorar o avatar com a cor (S.cor) já
// salva localmente — não influencia autenticação; se não houver
// registro local (ex.: primeiro login neste dispositivo), cai em 0.
function doLogin(){
  var now=Date.now();
  if(_loginLockUntil>now){var secs=Math.ceil((_loginLockUntil-now)/1000);
    document.getElementById('lerr').textContent='Muitas tentativas. Aguarde '+secs+'s.';return;}
  var em=(document.getElementById('le').value||'').trim().toLowerCase();
  var pw=document.getElementById('lp').value||'';
  var er=document.getElementById('lerr');er.textContent='';
  var btn=document.getElementById('btn-login');
  if(!em||!pw){er.textContent='Preencha e-mail e senha.';return;}
  btn.textContent='Entrando...';btn.disabled=true;

  // CORREÇÃO BUG LOGIN #1 (2026-07-23): timeout de espera do worker-client subido
  // de 1500ms para 8000ms. Em Capacitor/4G lento (cold-start do WebView + parse
  // dos 88 scripts do bundle) o worker-client demora facilmente 2-6s pra ficar
  // disponível, e o usuário recebia "Serviço de autenticação indisponível" mesmo
  // com internet OK. 8s cobre o pior caso legítimo sem prender o botão pra sempre.
  // CORREÇÃO BUG LOGIN #2 (2026-07-23): ao clicar em Entrar, resetamos qualquer
  // lockout já expirado (antes ficava "colado" no localStorage se o relógio do
  // aparelho tivesse dado uma volta ou o usuário limpasse cache seletivamente),
  // e reabilitamos o botão em TODOS os caminhos de erro (o path original só
  // reabilitava dentro do then; em erro de rede o botão ficava "Entrando..."
  // indefinidamente até o F5).
  if(_loginLockUntil && _loginLockUntil<=now){ _loginLockUntil=0; _loginAttempts=0; _persistLoginLock(); }
  function _loginResetBtn(){ try{ btn.textContent='Entrar'; btn.disabled=false; }catch(_e){} }
  _lfAuthWaitForWorkerClient(8000).then(function(wc){
    if(!wc||typeof wc.login!=='function'){
      _loginResetBtn();
      er.textContent='Serviço de autenticação indisponível. Tente novamente em instantes.';return;
    }
    return wc.login(em,pw).then(function(res){
      _loginResetBtn();
      var wu=res&&res.ok&&res.data&&res.data.data&&res.data.data.user;
      if(!wu){
        _loginAttempts++;
        if(_loginAttempts>=5){_loginLockUntil=Date.now()+30000;_loginAttempts=0;_persistLoginLock();er.textContent='Muitas tentativas. Aguarde 30s.';return;}
        _persistLoginLock();
        er.textContent=(res&&res.data&&res.data.error&&res.data.error.message)||'E-mail ou senha inválidos.';return;
      }
      _loginAttempts=0;_loginLockUntil=0;_persistLoginLock();
      var lu=_lfAuthGetUserSafe(wu.id);
      S={userId:wu.id,role:wu.role||(lu&&lu.role)||'user',nome:wu.nome||(lu&&lu.nome)||'',email:wu.email||em,cor:(lu&&lu.cor)||0};
      ss('lf6_s',S);startApp();
      if(typeof loadUsersDB==='function'){
        _lfAuthLoadUsersDBSafe(function(){ try{ if(typeof renderUsers==='function') renderUsers(); }catch(e){} try{ if(typeof buildNav==='function') buildNav(); }catch(e){} });
      }
    });
  }).catch(function(e){
    _loginResetBtn();
    // Diagnóstico mais claro: distingue rede vs. 401 vs. desconhecido
    var msg='Não foi possível entrar. Verifique sua conexão e tente novamente.';
    try{
      if(e && e.status===401) msg='E-mail ou senha inválidos.';
      else if(e && (e.name==='TypeError' || /Failed to fetch|NetworkError|Network request/i.test(String(e.message||e)))) msg='Sem conexão com o servidor. Verifique sua internet.';
    }catch(_e){}
    er.textContent=msg;
    try{ console.warn('[auth] login erro',e); }catch(_e){}
  });
}

function _execLogout(){
  if(typeof agdStopListening==='function')agdStopListening();
  if(window._actInterval){clearInterval(window._actInterval);window._actInterval=null;}
  if(window._sessInterval){clearInterval(window._sessInterval);window._sessInterval=null;}
  if(window._ntfInterval){clearInterval(window._ntfInterval);window._ntfInterval=null;}
  if(window._autoEngineInterval){clearInterval(window._autoEngineInterval);window._autoEngineInterval=null;}
  if(typeof _chatPollTimer!=='undefined'&&_chatPollTimer){clearInterval(_chatPollTimer);_chatPollTimer=null;}
  if(typeof _chatCurrentConv!=='undefined')_chatCurrentConv=null;
  if(typeof _actAlertTimers!=='undefined'){Object.keys(_actAlertTimers).forEach(function(k){clearTimeout(_actAlertTimers[k]);});_actAlertTimers={};}
  if(typeof clearBulk==='function')clearBulk();
  if(typeof _mbStageFilter!=='undefined'){_mbStageFilter={leads:null,negocios:null};}
  _tlOwnerUid=null;_tlCid=null;_dcId=null;_duId=null;_kbDetId=null;_kbDetBoard=null;_kbDetOwnerUid=null;
  // Fecha todos os modais abertos e restaura scroll do body
  document.querySelectorAll('.mo.open').forEach(function(m){m.classList.remove('open');});
  document.body.style.overflow='';document.body.style.position='';document.body.style.width='';document.body.style.top='';
  S=null;try{localStorage.removeItem('lf6_s');}catch(e){}
  document.getElementById('app').classList.remove('vis');
  document.getElementById('login-screen').classList.add('vis');
  document.getElementById('le').value='';document.getElementById('lp').value='';
}

function doLogout(){
  // Confirmação via toast customizado (evita confirm() nativo bloqueado em iOS PWA)
  var t=document.getElementById('toast'),tm=document.getElementById('tmsg');
  if(t&&tm){
    clearTimeout(t._tm);clearTimeout(t._confirmTm);
    tm.innerHTML='Sair da conta? <button id="toast-logout-btn" style="margin-left:8px;padding:2px 9px;border-radius:6px;border:none;background:var(--red);color:#fff;font-size:.75rem;cursor:pointer;font-family:Outfit,sans-serif">Sair</button>';
    var btn=document.getElementById('toast-logout-btn');
    if(btn){btn.addEventListener('click',function(){clearTimeout(t._confirmTm);t.classList.remove('show');_execLogout();},{once:true});}
    t.classList.add('show');
    t._confirmTm=setTimeout(function(){t.classList.remove('show');tm.textContent='';},4000);
  } else {
    _execLogout();
  }
}

function checkSes(){var s=sg('lf6_s');if(!s)return false;var u=_lfAuthGetUserSafe(s.userId);if(!u){S=s;return true;}if(u.ativo===false){try{localStorage.removeItem('lf6_s');}catch(e){}return false;}S=s;return true;}

function getMyRole(){return hasAdminAccess()?'gestor':'consultor';}
