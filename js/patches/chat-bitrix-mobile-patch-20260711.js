(function(){
  function ensureStyle(){
    if(document.getElementById('chat-bitrix-mobile-20260711-style')) return;
    var st=document.createElement('style');
    st.id='chat-bitrix-mobile-20260711-style';
    st.textContent=`
    #chat-page.bitrix-mainpager-2026 .chat-side{position:relative}
    #chat-page.bitrix-mainpager-2026 .chat-hd{position:sticky;top:0;z-index:4}
    #chat-page.bitrix-mainpager-2026 .chat-hd-row{gap:10px}
    #chat-page.bitrix-mainpager-2026 .chat-hd-row h2{font-size:1.08rem}
    #chat-page.bitrix-mainpager-2026 .chat-actions{display:flex;align-items:center;gap:8px}
    #chat-page.bitrix-mainpager-2026 .chat-head-icon{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:36px;padding:0;border-radius:12px;font-size:1rem}
    #chat-page.bitrix-mainpager-2026 .chat-head-badge{position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:#ff5b55;color:#fff;font:700 .62rem/18px Inter,Outfit,sans-serif;text-align:center;display:none}
    #chat-page.bitrix-mainpager-2026 .chat-head-badge.show{display:block}
    #chat-page.bitrix-mainpager-2026 .chat-room{min-height:74px}
    #chat-page.bitrix-mainpager-2026 .chat-room-name{display:flex;align-items:center;gap:6px}
    #chat-page.bitrix-mainpager-2026 .chat-room-last{display:flex;align-items:center;gap:6px}
    #chat-page.bitrix-mainpager-2026 .chat-fab{position:absolute;right:18px;bottom:18px;width:56px;height:56px;border:none;border-radius:50%;background:linear-gradient(180deg,#2196ff,#0f76ea);color:#fff;font-size:1.8rem;box-shadow:0 18px 34px rgba(15,118,234,.32);display:inline-flex;align-items:center;justify-content:center;z-index:7;cursor:pointer}
    #chat-page.bitrix-mainpager-2026 .chat-fab:active{transform:scale(.96)}
    #chat-page.bitrix-mainpager-2026 .chat-top{padding:10px 14px}
    #chat-page.bitrix-mainpager-2026 .chat-top-left{gap:10px}
    #chat-page.bitrix-mainpager-2026 .chat-top-meta{min-width:0;display:grid;gap:2px}
    #chat-page.bitrix-mainpager-2026 .chat-top-right{gap:6px}
    #chat-page.bitrix-mainpager-2026 .chat-top-right .chat-mini{min-width:38px;height:38px;padding:0;border-radius:12px;font-size:1rem}
    #chat-page.bitrix-mainpager-2026 .chat-top-sub{max-width:46vw}
    #chat-page.bitrix-mainpager-2026 .chat-compose{padding:8px 10px calc(10px + env(safe-area-inset-bottom,0px))}
    #chat-page.bitrix-mainpager-2026 .chat-compose-row{grid-template-columns:42px minmax(0,1fr) 42px 42px;gap:8px;align-items:end}
    #chat-page.bitrix-mainpager-2026 .chat-compose-row > .chat-mini{width:42px;height:42px;padding:0;display:inline-flex;align-items:center;justify-content:center}
    #chat-page.bitrix-mainpager-2026 .chat-compose textarea{min-height:44px;border-radius:22px;padding:11px 14px}
    #chat-page.bitrix-mainpager-2026 .chat-msgs{background:linear-gradient(180deg,#eef6ff 0%,#f7fbff 14%,#f5f9fe 100%)}
    #chat-page.bitrix-mainpager-2026 .chat-bubble{border-radius:18px 18px 18px 8px}
    #chat-page.bitrix-mainpager-2026 .chat-row.me .chat-bubble{border-radius:18px 18px 8px 18px}
    #mo-chat-create .mb,#mo-chat-msg-sheet .mb{padding:0;overflow:hidden;background:#fff}
    .chat-sheet-head{padding:16px 18px 10px;border-bottom:1px solid #ebf0f6;background:#fff}
    .chat-sheet-title{font:700 1rem/1.2 Inter,Outfit,sans-serif;color:#1f2937}
    .chat-sheet-sub{margin-top:4px;font-size:.76rem;color:#7a8798}
    .chat-sheet-body{padding:10px 14px 14px;background:#fbfdff}
    .chat-create-list,.chat-msg-sheet-list{display:grid;gap:10px}
    .chat-create-item,.chat-msg-sheet-btn{width:100%;display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1px solid #e4ebf4;border-radius:16px;background:#fff;color:#1f2937;text-align:left;cursor:pointer}
    .chat-create-item small,.chat-msg-sheet-btn small{display:block;margin-top:3px;color:#7a8798;font-size:.74rem}
    .chat-create-ic{width:40px;height:40px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:#eef5ff;color:#1764d8;font-size:1.1rem;flex:0 0 auto}
    .chat-msg-reactions{display:flex;gap:8px;flex-wrap:wrap;padding:12px 14px 2px;background:#fbfdff}
    .chat-msg-rx-btn{border:1px solid #dfe7f2;background:#fff;color:#1f2937;border-radius:999px;padding:8px 12px;font:600 .92rem/1 Inter,Outfit,sans-serif;cursor:pointer}
    .chat-msg-rx-btn:hover,.chat-msg-rx-btn.on{background:#eef5ff;border-color:#c8daf9;color:#1764d8}
    .chat-msg-sheet-btn.danger{color:#cf2e2e}
    .chat-msg-sheet-preview{padding:12px 14px 2px;background:#fbfdff}
    .chat-msg-sheet-quote{border-left:3px solid #c8daf9;background:#fff;border:1px solid #e2eaf4;border-left-width:3px;border-radius:14px;padding:10px 12px;color:#4b5565;font-size:.82rem}
    .chat-forward-search{width:100%;margin:0 0 10px;background:#fff;border:1px solid #dbe3ee;border-radius:14px;padding:11px 12px;color:#1f2937;font:500 .9rem Inter,Outfit,sans-serif;outline:none}
    .chat-forward-filterchips{display:flex;gap:8px;overflow:auto;padding-bottom:8px;scrollbar-width:none}
    .chat-forward-filterchips::-webkit-scrollbar{display:none}
    .chat-forward-chip{border:1px solid #d8dee8;background:#fff;color:#5d6b7c;border-radius:999px;padding:7px 12px;font:600 .78rem Inter,Outfit,sans-serif;white-space:nowrap}
    .chat-forward-chip.on{background:#eef5ff;border-color:#c8daf9;color:#1764d8}
    .chat-forward-room{background:#fff!important;border:1px solid #e4ebf4!important;border-radius:14px!important;padding:10px 12px!important}
    .chat-detail-hero{padding:12px 20px 0;display:grid;gap:12px}
    .chat-detail-meta{display:grid;gap:8px;padding:12px 14px;border:1px solid #e4ebf4;border-radius:16px;background:#fff}
    .chat-detail-meta-line{font-size:.8rem;color:#667085}
    .chat-detail-meta-line b{color:#1f2937}
    .chat-detail-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
    .chat-detail-act{border:1px solid #dfe7f2;background:#fff;border-radius:16px;padding:12px 8px;display:grid;place-items:center;gap:6px;color:#1f2937;font:600 .74rem/1.15 Inter,Outfit,sans-serif;cursor:pointer;text-align:center}
    .chat-detail-act-ic{font-size:1.15rem}
    .chat-detail-act.on{background:#eef5ff;border-color:#c8daf9;color:#1764d8}
    .chat-inspect-tabs{padding-top:10px}
    .chat-inspect-body{padding-top:14px}
    @media (max-width:768px){
      #pg-chat{padding-bottom:84px}
      #chat-page.bitrix-mainpager-2026 .chat-shell{min-height:calc(100vh - 76px)}
      #chat-page.bitrix-mainpager-2026 .chat-side{border:none}
      #chat-page.bitrix-mainpager-2026 .chat-room-list{padding-bottom:86px}
      #chat-page.bitrix-mainpager-2026 .chat-fab{position:fixed;right:18px;bottom:92px}
      #chat-page.bitrix-mainpager-2026 .chat-side-tools{padding:10px 12px 8px}
      #chat-page.bitrix-mainpager-2026 .chat-filter-row{gap:6px;overflow:auto;flex-wrap:nowrap}
      #chat-page.bitrix-mainpager-2026 .chat-filter-row .chat-mini{white-space:nowrap}
      #mo-chat-create .mb,#mo-chat-msg-sheet .mb,#mo-chat-forward .mb{width:100vw;max-width:none;margin:0;border-radius:20px 20px 0 0;max-height:min(88dvh,calc(var(--vvh,100vh) - env(safe-area-inset-top)));padding-bottom:calc(16px + env(safe-area-inset-bottom))}
      #mo-chat-forward .mb{padding-top:0}
      #mo-chat-forward .mf:first-of-type{display:none}
      #mo-chat-forward .mbtns{position:sticky;bottom:0;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.92) 24%,#fff);padding:12px 14px calc(14px + env(safe-area-inset-bottom));margin:0 -14px -16px}
      .chat-detail-hero{padding:12px 14px 0}
      .chat-detail-actions{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .chat-detail-act{padding:10px 6px;border-radius:14px;font-size:.7rem}
      .chat-inspect-body{height:auto}
    }
    `;
    document.head.appendChild(st);
  }

  function ensureCreateSheet(){
    if(document.getElementById('mo-chat-create')) return;
    var m=document.createElement('div');
    m.className='mo';
    m.id='mo-chat-create';
    m.onclick=function(e){ if(e.target===this) closeM('mo-chat-create'); };
    m.innerHTML=''
      +'<div class="mb">'
      +  '<div class="chat-sheet-head"><div class="chat-sheet-title">Criar</div><div class="chat-sheet-sub">Abra uma conversa nova sem mexer na estrutura do restante do CRM.</div></div>'
      +  '<div class="chat-sheet-body"><div class="chat-create-list">'
      +    '<button class="chat-create-item" type="button" data-chat-create-action="direct"><span class="chat-create-ic">💬</span><span><strong>Conversa direta</strong><small>Falar com um colaborador do CRM</small></span></button>'
      +    '<button class="chat-create-item" type="button" data-chat-create-action="group"><span class="chat-create-ic">👥</span><span><strong>Grupo</strong><small>Criar um bate-papo com vários participantes</small></span></button>'
      +  '</div></div>'
      +'</div>';
    document.body.appendChild(m);
  }

  function ensureMsgSheet(){
    if(document.getElementById('mo-chat-msg-sheet')) return;
    var m=document.createElement('div');
    m.className='mo';
    m.id='mo-chat-msg-sheet';
    m.onclick=function(e){ if(e.target===this) closeM('mo-chat-msg-sheet'); };
    m.innerHTML=''
      +'<div class="mb">'
      +  '<div class="chat-sheet-head"><div class="chat-sheet-title">Mensagem</div><div class="chat-sheet-sub">Ações rápidas inspiradas no Bitrix24 mobile.</div></div>'
      +  '<div class="chat-msg-reactions" id="chat-msg-sheet-rx"></div>'
      +  '<div class="chat-msg-sheet-preview" id="chat-msg-sheet-preview"></div>'
      +  '<div class="chat-sheet-body"><div class="chat-msg-sheet-list" id="chat-msg-sheet-list"></div></div>'
      +'</div>';
    document.body.appendChild(m);
  }

  function decorateForwardModal(){
    var modal=document.getElementById('mo-chat-forward');
    if(!modal) return;
    var box=modal.querySelector('.mb');
    if(!box || document.getElementById('chat-forward-search')) return;
    var title=box.querySelector('h2');
    if(title) title.textContent='Selecionar destinatário';
    var wrap=document.createElement('div');
    wrap.style.padding='14px 14px 0';
    wrap.innerHTML=''
      +'<input id="chat-forward-search" class="chat-forward-search" type="text" placeholder="Procura...">'
      +'<div class="chat-forward-filterchips"><button class="chat-forward-chip on" type="button">Conversas</button><button class="chat-forward-chip" type="button" disabled>Bate-papos de tarefas</button></div>';
    box.insertBefore(wrap, box.querySelector('.mf') || box.firstChild.nextSibling);
  }

  function applyLayout(){
    ensureStyle();
    ensureCreateSheet();
    ensureMsgSheet();
    decorateForwardModal();
    var page=document.getElementById('chat-page');
    if(!page) return;
    page.classList.add('bitrix-mainpager-2026');

    var row=page.querySelector('.chat-hd-row');
    var actions=row && row.querySelector('.chat-actions');
    if(actions && !document.getElementById('chat-list-search-btn')){
      actions.innerHTML=''
        +'<button class="chat-mini chat-head-icon" id="chat-list-search-btn" title="Buscar" aria-label="Buscar">⌕</button>'
        +'<button class="chat-mini chat-head-icon" id="chat-list-unread-btn" title="Não lidas" aria-label="Não lidas">🔔<span class="chat-head-badge" id="chat-list-unread-badge">0</span></button>'
        +'<button class="chat-mini chat-head-icon" id="chat-list-filter-btn" title="Filtros" aria-label="Filtros">☰</button>';
    }
    if(row){
      var title=row.querySelector('h2');
      if(title) title.textContent='Messenger';
    }
    var side=page.querySelector('.chat-side');
    if(side && !document.getElementById('chat-fab-create')){
      var fab=document.createElement('button');
      fab.type='button';
      fab.id='chat-fab-create';
      fab.className='chat-fab';
      fab.title='Criar';
      fab.setAttribute('aria-label','Criar');
      fab.textContent='+';
      side.appendChild(fab);
    }
    var topRight=page.querySelector('.chat-top-right');
    if(topRight && !document.getElementById('chat-search-msg-btn')){
      var menu=topRight.querySelector('#chat-room-menu');
      topRight.innerHTML=''
        +'<button class="chat-mini" id="chat-search-msg-btn" title="Pesquisar na conversa" aria-label="Pesquisar na conversa">⌕</button>'
        +'<button class="chat-mini" id="chat-video-btn" title="Ação rápida" aria-label="Ação rápida">📹</button>'
        +'<button class="chat-mini" id="chat-call-btn" title="Ligar" aria-label="Ligar">📞</button>';
      if(menu) topRight.appendChild(menu);
      else {
        var btn=document.createElement('button');
        btn.className='chat-mini';
        btn.id='chat-room-menu';
        btn.title='Mais opções';
        btn.setAttribute('aria-label','Mais opções');
        btn.textContent='⋯';
        topRight.appendChild(btn);
      }
    }
    var metaHost=page.querySelector('.chat-top-left > div:last-child');
    if(metaHost && !metaHost.classList.contains('chat-top-meta')) metaHost.classList.add('chat-top-meta');
    syncHeaderActions();
    syncUnreadBadge();
  }

  function syncUnreadBadge(){
    var total=(window.C&&C.rooms||[]).reduce(function(sum,r){ return sum + (typeof unread==='function' ? unread(r) : 0); },0);
    var badge=document.getElementById('chat-list-unread-badge');
    if(badge){
      badge.textContent=total>99?'99+':String(total||0);
      badge.classList.toggle('show', total>0);
    }
  }

  function getDirectUser(r){
    if(!r || r.type!=='direct') return null;
    var other=(r.memberIds||[]).filter(function(id){ return id!==me(); })[0];
    return other ? (getUser(other) || null) : null;
  }

  function roomInfoLabel(r){
    if(!r) return '';
    var u=getDirectUser(r);
    if(u){
      var bits=[];
      if(u.cargo) bits.push(u.cargo);
      var deps=(typeof userDeptIds==='function' ? userDeptIds(u.id) : []).map(function(id){ return typeof deptName==='function' ? deptName(id) : id; }).filter(Boolean);
      if(deps[0]) bits.push(deps[0]);
      var tel=(typeof _crmPhoneRaw==='function' ? _crmPhoneRaw(u) : (u.whatsapp||u.telefone||u.phone||''));
      if(tel) bits.push(typeof _crmFmtPhone==='function' ? _crmFmtPhone(tel) : tel);
      return bits.join(' • ');
    }
    return roomSub(r) || ((r.memberIds||[]).length+' participantes');
  }

  function syncHeaderActions(){
    var r=typeof activeRoom==='function' ? activeRoom() : null;
    var callBtn=document.getElementById('chat-call-btn');
    var videoBtn=document.getElementById('chat-video-btn');
    if(!callBtn || !videoBtn) return;
    var u=getDirectUser(r);
    var tel=u && (typeof _crmPhoneRaw==='function' ? _crmPhoneRaw(u) : (u.whatsapp||u.telefone||u.phone||''));
    callBtn.disabled=!tel;
    callBtn.style.opacity=tel?'1':'.45';
    videoBtn.title=tel?'Abrir WhatsApp':'Abrir mídia e informações';
    videoBtn.setAttribute('aria-label', videoBtn.title);
    var sub=document.getElementById('chat-top-sub');
    if(sub && r){
      var typing=(typeof typingUsers==='function' ? typingUsers(r).join(', ') : '');
      sub.textContent=typing?('digitando: '+typing):roomInfoLabel(r);
    }
  }

  function formatMsgPreview(m){
    if(!m) return '';
    if(m.deleted) return 'Mensagem excluída';
    var txt=String(m.text||'').trim();
    if(txt) return txt.length>180 ? txt.slice(0,177)+'...' : txt;
    var a=(m.attachments||[])[0];
    return a ? ('[anexo] '+(a.name||'Arquivo')) : 'Sem conteúdo';
  }

  function openMsgSheet(id){
    var r=typeof activeRoom==='function' ? activeRoom() : null;
    var m=(window.C&&C.msgs||[]).find(function(x){ return x.id===id; });
    if(!r || !m) return;
    var rx=document.getElementById('chat-msg-sheet-rx');
    var list=document.getElementById('chat-msg-sheet-list');
    var preview=document.getElementById('chat-msg-sheet-preview');
    if(!rx || !list || !preview) return;
    var emojis=['👍','❤️','😂','😮','🔥','😢'];
    var myRx=m.reactions||{};
    rx.innerHTML=emojis.map(function(emoji){
      var on=!!(myRx[emoji] && myRx[emoji][me()]);
      return '<button type="button" class="chat-msg-rx-btn'+(on?' on':'')+'" data-chat-quick-rx="'+attr(emoji)+'" data-chat-msgid="'+attr(id)+'">'+esc(emoji)+'</button>';
    }).join('');
    preview.innerHTML='<div class="chat-msg-sheet-quote"><strong>'+esc(m.senderName||'Mensagem')+'</strong><div style="margin-top:4px">'+esc(formatMsgPreview(m))+'</div></div>';
    var canEdit=!m.deleted && (m.senderId===me() || (typeof roomCanManage==='function' && roomCanManage(r)));
    var canDelete=(m.senderId===me() || (typeof roomCanManage==='function' && roomCanManage(r)));
    var actions=[
      {a:'reply',label:'Responder',sub:'Citar esta mensagem no campo de envio'},
      {a:'copy',label:'Copiar',sub:'Copiar o texto da mensagem'},
      {a:'edit',label:'Editar',sub:'Atualizar o conteúdo já enviado',show:canEdit},
      {a:'forward',label:'Encaminhar',sub:'Escolher outro destinatário'},
      {a:'reads',label:'Informações',sub:'Ver leitura e entrega'},
      {a:'pin',label:'Fixar',sub:'Destacar no topo da conversa'},
      {a:'delete',label:'Excluir',sub:'Ocultar para todos nesta conversa',danger:1,show:canDelete}
    ].filter(function(item){ return item.show!==false; });
    list.innerHTML=actions.map(function(item){
      return '<button type="button" class="chat-msg-sheet-btn'+(item.danger?' danger':'')+'" data-chat-sheet-action="'+attr(item.a)+'" data-chat-msgid="'+attr(id)+'"><span><strong>'+esc(item.label)+'</strong><small>'+esc(item.sub)+'</small></span></button>';
    }).join('');
    openM('mo-chat-msg-sheet');
  }

  function ensureInspectHero(){
    var modal=document.getElementById('mo-chat-inspect');
    if(!modal) return;
    var head=modal.querySelector('.chat-inspect-head');
    if(head && !document.getElementById('chat-detail-hero')){
      var hero=document.createElement('div');
      hero.id='chat-detail-hero';
      hero.className='chat-detail-hero';
      var tabs=head.querySelector('.chat-inspect-tabs');
      head.insertBefore(hero, tabs || null);
    }
  }

  function enhanceInspect(){
    ensureInspectHero();
    var hero=document.getElementById('chat-detail-hero');
    var r=typeof activeRoom==='function' ? activeRoom() : null;
    if(!hero || !r) return;
    var u=getDirectUser(r);
    var tel=u && (typeof _crmPhoneRaw==='function' ? _crmPhoneRaw(u) : (u.whatsapp||u.telefone||u.phone||''));
    var deps=u ? (typeof userDeptIds==='function' ? userDeptIds(u.id) : []).map(function(id){ return typeof deptName==='function' ? deptName(id) : id; }).filter(Boolean) : [];
    var meta=[];
    if(u){
      if(u.cargo) meta.push('<div class="chat-detail-meta-line"><b>Cargo:</b> '+esc(u.cargo)+'</div>');
      if(deps[0]) meta.push('<div class="chat-detail-meta-line"><b>Departamento:</b> '+esc(deps[0])+'</div>');
      if(tel) meta.push('<div class="chat-detail-meta-line"><b>Contato:</b> '+esc(typeof _crmFmtPhone==='function' ? _crmFmtPhone(tel) : tel)+'</div>');
    }else{
      meta.push('<div class="chat-detail-meta-line"><b>Participantes:</b> '+esc(String((r.memberIds||[]).length||0))+'</div>');
      meta.push('<div class="chat-detail-meta-line"><b>Departamento:</b> '+esc(((r.deptIds||[]).map(function(id){ return typeof deptName==='function' ? deptName(id) : id; }).join(', ')) || 'Compartilhado')+'</div>');
      meta.push('<div class="chat-detail-meta-line"><b>Tipo:</b> '+esc(r.type==='group'?'Grupo':'Conversa')+'</div>');
    }
    var acts=[];
    if(tel){
      acts.push('<button type="button" class="chat-detail-act" data-chat-inspect-action="wa"><span class="chat-detail-act-ic">📹</span><span>WhatsApp</span></button>');
      acts.push('<button type="button" class="chat-detail-act" data-chat-inspect-action="call"><span class="chat-detail-act-ic">📞</span><span>Chamada</span></button>');
      acts.push('<button type="button" class="chat-detail-act'+((C._detailTab||'media')==='media'?' on':'')+'" data-chat-inspect-action="media"><span class="chat-detail-act-ic">🖼️</span><span>Mídia</span></button>');
      acts.push('<button type="button" class="chat-detail-act" data-chat-inspect-action="search"><span class="chat-detail-act-ic">🔎</span><span>Pesquisar</span></button>');
    }else{
      [['media','🖼️','Mídia'],['files','📎','Arquivos'],['links','🔗','Links'],['audio','🎧','Áudio']].forEach(function(item){
        acts.push('<button type="button" class="chat-detail-act'+((C._detailTab||'media')===item[0]?' on':'')+'" data-chat-inspect-action="'+item[0]+'"><span class="chat-detail-act-ic">'+item[1]+'</span><span>'+item[2]+'</span></button>');
      });
    }
    hero.innerHTML=''
      +'<div class="chat-detail-meta">'+meta.join('')+'</div>'
      +'<div class="chat-detail-actions">'+acts.join('')+'</div>';
  }

  function bindOnce(){
    if(bindOnce._ok) return;
    bindOnce._ok=1;
    document.addEventListener('click', function(e){
      var t=e.target;
      if(t.closest('#chat-fab-create')){ e.preventDefault(); openM('mo-chat-create'); return; }
      var create=t.closest('[data-chat-create-action]');
      if(create){ e.preventDefault(); closeM('mo-chat-create'); openNew(create.getAttribute('data-chat-create-action')); return; }
      if(t.closest('#chat-list-search-btn')){ e.preventDefault(); var inp=document.getElementById('chat-search'); if(inp){ inp.focus(); inp.scrollIntoView({block:'nearest'}); } return; }
      if(t.closest('#chat-list-unread-btn')){ e.preventDefault(); C.filter='unread'; renderRooms(); return; }
      if(t.closest('#chat-list-filter-btn')){ e.preventDefault(); var dep=document.getElementById('chat-dept'); if(dep){ dep.focus(); dep.scrollIntoView({block:'nearest'}); } return; }
      if(t.closest('#chat-search-msg-btn')){ e.preventDefault(); var q=document.getElementById('chat-msg-search'); if(q){ q.focus(); q.scrollIntoView({block:'nearest'}); } return; }
      if(t.closest('#chat-video-btn')){ e.preventDefault(); var r=typeof activeRoom==='function' ? activeRoom() : null; var u=getDirectUser(r); var tel=u && (typeof _crmPhoneRaw==='function' ? _crmPhoneRaw(u) : (u.whatsapp||u.telefone||u.phone||'')); if(tel && typeof openWhatsApp==='function'){ openWhatsApp(tel,u.nome||''); } else if(typeof _chatOpenInspect==='function'){ _chatOpenInspect('media'); } return; }
      if(t.closest('#chat-call-btn')){ e.preventDefault(); var r2=typeof activeRoom==='function' ? activeRoom() : null; var u2=getDirectUser(r2); var tel2=u2 && (typeof _crmPhoneRaw==='function' ? _crmPhoneRaw(u2) : (u2.whatsapp||u2.telefone||u2.phone||'')); if(tel2 && typeof callClient==='function'){ callClient(tel2,u2.nome||''); } return; }
      var act=t.closest('[data-chat-sheet-action]');
      if(act){ e.preventDefault(); closeM('mo-chat-msg-sheet'); runMsgAction(act.getAttribute('data-chat-sheet-action'), act.getAttribute('data-chat-msgid')); return; }
      var rx=t.closest('[data-chat-quick-rx]');
      if(rx){ e.preventDefault(); closeM('mo-chat-msg-sheet'); if(typeof v4ToggleRx==='function') v4ToggleRx(rx.getAttribute('data-chat-msgid'), rx.getAttribute('data-chat-quick-rx')); return; }
      var inspect=t.closest('[data-chat-inspect-action]');
      if(inspect){
        e.preventDefault();
        var action=inspect.getAttribute('data-chat-inspect-action');
        var r3=typeof activeRoom==='function' ? activeRoom() : null;
        var u3=getDirectUser(r3);
        var tel3=u3 && (typeof _crmPhoneRaw==='function' ? _crmPhoneRaw(u3) : (u3.whatsapp||u3.telefone||u3.phone||''));
        if(action==='call' && tel3 && typeof callClient==='function'){ callClient(tel3,u3.nome||''); return; }
        if(action==='wa' && tel3 && typeof openWhatsApp==='function'){ openWhatsApp(tel3,u3.nome||''); return; }
        if(action==='search'){ closeM('mo-chat-inspect'); var q2=document.getElementById('chat-msg-search'); if(q2){ q2.focus(); q2.scrollIntoView({block:'nearest'}); } return; }
        if(['media','files','links','audio'].indexOf(action)>=0){ C._detailTab=action; if(typeof _chatRenderInspect==='function') _chatRenderInspect(); return; }
      }
    }, true);

    document.addEventListener('input', function(e){
      if(e.target && e.target.id==='chat-forward-search'){
        var q=String(e.target.value||'').toLowerCase();
        (document.querySelectorAll('#chat-forward-list [data-fwd-room]')||[]).forEach(function(btn){
          var txt=String(btn.textContent||'').toLowerCase();
          btn.style.display=txt.indexOf(q)>=0?'':'none';
        });
      }
    }, true);
  }

  var _origEnsureMarkup=window.ensureMarkup;
  window.ensureMarkup=function(){ var out=_origEnsureMarkup.apply(this,arguments); setTimeout(applyLayout,0); return out; };
  var _origRenderRooms=window.renderRooms;
  window.renderRooms=function(){ var out=_origRenderRooms.apply(this,arguments); applyLayout(); syncUnreadBadge(); return out; };
  var _origRenderHeader=window.renderHeader;
  window.renderHeader=function(){ var out=_origRenderHeader.apply(this,arguments); applyLayout(); syncHeaderActions(); return out; };
  var _origOpenMsgMenu=window.openMsgMenu;
  window.openMsgMenu=function(e,id){ if(typeof isMobileView==='function' && isMobileView()){ openMsgSheet(id); return; } return _origOpenMsgMenu.apply(this,arguments); };
  if(typeof _chatRenderInspect==='function'){
    var _origInspect=_chatRenderInspect;
    window._chatRenderInspect=function(){ var out=_origInspect.apply(this,arguments); enhanceInspect(); return out; };
  }

  ensureStyle();
  bindOnce();
  setTimeout(function(){ try{ applyLayout(); enhanceInspect(); }catch(_e){} }, 0);
})();
