/* =====================================================================
 * lf-users-persist-cloudfirst-v1-20260728.js
 * ---------------------------------------------------------------------
 * FIX DEFINITIVO — "usuários cadastrados somem em atualizações futuras
 *                   e perdem dados / deploy sujo"
 *
 * Causas raiz corrigidas (patch ADITIVO — não reescreve nada):
 *   #1  saveUsersLocal() só espelhava na nuvem quando DB_MODE==='firebase'.
 *       Como o projeto está com DB_MODE local (Firebase desligado no
 *       app.html), toda criação/edição de usuário só ia pro localStorage.
 *   #2  loadUsersDB() só puxava do servidor quando DB_MODE==='firebase'.
 *       No boot pós-deploy (cache limpo, APK reinstalado, storage do
 *       WebView zerado) a lista voltava vazia — os usuários "sumiam".
 *   #3  saveUserPatch do UsuariosRepository fazia early-return silencioso
 *       quando workerReady()===false, sem tentar Worker mesmo com Worker
 *       configurado (só faltava sessão hidratada).
 *   #4  createUser() mostrava toast "Usuário criado!" antes da resposta
 *       remota — se o Worker respondesse erro, o admin nunca sabia.
 *
 * Estratégia: envelopamos saveUsersLocal/loadUsersDB/saveUserPatch por
 * versões que SEMPRE tentam o Worker quando ele está disponível
 * (independente de DB_MODE), mantendo o comportamento antigo como
 * fallback. Nada é removido. Compatível com Capacitor.
 *
 * Deploy: carregar por ÚLTIMO no index.html/app.html (depois de
 * usuarios.js, auth.js, worker-client.js, base-repository.js,
 * usuarios-repository.js).
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__lfFixUsersPersistCloudfirstV1) return;
  global.__lfFixUsersPersistCloudfirstV1 = true;
  if (global.__LF_USERS_PERSIST_V1_INSTALLED) return;
  global.__LF_USERS_PERSIST_V1_INSTALLED = true;

  // -------------------------------------------------------------------
  // Helpers de acesso ao stack novo (Worker + httpClient) sem depender
  // de session.isValid(). A sessão pode ainda não ter sido hidratada no
  // boot; o workerClient.request já lida com refresh silencioso.
  // -------------------------------------------------------------------
  function _root(){ return global.LiderCRM || {}; }
  function _cfg(){ return _root().config || {}; }
  function _wc(){ var r=_root(); return (r.api && r.api.workerClient) || null; }
  function _http(){ var r=_root(); return (r.api && r.api.httpClient) || null; }

  // CORRIGIDO 2026-08-01 — bug real: "usuário excluído voltou" (ex.: Maria).
  // Mesma chave de tombstone usada por lf-cacador-3fixes-v1-20260730.js e
  // tools/diagnostico/retire-users-hard-20260730.js — checada aqui de forma
  // independente (não dá pra depender da função desses outros arquivos:
  // este carrega ANTES deles, sem defer). Ver função loadUsersDBPatched
  // abaixo pra onde isso é usado.
  function _isTombstoned(uid){
    try {
      var t = JSON.parse(global.localStorage.getItem('lf_users_tombstones') || '{}');
      return !!(uid && t && Object.prototype.hasOwnProperty.call(t, uid));
    } catch(_e){ return false; }
  }

  // Worker "usável" = configurado + cliente carregado. NÃO exigimos sessão
  // válida aqui: o próprio workerClient.request faz silentRefresh via
  // legacy-bridge (fase 3.2) e retorna erro real se falhar — melhor um
  // erro visível do que um Promise.resolve(null) mudo.
  function _workerUsable(){
    var cfg=_cfg(), wc=_wc();
    return !!(cfg.useWorkerApi && wc && typeof wc.request === 'function');
  }

  // CORREÇÃO 2026-08-03 — toast assustador "Apenas administradores podem
  // criar ou editar usuários" aparecendo pra Supervisor/Consultor.
  // Causa raiz: o servidor (_worker_src/worker/controllers/
  // usuarios-controller.js) exige nível admin em QUALQUER PUT/POST
  // /usuarios, de propósito, sem exceção nem pra o próprio registro —
  // é correção de segurança confirmada (escalação de privilégio via
  // role no body), não bug. O cargo "supervisor" tem adminUI:false
  // (js/auth.js CARGO_CAPS) — ou seja, a rejeição do servidor está
  // certa. O bug real é só no CLIENTE: ele tentava esse PUT mesmo
  // sabendo (via hasAdminAccess(), a mesma checagem que já esconde a
  // aba ADM na UI) que ia ser recusado — e cada tentativa recusada
  // ainda entrava na fila de retry, repetindo o toast sem parar. Não
  // muda NENHUMA permissão real (client nem server) — só evita
  // depender de uma tentativa de rede que já sabemos que vai falhar.
  function _iCanWriteUsuarios(){
    try{ return typeof global.hasAdminAccess==='function' ? !!global.hasAdminAccess() : true; }
    catch(_e){ return true; } // indisponível: não bloqueia, comportamento antigo
  }

  function _workerRequest(path, options){
    var wc=_wc();
    if(!wc || typeof wc.request !== 'function') return Promise.reject(new Error('worker-client-unavailable'));
    return wc.request(path, options||{}).then(function(res){
      if(!res || res.ok===false){
        var msg=(res && res.data && res.data.error && res.data.error.message) || 'worker-request-failed';
        var err=new Error(msg); err.status=res && res.status; throw err;
      }
      return (res.data && res.data.data !== undefined) ? res.data.data : res.data;
    });
  }

  // -------------------------------------------------------------------
  // #1 + #3  saveUsersLocal cloud-first
  // -------------------------------------------------------------------
  // Mantém a assinatura (list, uid, patch) e:
  //   • salva no localStorage (comportamento antigo)
  //   • se Worker usável → dispara PUT /api/v1/usuarios para o registro
  //     alterado (ou POST /usuarios/bulk quando é bulk seed)
  //   • se PUT falhar → enfileira na retry-queue-sync (já existente no
  //     projeto — src/modules/sync/runtime/retry-queue-sync.js) pra
  //     retransmitir quando a rede/sessão voltar. Nada se perde.
  //   • dispara evento 'crm:user-remote-sync' com {ok,uid,error?}
  //     pro createUser mostrar o toast correto (item #4).
  // -------------------------------------------------------------------
  var _origSaveUsersLocal = global.saveUsersLocal;
  function _enqueueRetry(payload){
    try{
      var rq = _root().sync && _root().sync.retryQueue;
      if(rq && typeof rq.enqueue === 'function'){
        rq.enqueue({ kind:'usuarios.upsert', payload: payload, ts: Date.now() });
        return true;
      }
    }catch(_e){}
    // Fallback: guarda em localStorage.lf_users_pending
    try{
      var pend = JSON.parse(localStorage.getItem('lf_users_pending')||'[]');
      pend.push({ payload: payload, ts: Date.now() });
      localStorage.setItem('lf_users_pending', JSON.stringify(pend));
    }catch(_e){}
    return false;
  }

  function _cloudSaveOne(uid, patch){
    if(!_workerUsable() || !uid || !patch) return Promise.resolve({ok:false, skipped:true});
    if(!_iCanWriteUsuarios()) return Promise.resolve({ok:false, skipped:true, reason:'not-admin'});
    var body = Object.assign({}, patch, { id: uid });
    return _workerRequest('/usuarios', { method:'PUT', body: body })
      .then(function(res){
        try{ global.dispatchEvent(new CustomEvent('crm:user-remote-sync',{detail:{ok:true, uid:uid}})); }catch(_e){}
        return { ok:true, data:res };
      })
      .catch(function(err){
        _enqueueRetry({ id: uid, patch: patch });
        try{ global.dispatchEvent(new CustomEvent('crm:user-remote-sync',{detail:{ok:false, uid:uid, error:String(err&&err.message||err)}})); }catch(_e){}
        return { ok:false, error: err };
      });
  }

  function _cloudSaveBulk(list){
    if(!_workerUsable() || !Array.isArray(list) || !list.length) return Promise.resolve({ok:false, skipped:true});
    if(!_iCanWriteUsuarios()) return Promise.resolve({ok:false, skipped:true, reason:'not-admin'});
    var arr = list.filter(function(u){ return u && u.id; });
    if(!arr.length) return Promise.resolve({ok:false, skipped:true});
    return _workerRequest('/usuarios/bulk', { method:'POST', body:{ list: arr } })
      .then(function(res){ return { ok:true, data:res }; })
      .catch(function(err){
        arr.forEach(function(u){ _enqueueRetry({ id: u.id, patch: u }); });
        return { ok:false, error: err };
      });
  }

  function saveUsersLocalPatched(list, uid, patch){
    // 1) Persistência local — via delegate original quando disponível
    //    (mantém dispatch de eventos, syncBusy/syncOk, etc.)
    var localOk;
    if (typeof _origSaveUsersLocal === 'function') {
      localOk = _origSaveUsersLocal(list, uid, patch);
    } else {
      localOk = global.ss('lf6_u', list);
    }

    // 2) Persistência remota via Worker — INDEPENDENTE do DB_MODE.
    //    O original só fazia isso em Firebase; agora fazemos em qualquer
    //    modo desde que o Worker esteja configurado.
    try{
      if (_workerUsable()) {
        if (uid && patch) {
          _cloudSaveOne(uid, patch);      // fire-and-forget, mas com retry
        } else if (Array.isArray(list) && list.length) {
          _cloudSaveBulk(list);
        }
      }
    }catch(err){
      console.warn('[users-persist-v1] cloud save falhou', err);
    }

    return localOk;
  }
  global.saveUsersLocal = saveUsersLocalPatched;
  // Reflete no runtime namespaceado (usado por js/usuarios.js:42 via __usuariosRuntime).
  try{
    var rt = ((_root().modules||{}).usuarios||{}).runtime;
    if (rt) rt.saveUsersLocal = saveUsersLocalPatched;
  }catch(_e){}

  // -------------------------------------------------------------------
  // #2  loadUsersDB cloud-first (independente de DB_MODE)
  // -------------------------------------------------------------------
  var _origLoadUsersDB = global.loadUsersDB;
  function loadUsersDBPatched(cb){
    cb = cb || function(){};
    // Se o Worker está usável, o servidor é a fonte de verdade — sempre
    // consulta, merge com local (preserva itens locais ainda não sincados),
    // grava lf6_u e emite 'crm:users-updated'. Isso resolve o "usuários
    // somem depois do deploy": mesmo com localStorage zerado, o boot
    // hidrata a partir do backend.
    if (_workerUsable()) {
      _workerRequest('/usuarios?mode=legacy-fs', { method:'GET' })
        .then(function(serverList){
          serverList = Array.isArray(serverList) ? serverList.filter(Boolean) : [];
          var local  = global.sg('lf6_u') || [];
          var byId   = {};
          serverList.forEach(function(u){ if(u&&u.id) byId[u.id]=u; });
          // Preserva usuários locais NÃO presentes no servidor (foram
          // criados offline). Empurra pro backend para não perder.
          // EXCETO se estiver tombstoned (excluído/aposentado neste ou
          // em outro dispositivo) — nesse caso, "está local mas não no
          // servidor" significa EXCLUÍDO, não "criado offline", e a
          // versão antiga deste código reenviava a pessoa de volta pro
          // servidor por engano. Ver _isTombstoned() acima.
          local.forEach(function(u){
            if (u && u.id && !byId[u.id]) {
              if (_isTombstoned(u.id)) return; // não preserva, não reenvia
              byId[u.id] = u;
              _cloudSaveOne(u.id, u); // sobe o registro que só existia local
            }
          });
          var merged = Object.keys(byId).map(function(k){ return byId[k]; });
          global.ss('lf6_u', merged);
          try{
            global.dispatchEvent(new CustomEvent('crm:users-updated', {
              detail: { reason:'remote-load', list: merged, ts: Date.now() }
            }));
          }catch(_e){}
          cb(merged);
        })
        .catch(function(err){
          console.warn('[users-persist-v1] GET /usuarios falhou; usando cache local', err);
          // Fallback: comportamento antigo
          if (typeof _origLoadUsersDB === 'function') _origLoadUsersDB(cb);
          else cb(global.sg('lf6_u') || []);
        });
      return;
    }
    // Worker indisponível → comportamento legado
    if (typeof _origLoadUsersDB === 'function') return _origLoadUsersDB(cb);
    cb(global.sg('lf6_u') || []);
  }
  global.loadUsersDB = loadUsersDBPatched;
  try{
    var rt2 = ((_root().modules||{}).usuarios||{}).runtime;
    if (rt2) rt2.loadUsersDB = loadUsersDBPatched;
  }catch(_e){}

  // -------------------------------------------------------------------
  // #4  Feedback correto no createUser() — troca "Usuário criado!"
  //     otimista por confirmação síncrona.
  //     Não sobrescreve createUser (para não quebrar assinatura), apenas
  //     ouve o evento 'crm:user-remote-sync' emitido em (#1) para
  //     mostrar um toast complementar em caso de FALHA remota — o toast
  //     original de "Usuario criado!" continua saindo (para não mudar UX
  //     em caminho feliz), mas se der ruim o admin fica sabendo.
  // -------------------------------------------------------------------
  global.addEventListener('crm:user-remote-sync', function(ev){
    var d = (ev && ev.detail) || {};
    if (d.ok) return;
    if (typeof global.toast === 'function') {
      global.toast('⚠️ Usuário salvo neste aparelho, mas ainda não sincronizado com o servidor. Tentaremos novamente automaticamente. (' + (d.error||'sem detalhe') + ')', 6000);
    }
  });

  // -------------------------------------------------------------------
  // Retry drain — ao voltar online / ao logar, tenta reenviar
  // -------------------------------------------------------------------
  function _drainPending(){
    if (!_workerUsable()) return;
    var pend;
    try{ pend = JSON.parse(localStorage.getItem('lf_users_pending')||'[]'); }catch(_e){ pend=[]; }
    if(!pend.length) return;
    var remaining=[];
    var chain = Promise.resolve();
    pend.forEach(function(item){
      chain = chain.then(function(){
        return _workerRequest('/usuarios', { method:'PUT', body: Object.assign({}, item.payload.patch||{}, { id: item.payload.id }) })
          .catch(function(){ remaining.push(item); });
      });
    });
    chain.then(function(){
      try{ localStorage.setItem('lf_users_pending', JSON.stringify(remaining)); }catch(_e){}
    });
  }
  global.addEventListener('online', _drainPending);
  global.addEventListener('crm:auth-ready', _drainPending);
  setTimeout(_drainPending, 8000); // um empurrão passivo no boot

  console.info('[users-persist-v1] instalado — usuários serão persistidos no backend independentemente de DB_MODE.');
})(window);
