/* =====================================================================
 * lf-fix-raiz-definitivo-v1-20260801.js
 * ---------------------------------------------------------------------
 * FIX DEFINITIVO — trata CAUSAS-RAIZ, não sintomas. Carregar POR ÚLTIMO,
 * depois de TODOS os outros patches. Idempotente. Reversível: remover
 * o <script> restaura o comportamento anterior.
 *
 * Guard: window.__LF_FIX_RAIZ_DEFINITIVO_V1__
 *
 * BLOCOS:
 *   R1  Kanban 403 → não trava rolante (retorna {list:[]} local).
 *   R2  LF_CHAT_GROUP_MANAGE canônico: setDescription/setPhoto/setName/
 *       addMember/removeMember/promote/transfer/leave/dissolve
 *       — permissão via hasAdminAccess() + role efetivo (owner = createdBy
 *       OU único ADM sobrevivente OU hasAdminAccess()==true, i.e. HUDSON).
 *   R3  Botão-direito no card do grupo para ADM = "🗑 Excluir grupo p/ TODOS"
 *       (não só sair). Requer confirmação dupla ("digite APAGAR").
 *   R4  Rótulo do modal de gestão: "Fechar" → "OK" quando há ação
 *       destrutiva; garante botão "🗑 Apagar grupo" para OWNER EFETIVO.
 *   R5  Modais fora do viewport (mo-du, mo-k, disponibilizar ADM etc.):
 *       força .mb a permanecer no centro do viewport atual, ignorando o
 *       body.style.top negativo que openM cria. CSS global + rAF fix.
 *   R6  Reset de interface — watchdog 3s DURO externo. Se travar em
 *       _confirmModal, força reload após timeout.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_RAIZ_DEFINITIVO_V1__) return;
  global.__LF_FIX_RAIZ_DEFINITIVO_V1__ = true;

  var D  = global.document;
  var LS = global.localStorage;
  var TAG = '[lf-fix-raiz-definitivo]';

  function log(){ try{ console.log.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_){} }
  function warn(){ try{ console.warn.apply(console,[TAG].concat([].slice.call(arguments))); }catch(_){} }
  function safe(fn,fb){ try{ return fn(); }catch(_){ return fb; } }
  function arr(x){ return Array.isArray(x)?x:[]; }
  function meUid(){ return (global.S && global.S.userId) || ''; }
  function normUid(x){
    if (x == null) return '';
    if (typeof x === 'object') return String(x.uid||x.id||x.userId||'').trim();
    return String(x).trim();
  }
  function sameUid(a,b){ a=normUid(a); b=normUid(b); return !!a && a===b; }
  function toast(m){ if (typeof global.toast==='function') global.toast(m); }
  function isAdm(){
    return typeof global.hasAdminAccess === 'function' && !!global.hasAdminAccess();
  }
  function getConvs(){
    return safe(function(){
      if (typeof global._chatGetConvs==='function') return arr(global._chatGetConvs());
      if (typeof global.sg==='function') return arr(global.sg('lf13_chat_convs'));
      var raw = LS.getItem('lf13_chat_convs');
      return raw ? arr(JSON.parse(raw)) : [];
    },[]);
  }
  function findConv(id){
    id = String(id||'');
    return getConvs().find(function(c){ return c && String(c.id)===id; }) || null;
  }
  function saveConvsMerge(conv){
    var list = getConvs();
    var i = list.findIndex(function(c){ return c && c.id===conv.id; });
    if (i<0) list.push(conv); else list[i] = Object.assign({}, list[i], conv);
    if (typeof global._chatSaveConvs==='function') global._chatSaveConvs(list);
    else if (typeof global.ss==='function') global.ss('lf13_chat_convs', list);
  }

  /* ================================================================
   * R1 — Kanban 403 não trava o rolante
   * ================================================================ */
  (function fixKanban403(){
    var origFetch = global.fetch;
    if (!origFetch || origFetch.__lfRaiz) return;
    var wrapped = function(input, init){
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      var p = origFetch.apply(this, arguments);
      if (!/\/api\/v1\/kanban\/list/.test(url)) return p;
      return p.then(function(resp){
        if (!resp || resp.status !== 403) return resp;
        try {
          warn('kanban/list 403 — devolvendo fallback local para não travar rolante:', url);
          var body = JSON.stringify({ ok:true, data:{ list:[] }, meta:{ endpoint:'/api/v1/kanban/list', fallback:'403->empty' } });
          return new Response(body, { status:200, headers:{'Content-Type':'application/json'} });
        } catch(_){ return resp; }
      });
    };
    wrapped.__lfRaiz = true;
    global.fetch = wrapped;
    log('R1 kanban 403 fallback ativo');
  })();

  /* ================================================================
   * R2 — LF_CHAT_GROUP_MANAGE canônico (topo da cadeia)
   * ================================================================ */
  function roleEfetivo(conv){
    if (!conv || !conv.isGroup) return 'viewer';
    var me = meUid();
    var admins = arr(conv.admins).map(normUid).filter(Boolean);
    var iAmAdmin = admins.some(function(u){ return sameUid(u,me); });
    var iAmCreator = !!conv.createdBy && sameUid(conv.createdBy, me);
    // OWNER EFETIVO: criador OR único ADM OR usuário com hasAdminAccess()
    if (iAmCreator) return 'owner';
    if (iAmAdmin && admins.length === 1) return 'owner';
    if (iAmAdmin && isAdm()) return 'owner';    // Hudson: ADM do sistema é dono efetivo
    if (iAmAdmin) return 'admin';
    return 'viewer';
  }
  global.LF_roleEfetivo = roleEfetivo;

  function canManage(conv){
    var r = roleEfetivo(conv);
    return r === 'admin' || r === 'owner';
  }
  function canDissolve(conv){ return roleEfetivo(conv) === 'owner'; }

  function askText(promptMsg, def){
    return global.prompt ? global.prompt(promptMsg, def||'') : null;
  }

  function _canonSetDescription(convId){
    var conv = findConv(convId || global._chatCurrentConv);
    if (!conv){ toast('Grupo não encontrado'); return; }
    if (!canManage(conv)){ toast('Apenas ADM pode editar descrição'); return; }
    var nv = askText('Descrição do grupo:', conv.description||'');
    if (nv == null) return;
    conv.description = String(nv).slice(0,500);
    conv.updatedAt = new Date().toISOString();
    saveConvsMerge(conv);
    safe(function(){ typeof global._chatSyncConvUpsert==='function' && global._chatSyncConvUpsert(conv); });
    safe(function(){ typeof global.renderChatList==='function' && global.renderChatList(); });
    toast('📝 Descrição salva');
  }
  function _canonSetName(convId){
    var conv = findConv(convId || global._chatCurrentConv);
    if (!conv) return;
    if (!canManage(conv)){ toast('Apenas ADM pode renomear'); return; }
    var nv = askText('Nome do grupo:', conv.name||'');
    if (nv == null) return;
    nv = String(nv).trim().slice(0,80);
    if (!nv){ toast('Nome inválido'); return; }
    conv.name = nv; conv.updatedAt = new Date().toISOString();
    saveConvsMerge(conv);
    safe(function(){ typeof global._chatSyncConvUpsert==='function' && global._chatSyncConvUpsert(conv); });
    safe(function(){ typeof global.renderChatList==='function' && global.renderChatList(); });
    toast('✏ Nome atualizado');
  }
  function _canonSetPhoto(convId){
    var conv = findConv(convId || global._chatCurrentConv);
    if (!conv) return;
    if (!canManage(conv)){ toast('Apenas ADM pode trocar a foto'); return; }
    var inp = D.createElement('input');
    inp.type='file'; inp.accept='image/*'; inp.style.display='none';
    D.body.appendChild(inp);
    inp.onchange = function(){
      var f = inp.files && inp.files[0]; if (!f){ inp.remove(); return; }
      if (f.size > 4*1024*1024){ toast('⚠️ Máx 4MB'); inp.remove(); return; }
      toast('Enviando foto...');
      var tk = (global.S && (global.S._workerToken||global.S.token))||'';
      f.arrayBuffer().then(function(buf){
        return global.fetch('/api/v1/upload/binary',{
          method:'POST',
          headers:{'Authorization':'Bearer '+tk,'Content-Type':f.type||'image/jpeg','X-Filename':'group_'+conv.id+'.jpg','X-Folder':'chat-groups'},
          body: buf
        }).then(function(r){ if(!r.ok) throw new Error('upload '+r.status); return r.json(); });
      }).then(function(j){
        var url = j && j.data && j.data.url; if (!url) throw new Error('sem url');
        conv.avatar = url; conv.updatedAt = new Date().toISOString();
        saveConvsMerge(conv);
        safe(function(){ typeof global._chatSyncConvUpsert==='function' && global._chatSyncConvUpsert(conv); });
        safe(function(){ typeof global.renderChatList==='function' && global.renderChatList(); });
        toast('🖼 Foto atualizada');
      }).catch(function(e){ warn('foto falhou', e && e.message); toast('Falha ao enviar foto'); })
        .finally(function(){ inp.remove(); });
    };
    inp.click();
  }
  function _canonAddMember(convId, uid){
    var conv = findConv(convId || global._chatCurrentConv);
    if (!conv || !uid) return;
    if (!canManage(conv)){ toast('Apenas ADM pode adicionar'); return; }
    conv.participants = arr(conv.participants);
    if (conv.participants.some(function(u){ return sameUid(u,uid); })){
      toast('Já está no grupo'); return;
    }
    conv.participants.push(uid);
    conv.updatedAt = new Date().toISOString();
    saveConvsMerge(conv);
    safe(function(){ typeof global._chatSyncConvUpsert==='function' && global._chatSyncConvUpsert(conv); });
    safe(function(){ typeof global.renderChatList==='function' && global.renderChatList(); });
    toast('✅ Adicionado');
  }
  function _canonRemoveMember(convId, uid){
    var conv = findConv(convId || global._chatCurrentConv);
    if (!conv || !uid) return;
    if (!canManage(conv)){ toast('Apenas ADM pode remover'); return; }
    conv.participants = arr(conv.participants).filter(function(u){ return !sameUid(u,uid); });
    conv.admins       = arr(conv.admins).filter(function(u){ return !sameUid(u,uid); });
    conv.updatedAt = new Date().toISOString();
    saveConvsMerge(conv);
    safe(function(){ typeof global._chatSyncConvUpsert==='function' && global._chatSyncConvUpsert(conv); });
    safe(function(){ typeof global.renderChatList==='function' && global.renderChatList(); });
    toast('🚫 Removido');
  }
  function _canonLeave(convId){
    var conv = findConv(convId || global._chatCurrentConv);
    if (!conv) return;
    var me = meUid();
    var doIt = function(){
      conv.participants = arr(conv.participants).filter(function(u){ return !sameUid(u,me); });
      conv.admins       = arr(conv.admins).filter(function(u){ return !sameUid(u,me); });
      conv.updatedAt = new Date().toISOString();
      saveConvsMerge(conv);
      safe(function(){ typeof global._chatSyncConvUpsert==='function' && global._chatSyncConvUpsert(conv); });
      // limpa APENAS o meu inbox local
      var mine = getConvs().filter(function(c){ return !(c && c.id===conv.id); });
      if (typeof global._chatSaveConvs==='function') global._chatSaveConvs(mine);
      try{ LS.removeItem('lf13_chat_msgs_'+conv.id); }catch(_){}
      if (global._chatCurrentConv===conv.id && typeof global.closeChatConv==='function') global.closeChatConv();
      safe(function(){ typeof global.renderChatList==='function' && global.renderChatList(); });
      toast('🚪 Você saiu');
    };
    if (typeof global._confirmModal==='function')
      global._confirmModal({title:'Sair do grupo?',msg:'O grupo continua para os demais.',okLabel:'Sair',okClass:'bd',onOk:doIt});
    else if (global.confirm('Sair do grupo?')) doIt();
  }
  function _canonDissolve(convId){
    var conv = findConv(convId || global._chatCurrentConv);
    if (!conv) return;
    if (!canDissolve(conv)){ toast('Sem permissão para apagar o grupo'); return; }
    // Confirmação DUPLA para evitar toque acidental
    var typed = askText('⚠️ Apagar grupo para TODOS.\nDigite APAGAR:');
    if (String(typed||'').trim().toUpperCase() !== 'APAGAR'){
      toast('Cancelado'); return;
    }
    var me = meUid();
    var participants = arr(conv.participants).slice();
    conv.dissolved = true;
    conv.dissolvedAt = new Date().toISOString();
    conv.dissolvedBy = me;
    conv.updatedAt = conv.dissolvedAt;
    conv.participants = [];
    conv.admins = [];
    saveConvsMerge(conv);
    safe(function(){ typeof global._chatSyncConvUpsert==='function' && global._chatSyncConvUpsert(conv); });
    safe(function(){
      if (typeof global._chatRemoveInboxEntryForUsers==='function' && participants.length)
        global._chatRemoveInboxEntryForUsers(conv.id, participants);
    });
    // limpa MEU inbox também (ADM pediu explicitamente isso)
    var mine = getConvs().filter(function(c){ return !(c && c.id===conv.id); });
    if (typeof global._chatSaveConvs==='function') global._chatSaveConvs(mine);
    try{ LS.removeItem('lf13_chat_msgs_'+conv.id); }catch(_){}
    if (global._chatCurrentConv===conv.id && typeof global.closeChatConv==='function') global.closeChatConv();
    safe(function(){ typeof global.renderChatList==='function' && global.renderChatList(); });
    toast('🗑 Grupo apagado para todos');
  }

  // Instala como TOPO da cadeia
  function installCanonicalManage(){
    var prev = global.LF_CHAT_GROUP_MANAGE || {};
    global.LF_CHAT_GROUP_MANAGE = Object.assign({}, prev, {
      // preserva open() do patch atual (renderiza modal)
      open: prev.open || function(){ warn('open() não instalado'); },
      setDescription: _canonSetDescription,
      setName:        _canonSetName,
      setPhoto:       _canonSetPhoto,
      addMember:      _canonAddMember,
      removeMember:   function(idxOrUid){
        // compat: pode receber index do modal antigo
        if (typeof idxOrUid === 'number'){
          var mo = D.getElementById('mo-chat-manage');
          var m  = mo && mo._members && mo._members[idxOrUid];
          if (m) return _canonRemoveMember(mo._convId, m.uid);
        }
        var mo2 = D.getElementById('mo-chat-manage');
        return _canonRemoveMember(mo2 && mo2._convId, idxOrUid);
      },
      leave:    function(convId){ return _canonLeave(convId); },
      dissolve: function(convId){ return _canonDissolve(convId); },
      __lfRaiz: true
    });
    log('R2 LF_CHAT_GROUP_MANAGE canônico instalado');
  }
  installCanonicalManage();
  // Reinstala se algum patch tardio sobrescrever
  setInterval(function(){
    if (!global.LF_CHAT_GROUP_MANAGE || !global.LF_CHAT_GROUP_MANAGE.__lfRaiz) installCanonicalManage();
  }, 2000);

  /* ================================================================
   * R3 — chatDeleteConv em grupo:
   *      OWNER EFETIVO → oferece "Sair" OU "Apagar p/ todos"
   *      Outros        → só sair
   * ================================================================ */
  (function wrapDelete(){
    function apply(){
      var orig = global.chatDeleteConv;
      if (typeof orig !== 'function'){ setTimeout(apply,400); return; }
      if (orig.__lfRaiz) return;
      var w = function(convId){
        var conv = findConv(convId);
        if (!conv || !conv.isGroup) return orig.apply(this, arguments);
        if (canDissolve(conv)){
          if (typeof global._confirmModal==='function'){
            global._confirmModal({
              title:'Excluir conversa (grupo)',
              msg:'Você é ADM/dono efetivo.\n\n• "Apagar p/ todos": remove o grupo para TODOS.\n• "Sair apenas eu": grupo continua para os demais.',
              okLabel:'Apagar p/ todos', okClass:'bd',
              cancelLabel:'Sair apenas eu',
              onOk:     function(){ _canonDissolve(convId); },
              onCancel: function(){ _canonLeave(convId); }
            });
          } else if (global.confirm('Apagar grupo para TODOS? (Cancelar = só sair)')) _canonDissolve(convId);
          else _canonLeave(convId);
        } else {
          _canonLeave(convId);
        }
      };
      w.__lfRaiz = true;
      global.chatDeleteConv = w;
      log('R3 chatDeleteConv (grupo) canônico');
    }
    apply();
  })();

  /* ================================================================
   * R4 — Rótulos e ordem dos botões no modal de gestão
   * ================================================================ */
  (function fixModalLabels(){
    function fix(){
      var mo = D.getElementById('mo-chat-manage');
      if (!mo || !mo.classList.contains('on')) return;
      // Fechar → OK quando há botão destrutivo
      var btns = mo.querySelectorAll('.mbtns .bc');
      var hasDestructive = !!mo.querySelector('.mbtns .bd');
      btns.forEach(function(b){
        if (hasDestructive && /^Fechar$/i.test((b.textContent||'').trim())) b.textContent = 'OK';
      });
      // Garante botão "🗑 Apagar grupo" para OWNER EFETIVO
      var conv = findConv(mo._convId);
      if (conv && canDissolve(conv) && !mo.querySelector('.mbtns .bd[data-lfraiz="dissolve"]')){
        var mbtns = mo.querySelector('.mbtns');
        if (mbtns){
          var btn = D.createElement('button');
          btn.className = 'bd';
          btn.style.cssText = 'background:#7f1d1d;border-color:#7f1d1d';
          btn.setAttribute('data-lfraiz','dissolve');
          btn.textContent = '🗑 Apagar grupo';
          btn.onclick = function(){ mo.classList.remove('on'); _canonDissolve(mo._convId); };
          mbtns.appendChild(btn);
        }
      }
    }
    if (global.MutationObserver){
      var obs = new MutationObserver(function(){ setTimeout(fix,0); });
      var boot = function(){
        var el = D.getElementById('mo-chat-manage');
        if (el) obs.observe(el, {attributes:true, childList:true, subtree:true, attributeFilter:['class']});
        else setTimeout(boot, 500);
      };
      boot();
    }
    log('R4 rótulos do modal de gestão em vigilância');
  })();

  /* ================================================================
   * R5 — MODAIS FORA DO VIEWPORT (mo-du, disponibilizar ADM, etc.)
   *      openM() congela o body com top:-scrollY, e o .mb pode
   *      renderizar abaixo do viewport visível. Correção:
   *      força .mb a permanecer no CENTRO DO VIEWPORT ATUAL do
   *      usuário, ignorando o offset negativo do body.
   * ================================================================ */
  (function fixModalViewport(){
    // CSS global — inset explícito no viewport atual
    var css = ''
      + '.mo.open,.mo.on{'
      + '  position:fixed !important;'
      + '  top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;'
      + '  inset:0 !important;'
      + '  display:flex !important;'
      + '  align-items:center !important;'
      + '  justify-content:center !important;'
      + '  padding:12px !important;'
      + '  overflow:hidden !important;'
      + '  z-index:2147483000 !important;'
      + '  pointer-events:auto !important;'
      + '}'
      + '.mo.open .mb,.mo.on .mb{'
      + '  position:relative !important;'
      + '  margin:auto !important;'
      + '  max-height:calc(100vh - 24px) !important;'
      + '  max-height:calc(100dvh - 24px) !important;'
      + '  overflow-y:auto !important;'
      + '  transform:none !important;'
      + '}'
      // Empilhamento previsível — todos os .mo abertos ao mesmo tempo
      + '.mo#mo-confirm-del.open,.mo#mo-confirm-del.on{z-index:2147483100 !important;}'
      ;
    var s = D.getElementById('lf-fix-raiz-modal-css');
    if (!s){
      s = D.createElement('style');
      s.id = 'lf-fix-raiz-modal-css';
      s.textContent = css;
      (D.head||D.documentElement).appendChild(s);
    }

    // Envelopa openM: após abrir, força scroll do .mb para topo
    // (para o botão "Remover" do mo-du ficar sempre visível)
    function apply(){
      if (typeof global.openM !== 'function'){ setTimeout(apply, 400); return; }
      if (global.openM.__lfRaiz) return;
      var orig = global.openM;
      global.openM = function(id){
        var r = orig.apply(this, arguments);
        try {
          var el = D.getElementById(id);
          if (el){
            // Força classe .on também (caso algum patch use .on em vez de .open)
            el.classList.add('open');
            // Rola .mb para o topo pra confirmação aparecer
            var mb = el.querySelector('.mb');
            if (mb) {
              mb.scrollTop = 0;
              // Se o .mb estiver renderizando fora do viewport, força reflow
              requestAnimationFrame(function(){
                var rect = mb.getBoundingClientRect();
                if (rect.bottom > global.innerHeight || rect.top < 0){
                  mb.style.marginTop = '0';
                  mb.style.transform = 'none';
                  mb.scrollIntoView({block:'center', behavior:'instant'});
                }
              });
            }
          }
        } catch(_){}
        return r;
      };
      global.openM.__lfRaiz = true;
      log('R5 openM viewport-safe instalado');
    }
    apply();

    // Failsafe: a cada 500ms, se algum modal .open estiver fora do viewport, corrige
    setInterval(function(){
      var opens = D.querySelectorAll('.mo.open, .mo.on');
      if (!opens.length) return;
      opens.forEach(function(mo){
        var mb = mo.querySelector('.mb'); if (!mb) return;
        var rect = mb.getBoundingClientRect();
        if (rect.height && (rect.bottom > global.innerHeight + 2 || rect.top < -2)){
          safe(function(){ mb.scrollIntoView({block:'center'}); });
        }
      });
    }, 500);
  })();

  /* ================================================================
   * R6 — resetInterface: watchdog EXTERNO DURO (3s)
   * ================================================================ */
  (function fixReset(){
    function apply(){
      if (typeof global.resetInterface !== 'function'){ setTimeout(apply, 400); return; }
      if (global.resetInterface.__lfRaiz) return;
      var orig = global.resetInterface;
      global.resetInterface = function(){
        var forced = false;
        var to = setTimeout(function(){
          forced = true;
          warn('resetInterface: watchdog 3s — forçando reload');
          try {
            if ('serviceWorker' in navigator){
              navigator.serviceWorker.getRegistrations().then(function(regs){
                return Promise.all(regs.map(function(r){ return r.unregister(); }));
              }).catch(function(){});
            }
          } catch(_){}
          try { location.href = location.pathname + '?_reset=' + Date.now(); } catch(_){}
        }, 3000);
        try {
          var p = orig.apply(this, arguments);
          if (p && typeof p.then === 'function'){
            p.finally(function(){ if(!forced) clearTimeout(to); });
          } else {
            setTimeout(function(){ if(!forced) clearTimeout(to); }, 400);
          }
          return p;
        } catch(e){
          clearTimeout(to);
          throw e;
        }
      };
      global.resetInterface.__lfRaiz = true;
      log('R6 resetInterface watchdog 3s ativo');
    }
    apply();
  })();

  /* ================================================================
   * Diagnóstico exposto
   * ================================================================ */
  global.LF_FIX_RAIZ = {
    version: 'v1-20260801',
    status: function(){
      return {
        openM_wrapped:      !!(global.openM && global.openM.__lfRaiz),
        fetch_wrapped:      !!(global.fetch && global.fetch.__lfRaiz),
        deleteConv_wrapped: !!(global.chatDeleteConv && global.chatDeleteConv.__lfRaiz),
        reset_wrapped:      !!(global.resetInterface && global.resetInterface.__lfRaiz),
        groupManage_canon:  !!(global.LF_CHAT_GROUP_MANAGE && global.LF_CHAT_GROUP_MANAGE.__lfRaiz),
        me:                 meUid(),
        isAdm:              isAdm()
      };
    }
  };

  log('v1-20260801 pronto — R1..R6 ativos. Diagnóstico: LF_FIX_RAIZ.status()');
})(window);
