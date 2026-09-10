/* =====================================================================
 * lf-fix-auth-grace-refresh-v1-20260903.js
 * ---------------------------------------------------------------------
 * CAUSA-RAIZ dos erros de console reportados em 03/09/2026:
 *
 *   O JWT do Worker vale 8h. Quando o app fica fechado/suspenso além
 *   disso, o token EXPIRA. A partir daí:
 *     • /session/refresh exigia token ainda válido → não renovava nada;
 *     • a ponte legada (lf-legacy-auth-bridge) só funciona se o registro
 *       LOCAL do usuário tiver `ph` — a cópia que vem da nuvem é
 *       higienizada e não tem → "bridge não emitiu JWT";
 *     • o gate v2 segurava tudo por 12s e depois respondia AUTH_PENDING
 *       → cascata de avisos (feed, departments, scope, prefs, clientes,
 *       branding, bingo…);
 *     • os consumidores que leem o token cru do localStorage (SSE do
 *       Kanban e presença/last-seen) disparavam mesmo assim → enxurrada
 *       de 401 na rede.
 *
 * ESTE PATCH (cliente) + a janela de graça no Worker
 * (_worker_src/worker/middlewares/auth.js) resolvem a raiz: um token
 * EXPIRADO há menos de 7 dias, com assinatura válida, é trocado por um
 * novo em POST /api/v1/session/refresh — sem pedir senha, sem `ph`,
 * sem ponte legada.
 *
 * Comportamento:
 *   • roda no boot, ao voltar o foco/visibilidade e ao voltar a rede;
 *   • uma única tentativa em voo (compartilhada);
 *   • sucesso → grava a sessão no httpClient e dispara
 *     'lf:worker-session-ready' (o gate v2 já escuta e libera as
 *     requests retidas + refaz os caches de departamentos/escopo);
 *   • falha (token ausente, assinatura inválida, fora da graça) →
 *     silêncio; o fluxo antigo (ponte legada / login manual) continua
 *     valendo exatamente como antes.
 *
 * Idempotente e reversível: basta remover o <script>.
 * Diagnóstico: LF_AUTH_GRACE.status() / LF_AUTH_GRACE.kick()
 * Carregar ANTES de lf-fix-auth-gate-definitivo-v2-20260819.js.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__LF_AUTH_GRACE_REFRESH_V1__) return;
  global.__LF_AUTH_GRACE_REFRESH_V1__ = true;

  var TAG = '[lf-auth-grace]';
  var TOKEN_KEY = 'lidercrm_worker_jwt_v1';
  var GRACE_MS = 7 * 24 * 60 * 60 * 1000; // idêntico ao Worker
  var RETRY_MS = 30000;

  function log() { try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (_e) {} }
  function safe(fn, fb) { try { return fn(); } catch (_e) { return fb; } }

  function root() { return global.LiderCRM || {}; }
  function cfg() { return root().config || {}; }
  function http() { return safe(function () { return root().api && root().api.httpClient; }, null); }

  function sessionValid() {
    var h = http();
    return !!(h && h.session && typeof h.session.isValid === 'function' && safe(function () { return h.session.isValid(); }, false));
  }

  function storedSession() {
    return safe(function () {
      var raw = global.localStorage && global.localStorage.getItem(TOKEN_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      return (o && o.token) ? o : null;
    }, null);
  }

  /* Token expirado mas ainda dentro da janela de graça do Worker.
     `expiresAt` é gravado pelo http-client; se faltar, cai no `exp` do
     próprio JWT (payload é base64url, sem segredo nenhum envolvido). */
  function jwtExpMs(token) {
    return safe(function () {
      var body = String(token).split('.')[1];
      if (!body) return 0;
      var b64 = body.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var payload = JSON.parse(global.atob(b64));
      return Number(payload && payload.exp) ? Number(payload.exp) * 1000 : 0;
    }, 0);
  }

  function renewableSession() {
    var s = storedSession();
    if (!s) return null;
    var expiresAt = Number(s.expiresAt) || jwtExpMs(s.token);
    if (!expiresAt) return null;
    var age = Date.now() - expiresAt;
    if (age <= 0) return null;          // ainda válido — nada a renovar aqui
    if (age > GRACE_MS) return null;    // fora da graça — exige login manual
    return s;
  }

  function refreshUrl() {
    var c = cfg();
    var base = c.workerBaseUrl || '/api';
    var ver = c.workerVersion || 'v1';
    return base + '/' + ver + '/session/refresh';
  }

  var _inFlight = null;
  var _lastFailAt = 0;
  var _stats = { tentativas: 0, sucessos: 0, falhas: 0 };

  function kick() {
    if (sessionValid()) return Promise.resolve(true);
    if (_inFlight) return _inFlight;
    if (Date.now() - _lastFailAt < RETRY_MS) return Promise.resolve(false);

    var s = renewableSession();
    if (!s) return Promise.resolve(false);

    _stats.tentativas++;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var tid = ctrl ? setTimeout(function () { safe(function () { ctrl.abort(); }); }, 12000) : null;

    _inFlight = fetch(refreshUrl(), {
      method: 'POST',
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + s.token },
      credentials: 'same-origin',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (_e) {}
        return { ok: res.ok, data: d };
      });
    }).then(function (r) {
      var data = r && r.ok && r.data && r.data.data;
      if (!data || !data.token) throw new Error('sem token na resposta');
      var h = http();
      if (h && h.session && typeof h.session.set === 'function') {
        h.session.set(data.token, data.expiresIn, data.user || s.user || null);
      } else {
        // http-client ainda não montou: grava direto, ele lê no boot.
        safe(function () {
          global.localStorage.setItem(TOKEN_KEY, JSON.stringify({
            token: data.token,
            expiresAt: Date.now() + (Number(data.expiresIn || 0) * 1000),
            user: data.user || s.user || null
          }));
        });
      }
      _stats.sucessos++;
      log('sessão renovada a partir de token expirado (janela de graça) — sem pedir senha');
      safe(function () {
        global.dispatchEvent(new CustomEvent('lf:worker-session-ready', { detail: { source: 'grace-refresh' } }));
      });
      safe(function () {
        global.dispatchEvent(new CustomEvent('lf:worker-token-synced', { detail: { hasToken: true, source: 'grace-refresh' } }));
      });
      return true;
    }).catch(function () {
      _stats.falhas++;
      _lastFailAt = Date.now();
      return false;
    }).then(function (v) {
      if (tid) clearTimeout(tid);
      _inFlight = null;
      return v;
    });

    return _inFlight;
  }

  /* -------- gatilhos -------- */
  function scheduleInitial() {
    kick();
    setTimeout(kick, 300);
    setTimeout(kick, 1500);
  }
  if (document.readyState === 'complete' || document.readyState === 'interactive') scheduleInitial();
  else document.addEventListener('DOMContentLoaded', scheduleInitial, { once: true });

  global.addEventListener('lf:app-started', kick);
  global.addEventListener('online', kick);
  global.addEventListener('focus', kick);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
  // Rede de segurança: o token pode vencer com a aba aberta o dia todo.
  setInterval(kick, 60000);

  /* A ponte legada aborta quando o registro local não tem `ph`. Encadeia
     a renovação por graça como plano B, para o gate v2 (que chama
     tryBridge repetidamente) passar a conseguir autenticar. */
  function hookBridge() {
    var b = global.__lfLegacyAuthBridge;
    if (!b || typeof b.tryBridge !== 'function' || b.__lfGraceHooked) return;
    var original = b.tryBridge;
    b.tryBridge = function () {
      return Promise.resolve(safe(function () { return original.apply(this, arguments); }, false))
        .then(function (okBridge) { return okBridge ? true : kick(); })
        .catch(function () { return kick(); });
    };
    b.__lfGraceHooked = true;
    log('plano B instalado na ponte legada (registro sem `ph` deixa de travar a sessão)');
  }
  hookBridge();
  var _hookTries = 0;
  var _hookIv = setInterval(function () {
    hookBridge();
    if (++_hookTries > 60 || (global.__lfLegacyAuthBridge && global.__lfLegacyAuthBridge.__lfGraceHooked)) clearInterval(_hookIv);
  }, 500);

  global.LF_AUTH_GRACE = {
    version: 'v1-20260903',
    kick: kick,
    status: function () {
      var s = storedSession();
      return {
        sessaoValida: sessionValid(),
        temTokenGravado: !!s,
        expiraEm: s ? new Date(Number(s.expiresAt) || jwtExpMs(s.token)).toISOString() : null,
        renovavelPorGraca: !!renewableSession(),
        stats: JSON.parse(JSON.stringify(_stats))
      };
    }
  };

  log('v1-20260903 ativo — token expirado dentro de 7 dias é renovado sozinho. Diagnóstico: LF_AUTH_GRACE.status()');
})(window);
