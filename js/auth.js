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
// ============================================================
var CARGOS_NIVEL_ADMIN=['gerente','gestor','representante','master'];

// Hierarquia de cargos. Quanto maior o nivel, mais acesso.
// 1=Consultor/Funcionário, 2=Orientador (mesmo acesso que Consultor — apenas
// proprios leads/negocios/dashboard/analytics/dicionario/config),
// 3=Supervisor (ve a equipe do mesmo time, mas SEM painel ADM),
// 4=Gerente/Gestor/Representante/Master (acesso total, igual ADM), 5=ADM (nivel maximo).
var CARGO_NIVEIS=[
  {nivel:1,match:['consultor','funcionário','funcionario']},
  {nivel:2,match:['orientador']},
  {nivel:3,match:['supervisor']},
  {nivel:4,match:['gerente','gestor','representante','master']}
];

/* Retorna o nivel numerico do cargo do usuario. ADM sempre é o nível máximo (5).
   Cargos nao reconhecidos caem no nivel 1 (acesso basico), por seguranca. */
function getCargoNivel(uid){
  uid=uid||(S?S.userId:null);if(!uid)return 1;
  if(uid==='adm')return 5;
  var u=getUser(uid);if(!u)return 1;
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

function hasAdminAccess(uid){
  uid=uid||(S?S.userId:null);if(!uid)return false;
  if(uid==='adm')return true;
  var u=getUser(uid);if(!u)return false;
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
  var isSupervisor=!isAdmin&&c.indexOf('supervisor')>=0;
  var adminToggle=document.getElementById(selId==='k-cargo'?'k-admin-toggle':'eu-admin-toggle');
  if(adminToggle)adminToggle.style.display=(isAdmin||isSupervisor)?'block':'none';
  if(isAdmin){
    note.style.display='block';
    note.innerHTML='&#128737; Este cargo tem acesso ao Painel ADM (métricas, usuários, feed), igual ao Gerente. As funções de consultor continuam normalmente.';
  }else if(isSupervisor){
    note.style.display='block';
    note.innerHTML='&#128065; Cargo Supervisor: vê leads e negócios da equipe (aba Time), mas NÃO acessa o painel ADM.';
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
function loadCli(uid,cb){
  cb(getCliLocal(uid));
  if(DB_MODE==='firebase'&&db){
    db.collection('clientes').doc(uid).get().then(function(d){
      var server=d.exists?(d.data().list||[]):[];
      var merged=_mergeKeepLocalOnly(server,getCliLocal(uid));
      ss(ck(uid),merged);
      if(merged.length!==server.length)saveCli(uid,merged); // reenvia o(s) item(ns) local(is) que ainda não estavam no servidor
      cb(merged);
    }).catch(function(){});
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

function doLogin(){
  var now=Date.now();
  if(_loginLockUntil>now){var secs=Math.ceil((_loginLockUntil-now)/1000);document.getElementById('lerr').textContent='Muitas tentativas. Aguarde '+secs+'s.';return;}
  var em=(document.getElementById('le').value||'').trim().toLowerCase();
  var pw=document.getElementById('lp').value||'';
  var er=document.getElementById('lerr');er.textContent='';
  var btn=document.getElementById('btn-login');
  if(!em||!pw){er.textContent='Preencha e-mail e senha.';return;}
  btn.textContent='Entrando...';btn.disabled=true;
  loadUsersDB(function(users){
    var u=users.find(function(x){return x.email.toLowerCase()===em;});
    if(!u){
      btn.textContent='Entrar';btn.disabled=false;_loginAttempts++;
      if(_loginAttempts>=5){_loginLockUntil=Date.now()+30000;_loginAttempts=0;_persistLoginLock();er.textContent='Muitas tentativas. Aguarde 30s.';return;}
      _persistLoginLock();
      er.textContent='E-mail nao encontrado.';return;
    }
    if(!u.ativo){btn.textContent='Entrar';btn.disabled=false;er.textContent='Conta desativada.';return;}
    verifyPw(u,pw).then(function(ok){
      btn.textContent='Entrar';btn.disabled=false;
      if(!ok){
        _loginAttempts++;
        if(_loginAttempts>=5){_loginLockUntil=Date.now()+30000;_loginAttempts=0;_persistLoginLock();er.textContent='Muitas tentativas. Aguarde 30s.';return;}
        _persistLoginLock();
        er.textContent='Senha incorreta. ('+_loginAttempts+'/5)';return;
      }
      _loginAttempts=0;_loginLockUntil=0;_persistLoginLock();
      S={userId:u.id,role:u.role,nome:u.nome,email:u.email,cor:u.cor||0};
      ss('lf6_s',S);startApp();
      // Upgrade silencioso: se o login funcionou com o hash legado (DJB2),
      // troca pro hash seguro (SHA-256 + salt) sem o usuario perceber.
      if((u.ph||'').indexOf('s2$')!==0){
        shSecure(pw).then(function(newHash){
          var allUsers=getUsers();var uu=allUsers.find(function(x){return x.id===u.id;});
          if(uu){uu.ph=newHash;saveUsersLocal(allUsers,uu.id,{ph:newHash});}
        }).catch(function(){}); // upgrade de hash e "best effort": falha aqui nao pode afetar o login ja concluido
      }
    }).catch(function(){
      // Sem isso, uma falha do Web Crypto (ex.: WebView Android com suporte parcial/quebrado
      // de crypto.subtle) deixava o botao travado para sempre em "Entrando..." sem nenhum
      // feedback ao usuario, exigindo recarregar a pagina. Ver [SUSPEITO] da rodada anterior.
      btn.textContent='Entrar';btn.disabled=false;
      er.textContent='Nao foi possivel validar a senha neste dispositivo. Tente novamente.';
    });
  });
}

function _execLogout(){
  if(typeof agdStopListening==='function')agdStopListening();
  if(window._actInterval){clearInterval(window._actInterval);window._actInterval=null;}
  if(window._sessInterval){clearInterval(window._sessInterval);window._sessInterval=null;}
  if(window._ntfInterval){clearInterval(window._ntfInterval);window._ntfInterval=null;}
  if(window._autoEngineInterval){clearInterval(window._autoEngineInterval);window._autoEngineInterval=null;}
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

function checkSes(){var s=sg('lf6_s');if(!s)return false;var u=getUser(s.userId);if(!u||!u.ativo){try{localStorage.removeItem('lf6_s');}catch(e){}return false;}S=s;return true;}

function getMyRole(){return hasAdminAccess()?'gestor':'consultor';}
