/* =====================================================================
 * lf-images-b2-offload-v1-20260728.js
 * Corrige QuotaExceededError em lf6_u causado por avatares em base64.
 * ADITIVO — não reescreve chat.js, users-store.js nem configuracoes.js.
 * Deve carregar DEPOIS de:
 *   - lf-chat-avatar-presence-profile-fix-20260727.js
 *   - lf-users-persist-cloudfirst-v1-20260728.js
 * ===================================================================== */
(function(global){
  'use strict';
  if(global.__LF_IMAGES_B2_OFFLOAD_V1__) return;
  global.__LF_IMAGES_B2_OFFLOAD_V1__ = true;

  var PIC_FIELDS = ['pic','picData','photo','photoData','profilePic','avatarUrl'];
  function isBase64Img(v){ return typeof v==='string' && v.indexOf('data:image/')===0; }
  function isHttpUrl(v){ return typeof v==='string' && /^https?:\/\//i.test(v); }

  /* ---------- 1) Sanitização do array lf6_u ---------- */
  function stripHeavyFieldsFromUser(u){
    if(!u || typeof u!=='object') return u;
    for(var i=0;i<PIC_FIELDS.length;i++){
      var k=PIC_FIELDS[i];
      if(isBase64Img(u[k])){
        try{
          if(typeof global.ss==='function' && u.id) global.ss('lf13_pic_'+u.id, u[k]);
        }catch(_e){}
        scheduleAvatarUpload(u.id, u[k]);
        u[k]=null;
      }else if(u[k] && !isHttpUrl(u[k]) && u[k]!==null){
        u[k]=null;
      }
    }
    if(u.picUrl && !isHttpUrl(u.picUrl)) u.picUrl = null;
    return u;
  }

  function sanitizeUsersArray(list){
    if(!Array.isArray(list)) return list;
    for(var i=0;i<list.length;i++) stripHeavyFieldsFromUser(list[i]);
    return list;
  }

  /* ---------- 2) Envolver saveUsersLocal com blindagem ---------- */
  var _origSave = global.saveUsersLocal;
  global.saveUsersLocal = function(list, uid, patch){
    try{ sanitizeUsersArray(list); }catch(_e){}
    if(patch && typeof patch==='object'){
      for(var i=0;i<PIC_FIELDS.length;i++){
        var k=PIC_FIELDS[i];
        if(isBase64Img(patch[k])){
          scheduleAvatarUpload(uid, patch[k]);
          patch[k]=null;
        }else if(patch[k] && !isHttpUrl(patch[k])){
          patch[k]=null;
        }
      }
      if(patch.picUrl && !isHttpUrl(patch.picUrl)) patch.picUrl = null;
    }
    if(typeof _origSave==='function') return _origSave(list, uid, patch);
    return global.ss && global.ss('lf6_u', list);
  };

  /* ---------- 3) Upload de avatar para o Worker (B2) ---------- */
  var _uploading = {};
  function scheduleAvatarUpload(uid, dataUrl){
    if(!uid || !isBase64Img(dataUrl)) return;
    if(_uploading[uid]) return;
    _uploading[uid]=true;
    setTimeout(function(){ uploadAvatarViaWorker(uid, dataUrl); }, 50);
  }

  function uploadAvatarViaWorker(uid, dataUrl){
    var cfg = (global.LiderCRM && global.LiderCRM.config) || {};
    var S   = global.S;
    if(!cfg.useWorkerApi){ _uploading[uid]=false; return; }
    try{
      var arr=dataUrl.split(','), m=arr[0].match(/:(.*?);/);
      var ct=(m?m[1]:null)||'image/jpeg';
      var bstr=atob(arr[1]||arr[0]);
      var bytes=new Uint8Array(bstr.length);
      for(var i=0;i<bstr.length;i++) bytes[i]=bstr.charCodeAt(i);
      var jwt=(S&&(S._workerToken||S.token))||'';
      fetch('/api/v1/upload/binary',{
        method:'POST',
        headers:{
          'Authorization':'Bearer '+jwt,
          'Content-Type':ct,
          'X-Filename':'avatar_'+uid+'.'+((ct.split('/')[1])||'jpg'),
          'X-Folder':'avatares'
        },
        body:bytes.buffer
      })
      .then(function(r){ if(!r.ok) throw new Error('avatar upload '+r.status); return r.json(); })
      .then(function(j){
        var url=j && j.data && j.data.url;
        if(!url) throw new Error('sem url');
        var list = (typeof global.getUsers==='function' ? global.getUsers() : (global.sg&&global.sg('lf6_u'))) || [];
        var found=null;
        for(var i=0;i<list.length;i++) if(list[i] && String(list[i].id)===String(uid)){ found=list[i]; break; }
        if(found){
          found.picUrl = url;
          found.avatarUrl = url;   // compat com leitores legados de avatar
          found.pic = null;
          found.picData = null;
          found.photo = null;
          found.photoData = null;
          found.profilePic = null;
        }
        try{
          if(global.S && String(global.S.userId)===String(uid)){
            global.S.pic = null;
            global.S.profilePic = url;
            if(typeof global.ss==='function') global.ss('lf6_s', global.S);
          }
        }catch(_e){}
        try{ if(_origSave) _origSave(list, uid, { picUrl:url, avatarUrl:url }); else global.ss('lf6_u', list); }catch(_e){}
        try{ localStorage.removeItem('lf13_pic_'+uid); }catch(_e){}
        try{ global.dispatchEvent(new CustomEvent('crm:users-updated',{detail:{reason:'avatar-b2-uploaded',uid:uid,url:url}})); }catch(_e){}
        console.info('[images-b2] avatar '+uid+' → B2 OK', url);
      })
      .catch(function(err){
        console.warn('[images-b2] upload avatar falhou, mantém cache local:', err && err.message);
      })
      .then(function(){ _uploading[uid]=false; });
    }catch(e){
      _uploading[uid]=false;
      console.warn('[images-b2] preparação do upload falhou:', e && e.message);
    }
  }

  /* ---------- 4) Helper público para avatar remoto ---------- */
  global.LF_getAvatarUrl = function(uid){
    var list=(global.sg&&global.sg('lf6_u'))||[];
    for(var i=0;i<list.length;i++){
      if(list[i] && String(list[i].id)===String(uid)){
        return list[i].picUrl || list[i].avatarUrl || '';
      }
    }
    return '';
  };

  /* ---------- 5) Limpeza no boot ---------- */
  try{
    var list=global.sg&&global.sg('lf6_u');
    if(Array.isArray(list)){
      var before=JSON.stringify(list).length;
      sanitizeUsersArray(list);
      var after=JSON.stringify(list).length;
      if(after<before){
        try{ global.ss('lf6_u', list); }catch(_e){}
        console.info('[images-b2] lf6_u purgado: '+before+' → '+after+' bytes ('+(before-after)+' liberados).');
      }
    }
  }catch(_e){}

  console.info('[images-b2] instalado — avatares agora vão para Backblaze via Worker.');
})(window);
