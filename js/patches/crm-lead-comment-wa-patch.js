(function(){
  if(window.__CRM_LEAD_COMMENT_WA_PATCH__)return;window.__CRM_LEAD_COMMENT_WA_PATCH__=1;
  function q(s,p){return (p||document).querySelector(s)}
  function qa(s,p){return Array.prototype.slice.call((p||document).querySelectorAll(s))}
  function el(id){return document.getElementById(id)}
  function esc(s){return (window.eH?eH(String(s==null?'':s)):String(s==null?'':s))}
  function attr(s){return (window._htmlAttr?_htmlAttr(String(s==null?'':s)):String(s==null?'':s))}
  function jsq(s){return (window._jsSq?_jsSq(String(s==null?'':s)):String(s==null?'':s))}
  function shortTxt(s,n){s=String(s||'').trim();return s.length>(n||80)?s.slice(0,(n||80)-1)+'…':s}
  function normPhone(v){return String(v||'').replace(/\D/g,'')}
  function fmtPhone(v){var d=normPhone(v);if(!d)return '';if(d.length===13&&d.indexOf('55')===0)return '+'+d.slice(0,2)+' ('+d.slice(2,4)+') '+d.slice(4,9)+'-'+d.slice(9);if(d.length===12&&d.indexOf('55')===0)return '+'+d.slice(0,2)+' ('+d.slice(2,4)+') '+d.slice(4,8)+'-'+d.slice(8);if(d.length===11)return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7);if(d.length===10)return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6);return String(v||'')}
  function currentUser(){return window.S&&S.userId?getUser(S.userId):null}
  function ensurePatchStyle(){
    if(el('crm-lead-comment-style'))return;
    var st=document.createElement('style');
    st.id='crm-lead-comment-style';
    st.textContent=' .crm-inline-field{margin-top:10px}.crm-muted{font-size:.72rem;color:var(--mu)}.crm-chat-action{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:9px 12px;border-radius:10px;border:1px solid rgba(27,138,222,.25);background:rgba(27,138,222,.1);color:#8fd2ff;font:600 .8rem Outfit,sans-serif;cursor:pointer}.crm-chat-action:hover{background:rgba(27,138,222,.16)}.crm-contact-extra{display:block;margin-top:4px;font-size:.72rem;color:var(--mu)}';
    document.head.appendChild(st);
  }
  function ensureModals(){
    ensurePatchStyle();
    if(!el('mo-lead-comment')){
      var m=document.createElement('div');
      m.className='mo';
      m.id='mo-lead-comment';
      m.onclick=function(e){if(e.target===this)closeM('mo-lead-comment')};
      m.innerHTML='<div class="mb" style="max-width:560px"><h2>💬 Comentário do Lead</h2><div class="mbs"></div><div class="crm-muted" id="lead-comment-meta"></div><div class="mf" style="margin-top:10px"><label for="lead-comment-text">Comentário</label><textarea id="lead-comment-text" rows="5" class="mi" placeholder="Escreva a dúvida, contexto ou orientação para o responsável do lead..."></textarea></div><div class="crm-muted" style="margin-top:8px">O comentário será enviado para o Messenger junto com o responsável atual do lead.</div><div class="mbtns" style="margin-top:14px"><button class="bc" type="button" id="lead-comment-open-room" style="display:none" onclick="window.openExistingLeadCommentRoom()">Abrir conversa</button><button class="bc" onclick="closeM(\'mo-lead-comment\')">Cancelar</button><button class="bp" id="lead-comment-save" onclick="window.saveLeadCommentToChat()">Enviar comentário</button></div></div>';
      document.body.appendChild(m);
    }
    if(!el('mo-chat-wa-settings')){
      var mw=document.createElement('div');
      mw.className='mo';
      mw.id='mo-chat-wa-settings';
      mw.onclick=function(e){if(e.target===this)closeM('mo-chat-wa-settings')};
      mw.innerHTML='<div class="mb" style="max-width:460px"><h2>📱 WhatsApp no Messenger</h2><div class="mbs"></div><p class="crm-muted" style="margin-bottom:10px">Esse número ficará visível para os usuários na tela de detalhes da conversa.</p><div class="mf"><label for="chat-wa-number">Número de WhatsApp</label><input type="text" id="chat-wa-number" class="mi" placeholder="Ex: +55 11 99999-9999" autocomplete="off" inputmode="tel"></div><div class="mbtns" style="margin-top:14px"><button class="bc" onclick="closeM(\'mo-chat-wa-settings\')">Cancelar</button><button class="bp" onclick="window.saveChatWhatsappSetting()">Salvar número</button></div></div>';
      document.body.appendChild(mw);
    }
  }
  function ensureProfileField(){
    var email=el('cfg-email');
    if(email&&!el('cfg-whatsapp')){
      var wrap=document.createElement('div');
      wrap.className='mf crm-inline-field';
      wrap.innerHTML='<label for="cfg-whatsapp">WhatsApp</label><input type="text" id="cfg-whatsapp" autocomplete="off" inputmode="tel" placeholder="Ex: +55 11 99999-9999">';
      email.parentNode.parentNode.insertBefore(wrap,email.parentNode.nextSibling);
    }
  }
  function ensureUserAdminFields(){
    var ne=el('ne');
    if(ne&&!el('nw')){
      var row=ne.closest('.fr')||ne.parentNode.parentNode;
      var ff=document.createElement('div');
      ff.className='ff';
      ff.innerHTML='<label for="nw">WhatsApp</label><input type="text" id="nw" placeholder="Ex: +55 11 99999-9999" autocomplete="off" inputmode="tel">';
      if(row&&row.parentNode)row.parentNode.insertBefore(ff,row.nextSibling);
    }
    var eu=el('eu-email');
    if(eu&&!el('eu-whatsapp')){
      var ff2=document.createElement('div');
      ff2.className='ff crm-inline-field';
      ff2.innerHTML='<label for="eu-whatsapp">WhatsApp</label><input type="text" id="eu-whatsapp" autocomplete="off" inputmode="tel" placeholder="Ex: +55 11 99999-9999">';
      eu.parentNode.parentNode.insertBefore(ff2,el('eu-cargo').parentNode);
    }
    var ke=el('k-email');
    if(ke&&!el('k-whatsapp')){
      var lbl=document.createElement('div');lbl.className='clbl2';lbl.textContent='WhatsApp';
      var box=document.createElement('div');box.className='cbox';box.id='k-whatsapp';
      ke.parentNode.insertBefore(lbl,el('k-senha').previousSibling);
      ke.parentNode.insertBefore(box,el('k-senha').previousSibling);
    }
  }
  function ensureChatButton(){
    var actions=q('#chat-page .chat-actions');
    if(actions&&!el('chat-wa-settings-btn')){
      var b=document.createElement('button');
      b.className='chat-mini';
      b.id='chat-wa-settings-btn';
      b.type='button';
      b.textContent='📱 WhatsApp';
      b.title='Configurar número de WhatsApp';
      actions.appendChild(b);
    }
  }
  function patchRenderConfig(){
    if(!window.renderConfig||window.renderConfig.__crmPatched)return;
    var orig=window.renderConfig;
    window.renderConfig=function(){orig.apply(this,arguments);ensureProfileField();var u=currentUser();var inp=el('cfg-whatsapp');if(inp&&u)inp.value=u.whatsapp||u.telefone||'';};
    window.renderConfig.__crmPatched=1;
  }
  function patchSaveProfile(){
    if(!window.saveProfileData||window.saveProfileData.__crmPatched)return;
    window.saveProfileData=function(){
      var nome=(el('cfg-nome').value||'').trim();
      var email=(el('cfg-email').value||'').trim();
      var whatsapp=(el('cfg-whatsapp')?el('cfg-whatsapp').value:'').trim();
      if(!nome){toast('Nome invalido');return;}
      var users=getUsers();var u=users.find(function(x){return x.id===S.userId;});if(!u)return;
      u.nome=nome;u.email=email;u.whatsapp=whatsapp;
      var okU=saveUsersLocal(users,u.id,{nome:nome,email:email,whatsapp:whatsapp});
      S.nome=nome;S.email=email;var okS=ss('lf6_s',S);
      var nu=el('nav-un');if(nu)nu.textContent=nome;
      toast((okU&&okS)?'Dados salvos!':'⚠️ Pode não ter salvo — armazenamento local cheio.');
    };
    window.saveProfileData.__crmPatched=1;
  }
  function patchCreateUser(){
    if(window.createUser&&window.createUser.__crmPatched)return;
    window.createUser=function(){
      var nome=(el('nn').value||'').trim();
      var email=(el('ne').value||'').trim().toLowerCase();
      var cargo=el('nc').value;
      var whatsapp=(el('nw')?el('nw').value:'').trim();
      var pw=(el('np').value||'').trim()||('Lider@'+Math.random().toString(36).slice(2,8));
      var data=el('nd').value||today();
      var err=el('ferr');err.textContent='';
      if(!nome||!email){err.textContent='Nome e e-mail obrigatorios.';return;}
      var users=getUsers();if(users.some(function(u){return u.email.toLowerCase()===email;})){err.textContent='E-mail ja cadastrado.';return;}
      shSecure(pw).then(function(hash){
        var newU={id:'u'+Date.now()+'_'+Math.random().toString(36).slice(2,5),nome:nome,email:email,cargo:cargo,whatsapp:whatsapp,ph:hash,data:data,role:'user',ativo:true,cor:users.length%5};
        users.push(newU);saveUsersLocal(users,newU.id,newU);try{window.dispatchEvent(new CustomEvent('crm:user-created',{detail:{id:newU.id}}));}catch(_e){}
        el('nn').value='';el('ne').value='';el('np').value='';if(el('nw'))el('nw').value='';
        renderUsers();toast('Usuario criado!');showCred(newU.id,pw);
      }).catch(function(){err.textContent='Nao foi possivel gerar a senha neste dispositivo. Tente novamente.';});
    };
    window.createUser.__crmPatched=1;
  }
  function patchShowCred(){
    if(!window.showCred||window.showCred.__crmPatched)return;
    var orig=window.showCred;
    window.showCred=function(uid,pw){orig.apply(this,arguments);ensureUserAdminFields();var u=getUser(uid);if(!u)return;var kw=el('k-whatsapp');if(kw)kw.textContent=u.whatsapp?fmtPhone(u.whatsapp):'Não informado';var km=el('k-msg');if(km&&u.whatsapp&&km.value.indexOf('WhatsApp do consultor:')<0)km.value+='\nWhatsApp do consultor: '+fmtPhone(u.whatsapp);};
    window.showCred.__crmPatched=1;
  }
  function patchOpenEditUser(){
    if(!window.openEditUser||window.openEditUser.__crmPatched)return;
    var orig=window.openEditUser;
    window.openEditUser=function(uid){orig.apply(this,arguments);ensureUserAdminFields();var u=getUser(uid);if(u&&el('eu-whatsapp'))el('eu-whatsapp').value=u.whatsapp||u.telefone||'';};
    window.openEditUser.__crmPatched=1;
  }
  function patchSaveEditUser(){
    if(!window.saveEditUser||window.saveEditUser.__crmPatched)return;
    window.saveEditUser=function(){
      if(!hasAdminAccess()){toast('Sem permissão');return;}
      var id=el('eu-id').value;
      var nome=(el('eu-nome').value||'').trim();
      var email=(el('eu-email').value||'').trim().toLowerCase();
      var cargo=el('eu-cargo').value;
      var whatsapp=(el('eu-whatsapp')?el('eu-whatsapp').value:'').trim();
      var err=el('eu-err');err.textContent='';
      if(!nome||!email){err.textContent='Nome e e-mail obrigatorios.';return;}
      var users=getUsers();
      if(users.some(function(u){return u.id!==id&&u.email.toLowerCase()===email;})){err.textContent='E-mail ja usado por outro usuario.';return;}
      var u=users.find(function(x){return x.id===id;});if(!u)return;
      var eraAdmin=hasAdminAccess(id);
      u.nome=nome;u.email=email;u.cargo=cargo;u.whatsapp=whatsapp;
      var patch={nome:nome,email:email,cargo:cargo,whatsapp:whatsapp};
      var euCheck=el('eu-admin-check');if(euCheck){u.admExtra=euCheck.checked;patch.admExtra=euCheck.checked;}
      saveUsersLocal(users,u.id,patch);closeM('mo-edit-user');renderUsers();
      var ehAdminAgora=hasAdminAccess(id);
      if(ehAdminAgora&&!eraAdmin)toast('Salvo! '+nome.split(' ')[0]+' agora tem acesso de Administrador.');
      else toast('Usuario atualizado!');
    };
    window.saveEditUser.__crmPatched=1;
  }
  function patchRenderUsers(){
    if(!window.renderUsers||window.renderUsers.__crmPatched)return;
    var orig=window.renderUsers;
    window.renderUsers=function(){
      orig.apply(this,arguments);
      ensureUserAdminFields();
      var users=getUsers().filter(function(u){return u.id!=='adm';});
      var cards=qa('#ugrid .uc');
      cards.forEach(function(card,idx){
        var u=users[idx];if(!u)return;
        var meta=q('.ucm',card);if(!meta)return;
        var line=q('.uc-phone',meta);
        if(u.whatsapp){
          if(!line){line=document.createElement('span');line.className='uc-phone';meta.appendChild(line);}
          line.textContent='WhatsApp: '+fmtPhone(u.whatsapp);
        }else if(line){line.remove();}
      });
    };
    window.renderUsers.__crmPatched=1;
  }
  function getCurrentCardInfo(){
    var board=window._kbDetBoard,id=window._kbDetId,uid=(window._kbDetOwnerUid|| (window.activeUID?activeUID(board):null));
    if(!board||!id||!uid)return null;
    var arr=getKBFor(board,uid)||[];var card=arr.find(function(x){return x.id===id;});if(!card)return null;
    return {board:board,id:id,uid:uid,card:card};
  }
  function ensureLeadCommentButton(){
    var wrap=el('det-contact-actions');if(!wrap)return;
    var info=getCurrentCardInfo();if(!info)return;
    var canOpen=!!(hasAdminAccess()||(window.S&&info.uid===S.userId));
    var btn=el('det-lead-comment-btn');
    if(!canOpen){if(btn)btn.remove();return;}
    if(!btn){
      btn=document.createElement('button');
      btn.id='det-lead-comment-btn';
      btn.className='crm-chat-action';
      btn.setAttribute('type','button');
      btn.setAttribute('data-open-lead-comment','1');
      wrap.appendChild(btn);
    }
    btn.textContent=info.card.leadCommentRoomId?'💬 Conversa do lead':'💬 Comentário';
  }
  window.openExistingLeadCommentRoom=function(){var info=getCurrentCardInfo();if(!info||!info.card.leadCommentRoomId){toast('Nenhuma conversa vinculada ainda.');return}if(window.crmChatOpenRoom)window.crmChatOpenRoom(info.card.leadCommentRoomId,false)};
  window.openLeadCommentModal=function(){
    ensureModals();
    var info=getCurrentCardInfo();if(!info){toast('Lead não encontrado.');return;}
    var stage=(window._colLabel?_colLabel(info.board,info.card.col):info.card.col||'');
    var owner=(getUser(info.uid)||{}).nome||'Responsável';
    var meta=el('lead-comment-meta');
    if(meta)meta.innerHTML='<strong>'+esc(info.card.name)+'</strong><br>Etapa: '+esc(stage||'-')+' • Responsável: '+esc(owner);
    var ta=el('lead-comment-text');if(ta)ta.value='';
    var openBtn=el('lead-comment-open-room');if(openBtn)openBtn.style.display=info.card.leadCommentRoomId?'':'none';
    openM('mo-lead-comment');
    setTimeout(function(){if(ta)ta.focus();},40);
  };
  window.saveLeadCommentToChat=function(){
    var info=getCurrentCardInfo();if(!info){toast('Lead não encontrado.');return;}
    var comment=(el('lead-comment-text').value||'').trim();
    if(!comment){toast('Escreva o comentário antes de enviar.');return;}
    var btn=el('lead-comment-save');if(btn){btn.disabled=true;btn.textContent='Enviando...';}
    var stage=(window._colLabel?_colLabel(info.board,info.card.col):info.card.col||'');
    window.crmChatUpsertLeadThread({board:info.board,ownerUid:info.uid,cardId:info.id,card:info.card,stageLabel:stage,comment:comment}).then(function(res){
      var arr=getKBFor(info.board,info.uid)||[];var c=arr.find(function(x){return x.id===info.id;});
      if(c){
        c.leadCommentRoomId=res.roomId;
        c.lastLeadCommentAt=new Date().toISOString();
        c.lastLeadCommentBy=(window.S&&S.nome)||'Usuário';
        c.leadCommentCount=(parseInt(c.leadCommentCount||0,10)||0)+1;
        if(window._pushHistorico)_pushHistorico(c,'Comentário enviado para o Messenger: "'+shortTxt(comment,90)+'"');
        saveKBFor(info.board,info.uid,arr);
        if(window.renderDetHistorico)renderDetHistorico(c);
        if(window.renderKBLocal)renderKBLocal(info.board);
      }
      closeM('mo-lead-comment');
      ensureLeadCommentButton();
      toast(res.newRoom?'Conversa do lead criada e comentário enviado!':'Comentário enviado para o Messenger!');
    }).catch(function(err){
      if(window.syncErr)syncErr(err);
      toast('Não foi possível enviar o comentário para o Messenger.',4200);
    }).finally(function(){if(btn){btn.disabled=false;btn.textContent='Enviar comentário';}});
  };
  window.saveChatWhatsappSetting=function(){
    var me=currentUser();if(!me){toast('Usuário não encontrado.');return;}
    var value=(el('chat-wa-number').value||'').trim();
    var users=getUsers();var u=users.find(function(x){return x.id===me.id;});if(!u)return;
    u.whatsapp=value;
    saveUsersLocal(users,u.id,{whatsapp:value});
    if(el('cfg-whatsapp'))el('cfg-whatsapp').value=value;
    closeM('mo-chat-wa-settings');
    toast(value?'WhatsApp salvo no Messenger!':'WhatsApp removido do Messenger.');
  };
  function openChatWaSettings(){ensureModals();var me=currentUser();if(el('chat-wa-number'))el('chat-wa-number').value=me&&(me.whatsapp||me.telefone)||'';openM('mo-chat-wa-settings');setTimeout(function(){if(el('chat-wa-number'))el('chat-wa-number').focus();},40);}
  function bindEvents(){
    if(bindEvents._ok)return;bindEvents._ok=1;
    document.addEventListener('click',function(e){
      var t=e.target;
      if(t&&t.closest('#chat-wa-settings-btn')){e.preventDefault();openChatWaSettings();return;}
      if(t&&t.closest('[data-open-lead-comment]')){e.preventDefault();window.openLeadCommentModal();return;}
    });
  }
  function boot(){ensureModals();ensureProfileField();ensureUserAdminFields();ensureChatButton();ensureLeadCommentButton();patchRenderConfig();patchSaveProfile();patchCreateUser();patchShowCred();patchOpenEditUser();patchSaveEditUser();patchRenderUsers();bindEvents();}
  if(window.openKBDet&&!window.openKBDet.__crmPatched){var orig=window.openKBDet;window.openKBDet=function(){var out=orig.apply(this,arguments);setTimeout(function(){boot();ensureLeadCommentButton();},20);return out;};window.openKBDet.__crmPatched=1;}
  var ticks=0;var tm=setInterval(function(){boot();ticks++;if(ticks>20)clearInterval(tm);},700);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else setTimeout(boot,0);
})();
