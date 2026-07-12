(function(){
  if(window.__CHAT_MAINPAGER_PIXEL_REFINE_20260711D__) return;
  window.__CHAT_MAINPAGER_PIXEL_REFINE_20260711D__ = 1;

  function q(s,p){ return (p||document).querySelector(s); }
  function qa(s,p){ return Array.prototype.slice.call((p||document).querySelectorAll(s)); }
  function el(id){ return document.getElementById(id); }
  function mob(){ return window.matchMedia('(max-width:768px)').matches; }
  function esc(v){ return window.eH ? eH(String(v == null ? '' : v)) : String(v == null ? '' : v); }
  function attr(v){ return window._htmlAttr ? _htmlAttr(String(v == null ? '' : v)) : String(v == null ? '' : v); }
  function room(){ return typeof activeRoom === 'function' ? activeRoom() : null; }
  function meId(){ return typeof me === 'function' ? me() : null; }
  function userOf(r){
    if(!r || r.type !== 'direct' || !meId()) return null;
    var other = (r.memberIds || []).filter(function(id){ return id !== meId(); })[0];
    return other && typeof getUser === 'function' ? getUser(other) : null;
  }
  function phoneRaw(u){ return u && ((typeof _crmPhoneRaw === 'function' && _crmPhoneRaw(u)) || u.whatsapp || u.telefone || u.phone || u.celular || '') || ''; }
  function phoneFmt(v){ return typeof _crmFmtPhone === 'function' ? _crmFmtPhone(v) : String(v || ''); }
  function roomSubtitle(r){
    if(!r) return '';
    var u = userOf(r), bits = [];
    if(u){
      if(u.cargo) bits.push(u.cargo);
      if(phoneRaw(u)) bits.push(phoneFmt(phoneRaw(u)));
      return bits.join(' • ') || 'Conversa direta';
    }
    return typeof roomSub === 'function' ? roomSub(r) : (((r.memberIds || []).length || 0) + ' participantes');
  }
  function icon(name){
    var p = {
      back:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6 9 12l6 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      more:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="18" cy="12" r="1.7" fill="currentColor"/></svg>',
      search:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.8" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M20 20l-4.3-4.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
      video:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7.5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1.2l3.8-2.2a1 1 0 0 1 1.5.87v9.3a1 1 0 0 1-1.5.87L15.5 15v1.5a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-9Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
      call:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 4.8h2.9l1.4 3.6-1.8 1.7a15 15 0 0 0 4.8 4.8l1.7-1.8 3.6 1.4v2.9a1.8 1.8 0 0 1-1.8 1.8C10 19.2 4.8 14 4.8 7.2a1.8 1.8 0 0 1 1.8-2.4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>',
      clip:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 12.5 13.9 7a3 3 0 1 1 4.2 4.2l-7.8 7.8a4.2 4.2 0 0 1-6-6l8.2-8.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      mic:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="4" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M9 20h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
      send:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19l16-7L4 5l2.8 7L4 19Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M6.8 12H20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
      spark:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 1.4 5.1L18.5 9 13.4 10.4 12 15.5l-1.4-5.1L5.5 9l5.1-1.4L12 3Z" fill="currentColor"/></svg>'
    };
    return p[name] || '';
  }

  function ensureStyle(){
    if(el('chat-mainpager-pixel-refine-20260711d-style')) return;
    var st = document.createElement('style');
    st.id = 'chat-mainpager-pixel-refine-20260711d-style';
    st.textContent = `
      #chat-page.bitrix-mainpager-2026{--bx-line:#ebeff3;--bx-line-2:#e1e7ee;--bx-text:#1f2937;--bx-sub:#7f8a99;--bx-soft:#f6f8fb;--bx-blue:#1f87ff;--bx-blue-2:#23a7ff}
      #chat-page.bitrix-mainpager-2026 .chat-shell{gap:0!important;background:#fff!important;border:1px solid var(--bx-line-2)!important;border-radius:20px!important;box-shadow:0 18px 44px rgba(16,34,64,.08)!important;overflow:hidden!important}
      #chat-page.bitrix-mainpager-2026 .chat-side,#chat-page.bitrix-mainpager-2026 .chat-main{border:none!important;border-radius:0!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-side{border-right:1px solid var(--bx-line)!important;background:#fff!important}
      #chat-page.bitrix-mainpager-2026 .chat-hd{position:sticky;top:0;z-index:4;padding:12px 16px 10px!important;background:#fff!important;border-bottom:1px solid var(--bx-line)!important}
      #chat-page.bitrix-mainpager-2026 .chat-sync-row{margin-bottom:10px!important}
      #chat-page.bitrix-mainpager-2026 .chat-hd-row{min-height:38px!important;gap:10px!important}
      #chat-page.bitrix-mainpager-2026 .chat-hd-row h2{margin:0!important;font:700 1.48rem/1.05 Inter,Outfit,sans-serif!important;letter-spacing:-.02em;color:#1d2736!important}
      #chat-page.bitrix-mainpager-2026 .chat-actions{gap:8px!important}
      #chat-page.bitrix-mainpager-2026 .chat-head-icon,#chat-page.bitrix-mainpager-2026 .chat-actions .chat-mini{width:36px!important;height:36px!important;min-width:36px!important;padding:0!important;border-radius:12px!important;border:1px solid var(--bx-line)!important;background:#fff!important;color:#5f6b7c!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-head-icon svg,#chat-page.bitrix-mainpager-2026 .chat-top-right .chat-mini svg,#chat-page.bitrix-mainpager-2026 .chat-video-pill svg,#chat-page.bitrix-mainpager-2026 .chat-compose-row .chat-mini svg{width:18px;height:18px;display:block}
      #chat-page.bitrix-mainpager-2026 .chat-head-badge{top:-5px!important;right:-5px!important;min-width:18px!important;height:18px!important;padding:0 5px!important;border:2px solid #fff!important;border-radius:999px!important;background:#ff5858!important;color:#fff!important;font:700 10px/14px Inter,Outfit,sans-serif!important;display:flex;align-items:center;justify-content:center}
      #chat-page.bitrix-mainpager-2026 .chat-side-tools{padding:10px 16px 12px!important;background:#fff!important;border-bottom:1px solid var(--bx-line)!important;gap:8px!important}
      #chat-page.bitrix-mainpager-2026 #chat-search{height:42px!important;padding:0 15px 0 16px!important;border:1px solid var(--bx-line)!important;border-radius:999px!important;background:#fff!important;font:500 .9rem/42px Inter,Outfit,sans-serif!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 #chat-dept{height:40px!important;border:1px solid var(--bx-line)!important;border-radius:12px!important;background:#fff!important;font:500 .88rem/40px Inter,Outfit,sans-serif!important}
      #chat-page.bitrix-mainpager-2026 .chat-filter-row{display:flex!important;gap:6px!important;flex-wrap:nowrap!important;overflow:auto!important;padding-top:2px!important;scrollbar-width:none}
      #chat-page.bitrix-mainpager-2026 .chat-filter-row::-webkit-scrollbar{display:none}
      #chat-page.bitrix-mainpager-2026 .chat-filter-row .chat-mini{height:32px!important;min-height:32px!important;padding:0 12px!important;border-radius:999px!important;border:1px solid #d8dee6!important;background:#fff!important;color:#667281!important;font:600 .76rem/32px Inter,Outfit,sans-serif!important;white-space:nowrap!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-filter-row .chat-mini.on{border-color:#b9c3d0!important;background:#fff!important;color:#1f2937!important;box-shadow:inset 0 0 0 1px #b9c3d0!important}
      #chat-page.bitrix-mainpager-2026 .chat-room-list{padding:0!important;background:#fff!important}
      #chat-page.bitrix-mainpager-2026 .chat-room{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto!important;column-gap:12px!important;align-items:center!important;min-height:80px!important;padding:13px 16px 12px!important;margin:0!important;border:none!important;border-bottom:1px solid var(--bx-line)!important;border-radius:0!important;background:#fff!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-room:last-child{border-bottom:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-room:hover{background:#fafcff!important}
      #chat-page.bitrix-mainpager-2026 .chat-room.on{background:#f8fbff!important;box-shadow:inset 3px 0 0 #2b95ff!important}
      #chat-page.bitrix-mainpager-2026 .chat-room > div:first-child{align-self:start;padding-top:2px}
      #chat-page.bitrix-mainpager-2026 .chat-room .chat-av{width:48px!important;height:48px!important;font-size:1rem!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-room-name{display:flex!important;align-items:center!important;gap:6px!important;margin:0!important;font:700 .96rem/1.2 Inter,Outfit,sans-serif!important;color:#1f2937!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #chat-page.bitrix-mainpager-2026 .chat-room-sub{margin-top:2px!important;color:#7b8695!important;font:500 .75rem/1.3 Inter,Outfit,sans-serif!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #chat-page.bitrix-mainpager-2026 .chat-room-last{display:flex!important;align-items:center!important;gap:6px!important;margin-top:5px!important;color:#6a7583!important;font:500 .82rem/1.35 Inter,Outfit,sans-serif!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #chat-page.bitrix-mainpager-2026 .chat-room-meta{align-self:start;display:grid!important;justify-items:end!important;gap:6px!important;padding-top:2px}
      #chat-page.bitrix-mainpager-2026 .chat-room-time{font:500 .72rem/1 Inter,Outfit,sans-serif!important;color:#96a0ae!important}
      #chat-page.bitrix-mainpager-2026 .chat-badge{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:22px!important;height:22px!important;padding:0 7px!important;border-radius:999px!important;background:var(--bx-blue)!important;color:#fff!important;font:700 11px/22px Inter,Outfit,sans-serif!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-pin-tag,#chat-page.bitrix-mainpager-2026 .chat-room-meta .chat-soft{font-size:.74rem!important;color:#99a3b1!important}
      #chat-page.bitrix-mainpager-2026 .chat-empty{background:linear-gradient(180deg,#fff 0%,#fbfdff 100%)!important}
      #chat-page.bitrix-mainpager-2026 .chat-top{min-height:64px!important;padding:11px 16px!important;background:#fff!important;border-bottom:1px solid var(--bx-line)!important}
      #chat-page.bitrix-mainpager-2026 .chat-top-left{gap:10px!important;min-width:0!important}
      #chat-page.bitrix-mainpager-2026 #chat-back-btn{width:36px!important;height:36px!important;min-width:36px!important;padding:0!important;border-radius:12px!important;border:1px solid var(--bx-line)!important;background:#fff!important;color:#5f6b7c!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
      #chat-page.bitrix-mainpager-2026 #chat-top-av.chat-av{width:40px!important;height:40px!important;font-size:.92rem!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-top-meta{display:grid!important;gap:2px!important;min-width:0!important}
      #chat-page.bitrix-mainpager-2026 .chat-top-title{font:700 .98rem/1.2 Inter,Outfit,sans-serif!important;color:#1f2937!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #chat-page.bitrix-mainpager-2026 .chat-top-sub{font:500 .72rem/1.25 Inter,Outfit,sans-serif!important;color:#8b95a2!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #chat-page.bitrix-mainpager-2026 .chat-top-right{gap:8px!important}
      #chat-page.bitrix-mainpager-2026 .chat-video-pill{display:inline-flex!important;align-items:center!important;gap:8px!important;height:36px!important;padding:0 14px!important;border:none!important;border-radius:999px!important;background:var(--bx-blue-2)!important;color:#fff!important;font:700 .8rem/36px Inter,Outfit,sans-serif!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-room-members-btn,#chat-page.bitrix-mainpager-2026 .chat-room-search-btn,#chat-page.bitrix-mainpager-2026 .chat-room-menu-desktop,#chat-page.bitrix-mainpager-2026 #chat-room-menu,#chat-page.bitrix-mainpager-2026 #chat-call-btn,#chat-page.bitrix-mainpager-2026 #chat-video-btn,#chat-page.bitrix-mainpager-2026 #chat-search-msg-btn{width:36px!important;height:36px!important;min-width:36px!important;padding:0!important;border-radius:12px!important;border:1px solid var(--bx-line)!important;background:#fff!important;color:#5f6b7c!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-msgs{padding:18px 18px 20px!important;background:linear-gradient(180deg,#eef6ff 0%,#f7fbff 14%,#f5f9fe 100%)!important}
      #chat-page.bitrix-mainpager-2026 .chat-bubble{max-width:min(76%,680px)!important;padding:10px 12px 9px!important;border-radius:14px 14px 14px 8px!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 .chat-row.me .chat-bubble{border-radius:14px 14px 8px 14px!important}
      #chat-page.bitrix-mainpager-2026 .chat-compose{padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px))!important;background:#fff!important;border-top:1px solid var(--bx-line)!important}
      #chat-page.bitrix-mainpager-2026 .chat-compose-row{grid-template-columns:40px 40px minmax(0,1fr) 40px!important;gap:8px!important;align-items:center!important}
      #chat-page.bitrix-mainpager-2026 .chat-compose-row .chat-mini,#chat-page.bitrix-mainpager-2026 #chat-send{width:40px!important;height:40px!important;min-width:40px!important;padding:0!important;border-radius:50%!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;box-shadow:none!important}
      #chat-page.bitrix-mainpager-2026 #chat-attach,#chat-page.bitrix-mainpager-2026 #chat-rec{border:1px solid var(--bx-line)!important;background:#fff!important;color:#687385!important}
      #chat-page.bitrix-mainpager-2026 #chat-text{min-height:44px!important;padding:11px 14px!important;border:1px solid var(--bx-line)!important;border-radius:22px!important;background:#fff!important;font:500 .9rem/1.35 Inter,Outfit,sans-serif!important;resize:none!important}
      #chat-page.bitrix-mainpager-2026 #chat-send{border:none!important;background:var(--bx-blue-2)!important;color:#fff!important}
      #chat-page.bitrix-mainpager-2026 #chat-send span{display:none!important}
      #chat-page.bitrix-mainpager-2026 #chat-send svg{width:18px;height:18px;display:block}

      #mo-chat-msg-sheet .mb,#mo-chat-forward .mb,#mo-chat-create .mb{padding:0!important;overflow:hidden!important;background:#fff!important;border-radius:22px 22px 0 0!important}
      #mo-chat-msg-sheet .mb::before,#mo-chat-forward .mb::before,#mo-chat-create .mb::before{content:'';display:block;width:38px;height:4px;border-radius:999px;background:#d5d9df;margin:10px auto 8px}
      #mo-chat-msg-sheet .chat-sheet-head{padding:6px 18px 10px!important;border-bottom:1px solid var(--bx-line)!important;background:#fff!important}
      #mo-chat-msg-sheet .chat-sheet-title{font:700 1rem/1.2 Inter,Outfit,sans-serif!important;color:#1f2937!important}
      #mo-chat-msg-sheet .chat-msg-reactions{padding:10px 16px 8px!important;background:#fff!important;border-bottom:1px solid #f0f3f6!important;display:flex!important;gap:8px!important;flex-wrap:nowrap!important;overflow:auto!important;scrollbar-width:none}
      #mo-chat-msg-sheet .chat-msg-reactions::-webkit-scrollbar{display:none}
      #mo-chat-msg-sheet .chat-msg-rx-btn{min-width:38px!important;height:38px!important;padding:0 11px!important;border:1px solid var(--bx-line)!important;border-radius:999px!important;background:#fff!important;font:600 1rem/38px Inter,Outfit,sans-serif!important;box-shadow:none!important}
      #mo-chat-msg-sheet .chat-msg-sheet-preview{padding:10px 16px 8px!important;background:#fff!important}
      #mo-chat-msg-sheet .chat-msg-sheet-quote{border:1px solid var(--bx-line)!important;border-left:3px solid #cde0ff!important;border-radius:14px!important;background:#fbfdff!important;padding:10px 12px!important;color:#4b5565!important}
      #mo-chat-msg-sheet .chat-sheet-body{padding:0!important;background:#fff!important}
      #mo-chat-msg-sheet .chat-msg-sheet-list{display:block!important}
      #mo-chat-msg-sheet .chat-msg-sheet-btn{width:100%!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding:14px 16px!important;border:none!important;border-bottom:1px solid #eef1f4!important;border-radius:0!important;background:#fff!important;color:#1f2937!important;text-align:left!important;box-shadow:none!important}
      #mo-chat-msg-sheet .chat-msg-sheet-btn:last-child{border-bottom:none!important}
      #mo-chat-msg-sheet .chat-msg-sheet-btn .chat-sheet-ic{width:20px!important;height:20px!important;color:#687385!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
      #mo-chat-msg-sheet .chat-msg-sheet-btn .chat-sheet-ic svg{width:18px;height:18px;display:block}
      #mo-chat-msg-sheet .chat-sheet-btn-main strong{font:600 .95rem/1.15 Inter,Outfit,sans-serif!important;color:#1f2937!important}
      #mo-chat-msg-sheet .chat-sheet-btn-main small{margin-top:2px!important;font:500 .75rem/1.3 Inter,Outfit,sans-serif!important;color:#8b95a3!important}
      #mo-chat-msg-sheet .chat-msg-sheet-btn.copilot .chat-sheet-ic,#mo-chat-msg-sheet .chat-msg-sheet-btn.copilot .chat-sheet-btn-main strong{color:#9b51e0!important}
      #mo-chat-msg-sheet .chat-msg-sheet-btn.danger .chat-sheet-ic,#mo-chat-msg-sheet .chat-msg-sheet-btn.danger .chat-sheet-btn-main strong{color:#eb5757!important}
      #mo-chat-msg-sheet .chat-sheet-chevron{font-size:1rem!important;color:#b0b7c3!important}

      #mo-chat-forward .mb{background:#fff!important}
      #mo-chat-forward .mb h2{display:block!important;margin:0!important;padding:6px 20px 0!important;text-align:center!important;font:700 1.06rem/1.2 Inter,Outfit,sans-serif!important;color:#1f2937!important}
      #mo-chat-forward .mbs{display:none!important}
      #mo-chat-forward .chat-forward-shell{padding:0 16px 8px!important;background:#fff!important}
      #mo-chat-forward .chat-forward-searchwrap{position:relative;margin-top:12px}
      #mo-chat-forward .chat-forward-searchwrap svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:16px;height:16px;color:#9aa4b2;pointer-events:none}
      #mo-chat-forward .chat-forward-search{width:100%!important;height:42px!important;padding:0 14px 0 40px!important;border:1px solid var(--bx-line)!important;border-radius:14px!important;background:#f7f8fa!important;font:500 .9rem/42px Inter,Outfit,sans-serif!important;color:#1f2937!important;outline:none!important;box-shadow:none!important}
      #mo-chat-forward .chat-forward-filterchips{display:flex!important;gap:8px!important;overflow:auto!important;flex-wrap:nowrap!important;padding:12px 0 10px!important;scrollbar-width:none}
      #mo-chat-forward .chat-forward-filterchips::-webkit-scrollbar{display:none}
      #mo-chat-forward .chat-forward-chip{height:32px!important;padding:0 12px!important;border:1px solid #d7dde7!important;border-radius:999px!important;background:#fff!important;color:#687385!important;font:600 .76rem/32px Inter,Outfit,sans-serif!important;white-space:nowrap!important}
      #mo-chat-forward .chat-forward-chip.on{border-color:#b8c1ce!important;background:#fff!important;color:#1f2937!important;box-shadow:inset 0 0 0 1px #b8c1ce!important}
      #mo-chat-forward .chat-forward-section{padding:0 16px 8px!important;font:600 .76rem/1 Inter,Outfit,sans-serif!important;color:#9aa4b2!important;text-transform:none!important}
      #mo-chat-forward .mf{margin:0!important;padding:0!important;border:none!important}
      #mo-chat-forward .mf label{display:none!important}
      #mo-chat-forward #chat-forward-preview{margin:0 16px 10px!important;display:block!important;border:1px solid var(--bx-line)!important;border-left:3px solid #d7e6ff!important;border-radius:14px!important;background:#fbfdff!important;padding:10px 12px!important}
      #mo-chat-forward #chat-forward-list{display:block!important;max-height:min(48vh,420px)!important;overflow:auto!important;padding:0 16px 6px!important}
      #mo-chat-forward .chat-forward-room{width:100%!important;display:grid!important;grid-template-columns:auto minmax(0,1fr)!important;align-items:center!important;column-gap:12px!important;min-height:72px!important;padding:12px 0!important;border:none!important;border-bottom:1px solid var(--bx-line)!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
      #mo-chat-forward .chat-forward-room:last-child{border-bottom:none!important}
      #mo-chat-forward .chat-forward-room .chat-av{width:48px!important;height:48px!important;font-size:.95rem!important;box-shadow:none!important}
      #mo-chat-forward .chat-forward-room strong{display:block!important;font:600 .96rem/1.2 Inter,Outfit,sans-serif!important;color:#1f2937!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #mo-chat-forward .chat-forward-room .chat-soft{display:block!important;margin-top:3px!important;font:500 .78rem/1.3 Inter,Outfit,sans-serif!important;color:#8b95a3!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #mo-chat-forward .mbtns{position:sticky!important;bottom:0!important;padding:12px 16px calc(14px + env(safe-area-inset-bottom,0px))!important;margin:0!important;background:linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.9) 18%,#fff 42%)!important}

      #mo-chat-inspect .mb{padding:0!important;overflow:hidden!important;background:#f7f9fc!important}
      #mo-chat-inspect .chat-inspect-head{padding:0 0 10px!important;background:#fff!important;border-bottom:1px solid var(--bx-line)!important}
      #mo-chat-inspect .chat-inspect-topbar{display:grid!important;grid-template-columns:40px minmax(0,1fr) 40px!important;align-items:center!important;gap:8px!important;padding:10px 14px 2px!important}
      #mo-chat-inspect .chat-inspect-topbar button{width:36px!important;height:36px!important;padding:0!important;border:none!important;background:transparent!important;color:#5f6b7c!important;border-radius:10px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
      #mo-chat-inspect .chat-inspect-topbar button svg{width:20px;height:20px;display:block}
      #mo-chat-inspect .chat-inspect-topbar-title{text-align:center!important;font:600 1rem/1.2 Inter,Outfit,sans-serif!important;color:#4f5a68!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #mo-chat-inspect .chat-inspect-title{display:grid!important;justify-items:center!important;text-align:center!important;gap:6px!important;padding:8px 20px 0!important}
      #mo-chat-inspect #chat-inspect-av .chat-av{width:96px!important;height:96px!important;font-size:1.9rem!important;box-shadow:none!important}
      #mo-chat-inspect .chat-inspect-name{font:700 1.36rem/1.12 Inter,Outfit,sans-serif!important;color:#1f2937!important}
      #mo-chat-inspect .chat-inspect-sub{margin:0!important;font:500 .82rem/1.45 Inter,Outfit,sans-serif!important;color:#8b95a3!important;text-align:center!important;max-width:320px!important;white-space:normal!important}
      #mo-chat-inspect .chat-inspect-statusline{margin-top:2px!important;font:500 .76rem/1.35 Inter,Outfit,sans-serif!important;color:#a1a9b4!important;text-align:center!important}
      #mo-chat-inspect .chat-detail-hero{padding:10px 16px 0!important;display:grid!important;gap:12px!important;background:#fff!important}
      #mo-chat-inspect .chat-detail-meta{display:none!important}
      #mo-chat-inspect .chat-detail-actions{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important}
      #mo-chat-inspect .chat-detail-act{border:1px solid var(--bx-line)!important;background:#fff!important;border-radius:16px!important;padding:12px 6px!important;display:grid!important;place-items:center!important;gap:7px!important;color:#1f2937!important;font:600 .74rem/1.15 Inter,Outfit,sans-serif!important;box-shadow:none!important}
      #mo-chat-inspect .chat-detail-act-ic{width:18px!important;height:18px!important;font-size:0!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;color:#4c596b!important}
      #mo-chat-inspect .chat-detail-act-ic svg{width:18px;height:18px;display:block}
      #mo-chat-inspect .chat-inspect-tabs{display:flex!important;gap:8px!important;overflow:auto!important;padding:12px 16px 0!important;background:#fff!important;scrollbar-width:none}
      #mo-chat-inspect .chat-inspect-tabs::-webkit-scrollbar{display:none}
      #mo-chat-inspect .chat-inspect-tab{height:32px!important;padding:0 12px!important;border:1px solid #d8dee6!important;border-radius:999px!important;background:#f7f8fa!important;color:#697585!important;font:600 .76rem/32px Inter,Outfit,sans-serif!important;white-space:nowrap!important;box-shadow:none!important}
      #mo-chat-inspect .chat-inspect-tab.on{background:#eef4ff!important;border-color:#cbd9f4!important;color:#1764d8!important}
      #mo-chat-inspect .chat-inspect-body{padding:14px 16px 20px!important;max-height:min(56vh,540px)!important;overflow:auto!important;background:#f7f9fc!important}
      #mo-chat-inspect .chat-inspect-month{margin:12px 0 8px!important;font:700 .75rem/1.2 Inter,Outfit,sans-serif!important;color:#9aa4b2!important}
      #mo-chat-inspect .chat-inspect-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:8px!important}
      #mo-chat-inspect .chat-inspect-card{border:none!important;border-radius:10px!important;background:#fff!important;overflow:hidden!important;box-shadow:none!important}
      #mo-chat-inspect .chat-inspect-thumb{aspect-ratio:1/1.18!important;border-radius:10px!important;background:#eef2f7!important}
      #mo-chat-inspect .chat-inspect-meta{padding:8px 4px 0!important;background:transparent!important}
      #mo-chat-inspect .chat-inspect-meta b{display:none!important}
      #mo-chat-inspect .chat-inspect-meta span{font:500 .7rem/1.3 Inter,Outfit,sans-serif!important;color:#8b95a3!important}
      #mo-chat-inspect .mbtns{display:none!important}

      @media (min-width:769px){
        #chat-page.bitrix-mainpager-2026 .chat-shell{grid-template-columns:352px minmax(0,1fr)!important}
        #chat-page.bitrix-mainpager-2026 .chat-room{min-height:78px!important}
        #chat-page.bitrix-mainpager-2026 .chat-top-sub{max-width:48vw!important}
        #mo-chat-forward .mb{width:min(560px,92vw)!important;max-height:min(84vh,760px)!important;margin:3vh auto 0!important;border-radius:24px!important}
        #mo-chat-inspect .mb{width:min(720px,92vw)!important;max-width:none!important;max-height:90vh!important;border-radius:24px!important;background:#f7f9fc!important}
        #mo-chat-inspect .chat-inspect-body{max-height:min(58vh,560px)!important}
      }
      @media (max-width:768px){
        #chat-page.bitrix-mainpager-2026 .chat-hd{padding:12px 14px 10px!important}
        #chat-page.bitrix-mainpager-2026 .chat-hd-row h2{font-size:1.42rem!important}
        #chat-page.bitrix-mainpager-2026 .chat-side-tools{padding:10px 14px 12px!important}
        #chat-page.bitrix-mainpager-2026 .chat-room{min-height:82px!important;padding:14px 14px 13px!important}
        #chat-page.bitrix-mainpager-2026 .chat-top{padding:10px 12px!important}
        #chat-page.bitrix-mainpager-2026 .chat-top-sub{max-width:54vw!important}
        #chat-page.bitrix-mainpager-2026 .chat-video-pill{display:none!important}
        #chat-page.bitrix-mainpager-2026 .chat-msgs{padding:14px 12px 16px!important}
        #chat-page.bitrix-mainpager-2026 .chat-compose-row{grid-template-columns:40px minmax(0,1fr) 40px 40px!important}
        #chat-page.bitrix-mainpager-2026 #chat-rec{order:3!important}
        #chat-page.bitrix-mainpager-2026 #chat-send{order:4!important}
        #mo-chat-msg-sheet .mb,#mo-chat-forward .mb,#mo-chat-create .mb,#mo-chat-inspect .mb{width:100vw!important;max-width:none!important;margin:0!important;border-radius:22px 22px 0 0!important}
        #mo-chat-inspect .mb{height:min(100dvh,100vh)!important;border-radius:0!important}
        #mo-chat-inspect .chat-inspect-body{height:calc(100dvh - 340px)!important;max-height:none!important}
      }
    `;
    document.head.appendChild(st);
  }

  function setSendIcon(){
    var btn = el('chat-send');
    if(btn && !btn.dataset.pixelSend){
      btn.dataset.pixelSend = '1';
      btn.innerHTML = icon('send');
      btn.setAttribute('aria-label','Enviar');
      btn.title = 'Enviar';
    }
  }
  function setComposeIcons(){
    var attach = el('chat-attach'); if(attach && !attach.dataset.pixelIc){ attach.dataset.pixelIc = '1'; attach.innerHTML = icon('clip'); attach.setAttribute('aria-label','Anexar'); }
    var rec = el('chat-rec'); if(rec && !rec.dataset.pixelIc){ rec.dataset.pixelIc = '1'; rec.innerHTML = icon('mic'); rec.setAttribute('aria-label','Gravar áudio'); }
    var back = el('chat-back-btn'); if(back) back.innerHTML = icon('back');
  }
  function ensureSearchWrap(modal){
    var shell = q('.chat-forward-shell', modal); if(shell) return shell;
    shell = document.createElement('div');
    shell.className = 'chat-forward-shell';
    var title = q('h2', modal), preview = el('chat-forward-preview'), dest = q('#chat-forward-list', modal);
    if(title) title.insertAdjacentElement('afterend', shell);
    if(preview) shell.appendChild(preview);
    var search = el('chat-forward-search');
    if(search){
      var wrap = document.createElement('div');
      wrap.className = 'chat-forward-searchwrap';
      wrap.innerHTML = icon('search');
      search.parentNode && search.parentNode.insertBefore(wrap, search);
      wrap.appendChild(search);
      shell.appendChild(wrap);
    }
    var chips = q('.chat-forward-filterchips', modal); if(chips) shell.appendChild(chips);
    if(dest){
      var section = document.createElement('div');
      section.className = 'chat-forward-section';
      section.textContent = 'Bate-papos recentes';
      dest.parentNode && dest.parentNode.insertBefore(section, dest);
    }
    return shell;
  }
  function refineForwardModal(){
    var modal = el('mo-chat-forward'); if(!modal) return;
    var box = q('.mb', modal); if(!box) return;
    var title = q('h2', box); if(title) title.textContent = 'Selecionar destinatário';
    ensureSearchWrap(box);
    var search = el('chat-forward-search'); if(search) search.placeholder = 'Procura...';
    qa('#chat-forward-list [data-fwd-room]').forEach(function(btn){
      var id = btn.getAttribute('data-fwd-room');
      var r = window.C && C.roomMap && C.roomMap[id];
      if(!r) return;
      btn.classList.add('chat-forward-room');
      btn.innerHTML = '<span>'+ (typeof roomAvatar === 'function' ? roomAvatar(r) : '<div class="chat-av">?</div>') +'</span><span style="min-width:0;text-align:left"><strong>'+esc(typeof roomTitle === 'function' ? roomTitle(r) : 'Conversa')+'</strong><span class="chat-soft">'+esc(roomSubtitle(r))+'</span></span>';
    });
  }
  function ensureInspectTopbar(){
    var modal = el('mo-chat-inspect'); if(!modal) return;
    var head = q('.chat-inspect-head', modal); if(!head) return;
    if(!q('.chat-inspect-topbar', head)){
      var top = document.createElement('div');
      top.className = 'chat-inspect-topbar';
      top.innerHTML = '<button type="button" id="chat-inspect-back-2026" aria-label="Voltar">'+icon('back')+'</button><div class="chat-inspect-topbar-title">Sobre bate-papo</div><button type="button" id="chat-inspect-more-2026" aria-label="Mais">'+icon('more')+'</button>';
      head.insertBefore(top, head.firstChild);
    }
    if(!q('.chat-inspect-statusline', head)){
      var line = document.createElement('div');
      line.className = 'chat-inspect-statusline';
      q('.chat-inspect-title', head) && q('.chat-inspect-title', head).appendChild(line);
    }
  }
  function refineInspectModal(){
    var modal = el('mo-chat-inspect'); if(!modal) return;
    ensureInspectTopbar();
    var r = room(); if(!r) return;
    var u = userOf(r);
    var sub = el('chat-inspect-sub');
    if(sub){
      var bits = [];
      if(u && u.cargo) bits.push(u.cargo);
      if(phoneRaw(u)) bits.push(phoneFmt(phoneRaw(u)));
      sub.textContent = bits.join(' • ') || 'Histórico compartilhado nesta conversa';
    }
    var status = q('.chat-inspect-statusline', modal);
    if(status) status.textContent = u && u.cargo ? 'Informações e mídia compartilhada' : 'Arquivos, links, áudio e mídia da conversa';
    qa('.chat-detail-act-ic', modal).forEach(function(ic){
      if(ic.dataset.pixelDone) return;
      ic.dataset.pixelDone = '1';
      var label = (ic.nextElementSibling && ic.nextElementSibling.textContent || '').toLowerCase();
      if(label.indexOf('vídeo') >= 0 || label.indexOf('whatsapp') >= 0) ic.innerHTML = icon('video');
      else if(label.indexOf('chamada') >= 0) ic.innerHTML = icon('call');
      else if(label.indexOf('pesquisar') >= 0) ic.innerHTML = icon('search');
      else if(label.indexOf('som') >= 0 || label.indexOf('áudio') >= 0) ic.innerHTML = icon('mic');
      else ic.innerHTML = icon('spark');
    });
  }
  function refineMainHeader(){
    var page = el('chat-page'); if(!page) return;
    page.classList.add('bitrix-mainpager-2026');
    var title = q('.chat-hd-row h2', page); if(title) title.textContent = 'Messenger';
    var topSub = el('chat-top-sub'); if(topSub && room()) topSub.textContent = roomSubtitle(room());
    setComposeIcons();
    setSendIcon();
  }
  function ensureTopClick(){
    var left = q('#chat-page .chat-top-left');
    if(left && !left.dataset.pixelInspect){
      left.dataset.pixelInspect = '1';
      left.style.cursor = 'pointer';
      left.addEventListener('click', function(e){
        if(e.target.closest('#chat-back-btn')) return;
        if(typeof _chatOpenInspect === 'function') _chatOpenInspect('media');
      });
    }
  }
  function afterRender(){
    refineMainHeader();
    ensureTopClick();
    refineForwardModal();
    refineInspectModal();
    setComposeIcons();
    setSendIcon();
  }
  function patchFns(){
    if(typeof renderRooms === 'function' && !window.__CHAT_PIXEL_RENDERROOMS_D__){
      window.__CHAT_PIXEL_RENDERROOMS_D__ = 1;
      var rr = window.renderRooms;
      window.renderRooms = function(){ var out = rr.apply(this, arguments); afterRender(); return out; };
    }
    if(typeof renderHeader === 'function' && !window.__CHAT_PIXEL_RENDERHEADER_D__){
      window.__CHAT_PIXEL_RENDERHEADER_D__ = 1;
      var rh = window.renderHeader;
      window.renderHeader = function(){ var out = rh.apply(this, arguments); afterRender(); return out; };
    }
    if(typeof _chatRenderInspect === 'function' && !window.__CHAT_PIXEL_INSPECT_D__){
      window.__CHAT_PIXEL_INSPECT_D__ = 1;
      var ri = window._chatRenderInspect;
      window._chatRenderInspect = function(){ var out = ri.apply(this, arguments); refineInspectModal(); return out; };
    }
    if(typeof openMsgMenu === 'function' && !window.__CHAT_PIXEL_MSG_MENU_D__){
      window.__CHAT_PIXEL_MSG_MENU_D__ = 1;
      var om = window.openMsgMenu;
      window.openMsgMenu = function(e,id){ var out = om.apply(this, arguments); setTimeout(afterRender, 20); return out; };
    }
    if(typeof runMsgAction === 'function' && !window.__CHAT_PIXEL_RUNMSG_D__){
      window.__CHAT_PIXEL_RUNMSG_D__ = 1;
      var rma = window.runMsgAction;
      window.runMsgAction = function(a,id){ var out = rma.apply(this, arguments); if(a === 'forward') setTimeout(refineForwardModal, 40); return out; };
    }
  }
  function bind(){
    if(window.__CHAT_PIXEL_BIND_D__) return;
    window.__CHAT_PIXEL_BIND_D__ = 1;
    document.addEventListener('click', function(e){
      var t = e.target;
      if(t.closest('#chat-inspect-back-2026')){ e.preventDefault(); if(typeof closeM === 'function') closeM('mo-chat-inspect'); }
      else if(t.closest('#chat-inspect-more-2026')){
        e.preventDefault();
        var btn = t.closest('#chat-inspect-more-2026');
        var r = room();
        if(!r || typeof openRoomMenu !== 'function') return;
        var rect = btn.getBoundingClientRect();
        openRoomMenu({clientX:rect.left + rect.width/2, clientY:rect.bottom + 8}, r.id);
      }
      else if(t.closest('#chat-send') && el('chat-send') && !el('chat-send').querySelector('svg')){ setSendIcon(); }
    }, true);
    document.addEventListener('input', function(e){
      if(e.target && e.target.id === 'chat-forward-search'){
        var val = String(e.target.value || '').toLowerCase();
        qa('#chat-forward-list [data-fwd-room]').forEach(function(btn){ btn.style.display = String(btn.textContent || '').toLowerCase().indexOf(val) >= 0 ? '' : 'none'; });
      }
    }, true);
    window.addEventListener('resize', afterRender, {passive:true});
  }
  function boot(){
    ensureStyle();
    patchFns();
    bind();
    setTimeout(afterRender, 60);
    setTimeout(afterRender, 220);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
