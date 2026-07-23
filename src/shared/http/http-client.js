// =====================================================================
// http-client.js — Fase 3.2
// -----------------------------------------------------------------------
// Cliente HTTP do frontend:
//   • Sessão JWT persistida em localStorage
//   • Content-Type: application/json só quando o body é JSON
//   • FormData mantém boundary automaticamente (não seta CT)
//   • Timeout previsível (AbortController)
//   • 401 -> limpa sessão local
//   • Fase 3.2: refresh silencioso próximo do vencimento
// =====================================================================
(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var api = root.api = root.api || {};
  var config = root.config || {};

  // ---------------------------------------------------------------
  // Sessão JWT do Worker — persistida em localStorage
  // ---------------------------------------------------------------
  var TOKEN_KEY = 'lidercrm_worker_jwt_v1';
  var session = { token: null, expiresAt: 0, user: null };
  try {
    var raw = global.localStorage && global.localStorage.getItem(TOKEN_KEY);
    if(raw){ session = JSON.parse(raw) || session; }
  } catch(_e){}

  function persist(){
    try { global.localStorage.setItem(TOKEN_KEY, JSON.stringify(session)); } catch(_e){}
  }
  function clear(){
    session = { token: null, expiresAt: 0, user: null };
    try { global.localStorage.removeItem(TOKEN_KEY); } catch(_e){}
  }
  function set(token, expiresInSec, user){
    session.token = token;
    session.expiresAt = Date.now() + (Number(expiresInSec || 0) * 1000);
    session.user = user || null;
    persist();
  }
  function isValid(){
    return !!session.token && session.expiresAt > (Date.now() + 5000);
  }
  function get(){ return isValid() ? session : null; }

  // Fase 3.2 — refresh silencioso
  // Se faltar < config.sessionRefreshWindowSeconds pra expirar, dispara
  // POST /api/v1/session/refresh em background (uma única vez em vôo).
  var _refreshInFlight = null;
  function needsRefresh(){
    if (!session.token) return false;
    var windowMs = (Number(config.sessionRefreshWindowSeconds) || 0) * 1000;
    if (!windowMs) return false;
    return session.expiresAt > 0 && session.expiresAt - Date.now() < windowMs;
  }
  function silentRefresh(){
    if (!isValid() || !needsRefresh()) return Promise.resolve(false);
    if (_refreshInFlight) return _refreshInFlight;
    var base = config.workerBaseUrl || '/api';
    var ver  = config.workerVersion || 'v1';
    var url  = base + '/' + ver + '/session/refresh';
    // CERT-10: AbortController timeout no refresh silencioso (10s).
    var _refreshCtrl = new AbortController();
    var _refreshTid = setTimeout(function(){ _refreshCtrl.abort(); }, 10000);
    _refreshInFlight = fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + session.token
      },
      credentials: 'same-origin',
      signal: _refreshCtrl.signal
    }).then(function(res){ return res.json().catch(function(){ return null; }).then(function(payload){
      return { ok: res.ok, status: res.status, body: payload };
    }); }).then(function(r){
      if (r && r.ok && r.body && r.body.data && r.body.data.token){
        set(r.body.data.token, r.body.data.expiresIn, r.body.data.user || session.user);
        return true;
      }
      // Falha silenciosa — a request original ainda tentará com o token atual.
      return false;
    }).catch(function(){ return false; }).finally(function(){ clearTimeout(_refreshTid); _refreshInFlight = null; });
    return _refreshInFlight;
  }

  function normalizeHeaders(headers, body){
    var merged = {'Accept':'application/json'};
    var key;
    headers = headers || {};
    for(key in headers){
      if(Object.prototype.hasOwnProperty.call(headers, key) && headers[key] != null) merged[key] = headers[key];
    }
    if(body != null && typeof body === 'string' && !merged['Content-Type']){
      merged['Content-Type'] = 'application/json';
    }
    if(body instanceof FormData && merged['Content-Type']){
      delete merged['Content-Type'];
    }
    // CORREÇÃO ÁUDIO (2026-07-20): suporte a Blob/ArrayBuffer no body.
    // Para Blob, o browser usa blob.type como Content-Type automaticamente
    // se nenhum for setado. Para ArrayBuffer, default é octet-stream.
    if(body instanceof ArrayBuffer && !merged['Content-Type']){
      merged['Content-Type'] = 'application/octet-stream';
    }
    if(isValid() && !merged['Authorization']){
      merged['Authorization'] = 'Bearer ' + session.token;
    }
    return merged;
  }

  api.httpClient = {
    session: { get: get, set: set, clear: clear, isValid: isValid, silentRefresh: silentRefresh },
    request: function(path, options){
      options = options || {};
      var timeoutMs = Number(options.timeoutMs || config.requestTimeoutMs || 15000);
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      if(controller){
        timer = setTimeout(function(){
          try{ controller.abort(); }catch(_error){}
        }, timeoutMs);
      }
      var body = options.body;
      // CORREÇÃO ÁUDIO (2026-07-20): não fazer JSON.stringify em Blob/ArrayBuffer
    // — esses tipos são enviados como binário cru no body do fetch.
    if(body != null && typeof body !== 'string' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) body = JSON.stringify(body);

      // Fase 3.2 — se a sessão está prestes a expirar, tenta renovar
      // em background antes de disparar a request. Não bloqueia: se o
      // refresh chegar a tempo, o Authorization já sai atualizado; se
      // não, a request usa o token atual (ainda válido).
      if (isValid() && needsRefresh()) { silentRefresh(); }

      return fetch(path, {
        method: options.method || 'GET',
        headers: normalizeHeaders(options.headers, body),
        body: body,
        signal: controller ? controller.signal : undefined,
        credentials: options.credentials || 'same-origin'
      }).then(function(response){
        return response.text().then(function(text){
          var data = null;
          try{ data = text ? JSON.parse(text) : null; }catch(_error){ data = text; }
          if(response.status === 401){ clear(); }
          return {
            ok: response.ok,
            status: response.status,
            headers: response.headers,
            data: data
          };
        });
      }).catch(function(error){
        var aborted = !!(error && (error.name === 'AbortError' || /abort/i.test(String(error.message || ''))));
        return {
          ok: false,
          status: 0,
          headers: null,
          data: {
            ok: false,
            error: {
              code: aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
              message: aborted ? 'Tempo limite excedido na comunicação com o servidor.' : 'Falha de rede ao comunicar com o servidor.',
              details: error && error.message ? String(error.message) : null
            }
          }
        };
      }).finally(function(){
        if(timer)clearTimeout(timer);
      });
    }
  };
})(window);
