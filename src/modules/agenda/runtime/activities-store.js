(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var agenda = modules.agenda = modules.agenda || {};

  // ============================================================
  // CORREÇÃO (2026-07-21, caça-bugs agenda — família activities):
  // Aplica o MESMO padrão já usado em agenda_slots (ver js/agenda.js
  // _agdPollOnce / agdDoSave):
  //
  //   1) Marcar cada item novo/editado com _pending:true e nunca
  //      deixar uma gravação concorrente sobrescrever um item
  //      pendente ainda não confirmado.
  //   2) Trocar o modelo de "sobrescrever lista inteira" por um
  //      MERGE (comparando por id) antes de cada saveActivities /
  //      saveAtividadesList.
  //   3) SERIALIZAR as gravações (uma fila/mutex simples) para que
  //      checkUpcomingActs (roda a cada 60s) nunca salve
  //      concorrentemente com uma criação/edição em andamento.
  //
  // Sintoma antes do fix: uma atividade criada e ainda com POST em
  // voo era apagada da tela e do localStorage quando o tick de 60s
  // do checkUpcomingActs (ou um bulk-edit paralelo) chamava
  // saveActivities(list) com uma cópia "velha" da lista — a mesma
  // classe de bug que já foi corrigida em agenda_slots.
  // ============================================================

  function actKey(){ return 'lf13_acts_' + global.S.userId; }
  function actKeyFor(uid){ return 'lf13_acts_' + uid; }
  function getActivities(){ return global.sg(actKey()) || []; }
  function getActivitiesLocalFor(uid){ return global.sg(actKeyFor(uid)) || []; }
  function _agdWorkerClient(){
    var wc = root && root.api && root.api.workerClient;
    return (root && root.config && root.config.useWorkerApi && wc && typeof wc.saveAtividadesList === 'function') ? wc : null;
  }

  // ---------- (1) Estado do "_pending" ----------
  // Mapa uid -> { id -> true }: ids de atividades que foram
  // criadas/editadas localmente e ainda não tiveram confirmação
  // do backend. Sobreviver a um refresh não é necessário aqui
  // (o cache local já contém o item com _pending:true — ver
  // _annotatePending) — este mapa em memória só existe pra
  // consulta rápida durante a sessão.
  var _pendingByUid = Object.create(null);

  function _getPendingSet(uid){
    if (!uid) return null;
    var s = _pendingByUid[uid];
    if (!s) { s = _pendingByUid[uid] = Object.create(null); }
    return s;
  }
  function _markPending(uid, ids){
    var s = _getPendingSet(uid);
    if (!s || !ids) return;
    (Array.isArray(ids) ? ids : [ids]).forEach(function(id){
      if (id) s[id] = true;
    });
  }
  function _clearPending(uid, ids){
    var s = _pendingByUid[uid];
    if (!s || !ids) return;
    (Array.isArray(ids) ? ids : [ids]).forEach(function(id){
      if (id && s[id]) delete s[id];
    });
  }
  function _hasPending(uid){
    var s = _pendingByUid[uid];
    if (!s) return false;
    for (var k in s) { if (s[k]) return true; }
    return false;
  }
  function _pendingIds(uid){
    var s = _pendingByUid[uid];
    if (!s) return [];
    return Object.keys(s);
  }

  // Anota _pending:true na cópia em memória/local dos itens da lista
  // atual (comparando com uma "base" — a lista anterior — pra saber
  // quais mudaram). Só usado no fluxo saveActivities/lfSaveActivitiesFor
  // (o item que o chamador está tentando gravar agora).
  function _annotatePending(uid, list, changedIds){
    if (!Array.isArray(list)) return list;
    var idSet = Object.create(null);
    (Array.isArray(changedIds) ? changedIds : []).forEach(function(id){
      if (id) idSet[id] = true;
    });
    if (Object.keys(idSet).length === 0) return list;
    _markPending(uid, Object.keys(idSet));
    for (var i = 0; i < list.length; i++){
      var a = list[i];
      if (a && a.id && idSet[a.id]) {
        list[i] = Object.assign({}, a, { _pending: true });
      }
    }
    return list;
  }

  // ---------- (2) Merge por id ----------
  // Regra: para cada id, se estiver marcado como _pending no set
  // desta sessão E existir na "incoming" (nova lista chegando ao
  // save), a versão da incoming vence (é a mais recente ação do
  // usuário) — mas se NÃO estiver na incoming e existir no cache
  // atual como _pending, preserva o item do cache (é uma escrita
  // otimista que a incoming perdeu por estar desatualizada).
  function _mergeById(uid, incoming, current){
    var inc = Array.isArray(incoming) ? incoming : [];
    var cur = Array.isArray(current) ? current : [];
    var byId = Object.create(null);
    var order = [];

    // 1) começa com o que veio como "incoming" (é a lista que o
    //    chamador quer gravar — normalmente já contém as edições
    //    mais recentes que ele fez).
    inc.forEach(function(a){
      if (!a) return;
      var id = a.id;
      if (!id){ order.push(a); return; } // sem id: mantém posicional
      if (!(id in byId)) order.push(id);
      byId[id] = a;
    });

    // 2) para cada item do cache atual que NÃO está na incoming,
    //    se estiver marcado como _pending, preserva (senão perde-
    //    ríamos uma escrita otimista concorrente). Se NÃO estiver
    //    _pending, era um item que a incoming deliberadamente
    //    removeu (ex.: deleteActBulk) — não recoloca.
    var pendingSet = _pendingByUid[uid] || null;
    cur.forEach(function(a){
      if (!a || !a.id) return;
      if (a.id in byId) return; // já veio da incoming
      var isPending = (a._pending === true) || (pendingSet && pendingSet[a.id]);
      if (isPending) {
        byId[a.id] = a;
        order.push(a.id);
      }
    });

    // 3) reconstrói lista respeitando a ordem original da incoming
    var out = [];
    var seen = Object.create(null);
    order.forEach(function(k){
      if (typeof k === 'string') {
        if (seen[k]) return;
        seen[k] = true;
        out.push(byId[k]);
      } else {
        out.push(k); // item sem id
      }
    });
    return out;
  }

  // ---------- (3) Mutex/fila de gravação por uid ----------
  // Fila serial por uid: nenhuma gravação começa antes da anterior
  // (do MESMO uid) terminar. Isso garante que checkUpcomingActs()
  // — que roda a cada 60s e chama saveActivities(acts) — nunca
  // conflita com um agdDoSave/actConfirmDone em voo. Além disso,
  // como cada job re-lê o localStorage no momento de rodar (via
  // _mergeById com o cache mais recente), a lista efetivamente
  // gravada nunca "reverte" uma edição pendente.
  var _saveQueues = Object.create(null); // uid -> Promise em cadeia
  function _enqueueSave(uid, job){
    var prev = _saveQueues[uid] || Promise.resolve();
    var next = prev.then(function(){
      try { return job(); } catch(e){ return Promise.reject(e); }
    }, function(){
      // se o job anterior falhou, ainda assim executa o próximo
      try { return job(); } catch(e){ return Promise.reject(e); }
    });
    // Mantém a cadeia mesmo se este job der throw
    _saveQueues[uid] = next.then(function(){}, function(){});
    return next;
  }

  // ---------- helpers públicos ----------
  // Descobre quais ids MUDARAM entre "before" e "after" — inclui
  // adições, remoções e edições de campos relevantes.
  function _diffIds(before, after){
    var b = Object.create(null);
    (Array.isArray(before) ? before : []).forEach(function(a){ if (a && a.id) b[a.id] = a; });
    var changed = [];
    (Array.isArray(after) ? after : []).forEach(function(a){
      if (!a || !a.id) return;
      var prev = b[a.id];
      if (!prev) { changed.push(a.id); return; }
      // compara os campos que o app efetivamente edita
      if (prev.type !== a.type
          || prev.desc !== a.desc
          || prev.scheduledAt !== a.scheduledAt
          || prev.done !== a.done
          || prev.doneAt !== a.doneAt
          || prev.read !== a.read
          || prev.updatedAt !== a.updatedAt) {
        changed.push(a.id);
      }
    });
    return changed;
  }

  // ---------- saveActivities (uid = logado) ----------
  function saveActivities(list){
    var uid = global.S && global.S.userId;
    if (!uid) return;
    list = Array.isArray(list) ? list : [];

    // (2) MERGE com o que já está em disco (pode ter recebido
    // gravação otimista concorrente entre o getActivities() do
    // chamador e este save).
    var current = getActivities();
    var changedIds = _diffIds(current, list);
    var merged = _mergeById(uid, list, current);

    // (1) marca _pending nos itens que este save está mudando —
    // pra que um poll/refetch subsequente não sobrescreva.
    merged = _annotatePending(uid, merged, changedIds);

    // Grava local imediatamente (otimista)
    global.ss(actKey(), merged);

    var wc = _agdWorkerClient();
    var hasFirebase = (global.DB_MODE === 'firebase' && global.db);
    if (!wc && !hasFirebase) return;

    // (3) SERIALIZA o POST remoto: dois saves em voo pra o mesmo
    // uid nunca correm juntos.
    _enqueueSave(uid, function(){
      global.syncBusy();
      // Re-lê o cache local NO MOMENTO da gravação real: se outro
      // save otimista rodou nesse meio-tempo e adicionou itens,
      // eles vão junto.
      var payloadList = getActivities();
      var savePromise = wc
        ? wc.saveAtividadesList(uid, payloadList)
        : global.db.collection('activities').doc(uid).set({ list: payloadList, ts: Date.now() });
      return savePromise.then(function(){
        // confirmação remota: libera o _pending dos ids que este
        // save carregava, e limpa a flag _pending dos itens que
        // ainda estão no cache local com esses ids (só dos que
        // não voltaram a virar pending por outra edição).
        _clearPending(uid, changedIds);
        try {
          var afterCache = getActivities();
          var still = _pendingByUid[uid] || {};
          var mutated = false;
          for (var i = 0; i < afterCache.length; i++){
            var a = afterCache[i];
            if (a && a.id && a._pending && !still[a.id]) {
              var clone = Object.assign({}, a);
              delete clone._pending;
              afterCache[i] = clone;
              mutated = true;
            }
          }
          if (mutated) global.ss(actKey(), afterCache);
        } catch(_e){}
        global.syncOk();
      }).catch(function(err){
        // NÃO limpa _pending: os itens continuam marcados até uma
        // próxima tentativa vencer. Enfileira retry se disponível.
        try {
          if (global.LF && typeof global.LF.enqueueActivities === 'function') {
            global.LF.enqueueActivities(uid, getActivities());
          }
        } catch(_e){}
        global.syncErr(err);
      });
    });
  }

  // ---------- lfSaveActivitiesFor (uid arbitrário, inclusive outro consultor) ----------
  function lfSaveActivitiesFor(uid, list){
    uid = uid || (global.S && global.S.userId);
    list = Array.isArray(list) ? list : [];
    if (!uid) return false;

    // (2) MERGE com o cache do próprio uid — usa a chave dedicada
    // (actKeyFor) porque no fluxo de "criar atividade pra outro
    // consultor" não temos acesso à lista real do outro no
    // localStorage do usuário logado, mas o CHAMADOR já leu do
    // servidor antes (ver agenda.js _loadActivitiesForOwner /
    // ramo assignedToOther) e passou aqui. Ainda assim mergimos
    // com o que estiver em cache local pra não perder itens
    // pendentes desta sessão.
    var currentForUid = getActivitiesLocalFor(uid);
    var changedIds = _diffIds(currentForUid, list);
    var merged = _mergeById(uid, list, currentForUid);
    merged = _annotatePending(uid, merged, changedIds);

    // Grava local em AMBAS as chaves relevantes
    global.ss(actKeyFor(uid), merged);
    if (global.S && uid === global.S.userId) global.ss(actKey(), merged);

    var wc = _agdWorkerClient();
    var hasFirebase = (global.DB_MODE === 'firebase' && global.db);

    if (wc || hasFirebase) {
      // (3) SERIALIZA por uid
      return _enqueueSave(uid, function(){
        global.syncBusy();
        var payloadList = getActivitiesLocalFor(uid);
        var savePromise = wc
          ? wc.saveAtividadesList(uid, payloadList)
          : global.db.collection('activities').doc(uid).set({ list: payloadList, ts: Date.now() });
        return savePromise.then(function(){
          _clearPending(uid, changedIds);
          try {
            var afterCache = getActivitiesLocalFor(uid);
            var still = _pendingByUid[uid] || {};
            var mutated = false;
            for (var i = 0; i < afterCache.length; i++){
              var a = afterCache[i];
              if (a && a.id && a._pending && !still[a.id]) {
                var clone = Object.assign({}, a);
                delete clone._pending;
                afterCache[i] = clone;
                mutated = true;
              }
            }
            if (mutated) {
              global.ss(actKeyFor(uid), afterCache);
              if (global.S && uid === global.S.userId) global.ss(actKey(), afterCache);
            }
          } catch(_e){}
          global.syncOk();
          try {
            if (global.SyncManager && typeof global.SyncManager.drain === 'function') {
              setTimeout(function(){ try { global.SyncManager.drain(); } catch(_e){} }, 60);
            }
          } catch(_e){}
          return true;
        }).catch(function(err){
          try {
            if ((!global.S || uid !== global.S.userId) && global.LF && typeof global.LF.enqueueActivities === 'function') {
              global.LF.enqueueActivities(uid, getActivitiesLocalFor(uid));
            }
          } catch(_e){}
          global.syncErr(err);
          return false;
        });
      });
    }

    // Sem worker nem Firebase: só localStorage + fila de retry
    try {
      if (global.LF && typeof global.LF.enqueueActivities === 'function') global.LF.enqueueActivities(uid, merged);
      if (global.SyncManager && typeof global.SyncManager.start === 'function') global.SyncManager.start();
      if (global.SyncManager && typeof global.SyncManager.drain === 'function') setTimeout(function(){ try { global.SyncManager.drain(); } catch(_e){} }, 60);
    } catch(_e){}
    return true;
  }

  // Expor helpers de "pending" para o resto do app (agenda.js,
  // retry-queue-sync.js e patches) poderem consultar se há
  // pendências antes de fazer overwrites cegos.
  var pendingApi = {
    has: _hasPending,
    ids: _pendingIds,
    mark: _markPending,
    clear: _clearPending,
    mergeById: _mergeById
  };

  /* R14-09: expor funções ao escopo global */
  if(typeof getActivities === 'function') global.getActivities = getActivities;
  if(typeof saveActivities === 'function') global.saveActivities = saveActivities;
  if(typeof getActivitiesLocalFor === 'function') global.getActivitiesLocalFor = getActivitiesLocalFor;

  agenda.runtime = {
    actKey: actKey,
    actKeyFor: actKeyFor,
    getActivities: getActivities,
    getActivitiesLocalFor: getActivitiesLocalFor,
    _agdWorkerClient: _agdWorkerClient,
    saveActivities: saveActivities,
    lfSaveActivitiesFor: lfSaveActivitiesFor,
    // API interna de pending — usada pelos patches de checkUpcomingActs
    pending: pendingApi
  };
})(window);
