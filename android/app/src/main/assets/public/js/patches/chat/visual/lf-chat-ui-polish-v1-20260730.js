/* LF-CHAT-POLISH-MARKER v1.0-20260730
 * Polimento de UI do bate-papo (trilha B / Full).
 * Não altera a base nem as cores — só reorganiza e complementa:
 *  • Smart preview (sidebar): detecta attachment/áudio/imagem/link.
 *  • Day separator: pílula central "Hoje / Ontem / dd de mês".
 *  • Cluster: marca bolhas consecutivas do mesmo autor (#chat-msgs).
 *  • Digitando: indicador lateral com nome + bolinhas; escuta `lf:typing`.
 *  • <audio>: wrap em .chat-audio + meta de duração. NÃO substitui controles.
 * Não toca em DOM original — só se envolve. Idempotente: roda 1× por carga.
 */
(function(){
  if (window.__lfChatPolishV1) return; window.__lfChatPolishV1 = true;

  var POLISH_VER = 'v1.0-20260730';
  var $  = function(s, r){ return (r||document).querySelector(s); };
  var $$ = function(s, r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };

  /* ─── helpers ─── */
  function escHtml(s){
    s = String(s==null?'':s);
    return s.replace(/[&<>"']/g, function(c){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }
  function formatDur(s){
    s = Math.max(0, Math.round(+s||0));
    var m = Math.floor(s/60), r = s%60;
    return (m<10?'0':'')+m+':'+(r<10?'0':'')+r;
  }
  function dayLabel(ts){
    if(!ts) return '';
    var d = new Date(ts), now = new Date();
    var sameDay = function(a,b){
      return a.getFullYear()===b.getFullYear()
          && a.getMonth()===b.getMonth()
          && a.getDate()===b.getDate();
    };
    var yest = new Date(now); yest.setDate(now.getDate()-1);
    var hh = function(n){ return (n<10?'0':'')+n; };
    if (sameDay(d,now))  return 'Hoje';
    if (sameDay(d,yest)) return 'Ontem';
    var meses = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    if (d.getFullYear()===now.getFullYear())
      return hh(d.getDate())+' de '+meses[d.getMonth()];
    return hh(d.getDate())+'/'+hh(d.getMonth()+1)+'/'+d.getFullYear();
  }

  /* ─── 1. Smart preview ─── */
  function smartPreview(msg){
    if(!msg) return {icon:'', text:''};
    var t = String(msg.text||'').trim();
    var has = function(k){ return Object.prototype.hasOwnProperty.call(msg,k) && msg[k]; };
    if (has('attachmentUrl') || has('attachmentName') || has('file') || msg.kind === 'file'){
      var nm = msg.attachmentName || msg.file || 'arquivo';
      return {icon:'📎', text: (nm.length>38 ? (nm.slice(0,36)+'…') : nm)};
    }
    if (has('audioUrl') || msg.kind === 'audio') return {icon:'🎤', text:'Áudio'};
    if (has('imageUrl') || has('img')      || msg.kind === 'image') return {icon:'📷', text:'Imagem'};
    if (msg.sticker) return {icon:'🌟', text:'Sticker'};
    if (msg.location) return {icon:'📍', text:'Localização'};
    if (msg.gif) return {icon:'🎬', text:'GIF'};
    if (!t){
      if (has('attachmentName')) return {icon:'📎', text: String(msg.attachmentName).slice(0,38)};
      return {icon:'', text:''};
    }
    if (/https?:\/\/\S+/.test(t)) return {icon:'🔗', text: t.slice(0,38)};
    return {icon:'', text: t.length>42 ? (t.slice(0,40)+'…') : t};
  }
  window.__lfChatSmartPreview = smartPreview;

  /* ─── 2. Sidebar: enriquece o preview pós renderChatList ─── */
  if (typeof renderChatList === 'function' && !renderChatList.__lfPolished){
    var origRender = renderChatList;
    renderChatList = function(){
      origRender.apply(this, arguments);
      try {
        var origGetMsgs = (typeof _chatGetMsgs === 'function') ? _chatGetMsgs : function(){return [];};
        $$('.chat-conv-item').forEach(function(item){
          var cid = item.getAttribute('data-conv-id');
          if(!cid) return;
          var msgs = origGetMsgs(cid) || [];
          var last = msgs.length ? msgs[msgs.length-1] : null;
          var pv = smartPreview(last);
          var slot = item.querySelector('.chat-conv-preview');
          if (!slot) return;
          if (pv.icon){
            slot.innerHTML =
              '<span class="pv-icon">'+pv.icon+'</span>'+
              '<span class="pv-text">'+escHtml(pv.text)+'</span>';
          } else if (pv.text && slot.textContent !== pv.text){
            slot.textContent = pv.text;
          }
        });
      } catch(_e){}
    };
    renderChatList.__lfPolished = true;
  }

  /* ─── 3. openChatConv: day-sep + cluster + wrap <audio> ─── */
  function insertDaySeparators(container){
    if (!container) return;
    container.querySelectorAll('.chat-day-sep').forEach(function(n){ n.remove(); });
    var nodes = $$('.chat-msg', container);
    var lastDay = null;
    nodes.forEach(function(n){
      var ts = n.getAttribute('data-ts') || n.dataset.ts || '';
      var lab = dayLabel(ts);
      if (!lab || lab === lastDay) return;
      lastDay = lab;
      var sep = document.createElement('div');
      sep.className = 'chat-day-sep';
      sep.textContent = lab;
      container.insertBefore(sep, n);
    });
  }
  function groupClusterIn(container){
    var nodes = $$('.chat-msg', container);
    var prev = null, runStart = -1;
    nodes.forEach(function(n, idx){
      n.classList.remove('cluster-first','cluster-mid','cluster-last');
      var me = n.classList.contains('me');
      var samePrev = (prev !== null && prev === me);
      if (!samePrev){
        n.classList.add('cluster-first'); runStart = idx;
      } else {
        n.classList.add('cluster-mid');
      }
      var nxt = nodes[idx+1];
      var sameN = !!(nxt && nxt.classList.contains('me') === me);
      if (!sameN){
        n.classList.add('cluster-last');
      }
      prev = me;
    });
  }
  function wrapAudioIn(container){
    $$('audio', container).forEach(function(a){
      if (a.__lfWrapped) return; a.__lfWrapped = true;
      var parent = a.parentNode;
      if (!parent || parent.classList.contains('chat-audio')) return;
      var wrap = document.createElement('div'); wrap.className = 'chat-audio';
      var meta = document.createElement('div'); meta.className = 'chat-audio-meta';
      var dur = document.createElement('span'); dur.className = 'dur';
      var lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = '🔊 Áudio';
      meta.appendChild(dur); meta.appendChild(lbl);
      try {
        if (a.duration && isFinite(a.duration)) dur.textContent = formatDur(a.duration);
        else a.addEventListener('loadedmetadata', function(){
          dur.textContent = formatDur(a.duration||0);
        });
      } catch(_e){ dur.textContent = '—'; }
      parent.insertBefore(wrap, a);
      wrap.appendChild(a);
      wrap.appendChild(meta);
    });
  }

  function startWatch(){
    var msgesArea = document.getElementById('chat-msgs');
    if (!msgesArea){ setTimeout(startWatch, 400); return; }
    var apply = function(){
      try {
        insertDaySeparators(msgesArea);
        groupClusterIn(msgesArea);
        wrapAudioIn(msgesArea);
      } catch(_e){}
    };
    var mo = new MutationObserver(function(){ apply(); });
    mo.observe(msgesArea, {childList:true, subtree:false});
    apply();
  }

  if (typeof openChatConv === 'function' && !openChatConv.__lfPolished){
    var openOrig = window.openChatConv;
    window.openChatConv = function(){
      openOrig.apply(this, arguments);
      setTimeout(startWatch, 0);
    };
    window.openChatConv.__lfPolished = true;
  }
  // inicia watch mesmo se a conversa já estiver aberta
  setTimeout(startWatch, 300);

  /* ─── 4. Indicador "digitando..." ─── */
  function ensureTypingBubble(){
    var panel = document.getElementById('chat-conv-panel');
    if (!panel) return null;
    var el = document.getElementById('chat-typing-indicator');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'chat-typing-indicator';
    el.className = 'chat-typing-indicator';
    el.innerHTML =
      '<span class="who-avatar">?</span>'+
      '<span><span class="who">Alguém</span> está digitando</span>'+
      '<span class="chat-typing-dots"><span></span><span></span><span></span></span>';
    panel.appendChild(el);
    return el;
  }
  window.__lfChatSetTyping = function(name, color){
    var el = ensureTypingBubble(); if(!el) return;
    if (!name){ el.classList.remove('on'); return; }
    el.querySelector('.who').textContent = name;
    var av = el.querySelector('.who-avatar');
    av.textContent = String(name||'?').charAt(0).toUpperCase();
    if (color) av.style.background = color;
    el.classList.add('on');
  };
  document.addEventListener('lf:typing', function(ev){
    var d = ev && ev.detail || {};
    window.__lfChatSetTyping(d.name || (d.uid ? 'Usuário' : ''), d.color || '');
  });

  try { console.info('[lf-chat-polish] '+POLISH_VER+' pronto'); } catch(_e){}
})();
