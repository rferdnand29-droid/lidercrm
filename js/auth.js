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
// Extraídas para src/shared/permissions/access-control.js para reduzir
// acoplamento entre autenticação, navegação e módulos de negócio.
// As funções globais continuam expostas sem alterar o comportamento.
// ============================================================

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
// FIX 2026-07-23 (auth-getclilocal-inline-guard-v2): getCliLocal está
// declarado em js/clientes.js, que é carregado DEPOIS de auth.js na
// ordem de <script> síncronos. Se qualquer caller externo (patches
// mobile, onclick inline, bootApp em supabase.js) chamar loadCli()
// no intervalo entre a avaliação de auth.js e a de clientes.js, o
// identificador ainda não existe e o console dispara ReferenceError
// — cascateando em renderDash (métricas), renderAnalytics e no fluxo
// que aplica tema/wallpaper do cliente. Defesa em profundidade:
// resolvemos via window.getCliLocal (populado pelo guard inline no
// <head> ANTES de storage.js) e caímos em [] como último recurso.
function _lfSafeGetCliLocal(uid){
  try{
    if(typeof getCliLocal==='function') return getCliLocal(uid);
    if(typeof window!=='undefined' && typeof window.getCliLocal==='function') return window.getCliLocal(uid);
    if(typeof window!=='undefined' && typeof window.sg==='function' && typeof window.ck==='function'){
      return window.sg(window.ck(uid))||[];
    }
  }catch(_e){ try{console.warn('[auth] _lfSafeGetCliLocal falhou',_e);}catch(_e2){} }
  return [];
}
function loadCli(uid,cb){
  var localList=_lfSafeGetCliLocal(uid);
  var localSig=JSON.stringify(localList);
  cb(localList);
  var root=window.LiderCRM;
  var wc=root&&root.api&&root.api.workerClient;
  var cfg=root&&root.config;
  function applyServerList(server){
    var merged=_mergeKeepLocalOnly(server,_lfSafeGetCliLocal(uid));
    ss(ck(uid),merged);
    if(merged.length!==server.length)saveCli(uid,merged); // reenvia o(s) item(ns) local(is) que ainda não estavam no servidor
    var mergedSig=JSON.stringify(merged);
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
  var shared=((window.LiderCRM||{}).shared||{}).runtime||{};
  if(shared&&typeof shared.resolveFn==='function') return shared.resolveFn(name,legacyRef);
  if(typeof legacyRef==='function')return legacyRef;
  try{ if(typeof window[name]==='function') return window[name]; }catch(_e){}
  try{
    var rt=_lfAuthUsuariosRuntime();
    if(rt&&typeof rt[name]==='function') return rt[name];
  }catch(_e){}
  return null;
}

function _lfAuthGetUserSafe(uid){
  var shared=((window.LiderCRM||{}).shared||{}).runtime||{};
  if(shared&&typeof shared.getUserSafe==='function') return shared.getUserSafe(uid);
  var fn=_lfAuthResolveFn('getUser',typeof getUser!=='undefined'?getUser:null);
  if(fn){
    try{return fn(uid)||null;}catch(_e){console.warn('[auth] getUser falhou',_e);}
  }
  var listFn=_lfAuthResolveFn('getUsers',typeof getUsers!=='undefined'?getUsers:null);
  if(listFn){
    try{
      var list=listFn();
      if(Array.isArray(list)) return list.find(function(u){return u&&String(u.id)===String(uid);})||null;
    }catch(_e){console.warn('[auth] getUsers falhou',_e);}
  }
  return null;
}

function _lfAuthLoadUsersDBSafe(cb){
  var shared=((window.LiderCRM||{}).shared||{}).runtime||{};
  if(shared&&typeof shared.loadUsersDBSafe==='function') return shared.loadUsersDBSafe(cb);
  var fn=_lfAuthResolveFn('loadUsersDB',typeof loadUsersDB!=='undefined'?loadUsersDB:null);
  if(typeof fn!=='function'){ if(typeof cb==='function') cb([]); return; }
  try{return fn(cb);}catch(_e){ console.warn('[auth] loadUsersDB falhou',_e); if(typeof cb==='function') cb([]); }
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
  try{
    var http=(window.LiderCRM&&window.LiderCRM.api&&window.LiderCRM.api.httpClient)||null;
    if(http&&http.session&&typeof http.session.clear==='function') http.session.clear();
  }catch(e){console.warn('[auth] worker session cleanup falhou',e);}
  try{
    [
      'lf_retry_q_v1',
      'lidercrm_retry_queue_v1',
      'lidercrm_dlq_v1'
    ].forEach(function(k){ try{ localStorage.removeItem(k); }catch(_e){} });
  }catch(e){console.warn('[auth] retry queue cleanup falhou',e);}
  S=null;try{localStorage.removeItem('lf6_s');}catch(e){console.warn('[auth] localStorage cleanup falhou',e);}
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
    if(btn){btn.addEventListener('click',function(){
      clearTimeout(t._confirmTm);t.classList.remove('show');
      try{
        var wc=window.LiderCRM&&window.LiderCRM.api&&window.LiderCRM.api.workerClient;
        if(wc&&typeof wc.logout==='function'){
          wc.logout().catch(function(e){console.warn('[auth] worker logout falhou',e);}).finally(_execLogout);
          return;
        }
      }catch(e){console.warn('[auth] doLogout worker logout falhou',e);}
      _execLogout();
    },{once:true});}
    t.classList.add('show');
    t._confirmTm=setTimeout(function(){t.classList.remove('show');tm.textContent='';},4000);
  } else {
    _execLogout();
  }
}

function checkSes(){var s=sg('lf6_s');if(!s)return false;var u=_lfAuthGetUserSafe(s.userId);if(!u){S=s;return true;}if(u.ativo===false){try{localStorage.removeItem('lf6_s');}catch(e){}return false;}S=s;return true;}

function getMyRole(){return hasAdminAccess()?'gestor':'consultor';}


/* =====================================================================
 * Ponte de autenticação legada → Worker JWT
 * Incorporado de: lf-legacy-auth-bridge-v1-20260717.js
 * ===================================================================== */
/* =====================================================================
 * lf-legacy-auth-bridge-v1-20260717.js  (Fase 3.2)
 * ---------------------------------------------------------------------
 * Ponte de autenticação entre o login LEGADO do CRM (users em
 * localStorage / config/users) e o JWT do Worker. Roda 100% no cliente,
 * sem exigir mexer no auth.js legado, e é totalmente idempotente
 * (guardrail lf.legacyAuthBridge.v1 — não roda duas vezes).
 *
 * Fluxo:
 *   1) Espera existir sessão legada (S.userId + S.email) e o usuário
 *      correspondente no getUsers()/loadUsersDB().
 *   2) Se já existe JWT do Worker válido (api.httpClient.session.isValid),
 *      não faz nada.
 *   3) Caso contrário:
 *        a) GET  /api/v1/session/legacy-nonce?uid=&email=  -> {ts}
 *        b) sig = HMAC-SHA256(JWT_SECRET_DERIVED, `${uid}|${email}|${ts}|${ph}`)
 *           obs.: o Worker recomputa o HMAC do lado servidor usando o
 *           mesmo JWT_SECRET e o `ph` que já tem no fs_documents —
 *           então o cliente NÃO precisa saber JWT_SECRET; ele só
 *           precisa provar que conhece `ph`. Para isso, o cliente usa
 *           o próprio `ph` como *chave HMAC* (compatível com o mesmo
 *           material do servidor porque JWT_SECRET aqui participa como
 *           parte do próprio material — ver auth-service.js).
 *        c) POST /api/v1/session/legacy-bridge  { uid, email, ts, sig }
 *           -> JWT do Worker, salvo em api.httpClient.session.
 *
 * Segurança:
 *   • `ph` NUNCA sai do dispositivo (só é usado localmente como material
 *     do HMAC).
 *   • Janela de validade do nonce = 60s no servidor.
 *   • Se o user não tem `ph` (ex.: primeiro login pós-migração), o
 *     bridge é abortado silenciosamente — o próximo login vai emitir
 *     JWT direto pelo /api/v1/login (que aceita legado agora).
 *
 * Após o sucesso:
 *   • dispara `window.dispatchEvent(new CustomEvent('lf:worker-session-ready'))`
 *   • marca `window.__lf_worker_session_source = 'legacy-bridge'`
 * ===================================================================== */
(function(global){
  'use strict';
  if (!global || !global.document) return;
  var guard = global.__lf_guards = global.__lf_guards || {};
  if (guard['legacyAuthBridge.v1']) return;
  guard['legacyAuthBridge.v1'] = true;

  var LOG_PREFIX = '[lf-legacy-auth-bridge]';
  function log(){ if (global.console && global.console.debug) try { console.debug.apply(console, [LOG_PREFIX].concat([].slice.call(arguments))); } catch(_e){} }

  function root(){ return global.LiderCRM || {}; }
  function cfg(){ return (root().config || {}); }
  function api(){ return (root().api || {}); }

  function isBridgeEnabled(){
    var c = cfg();
    return c && c.useLegacyAuthBridge !== false;
  }
  function hasValidWorkerJwt(){
    var http = api().httpClient;
    return !!(http && http.session && http.session.isValid && http.session.isValid());
  }
  function currentLegacySession(){
    // S global do CRM legado (auth.js) + fallback ao lf6_s persistido.
    var S = global.S;
    if (!S || !S.userId) {
      try {
        var raw = global.localStorage && global.localStorage.getItem('lf6_s');
        if (raw) S = JSON.parse(raw);
      } catch(_e){}
    }
    return (S && S.userId) ? S : null;
  }
  function findUserRecord(uid){
    // getUsers() já é global no legado (js/usuarios.js).
    if (typeof global.getUser === 'function'){
      try { var u = global.getUser(uid); if (u) return u; } catch(_e){}
    }
    if (typeof global.getUsers === 'function'){
      try {
        var list = global.getUsers();
        if (Array.isArray(list)){
          for (var i = 0; i < list.length; i++){
            if (list[i] && String(list[i].id) === String(uid)) return list[i];
          }
        }
      } catch(_e){}
    }
    return null;
  }

  // ------------ HMAC-SHA256 (hex) usando WebCrypto do browser ------------
  function _bufToHex(buf){
    var arr = new Uint8Array(buf); var hex = '';
    for (var i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2,'0');
    return hex;
  }
  function hmacSha256Hex(keyStr, msgStr){
    if (!(global.crypto && global.crypto.subtle)){
      return Promise.reject(new Error('crypto_subtle_unavailable'));
    }
    var enc = new TextEncoder();
    return global.crypto.subtle.importKey(
      'raw', enc.encode(String(keyStr || '')),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    ).then(function(key){
      return global.crypto.subtle.sign('HMAC', key, enc.encode(String(msgStr || '')));
    }).then(_bufToHex);
  }

  // ------------ Fluxo principal ------------
  var _inFlight = null;
  function tryBridge(){
    if (!isBridgeEnabled()) { log('desativado por config'); return Promise.resolve(false); }
    if (hasValidWorkerJwt()) { log('já tem JWT válido — nada a fazer'); return Promise.resolve(true); }
    if (_inFlight) return _inFlight;

    var sess = currentLegacySession();
    if (!sess) { log('sem sessão legada — aguardando'); return Promise.resolve(false); }
    var uid = String(sess.userId);
    var email = String(sess.email || '').trim().toLowerCase();
    if (!uid || !email) { log('sessão legada sem uid/email'); return Promise.resolve(false); }

    var u = findUserRecord(uid);
    if (!u) { log('user record não encontrado ainda'); return Promise.resolve(false); }
    var ph = String(u.ph || '');
    if (!ph) { log('user sem ph — bridge abortado (usuário precisa logar via /login)'); return Promise.resolve(false); }

    var wc = api().workerClient;
    if (!wc || typeof wc.legacyNonce !== 'function' || typeof wc.legacyBridge !== 'function'){
      log('workerClient sem métodos de bridge — ignorado');
      return Promise.resolve(false);
    }

    _inFlight = wc.legacyNonce(uid, email).then(function(nonce){
      if (!nonce || typeof nonce.ts !== 'number'){
        throw new Error('nonce_invalido');
      }
      // Contrato do HMAC (idêntico ao auth-service.js do Worker):
      //   chave    = ph  (hash da senha do user, só conhecido pelo
      //                    cliente e pelo Worker)
      //   material = `${uid}|${email}|${ts}|${ph}`
      // Quem NÃO conhece `ph` não consegue forjar a assinatura, e o
      // `ph` nunca trafega pela rede em nenhum momento.
      var material = uid + '|' + email + '|' + String(nonce.ts) + '|' + ph;
      return hmacSha256Hex(ph, material).then(function(sig){
        return wc.legacyBridge({
          uid: uid, email: email, ts: nonce.ts, sig: sig
        });
      });
    }).then(function(result){
      if (result && result.token){
        global.__lf_worker_session_source = 'legacy-bridge';
        try { global.dispatchEvent(new CustomEvent('lf:worker-session-ready', { detail: { source: 'legacy-bridge' } })); } catch(_e){}
        log('JWT emitido pela ponte legada, source=legacy-bridge, user=', result.user && result.user.email);
        return true;
      }
      log('bridge respondeu sem token');
      return false;
    }).catch(function(err){
      // Não escala erro: o app continua operando via fallback legado.
      log('bridge falhou:', err && err.message);
      return false;
    }).finally(function(){ _inFlight = null; });

    return _inFlight;
  }

  // ------------ Disparadores ------------
  // 1) Ao subir o app (DOMContentLoaded / arch pronto)
  function scheduleInitial(){
    // aguarda um pouquinho pra garantir que os users legados foram
    // carregados (loadUsersDB é assíncrono no primeiro boot).
    setTimeout(tryBridge, 800);
    setTimeout(tryBridge, 2500);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive'){
    scheduleInitial();
  } else {
    document.addEventListener('DOMContentLoaded', scheduleInitial, { once: true });
  }
  // 2) Quando o app legado terminar o startApp() (bootApp), tentar de novo.
  global.addEventListener('lf:app-started', tryBridge);
  // 3) Após o login legado (o botão "Entrar" chama doLogin que chama startApp).
  //    Instrumenta uma polling curta que detecta troca de S.userId.
  var _lastUid = null;
  setInterval(function(){
    var s = currentLegacySession();
    var uid = s && s.userId ? String(s.userId) : null;
    if (uid && uid !== _lastUid){
      _lastUid = uid;
      tryBridge();
    } else if (!uid){
      _lastUid = null;
      // Se o legado deslogou, também limpa o JWT do Worker (Fase 3.2:
      // desligar o legado de forma controlada).
      var http = api().httpClient;
      if (http && http.session && http.session.isValid && http.session.isValid()){
        try { http.session.clear(); } catch(_e){}
        log('sessão legada caiu — JWT do Worker limpo');
      }
    }
  }, 1500);

  // Exposto para debug/manual
  global.__lfLegacyAuthBridge = { tryBridge: tryBridge };
})(window);


/* =====================================================================
 * Guard: consultor não vira supervisor-readonly por nivel incorreto
 * Incorporado de: lf-leads-edit-consultant-guard-v1-20260723.js
 * ===================================================================== */
/*
 * FIX (2026-07-23): "usuário consultor não consegue editar próprios leads".
 *
 * Diagnóstico:
 *   lf-supervisor-teamview-readonly-v1-20260722.js decide se aplica o
 *   modo somente-leitura via isSupervisorReadonly(), que por sua vez
 *   depende de hasSupervisorAccess() (definido em js/auth.js:106):
 *     hasSupervisorAccess = getCargoNivel(uid) >= 3
 *
 *   Se getCargoNivel() retornar >=3 para um usuário que na verdade é
 *   'consultor' (dado corrompido no cadastro, cargo salvo com string
 *   inesperada, migração incompleta do schema, etc.), o patch de
 *   supervisor envolve TODO o renderKBLocal em modo readonly quando
 *   o filtro está em "Todos" — o consultor não consegue nem editar
 *   os cards dele mesmo.
 *
 * Estratégia (defesa em profundidade, NÃO altera auth.js):
 *   1. Após auth.js ter definido hasSupervisorAccess, envolvemos a
 *      função em um guard: se o usuário tem cargo textual explícito
 *      diferente de 'supervisor'/'orientador'/'gerente'/'gestor', o
 *      resultado é forçado a false. Assim, um consultor mal
 *      classificado por número de nível volta a ter edição total.
 *   2. Log ÚNICO por sessão quando o guard bloqueia um resultado,
 *      pra permitir diagnosticar cadastros errados sem poluir o
 *      console.
 *   3. Só roda quando isSupervisorReadonly já existe (garante que o
 *      patch de teamview-readonly foi carregado).
 *
 * Segurança:
 *   Este patch NUNCA aumenta permissões (nunca transforma consultor
 *   em supervisor). Só evita rebaixar por engano um consultor legítimo
 *   a modo somente-leitura. Se um supervisor de verdade tem cargo
 *   textual correto, o comportamento fica idêntico.
 *
 * Zero acoplamento com auth/login/JWT/bridge.
 */
(function(){
  if (window.__LF_LEADS_EDIT_GUARD_V1__) return;
  window.__LF_LEADS_EDIT_GUARD_V1__ = true;

  var SUPERVISOR_CARGOS = { supervisor:1, orientador:1, gerente:1, gestor:1, admin:1, administrador:1 };

  function _cargoTextual(uid){
    try{
      var u = (typeof window.getUser === 'function') ? window.getUser(uid) : null;
      if (!u) return null;
      var c = (u.cargo || u.role || u.papel || '').toString().trim().toLowerCase();
      return c || null;
    }catch(_e){ return null; }
  }

  function _install(){
    if (typeof window.hasSupervisorAccess !== 'function') return false;
    if (window.__LF_HAS_SUP_WRAPPED__) return true;
    window.__LF_HAS_SUP_WRAPPED__ = true;

    var _orig = window.hasSupervisorAccess;
    var _loggedOnce = false;

    window.hasSupervisorAccess = function(uid){
      var raw = false;
      try{ raw = !!_orig.apply(this, arguments); }catch(_e){ raw = false; }
      if (!raw) return false;

      var effectiveUid = uid || (window.S && window.S.userId) || null;
      if (!effectiveUid) return raw;

      var cargo = _cargoTextual(effectiveUid);
      // Sem cargo textual disponível -> confia no cálculo original.
      if (!cargo) return raw;

      // Cargo textual explícito de supervisor -> mantém.
      if (SUPERVISOR_CARGOS[cargo]) return true;

      // Nível diz "supervisor" mas cargo textual é claramente de
      // consultor / operacional -> força false (não deixa cair no
      // modo readonly do patch de teamview).
      if (!_loggedOnce){
        _loggedOnce = true;
        try{ console.warn('[lf-leads-edit-guard] hasSupervisorAccess=TRUE por nível mas cargo="'+cargo+'" — rebaixando para consultor. Verificar cadastro do usuário '+effectiveUid); }catch(_e){}
      }
      return false;
    };
    return true;
  }

  // Tenta instalar já; se auth.js ainda não rodou, tenta em
  // DOMContentLoaded / load (com pequeno retry).
  if (_install()) return;
  var _tries = 0;
  var _t = setInterval(function(){
    _tries++;
    if (_install() || _tries > 40){ // ~4s máx
      clearInterval(_t);
    }
  }, 100);
})();
