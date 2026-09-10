/* =====================================================================
 * configuracoes.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

var __configRuntime=(((window.LiderCRM||{}).modules||{}).configuracoes||{}).runtime||{};
var _cfgWorkerClient=__configRuntime._cfgWorkerClient||function(){return null;};
var saveThemeRemote=__configRuntime.saveThemeRemote||function(){};
var loadThemeRemote=__configRuntime.loadThemeRemote||function(){};
var BG_OPTIONS=__configRuntime.BG_OPTIONS||[];
var renderConfig=__configRuntime.renderConfig||function(){};
var saveBGRemote=__configRuntime.saveBGRemote||function(){};
var loadBGRemote=__configRuntime.loadBGRemote||function(){};
var compressImageFile=__configRuntime.compressImageFile||function(_f,_s,cb){cb&&cb(null);};
/* setBG definida mais abaixo — fallback removido para evitar redeclaração */

// ============================================================
// FIX-THEME-RUNTIME (2026-07-22)
//
// Antes deste fix, setAppThemeMode / toggleAppTheme / applyThemeUI eram
// PEGADINHAS: liam de window.LiderCRM.modules.configuracoes.runtime e,
// como esse objeto nunca era populado no projeto, viravam stubs vazios
// (function(){}). Resultado:
//   • #nav-theme-btn (topbar) e #mmd-theme-link (menu mobile) NÃO faziam nada
//     ao serem clicados (o onclick="toggleAppTheme()" chamava um no-op).
//   • #mmd-theme-label mostrava SEMPRE "Tema escuro/vermelho" — não refletia
//     o estado atual nem depois de qualquer alternância.
//   • Plugins/patches que checam body.theme-classic (chat, transparência do
//     wallpaper, splash) ficavam travados como dark.
//   • _lfIsThemeDark() só via o body.class — se o body nunca recebia
//     .theme-classic, calculava luminância e decidia por ali; no entanto,
//     com a :root atual sempre escura, isso raramente virava "light".
//
// Aqui implementamos o runtime REAL: persiste em localStorage (lf_theme_mode),
// aplica classe + data-theme no body e no <html>, atualiza o label e o
// ícone dos dois botões, dispara toast e re-aplica a transparência do
// wallpaper para o novo alpha/blur.
// ============================================================
var THEME_KEY=function(uid){return 'lf_theme_mode'+(uid?'_'+uid:'');};
function _lfReadThemeMode(uid){
  try{
    var scoped=localStorage.getItem(THEME_KEY(uid));
    if(scoped==='classic'||scoped==='light')return scoped;
    var legacy=localStorage.getItem('lf_theme');
    if(legacy==='classic'||legacy==='light')return legacy;
  }catch(_e){}
  return 'classic';
}
function _lfWriteThemeMode(uid,mode){
  var safe=(mode==='light')?'light':'classic';
  try{localStorage.setItem(THEME_KEY(uid),safe);}catch(_e){}
  try{localStorage.setItem('lf_theme',safe);}catch(_e){}
  return safe;
}
var _lfThemeMode='classic';

function setAppThemeMode(mode,silent){
  if(mode!=='light')mode='classic';
  var uid=(S&&S.userId)||'';
  _lfThemeMode=_lfWriteThemeMode(uid,mode);
  applyThemeUI();
  if(!silent){try{saveThemeRemote(_lfThemeMode);}catch(_e){}}
}
function toggleAppTheme(){
  setAppThemeMode(_lfThemeMode==='light'?'classic':'light');
  try{toast(_lfThemeMode==='light'?'☀ Tema claro ativado':'🌙 Tema escuro ativado');}catch(_e){}
}
function applyThemeUI(){
  var isLight=_lfThemeMode==='light';
  var b=document.body;if(!b)return;
  if(isLight){
    b.classList.remove('theme-classic');
    b.classList.add('theme-light');
    b.setAttribute('data-theme','light');
  }else{
    b.classList.add('theme-classic');
    b.classList.remove('theme-light');
    b.setAttribute('data-theme','dark');
  }
  var d=document.documentElement;
  if(d){d.classList.toggle('lf-theme-dark',!isLight);d.classList.toggle('lf-theme-light',isLight);}
  var label=document.getElementById('mmd-theme-label');
  if(label)label.textContent=isLight?'☀ Tema claro ativo':'🌙 Tema escuro ativo';
  var btn=document.getElementById('nav-theme-btn');
  if(btn){
    btn.textContent=isLight?'☀':'🌙';
    btn.setAttribute('title',isLight?'Trocar para tema escuro':'Trocar para tema claro');
    btn.setAttribute('aria-label',isLight?'Trocar para tema escuro':'Trocar para tema claro');
  }
  // FIX-WP-TRANS: ao trocar tema, a transparência adaptativa do wallpaper
  // (alpha + blur) precisa ser recalculada — caso contrário, no tema claro
  // o overlay continuaria preto em 0.36 e a imagem ficaria lavada/esbranquiçada.
  try{
    var uid=(S&&S.userId)||'';
    var hasBg=!!(uid&&localStorage.getItem('lf13_bgphoto_'+uid));
    if(hasBg&&typeof _lfApplyWallpaperTransparency==='function')_lfApplyWallpaperTransparency(true);
  }catch(_e){}
}

/* FIX-THEME-BOOT: aplica antes do primeiro paint pra não piscar dark→light
   ao abrir; depois o app.js chama loadThemeRemote() e a versão do servidor
   (cross-device) pode sobrescrever em silêncio. */
(function _lfBootTheme(){
  try{
    var uid=(S&&S.userId)||'';
    _lfThemeMode=_lfReadThemeMode(uid);
  }catch(_e){_lfThemeMode='classic';}
  function _do(){applyThemeUI();}
  if(document.body){_do();}
  else if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',_do,{once:true});}
  else{_do();}
})();

document.addEventListener('click',function(e){if(!(typeof _ligWidgetOpen!=='undefined'&&_ligWidgetOpen))return;var w=document.getElementById('lig-widget'),fab=document.getElementById('lig-fab');if(w&&!w.contains(e.target)&&fab&&!fab.contains(e.target)){_ligWidgetOpen=false;w.style.display='none';}},{passive:true});

// ============================================================
// CONFIGURACOES
// ============================================================


function handleBGPhotoUpload(inp){
  var file=inp.files[0];if(!file)return;
  if(!file.type||!file.type.startsWith('image/')){toast('⚠️ Selecione um arquivo de imagem válido (JPG, PNG, WebP…)');inp.value='';return;}
  if(file.size>20*1024*1024){toast('⚠️ Imagem muito grande (máx. 20MB). Escolha uma foto menor.',4000);inp.value='';return;}
  toast('Otimizando imagem...',1500);
  compressImageFile(file,900000,function(data){
    if(!data){toast('⚠️ Não foi possível processar essa imagem.');inp.value='';return;}
    var okBG=S&&S.userId?ss('lf13_bgphoto_'+S.userId,data):false;
    // CORREÇÃO: antes, mesmo que ss() falhasse (armazenamento cheio), o código seguia e
    // chamava setBG('photo',true) — trocando o modo de fundo pra "foto" e sincronizando isso
    // pra outros dispositivos, mesmo sem nenhum dado de foto salvo (fundo ficava em branco).
    // Segue o mesmo padrão de guarda já usado em handlePicUpload: só ativa o modo foto se a
    // gravação local realmente funcionou.
    if(!okBG){toast('⚠️ Foto muito grande para o armazenamento local. Tente uma imagem menor.',4500);inp.value='';return;}
    setBG('photo',true);renderConfig();
    toast('Foto de fundo aplicada em todos os seus dispositivos!');
    inp.value='';
  });
}

function removeBGPhoto(){if(!S||!S.userId)return;try{localStorage.removeItem('lf13_bgphoto_'+S.userId);}catch(e){}setBG('default',true);renderConfig();toast('Foto de fundo removida.');}

function handlePicUpload(inp){
  var file=inp.files[0];if(!file)return;
  if(!file.type.startsWith('image/')){toast('⚠️ Selecione um arquivo de imagem válido (JPG, PNG, WebP…)');inp.value='';return;}
  if(file.size>20*1024*1024){toast('⚠️ Imagem muito grande. Use uma imagem menor que 20MB.',4000);inp.value='';return;}
  toast('Otimizando foto...',1500);
  compressImageFile(file,900000,function(data){
    if(!data||!data.startsWith('data:image/')){toast('⚠️ Arquivo inválido.');inp.value='';return;}
    if(!S||!S.userId){toast('Sessão inválida. Faça login novamente.');return;}
    var okPic=S&&S.userId?ss('lf13_pic_'+S.userId,data):false;
    if(!okPic){toast('⚠️ Foto muito grande para o armazenamento local. Tente uma imagem menor.',4500);return;}
    var pe=document.getElementById('cfg-pic-preview');if(pe)pe.innerHTML='<img src="'+_htmlAttr(data)+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
    var av=document.getElementById('nav-av');if(av)av.innerHTML='<img src="'+_htmlAttr(data)+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
    toast('Foto atualizada!');inp.value='';
  });
}

function removePic(){if(!S||!S.userId)return;ss('lf13_pic_'+S.userId,null);try{localStorage.removeItem('lf13_pic_'+S.userId);}catch(e){}var pe=document.getElementById('cfg-pic-preview');if(pe)pe.textContent=(S.nome||'?').charAt(0).toUpperCase();var av=document.getElementById('nav-av');if(av){av.innerHTML='';av.textContent=(S.nome||'?').charAt(0).toUpperCase();av.style.background=AVB[S.cor%AVB.length];}toast('Foto removida');}

function saveProfileData(){if(!S||!S.userId){toast('Sessão inválida. Faça login novamente.');return;}var nome=(document.getElementById('cfg-nome').value||'').trim();var email=(document.getElementById('cfg-email').value||'').trim();if(!nome){toast('Nome invalido');return;}var users=getUsers();var u=users.find(function(x){return x.id===S.userId;});if(!u)return;u.nome=nome;u.email=email;var okU=saveUsersLocal(users,u.id,{nome:nome,email:email});S.nome=nome;S.email=email;var okS=ss('lf6_s',S);var nu=document.getElementById('nav-un');if(nu)nu.textContent=nome;toast((okU&&okS)?'Dados salvos!':'⚠️ Pode não ter salvo — armazenamento local cheio.');}

// FASE 3.5 (pedido de segurança — melhorua_reforcado):
// changeMyPassword() NÃO gera mais o hash localmente nem grava
// u.ph em lf6_u — esse caminho antigo mantinha uma cópia do hash
// da senha no navegador (o mesmo vetor que a seed ADM explorava).
// Agora chama POST /api/v1/usuarios/change-password: o Worker
// valida a senha atual, gera o novo hash s2$saltHex$hashHex e
// grava direto no fs_documents (config/users/items/<uid>). O
// próximo login puxa o hash atualizado do servidor.
//
// Regras da nova senha (alinhadas com o schema do Worker):
// pelo menos 8 caracteres; diferente da atual; confirmação bate.
function changeMyPassword(){
  var old=(document.getElementById('cfg-pw-old').value||'').trim();
  var nw=document.getElementById('cfg-pw-new').value||'';
  var conf=document.getElementById('cfg-pw-confirm').value||'';
  var errEl=document.getElementById('cfg-pw-err');errEl.textContent='';
  if(!old){errEl.textContent='Informe a senha atual.';return;}
  nw=nw.trim();conf=conf.trim();
  if(nw.length<8){errEl.textContent='Mínimo 8 caracteres (sem espaços nas bordas).';return;}
  if(nw===old){errEl.textContent='A nova senha não pode ser igual à atual.';return;}
  if(nw!==conf){errEl.textContent='Senhas nao coincidem.';return;}

  var wc=window.LiderCRM&&window.LiderCRM.api&&window.LiderCRM.api.workerClient;
  if(!wc||typeof wc.changePassword!=='function'){
    errEl.textContent='Serviço indisponível. Recarregue e tente novamente.';return;
  }

  wc.changePassword({currentPassword:old,newPassword:nw}).then(function(){
    var _po=document.getElementById('cfg-pw-old');if(_po)_po.value='';
    var _pn=document.getElementById('cfg-pw-new');if(_pn)_pn.value='';
    document.getElementById('cfg-pw-confirm').value='';
    toast('Senha alterada!');
  }).catch(function(err){
    // O httpClient devolve o erro do envelope { ok:false, error:{ message } }
    var msg=(err&&err.data&&err.data.error&&err.data.error.message)
         ||(err&&err.message)
         ||'Não foi possível alterar a senha. Confirme a senha atual e tente novamente.';
    if(err&&(err.status===401||(err.data&&err.data.error&&err.data.error.code==='UNAUTHORIZED'))){
      errEl.textContent='Senha atual incorreta.';
    }else{
      errEl.textContent=msg;
    }
  });
}

function setBG(id,silent){
  if(!S||!S.userId){console.warn('[cfg] setBG: sessão inativa');return;}
  if(S&&S.userId)ss('lf13_bg_'+S.userId,id);applyBG(id);
  document.querySelectorAll('.bg-thumb').forEach(function(e){e.classList.remove('on');});
  var idx=BG_OPTIONS.findIndex(function(x){return x.id===id;});var ts=document.querySelectorAll('.bg-thumb');if(ts[idx])ts[idx].classList.add('on');
  // BUG CORRIGIDO: antes, "photoData" só era enviado quando id==='photo' — ao trocar para
  // qualquer OUTRO fundo, o Firestore era sobrescrito com photo:null (saveBGRemote usa
  // merge:false), apagando a foto personalizada da nuvem e de qualquer outro dispositivo
  // mesmo que o usuário só quisesse testar uma cor, sem intenção de apagar a foto. Agora
  // preserva a foto que já está salva localmente ao trocar de fundo — só é removida de
  // fato quando o próprio removeBGPhoto() a apaga do localStorage antes de chamar setBG().
  var photoData=(S&&S.userId)?sg('lf13_bgphoto_'+S.userId)||null:null;
  saveBGRemote(id,photoData);
  if(!silent)toast('Fundo aplicado em todos os seus dispositivos!');
}

/* R15-06 + FIX #16 (2026-07-20): papel de parede com transparência inteligente
   adaptativa por tema claro/escuro. Ajustado para deixar o wallpaper mais nítido:
   overlay preto translúcido no tema escuro, branco translúcido no claro e blur baixo
   para não lavar a imagem de fundo. */
function _bgOpacityForTheme(){
  var isClassic=document.body&&document.body.classList.contains('theme-classic');
  return isClassic?0.12:0.18;/* escuro: menos opacidade, claro: um pouco mais */
}

function _lfIsThemeDark(){
  // theme-classic = dark. Se algum dia trocar, também detecta pelo body.bg
  if(document.body && document.body.classList.contains('theme-classic')) return true;
  if(document.documentElement && document.documentElement.getAttribute('data-theme')==='dark') return true;
  try {
    var bg = getComputedStyle(document.body).backgroundColor || '';
    var m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
    if(m){
      var lum = (parseInt(m[1])+parseInt(m[2])+parseInt(m[3]))/3;
      return lum < 128;
    }
  } catch(_e){}
  return false;
}

/* FIX-WP-CONSOLIDATE (2026-07-28): _lfApplyWallpaperTransparency e
   _lfClearWallpaperTransparency ficam delegáveis a patches externos, mas o
   bundle limpo preserva aqui o fallback mínimo para o boot não depender de
   arquivos paralelos não registrados no HTML. */
function _lfApplyWallpaperTransparency(hasWallpaper){
  var st=document.getElementById('lf-wallpaper-transp-el');
  if(!st){st=document.createElement('style');st.id='lf-wallpaper-transp-el';document.head.appendChild(st);}
  if(!hasWallpaper){
    st.textContent='';
    document.documentElement.classList.remove('lf-has-wallpaper','lf-theme-dark','lf-theme-light');
    document.documentElement.style.removeProperty('--lf-has-wallpaper');
    document.documentElement.style.removeProperty('--lf-wallpaper-alpha');
    document.documentElement.style.removeProperty('--lf-wallpaper-blur');
    return;
  }
  var isDark=_lfIsThemeDark();
  var alpha=isDark?0.36:0.24;
  var bgRgb=isDark?'0, 0, 0':'255, 255, 255';
  var blur=isDark?2:1;
  st.textContent=
    '.kb-col, .kanban-column, .card, .kb-card, .lead-card,'+
    '.chat-conv-item, .chat-msgs, .chat-shell, .chat-side, .chat-main,'+
    '.topbar, header, .mo, .modal-content, [class*="modal-content"],'+
    '.adm-kpi, .adm-mini-k, .act-item, .act-panel, .cli-card,'+
    '.dash-card, .relat-panel, #pg-chat .chat-hd, #pg-chat .chat-compose'+
    '{background-color:rgba('+bgRgb+','+alpha+')!important;'+
    'backdrop-filter:blur('+blur+'px) saturate(1.03);'+
    '-webkit-backdrop-filter:blur('+blur+'px) saturate(1.03);}'+
    ':root{--lf-has-wallpaper:1;--lf-wallpaper-alpha:'+alpha+';--lf-wallpaper-blur:'+blur+'px;}';
  document.documentElement.classList.add('lf-has-wallpaper');
  document.documentElement.classList.toggle('lf-theme-dark',isDark);
  document.documentElement.classList.toggle('lf-theme-light',!isDark);
  document.documentElement.style.setProperty('--lf-has-wallpaper','1');
  document.documentElement.style.setProperty('--lf-wallpaper-alpha',String(alpha));
  document.documentElement.style.setProperty('--lf-wallpaper-blur',blur+'px');
}
function _lfClearWallpaperTransparency(){
  var st=document.getElementById('lf-wallpaper-transp-el');
  if(st)st.textContent='';
  document.documentElement.classList.remove('lf-has-wallpaper','lf-theme-dark','lf-theme-light');
  document.documentElement.style.removeProperty('--lf-has-wallpaper');
  document.documentElement.style.removeProperty('--lf-wallpaper-alpha');
  document.documentElement.style.removeProperty('--lf-wallpaper-blur');
}

function applyBG(id){
  var st=document.getElementById('bg-style-el');
  if(!st){st=document.createElement('style');st.id='bg-style-el';document.head.appendChild(st);}
  if(id==='photo'){
    var photoUrl=(S&&S.userId)?sg('lf13_bgphoto_'+S.userId):null;
    /* FIX-WP-JANK (2026-07-28): trocar background-attachment:fixed (que
       repinta a cada scroll em Capacitor/Android WebView) por um wrapper
       <div id="lf-wallpaper-bg-wrap"> position:fixed com compositor layer
       (transform:translateZ(0)). Resultado: wallpaper fica "preso" ao
       viewport sem repaint; scroll só move os painéis em cima. */
    if(photoUrl){
      st.textContent =
        "html,body{background-attachment:scroll!important;}" +
        "body,#app{background:transparent!important;}" +
        "#bg-orbs{z-index:0!important;}"+
        "#lf-wallpaper-bg-wrap{position:fixed;top:0;left:0;width:100vw;height:100vh;"+
          "z-index:0;background:url('"+photoUrl+"') center/cover no-repeat;"+
          "transform:translateZ(0);will-change:transform;pointer-events:none;}"+
        "#app,.topbar,#mobile-top-bar,#mobile-bottom-nav,.pg,.mo,header{position:relative;z-index:1;}";
      var _wpWrap=document.getElementById('lf-wallpaper-bg-wrap');
      if(!_wpWrap){
        _wpWrap=document.createElement('div');
        _wpWrap.id='lf-wallpaper-bg-wrap';
        _wpWrap.setAttribute('aria-hidden','true');
        document.body.insertBefore(_wpWrap, document.body.firstChild);
      } else {
        _wpWrap.style.background="url('"+photoUrl+"') center/cover no-repeat";
      }
    } else {
      st.textContent='';
      var _wpWrap2=document.getElementById('lf-wallpaper-bg-wrap');
      if(_wpWrap2) _wpWrap2.style.background='none';
    }
    // FIX #16: aplicar transparência adaptativa quando tem foto
    _lfApplyWallpaperTransparency(!!photoUrl);
    return;
  }
  var bg=BG_OPTIONS.find(function(x){return x.id===id;});
  st.textContent=(bg&&bg.css&&bg.id!=='photo')?'body,#app{'+bg.css+'}':'';
  // FIX #16: fundo sem foto → limpa transparência
  _lfClearWallpaperTransparency();
}

// FIX-WP-CONSOLIDATE (2026-07-28): evitamos duplicar MutationObserver aqui;
// o fluxo principal continua via hooks já instalados neste bundle.

// FIX #11 (2026-07-20 v3): toggle "Ocultar ADM das listas" — persistido em localStorage
// (chave lf_hide_adm_lists). Lido por renderUsers() em js/usuarios.js e por qualquer outra
// lista futura que queira respeitar a preferência. Somente ADM/Gestor consegue mexer.
function getHideAdmInLists(){
  try{var v=localStorage.getItem('lf_hide_adm_lists');return v==='1'||v==='true';}catch(_e){return false;}
}
function setHideAdmInLists(on){
  if(typeof hasAdminAccess==='function' && !hasAdminAccess()){toast('Apenas ADM/Gestor pode alterar.');return;}
  try{localStorage.setItem('lf_hide_adm_lists', on?'1':'0');}catch(_e){}
  toast(on?'ADM ficará oculto das listas.':'ADM voltará a aparecer nas listas.');
  try{if(typeof renderUsers==='function')renderUsers();}catch(_e){}
  try{if(typeof agdFillConsultorFilter==='function')agdFillConsultorFilter();}catch(_e){}
  try{if(typeof agdFillConsultorSelect==='function')agdFillConsultorSelect();}catch(_e){}
}
function _lfInitHideAdmToggle(){
  var cb=document.getElementById('cfg-hide-adm-lists');if(!cb)return;
  cb.checked=getHideAdmInLists();
  var sec=document.getElementById('cfg-adm-visibility-section');
  if(sec && typeof hasAdminAccess==='function') sec.style.display=hasAdminAccess()?'block':'none';
  // 2026-08-05: seção de Manutenção passou a hospedar o diagnóstico de
  // push (antes um botão visível pra qualquer um na aba Papo) — só
  // ADM/Gestor deve ver ("escondida" a pedido do usuário).
  var secMan=document.getElementById('cfg-manutencao-section');
  if(secMan && typeof hasAdminAccess==='function') secMan.style.display=hasAdminAccess()?'block':'none';
}
try{document.addEventListener('DOMContentLoaded',_lfInitHideAdmToggle);}catch(_e){}

// FIX 8: trocar logo do CRM
// CORREÇÃO "LOGO NÃO SALVA UNIVERSAL": antes só gravava em localStorage (só no aparelho
// onde foi trocada). Agora replica pro Firestore (config/logo), no mesmo padrão já usado
// por admDocs/automation_rules, então qualquer dispositivo que abrir o CRM (loadLogoRemote,
// chamado no boot) busca a logo mais recente da nuvem antes de aplicar.
function admChangeLogo(input){
  // CORREÇÃO (auditoria — controle de acesso, mesma classe do bug do scanner de
  // Duplicatas): a função em si não checava hasAdminAccess(), só confiava na seção
  // 'cfg-identidade-section' estar escondida (display:none) pra quem não é ADM/Gestor.
  // Como todas as funções deste arquivo são globais (window.admChangeLogo, etc.), qualquer
  // consultor logado podia chamar admChangeLogo()/admResetLogo()/admChangeCRMName*() direto
  // pelo console e trocar a logo/nome do CRM pra TODA a equipe (grava em config/logo e
  // config/crmname no Firestore, sem filtro de dono). Checagem adicionada aqui e nas
  // 4 funções irmãs abaixo.
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode trocar a logo.');return;}
  var file=input.files[0];if(!file)return;
  if(!file.type||!file.type.startsWith('image/')){toast('⚠️ Selecione um arquivo de imagem válido');input.value='';return;}
  if(file.size>20*1024*1024){toast('⚠️ Imagem muito grande (máx. 20MB). Escolha um arquivo menor.',4000);input.value='';return;}
  toast('Otimizando logo...',1500);
  compressImageFile(file,900000,function(data){
    if(!data){toast('⚠️ Não foi possível processar essa imagem.');input.value='';return;}
    try{localStorage.setItem('lf_custom_logo',data);}catch(err){toast('❌ Armazenamento cheio ou modo privado');input.value='';return;}
    applyCustomLogo(data);
    var wc=_cfgWorkerClient();
    if(wc){syncBusy();wc.putConfig('logo',{data:data}).then(function(){syncOk();toast('✅ Logo atualizada em todos os dispositivos!');}).catch(function(e2){syncErr(e2);toast('⚠️ Logo salva neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
    else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('logo').set({data:data,ts:Date.now()}).then(function(){syncOk();toast('✅ Logo atualizada em todos os dispositivos!');}).catch(function(e2){syncErr(e2);toast('⚠️ Logo salva neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
    else toast('✅ Logo atualizada! (modo offline — só neste aparelho até reconectar)');
    input.value='';
  });
}

function admResetLogo(){
  // CORREÇÃO (auditoria — controle de acesso): ver comentário em admChangeLogo().
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode resetar a logo.');return;}
  try{localStorage.removeItem('lf_custom_logo');}catch(e){}
  applyCustomLogo(null);
  var wc=_cfgWorkerClient();
  if(wc){syncBusy();wc.deleteConfig('logo').then(syncOk).catch(syncErr);}
  else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('logo').delete().then(syncOk).catch(syncErr);}
  toast('Logo resetada para o padrão em todos os dispositivos');
}

/* Busca a logo oficial mais recente salva pelo ADM na nuvem e aplica — chamada no boot
   (startApp) pra garantir que um dispositivo novo/outro celular mostre a MESMA logo que
   foi configurada no PC, em vez de depender do que já está em localStorage local. */
function loadLogoRemote(cb){
  // CORREÇÃO (auditoria, Etapa 1 — consistência local-first): pinta imediatamente com a
  // logo já salva neste aparelho, e só then aplica a versão mais recente da nuvem (sem isso,
  // o boot em modo Firebase mostrava a logo padrão/em branco até a rede responder).
  var l0=null;try{l0=localStorage.getItem('lf_custom_logo');}catch(e){}
  cb(l0);
  var wc=_cfgWorkerClient();
  if(wc){
    wc.getConfig('logo').then(function(doc){
      var data=doc?(doc.data||null):null;
      if(data){try{localStorage.setItem('lf_custom_logo',data);}catch(e){}}
      else{try{localStorage.removeItem('lf_custom_logo');}catch(e){}}
      cb(data);
    }).catch(function(e){console.warn("[cfg] loadLogoRemote worker falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('logo').get().then(function(d){
      var data=d.exists?(d.data().data||null):null;
      if(data){try{localStorage.setItem('lf_custom_logo',data);}catch(e){}}
      else{try{localStorage.removeItem('lf_custom_logo');}catch(e){}}
      cb(data);
    }).catch(function(e){console.warn("[cfg] loadLogoRemote firebase falhou",e);});
  }
}

function applyCustomLogo(dataUrl){
  // BUG CORRIGIDO: faltava ".mtb-logo" nesta lista — a barra superior mobile
  // nunca recebia a logo personalizada do ADM (nem era resetada para a oficial).
  document.querySelectorAll('.nmo,.splash-mon,.lmon,.mtb-logo').forEach(function(el){
    var src=dataUrl||LF_OFFICIAL_LOGO;
    var appName=(window.LiderCRM&&window.LiderCRM.config&&window.LiderCRM.config.appName)||'Líder CRM';
    var alt=dataUrl?'Logo personalizada':appName;
    el.innerHTML='<img src="'+_htmlAttr(src)+'" alt="'+eH(alt)+'" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">';
  });
  var prev=document.getElementById('adm-logo-preview');
  // BUG CORRIGIDO: sem logo personalizada o preview ficava com texto "Atual"
  // em vez de mostrar a logo oficial realmente em uso no CRM.
  if(prev)prev.innerHTML='<img src="'+_htmlAttr(dataUrl||LF_OFFICIAL_LOGO)+'" alt="Logo atual" style="width:100%;height:100%;object-fit:contain">';
}

// ============================================================
// NOME DO CRM (Identidade Visual) — troca o texto "LIDER CRM" exibido em toda a
// interface (splash, menu, dashboard, painel ADM). Duas opções, iguais à da logo:
// (1) texto simples, que usa a mesma fonte já usada no sistema; ou (2) uma imagem
// PNG pronta (com a cor/fonte/nome que o ADM quiser), sem limite de tamanho — nesse
// caso a imagem substitui o texto em todo canto onde o nome apareceria.
// Persiste em localStorage + Firestore (config/crmname), igual ao padrão da logo,
// pra funcionar em todos os dispositivos da equipe.
// ============================================================
function applyCRMBranding(nameText,imageData){
  var html=imageData
    ? '<img src="'+_htmlAttr(imageData)+'" alt="Nome do CRM" style="max-height:1.15em;max-width:170px;vertical-align:middle;object-fit:contain">'
    : eH(nameText||((window.LiderCRM&&window.LiderCRM.config&&window.LiderCRM.config.appShortName)||'LIDER CRM'));
  document.querySelectorAll('.crm-brand-name').forEach(function(el){el.innerHTML=html;});
  var prev=document.getElementById('adm-crm-name-preview');
  if(prev)prev.innerHTML=html;
}

function saveCRMNameRemote(payload){
  try{localStorage.setItem('lf_custom_crm_name',JSON.stringify(payload));}catch(err){toast('❌ Armazenamento cheio ou modo privado');return false;}
  var wc=_cfgWorkerClient();
  if(wc){syncBusy();wc.putConfig('crmname',{data:payload}).then(function(){syncOk();toast('✅ Nome do CRM atualizado em todos os dispositivos!');}).catch(function(e2){syncErr(e2);toast('⚠️ Nome salvo neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
  else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('crmname').set({data:payload,ts:Date.now()}).then(function(){syncOk();toast('✅ Nome do CRM atualizado em todos os dispositivos!');}).catch(function(e2){syncErr(e2);toast('⚠️ Nome salvo neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
  else toast('✅ Nome do CRM atualizado! (modo offline — só neste aparelho até reconectar)');
  return true;
}

function admChangeCRMNameText(){
  // CORREÇÃO (auditoria — controle de acesso): ver comentário em admChangeLogo().
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode alterar o nome do CRM.');return;}
  var inp=document.getElementById('cfg-crm-name-input');
  var name=(inp&&inp.value||'').trim();
  if(!name){toast('Digite um nome para o CRM');return;}
  if(!saveCRMNameRemote({name:name,img:null}))return;
  applyCRMBranding(name,null);
}

function admChangeCRMNameImage(input){
  // CORREÇÃO (auditoria — controle de acesso): ver comentário em admChangeLogo().
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode alterar o nome do CRM.');return;}
  var file=input.files[0];if(!file)return;
  if(!file.type||!file.type.startsWith('image/')){toast('⚠️ Selecione um arquivo de imagem válido');input.value='';return;}
  // Sem limite de MB, conforme solicitado — envia a imagem original (sem recompressão),
  // preservando fielmente a cor, a fonte e o nome escolhidos na arte enviada.
  toast('Enviando imagem do nome...',1500);
  var reader=new FileReader();
  reader.onload=function(e){
    var data=e.target.result;
    if(!saveCRMNameRemote({name:null,img:data})){input.value='';return;}
    applyCRMBranding(null,data);
    input.value='';
  };
  reader.onerror=function(){toast('⚠️ Não foi possível ler essa imagem.');input.value='';};
  reader.readAsDataURL(file);
}

function admResetCRMName(){
  // CORREÇÃO (auditoria — controle de acesso): ver comentário em admChangeLogo().
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode resetar o nome do CRM.');return;}
  try{localStorage.removeItem('lf_custom_crm_name');}catch(e){}
  applyCRMBranding(null,null);
  var wc=_cfgWorkerClient();
  if(wc){syncBusy();wc.deleteConfig('crmname').then(syncOk).catch(syncErr);}
  else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('crmname').delete().then(syncOk).catch(syncErr);}
  var inp=document.getElementById('cfg-crm-name-input');if(inp)inp.value='';
  toast('Nome do CRM resetado para o padrão em todos os dispositivos');
}

function loadCRMNameRemote(cb){
  // CORREÇÃO (auditoria, Etapa 1 — consistência local-first): idem loadLogoRemote.
  var l0=null;try{l0=JSON.parse(localStorage.getItem('lf_custom_crm_name'));}catch(e){}
  cb(l0);
  var wc=_cfgWorkerClient();
  if(wc){
    wc.getConfig('crmname').then(function(doc){
      var payload=doc?(doc.data||null):null;
      if(payload){try{localStorage.setItem('lf_custom_crm_name',JSON.stringify(payload));}catch(e){}}
      else{try{localStorage.removeItem('lf_custom_crm_name');}catch(e){}}
      cb(payload);
    }).catch(function(e){console.warn("[cfg] loadCRMNameRemote worker falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('crmname').get().then(function(d){
      var payload=d.exists?(d.data().data||null):null;
      if(payload){try{localStorage.setItem('lf_custom_crm_name',JSON.stringify(payload));}catch(e){}}
      else{try{localStorage.removeItem('lf_custom_crm_name');}catch(e){}}
      cb(payload);
    }).catch(function(e){console.warn("[cfg] loadCRMNameRemote firebase falhou",e);});
  }
}

// CORREÇÃO (auditoria, a pedido do usuário): quando o arquivo .html é aberto direto por um
// gerenciador de arquivos/anexo (Chrome Android abre como "content://...", ou em outros
// navegadores/desktop como "file://..."), o app carregava o HTML estático (cabeçalho, menu
// de baixo) só que a tela ficava em branco a partir dali — sem nenhuma mensagem explicando o
// motivo. A causa raiz: sob esses esquemas a origem passa a ser instável/opaca pro navegador,
// e localStorage (sg()/ss()) e a conexão com o Firestore não funcionam de forma confiável
// nela — sg()/ss() já tratam erro de storage internamente com try/catch (ver definição de sg/ss),
// então a falha ficava muda: sem exceção visível, sem toast, só um app que nunca termina de
// carregar. Esta checagem roda ANTES de qualquer tentativa de ler storage ou conectar ao
// Firebase, e mostra uma mensagem clara reaproveitando os elementos de erro da splash screen
// (#sp-err/#sp-spin), que já existiam no HTML mas não eram usados por nenhum código.
function _checkRunEnvironment(){
  var proto=location.protocol;
  // FIX v15 (CRÍTICO — resolvia "não conecta no app Capacitor"):
  // Antes só liberava http:/https:. O app empacotado com Capacitor Android usa
  // origin `capacitor://localhost` e o iOS usa `ionic://localhost` (ou `capacitor:`).
  // Isso batia no ramo do `return true` — que BLOQUEIA o boot inteiro e nunca
  // chama initDB(). Resultado: no app instalado a splash mostrava a mensagem
  // "arquivo aberto diretamente" (ou ficava presa) e a nuvem NUNCA era chamada.
  //
  // Agora liberamos todos os schemes usados por app nativo (Capacitor / Ionic /
  // Cordova / Android WebView / iOS WKWebView / PWA instalado):
  //   http:, https:, capacitor:, ionic:, file:
  // file:// só entra aqui para PWAs empacotadas / assets locais legítimos —
  // se o usuário DE VERDADE abriu o index.html clicando no arquivo, o
  // localStorage ainda funciona no Chromium moderno, então preferimos deixar
  // passar (com um warning) a bloquear injustamente o app Capacitor.
  var isCap = false;
  try { isCap = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch(_e){}
  if(proto==='http:'||proto==='https:'||proto==='capacitor:'||proto==='ionic:'||isCap){
    return false; // ambiente normal / app nativo — segue o boot
  }
  if(proto==='file:'){
    // Só mostramos aviso amigável. Não bloqueamos — deixamos initDB() rodar em modo local.
    try{console.warn('[LiderCRM] rodando em file:// — localStorage funciona, sync desativada.');}catch(_e){}
    return false;
  }
  // Qualquer outro scheme desconhecido (about:, chrome-extension:, data:, etc.)
  var spin=document.getElementById('sp-spin');if(spin)spin.style.display='none';
  var sub=document.querySelector('#splash .splash-sub');
  if(sub)sub.textContent='Não foi possível abrir o app desta forma.';
  var err=document.getElementById('sp-err');
  if(err){
    err.style.display='block';
    err.innerHTML='Este arquivo foi aberto por um endereço não suportado (<strong>'+eH(proto)+'//</strong>).'
      +'<br><br>Peça o link de acesso correto (<strong>https://...</strong>) a quem administra o sistema, ou abra pelo atalho salvo na tela inicial.';
  }
  return true; // bloqueia o boot normal
}

(function(){
  var __bootStarted=false;
  function startBoot(){
    if(__bootStarted)return;
    __bootStarted=true;
    if(_checkRunEnvironment())return;
    var kickoff=function(){try{initDB();}catch(e){console.error('startBoot initDB',e);try{usarLocal('Modo offline (boot)');}catch(_e){}}};
    try{
      var p=window.__lfLegacyCleanupPromise;
      if(p&&typeof p.then==='function'){
        var done=false;
        var runOnce=function(){if(done)return;done=true;kickoff();};
        p.then(runOnce).catch(runOnce);
        setTimeout(runOnce,1800);
        return;
      }
    }catch(e){}
    kickoff();
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',startBoot,{once:true});
    // Fallback importante para hosts estáticos: se algum script externo com defer travar/bloquear,
    // o DOMContentLoaded pode demorar demais e a splash fica infinita. Após alguns segundos,
    // iniciamos o CRM mesmo assim; se o Firebase ainda não estiver pronto, o próprio initDB
    // já faz fallback seguro.
    setTimeout(startBoot,2500);
  }else{
    startBoot();
  }
  document.addEventListener('DOMContentLoaded',function(){if(typeof applyThemeUI==='function')applyThemeUI();},{once:true});
  if(document.readyState!=='loading'&&typeof applyThemeUI==='function')applyThemeUI();
})();
