/* lf-fix-adm-password-reset-logout-v1-20260803 | reset de senha por admin + revogacao de sessao
 *
 * CHANGELOG
 *   v1.1-20260803 — fix: no primeiro reset de senha feito por um dado
 *     admin/dispositivo contra um usuário-alvo, a sessão do alvo NÃO
 *     era derrubada (colisão de baseline 1==1 entre o dispositivo do
 *     admin e o do usuário-alvo). Corrigido: _saveSessionRevocation
 *     agora lê a versão remota real antes de incrementar, e o baseline
 *     "sem revogação" passa a ser 0 em vez de 1. Ver comentários inline.
 */
(function(global){
  'use strict';
  if(global.__LF_FIX_ADM_PASSWORD_RESET_LOGOUT_V1__)return;
  global.__LF_FIX_ADM_PASSWORD_RESET_LOGOUT_V1__=true;

  var TAG='[lf-fix-adm-pw-reset]';
  var POLL_INTERVAL=30000; /* 30s */
  var _pollTimer=null;

  function _log(){try{if(global.console&&console.debug)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{if(global.console&&console.warn)console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _uid(){ return (global.S && global.S.userId) || null; }
  function _isAdmin(){
    if(!global.S)return false;
    return global.S.role==='admin' || global.S.isAdmin===true ||
           global.S.role==='administrador' || global.S.userType==='admin';
  }
  function _wc(){
    var root=global.LiderCRM;
    return (root && root.api && root.api.workerClient) || global.workerClient || null;
  }

  function _pwVersionKey(uid){ return 'lf_pw_version_'+uid; }
  function _pwChangedAtKey(uid){ return 'lf_pw_changed_at_'+uid; }

  function _getLocalPwVersion(uid){
    try{ return parseInt(localStorage.getItem(_pwVersionKey(uid))||'0',10); }catch(_e){ return 0; }
  }
  function _setLocalPwVersion(uid, ver){
    try{
      localStorage.setItem(_pwVersionKey(uid), String(ver));
      localStorage.setItem(_pwChangedAtKey(uid), new Date().toISOString());
    }catch(_e){}
  }
  function _getLocalPwChangedAt(uid){
    try{ return localStorage.getItem(_pwChangedAtKey(uid))||null; }catch(_e){ return null; }
  }

  /* FIX v1.1-20260803: a versão anterior incrementava a partir do cache
     LOCAL do dispositivo que está fazendo o reset (o admin), não da
     versão remota real do usuário-alvo. Como o dispositivo do admin
     tipicamente nunca tinha visto aquele uid antes, ele também partia de
     0→1 — o mesmo valor "1" que o dispositivo do próprio usuário-alvo já
     assume como baseline ao logar sem revogação prévia (ver _wrapLogin).
     Resultado: no PRIMEIRO reset feito por um dado admin/dispositivo,
     remoto(1) == local(1) e o polling nunca detectava a revogação — a
     sessão do usuário-alvo não era derrubada. Agora lemos a versão
     remota atual antes de incrementar, e o baseline "sem revogação"
     passa a ser 0 (não 1) em todo o arquivo, então a primeira revogação
     sempre resulta em remoto(1) > local(0). */
  function _saveSessionRevocation(uid){
    var wc=_wc();
    if(!wc||typeof wc.saveDocument!=='function'){
      _warn('sem worker — revogação só local:', uid);
      return;
    }

    var readRemoteVer;
    if(typeof wc.getDocument==='function'){
      readRemoteVer=Promise.resolve()
        .then(function(){ return wc.getDocument('user_session_rev/'+uid); })
        .then(function(doc){ return (doc && doc.passwordVersion) ? parseInt(doc.passwordVersion,10) : 0; })
        .catch(function(){ return _getLocalPwVersion(uid)||0; }); /* fallback degradado */
    }else{
      /* worker sem leitura — não há como saber a verdade remota;
         cai no comportamento antigo (menos confiável) como fallback */
      readRemoteVer=Promise.resolve(_getLocalPwVersion(uid)||0);
    }

    readRemoteVer.then(function(remoteVer){
      var localVer=_getLocalPwVersion(uid)||0;
      var ver=Math.max(remoteVer, localVer)+1;
      _setLocalPwVersion(uid, ver);

      var payload={
        uid:uid,
        revokedAt:new Date().toISOString(),
        passwordVersion:ver,
        revokedBy:_uid()
      };
      return Promise.resolve()
        .then(function(){ return wc.saveDocument('user_session_rev/'+uid, payload); })
        .then(function(){ _log('revogação de sessão salva no backend:', uid, 'v'+ver); });
    }).catch(function(err){
      _warn('save de revogação falhou (será reenviado)', err);
      setTimeout(function(){ _saveSessionRevocation(uid); }, 5000);
    });
  }

  function _forceLogout(reason){
    _log('logout forçado:', reason);
    try{
      ['session_token','auth_token','token','sid','_sid',
       'lf_session','user_session','crm_session'].forEach(function(key){
        try{ localStorage.removeItem(key); }catch(_e){}
        try{ sessionStorage.removeItem(key); }catch(_e){}
      });
      if(global.S){
        global.S.userId=null;
        global.S.token=null;
        global.S.role=null;
        global.S.isAdmin=false;
      }
    }catch(_e){}

    var logoutFns=['logout','_logout','doLogout','_doLogout',
                   'signOut','_signOut','clearSession','_clearSession',
                   'resetSession','_resetSession'];
    logoutFns.forEach(function(fn){
      if(typeof global[fn]==='function'){
        try{ global[fn].call(global); }catch(_e){}
      }
    });

    setTimeout(function(){
      var msg = reason==='password_changed'
        ? 'Sua senha foi alterada. Por favor, faça login novamente com a nova senha.'
        : 'Sua sessão foi encerrada. Faça login novamente.';
      try{ alert(msg); }catch(_e){}

      var loginRoutes=['#login','#/login','/#login','login.html','/login',
                       '#auth','#/auth'];
      var navigated=false;

      ['showLogin','_showLogin','goToLogin','_goToLogin',
       'showLoginScreen','_showLoginScreen','navigateToLogin',
       '_navigateToLogin','showAuth','_showAuth'].forEach(function(fn){
        if(typeof global[fn]==='function' && !navigated){
          try{ global[fn].call(global); navigated=true; }catch(_e){}
        }
      });

      if(!navigated){
        for(var i=0;i<loginRoutes.length;i++){
          var r=loginRoutes[i];
          if(r.charAt(0)==='#'){
            global.location.hash=r;
            break;
          }else if(r.indexOf('.html')>=0){
            global.location.href=r;
            break;
          }else{
            global.location.pathname=r;
            break;
          }
        }
        if(!navigated) setTimeout(function(){ global.location.reload(); }, 500);
      }
    },300);
  }

  function _checkSessionRevocation(){
    var uid=_uid();
    if(!uid)return; /* não logado */

    var wc=_wc();
    if(!wc||typeof wc.getDocument!=='function'){
      return;
    }

    Promise.resolve()
      .then(function(){ return wc.getDocument('user_session_rev/'+uid); })
      .then(function(doc){
        if(!doc)return;
        var remoteVer=parseInt(doc.passwordVersion||'0',10);
        var remoteAt=doc.revokedAt;
        var localVer=_getLocalPwVersion(uid);

        if(remoteVer > localVer){
          _log('revogação detectada via polling: remote v'+remoteVer+
               ' > local v'+localVer);
          _setLocalPwVersion(uid, remoteVer);
          _forceLogout('password_changed');
        }
      })
      .catch(function(_err){
      });
  }

  function _startPolling(){
    if(_pollTimer)return;
    _pollTimer=setInterval(_checkSessionRevocation, POLL_INTERVAL);
    _log('polling de revogação ativo (',POLL_INTERVAL+'ms)');
  }
  function _stopPolling(){
    if(_pollTimer){ clearInterval(_pollTimer); _pollTimer=null; }
  }

  function _wrapChangePassword(){
    /* FIX 2026-08-04: changeMyPassword (configuracoes.js) é a função real
       de troca da própria senha no build atual; changePassword agora é um
       alias global criado pelo bootstrap (lf-bootstrap-fn-aliases) — ambos
       entram na lista para o wrapper de revogação de sessão pegar os dois
       caminhos (self-change e admin reset). */
    var fnNames=['changePassword','_changePassword',
                 'alterarSenha','_alterarSenha',
                 'resetPassword','_resetPassword',
                 'updatePassword','_updatePassword',
                 'setPassword','_setPassword',
                 'adminResetPassword','_adminResetPassword',
                 'userChangePassword','_userChangePassword',
                 'changeMyPassword','_changeMyPassword'];

    fnNames.forEach(function(fname){
      if(typeof global[fname]!=='function')return;
      if(global[fname].__lfAdmPwWrapped)return;

      var orig=global[fname];
      var wrapped=function(){
        var args=[].slice.call(arguments);

        var targetUid=null, currentPw=null, newPw=null;
        var isObjectForm=false;

        if(args.length>=1 && typeof args[0]==='object' && args[0]!==null){
          var obj=args[0];
          targetUid=obj.uid || obj.userId || obj.id || _uid();
          currentPw=obj.currentPassword || obj.senhaAtual || obj.oldPassword || null;
          newPw=obj.newPassword || obj.novaSenha || obj.password || null;
          isObjectForm=true;
        }else{
          if(_isAdmin() && args.length>=2){
            if(typeof args[0]==='string' && args[0]!==_uid()){
              targetUid=args[0];
              if(args.length>=3){
                currentPw=null; /* ignora senha atual para admin */
                newPw=args[2];
              }else{
                newPw=args[1];
              }
            }else{
              targetUid=_uid();
              currentPw=args[0];
              newPw=args[1];
            }
          }else{
            targetUid=_uid();
            currentPw=args[0];
            newPw=args[1];
          }
        }

        var adminResettingOther = _isAdmin() && targetUid && targetUid!==_uid();

        if(adminResettingOther){
          _log('admin resetando senha de outro usuário:', targetUid);
          if(isObjectForm){
            if(args[0].currentPassword!==undefined) args[0].currentPassword=null;
            if(args[0].senhaAtual!==undefined) args[0].senhaAtual=null;
            if(args[0].oldPassword!==undefined) args[0].oldPassword=null;
            args[0].adminReset=true;
            args[0].forceReset=true;
          }else{
            args=[targetUid, null, newPw];
            if(orig.length===2){
              args=[targetUid, newPw];
            }
          }
        }

        var ret;
        try{ ret=orig.apply(this, args); }
        catch(err){
          _warn(fname,'original throw:',err);
          throw err;
        }

        var promise=ret;
        if(ret && typeof ret.then==='function'){
          promise=ret;
        }else{
          promise=Promise.resolve(ret);
        }

        promise.then(function(){
          _log('senha alterada com sucesso para uid:', targetUid);
          _saveSessionRevocation(targetUid);

          if(targetUid===_uid()){
            _log('própria senha alterada — logout imediato');
            setTimeout(function(){ _forceLogout('password_changed'); }, 600);
          }else{
            _log('admin resetou senha de outro — sessões alvo serão revogadas via polling');
          }
        }).catch(function(err){
          _warn('changePassword falhou, sem revogação:', err);
        });

        return ret;
      };

      try{
        var keys=Object.keys(orig);
        for(var k=0;k<keys.length;k++){
          if(keys[k].indexOf('__lf')===0) wrapped[keys[k]]=orig[keys[k]];
        }
      }catch(_e){}
      wrapped.__lfAdmPwWrapped=true;
      global[fname]=wrapped;
      _log('wrapper instalado em', fname);
    });
  }

  function _wrapLogin(){
    var fnNames=['login','_login','doLogin','_doLogin',
                 'authenticate','_authenticate','signIn','_signIn',
                 'authUser','_authUser'];

    fnNames.forEach(function(fname){
      if(typeof global[fname]!=='function')return;
      if(global[fname].__lfAdmPwLoginWrapped)return;

      var orig=global[fname];
      var wrapped=function(){
        var ret=orig.apply(this,arguments);
        var promise=ret;
        if(ret && typeof ret.then==='function'){
          promise=ret;
        }else{
          promise=Promise.resolve(ret);
        }
        promise.then(function(){
          var uid=_uid();
          if(!uid)return;
          var wc=_wc();
          /* FIX v1.1-20260803: baseline "sem revogação" agora é 0, não 1.
             Com baseline 1 aqui, o primeiro reset feito por um admin
             (que também parte de 0→1) empatava com este valor e o
             polling nunca detectava a revogação. Ver _saveSessionRevocation. */
          if(!wc||typeof wc.getDocument!=='function'){
            _setLocalPwVersion(uid, 0);
            _startPolling();
            return;
          }
          Promise.resolve()
            .then(function(){ return wc.getDocument('user_session_rev/'+uid); })
            .then(function(doc){
              if(doc && doc.passwordVersion){
                _setLocalPwVersion(uid, parseInt(doc.passwordVersion,10));
                _log('pwVersion sincronizado no login:', uid, 'v'+doc.passwordVersion);
              }else{
                _setLocalPwVersion(uid, 0);
              }
              _startPolling();
            })
            .catch(function(){
              _setLocalPwVersion(uid, 0);
              _startPolling();
            });
        }).catch(function(){});
        return ret;
      };

      try{
        var keys=Object.keys(orig);
        for(var k=0;k<keys.length;k++){
          if(keys[k].indexOf('__lf')===0) wrapped[keys[k]]=orig[keys[k]];
        }
      }catch(_e){}
      wrapped.__lfAdmPwLoginWrapped=true;
      global[fname]=wrapped;
      _log('wrapper login instalado em', fname);
    });
  }

  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='visible'){
      _checkSessionRevocation();
    }
  },{passive:true});
  document.addEventListener('resume',function(){
    _checkSessionRevocation();
  },{passive:true});

  function _install(){
    _wrapChangePassword();
    _wrapLogin();

    var found=false;
    ['changePassword','_changePassword','alterarSenha','_alterarSenha',
     'resetPassword','_resetPassword','updatePassword','_updatePassword',
     'setPassword','_setPassword'].forEach(function(fn){
      if(typeof global[fn]==='function' && global[fn].__lfAdmPwWrapped) found=true;
    });

    if(!found){
      _install._retries=(_install._retries||0)+1;
      if(_install._retries<40){ setTimeout(_install,250); return; }
      /* FIX 2026-08-04: com o alias changePassword/changeMyPassword do
         bootstrap na lista, não chegar aqui é o esperado. Se chegar, debug
         (não warn) — polling de revogação continua ativo independente. */
      _log('nenhuma função de changePassword encontrada após 40 tentativas — polling segue ativo');
    }

    if(_uid()) _startPolling();

    _log('v1-20260803 ativo:',{isAdmin:_isAdmin(),
          uid:_uid(),
          pwVersion:_uid()?_getLocalPwVersion(_uid()):null});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{
    _install();
  }

  global.LF_FIX_ADM_PW_RESET = {
    version:'v1.1-20260803',
    isAdmin:_isAdmin,
    getPwVersion:function(uid){ return _getLocalPwVersion(uid||_uid()); },
    forceRevoke:function(uid){ _saveSessionRevocation(uid||_uid()); },
    forceLogout:_forceLogout,
    checkNow:_checkSessionRevocation,
    startPolling:_startPolling,
    stopPolling:_stopPolling,
    diag:function(){
      var uid=_uid();
      return {
        isAdmin:_isAdmin(),
        uid:uid,
        pwVersion:uid?_getLocalPwVersion(uid):null,
        pwChangedAt:uid?_getLocalPwChangedAt(uid):null,
        polling:!!_pollTimer,
        hasWorker:!!_wc()
      };
    }
  };
})(window);
