(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var configuracoes = modules.configuracoes = modules.configuracoes || {};

  // Aplica o tema salvo ANTES do primeiro paint (evita "flash" do tema errado ao carregar).
function setAppThemeMode(mode,silent){
  var classic=mode==='classic';
  if(document.body)document.body.classList.toggle('theme-classic',classic);
  try{localStorage.setItem('lf_theme',classic?'classic':'light');}catch(_e){}
  if(typeof applyThemeUI==='function')applyThemeUI();
  if(!silent&&typeof toast==='function')toast(classic?'🎨 Tema escuro/vermelho ativado.':'🎨 Tema claro ativado.');
  /* FIX #16: re-aplica transparência do wallpaper ao trocar tema */
  try{
    if(typeof _lfApplyWallpaperTransparency==='function'&&document.documentElement.classList.contains('lf-has-wallpaper')){
      var _S=global.S;var _uid=(_S&&_S.userId)||'';
      if(_uid&&localStorage.getItem('lf13_bgphoto_'+_uid))_lfApplyWallpaperTransparency(true);
    }
  }catch(_e){}
}

try{setAppThemeMode(localStorage.getItem('lf_theme')==='classic'?'classic':'light',true);}catch(_e){}

// FASE 3.3 (parte 7, 2026-07-18): as 10 chamadas de db.collection('config')
// deste arquivo são todas documento único por nome (theme_<uid>, bg_<uid>,
// logo, crmname) — exatamente o formato genérico que /api/v1/usuarios/config
// (Fase 3.2) já expõe e que a parte 5 (js/leads.js) já reaproveitou via
// getConfig/putConfig. Esta parte acrescenta só deleteConfig (novo — logo e
// nome do CRM têm reset, que no legado é um delete). Mesmo padrão de helper
// _kbWorkerClient/_agdWorkerClient das partes anteriores.
function _cfgWorkerClient(){
  var root=window.LiderCRM;
  var wc=root&&root.api&&root.api.workerClient;
  return (root&&root.config&&root.config.useWorkerApi&&wc&&typeof wc.getConfig==='function')?wc:null;
}

function saveThemeRemote(mode){
  if(!S||!S.userId)return;
  var payload={mode:(mode==='classic'?'classic':'light'),ts:Date.now()};
  var wc=_cfgWorkerClient();
  if(wc){syncBusy();wc.putConfig('theme_'+S.userId,payload).then(syncOk).catch(function(e){syncErr(e);toast('⚠️ Tema salvo neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
  else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('theme_'+S.userId).set(payload,{merge:false}).then(syncOk).catch(function(e){syncErr(e);toast('⚠️ Tema salvo neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
}

function loadThemeRemote(uid,cb){
  var localMode='light';
  try{localMode=localStorage.getItem('lf_theme')==='classic'?'classic':'light';}catch(_e){}
  if(typeof cb==='function')cb(localMode);
  if(!uid)return;
  var wc=_cfgWorkerClient();
  if(wc){
    wc.getConfig('theme_'+uid).then(function(doc){
      if(doc){
        var mode=doc.mode==='classic'?'classic':'light';
        try{localStorage.setItem('lf_theme',mode);}catch(_e){}
        if(typeof cb==='function')cb(mode);
      }
    }).catch(function(e){console.warn("[prefs] sync bg falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('theme_'+uid).get().then(function(d){
      if(d.exists&&d.data()){
        var mode=d.data().mode==='classic'?'classic':'light';
        try{localStorage.setItem('lf_theme',mode);}catch(_e){}
        if(typeof cb==='function')cb(mode);
      }
    }).catch(function(e){console.warn("[prefs] sync bg falhou",e);});
  }
}

// Aplica a altura salva da barra de digitação do Messenger ANTES do primeiro paint
// (evita "flash" do valor padrão antes do valor customizado ser aplicado).
try{var _lfCg=parseInt(localStorage.getItem('lf_chat_gap'),10);if(!isNaN(_lfCg))document.documentElement.style.setProperty('--lf-chat-gap-user',Math.max(0,Math.min(60,_lfCg))+'px');}catch(_e){}

var BG_OPTIONS=[{id:'default',label:'Padrão',css:''},{id:'navy',label:'Azul',css:'background:linear-gradient(135deg,#0a1a2e 0%,#0a0c10 60%)!important'},{id:'forest',label:'Verde',css:'background:linear-gradient(135deg,#0a1a10 0%,#0a0c10 60%)!important'},{id:'purple',label:'Roxo',css:'background:linear-gradient(135deg,#150a2a 0%,#0a0c10 60%)!important'},{id:'gold',label:'Dourado',css:'background:linear-gradient(135deg,#1a1200 0%,#0a0c10 60%)!important'},{id:'slate',label:'Cinza',css:'background:linear-gradient(135deg,#0f1218 0%,#0a0c10 60%)!important'},{id:'photo',label:'Foto',css:'/* photo */'}];

// FEATURE (a pedido do usuário): alternar entre o tema claro atual e o tema escuro/vermelho
// original. Ver comentário completo no <style id="lf-theme-classic"> no <head>.
function applyThemeUI(){
  var on=document.body.classList.contains('theme-classic');
  var btn=el('nav-theme-btn');if(btn)btn.title=on?'Tema atual: escuro/vermelho (tocar pra usar o claro)':'Tema atual: claro (tocar pra usar o escuro/vermelho)';
  var lbl=el('mmd-theme-label');if(lbl)lbl.textContent=on?'Tema claro (atual: escuro)':'Tema escuro/vermelho';
}

function toggleAppTheme(){
  var on=!document.body.classList.contains('theme-classic');
  var mode=on?'classic':'light';
  setAppThemeMode(mode,false);
  saveThemeRemote(mode);
}


  function _bgPreviewStyle(bg,photoUrl){if(bg.id==='photo'){return photoUrl?"background:url('"+photoUrl+"') center/cover no-repeat":"background:rgba(255,255,255,.08)";}if(bg.id==='navy')return'background:linear-gradient(135deg,#0a1a2e,#0a0c10)';if(bg.id==='forest')return'background:linear-gradient(135deg,#0a1a10,#0a0c10)';if(bg.id==='purple')return'background:linear-gradient(135deg,#150a2a,#0a0c10)';if(bg.id==='gold')return'background:linear-gradient(135deg,#1a1200,#0a0c10)';if(bg.id==='slate')return'background:linear-gradient(135deg,#0f1218,#0a0c10)';return'background:var(--bg2)';}

function renderConfig(){
  var isAdm=hasAdminAccess();
  ['cfg-identidade-section','cfg-automacoes-section','cfg-manutencao-section'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.style.display=isAdm?'':'none';
  });
  if(isAdm)loadAutomationRulesRemote(function(){renderAutoRules();});
  var pic=sg('lf13_pic_'+S.userId);var pe=document.getElementById('cfg-pic-preview');
  if(pe){if(pic)pe.innerHTML='<img src="'+_htmlAttr(pic)+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';else pe.textContent=(S.nome||'?').charAt(0).toUpperCase();}
  var u=getUser(S.userId);
  if(u){var cn=document.getElementById('cfg-nome');if(cn)cn.value=u.nome||'';var ce=document.getElementById('cfg-email');if(ce)ce.value=u.email||'';}
  var cur=sg('lf13_bg_'+S.userId)||'default';
  var photoUrl=sg('lf13_bgphoto_'+S.userId)||null;
  var te=document.getElementById('bg-thumbs');
  if(te)te.innerHTML=BG_OPTIONS.map(function(bg){
    var st=_bgPreviewStyle(bg,photoUrl);
    var icon=bg.id==='photo'?'<span style="font-size:.75rem">\uD83D\uDCF7</span>':'<span style="font-size:.55rem;color:rgba(255,255,255,.5)">'+bg.label+'</span>';
    return '<div class="bg-thumb'+(cur===bg.id?' on':'')+'" style="'+st+';display:flex;align-items:center;justify-content:center" onclick="setBG(\''+bg.id+'\')" tabindex="0" role="button">'+icon+'</div>';
  }).join('');
  var rb=document.getElementById('cfg-bg-remove-btn');if(rb)rb.style.display=(cur==='photo'&&photoUrl)?'inline-block':'none';
  var ns=document.getElementById('cfg-notif-status');if(ns&&'Notification' in window)ns.textContent='Status: '+(Notification.permission==='granted'?'Ativadas':Notification.permission==='denied'?'Bloqueadas':'Nao solicitadas');
  var car=document.getElementById('cfg-auto-reminder');if(car)car.checked=isAutoReminderOn();
  if(typeof setChatComposeGap==='function'){var gv=typeof getChatComposeGap==='function'?getChatComposeGap():4;setChatComposeGap(gv);}
}

/* CORREÇÃO "CAPA NÃO SALVA UNIVERSAL": igual à logo, a foto de fundo/capa só ficava em
   localStorage (por aparelho). Agora sobe pro Firestore em config/bg_<uid> — cada usuário
   tem seu próprio documento — e é buscada de volta em qualquer dispositivo via
   loadBGRemote(), chamada no boot antes de aplicar o fundo. */
function saveBGRemote(id,photoData){
  var payload={id:id,photo:photoData===undefined?null:photoData,ts:Date.now()};
  var wc=_cfgWorkerClient();
  if(wc){syncBusy();wc.putConfig('bg_'+S.userId,payload).then(syncOk).catch(function(e){syncErr(e);toast('⚠️ Fundo salvo neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
  else if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('bg_'+S.userId).set(payload,{merge:false}).then(syncOk).catch(function(e){syncErr(e);toast('⚠️ Fundo salvo neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
}

// CORREÇÃO (auditoria, Etapa 1 — consistência local-first): antes, em modo Firebase, cb()
// só era chamado DEPOIS do round-trip de rede — no boot, o fundo customizado ficava no
// padrão/em branco até a rede responder, ao contrário do padrão local-first já usado em
// loadCli/loadAdmDocs/etc. Agora cb() é chamado IMEDIATAMENTE (pinta com o cache local) e,
// se em modo nuvem, de novo quando a versão mais recente do Firestore responder.
function loadBGRemote(uid,cb){
  cb();
  var wc=_cfgWorkerClient();
  if(wc){
    wc.getConfig('bg_'+uid).then(function(data){
      if(data){
        ss('lf13_bg_'+uid,data.id||'default');
        if(data.photo)ss('lf13_bgphoto_'+uid,data.photo);else{try{localStorage.removeItem('lf13_bgphoto_'+uid);}catch(e){}}
      }
      cb();
    }).catch(function(e){console.warn("[prefs] sync bg falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('bg_'+uid).get().then(function(d){
      if(d.exists){
        var data=d.data();
        ss('lf13_bg_'+uid,data.id||'default');
        if(data.photo)ss('lf13_bgphoto_'+uid,data.photo);else{try{localStorage.removeItem('lf13_bgphoto_'+uid);}catch(e){}}
      }
      cb();
    }).catch(function(e){console.warn("[prefs] sync bg falhou",e);});
  }
}

/* COMPRESSÃO AUTOMÁTICA DE IMAGENS: o Firestore recusa documentos acima de ~1MB — isso é um
   limite físico do servidor do Google, não um número que dá pra "aumentar" no código. Em vez
   de bloquear o envio, redimensionamos e recomprimimos a imagem no navegador (canvas) até
   caber com folga, tentando qualidades decrescentes. Assim o usuário pode escolher fotos
   grandes do celular (vários MB) que o app se encarrega de otimizar sozinho. */
function compressImageFile(file,maxBytes,cb){
  if(!file||!file.type||!file.type.startsWith('image/')){cb(null);return;}
  if(file.type==='image/svg+xml'){var r0=new FileReader();r0.onload=function(e){cb(e.target.result);};r0.onerror=function(){cb(null);};r0.readAsDataURL(file);return;}
  var reader=new FileReader();
  reader.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var steps=[[1680,.85],[1400,.8],[1200,.75],[1000,.7],[800,.62],[640,.55],[480,.45]];
      var i=0;
      function render(maxDim,q){
        var w=img.width,h=img.height;
        if(w>maxDim||h>maxDim){if(w>h){h=Math.round(h*maxDim/w);w=maxDim;}else{w=Math.round(w*maxDim/h);h=maxDim;}}
        var c=document.createElement('canvas');c.width=w;c.height=h;
        var ctx=c.getContext('2d');ctx.drawImage(img,0,0,w,h);
        return c.toDataURL('image/jpeg',q);
      }
      function attempt(){
        if(i>=steps.length){cb(render(steps[steps.length-1][0],steps[steps.length-1][1]));return;}
        var st=steps[i++];var data=render(st[0],st[1]);
        if(data.length<=maxBytes||i>=steps.length)cb(data);else attempt();
      }
      attempt();
    };
    img.onerror=function(){cb(e.target.result);};
    img.src=e.target.result;
  };
  reader.onerror=function(){cb(null);};
  reader.readAsDataURL(file);
}

  

  /* ── FIX #16 (backport 2026-07-20): transparência inteligente de wallpaper
     Funções originalmente definidas apenas em js/configuracoes.js (wrapper) mas
     ausentes aqui no módulo-fonte, causando a feature não funcionar em produção.
     Corrigido: definidas aqui e exportadas junto com o runtime do módulo. */
  function _lfIsThemeDark(){
    if(document.body&&document.body.classList.contains('theme-classic'))return true;
    if(document.documentElement&&document.documentElement.getAttribute('data-theme')==='dark')return true;
    try{var bg=getComputedStyle(document.body).backgroundColor||'';var m=bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);if(m){var lum=(parseInt(m[1])+parseInt(m[2])+parseInt(m[3]))/3;return lum<128;}}catch(_e){}
    return false;
  }
  function _lfApplyWallpaperTransparency(hasWallpaper){
    var st=document.getElementById('lf-wallpaper-transp-el');
    if(!st){st=document.createElement('style');st.id='lf-wallpaper-transp-el';document.head.appendChild(st);}
    if(!hasWallpaper){st.textContent='';return;}
    var isDark=_lfIsThemeDark();
    var alpha=isDark?0.55:0.78;
    var bgRgb=isDark?'20, 24, 32':'245, 240, 230';
    var blur=isDark?10:8;
    st.textContent=
      '.kb-col, .kanban-column, .card, .kb-card, .lead-card,'+
      '.chat-conv-item, .chat-msgs, .chat-shell, .chat-side, .chat-main,'+
      '.topbar, header, .mo, .modal-content, [class*="modal-content"],'+
      '.adm-kpi, .adm-mini-k, .act-item, .act-panel, .cli-card,'+
      '.dash-card, .relat-panel, #pg-chat .chat-hd, #pg-chat .chat-compose,'+
      '.pg, #pg-clientes, #pg-leads, #pg-kanban, #pg-agenda,'+
      '#pg-relatorios, #pg-financeiro, #pg-usuarios, #pg-docs, #pg-config {'+
      '  background-color: rgba('+bgRgb+', '+alpha+') !important;'+
      '  backdrop-filter: blur('+blur+'px) saturate(1.1);'+
      '  -webkit-backdrop-filter: blur('+blur+'px) saturate(1.1);'+
      '}'+
      ':root { --lf-has-wallpaper: 1; --lf-wallpaper-alpha: '+alpha+'; --lf-wallpaper-blur: '+blur+'px; }';
    document.documentElement.classList.add('lf-has-wallpaper');
    document.documentElement.classList.toggle('lf-theme-dark',isDark);
    document.documentElement.classList.toggle('lf-theme-light',!isDark);
  }
  function _lfClearWallpaperTransparency(){
    var st=document.getElementById('lf-wallpaper-transp-el');
    if(st)st.textContent='';
    document.documentElement.classList.remove('lf-has-wallpaper','lf-theme-dark','lf-theme-light');
  }
  /* Hook MutationObserver: re-aplica quando tema muda */
  if(!global.__LF_WALLPAPER_THEME_HOOK__){
    global.__LF_WALLPAPER_THEME_HOOK__=true;
    var _themeObs=new MutationObserver(function(){
      if(!document.documentElement.classList.contains('lf-has-wallpaper'))return;
      try{var S=global.S;var uid=(S&&S.userId)||'';if(!uid)return;
        var hasBg=!!localStorage.getItem('lf13_bgphoto_'+uid);
        if(hasBg)_lfApplyWallpaperTransparency(true);}catch(_e){}
    });
    try{_themeObs.observe(document.body,{attributes:true,attributeFilter:['class']});}catch(_e){}
  }

  /* R14-12: expor funções ao escopo global */
  if(typeof _lfIsThemeDark === 'function') global._lfIsThemeDark = _lfIsThemeDark;
  if(typeof _lfApplyWallpaperTransparency === 'function') global._lfApplyWallpaperTransparency = _lfApplyWallpaperTransparency;
  if(typeof _lfClearWallpaperTransparency === 'function') global._lfClearWallpaperTransparency = _lfClearWallpaperTransparency;
  if(typeof setAppThemeMode === 'function') global.setAppThemeMode = setAppThemeMode;
  if(typeof _cfgWorkerClient === 'function') global._cfgWorkerClient = _cfgWorkerClient;
  if(typeof saveThemeRemote === 'function') global.saveThemeRemote = saveThemeRemote;
  if(typeof loadThemeRemote === 'function') global.loadThemeRemote = loadThemeRemote;
  if(typeof applyThemeUI === 'function') global.applyThemeUI = applyThemeUI;
  if(typeof toggleAppTheme === 'function') global.toggleAppTheme = toggleAppTheme;
  if(typeof _bgPreviewStyle === 'function') global._bgPreviewStyle = _bgPreviewStyle;
  if(typeof renderConfig === 'function') global.renderConfig = renderConfig;
  if(typeof saveBGRemote === 'function') global.saveBGRemote = saveBGRemote;
  if(typeof loadBGRemote === 'function') global.loadBGRemote = loadBGRemote;
  if(typeof compressImageFile === 'function') global.compressImageFile = compressImageFile;
  if(typeof render === 'function') global.render = render;
  if(typeof attempt === 'function') global.attempt = attempt;

configuracoes.runtime = {
    _lfIsThemeDark: _lfIsThemeDark,
    _lfApplyWallpaperTransparency: _lfApplyWallpaperTransparency,
    _lfClearWallpaperTransparency: _lfClearWallpaperTransparency,
    setAppThemeMode: setAppThemeMode,
    _cfgWorkerClient: _cfgWorkerClient,
    saveThemeRemote: saveThemeRemote,
    loadThemeRemote: loadThemeRemote,
    BG_OPTIONS: BG_OPTIONS,
    applyThemeUI: applyThemeUI,
    toggleAppTheme: toggleAppTheme,
    _bgPreviewStyle: _bgPreviewStyle,
    renderConfig: renderConfig,
    saveBGRemote: saveBGRemote,
    loadBGRemote: loadBGRemote,
    compressImageFile: compressImageFile
  };
})(window);
