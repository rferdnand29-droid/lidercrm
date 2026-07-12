/* =====================================================================
 * configuracoes.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// Aplica o tema salvo ANTES do primeiro paint (evita "flash" do tema errado ao carregar).
try{if(localStorage.getItem('lf_theme')==='classic')document.body.classList.add('theme-classic');}catch(_e){}

var BG_OPTIONS=[{id:'default',label:'Padrão',css:''},{id:'navy',label:'Azul',css:'background:linear-gradient(135deg,#0a1a2e 0%,#0a0c10 60%)!important'},{id:'forest',label:'Verde',css:'background:linear-gradient(135deg,#0a1a10 0%,#0a0c10 60%)!important'},{id:'purple',label:'Roxo',css:'background:linear-gradient(135deg,#150a2a 0%,#0a0c10 60%)!important'},{id:'gold',label:'Dourado',css:'background:linear-gradient(135deg,#1a1200 0%,#0a0c10 60%)!important'},{id:'slate',label:'Cinza',css:'background:linear-gradient(135deg,#0f1218 0%,#0a0c10 60%)!important'},{id:'photo',label:'Foto',css:'/* photo */'}];

// FEATURE (a pedido do usuário): alternar entre o tema claro atual e o tema escuro/vermelho
// original. Ver comentário completo no <style id="lf-theme-classic"> no <head>.
function applyThemeUI(){
  var on=document.body.classList.contains('theme-classic');
  var btn=el('nav-theme-btn');if(btn)btn.title=on?'Tema atual: escuro/vermelho (tocar pra usar o claro)':'Tema atual: claro (tocar pra usar o escuro/vermelho)';
  var lbl=el('mmd-theme-label');if(lbl)lbl.textContent=on?'Tema claro (atual: escuro)':'Tema escuro/vermelho';
}

function toggleAppTheme(){
  var on=document.body.classList.toggle('theme-classic');
  try{localStorage.setItem('lf_theme',on?'classic':'light');}catch(_e){}
  applyThemeUI();
  toast(on?'🎨 Tema escuro/vermelho ativado.':'🎨 Tema claro ativado.');
}

document.addEventListener('click',function(e){if(!_ligWidgetOpen)return;var w=document.getElementById('lig-widget'),fab=document.getElementById('lig-fab');if(w&&!w.contains(e.target)&&fab&&!fab.contains(e.target)){_ligWidgetOpen=false;w.style.display='none';}},{passive:true});

// ============================================================
// CONFIGURACOES
// ============================================================
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
}

/* CORREÇÃO "CAPA NÃO SALVA UNIVERSAL": igual à logo, a foto de fundo/capa só ficava em
   localStorage (por aparelho). Agora sobe pro Firestore em config/bg_<uid> — cada usuário
   tem seu próprio documento — e é buscada de volta em qualquer dispositivo via
   loadBGRemote(), chamada no boot antes de aplicar o fundo. */
function saveBGRemote(id,photoData){
  if(DB_MODE!=='firebase'||!db)return;
  syncBusy();
  db.collection('config').doc('bg_'+S.userId).set({id:id,photo:photoData===undefined?null:photoData,ts:Date.now()},{merge:false}).then(syncOk).catch(function(e){syncErr(e);toast('⚠️ Fundo salvo neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});
}

// CORREÇÃO (auditoria, Etapa 1 — consistência local-first): antes, em modo Firebase, cb()
// só era chamado DEPOIS do round-trip de rede — no boot, o fundo customizado ficava no
// padrão/em branco até a rede responder, ao contrário do padrão local-first já usado em
// loadCli/loadAdmDocs/etc. Agora cb() é chamado IMEDIATAMENTE (pinta com o cache local) e,
// se em modo nuvem, de novo quando a versão mais recente do Firestore responder.
function loadBGRemote(uid,cb){
  cb();
  if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('bg_'+uid).get().then(function(d){
      if(d.exists){
        var data=d.data();
        ss('lf13_bg_'+uid,data.id||'default');
        if(data.photo)ss('lf13_bgphoto_'+uid,data.photo);else{try{localStorage.removeItem('lf13_bgphoto_'+uid);}catch(e){}}
      }
      cb();
    }).catch(function(){});
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

function handleBGPhotoUpload(inp){
  var file=inp.files[0];if(!file)return;
  if(!file.type||!file.type.startsWith('image/')){toast('⚠️ Selecione um arquivo de imagem válido (JPG, PNG, WebP…)');inp.value='';return;}
  if(file.size>20*1024*1024){toast('⚠️ Imagem muito grande (máx. 20MB). Escolha uma foto menor.',4000);inp.value='';return;}
  toast('Otimizando imagem...',1500);
  compressImageFile(file,900000,function(data){
    if(!data){toast('⚠️ Não foi possível processar essa imagem.');inp.value='';return;}
    var okBG=ss('lf13_bgphoto_'+S.userId,data);
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

function removeBGPhoto(){try{localStorage.removeItem('lf13_bgphoto_'+S.userId);}catch(e){}setBG('default',true);renderConfig();toast('Foto de fundo removida.');}

function handlePicUpload(inp){
  var file=inp.files[0];if(!file)return;
  if(!file.type.startsWith('image/')){toast('⚠️ Selecione um arquivo de imagem válido (JPG, PNG, WebP…)');inp.value='';return;}
  if(file.size>20*1024*1024){toast('⚠️ Imagem muito grande. Use uma imagem menor que 20MB.',4000);inp.value='';return;}
  toast('Otimizando foto...',1500);
  compressImageFile(file,900000,function(data){
    if(!data||!data.startsWith('data:image/')){toast('⚠️ Arquivo inválido.');inp.value='';return;}
    var okPic=ss('lf13_pic_'+S.userId,data);
    if(!okPic){toast('⚠️ Foto muito grande para o armazenamento local. Tente uma imagem menor.',4500);return;}
    var pe=document.getElementById('cfg-pic-preview');if(pe)pe.innerHTML='<img src="'+_htmlAttr(data)+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
    var av=document.getElementById('nav-av');if(av)av.innerHTML='<img src="'+_htmlAttr(data)+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">';
    toast('Foto atualizada!');inp.value='';
  });
}

function removePic(){ss('lf13_pic_'+S.userId,null);try{localStorage.removeItem('lf13_pic_'+S.userId);}catch(e){}var pe=document.getElementById('cfg-pic-preview');if(pe)pe.textContent=(S.nome||'?').charAt(0).toUpperCase();var av=document.getElementById('nav-av');if(av){av.innerHTML='';av.textContent=(S.nome||'?').charAt(0).toUpperCase();av.style.background=AVB[S.cor%AVB.length];}toast('Foto removida');}

function saveProfileData(){var nome=(document.getElementById('cfg-nome').value||'').trim();var email=(document.getElementById('cfg-email').value||'').trim();if(!nome){toast('Nome invalido');return;}var users=getUsers();var u=users.find(function(x){return x.id===S.userId;});if(!u)return;u.nome=nome;u.email=email;var okU=saveUsersLocal(users,u.id,{nome:nome,email:email});S.nome=nome;S.email=email;var okS=ss('lf6_s',S);var nu=document.getElementById('nav-un');if(nu)nu.textContent=nome;toast((okU&&okS)?'Dados salvos!':'⚠️ Pode não ter salvo — armazenamento local cheio.');}

function changeMyPassword(){
  var old=document.getElementById('cfg-pw-old').value||'';var nw=document.getElementById('cfg-pw-new').value||'';var conf=document.getElementById('cfg-pw-confirm').value||'';
  var errEl=document.getElementById('cfg-pw-err');errEl.textContent='';
  var users=getUsers();var u=users.find(function(x){return x.id===S.userId;});if(!u){errEl.textContent='Usuario nao encontrado.';return;}
  if(nw.length<4){errEl.textContent='Minimo 4 caracteres.';return;}
  if(nw!==conf){errEl.textContent='Senhas nao coincidem.';return;}
  verifyPw(u,old).then(function(ok){
    if(!ok){errEl.textContent='Senha atual incorreta.';return;}
    shSecure(nw).then(function(hash){
      u.ph=hash;var okPw=saveUsersLocal(users,u.id,{ph:hash});
      document.getElementById('cfg-pw-old').value='';document.getElementById('cfg-pw-new').value='';document.getElementById('cfg-pw-confirm').value='';
      if(okPw)toast('Senha alterada!');
      else errEl.textContent='Não foi possível salvar a nova senha (armazenamento local cheio). Tente novamente.';
    }).catch(function(){errEl.textContent='Nao foi possivel gerar a nova senha neste dispositivo. Tente novamente.';});
  }).catch(function(){errEl.textContent='Nao foi possivel validar a senha atual neste dispositivo. Tente novamente.';});
}

function setBG(id,silent){
  ss('lf13_bg_'+S.userId,id);applyBG(id);
  document.querySelectorAll('.bg-thumb').forEach(function(e){e.classList.remove('on');});
  var idx=BG_OPTIONS.findIndex(function(x){return x.id===id;});var ts=document.querySelectorAll('.bg-thumb');if(ts[idx])ts[idx].classList.add('on');
  // BUG CORRIGIDO: antes, "photoData" só era enviado quando id==='photo' — ao trocar para
  // qualquer OUTRO fundo, o Firestore era sobrescrito com photo:null (saveBGRemote usa
  // merge:false), apagando a foto personalizada da nuvem e de qualquer outro dispositivo
  // mesmo que o usuário só quisesse testar uma cor, sem intenção de apagar a foto. Agora
  // preserva a foto que já está salva localmente ao trocar de fundo — só é removida de
  // fato quando o próprio removeBGPhoto() a apaga do localStorage antes de chamar setBG().
  var photoData=sg('lf13_bgphoto_'+S.userId)||null;
  saveBGRemote(id,photoData);
  if(!silent)toast('Fundo aplicado em todos os seus dispositivos!');
}

function applyBG(id){
  var st=document.getElementById('bg-style-el');
  if(!st){st=document.createElement('style');st.id='bg-style-el';document.head.appendChild(st);}
  if(id==='photo'){var photoUrl=sg('lf13_bgphoto_'+S.userId);var _isIOS=/iP(hone|ad|od)/.test(navigator.userAgent)||(/Mac/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
  st.textContent=photoUrl?"body,#app{background:url('"+photoUrl+"') center/cover no-repeat"+(_isIOS?' scroll':' fixed')+"!important;}":'';return;}
  var bg=BG_OPTIONS.find(function(x){return x.id===id;});
  st.textContent=(bg&&bg.css&&bg.id!=='photo')?'body,#app{'+bg.css+'}':'';
}

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
    if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('logo').set({data:data,ts:Date.now()}).then(function(){syncOk();toast('✅ Logo atualizada em todos os dispositivos!');}).catch(function(e2){syncErr(e2);toast('⚠️ Logo salva neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
    else toast('✅ Logo atualizada! (modo offline — só neste aparelho até reconectar)');
    input.value='';
  });
}

function admResetLogo(){
  // CORREÇÃO (auditoria — controle de acesso): ver comentário em admChangeLogo().
  if(!hasAdminAccess()){toast('Apenas ADM/Gestor pode resetar a logo.');return;}
  try{localStorage.removeItem('lf_custom_logo');}catch(e){}
  applyCustomLogo(null);
  if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('logo').delete().then(syncOk).catch(syncErr);}
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
  if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('logo').get().then(function(d){
      var data=d.exists?(d.data().data||null):null;
      if(data){try{localStorage.setItem('lf_custom_logo',data);}catch(e){}}
      else{try{localStorage.removeItem('lf_custom_logo');}catch(e){}}
      cb(data);
    }).catch(function(){});
  }
}

function applyCustomLogo(dataUrl){
  // BUG CORRIGIDO: faltava ".mtb-logo" nesta lista — a barra superior mobile
  // nunca recebia a logo personalizada do ADM (nem era resetada para a oficial).
  document.querySelectorAll('.nmo,.splash-mon,.lmon,.mtb-logo').forEach(function(el){
    var src=dataUrl||LF_OFFICIAL_LOGO;
    var alt=dataUrl?'Logo personalizada':'Líder Financeira e Investimentos';
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
    : eH(nameText||'LIDER CRM');
  document.querySelectorAll('.crm-brand-name').forEach(function(el){el.innerHTML=html;});
  var prev=document.getElementById('adm-crm-name-preview');
  if(prev)prev.innerHTML=html;
}

function saveCRMNameRemote(payload){
  try{localStorage.setItem('lf_custom_crm_name',JSON.stringify(payload));}catch(err){toast('❌ Armazenamento cheio ou modo privado');return false;}
  if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('crmname').set({data:payload,ts:Date.now()}).then(function(){syncOk();toast('✅ Nome do CRM atualizado em todos os dispositivos!');}).catch(function(e2){syncErr(e2);toast('⚠️ Nome salvo neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);});}
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
  if(DB_MODE==='firebase'&&db){syncBusy();db.collection('config').doc('crmname').delete().then(syncOk).catch(syncErr);}
  var inp=document.getElementById('cfg-crm-name-input');if(inp)inp.value='';
  toast('Nome do CRM resetado para o padrão em todos os dispositivos');
}

function loadCRMNameRemote(cb){
  // CORREÇÃO (auditoria, Etapa 1 — consistência local-first): idem loadLogoRemote.
  var l0=null;try{l0=JSON.parse(localStorage.getItem('lf_custom_crm_name'));}catch(e){}
  cb(l0);
  if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('crmname').get().then(function(d){
      var payload=d.exists?(d.data().data||null):null;
      if(payload){try{localStorage.setItem('lf_custom_crm_name',JSON.stringify(payload));}catch(e){}}
      else{try{localStorage.removeItem('lf_custom_crm_name');}catch(e){}}
      cb(payload);
    }).catch(function(){});
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
  if(proto==='http:'||proto==='https:')return false; // ambiente normal, segue o boot
  var spin=document.getElementById('sp-spin');if(spin)spin.style.display='none';
  var sub=document.querySelector('#splash .splash-sub');
  if(sub)sub.textContent='Não foi possível abrir o app desta forma.';
  var err=document.getElementById('sp-err');
  if(err){
    err.style.display='block';
    err.innerHTML='Este arquivo foi aberto diretamente (<strong>'+eH(proto)+'//</strong>), em vez de por um link.'
      +'<br><br>Nesse modo, o navegador bloqueia o armazenamento local e a sincronização — por isso a tela fica em branco.'
      +'<br><br>Peça o link de acesso correto (<strong>https://...</strong>) a quem administra o sistema, ou abra pelo atalho salvo na tela inicial, em vez de tocar no arquivo diretamente.';
  }
  return true; // bloqueia o boot normal
}

(function(){
  var __bootStarted=false;
  function startBoot(){
    if(__bootStarted)return;
    __bootStarted=true;
    if(!_checkRunEnvironment())initDB();
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
