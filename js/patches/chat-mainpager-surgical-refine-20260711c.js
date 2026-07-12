(function(){
  if(window.__CHAT_SURGICAL_REFINEMENT_20260711C__) return;
  window.__CHAT_SURGICAL_REFINEMENT_20260711C__ = 1;

  function q(s,p){ return (p||document).querySelector(s); }
  function qa(s,p){ return Array.prototype.slice.call((p||document).querySelectorAll(s)); }
  function el(id){ return document.getElementById(id); }
  function mob(){ return window.matchMedia('(max-width:768px)').matches; }
  function E(v){ return window.eH ? eH(String(v == null ? '' : v)) : String(v == null ? '' : v); }
  function A(v){ return window._htmlAttr ? _htmlAttr(String(v == null ? '' : v)) : String(v == null ? '' : v); }
  function shortTxt(s,n){ s = String(s || '').trim(); return s.length > (n || 80) ? s.slice(0,(n || 80) - 1) + '…' : s; }
  function phoneRaw(u){ return u && ((typeof _crmPhoneRaw === 'function' && _crmPhoneRaw(u)) || u.whatsapp || u.telefone || u.phone || u.celular || '') || ''; }
  function phoneFmt(v){ return typeof _crmFmtPhone === 'function' ? _crmFmtPhone(v) : String(v || ''); }
  function directUser(r){
    if(!r || r.type !== 'direct' || typeof me !== 'function') return null;
    var other = (r.memberIds || []).filter(function(id){ return id !== me(); })[0];
    return other && typeof getUser === 'function' ? getUser(other) : null;
  }
  function roomSubline(r){
    var u = directUser(r), bits = [];
    if(u){ if(u.cargo) bits.push(u.cargo); if(phoneRaw(u)) bits.push(phoneFmt(phoneRaw(u))); return bits.join(' • ') || 'Conversa direta'; }
    return (typeof roomSub === 'function' && roomSub(r)) || (((r && r.memberIds) || []).length + ' participantes');
  }
  function icon(name){
    var p = {
      video:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1.2l3.8-2.2a1 1 0 0 1 1.5.87v9.3a1 1 0 0 1-1.5.87L15.5 15v1.5a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-9Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
      call:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 4.8h2.9l1.4 3.6-1.8 1.7a15 15 0 0 0 4.8 4.8l1.7-1.8 3.6 1.4v2.9a1.8 1.8 0 0 1-1.8 1.8C10 19.2 4.8 14 4.8 7.2a1.8 1.8 0 0 1 1.8-2.4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
      search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.8" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M20 20l-4.3-4.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
      more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="18" cy="12" r="1.7" fill="currentColor"/></svg>',
      users:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.4 11.2a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm7.4-.8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.8 18.3a4.7 4.7 0 0 1 9.4 0M13.3 18.3a4 4 0 0 1 6.9-2.7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      reply:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 8 5 12l5 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 12h7.2a4.8 4.8 0 0 1 4.8 4.8v.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      copy:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="10" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 15H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
      edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l9.5-9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
      forward:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5l6 7-6 7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      spark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.4 5.1L18.5 9 13.4 10.4 12 15.5l-1.4-5.1L5.5 9l5.1-1.4L12 3Z" fill="currentColor"/></svg>',
      task:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="4.5" width="14" height="15" rx="2.3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.2 9h7.6M8.2 12.5h5.7M8.2 16h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
      dots:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>',
      delete:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5.4a1.4 1.4 0 0 1 1.4-1.4h3.2A1.4 1.4 0 0 1 15 5.4V7m-8.6 0 .8 11a2 2 0 0 0 2 1.8h5.6a2 2 0 0 0 2-1.8l.8-11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      send:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19l16-7L4 5l2.8 7L4 19Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M6.8 12H20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
    };
    return p[name] || '';
  }
  function ensureStyle(){
    if(el('chat-mainpager-surgical-refine-20260711c-style')) return;
    var st = document.createElement('style');
    st.id = 'chat-mainpager-surgical-refine-20260711c-style';
    st.textContent = `
      #pg-chat .chat-empty{background:linear-gradient(180deg,#fff 0%,#fbfdff 100%)}
      #pg-chat .chat-empty-hero{width:172px;height:132px;border:none;background:transparent;box-shadow:none;padding:0;color:transparent;margin-bottom:10px}
      #pg-chat .chat-empty-hero svg{width:100%;height:100%;display:block}
      #pg-chat .chat-empty h3{margin:2px 0 6px;font:600 1.02rem/1.25 Inter,Outfit,sans-serif;color:#5f6978}
      #pg-chat .chat-empty-sub{font-size:.88rem;color:#96a0ae}
      #pg-chat .chat-sheet-btn-main{display:flex;align-items:center;gap:12px;min-width:0}
      #pg-chat .chat-sheet-btn-main strong{display:block;font-size:.95rem;line-height:1.2}
      #pg-chat .chat-sheet-btn-main small{display:block;margin-top:2px;font-size:.74rem;color:#8c97a6}
      #pg-chat .chat-sheet-ic{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;color:#6e7785;flex:0 0 auto}
      #pg-chat .chat-sheet-chevron{color:#b0b7c3;font-size:1rem;line-height:1}
      #pg-chat .chat-msg-rx-btn.on{border-color:#b8d8ff;background:#eef6ff}
      #pg-chat .chat-video-pill svg,#pg-chat .chat-room-members-btn svg,#pg-chat .chat-room-search-btn svg,#pg-chat .chat-room-menu-desktop svg{width:18px;height:18px}
      #pg-chat .chat-video-pill{display:none}
      #pg-chat .chat-room-members-btn,#pg-chat .chat-room-search-btn,#pg-chat .chat-room-menu-desktop{display:none}
      #mo-chat-forward .chat-forward-room strong{font:600 .94rem/1.2 Inter,Outfit,sans-serif;color:#1f2937}
      #mo-chat-forward .chat-forward-room .chat-soft{font-size:.74rem;color:#8b95a3}
      #mo-chat-forward .chat-forward-search{width:100%;border:1px solid #e4eaf2;border-radius:999px;padding:11px 14px;font:500 .9rem/1.2 Inter,Outfit,sans-serif;color:#1f2937;background:#f8fafc;outline:none}
      #mo-chat-forward .chat-forward-filterchips{display:flex;gap:8px;padding:0 0 12px}
      #mo-chat-forward .chat-forward-chip{border:1px solid #d7dde7;background:#fff;color:#1f2937;border-radius:999px;padding:8px 12px;font:500 .78rem/1 Inter,Outfit,sans-serif}
      #mo-chat-forward .chat-forward-chip.on{border-color:#b7c2d2;box-shadow:inset 0 0 0 1px #b7c2d2}
      #mo-chat-inspect .chat-inspect-title{align-items:center}
      #mo-chat-inspect .chat-inspect-sub{line-height:1.35}
      #mo-chat-inspect .chat-inspect-tab{font-weight:600}
      @media (min-width:769px){
        #pg-chat{max-width:none!important;padding:14px 16px 18px!important}
        #pg-chat .chat-shell{grid-template-columns:348px minmax(0,1fr)!important;min-height:calc(100vh - 108px)!important;border-radius:18px!important;border:1px solid #dfe7f0!important;box-shadow:0 16px 44px rgba(19,41,72,.08)!important;background:#fff!important}
        #pg-chat .chat-side{border-right:1px solid #edf2f7!important;background:#fff!important}
        #pg-chat .chat-hd{padding:12px 14px 10px!important;background:#fff!important;border-bottom:1px solid #eef2f6!important}
        #pg-chat .chat-side-tools{padding:10px 14px 10px!important;background:#fff!important;border-bottom:1px solid #eef2f6!important}
        #pg-chat #chat-search{height:42px!important;border-radius:999px!important;padding:0 16px!important;background:#fff!important}
        #pg-chat #chat-dept{height:40px!important;border-radius:12px!important}
        #pg-chat .chat-filter-row{gap:6px!important;padding-top:2px}
        #pg-chat .chat-filter-row .chat-mini{border-radius:999px!important;height:34px!important;min-height:34px!important;padding:0 12px!important}
        #pg-chat .chat-room{padding:12px 14px 12px 16px!important;min-height:74px!important}
        #pg-chat .chat-av{width:44px!important;height:44px!important;font-size:.92rem!important}
        #pg-chat .chat-room-name{font-size:.95rem!important}
        #pg-chat .chat-room-sub{font-size:.73rem!important}
        #pg-chat .chat-room-last{font-size:.79rem!important}
        #pg-chat .chat-room-time{font-size:.71rem!important}
        #pg-chat .chat-room-meta{gap:6px!important}
        #pg-chat .chat-top{padding:14px 18px!important;background:#fff!important;border-bottom:1px solid #e9eef4!important}
        #pg-chat .chat-top-left{gap:12px!important}
        #pg-chat .chat-top-title{font-size:1rem!important}
        #pg-chat .chat-top-sub{font-size:.75rem!important;color:#8692a2!important;max-width:46vw!important}
        #pg-chat .chat-top-right{gap:10px!important}
        #pg-chat .chat-video-pill{display:inline-flex!important;align-items:center;gap:8px;height:38px;padding:0 14px;border:none;border-radius:999px;background:#22a7ff;color:#fff;font:700 .82rem/1 Inter,Outfit,sans-serif;box-shadow:0 10px 24px rgba(34,167,255,.22)}
        #pg-chat .chat-video-pill:hover{filter:brightness(.98)}
        #pg-chat .chat-room-members-btn,#pg-chat .chat-room-search-btn,#pg-chat .chat-room-menu-desktop{display:inline-flex!important;align-items:center;justify-content:center;width:38px!important;height:38px!important;min-width:38px!important;border-radius:12px!important;border:1px solid #e5ebf3!important;background:#fff!important;color:#6c7584!important;padding:0!important}
        #pg-chat #chat-video-btn,#pg-chat #chat-call-btn,#pg-chat #chat-room-menu{display:none!important}
        #pg-chat .chat-pin-bar{margin:0 18px!important}
        #pg-chat .chat-msgs{padding:20px 22px!important;background:linear-gradient(180deg,#eef6ff 0%,#f7fbff 14%,#f5f9fe 100%)!important}
        #pg-chat .chat-bubble{max-width:min(76%,640px)!important;border-radius:16px 16px 16px 7px!important;padding:10px 12px 9px!important}
        #pg-chat .chat-row.me .chat-bubble{border-radius:16px 16px 7px 16px!important}
        #pg-chat .chat-compose{padding:12px 14px!important;background:#fff!important;border-top:1px solid #e8eef5!important}
        #pg-chat .chat-compose-row{grid-template-columns:42px 42px minmax(0,1fr) 42px!important;gap:8px!important;align-items:center!important}
        #pg-chat #chat-text{min-height:46px!important;border-radius:24px!important;padding:12px 15px!important;background:#fff!important}
        #pg-chat #chat-send{width:42px!important;height:42px!important;min-width:42px!important;border:none!important;border-radius:50%!important;background:#21a6ff!important;color:#fff!important;box-shadow:0 10px 20px rgba(33,166,255,.2)!important}
        #pg-chat #chat-send:hover{filter:brightness(.98)}
        #mo-chat-forward .mb{width:min(560px,92vw)!important;max-width:none!important;max-height:min(82vh,780px)!important;margin:3vh auto 0!important;border-radius:22px!important;overflow:hidden!important;background:#fff!important}
        #mo-chat-forward .mb::before{display:none!important}
        #mo-chat-forward .mb h2{display:block!important;padding:18px 20px 0!important;margin:0!important;font:700 1.04rem/1.2 Inter,Outfit,sans-serif;color:#1f2937}
        #mo-chat-forward .mbs{display:none!important}
        #mo-chat-forward .mf:first-of-type{display:none!important}
        #mo-chat-forward .mf:last-of-type{padding:0 20px 14px!important;margin:0!important}
        #mo-chat-forward .mbtns{position:sticky!important;bottom:0!important;padding:12px 20px 18px!important;margin:0!important;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.92) 24%,#fff)!important}
        #mo-chat-inspect .mb{width:min(980px,94vw)!important;max-width:none!important;height:auto!important;max-height:90vh!important;border-radius:22px!important;overflow:hidden!important}
        #mo-chat-inspect .chat-inspect-head{padding:0 0 10px!important;background:linear-gradient(180deg,#fff,#f7fbff)!important;border-bottom:1px solid #eef2f6!important}
        #mo-chat-inspect .chat-inspect-topbar{padding:10px 16px 8px!important}
        #mo-chat-inspect .chat-detail-hero{padding:12px 20px 0!important}
        #mo-chat-inspect .chat-detail-actions{grid-template-columns:repeat(4,minmax(0,1fr))!important}
        #mo-chat-inspect .chat-inspect-body{padding:16px 20px 22px!important;max-height:min(68vh,760px)!important;background:#fbfdff!important}
      }
      @media (max-width:768px){
        #chat-page.bitrix-mainpager-2026 .chat-room{min-height:82px!important;padding:13px 14px!important;gap:12px!important}
        #chat-page.bitrix-mainpager-2026 .chat-room .chat-av{width:46px!important;height:46px!important}
        #chat-page.bitrix-mainpager-2026 .chat-room-name{font-size:.96rem!important}
        #chat-page.bitrix-mainpager-2026 .chat-room-last{margin-top:5px!important}
        #chat-page.bitrix-mainpager-2026 .chat-top{padding:11px 12px!important}
        #chat-page.bitrix-mainpager-2026 .chat-top-title{font-size:1rem!important}
        #chat-page.bitrix-mainpager-2026 .chat-top-sub{max-width:52vw!important}
        #chat-page.bitrix-mainpager-2026 .chat-msgs{padding:14px 12px 16px!important}
        #chat-page.bitrix-mainpager-2026 .chat-bubble{padding:10px 11px 9px!important}
        #chat-page.bitrix-mainpager-2026 .chat-compose{padding:8px 10px calc(10px + env(safe-area-inset-bottom))!important}
        #chat-page.bitrix-mainpager-2026 .chat-compose-row{grid-template-columns:40px minmax(0,1fr) 40px 40px!important;gap:8px!important}
        #chat-page.bitrix-mainpager-2026 #chat-text{min-height:46px!important}
        #chat-page.bitrix-mainpager-2026 #chat-send,#chat-page.bitrix-mainpager-2026 #chat-rec,#chat-page.bitrix-mainpager-2026 #chat-attach,#chat-page.bitrix-mainpager-2026 #chat-emoji-btn{width:40px!important;height:40px!important;min-width:40px!important}
        #mo-chat-msg-sheet .chat-msg-sheet-btn{display:flex!important;align-items:center;justify-content:space-between!important}
        #mo-chat-msg-sheet .chat-msg-sheet-btn.copilot .chat-sheet-ic{color:#9a4bda!important}
        #mo-chat-msg-sheet .chat-msg-sheet-btn.danger .chat-sheet-ic{color:#d84b4b!important}
      }
    `;
    document.head.appendChild(st);
  }
  function emptySvg(){
    return '<svg viewBox="0 0 220 160" aria-hidden="true"><defs><linearGradient id="g1" x1="0" x2="1"><stop offset="0" stop-color="#57c7f7"/><stop offset="1" stop-color="#7cd8ff"/></linearGradient><linearGradient id="g2" x1="0" x2="1"><stop offset="0" stop-color="#ff9bd4"/><stop offset="1" stop-color="#ffb6e2"/></linearGradient></defs><rect x="92" y="34" width="66" height="50" rx="16" fill="#eef8ff" stroke="#8ed3f7" stroke-width="4"/><rect x="103" y="45" width="44" height="9" rx="4.5" fill="#9fdcff"/><rect x="103" y="60" width="34" height="7" rx="3.5" fill="#c6ebff"/><circle cx="150" cy="48" r="3.6" fill="#57c7f7"/><path d="M86 62c-20 0-34 12-34 30 0 16 11 26 26 26h18" fill="none" stroke="url(#g1)" stroke-width="8" stroke-linecap="round"/><path d="M93 98c-8 4-12 10-12 18" fill="none" stroke="url(#g1)" stroke-width="8" stroke-linecap="round"/><path d="M111 102c-9 4-13 11-13 20" fill="none" stroke="url(#g1)" stroke-width="8" stroke-linecap="round"/><path d="M134 95c18 0 33 13 33 31 0 16-12 28-27 28h-7" fill="none" stroke="url(#g2)" stroke-width="8" stroke-linecap="round"/><path d="M132 110c8 4 12 11 12 19" fill="none" stroke="url(#g2)" stroke-width="8" stroke-linecap="round"/><path d="M149 106c9 4 14 12 14 23" fill="none" stroke="url(#g2)" stroke-width="8" stroke-linecap="round"/><circle cx="124" cy="99" r="28" fill="url(#g2)"/><circle cx="114" cy="96" r="3.4" fill="#23324a"/><circle cx="130" cy="96" r="3.4" fill="#23324a"/><path d="M114 108c4 5 12 5 16 0" fill="none" stroke="#23324a" stroke-width="3" stroke-linecap="round"/></svg>';
  }
  function refineEmptyState(){
    var empty = el('chat-empty'); if(!empty) return;
    var hero = q('.chat-empty-hero', empty); if(hero){ hero.innerHTML = emptySvg(); hero.setAttribute('aria-hidden','true'); }
    var h = q('h3', empty); if(h) h.textContent = 'Selecione um bate-papo';
    var sub = q('.chat-empty-sub', empty); if(sub) sub.textContent = 'para começar a se comunicar';
  }
  function ensureDesktopTopBar(){
    if(mob()) return;
    var right = q('#chat-page .chat-top-right');
    if(!right) return;
    right.innerHTML = '<button class="chat-video-pill" id="chat-video-pill" type="button">'+icon('video')+'<span>Chamada de vídeo</span></button><button class="chat-room-members-btn" id="chat-room-members-btn" type="button" aria-label="Sobre bate-papo">'+icon('users')+'</button><button class="chat-room-search-btn" id="chat-room-search-btn" type="button" aria-label="Pesquisar na conversa">'+icon('search')+'</button><button class="chat-room-menu-desktop" id="chat-room-menu-desktop" type="button" aria-label="Mais opções">'+icon('more')+'</button>';
    var back = el('chat-back-btn'); if(back) back.innerHTML = icon('reply');
  }
  function buildSheetBtn(label,sub,ic,action,id,danger,extraCls){
    return '<button class="chat-msg-sheet-btn'+(danger?' danger':'')+(extraCls?' '+extraCls:'')+'" type="button" data-chat-sheet-action="'+A(action)+'" data-chat-sheet-msgid="'+A(id)+'"><span class="chat-sheet-btn-main"><span class="chat-sheet-ic">'+ic+'</span><span><strong>'+E(label)+'</strong>'+(sub?'<small>'+E(sub)+'</small>':'')+'</span></span><span class="chat-sheet-chevron">›</span></button>';
  }
  function openMsgSheetV2(id){
    var modal = el('mo-chat-msg-sheet');
    var r = typeof activeRoom === 'function' ? activeRoom() : null;
    var m = (window.C && C.msgs || []).find(function(x){ return x.id === id; });
    if(!modal || !r || !m) return;
    var box = q('.mb', modal); if(!box) return;
    var emojis = ['👍','😂','❤️','😮','🔥','😢'];
    var canEdit = !m.deleted && (m.senderId === me() || (typeof roomCanManage === 'function' && roomCanManage(r)));
    var canDelete = m.senderId === me() || (typeof roomCanManage === 'function' && roomCanManage(r));
    var snippet = shortTxt(m.text || (((m.attachments || [])[0] || {}).name || '[anexo]'), 180);
    box.innerHTML = '<div class="chat-sheet-head"><div class="chat-sheet-title">Mensagem</div></div>'
      + '<div class="chat-msg-reactions">' + emojis.map(function(rx){ var on = !!(m.reactions && m.reactions[rx] && m.reactions[rx][me()]); return '<button class="chat-msg-rx-btn'+(on?' on':'')+'" type="button" data-chat-sheet-rx="'+A(rx)+'" data-chat-sheet-msgid="'+A(id)+'">'+E(rx)+'</button>'; }).join('') + '</div>'
      + '<div class="chat-msg-sheet-preview"><div class="chat-msg-sheet-quote"><strong>'+E(m.senderName || 'Mensagem')+'</strong><div style="margin-top:4px">'+E(snippet)+'</div></div></div>'
      + '<div class="chat-sheet-body"><div class="chat-msg-sheet-list">'
      + buildSheetBtn('Responder','Responder nesta conversa',icon('reply'),'reply',id,false,'')
      + buildSheetBtn('Copiar','Copiar conteúdo da mensagem',icon('copy'),'copy',id,false,'')
      + (canEdit ? buildSheetBtn('Editar','Ajustar texto enviado',icon('edit'),'edit',id,false,'') : '')
      + buildSheetBtn('Encaminhar','Selecionar destinatário',icon('forward'),'forward',id,false,'')
      + buildSheetBtn('Pergunte ao CoPilot','Usar a mensagem como contexto',icon('spark'),'copilot',id,false,'copilot')
      + buildSheetBtn('Criar tarefa','Transformar em atividade',icon('task'),'task',id,false,'')
      + buildSheetBtn('Outro','Mais ações da mensagem',icon('dots'),'other',id,false,'')
      + (canDelete ? buildSheetBtn('Excluir','Ocultar para todos da conversa',icon('delete'),'delete',id,true,'') : '')
      + '</div></div>';
    openM('mo-chat-msg-sheet');
  }
  function refineForwardList(){
    var modal = el('mo-chat-forward'); if(!modal) return; var box = q('.mb', modal); if(!box) return;
    var search = q('#chat-forward-search', box);
    if(search) search.placeholder = 'Procura...';
    qa('#chat-forward-list [data-fwd-room]').forEach(function(btn){
      var id = btn.getAttribute('data-fwd-room');
      var r = window.C && C.roomMap && C.roomMap[id];
      if(!r) return;
      btn.innerHTML = '<span style="display:flex;align-items:center;gap:12px"><span>'+roomAvatar(r)+'</span><span style="min-width:0;text-align:left"><strong>'+E(roomTitle(r))+'</strong><span class="chat-soft" style="display:block;margin-top:2px">'+E(roomSubline(r))+'</span></span></span>';
    });
  }
  function refineInspectMeta(){
    var modal = el('mo-chat-inspect'); if(!modal) return;
    var r = typeof activeRoom === 'function' ? activeRoom() : null; if(!r) return;
    var u = directUser(r), tel = phoneRaw(u), sub = el('chat-inspect-sub');
    if(sub){
      var bits = [];
      if(u && u.cargo) bits.push(u.cargo);
      if(tel) bits.push(phoneFmt(tel));
      sub.textContent = bits.join(' • ') || 'Histórico compartilhado nesta conversa';
    }
  }
  function updateSearchPlaceholder(){
    var s = el('chat-search'); if(s) s.placeholder = 'Encontrar colaborador ou bate-papo';
  }
  function runDesktopHeaderAction(kind){
    var r = typeof activeRoom === 'function' ? activeRoom() : null;
    var u = directUser(r), tel = phoneRaw(u);
    if(kind === 'members'){ if(typeof _chatOpenInspect === 'function') _chatOpenInspect('contact'); return; }
    if(kind === 'search'){ var row = el('chat-msg-search-row'); if(row) row.style.display = 'grid'; var inp = el('chat-msg-search'); if(inp) setTimeout(function(){ inp.focus(); }, 20); return; }
    if(kind === 'menu'){ var btn = el('chat-room-menu-desktop'); if(!btn || typeof openRoomMenu !== 'function') return; var rect = btn.getBoundingClientRect(); openRoomMenu({clientX:rect.left + rect.width / 2, clientY:rect.bottom + 8}); return; }
    if(kind === 'video'){ if(tel && typeof openWhatsApp === 'function'){ openWhatsApp(tel, u && u.nome || ''); } else { toast('Abra a ficha da conversa para ver mídia, arquivos e ações.'); } }
  }
  function patchFns(){
    if(typeof openMsgMenu === 'function' && !window.__CHAT_MSGSHEET_V2_PATCHED__){
      window.__CHAT_MSGSHEET_V2_PATCHED__ = 1;
      var legacy = window._legacyOpenMsgMenu || window.openMsgMenu;
      window._legacyOpenMsgMenu = legacy;
      window.openMsgMenu = function(e,id){ if(mob()) return openMsgSheetV2(id); return legacy.apply(this, arguments); };
    }
    if(typeof renderHeader === 'function' && !window.__CHAT_RENDERHEADER_V2__){
      window.__CHAT_RENDERHEADER_V2__ = 1;
      var rh = renderHeader;
      window.renderHeader = function(){ var out = rh.apply(this, arguments); refineEmptyState(); ensureDesktopTopBar(); refineInspectMeta(); updateSearchPlaceholder(); return out; };
    }
    if(typeof renderRooms === 'function' && !window.__CHAT_RENDERROOMS_V2__){
      window.__CHAT_RENDERROOMS_V2__ = 1;
      var rr = renderRooms;
      window.renderRooms = function(){ var out = rr.apply(this, arguments); refineEmptyState(); updateSearchPlaceholder(); refineForwardList(); return out; };
    }
    if(typeof _chatRenderInspect === 'function' && !window.__CHAT_RENDERINSPECT_V2__){
      window.__CHAT_RENDERINSPECT_V2__ = 1;
      var ri = _chatRenderInspect;
      window._chatRenderInspect = function(){ var out = ri.apply(this, arguments); refineInspectMeta(); return out; };
    }
  }
  function bind(){
    if(window.__CHAT_SURGICAL_REFINEMENT_BIND__) return;
    window.__CHAT_SURGICAL_REFINEMENT_BIND__ = 1;
    document.addEventListener('click', function(e){
      var t = e.target;
      if(t.closest('#chat-video-pill')){ e.preventDefault(); runDesktopHeaderAction('video'); }
      else if(t.closest('#chat-room-members-btn')){ e.preventDefault(); runDesktopHeaderAction('members'); }
      else if(t.closest('#chat-room-search-btn')){ e.preventDefault(); runDesktopHeaderAction('search'); }
      else if(t.closest('#chat-room-menu-desktop')){ e.preventDefault(); runDesktopHeaderAction('menu'); }
      else if(t.closest('[data-chat-sheet-rx]')){
        e.preventDefault();
        var rx = t.closest('[data-chat-sheet-rx]');
        closeM('mo-chat-msg-sheet');
        if(typeof v4ToggleRx === 'function') v4ToggleRx(rx.getAttribute('data-chat-sheet-msgid'), rx.getAttribute('data-chat-sheet-rx'));
      }
      else if(t.closest('[data-chat-sheet-action]')){
        e.preventDefault();
        var btn = t.closest('[data-chat-sheet-action]');
        var act = btn.getAttribute('data-chat-sheet-action');
        var id = btn.getAttribute('data-chat-sheet-msgid');
        closeM('mo-chat-msg-sheet');
        if(act === 'copilot'){ toast('Entrada visual “Pergunte ao CoPilot” alinhada ao layout 2026.'); return; }
        if(act === 'task'){
          var m = (window.C && C.msgs || []).find(function(x){ return x.id === id; });
          var panel = el('act-panel'), inp = el('act-inp');
          if(typeof toggleActPanel === 'function' && panel && !panel.classList.contains('open')) toggleActPanel();
          if(inp && m){ inp.value = ('Responder mensagem de ' + (m.senderName || 'contato') + ': ' + shortTxt(m.text || (((m.attachments || [])[0] || {}).name || '[anexo]'), 180)).trim(); if(typeof selActType === 'function') selActType('task', q('#act-type-row .act-type-btn[data-t="task"]')); inp.focus(); toast('Descrição da tarefa preenchida.'); return; }
          toast('Painel de atividades não disponível.'); return;
        }
        if(act === 'other'){ if(window._legacyOpenMsgMenu) window._legacyOpenMsgMenu({clientX:window.innerWidth/2, clientY:window.innerHeight*0.55}, id); return; }
        if(typeof runMsgAction === 'function'){ runMsgAction(act, id); if(act === 'forward') setTimeout(refineForwardList, 40); }
      }
    }, true);
    document.addEventListener('input', function(e){
      if(e.target && e.target.id === 'chat-forward-search'){
        var val = String(e.target.value || '').toLowerCase();
        qa('#chat-forward-list [data-fwd-room]').forEach(function(btn){ btn.style.display = String(btn.textContent || '').toLowerCase().indexOf(val) >= 0 ? '' : 'none'; });
      }
    }, true);
    window.addEventListener('resize', function(){ ensureDesktopTopBar(); refineEmptyState(); refineForwardList(); }, {passive:true});
  }
  function boot(){
    ensureStyle();
    patchFns();
    bind();
    setTimeout(function(){ refineEmptyState(); ensureDesktopTopBar(); refineForwardList(); refineInspectMeta(); updateSearchPlaceholder(); }, 80);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
