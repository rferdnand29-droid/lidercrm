(function(){
  if(window.__LF_USER_REQUEST_FIX_20260713D__) return;
  window.__LF_USER_REQUEST_FIX_20260713D__ = 1;

  function el(id){ return document.getElementById(id); }
  function q(sel,root){ return (root||document).querySelector(sel); }
  function qa(sel,root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function safe(fn){ try{ return fn(); }catch(_e){} }
  function raf(fn){ return (window.requestAnimationFrame||function(cb){ return setTimeout(cb,16); })(fn); }
  function isMobile(){
    try{
      if(window.matchMedia) return !!window.matchMedia('(max-width:768px)').matches;
    }catch(_e){}
    return Math.min(window.innerWidth||9999, screen&&screen.width||9999) <= 768;
  }
  function bgScope(){ return isMobile() ? 'mobile' : 'desktop'; }
  function fmtRate(rate){
    var n = Math.round((parseFloat(rate)||1)*10)/10;
    return String(n.toFixed(1)).replace('.',',') + 'x';
  }

  function ensureStyle(){
    if(el('lf-user-request-fix-20260713d-style')) return;
    var st=document.createElement('style');
    st.id='lf-user-request-fix-20260713d-style';
    st.textContent=''
      + '#chat-fab-create,#pg-chat .chat-fab,#mdash-fab{display:none!important;opacity:0!important;pointer-events:none!important}'
      + '.lf-audio-speed{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:36px;padding:8px 12px;border-radius:12px;border:1px solid #dbe7f7;background:#fff;color:#344054;font:700 .74rem/1 Outfit,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(15,23,42,.04)}'
      + '.lf-audio-speed:active{transform:scale(.98)}';
    document.head.appendChild(st);
  }

  function removeForbiddenButtons(){
    ['chat-fab-create','mdash-fab'].forEach(function(id){
      var node=el(id);
      if(node && node.parentNode) node.parentNode.removeChild(node);
    });
    qa('#pg-chat .chat-fab').forEach(function(node){
      if(node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function bindLogoFallbacks(){
    var official = window.LF_OFFICIAL_LOGO || '';
    qa('.lf-logo-img,.splash-mon img,.lmon img,.nmo img,.mtb-logo img,#adm-logo-preview img').forEach(function(img){
      if(!img || img.dataset.lfLogoFallbackBound==='1') return;
      img.dataset.lfLogoFallbackBound='1';
      img.addEventListener('error',function(){
        if(!official) return;
        this.onerror=null;
        this.src=official;
      });
      safe(function(){
        if(img.complete && !img.naturalWidth && official) img.src=official;
      });
    });
  }

  function hardenLogoApply(){
    if(typeof window.applyCustomLogo!=='function' || window.applyCustomLogo.__lfUserRequestFix20260713d) return;
    var orig = window.applyCustomLogo;
    window.applyCustomLogo = function(dataUrl){
      var safeUrl = (typeof dataUrl==='string' && /^(data:image\/|blob:|https?:)/i.test(dataUrl)) ? dataUrl : null;
      var out = orig.call(this, safeUrl);
      setTimeout(bindLogoFallbacks,0);
      return out;
    };
    window.applyCustomLogo.__lfUserRequestFix20260713d = 1;
  }

  function enhanceAudioSpeedButtons(root){
    qa('#chat-msgs audio', root||document).forEach(function(audio){
      if(!audio) return;
      var msg = audio.closest ? audio.closest('.chat-msg') : null;
      if(!msg) return;
      var wrap = (audio.parentNode && audio.parentNode.querySelector) ? audio.parentNode.querySelector('.lf-audio-actions') : null;
      if(!wrap) return;

      qa('[data-lf-msg-menu]', wrap).forEach(function(btn){
        if(btn && btn.parentNode) btn.parentNode.removeChild(btn);
      });

      var speedBtn = q('.lf-audio-speed', wrap);
      if(!speedBtn){
        speedBtn = document.createElement('button');
        speedBtn.type='button';
        speedBtn.className='lf-audio-speed';
        speedBtn.setAttribute('data-audio-speed','1');
        wrap.appendChild(speedBtn);
      }

      function syncLabel(){
        var rate = parseFloat(speedBtn.getAttribute('data-audio-speed') || audio.playbackRate || 1) || 1;
        speedBtn.textContent = 'Velocidade ' + fmtRate(rate);
      }

      if(audio.dataset.lfSpeedBound!=='1'){
        audio.dataset.lfSpeedBound='1';
        audio.addEventListener('ratechange', function(){
          if(speedBtn){
            speedBtn.setAttribute('data-audio-speed', String(audio.playbackRate || 1));
            syncLabel();
          }
        });
      }

      speedBtn.onclick = function(ev){
        if(ev) ev.preventDefault();
        var steps = [0.5,1,1.5,2];
        var current = parseFloat(speedBtn.getAttribute('data-audio-speed') || audio.playbackRate || 1) || 1;
        var idx = steps.indexOf(Math.round(current*10)/10);
        var next = steps[(idx+1) % steps.length];
        audio.playbackRate = next;
        speedBtn.setAttribute('data-audio-speed', String(next));
        syncLabel();
      };

      if(!(parseFloat(speedBtn.getAttribute('data-audio-speed'))>0)){
        speedBtn.setAttribute('data-audio-speed', String(audio.playbackRate || 1));
      }
      syncLabel();
    });
  }

  function patchRenderMsgs(){
    if(typeof window.renderMsgs!=='function' || window.renderMsgs.__lfUserRequestFix20260713d) return;
    var orig = window.renderMsgs;
    window.renderMsgs = function(){
      var out = orig.apply(this, arguments);
      setTimeout(function(){
        removeForbiddenButtons();
        enhanceAudioSpeedButtons();
        bindLogoFallbacks();
      }, 0);
      return out;
    };
    window.renderMsgs.__lfUserRequestFix20260713d = 1;
  }

  function patchDeletedMessageMenu(){
    if(typeof window.openMsgMenu!=='function' || window.openMsgMenu.__lfUserRequestFix20260713d) return;
    var orig = window.openMsgMenu;
    window.openMsgMenu = function(e,id){
      var msg = null;
      try{
        if(window.C && window.C.msgs && window.C.msgs.find){
          msg = window.C.msgs.find(function(x){ return x && x.id===id; }) || null;
        }
      }catch(_e){}
      if(msg && msg.deleted) return;
      return orig.apply(this, arguments);
    };
    window.openMsgMenu.__lfUserRequestFix20260713d = 1;
  }

  function patchBackgroundSync(){
    if(typeof window.saveBGRemote!=='function' || typeof window.loadBGRemote!=='function') return;
    if(window.saveBGRemote.__lfUserRequestFix20260713d || window.loadBGRemote.__lfUserRequestFix20260713d) return;

    var saveOrig = window.saveBGRemote;
    var loadOrig = window.loadBGRemote;

    function applyRemoteBg(uid,data){
      if(!data) return;
      safe(function(){ ss('lf13_bg_'+uid, data.id || 'default'); });
      if(data.photo) safe(function(){ ss('lf13_bgphoto_'+uid, data.photo); });
      else if((data.id||'default')!=='photo'){
        try{ localStorage.removeItem('lf13_bgphoto_'+uid); }catch(_e){}
      }
    }

    window.saveBGRemote = function(id, photoData){
      if(!(window.DB_MODE==='firebase' && window.db && window.S && window.S.userId)) return saveOrig.apply(this, arguments);
      var uid = window.S.userId;
      var scope = bgScope();
      var config = db.collection('config');
      var payload = { id:id, photo:photoData===undefined?null:photoData, ts:Date.now() };
      var tasks = [];
      syncBusy();
      if(id==='photo' || !!photoData){
        tasks.push(config.doc('bg_'+uid+'_'+scope).set(payload,{merge:false}));
      }else{
        tasks.push(config.doc('bg_'+uid).set(payload,{merge:false}));
        tasks.push(config.doc('bg_'+uid+'_'+scope).set(payload,{merge:false}));
      }
      Promise.all(tasks).then(syncOk).catch(function(err){
        syncErr(err);
        toast('⚠️ Fundo salvo neste aparelho, mas falhou ao sincronizar com a nuvem.',4500);
      });
    };
    window.saveBGRemote.__lfUserRequestFix20260713d = 1;

    window.loadBGRemote = function(uid, cb){
      if(typeof cb==='function') cb();
      if(!(window.DB_MODE==='firebase' && window.db)) return;
      var scope = bgScope();
      var config = db.collection('config');
      config.doc('bg_'+uid+'_'+scope).get().then(function(docScoped){
        if(docScoped && docScoped.exists){
          applyRemoteBg(uid, docScoped.data() || {});
          if(typeof cb==='function') cb();
          return null;
        }
        return config.doc('bg_'+uid).get().then(function(docGlobal){
          if(docGlobal && docGlobal.exists){
            var data = docGlobal.data() || {};
            if((data.id||'default')!=='photo') applyRemoteBg(uid, data);
          }
          if(typeof cb==='function') cb();
          return null;
        });
      }).catch(function(){
        safe(function(){ loadOrig.call(window, uid, cb); });
      });
    };
    window.loadBGRemote.__lfUserRequestFix20260713d = 1;
  }

  function observeChatMutations(){
    if(window.__lfUserRequestFix20260713dObs) return;
    var host = el('pg-chat') || document.body;
    if(!host || typeof MutationObserver!=='function') return;
    // CORREÇÃO (trava geral): este observer chamava funções que alteram o DOM
    // (removeChild/appendChild) dentro do próprio callback, sem nenhuma trava.
    // Isso fazia o observer reagir às suas próprias mutações e, combinado com
    // os outros observers/patches que também mexem em #pg-chat, gerava uma
    // cascata de mutações que travava a aba inteira. Agora usamos uma trava de
    // reentrância global (window.__LF_CHAT_MUTATING__) + debounce via
    // requestAnimationFrame para colapsar rajadas de mutações em uma única
    // passada.
    var pending = false;
    function runOnce(){
      pending = false;
      if(window.__LF_CHAT_MUTATING__) return;
      window.__LF_CHAT_MUTATING__ = true;
      try{
        removeForbiddenButtons();
        enhanceAudioSpeedButtons(host);
        bindLogoFallbacks();
      }finally{
        // Libera a trava só depois do próximo frame, para que as mutações
        // geradas aqui (removeChild/appendChild) não disparem o observer de novo.
        raf(function(){ window.__LF_CHAT_MUTATING__ = false; });
      }
    }
    var obs = new MutationObserver(function(){
      if(window.__LF_CHAT_MUTATING__) return;
      if(pending) return;
      pending = true;
      raf(runOnce);
    });
    obs.observe(host,{childList:true,subtree:true});
    window.__lfUserRequestFix20260713dObs = obs;
  }

  function boot(){
    ensureStyle();
    removeForbiddenButtons();
    hardenLogoApply();
    patchRenderMsgs();
    patchDeletedMessageMenu();
    patchBackgroundSync();
    bindLogoFallbacks();
    enhanceAudioSpeedButtons();
    observeChatMutations();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
  window.addEventListener('load', function(){ raf(boot); setTimeout(boot,120); }, {once:true});
})();
