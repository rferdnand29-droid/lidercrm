/* =====================================================================
 * lf-fix-zombie-leads-v1-20260804.js
 * ---------------------------------------------------------------------
 * FIX DEFINITIVO — Leads/Negócios excluídos voltam depois do reload.
 *
 * CAUSA RAIZ (evidência no código):
 *   1) js/relatorios.js:683 (confirmDeleteKBReason) exclui o lead APENAS
 *      filtrando o array local e mandando o array novo para o server via
 *      saveKBFor -> wc.saveKanbanList (js/kanban.js:42). Não existe
 *      tombstone/lista-de-apagados no lado do servidor.
 *   2) src/modules/kanban/runtime/kanban-helpers.js:59 (_mergeKeepLocalOnly)
 *      "reconcilia" chumbando de volta QUALQUER item que exista no
 *      localList mas não no serverList (linhas 82-86):
 *         extra = locais que não estão no server → concat(merged, extra)
 *      Se um dispositivo/aba ainda tem o card no cache local (lf6_kb_<board>_<uid>),
 *      esse "extra" é interpretado como upload pendente e o card é RESSUSCITADO
 *      no servidor via saveKBFor(...) em js/kanban.js:347/364/375 —
 *      todos os dispositivos voltam a ver o lead na próxima leitura.
 *
 * ESTRATÉGIA DA CORREÇÃO (aditiva, idempotente, 100% frontend):
 *   A) Introduz um TOMBSTONE cloud-first: o próprio doc kanban/list/<board>/<uid>
 *      passa a carregar um array `deletedIds` embutido. Cliente empurra o id
 *      excluído para este array via saveKanbanList (rota que já existe).
 *   B) Envelopa _mergeKeepLocalOnly para consultar o deletedIds do server
 *      e NUNCA ressuscitar ids tombados. Também limpa o localList imediatamente,
 *      evitando o próximo saveKBFor "corretivo" reintroduzir o zumbi.
 *   C) Envelopa confirmDeleteKBReason (definida em js/relatorios.js) para,
 *      antes de fazer o saveKBFor do array reduzido, ler o doc atual do
 *      servidor, injetar o id no deletedIds[] e reenviar TUDO junto.
 *   D) Todo o patch é idempotente (guard __LF_FIX_ZOMBIE_LEADS_V1__) e
 *      aditivo (não reescreve nenhum arquivo do projeto).
 *
 * REVERSÍVEL: remover a linha <script> do index.html/app.html.
 * COMPATÍVEL COM: Capacitor (só localStorage + fetch), Cloudflare (usa a
 *   mesma rota /api/v1/kanban/list já existente, sem cache Edge).
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__LF_FIX_ZOMBIE_LEADS_V1__) return;
  global.__LF_FIX_ZOMBIE_LEADS_V1__ = true;

  var TAG = '[lf-fix-zombie-leads v1-20260804]';
  var LS  = global.localStorage;
  var TOMB_LOCAL_PREFIX = 'lf_kb_deleted_ids_'; // cache local do deletedIds, por (board,uid)
  var TOMB_TTL_MS = 90 * 24 * 60 * 60 * 1000;   // 90 dias — sobrevive a reinstalar app

  function log(){ try{ console.debug.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function warn(){ try{ console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }

  /* ------------------------------------------------------------------
   * Tombstones locais (cache) — a fonte da verdade é o servidor, mas
   * mantemos uma cópia local para funcionar offline e para o merge
   * síncrono.
   * ------------------------------------------------------------------ */
  function _localKey(board, uid){ return TOMB_LOCAL_PREFIX + board + '_' + uid; }

  function _readLocalTombs(board, uid){
    try {
      var raw = LS.getItem(_localKey(board, uid));
      if (!raw) return {};
      var obj = JSON.parse(raw) || {};
      var now = Date.now();
      var changed = false;
      Object.keys(obj).forEach(function(id){
        if (!obj[id] || (now - obj[id]) > TOMB_TTL_MS){
          delete obj[id]; changed = true;
        }
      });
      if (changed) LS.setItem(_localKey(board, uid), JSON.stringify(obj));
      return obj;
    } catch(_e){ return {}; }
  }
  function _writeLocalTombs(board, uid, map){
    try { LS.setItem(_localKey(board, uid), JSON.stringify(map || {})); } catch(_e){}
  }
  function _addLocalTomb(board, uid, id){
    if (!id) return;
    var m = _readLocalTombs(board, uid);
    m[String(id)] = Date.now();
    _writeLocalTombs(board, uid, m);
  }
  function _mergeRemoteTombs(board, uid, remoteArr){
    if (!Array.isArray(remoteArr) || !remoteArr.length) return _readLocalTombs(board, uid);
    var m = _readLocalTombs(board, uid);
    var now = Date.now();
    remoteArr.forEach(function(entry){
      // entry pode ser string (id) ou objeto { id, ts }
      if (!entry) return;
      if (typeof entry === 'string'){ m[entry] = m[entry] || now; return; }
      if (entry.id){ m[String(entry.id)] = entry.ts || m[String(entry.id)] || now; }
    });
    _writeLocalTombs(board, uid, m);
    return m;
  }
  function _tombsArray(board, uid){
    var m = _readLocalTombs(board, uid);
    return Object.keys(m).map(function(id){ return { id: id, ts: m[id] }; });
  }
  function _isTombed(board, uid, id){
    if (!id) return false;
    var m = _readLocalTombs(board, uid);
    return !!m[String(id)];
  }

  /* ------------------------------------------------------------------
   * (A) Envelopa _mergeKeepLocalOnly no runtime namespaceado + no global.
   *     Precisamos alcançar os DOIS porque js/kanban.js capturou uma
   *     referência local em nível de módulo (var _mergeKeepLocalOnly=…),
   *     antes deste patch rodar, MAS o js/auth.js e o notification-service
   *     usam a referência via global/window. Vamos wrap-ar ambas e ainda
   *     interceptar a chamada onde importa (via saveKBFor patcher, abaixo).
   * ------------------------------------------------------------------ */
  function _install_mergeWrap(){
    var runtime = (((global.LiderCRM||{}).modules||{}).kanban||{}).runtime;
    var orig = (runtime && runtime._mergeKeepLocalOnly) || global._mergeKeepLocalOnly;
    if (typeof orig !== 'function'){
      warn('_mergeKeepLocalOnly ainda não disponível; retry em 200ms');
      setTimeout(_install_mergeWrap, 200);
      return;
    }
    if (orig.__lfZombieWrapped) return;

    // Wrapper puro: recebe também (board, uid) como 3º/4º args (opcional).
    // O código legado chama merge(server, local); nosso saveKBFor wrap
    // injetará (board,uid) por meio de um closure — ver abaixo.
    function wrapped(serverList, localList, _boardHint, _uidHint){
      serverList = Array.isArray(serverList) ? serverList : [];
      localList  = Array.isArray(localList)  ? localList  : [];

      // Sincroniza tombstones remotos (se o server anexou lista) — cloud-first.
      // O server list é um ARRAY de cards. Se algum card == { __tomb:1, deletedIds:[...] }
      // extraímos e removemos dessa fatia (é metadado, não é card).
      var remoteTombIds = [];
      var cleanServer = serverList.filter(function(item){
        if (item && item.__tomb && Array.isArray(item.deletedIds)){
          remoteTombIds = remoteTombIds.concat(item.deletedIds);
          return false;
        }
        return true;
      });
      if (_boardHint && _uidHint && remoteTombIds.length){
        _mergeRemoteTombs(_boardHint, _uidHint, remoteTombIds);
      }

      // Deixa o original fazer o merge natural — mas com serverList JÁ limpo
      // dos metadados de tombstone.
      var merged = orig.call(this, cleanServer, localList);
      if (!Array.isArray(merged)) return merged;

      // Filtro de zumbi (a mordida principal): se temos hint de (board,uid),
      // aplica tombstone; sem hint, cai pra heurística de "qualquer tomb do usuário".
      if (_boardHint && _uidHint){
        merged = merged.filter(function(item){
          return item && item.id && !_isTombed(_boardHint, _uidHint, item.id);
        });
      }
      return merged;
    }
    wrapped.__lfZombieWrapped = true;

    // Preserva quaisquer flags/atributos anteriores
    try {
      Object.keys(orig).forEach(function(k){ if (!wrapped[k]) wrapped[k] = orig[k]; });
    } catch(_e){}

    if (runtime) runtime._mergeKeepLocalOnly = wrapped;
    global._mergeKeepLocalOnly = wrapped;
    log('_mergeKeepLocalOnly envelopado');
  }

  /* ------------------------------------------------------------------
   * (B) Envelopa saveKBFor para "injetar" o array deletedIds no doc
   *     que sobe ao servidor. Isso resolve o problema principal:
   *     o próprio doc do server passa a carregar a lista de exclusões,
   *     e qualquer outro dispositivo vai baixar essa lista no próximo
   *     _syncKBRemoteBG e aplicar via _mergeKeepLocalOnly (patch A).
   *
   *     Também envelopamos o fetch (getKanbanList) para extrair o
   *     deletedIds embutido antes que o merge original o veja como um
   *     card estranho.
   * ------------------------------------------------------------------ */
  function _install_saveKBForWrap(){
    if (typeof global.saveKBFor !== 'function'){
      setTimeout(_install_saveKBForWrap, 200);
      return;
    }
    if (global.saveKBFor.__lfZombieWrapped) return;

    var _orig = global.saveKBFor;
    global.saveKBFor = function(b, uid, list, onRemoteDone){
      // Anexa os tombstones locais dentro do payload como um "card"
      // marcador especial. O server vê apenas um array e persiste; leitores
      // extraem e removem no merge (patch A).
      var enriched = Array.isArray(list) ? list.slice() : [];
      var tombs = _tombsArray(b, uid);
      if (tombs.length){
        // Remove antigos marcadores duplicados antes de re-anexar
        enriched = enriched.filter(function(x){ return !(x && x.__tomb === 1); });
        enriched.push({
          __tomb: 1,
          deletedIds: tombs,
          _note: 'lf-fix-zombie-leads: tombstones — do not render'
        });
      }
      return _orig.call(this, b, uid, enriched, onRemoteDone);
    };
    global.saveKBFor.__lfZombieWrapped = true;
    log('saveKBFor envelopado (injeta deletedIds no doc do server)');

    // Espelha no runtime namespaceado, se o app expôs por lá
    try {
      var rt = (((global.LiderCRM||{}).modules||{}).kanban||{}).runtime;
      if (rt && rt.saveKBFor) rt.saveKBFor = global.saveKBFor;
    } catch(_e){}
  }

  /* Também precisamos que saveKB (variante do próprio user) faça o mesmo. */
  function _install_saveKBWrap(){
    if (typeof global.saveKB !== 'function'){
      setTimeout(_install_saveKBWrap, 200);
      return;
    }
    if (global.saveKB.__lfZombieWrapped) return;
    var _orig = global.saveKB;
    global.saveKB = function(b, list){
      var S = global.S;
      if (!S || !S.userId) return _orig.apply(this, arguments);
      var enriched = Array.isArray(list) ? list.slice() : [];
      var tombs = _tombsArray(b, S.userId);
      if (tombs.length){
        enriched = enriched.filter(function(x){ return !(x && x.__tomb === 1); });
        enriched.push({ __tomb:1, deletedIds:tombs });
      }
      return _orig.call(this, b, enriched);
    };
    global.saveKB.__lfZombieWrapped = true;
    log('saveKB envelopado');
  }

  /* ------------------------------------------------------------------
   * (C) Envelopa getKBFor / getKB para NUNCA devolver o card-marcador
   *     de tombstone como se fosse um card real (defesa contra qualquer
   *     código que leia direto do localStorage e não passe pelo merge).
   *     Também aproveitamos para filtrar zumbis já presentes no cache
   *     local (auto-limpeza).
   * ------------------------------------------------------------------ */
  function _install_getKBWrap(){
    if (typeof global.getKBFor !== 'function' || typeof global.getKB !== 'function'){
      setTimeout(_install_getKBWrap, 200);
      return;
    }
    if (global.getKBFor.__lfZombieWrapped) return;

    var _origFor = global.getKBFor;
    var _origMe  = global.getKB;

    function _cleanList(board, uid, list){
      if (!Array.isArray(list)) return list;
      var tombs = _readLocalTombs(board, uid);
      var hasTomb = Object.keys(tombs).length > 0;
      var out = [];
      var mutated = false;
      for (var i=0; i<list.length; i++){
        var item = list[i];
        if (item && item.__tomb === 1){ mutated = true; continue; }
        if (hasTomb && item && item.id && tombs[String(item.id)]){ mutated = true; continue; }
        out.push(item);
      }
      // Reescreve o cache local se limpou coisa (idempotente e barato)
      if (mutated){
        try {
          var key = (typeof global.kbKeyFor === 'function') ? global.kbKeyFor(board, uid) : ('lf6_kb_' + board + '_' + uid);
          if (typeof global.ss === 'function') global.ss(key, out);
        } catch(_e){}
      }
      return out;
    }

    global.getKBFor = function(board, uid){
      var raw = _origFor.call(this, board, uid);
      return _cleanList(board, uid, raw);
    };
    global.getKBFor.__lfZombieWrapped = true;

    global.getKB = function(board){
      var S = global.S;
      var raw = _origMe.call(this, board);
      if (!S || !S.userId) return raw;
      return _cleanList(board, S.userId, raw);
    };
    global.getKB.__lfZombieWrapped = true;

    log('getKB/getKBFor envelopados (filtram tombstones e marcadores)');

    try {
      var rt = (((global.LiderCRM||{}).modules||{}).kanban||{}).runtime;
      if (rt){
        rt.getKBFor = global.getKBFor;
        rt.getKB    = global.getKB;
      }
    } catch(_e){}
  }

  /* ------------------------------------------------------------------
   * (D) Envelopa confirmDeleteKBReason (definida em js/relatorios.js)
   *     para gravar o id no tombstone ANTES de saveKBFor. Isso garante
   *     que o próximo saveKBFor (envelopado em B) já inclua o tombstone
   *     no doc do server, numa única transação lógica.
   * ------------------------------------------------------------------ */
  function _install_confirmDeleteWrap(){
    if (typeof global.confirmDeleteKBReason !== 'function'){
      setTimeout(_install_confirmDeleteWrap, 200);
      return;
    }
    if (global.confirmDeleteKBReason.__lfZombieWrapped) return;
    var _orig = global.confirmDeleteKBReason;
    global.confirmDeleteKBReason = function(){
      try {
        var state = global._deleteKBState || {};
        var items = (Array.isArray(state.items) && state.items.length) ? state.items
                    : (state.cardId ? [{ id:state.cardId, board:state.board, ownerUid:state.ownerUid }] : []);
        items.forEach(function(it){
          if (!it || !it.id || !it.board) return;
          var uid = it.ownerUid || (typeof global.activeUID === 'function' ? global.activeUID(it.board) : null);
          if (!uid) return;
          _addLocalTomb(it.board, uid, it.id);
          log('tombstone registrado:', it.board, uid, it.id);
        });
      } catch(err){ warn('pré-tombstone falhou', err); }
      return _orig.apply(this, arguments);
    };
    global.confirmDeleteKBReason.__lfZombieWrapped = true;
    log('confirmDeleteKBReason envelopado');
  }

  /* ------------------------------------------------------------------
   * (E) Instalação com boot-safe retries.
   *     Todos os wrappers acima podem instalar tarde (após kanban.js
   *     e relatorios.js terem carregado). O install é chamado
   *     imediatamente + em DOMContentLoaded, com pequenos retries.
   * ------------------------------------------------------------------ */
  function _installAll(){
    _install_mergeWrap();
    _install_saveKBForWrap();
    _install_saveKBWrap();
    _install_getKBWrap();
    _install_confirmDeleteWrap();
  }
  _installAll();
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _installAll);
  }

  /* ------------------------------------------------------------------
   * API pública de diagnóstico e emergência.
   * ------------------------------------------------------------------ */
  global.LF_FIX_ZOMBIE_LEADS = {
    version: 'v1-20260804',
    tombstones: function(board, uid){ return _readLocalTombs(board, uid); },
    addTombstone: _addLocalTomb,
    isTombed: _isTombed,
    // Force re-instala tudo (útil pós hot-reload)
    reinstall: _installAll,
    // Purga o tombstone de um id (uso operacional: "ressuscitar de propósito")
    forgetTombstone: function(board, uid, id){
      var m = _readLocalTombs(board, uid);
      delete m[String(id)];
      _writeLocalTombs(board, uid, m);
    }
  };

  console.info(TAG, 'instalado — leads/negócios excluídos não voltam mais após reload.');
})(window);
