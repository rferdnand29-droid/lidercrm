/* =====================================================================
 * firebase.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// ============================================================
// LIDER CRM - JS LIMPO
// ============================================================
var FB_CONFIG={apiKey:"AIzaSyAspolkpP8GYnsviGaHirDVKz1cqqNxpCc",authDomain:"crm-lider-b9b0c.firebaseapp.com",projectId:"crm-lider-b9b0c",storageBucket:"crm-lider-b9b0c.firebasestorage.app",messagingSenderId:"559304368021",appId:"1:559304368021:web:85db5592f9bfd13344a09c"}

// Chave VAPID (Web Push certificate) do projeto Firebase. Pegue em:
// Console Firebase > Configurações do projeto > Cloud Messaging > "Certificados push da Web"
// (gere um par de chaves se ainda não existir) e cole a "chave pública" aqui.
var FCM_VAPID_KEY="BILHbiHGIkyaDufFV-NlDoo8X0uv7lzkqYyyN-tTJjn5F_Q75ppX-hPyuNQnBHTFygsCe9yWfulmXav6wpKr_XA";

var DB_MODE='local',db=null,fbStorage=null;

/* Helper genérico para confirmações — substitui confirm() nativo (bloqueado em iOS Safari/PWA).
   opts: { title, msg, okLabel, okClass, onOk }
   okClass: 'bd' (vermelho/destrutivo, padrão) ou 'bp' (âmbar/neutro) */
function _confirmModal(opts){
  opts=opts||{};
  var title=document.getElementById('confirm-del-title');
  var msg=document.getElementById('confirm-del-msg');
  var ok=document.getElementById('confirm-del-ok');
  if(title)title.textContent=opts.title||'⚠️ Confirmar ação';
  if(msg)msg.innerHTML=_safeLiteHTML(opts.msg||'');
  if(ok){ok.textContent=opts.okLabel||'Confirmar';ok.className=opts.okClass||'bd';}
  _confirmDelCb=opts.onOk||null;
  openM('mo-confirm-del');
}

var S=null,_dcId=null,_duId=null,_dashTab='normal',_searchQ='',_per='mes',_tlCid=null,_tlOwnerUid=null;

var _fltNicho='',_fltDate='',_fltLate=false;

var _nshCid=null,_nshOpt=null;

function syncOk(){var e=document.getElementById('nav-sync');if(e){e.className='nav-sync';e.title='Sincronizado';}}

function syncBusy(){var e=document.getElementById('nav-sync');if(e){e.className='nav-sync syncing';e.title='Sincronizando...';}}

function syncErr(e){var el=document.getElementById('nav-sync');if(el){el.className='nav-sync err';el.title='Erro de sincronização — dados salvos localmente';}toast('⚠️ Falha ao sincronizar com a nuvem. Dados salvos localmente.',4000);}

// ============================================================
// FIREBASE
// ============================================================
function initDB(){
  var sub=document.querySelector('#splash .splash-sub');if(sub)sub.textContent='Conectando...';
  try{
    if(typeof firebase!=='undefined'&&firebase.apps){
      if(!firebase.apps.length)firebase.initializeApp(FB_CONFIG);
      db=firebase.firestore();
      try{fbStorage=firebase.storage();}catch(e){fbStorage=null;}
      var t=setTimeout(function(){usarLocal('Firebase indisponivel');},8000);
      // Login anônimo do Firebase Auth: garante um "request.auth != null"
      // válido pras regras de segurança do Firestore, sem exigir cadastro
      // extra — o login de verdade (e-mail/senha do CRM) continua igual.
      // CORREÇÃO (bug raiz de "CRM não salva usuário" + "Conversas não funciona"):
      // antes, o app só entrava em modo Firebase (DB_MODE='firebase') se ALÉM do
      // login anônimo funcionar, uma leitura de um doc de teste ("ping/test")
      // também desse certo. Só que se as regras de segurança do Firestore não
      // liberarem esse doc avulso (bem comum quando as regras são restritivas
      // e nunca mencionam "ping"), o erro retornado é "permission-denied" — o
      // que NÃO significa "banco offline", significa "o Firestore respondeu
      // certinho, só que esse documento específico está bloqueado". Antes isso
      // derrubava o app inteiro pro modo local pra sempre (mesmo com internet
      // e Firestore 100% no ar), e é por isso que: (1) usuários criados só
      // ficavam salvos neste aparelho e pareciam "sumir" ao trocar de sessão/
      // aparelho, e (2) a aba Conversas nunca conseguia carregar nem enviar
      // nada, porque ela exige DB_MODE==='firebase'. Agora só caímos pro modo
      // local se o LOGIN ANÔNIMO em si falhar (aí sim é problema real de rede/
      // conexão); qualquer erro na leitura de teste é só logado e ignorado.
      firebase.auth().signInAnonymously()
        .then(function(){
          clearTimeout(t);DB_MODE='firebase';if(sub)sub.textContent='Conectado!';setTimeout(hideSplash,500);
          db.collection('ping').doc('test').get().catch(function(e){console.warn('ping (nao afeta o modo de conexao):',e);});
        })
        .catch(function(e){console.error('initDB',e);clearTimeout(t);usarLocal('Banco offline');});
    }else{usarLocal('Firebase nao carregou');}
  }catch(e){usarLocal('Erro de conexao');}
}

function usarLocal(m){DB_MODE='local';db=null;fbStorage=null;var sub=document.querySelector('#splash .splash-sub');if(sub)sub.textContent=m;setTimeout(hideSplash,600);}

function hideSplash(){var sp=document.getElementById('splash');if(!sp)return;sp.classList.add('hide');setTimeout(function(){sp.style.display='none';bootApp();},380);}

/* Confirmação via toast (evita confirm() nativo, bloqueado em iOS PWA — mesmo padrão de doLogout). */
function disconnectSession(deviceId){
  var t=document.getElementById('toast'),tm=document.getElementById('tmsg');
  if(!t||!tm){_disconnectSessionNow(deviceId);return;}
  clearTimeout(t._tm);clearTimeout(t._confirmTm);
  tm.innerHTML='Desconectar este dispositivo? <button id="toast-disc-btn" style="margin-left:8px;padding:2px 9px;border-radius:6px;border:none;background:var(--red);color:#fff;font-size:.75rem;cursor:pointer;font-family:Outfit,sans-serif">Desconectar</button>';
  var btn=document.getElementById('toast-disc-btn');
  if(btn)btn.addEventListener('click',function(){clearTimeout(t._confirmTm);t.classList.remove('show');_disconnectSessionNow(deviceId);},{once:true});
  t.classList.add('show');
  t._confirmTm=setTimeout(function(){t.classList.remove('show');tm.textContent='';},4000);
}

// ============================================================
// IDENTIDADE VISUAL OFICIAL — Líder Financeira e Investimentos
// ============================================================
// Fonte única da logo oficial em base64, reutilizada em: PWA/apple-touch-icon
// (abaixo) e como valor padrão em applyCustomLogo() (fallback quando o ADM
// não tiver enviado uma logo personalizada / ao clicar em "Resetar Logo").
var LF_OFFICIAL_LOGO=LF_LOGO_B64;

 // Reaproveita o base64 do favicon (ver <head>) em vez de duplicá-lo — otimização de performance.

// ============================================================
// PWA
// ============================================================
(function(){try{
  // Logo oficial (Líder Financeira e Investimentos) como ícone do PWA.
  // Reaproveitada em todo o CRM: base64 único definido em LF_OFFICIAL_LOGO.
  var iconDataUrl=LF_OFFICIAL_LOGO;
  // Bug fix: navegadores/WebViews Android mais antigos nem sempre suportam icone SVG no manifest
  // (fica em branco/quebrado ao instalar), e o iOS Safari ignora os icones do manifest no
  // "Adicionar a Tela de Inicio" (so le <link rel="apple-touch-icon">). Por isso rasterizamos
  // a logo em PNG via canvas e usamos esse PNG tanto no manifest quanto no apple-touch-icon.
  var img=new Image();
  img.onload=function(){
    try{
      var cv=document.createElement('canvas');cv.width=192;cv.height=192;
      var ctx=cv.getContext('2d');ctx.drawImage(img,0,0,192,192);
      var pngUrl=cv.toDataURL('image/png');
      var ate=document.getElementById('apple-touch-icon');if(ate)ate.href=pngUrl;
      var m={name:'LIDER CRM - Líder Financeira e Investimentos',short_name:'LIDER CRM',start_url:window.location.href.split('?')[0],display:'standalone',background_color:'#0A0C10',theme_color:'#0A0C10',icons:[{src:pngUrl,sizes:'192x192',type:'image/png'},{src:pngUrl,sizes:'512x512',type:'image/png'}]};
      var el=document.getElementById('pwa-manifest');if(el)el.href=URL.createObjectURL(new Blob([JSON.stringify(m)],{type:'application/json'}));
    }catch(e){
      // Fallback: se o canvas falhar (ex.: modo privado/restrito), usa a logo original sem rasterizar
      var m2={name:'LIDER CRM - Líder Financeira e Investimentos',short_name:'LIDER CRM',start_url:window.location.href.split('?')[0],display:'standalone',background_color:'#0A0C10',theme_color:'#0A0C10',icons:[{src:iconDataUrl,sizes:'480x480',type:'image/jpeg'}]};
      var el2=document.getElementById('pwa-manifest');if(el2)el2.href=URL.createObjectURL(new Blob([JSON.stringify(m2)],{type:'application/json'}));
    }
  };
  img.onerror=function(){
    var m3={name:'LIDER CRM - Líder Financeira e Investimentos',short_name:'LIDER CRM',start_url:window.location.href.split('?')[0],display:'standalone',background_color:'#0A0C10',theme_color:'#0A0C10',icons:[]};
    var el3=document.getElementById('pwa-manifest');if(el3)el3.href=URL.createObjectURL(new Blob([JSON.stringify(m3)],{type:'application/json'}));
  };
  img.src=iconDataUrl;
  }catch(e){}
  // Compatibilidade com Netlify/static hosts: o registro automático de Service Worker foi desativado neste build.
  // Motivo: o app gerava o SW via Blob e o registrava dinamicamente; isso é frágil em hospedagens
  // estáticas, pode causar cache preso/versão antiga e não é necessário para o CRM funcionar.
  // Para reativar PWA/push depois, publique um arquivo real /sw.js (ou firebase-messaging-sw.js)
  // e troque a flag abaixo para true após validar o deploy.
  window.LF_ENABLE_SW = false;
  if(window.LF_ENABLE_SW === true){ registerAppServiceWorker(); }
  })();

// ============================================================
// SERVICE WORKER + PUSH (FCM)
// ------------------------------------------------------------
// Continua sendo um único arquivo HTML: o Service Worker é gerado como um
// Blob (igual já era feito antes só pra cache offline), só que agora o
// conteúdo também inicializa o Firebase Messaging dentro do worker, pra
// conseguir mostrar notificação mesmo com o app fechado/em background.
// Isso funciona porque o navegador trata o SW registrado via blob: como
// pertencente à origem que o registrou, então importScripts() e o Push API
// funcionam normalmente, sem precisar publicar um arquivo separado no servidor.
// ============================================================
var _swReg=null;

function registerAppServiceWorker(){
  if(window.__lfSwRegistering||window.__lfSwRegistered)return;
  if(!('serviceWorker' in navigator))return;
  if(!window.isSecureContext&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')return;
  try{
    var swSrc=[
      'self.addEventListener("install",function(e){self.skipWaiting();});',
      'self.addEventListener("activate",function(e){self.clients.claim();});',
      'self.addEventListener("fetch",function(e){e.respondWith(fetch(e.request).catch(function(){return caches.match(e.request);}));});',
      'try{',
      '  importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");',
      '  importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");',
      '  firebase.initializeApp('+JSON.stringify(FB_CONFIG)+');',
      '  var messaging=firebase.messaging();',
      '  messaging.onBackgroundMessage(function(payload){',
      '    var n=(payload&&payload.notification)||{};',
      '    var d=(payload&&payload.data)||{};',
      '    var title=n.title||d.title||"LIDER CRM";',
      '    var body=n.body||d.body||"";',
      '    var tag=d.tag||n.tag||("fcm-"+Date.now());',
      '    self.registration.showNotification(title,{body:body,tag:tag,data:d,icon:d.icon||undefined,requireInteraction:true});',
      '  });',
      '}catch(e){}',
      'self.addEventListener("notificationclick",function(e){',
      '  e.notification.close();',
      '  e.waitUntil(clients.matchAll({type:"window"}).then(function(list){',
      '    for(var i=0;i<list.length;i++){if("focus" in list[i])return list[i].focus();}',
      '    if(clients.openWindow)return clients.openWindow("/");',
      '  }));',
      '});'
    ].join('\n');
    var swBlobUrl=URL.createObjectURL(new Blob([swSrc],{type:'text/javascript'}));
    window.__lfSwRegistering=1;
    navigator.serviceWorker.register(swBlobUrl,{scope:'/'})
      .then(function(reg){_swReg=reg;window.__lfSwRegistered=1;setupPushNotifications();})
      .catch(function(){})
      .then(function(){try{URL.revokeObjectURL(swBlobUrl);}catch(_e){}window.__lfSwRegistering=0;});
  }catch(e){window.__lfSwRegistering=0;}
}

/* Pede permissão de notificação (se ainda não decidida), pega o token FCM
   deste dispositivo via o Service Worker acima e salva no Firestore em
   push_tokens/{uid} — é esse token que as Cloud Functions usam pra saber
   pra quem mandar o push quando o app estiver fechado. */
function setupPushNotifications(){
  try{
    if(!('Notification' in window)||!_swReg)return;
    if(DB_MODE!=='firebase'||!db)return;
    if(!S||!S.userId)return;
    if(!FCM_VAPID_KEY||FCM_VAPID_KEY.indexOf('COLE_AQUI')===0)return;
    if(typeof firebase==='undefined'||!firebase.messaging)return;
    var doGetToken=function(){
      var messaging=firebase.messaging();
      if(!window.__lfPushOnMessageBound){
        try{
          messaging.onMessage(function(payload){
            var n=(payload&&payload.notification)||{};var d=(payload&&payload.data)||{};
            fireNativeNotification(n.title||'LIDER CRM',n.body||d.body||'','fcm-'+Date.now());
          });
          window.__lfPushOnMessageBound=1;
        }catch(e){}
      }
      if(window.__lfPushTokenPendingUid===S.userId)return;
      window.__lfPushTokenPendingUid=S.userId;
      messaging.getToken({vapidKey:FCM_VAPID_KEY,serviceWorkerRegistration:_swReg})
        .then(function(token){
          if(token&&(window.__lfLastPushToken!==token||window.__lfLastPushUid!==S.userId)){
            savePushToken(S.userId,token);
            window.__lfLastPushToken=token;
            window.__lfLastPushUid=S.userId;
          }
          window.__lfPushInitUid=S.userId;
        })
        .catch(function(e){console.error('FCM getToken',e);})
        .then(function(){if(window.__lfPushTokenPendingUid===S.userId)window.__lfPushTokenPendingUid='';});
    };
    if(Notification.permission==='granted'){doGetToken();}
    else if(Notification.permission==='default'&&!window.__lfPushPermissionAsked){
      window.__lfPushPermissionAsked=1;
      Notification.requestPermission().then(function(perm){
        if(perm==='granted')doGetToken();
        else window.__lfPushPermissionAsked=0;
      });
    }
  }catch(e){console.error('setupPushNotifications',e);}
}

/* Salva o token FCM deste aparelho na lista de tokens do usuário. arrayUnion
   evita duplicar o mesmo token se a função rodar mais de uma vez (ex.: toda
   vez que o app abre). Um usuário pode ter vários tokens (celular + PC etc.),
   e as Cloud Functions mandam o push pra todos. */
function savePushToken(uid,token){
  if(!uid||!token||DB_MODE!=='firebase'||!db)return;
  db.collection('push_tokens').doc(uid).set({
    tokens:firebase.firestore.FieldValue.arrayUnion(token),
    updatedAt:Date.now()
  },{merge:true}).catch(function(e){console.error('savePushToken',e);});
}

// ============================================================
// Envio de push 100% pelo navegador (sem Cloud Functions, sem plano Blaze)
// ------------------------------------------------------------
// ATENÇÃO DE SEGURANÇA: como este site é estático (sem servidor próprio), a
// única forma de mandar push sem pagar Cloud Functions é o PRÓPRIO
// APARELHO de quem envia a mensagem chamar a API do Google diretamente.
// Isso exige guardar aqui embaixo a chave de uma Service Account do Google
// Cloud — e qualquer pessoa que abrir o código-fonte deste site (F12 /
// "Exibir código-fonte") consegue ver essa chave.
//
// Pra reduzir o risco: crie uma Service Account que só tenha o papel
// "Firebase Cloud Messaging API Admin" (também aparece como "Cloud
// Messaging Admin"). Com esse papel, mesmo que alguém pegue a chave, ela
// só serve pra mandar notificações push — não dá acesso ao Firestore, aos
// dados dos clientes, nem a nada além disso.
//
// Como gerar a chave (uma única vez):
// 1. https://console.cloud.google.com/iam-admin/serviceaccounts
//    (escolha o projeto crm-lider-b9b0c no topo da página)
// 2. "Criar conta de serviço" → dê um nome (ex: "messenger-push")
// 3. Em "Conceder acesso", escolha o papel "Firebase Cloud Messaging API
//    Admin" e conclua.
// 4. Abra a conta criada → aba "Chaves" → "Adicionar chave" → "Criar nova
//    chave" → formato JSON → baixa um arquivo .json.
// 5. Abra esse arquivo e copie os campos "client_email" e "private_key"
//    para dentro de FCM_SERVICE_ACCOUNT logo abaixo.
// SEGURANÇA (auditoria): a chave privada real foi REMOVIDA daqui. Uma chave
// de Service Account do Google nunca deve ficar dentro de um arquivo que roda
// no navegador — qualquer pessoa que abrir "Ver código-fonte" da página
// consegue copiá-la. A que estava aqui antes já deve ser considerada
// vazada: revogue-a em https://console.cloud.google.com/iam-admin/serviceaccounts
// (projeto crm-lider-b9b0c) o quanto antes.
// Enquanto isso, o envio de notificação push fica desativado (o resto do
// CRM funciona 100% normalmente). Para reativar push com segurança, gere
// uma chave NOVA e implemente o envio num backend (ex: Cloudflare Worker,
// Netlify Function) que o navegador apenas chame — nunca cole a chave aqui.
var FCM_SERVICE_ACCOUNT={
  client_email:"COLE_AQUI@seu-projeto.iam.gserviceaccount.com",
  private_key:"COLE_AQUI"
}

var FCM_PROJECT_ID=FB_CONFIG.projectId;

var _fcmAccessToken=null,_fcmAccessTokenExp=0,_fcmSigningKeyPromise=null;

function _fcmB64urlFromBytes(bytes){var bin='';for(var i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}

function _fcmB64urlFromStr(str){return _fcmB64urlFromBytes(new TextEncoder().encode(str));}

function _fcmPemToBuffer(pem){var b64=String(pem||'').replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s+/g,'');var bin=atob(b64);var buf=new ArrayBuffer(bin.length);var view=new Uint8Array(buf);for(var i=0;i<bin.length;i++)view[i]=bin.charCodeAt(i);return buf;}

function _fcmSigningKeyReady(){if(!_fcmSigningKeyPromise)_fcmSigningKeyPromise=crypto.subtle.importKey('pkcs8',_fcmPemToBuffer(FCM_SERVICE_ACCOUNT.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);return _fcmSigningKeyPromise;}

/* Assina um JWT com a chave da Service Account e troca por um access_token
   OAuth2 (a mesma coisa que um servidor faria — só que rodando no
   navegador). O token dura 1h e fica em cache aqui pra não assinar de
   novo a cada mensagem. */
function _fcmGetAccessToken(){
  var nowS=Math.floor(Date.now()/1000);
  if(_fcmAccessToken&&_fcmAccessTokenExp>nowS+60)return Promise.resolve(_fcmAccessToken);
  if(!FCM_SERVICE_ACCOUNT.client_email||FCM_SERVICE_ACCOUNT.client_email.indexOf('COLE_AQUI')===0)return Promise.reject(new Error('FCM_SERVICE_ACCOUNT não configurado'));
  var iat=nowS,exp=nowS+3600;
  var header={alg:'RS256',typ:'JWT'};
  var claim={iss:FCM_SERVICE_ACCOUNT.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:iat,exp:exp};
  var unsigned=_fcmB64urlFromStr(JSON.stringify(header))+'.'+_fcmB64urlFromStr(JSON.stringify(claim));
  return _fcmSigningKeyReady().then(function(key){
    return crypto.subtle.sign({name:'RSASSA-PKCS1-v1_5'},key,new TextEncoder().encode(unsigned));
  }).then(function(sig){
    var jwt=unsigned+'.'+_fcmB64urlFromBytes(new Uint8Array(sig));
    return fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type='+encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')+'&assertion='+encodeURIComponent(jwt)});
  }).then(function(resp){return resp.json();}).then(function(data){
    if(!data.access_token)throw new Error('Falha ao obter token OAuth: '+JSON.stringify(data));
    _fcmAccessToken=data.access_token;_fcmAccessTokenExp=nowS+(data.expires_in||3600);
    return _fcmAccessToken;
  });
}

/* Manda a notificação pra 1 token específico via API FCM HTTP v1. Retorna
   {ok} ou {ok:false,unregistered:true} quando o token não existe mais
   (aparelho desinstalou o app, trocou de navegador etc.), pra podermos
   removê-lo da lista salva no Firestore. */
function _fcmSendToToken(token,title,body,data){
  return _fcmGetAccessToken().then(function(accessToken){
    return fetch('https://fcm.googleapis.com/v1/projects/'+FCM_PROJECT_ID+'/messages:send',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+accessToken},
      body:JSON.stringify({message:{token:token,notification:{title:title,body:body},data:data||{}}})
    });
  }).then(function(resp){
    if(resp.ok)return {ok:true};
    return resp.json().catch(function(){return {};}).then(function(err){
      var status=(err&&err.error&&err.error.status)||'';
      return {ok:false,unregistered:(status==='NOT_FOUND'||status==='UNREGISTERED')};
    });
  }).catch(function(e){console.error('FCM send error',e);return {ok:false,unregistered:false};});
}

/* Dispara o push pra todo mundo da sala (menos quem mandou a mensagem, quem
   silenciou a conversa e quem está bloqueado), lendo os tokens salvos em
   push_tokens/{uid}. Roda em segundo plano, nunca atrasa nem trava o envio
   da mensagem em si — se falhar, só fica sem notificação, a mensagem em si
   já foi salva normalmente no Firestore. */
function triggerChatPush(room,msg){
  try{
    if(!room||!msg||DB_MODE!=='firebase'||!db)return;
    if(!FCM_SERVICE_ACCOUNT.client_email||FCM_SERVICE_ACCOUNT.client_email.indexOf('COLE_AQUI')===0)return;
    var senderId=msg.senderId,memberIds=room.memberIds||[],memberState=room.memberState||{},blocked=room.blockedUserIds||[];
    var recipients=memberIds.filter(function(uid0){return uid0!==senderId&&blocked.indexOf(uid0)===-1&&!((memberState[uid0]||{}).muted);});
    if(!recipients.length)return;
    var title=(room.type==='group'&&room.title)?(room.title+' • '+(msg.senderName||'Nova mensagem')):(msg.senderName||'Nova mensagem');
    var body=msg.text||'';
    if(!body){var att=(msg.attachments||[])[0];body=att?('📎 '+(att.name||'anexo')):'Nova mensagem';}
    if(body.length>140)body=body.slice(0,137)+'...';
    recipients.forEach(function(uid0){
      db.collection('push_tokens').doc(uid0).get().then(function(docSnap){
        if(!docSnap.exists)return;
        var tokens=docSnap.data().tokens||[];
        if(!tokens.length)return;
        var toRemove=[];
        Promise.all(tokens.map(function(tok){
          return _fcmSendToToken(tok,title,body,{roomId:room.id,tag:'chat-'+room.id}).then(function(r){if(r.unregistered)toRemove.push(tok);});
        })).then(function(){
          if(toRemove.length)db.collection('push_tokens').doc(uid0).update({tokens:firebase.firestore.FieldValue.arrayRemove.apply(null,toRemove)}).catch(function(){});
        });
      }).catch(function(e){console.error('triggerChatPush token lookup',e);});
    });
  }catch(e){console.error('triggerChatPush',e);}
}

var _dip=null;

window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();_dip=e;var isk=false;try{isk=!!localStorage.getItem('lf_isk');}catch(e){}if(!isk){var ib=document.getElementById('ibar');if(ib)ib.classList.add('v');}});

function doInst(){var ib=document.getElementById('ibar');if(ib)ib.classList.remove('v');if(_dip)_dip.prompt();}

function skipInst(){var ib=document.getElementById('ibar');if(ib)ib.classList.remove('v');try{localStorage.setItem('lf_isk','1');}catch(e){}}
