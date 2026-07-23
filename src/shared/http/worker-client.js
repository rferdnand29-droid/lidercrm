// =====================================================================
// worker-client.js — Fase 3.2
// -----------------------------------------------------------------------
// Cliente de alto nível pra API v1 do Worker. Encapsula:
//   • Auth: login, logout, session, refresh
//   • Ponte de sessão legada (Fase 3.2): legacyNonce + legacyBridge
//   • CRUD genérico e endpoints específicos
// =====================================================================
(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var api = root.api = root.api || {};
  var config = root.config || {};

  function endpoint(path){
    var base = config.workerBaseUrl || '/api';
    var version = config.workerVersion || 'v1';
    return base + '/' + version + path;
  }

  function withQuery(path, query){
    if(!query) return path;
    var qs = new URLSearchParams();
    Object.keys(query).forEach(function(k){
      var v = query[k];
      if(v === undefined || v === null) return;
      qs.append(k, String(v));
    });
    var s = qs.toString();
    return s ? path + '?' + s : path;
  }

  function req(method, path, body, query){
    var http = api.httpClient;
    // CORREÇÃO (2026-07-20, caça-bugs agenda): httpClient.request sempre resolve
    // — inclusive quando o servidor devolve 4xx/5xx. Isso fazia o wc.createAgendaSlot/
    // updateAgendaSlot cair no .then() mesmo quando o backend rejeitava o payload
    // (ex.: 400 em fs_documents?on_conflict=path), então o toast "✅ Agendamento criado!"
    // aparecia sem nada ter sido salvo — e no próximo _agdPollOnce (6s) o slot sumia
    // da tela porque nunca chegou a ser persistido. Agora, se a resposta não for OK,
    // rejeitamos com um Error que carrega status/detalhes, para que o .catch de
    // agdDoSave (e o retry-queue) acione o fallback local corretamente.
    return http.request(endpoint(withQuery(path, query)), {
      method: method, body: body
    }).then(function(res){
      if(res && res.ok) return res;
      var errPayload = res && res.data && res.data.error;
      var msg = (errPayload && errPayload.message)
        || 'HTTP ' + (res && res.status != null ? res.status : '??') + ' em ' + method + ' ' + path;
      var err = new Error(msg);
      err.status = res ? res.status : 0;
      err.response = res;
      err.details = errPayload || (res && res.data) || null;
      throw err;
    });
  }

  function pickData(res){
    return (res && res.data && res.data.data) || null;
  }

  api.workerClient = {
    health: function(){ return req('GET', '/health'); },

    // -------- Auth / Sessão --------
    login: function(email, password){
      return req('POST', '/login', { email: email, password: password }).then(function(res){
        if(res.ok && res.data && res.data.data && res.data.data.token){
          api.httpClient.session.set(res.data.data.token, res.data.data.expiresIn, res.data.data.user);
        }
        return res;
      });
    },
    logout: function(){
      // Tenta avisar o servidor (best-effort). Local sempre é limpo.
      var http = api.httpClient;
      var p = (http && http.session && http.session.isValid && http.session.isValid())
        ? req('POST', '/logout', {}).catch(function(){ return null; })
        : Promise.resolve(null);
      return p.then(function(){ http.session.clear(); return true; });
    },
    session: function(){
      return req('GET', '/session').then(function(res){ return pickData(res); });
    },
    refresh: function(){
      return req('POST', '/session/refresh', {}).then(function(res){
        var data = pickData(res);
        if(data && data.token) api.httpClient.session.set(data.token, data.expiresIn, data.user);
        return data;
      });
    },

    // -------- Fase 3.3 (parte 5): documento de configuração genérico --------
    // Reaproveita /api/v1/usuarios/config (Fase 3.2) — já é um par
    // GET/PUT genérico por "name" (fs_documents em config/<name>), só
    // não tinha um método de conveniência aqui ainda. Usado por
    // js/leads.js pro Banco de Objeções (custom_objecoes, obj_edits,
    // obj_deleted, user_objecoes) — documentos { list|map, ts }
    // compartilhados por toda a equipe, mesmo path que o adaptador
    // legado de js/supabase.js já usava (config/<name>).
    getConfig: function(name){
      return req('GET', '/usuarios/config', null, { name: name }).then(function(res){ return pickData(res); });
    },
    putConfig: function(name, payload){
      return req('PUT', '/usuarios/config', payload, { name: name }).then(function(res){ return pickData(res); });
    },
    // FASE 3.3 (parte 7): usado por admResetLogo/admResetCRMName (js/configuracoes.js)
    // — reset pro padrão apaga o documento config/<name>.
    deleteConfig: function(name){
      return req('DELETE', '/usuarios/config', null, { name: name }).then(function(res){ return pickData(res); });
    },

    // -------- Fase 3.2: Ponte de sessão legada --------
    // 1) Pede o nonce (ts servidor). NÃO envia Authorization — rota pública.
    legacyNonce: function(uid, email){
      return req('GET', '/session/legacy-nonce', null, { uid: uid, email: email })
        .then(function(res){ return pickData(res); });
    },
    // 2) Envia (uid, email, ts, sig) já assinado localmente. NÃO envia Authorization.
    legacyBridge: function(payload){
      return req('POST', '/session/legacy-bridge', payload).then(function(res){
        var data = pickData(res);
        if(data && data.token) api.httpClient.session.set(data.token, data.expiresIn, data.user);
        return data;
      });
    },

    // -------- CRUD genérico --------
    list:   function(resource, query){ return req('GET', '/' + resource, null, query); },
    get:    function(resource, id){ return req('GET', '/' + resource, null, { id: id }); },
    create: function(resource, payload){ return req('POST', '/' + resource, payload); },
    update: function(resource, id, payload){ return req('PUT', '/' + resource, payload, { id: id }); },
    remove: function(resource, id){ return req('DELETE', '/' + resource, null, { id: id }); },

    // -------- Fase 3.3 (parte 2): lista de clientes por consultor --------
    // Documento único por uid ({ list, uid, ts }) — substitui
    // db.collection('clientes').doc(uid).{get,set}() do adaptador
    // legado de js/supabase.js. Ver clientes-controller.js (Worker).
    clientesList: function(uid){
      return req('GET', '/clientes/list', null, { uid: uid }).then(function(res){ return pickData(res); });
    },
    saveClientesList: function(uid, list){
      return req('PUT', '/clientes/list', { uid: uid, list: list }, { uid: uid }).then(function(res){ return pickData(res); });
    },

    // -------- Fase 3.3 (parte 3): board de Kanban por consultor --------
    // Documento único por board+uid ({ list, ts }) — substitui
    // db.collection('kb_'+board).doc(uid).{get,set}() do adaptador
    // legado. Ver kanban-controller.js (Worker).
    kanbanList: function(board, uid){
      return req('GET', '/kanban/list', null, { board: board, uid: uid }).then(function(res){ return pickData(res); });
    },
    saveKanbanList: function(board, uid, list){
      return req('PUT', '/kanban/list', { uid: uid, list: list }, { board: board, uid: uid }).then(function(res){ return pickData(res); });
    },

    // -------- Fase 3.3 (parte 4): ligações do dia por consultor --------
    // Documento único por uid+data ({ list, ts }). GET usado hoje pelo
    // Painel ADM (js/relatorios.js); PUT fica pronto pra quando
    // js/agenda.js (saveLigToday) for migrado.
    ligacoesList: function(uid, date){
      return req('GET', '/ligacoes/list', null, { uid: uid, date: date }).then(function(res){ return pickData(res); });
    },
    saveLigacoesList: function(uid, date, list){
      return req('PUT', '/ligacoes/list', { uid: uid, list: list }, { uid: uid, date: date }).then(function(res){ return pickData(res); });
    },

    // -------- Fase 3.3 (parte 6): lista de atividades por consultor --------
    // Documento único por uid ({ list, ts }) — substitui
    // db.collection('activities').doc(uid).{get,set}() do adaptador
    // legado. Ver atividades-controller.js (Worker).
    atividadesList: function(uid){
      return req('GET', '/atividades/list', null, { uid: uid }).then(function(res){ return pickData(res); });
    },
    saveAtividadesList: function(uid, list){
      return req('PUT', '/atividades/list', { uid: uid, list: list }, { uid: uid }).then(function(res){ return pickData(res); });
    },

    // -------- Fase 3.3 (parte 6): agenda_slots (registro por agendamento) --------
    // Diferente das demais: um registro por slot, compartilhado por toda
    // a equipe. Sem tempo real nativo no Worker — o "tempo real" do
    // legado (onSnapshot) vira polling no frontend (ver agdListen em
    // js/agenda.js). Ver agenda-slots-controller.js (Worker).
    agendaSlotsList: function(){
      return req('GET', '/agenda-slots').then(function(res){ return pickData(res); });
    },
    createAgendaSlot: function(payload){
      return req('POST', '/agenda-slots', payload).then(function(res){ return pickData(res); });
    },
    updateAgendaSlot: function(id, payload){
      return req('PUT', '/agenda-slots', payload, { id: id }).then(function(res){ return pickData(res); });
    },
    deleteAgendaSlot: function(id){
      return req('DELETE', '/agenda-slots', null, { id: id }).then(function(res){ return pickData(res); });
    },

    // -------- Fase 3.4: feed compartilhado de atividades (um doc por evento) --------
    // Substitui db.collection('config').doc('feed') + arrayUnion do adaptador
    // legado. GET devolve a lista já ordenada por ts desc (mais recente
    // primeiro); POST cria um evento novo (sempre um INSERT, nunca um
    // merge — ver feed-controller.js). Ver js/relatorios.js
    // (logFeedEvent/renderAdmFeed).
    feedList: function(limit){
      return req('GET', '/feed', null, limit ? { limit: limit } : null).then(function(res){ return pickData(res); });
    },
    logFeedEventRemote: function(entry){
      return req('POST', '/feed', entry).then(function(res){ return pickData(res); });
    },

    // -------- Fase 3.5: troca autenticada de senha --------
    // Substitui a antiga gravação local de u.ph em lf6_u pelo
    // fluxo servidor: o Worker recebe currentPassword + newPassword
    // e regrava o hash em fs_documents (config/users/items/<uid>).
    // targetUserId é opcional — se omitido, aplica no próprio dono
    // da sessão (JWT.sub). Somente sessões com role='adm' podem
    // enviar targetUserId != sub. Ver auth-controller.js
    // (changePasswordController).
    changePassword: function(payload){
      return req('POST', '/usuarios/change-password', payload || {}).then(function(res){
        if(res && res.ok){
          return pickData(res) || {};
        }
        // Envelope de erro: rejeita pro caller conseguir diferenciar
        // "senha atual incorreta" (401) de "regra do schema" (422) ou
        // rede fora (0).
        var err = new Error((res&&res.data&&res.data.error&&res.data.error.message)||'change_password_failed');
        err.status = res && res.status;
        err.data = res && res.data;
        throw err;
      });
    },

    // -------- Endpoints específicos --------
    dashboard: function(query){ return req('GET', '/dashboard', null, query); },
    financeiro: function(query){ return req('GET', '/financeiro', null, query); },
    usuarios: function(query){ return req('GET', '/usuarios', null, query); },
    notificacoes: function(query){ return req('GET', '/notificacoes', null, query); },
    notificar: function(payload){ return req('POST', '/notificacoes', payload); },
    upload: function(payload){ return req('POST', '/upload', payload); },
    // CORREÇÃO ÁUDIO (2026-07-20): upload de áudio com timeout estendido (120s).
    // Áudios podem ser grandes (vários MB); o timeout padrão de 15s estourava.
    uploadAudio: function(payload){
      var http = api.httpClient;
      return http.request(endpoint('/upload'), {
        method: 'POST',
        body: payload,
        timeoutMs: 120000
      });
    },

    // -------- Genérico (compatibilidade com a versão anterior) --------
    request: function(path, options){ return api.httpClient.request(endpoint(path), options || {}); }
  };
})(window);
