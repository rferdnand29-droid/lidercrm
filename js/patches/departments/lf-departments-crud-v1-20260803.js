/* lf-departments-crud-v1-20260803 | Fase 3.1 e 3.2 — CRUD de Departamentos
 * ---------------------------------------------------------------------
 * Modelo (servidor é a fonte de verdade — ver
 * _worker_src/worker/controllers/departamentos-controller.js):
 *   {
 *     id, nome, descricao, cor, status,          // status: 'ativo'|'inativo'
 *     supervisor_uid, adjunto_uid,               // adjunto = orientador (sem escopo amplo)
 *     createdAt, updatedAt
 *   }
 * "Departamento" não é campo direto em usuários/leads/negócios/clientes —
 * é derivado via team_id -> teams.id -> teams.departamento_id. As funções
 * de membro (assignUserToDept etc.) escondem esse detalhe: por baixo,
 * garantem um time vinculado ao departamento e setam o team_id do
 * usuário. Ver sql/10-schema-departamentos.sql v2.
 * ---------------------------------------------------------------------
 *
 * CHANGELOG
 *   v1.1-20260803 — fix: removeUserFromDept(userId) sempre lançava
 *     "userId e deptId obrigatórios" porque chamava
 *     assignUserToDept(userId, null) e essa função exigia deptId truthy.
 *     Agora só userId é obrigatório; deptId=null é tratado como remoção.
 *   v1.2-20260803 (primeira adição) — assignUsersToDept em lote.
 *   v1.3-20260803 — FIX CRÍTICO: todas as operações de escrita
 *     (create/update/remove/assign*) chamavam workerClient.saveDocument()/
 *     getDocument(), uma API que NÃO EXISTE no workerClient real deste
 *     app (só tem list/get/create/update/remove por nome de recurso, e
 *     só pra recursos com rota registrada — departamentos/teams/members
 *     não tinham rota nenhuma até hoje). Resultado: TODO departamento
 *     criado por este módulo, desde sempre, só existiu no localStorage
 *     do navegador que criou — nunca foi persistido de verdade.
 *     Departamentos criados ANTES desta versão precisam ser recriados.
 *     Agora as escritas são assíncronas de verdade (retornam Promise) e
 *     chamam as rotas novas (/api/v1/departamentos e /api/v1/departamentos/
 *     members, ver departamentos-controller.js). localStorage virou só
 *     cache de LEITURA (list()/get() continuam síncronos, mas podem
 *     estar desatualizados até o primeiro refresh() completar — chamado
 *     automaticamente no boot deste módulo).
 * ---------------------------------------------------------------------
 */
(function(global){
  'use strict';
  if(global.__LF_DEPARTMENTS_CRUD_V1__)return;
  global.__LF_DEPARTMENTS_CRUD_V1__=true;

  var TAG='[lf-departments]';
  var LS_KEY='lf_departments_v1';

  function _log(){try{console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _wc(){
    var root=global.LiderCRM;
    return (root && root.api && root.api.workerClient) || global.workerClient || null;
  }
  function _uid(){ return (global.S && global.S.userId) || null; }
  function _now(){ return new Date().toISOString(); }

  function _readAllCache(){
    try{
      var raw=localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(_e){ return []; }
  }
  function _writeAllCache(list){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(list||[])); }
    catch(_e){ _warn('falha ao gravar cache local', _e); }
  }

  /* Normaliza o formato vindo do servidor (snake_case + created_at/
     updated_at) para o formato já usado pelo cache local
     (createdAt/updatedAt), sem duplicar os campos originais. */
  function _fromServerShape(row){
    if(!row) return row;
    var out=Object.assign({}, row);
    if(row.created_at && !out.createdAt) out.createdAt=row.created_at;
    if(row.updated_at && !out.updatedAt) out.updatedAt=row.updated_at;
    return out;
  }

  /* Resposta crua de wc.list/create/update ainda não é desembrulhada
     (o workerClient real devolve {ok,status,data:{ok,data,meta}} pro
     CRUD genérico — diferente dos métodos dedicados, que já vêm com
     .then(pickData)). Uma função só pra não repetir isso em toda call. */
  function _unwrap(res){
    return (res && res.ok && res.data && res.data.data!==undefined) ? res.data.data : null;
  }

  function list(){ return _readAllCache(); }
  function get(id){
    var all=_readAllCache();
    for(var i=0;i<all.length;i++) if(all[i].id===id) return all[i];
    return null;
  }

  /* Busca a lista real do backend e atualiza o cache local. Chamado
     automaticamente no boot deste módulo (best-effort) — chame de novo
     manualmente (LF_DEPARTMENTS.refresh()) depois de mudanças feitas
     por outra pessoa/aba, se precisar. */
  function refresh(){
    var wc=_wc();
    if(!wc || typeof wc.list!=='function'){
      _warn('sem workerClient — mantendo cache local');
      return Promise.resolve(_readAllCache());
    }
    return Promise.resolve(wc.list('departamentos'))
      .then(function(res){
        var rows=_unwrap(res);
        if(!Array.isArray(rows)) throw new Error('resposta inesperada ao listar departamentos');
        var normalized=rows.map(_fromServerShape);
        _writeAllCache(normalized);
        _log('refresh OK —', normalized.length, 'departamento(s)');
        return normalized;
      })
      .catch(function(err){
        _warn('refresh falhou, mantendo cache local (pode estar desatualizado):', err);
        return _readAllCache();
      });
  }

  function create(input){
    input=input||{};
    if(!input.nome) return Promise.reject(new Error('nome do departamento obrigatório'));
    var wc=_wc();
    if(!wc || typeof wc.create!=='function'){
      return Promise.reject(new Error('workerClient indisponível — não é possível criar departamento sem backend'));
    }
    var payload={
      nome:String(input.nome).trim(),
      descricao:input.descricao||'',
      cor:input.cor||'#3b82f6',
      status:input.status||'ativo',
      supervisorUid:input.supervisor_uid||null,
      adjuntoUid:input.adjunto_uid||null
    };
    return Promise.resolve(wc.create('departamentos', payload)).then(function(res){
      var row=_unwrap(res);
      if(!row) throw new Error('resposta inesperada do servidor ao criar departamento');
      var dept=_fromServerShape(row);
      var all=_readAllCache(); all.push(dept); _writeAllCache(all);
      if(global.LF_AUDIT && typeof global.LF_AUDIT.log==='function'){
        global.LF_AUDIT.log('department.create',{deptId:dept.id, nome:dept.nome});
      }
      _log('departamento criado (persistido no backend):', dept.id, dept.nome);
      return dept;
    });
  }

  function update(id, patch){
    var wc=_wc();
    if(!wc || typeof wc.update!=='function'){
      return Promise.reject(new Error('workerClient indisponível — não é possível editar departamento sem backend'));
    }
    var body={};
    if(patch && typeof patch.nome==='string') body.nome=patch.nome;
    if(patch && typeof patch.descricao==='string') body.descricao=patch.descricao;
    if(patch && typeof patch.cor==='string') body.cor=patch.cor;
    if(patch && typeof patch.status==='string') body.status=patch.status;
    if(patch && 'supervisor_uid' in patch) body.supervisorUid=patch.supervisor_uid;
    if(patch && 'adjunto_uid' in patch) body.adjuntoUid=patch.adjunto_uid;
    return Promise.resolve(wc.update('departamentos', id, body)).then(function(res){
      var row=_unwrap(res);
      if(!row) throw new Error('departamento não encontrado ou resposta inesperada: '+id);
      var dept=_fromServerShape(row);
      var all=_readAllCache();
      var idx=-1;
      for(var i=0;i<all.length;i++) if(all[i].id===id){ idx=i; break; }
      if(idx>=0) all[idx]=dept; else all.push(dept);
      _writeAllCache(all);
      _log('departamento atualizado (persistido no backend):', id);
      return dept;
    });
  }

  function remove(id){
    var wc=_wc();
    if(!wc || typeof wc.remove!=='function'){
      return Promise.reject(new Error('workerClient indisponível — não é possível excluir departamento sem backend'));
    }
    return Promise.resolve(wc.remove('departamentos', id)).then(function(res){
      if(!res || !res.ok) throw new Error('falha ao excluir departamento no servidor: '+id);
      var all=_readAllCache();
      var next=all.filter(function(d){ return d.id!==id; });
      _writeAllCache(next);
      if(global.LF_AUDIT && typeof global.LF_AUDIT.log==='function'){
        global.LF_AUDIT.log('department.remove',{deptId:id});
      }
      _log('departamento removido (persistido no backend):', id);
      return true;
    });
  }

  /* --------- Membros --------- */
  /* FIX v1.3-20260803: agora chama de verdade o endpoint
     /api/v1/departamentos/members (POST=atribuir em lote,
     DELETE=remover um). deptId=null vira remoção (loop client-side,
     já que o endpoint de remoção é sempre 1 usuário por vez). */
  function assignUsersToDept(userIds, deptId){
    if(!Array.isArray(userIds) || !userIds.length){
      return Promise.reject(new Error('userIds deve ser um array não-vazio'));
    }
    var wc=_wc();
    if(!wc){
      return Promise.reject(new Error('workerClient indisponível'));
    }

    var p;
    if(deptId){
      if(typeof wc.assignDepartamentoMembers!=='function'){
        return Promise.reject(new Error('workerClient sem assignDepartamentoMembers — atualize o worker-client.js'));
      }
      p=Promise.resolve(wc.assignDepartamentoMembers(deptId, userIds)).then(function(data){
        return data || {ok:[], failed:userIds.map(function(u){return {userId:u,error:'sem resposta'};}), total:userIds.length};
      });
    }else{
      if(typeof wc.removeDepartamentoMember!=='function'){
        return Promise.reject(new Error('workerClient sem removeDepartamentoMember — atualize o worker-client.js'));
      }
      var okIds=[], failed=[];
      p=userIds.reduce(function(chain, userId){
        return chain.then(function(){
          return Promise.resolve(wc.removeDepartamentoMember(userId))
            .then(function(){ okIds.push(userId); })
            .catch(function(err){ failed.push({userId:userId, error:String(err && err.message || err)}); });
        });
      }, Promise.resolve()).then(function(){
        return {ok:okIds, failed:failed, total:userIds.length};
      });
    }

    return p.then(function(result){
      if(global.LF_AUDIT && typeof global.LF_AUDIT.log==='function'){
        global.LF_AUDIT.log(deptId ? 'user.department.assign_bulk' : 'user.department.remove_bulk',
                             {userIds:result.ok, deptId:deptId, failedCount:(result.failed||[]).length});
      }
      _log('atribuição em lote:', result.ok.length, 'ok,', (result.failed||[]).length, 'falhas',
           deptId?('-> '+deptId):'(remoção)');
      return result;
    });
  }

  function assignUserToDept(userId, deptId){
    if(!userId) return Promise.reject(new Error('userId obrigatório'));
    return assignUsersToDept([userId], deptId||null).then(function(result){
      if(result.failed && result.failed.length){
        throw new Error(result.failed[0].error || 'falha ao atribuir usuário');
      }
      return true;
    });
  }
  function removeUserFromDept(userId){
    return assignUserToDept(userId, null);
  }

  /* Lista usuários com o departamento já resolvido (join feito no
     servidor — ver listDepartamentoMembers em departamentos-controller.js). */
  function listMembers(){
    var wc=_wc();
    if(!wc || typeof wc.listDepartamentoMembers!=='function'){
      return Promise.reject(new Error('workerClient sem listDepartamentoMembers — atualize o worker-client.js'));
    }
    return Promise.resolve(wc.listDepartamentoMembers()).then(function(data){
      return data || [];
    });
  }

  global.LF_DEPARTMENTS = {
    version:'v1.3-20260803',
    list:list, get:get, create:create, update:update, remove:remove,
    refresh:refresh,
    assignUserToDept:assignUserToDept,
    removeUserFromDept:removeUserFromDept,
    assignUsersToDept:assignUsersToDept,
    listMembers:listMembers,
    diag:function(){
      var all=_readAllCache();
      return {
        count:all.length,
        ativos:all.filter(function(d){return d.status==='ativo';}).length,
        semSupervisor:all.filter(function(d){return !d.supervisor_uid;}).length,
        hasWorker:!!_wc(),
        hasRealApi:!!(_wc() && typeof _wc().create==='function' && typeof _wc().assignDepartamentoMembers==='function')
      };
    }
  };

  /* Boot: tenta sincronizar do backend assim que o workerClient estiver
     disponível (best-effort, algumas tentativas — o workerClient pode
     ainda não ter sido montado no exato momento em que este script
     carrega). Não bloqueia nada; list()/get() continuam funcionando
     com o que já estiver no cache local enquanto isso. */
  (function _bootRefresh(retries){
    var wc=_wc();
    if(wc && typeof wc.list==='function'){
      /* FIX 2026-08-04 (hotfix 401): só lista departamentos depois do JWT
         sincronizado (lf:worker-token-synced) — antes disso todo request
         voltava 401. Gate em js/patches/lf-when-worker-auth. */
      if(typeof global.LF_WHEN_WORKER_AUTH==='function'){ global.LF_WHEN_WORKER_AUTH(refresh); }
      else{ refresh(); }
      return;
    }
    if(retries<=0) return;
    setTimeout(function(){ _bootRefresh(retries-1); }, 500);
  })(20);

  _log('v1.3-20260803 pronto');
})(window);
