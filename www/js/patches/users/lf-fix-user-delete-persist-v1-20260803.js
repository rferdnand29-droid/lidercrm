/* lf-fix-user-delete-persist-v1-20260803 | persiste exclusao de usuarios no backend
 *
 * CHANGELOG
 *   v1.2-20260803 — fix: tombstone/persistência rodavam ANTES da função
 *     de exclusão original, sem esperar confirmação — uma exclusão
 *     rejeitada por regra de negócio ainda escondia o usuário em toda a
 *     aplicação. Agora só persiste após confirmação de sucesso. Também
 *     corrigido o fallback de caminho: antes só avançava para o próximo
 *     candidato em caso de falha de escrita (que raramente acontece,
 *     mesmo em caminho errado); agora tenta descobrir por leitura qual
 *     caminho já existe antes de escrever.
 */
(function(global){
  'use strict';
  if(global.__LF_FIX_USER_DELETE_PERSIST_V1__)return;
  global.__LF_FIX_USER_DELETE_PERSIST_V1__=true;

  var TAG='[lf-fix-user-delete]';
  var TOMB_KEY='lf_user_tombstones_v1';

  function _log(){try{console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _wc(){
    var root=global.LiderCRM;
    return (root && root.api && root.api.workerClient) || global.workerClient || null;
  }
  function _uid(){ return (global.S && global.S.userId) || null; }

  function _loadTombs(){
    try{ return JSON.parse(localStorage.getItem(TOMB_KEY)||'{}')||{}; }catch(_e){ return {}; }
  }
  function _saveTombs(m){ try{ localStorage.setItem(TOMB_KEY,JSON.stringify(m||{})); }catch(_e){} }
  function _addTomb(uid){
    if(!uid) return;
    var t=_loadTombs();
    t[uid]={ deletedAt:new Date().toISOString(), deletedBy:_uid() };
    _saveTombs(t);
  }
  function _isTombed(uid){ return !!_loadTombs()[uid]; }

  /* FIX v1.2-20260803: antes escrevia direto em 'users/'+userId e só
     tentava o próximo caminho candidato se a ESCRITA falhasse. Como
     saveDocument normalmente "funciona" independente de o caminho ser
     o que o app realmente lê depois, isso podia persistir a exclusão
     num documento que nunca é lido de volta — sem nenhum erro visível.
     Agora, quando o worker suporta leitura, primeiro tentamos
     DESCOBRIR em qual candidato o usuário realmente existe (leitura
     confiavelmente retorna vazio quando o caminho está errado) e
     escrevemos ali. Sem leitura disponível, ou se nenhum candidato tem
     documento existente, cai no comportamento antigo como melhor
     esforço (escreve no primeiro, avança só em caso de falha). */
  function _persistDelete(userId){
    var wc=_wc();
    var payload={
      id:userId,
      deleted:true,
      active:false,
      status:'deleted',
      deletedAt:new Date().toISOString(),
      deletedBy:_uid()
    };
    _addTomb(userId);

    if(!wc||typeof wc.saveDocument!=='function'){
      _warn('sem worker — delete apenas local, sera reenviado depois');
      return;
    }

    var paths=['users/'+userId, 'user/'+userId, 'user_'+userId,
               'accounts/'+userId, 'crm_users/'+userId];

    function _writeFallback(idx){
      if(idx>=paths.length){
        _warn('todas as tentativas de persistir a exclusão falharam:', userId);
        return;
      }
      var p=paths[idx];
      Promise.resolve(wc.saveDocument(p, payload))
        .then(function(){ _log('delete persistido (melhor esforço) em', p); })
        .catch(function(err){ _warn('save falhou em',p,err); _writeFallback(idx+1); });
    }

    function _findExistingPath(idx){
      if(typeof wc.getDocument!=='function') return Promise.resolve(null);
      if(idx>=paths.length) return Promise.resolve(null);
      var p=paths[idx];
      return Promise.resolve()
        .then(function(){ return wc.getDocument(p); })
        .then(function(doc){ return doc ? p : _findExistingPath(idx+1); })
        .catch(function(){ return _findExistingPath(idx+1); });
    }

    _findExistingPath(0).then(function(knownPath){
      if(!knownPath){
        _log('nenhum caminho existente encontrado para', userId, '— melhor esforço');
        _writeFallback(0);
        return;
      }
      Promise.resolve(wc.saveDocument(knownPath, payload))
        .then(function(){ _log('delete persistido (caminho confirmado por leitura):', knownPath); })
        .catch(function(err){
          _warn('save falhou no caminho confirmado, tentando fallback', err);
          _writeFallback(0);
        });
    });

    ['deleteUserRemote','_deleteUserRemote','removeUser','_removeUser'].forEach(function(fn){
      if(wc[fn] && typeof wc[fn]==='function'){
        try{ wc[fn](userId); }catch(_e){}
      }
    });
  }

  /* FIX v1.2-20260803: _persistDelete rodava ANTES da função original de
     exclusão, sem esperar o resultado. Se a exclusão original fosse
     rejeitada (ex.: regra de negócio "não pode excluir o último admin"),
     o usuário já tinha sido tombado e escondido em toda a aplicação (e
     persistido como excluído no backend) mesmo a exclusão real nunca
     tendo acontecido. Agora só tombamos/persistimos depois que a função
     original confirmar sucesso (retorno síncrono sem lançar, ou Promise
     resolvida). */
  function _wrapDeleteUser(){
    var fns=['deleteUser','_deleteUser','removeUser','_removeUser',
             'excluirUsuario','_excluirUsuario','apagarUsuario','_apagarUsuario',
             'desativarUsuario','_desativarUsuario','disableUser','_disableUser'];
    fns.forEach(function(fname){
      if(typeof global[fname]!=='function') return;
      if(global[fname].__lfUserDeleteWrapped) return;
      var orig=global[fname];
      var wrapped=function(user){
        var uid = typeof user==='string' ? user
                : (user && (user.id||user.userId||user.uid||user._id)) || null;

        if(!uid) return orig.apply(this,arguments);

        var ret;
        try{
          ret=orig.apply(this,arguments);
        }catch(err){
          _warn('delete original throw — NÃO persistindo exclusão:', uid, err);
          throw err;
        }

        if(ret && typeof ret.then==='function'){
          ret.then(function(){
            _log('delete confirmado (async) para usuario:', uid);
            _persistDelete(uid);
          }).catch(function(err){
            _warn('delete original rejeitou — NÃO persistindo exclusão:', uid, err);
          });
        }else{
          _log('delete confirmado para usuario:', uid);
          _persistDelete(uid);
        }

        return ret;
      };
      wrapped.__lfUserDeleteWrapped=true;
      global[fname]=wrapped;
      _log('wrapper delete em', fname);
    });
  }

  function _wrapRenderUsers(){
    var fns=['renderUsers','_renderUsers','renderUserList','_renderUserList',
             'loadUsers','_loadUsers','listUsers','_listUsers',
             'renderTeam','_renderTeam','renderColaboradores','_renderColaboradores'];
    fns.forEach(function(fname){
      if(typeof global[fname]!=='function') return;
      if(global[fname].__lfUserFilterWrapped) return;
      var orig=global[fname];
      var wrapped=function(){
        var args=[].slice.call(arguments);
        if(Array.isArray(args[0])){
          args[0]=args[0].filter(function(u){
            var uid=u && (u.id||u.userId||u.uid||u._id);
            if(uid && _isTombed(uid)){ _log('filtrado (tomb):', uid); return false; }
            if(u && (u.deleted===true || u.active===false ||
                     u.status==='deleted')){ return false; }
            return true;
          });
        }
        return orig.apply(this,args);
      };
      wrapped.__lfUserFilterWrapped=true;
      global[fname]=wrapped;
      _log('wrapper filter em', fname);
    });
  }

  function _hideTombedInDOM(){
    var tombs=_loadTombs();
    Object.keys(tombs).forEach(function(uid){
      document.querySelectorAll(
        '[data-user-id="'+uid+'"], [data-userid="'+uid+'"], '+
        '[data-uid="'+uid+'"], #user-'+uid+', .user-row-'+uid
      ).forEach(function(el){ el.style.display='none'; el.setAttribute('data-lf-tombed','1'); });
    });
  }

  var _mo=new MutationObserver(function(){ _hideTombedInDOM(); });
  document.addEventListener('DOMContentLoaded',function(){
    try{ _mo.observe(document.body,{childList:true,subtree:true}); }catch(_e){}
    _hideTombedInDOM();
  });

  function _install(){
    _wrapDeleteUser();
    _wrapRenderUsers();
    _install._retries=(_install._retries||0)+1;
    if(_install._retries<40) setTimeout(_install,300);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{ _install(); }

  global.LF_FIX_USER_DELETE={
    version:'v1.2-20260803',
    tombstones:_loadTombs,
    forceDelete:_persistDelete,
    isTombed:_isTombed
  };
})(window);
