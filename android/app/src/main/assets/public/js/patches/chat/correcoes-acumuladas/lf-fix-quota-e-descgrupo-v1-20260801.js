/* =====================================================================
 * lf-fix-quota-e-descgrupo-v1-20260801.js
 * ---------------------------------------------------------------------
 * Correção DEFINITIVA de 2 erros específicos:
 *
 *   [E1] "Armazenamento local cheio — exporte seus dados e limpe"
 *        Causa raiz: fotos/avatars persistindo como data-URL em
 *        lf13_chat_convs. Solução: (a) força offload agressivo para
 *        Backblaze via Worker /api/v1/upload/binary em QUALQUER escrita
 *        de foto/avatar/cover; (b) intercepta ss() e localStorage.setItem
 *        para sanitizar retroativamente; (c) purga entradas gigantes já
 *        gravadas.
 *
 *   [E2] "Ao editar descrição de grupo mesmo sendo ADM: só ADM pode"
 *        Causa raiz: cadeia de wrappers de LF_CHAT_GROUP_MANAGE.setDescription
 *        usa canAdmin(getConv(modal()._convId)) e _convId pode estar
 *        undefined; além disso, admins pode ter formato heterogêneo
 *        (string/number/object). Solução: canManageGroup unificado
 *        e SUBSTITUI setDescription/setPhoto/setName no topo da cadeia,
 *        curto-circuitando os wrappers antigos.
 *
 * Aditivo. Idempotente. Carregar POR ÚLTIMO entre os patches de chat.
 * Guard: window.__LF_FIX_QUOTA_E_DESCGRUPO_V1__
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_FIX_QUOTA_E_DESCGRUPO_V1__) return;
  global.__LF_FIX_QUOTA_E_DESCGRUPO_V1__ = true;

  var D = global.document;
  var LS = global.localStorage;
  var TAG = '[lf-fix-quota-e-descgrupo-v1]';
  var CHAT_KEY = 'lf13_chat_convs';
  var DATAURL_HARD_LIMIT = 8 * 1024; // 8KB: qualquer data-url acima disso deve virar URL remota

  function log()  { try { console.log.apply(console,  [TAG].concat([].slice.call(arguments))); } catch(_){} }
  function warn() { try { console.warn.apply(console, [TAG].concat([].slice.call(arguments))); } catch(_){} }
  function arr(v){ return Array.isArray(v)?v:[]; }
  function safe(fn,fb){ try{return fn();}catch(_){return fb;} }
  function nowIso(){ return new Date().toISOString(); }
  function toast(m){ if (typeof global.toast==='function') global.toast(m); }

  /* ------------------------------------------------------------------ */
  /* Normalização de uid — resolve E2 causa 2 (formato heterogêneo)     */
  /* ------------------------------------------------------------------ */
  function normUid(x){
    if (x == null) return '';
    if (typeof x === 'object'){
      // { uid: 'x' } | { id: 'x' } | { userId: 'x' }
      return String(x.uid || x.id || x.userId || '').trim();
    }
    return String(x).trim();
  }
  function meUid(){ return normUid((global.S && global.S.userId) || ''); }
  function sameUid(a,b){ a=normUid(a); b=normUid(b); return !!a && a===b; }

  function getConvs(){
    return safe(function(){
      if (typeof global._chatGetConvs==='function') return arr(global._chatGetConvs());
      if (typeof global.sg==='function') return arr(global.sg(CHAT_KEY));
      var raw = LS.getItem(CHAT_KEY);
      return raw ? arr(JSON.parse(raw)) : [];
    }, []);
  }
  function findConv(id){
    id = String(id||'');
    return getConvs().find(function(c){ return c && String(c.id)===id; }) || null;
  }
  function persistConvs(list){
    // usa a via já sanitizada do v2 se disponível
    if (typeof global._chatSaveConvs==='function') return global._chatSaveConvs(list);
    if (typeof global.ss==='function') return global.ss(CHAT_KEY, list);
    try { LS.setItem(CHAT_KEY, JSON.stringify(list)); return true; }
    catch(_){ return false; }
  }

  /* ------------------------------------------------------------------ */
  /* Permissão robusta — resolve E2                                     */
  /* ------------------------------------------------------------------ */
  function hasAdmin(conv){
    if (!conv) return false;
    var me = meUid();
    if (!me) return false;
    return arr(conv.admins).some(function(x){ return sameUid(x, me); });
  }
  function isOwner(conv){
    if (!conv) return false;
    if (sameUid(conv.createdBy, meUid())) return true;
    // Fallback seguro: admin único E o grupo foi criado antes do createdBy existir
    var admins = arr(conv.admins).map(normUid).filter(Boolean);
    if (admins.length===1 && sameUid(admins[0], meUid())) return true;
    return false;
  }
  function canManageGroup(conv){
    return !!conv && conv.isGroup !== false && (hasAdmin(conv) || isOwner(conv));
  }
  // exposto para debug e para outros patches poderem se apoiar
  global.LF_canManageGroup_v1 = canManageGroup;

  /* ------------------------------------------------------------------ */
  /* Upload remoto (Backblaze via Worker) — resolve E1                  */
  /* ------------------------------------------------------------------ */
  function workerToken(){
    return (global.S && (global.S._workerToken || global.S.token)) || '';
  }
  function parseDataUrl(s){
    if (typeof s!=='string' || s.indexOf('data:')!==0) return null;
    var m = s.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!m) return null;
    return { mime:m[1]||'application/octet-stream', b64:!!m[2], payload:m[3]||'' };
  }
  function dataUrlToBuffer(s){
    var p = parseDataUrl(s);
    if (!p || !p.b64) throw new Error('data-url inválida');
    var bin = global.atob(p.payload);
    var u8 = new Uint8Array(bin.length);
    for (var i=0;i<bin.length;i++) u8[i] = bin.charCodeAt(i);
    return { buffer:u8.buffer, mime:p.mime };
  }
  function uploadBuffer(buf, mime, filename, folder){
    var tk = workerToken();
    if (!tk) return Promise.reject(new Error('sem-token'));
    return global.fetch('/api/v1/upload/binary', {
      method:'POST',
      headers:{
        'Authorization':'Bearer '+tk,
        'Content-Type': mime||'application/octet-stream',
        'X-Filename': filename||('file_'+Date.now()),
        'X-Folder': folder||'chat'
      },
      body: buf
    }).then(function(r){
      if (!r.ok) return r.text().then(function(t){ throw new Error('upload '+r.status+': '+t); });
      return r.json();
    }).then(function(j){
      var d = j && j.data;
      if (!d || !d.url) throw new Error('upload sem URL');
      return d;
    });
  }
  function uploadDataUrl(dataUrl, filename, folder){
    var b = dataUrlToBuffer(dataUrl);
    return uploadBuffer(b.buffer, b.mime, filename, folder);
  }

  var pendingUploads = Object.create(null);
  function offloadConvAvatar(convId, dataUrl){
    convId = String(convId||'');
    if (!convId || !dataUrl || dataUrl.indexOf('data:image/')!==0) return;
    if (pendingUploads[convId]) return;
    pendingUploads[convId] = true;

    uploadDataUrl(dataUrl, 'group_'+convId+'.jpg', 'chat-groups')
      .then(function(d){
        var conv = findConv(convId);
        if (!conv) return;
        if (typeof conv.avatar==='string' && conv.avatar.indexOf('data:image/')===0){
          conv.avatar = d.url;
          conv.updatedAt = nowIso();
          var list = getConvs().map(function(c){ return c && c.id===conv.id ? conv : c; });
          persistConvs(list);
          try { if (typeof global._chatSyncConvUpsert==='function') global._chatSyncConvUpsert(conv); } catch(_){}
          try { if (typeof global.renderChatList==='function') global.renderChatList(); } catch(_){}
          log('[E1] avatar do grupo movido p/ Backblaze', convId);
        }
      })
      .catch(function(e){ warn('offload avatar falhou', convId, e && e.message); })
      .finally(function(){ pendingUploads[convId] = false; });
  }

  /* ------------------------------------------------------------------ */
  /* Sanitizador GLOBAL — remove data-URLs grandes ao gravar            */
  /* ------------------------------------------------------------------ */
  function stripBigDataUrls(v, ctx){
    ctx = ctx || {};
    if (Array.isArray(v)) return v.map(function(x,i){ return stripBigDataUrls(x, {convId:ctx.convId,key:ctx.key,path:(ctx.path||'')+'['+i+']'}); });
    if (v && typeof v==='object'){
      var out = {};
      Object.keys(v).forEach(function(k){
        out[k] = stripBigDataUrls(v[k], {convId: ctx.convId || v.id, key:k, path:(ctx.path||'')+'.'+k});
      });
      return out;
    }
    if (typeof v==='string' && v.indexOf('data:')===0 && v.length >= DATAURL_HARD_LIMIT){
      // se é uma imagem de avatar/foto e temos convId → offload assíncrono
      if (v.indexOf('data:image/')===0 && /avatar|photo|pic|cover|image/i.test(ctx.key||'')){
        offloadConvAvatar(ctx.convId, v);
      }
      return null; // NUNCA persiste data-URL grande — evita QuotaExceeded
    }
    return v;
  }

  function installQuotaGuards(){
    // 1) intercepta ss() (chave chat)
    var origSS = typeof global.ss==='function' ? global.ss : null;
    if (origSS){
      global.ss = function(k,val){
        if (k === CHAT_KEY) val = arr(val).map(function(c){ return stripBigDataUrls(c, {convId: c && c.id, key:'', path:'conv'}); });
        return origSS.call(this, k, val);
      };
    }
    // 2) intercepta _chatSaveConvs (via principal do v2)
    var origSave = typeof global._chatSaveConvs==='function' ? global._chatSaveConvs : null;
    global._chatSaveConvs = function(list){
      list = arr(list).map(function(c){ return stripBigDataUrls(c, {convId: c && c.id, key:'', path:'conv'}); });
      if (origSave) return origSave.call(this, list);
      return persistConvs(list);
    };
    // 3) rede final: intercepta localStorage.setItem para a chave do chat
    try {
      var origSetItem = LS.setItem.bind(LS);
      LS.setItem = function(k, v){
        if (k === CHAT_KEY && typeof v === 'string'){
          try {
            var parsed = JSON.parse(v);
            var clean = arr(parsed).map(function(c){ return stripBigDataUrls(c, {convId: c && c.id, key:'', path:'conv'}); });
            v = JSON.stringify(clean);
          } catch(_){}
        }
        return origSetItem(k, v);
      };
    } catch(_){}

    // 4) purga imediata do que já estiver gigante no storage
    var current = getConvs();
    var cleaned = current.map(function(c){ return stripBigDataUrls(c, {convId: c && c.id, key:'', path:'conv'}); });
    try {
      if (JSON.stringify(current) !== JSON.stringify(cleaned)){
        persistConvs(cleaned);
        log('[E1] purga inicial concluída — data-URLs gigantes removidas de', CHAT_KEY);
      }
    } catch(_){}

    // 5) agenda offload retroativo (o que ainda estiver como data-URL)
    setTimeout(function(){
      getConvs().forEach(function(c){
        if (c && c.isGroup && typeof c.avatar==='string' && c.avatar.indexOf('data:image/')===0){
          offloadConvAvatar(c.id, c.avatar);
        }
      });
    }, 400);
  }

  /* ------------------------------------------------------------------ */
  /* Permissão de descrição/foto/nome — sobrescreve TOPO da cadeia       */
  /* ------------------------------------------------------------------ */
  function editDescriptionDefinitive(convId){
    var conv = findConv(convId || global._chatCurrentConv);
    if (!conv){ toast('Grupo não encontrado'); return; }
    if (!canManageGroup(conv)){
      // aqui SIM é bloqueio legítimo (usuário não é adm nem criador)
      toast('Apenas ADM ou criador pode editar descrição'); return;
    }
    var nv = global.prompt ? global.prompt('Descrição do grupo:', conv.description || '') : null;
    if (nv == null) return;
    conv.description = String(nv||'').slice(0,500);
    conv.updatedAt = nowIso();
    var list = getConvs().map(function(c){ return c && c.id===conv.id ? conv : c; });
    persistConvs(list);
    try { if (typeof global._chatSyncConvUpsert==='function') global._chatSyncConvUpsert(conv); } catch(_){}
    try { if (typeof global.renderChatList==='function') global.renderChatList(); } catch(_){}
    toast('📝 Descrição salva');
  }

  function renameDefinitive(convId){
    var conv = findConv(convId || global._chatCurrentConv);
    if (!conv) return;
    if (!canManageGroup(conv)){ toast('Apenas ADM ou criador pode renomear'); return; }
    var nv = global.prompt ? global.prompt('Nome do grupo:', conv.name||'') : null;
    if (nv == null) return;
    nv = String(nv||'').trim().slice(0,80);
    if (!nv){ toast('Nome inválido'); return; }
    conv.name = nv; conv.updatedAt = nowIso();
    var list = getConvs().map(function(c){ return c && c.id===conv.id ? conv : c; });
    persistConvs(list);
    try { if (typeof global._chatSyncConvUpsert==='function') global._chatSyncConvUpsert(conv); } catch(_){}
    try { if (typeof global.renderChatList==='function') global.renderChatList(); } catch(_){}
    toast('✏️ Nome atualizado');
  }

  function setPhotoDefinitive(convId){
    convId = String(convId || global._chatCurrentConv || '');
    var conv = findConv(convId);
    if (!conv) return;
    if (!canManageGroup(conv)){ toast('Apenas ADM ou criador pode trocar a foto'); return; }

    var inp = D.createElement('input');
    inp.type='file'; inp.accept='image/*'; inp.style.display='none';
    D.body.appendChild(inp);
    inp.onchange = function(){
      var f = inp.files && inp.files[0];
      if (!f){ inp.remove(); return; }
      if (f.size > 4*1024*1024){ toast('⚠️ Imagem muito grande. Máx 4MB.'); inp.remove(); return; }
      toast('Enviando foto do grupo...');
      f.arrayBuffer().then(function(buf){
        return uploadBuffer(buf, f.type||'image/jpeg', f.name||('group_'+convId+'.jpg'), 'chat-groups');
      }).then(function(d){
        // salva SEMPRE como URL http — nunca data:
        conv.avatar = d.url;
        conv.updatedAt = nowIso();
        var list = getConvs().map(function(c){ return c && c.id===conv.id ? conv : c; });
        persistConvs(list);
        try { if (typeof global._chatSyncConvUpsert==='function') global._chatSyncConvUpsert(conv); } catch(_){}
        try { if (typeof global.renderChatList==='function') global.renderChatList(); } catch(_){}
        toast('🖼 Foto do grupo atualizada');
      }).catch(function(e){
        warn('upload foto falhou', e && e.message);
        toast('Falha ao enviar a foto. Verifique conexão e Backblaze.');
      }).finally(function(){ inp.remove(); });
    };
    inp.click();
  }

  function installPermissionOverride(){
    function apply(){
      if (!global.LF_CHAT_GROUP_MANAGE || typeof global.LF_CHAT_GROUP_MANAGE!=='object'){
        return setTimeout(apply, 200);
      }
      var api = global.LF_CHAT_GROUP_MANAGE;
      // Substitui as 3 no topo — curto-circuita canAdmin/modal()._convId frágeis
      api.setDescription = function(convId){ return editDescriptionDefinitive(convId); };
      api.setName        = function(convId){ return renameDefinitive(convId); };
      api.setPhoto       = function(convId){ return setPhotoDefinitive(convId); };
      api.__lfFixQuotaDescV1 = true;
      log('[E2] LF_CHAT_GROUP_MANAGE.setDescription/setName/setPhoto substituídos');
    }
    apply();
  }

  /* ------------------------------------------------------------------ */
  /* Execução                                                            */
  /* ------------------------------------------------------------------ */
  installQuotaGuards();
  installPermissionOverride();
  log('instalado');
})(window);
