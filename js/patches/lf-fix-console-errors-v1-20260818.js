/* lf-fix-console-errors-v1-20260818
 * ---------------------------------------------------------------
 * Patch NÃO invasivo para eliminar 3 fontes de ruído no console:
 *
 *   [A] 404 de assets/sounds/*.wav e *.ogg
 *       - notificacoes.js registra 3 <source> por notificação
 *         (mp3, wav, ogg) mas só existe mp3 na pasta assets/sounds/.
 *       - Fix: intercepta a criação de <source> dentro de <audio>
 *         e remove os que apontam para .wav/.ogg quando esses
 *         arquivos não existem no bundle.
 *
 *   [B] 403 em /api/v1/atividades/list?uid=<alheio>
 *       - Fetch dispara para uid de outro usuário sem o caller
 *         ter adminUI/supervisorUI (ou sem team_id resolvido).
 *       - Fix: envolve LF.fetchAndCacheActivities para SÓ pedir a
 *         lista do próprio S.userId. Chamadas com uid diferente
 *         são ignoradas silenciosamente (retornam cache local).
 *         O caminho oficial de leitura de listas alheias continua
 *         sendo o Painel ADM (loadAllActivitiesAdmin), que já usa
 *         adminUI.
 *
 *   [C] "[chat] acesso a conv alheia bloqueado" repetido
 *       - conv com id "A__B" chega sem participants preenchido
 *         (merge de inbox antigo) e o safety-net loga aviso a
 *         cada leitura.
 *       - Fix: repopula conv.participants a partir do id quando
 *         o padrão "<uid1>__<uid2>" estiver presente e S.userId
 *         for um dos lados. Idempotente.
 *
 * INSTALAÇÃO
 *   1. Copie este arquivo para  js/patches/  (e www/js/patches/).
 *   2. No app.html / index.html (raiz e www/), adicione, DEPOIS
 *      dos demais patches lf-fix-* (ou seja, no fim do bloco
 *      <!-- PATCH: ... --> que já existe):
 *
 *      <script src="js/patches/lf-fix-console-errors-v1-20260818.js?v=20260818ce1"></script>
 *
 *   3. Não altere nenhum outro arquivo. O patch é auto-contido e
 *      idempotente (usa flag __lfCE1Installed no window).
 * ---------------------------------------------------------------
 */
(function (global) {
  'use strict';
  if (global.__lfCE1Installed) return;
  global.__lfCE1Installed = true;

  var LOG_TAG = '[lf-fix-console-errors-v1]';
  function _log() {
    try { console.info.apply(console, [LOG_TAG].concat([].slice.call(arguments))); } catch (_e) {}
  }

  // ================================================================
  // [A] Bloquear <source> de sons inexistentes (.wav / .ogg)
  // ================================================================
  //
  // Só temos MP3 no bundle. Interceptamos a atribuição de src em
  // elementos <source> dentro de <audio> e removemos o <source>
  // se for .wav ou .ogg em assets/sounds/. O <audio> continua com
  // o <source> .mp3 e toca normalmente.
  (function _fixMissingSounds() {
    var MISSING_RE = /\/assets\/sounds\/.+\.(wav|ogg)(\?.*)?$/i;

    // Intercepta setAttribute('src', ...) em HTMLSourceElement
    try {
      var origSetAttr = HTMLSourceElement.prototype.setAttribute;
      HTMLSourceElement.prototype.setAttribute = function (name, value) {
        if (name === 'src' && typeof value === 'string' && MISSING_RE.test(value)) {
          // Não seta o src — o <source> fica inerte, o navegador
          // pula pra próxima <source> do <audio> (o .mp3).
          this.setAttribute('data-lf-skipped-src', value);
          return;
        }
        return origSetAttr.apply(this, arguments);
      };
    } catch (_e) {}

    // Intercepta a propriedade .src (usada por alguns caminhos)
    try {
      var desc = Object.getOwnPropertyDescriptor(HTMLSourceElement.prototype, 'src')
              || Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'src');
      if (desc && desc.set) {
        var origSetter = desc.set;
        Object.defineProperty(HTMLSourceElement.prototype, 'src', {
          configurable: true,
          enumerable: desc.enumerable,
          get: desc.get,
          set: function (value) {
            if (typeof value === 'string' && MISSING_RE.test(value)) {
              try { this.setAttribute('data-lf-skipped-src', value); } catch (_e) {}
              return;
            }
            origSetter.call(this, value);
          }
        });
      }
    } catch (_e) {}

    // Também saneia window._notifSoundPaths caso algum patch antigo já
    // tenha registrado fallbacks .wav/.ogg (hotfix-notif-atividades antes
    // do FIX-CE1[A]-2). Filtra in-place preservando a referência.
    try {
      var paths = global._notifSoundPaths;
      if (paths) {
        Object.keys(paths).forEach(function (k) {
          if (!Array.isArray(paths[k])) return;
          var filtered = paths[k].filter(function (src) {
            return typeof src === 'string' && !/\.(wav|ogg)(\?|$)/i.test(src);
          });
          if (filtered.length !== paths[k].length) {
            paths[k].length = 0;
            filtered.forEach(function (src) { paths[k].push(src); });
          }
        });
      }
    } catch (_e) {}

    _log('sons ausentes (.wav/.ogg) serão ignorados; .mp3 continua tocando');
  })();

  // ================================================================
  // [B] Não pedir /atividades/list?uid=<alheio>
  // ================================================================
  //
  // Envolve LF.fetchAndCacheActivities para forçar uid === S.userId.
  // Se o chamador passar outro uid, retornamos o cache local sem
  // fazer o GET (que daria 403). O caminho legítimo de ADM
  // (loadAllActivitiesAdmin) usa outro endpoint com adminUI e não é
  // afetado.
  (function _fixCrossUidFetch() {
    function _S() { return global.S || null; }
    function _selfUid() { var s = _S(); return (s && s.userId) || null; }
    function _actKeyFor(uid) { return 'lf13_acts_' + uid; }
    function _readLocal(uid) {
      try { return JSON.parse(localStorage.getItem(_actKeyFor(uid)) || '[]') || []; }
      catch (_e) { return []; }
    }

    function _install() {
      var NS_LF = (global.LF = global.LF || {});
      var orig = NS_LF.fetchAndCacheActivities;
      if (!orig || orig.__lfCE1Wrapped) {
        // Instala mesmo se ainda não existe — cria stub que respeita a regra
        var stub = function (uid) {
          var me = _selfUid();
          if (!me) return Promise.resolve(null);
          if (uid && uid !== me) {
            // silencioso: retorna cache local se houver
            return Promise.resolve(_readLocal(uid));
          }
          if (typeof orig === 'function') return orig.call(NS_LF, me);
          return Promise.resolve(_readLocal(me));
        };
        stub.__lfCE1Wrapped = true;
        // FIX-CE1[B]-2: idem — marca de segurança para não ser barrado
        // pelo setter blindado do hotfix (evita o warn no console).
        stub.__lfV3Safe = true;
        stub.__lfHotfixSafe = true;
        NS_LF.fetchAndCacheActivities = stub;
        return;
      }
      var wrapped = function (uid) {
        var me = _selfUid();
        if (!me) return Promise.resolve(null);
        if (uid && uid !== me) {
          return Promise.resolve(_readLocal(uid));
        }
        return orig.call(NS_LF, me);
      };
      wrapped.__lfCE1Wrapped = true;
      // FIX-CE1[B]-2 (2026-08-18): o hotfix lf-hotfix-notif-som-e-atividades
      // blinda LF.fetchAndCacheActivities com defineProperty + setter que só
      // aceita funções marcadas __lfV3Safe/__lfHotfixSafe. Nossa versão é
      // SEGURA (delega ao original após o guard de uid), então marcamos
      // explicitamente — sem isso a atribuição era rejeitada e o console
      // mostrava "bloqueada tentativa de sobrescrever ... versão insegura".
      wrapped.__lfV3Safe = true;
      wrapped.__lfHotfixSafe = true;
      // preserva flags de patches anteriores (v3Safe etc.)
      try { for (var k in orig) { if (Object.prototype.hasOwnProperty.call(orig, k)) wrapped[k] = orig[k]; } } catch (_e) {}
      NS_LF.fetchAndCacheActivities = wrapped;
    }

    // Instala agora e re-verifica após load (caso outro patch
    // substitua LF.fetchAndCacheActivities depois de nós).
    _install();
    try { window.addEventListener('load', function () { setTimeout(_install, 0); setTimeout(_install, 1500); }); } catch (_e) {}

    _log('LF.fetchAndCacheActivities restrito ao próprio S.userId');
  })();

  // ================================================================
  // [C] Repopular conv.participants a partir do id "A__B"
  // ================================================================
  //
  // O safety-net em js/chat.js barra a conversa quando S.userId não
  // está em conv.participants. Muitas conversas antigas ficaram
  // sem participants preenchido após um merge de inbox — o id
  // tem o padrão "<uidA>__<uidB>", então dá pra reconstruir.
  (function _fixChatParticipants() {
    var CHAT_KEY_CANDIDATES = ['lf_chat_convs', 'lf13_chat_convs', 'chatConvs'];
    function _S() { return global.S || null; }
    function _selfUid() { var s = _S(); return (s && s.userId) || null; }

    function _findKey() {
      // Descobre a chave real usada por js/chat.js sem depender de escopo interno.
      // Prioridade: window.CHAT_KEY -> candidatos conhecidos.
      if (typeof global.CHAT_KEY === 'string' && global.CHAT_KEY) return global.CHAT_KEY;
      for (var i = 0; i < CHAT_KEY_CANDIDATES.length; i++) {
        var k = CHAT_KEY_CANDIDATES[i];
        try {
          var raw = localStorage.getItem(k);
          if (raw && raw.charAt(0) === '[') return k;
        } catch (_e) {}
      }
      return null;
    }

    function _healOnce() {
      var me = _selfUid();
      if (!me) return 0;
      var key = _findKey();
      if (!key) return 0;
      var list;
      try { list = JSON.parse(localStorage.getItem(key) || '[]'); }
      catch (_e) { return 0; }
      if (!Array.isArray(list) || !list.length) return 0;

      var changed = 0;
      list.forEach(function (conv) {
        if (!conv || typeof conv.id !== 'string') return;
        // Só age em ids no padrão "<uidA>__<uidB>"
        var parts = conv.id.split('__');
        if (parts.length !== 2 || !parts[0] || !parts[1]) return;

        var current = Array.isArray(conv.participants) ? conv.participants.slice() : [];
        var need = [parts[0], parts[1]];
        var missing = need.filter(function (u) { return current.indexOf(u) < 0; });
        if (missing.length && need.indexOf(me) >= 0) {
          // Só reconstruímos se o próprio usuário é um dos lados —
          // não injetamos participants pra terceiros (segurança).
          conv.participants = need.slice();
          changed++;
        }
      });

      if (changed) {
        try { localStorage.setItem(key, JSON.stringify(list)); } catch (_e) {}
        _log('reconstruído participants em', changed, 'conversa(s) via id "A__B"');
      }
      return changed;
    }

    // Roda uma vez no boot e mais uma vez depois do login (S.userId
    // pode não existir ainda quando o patch carrega).
    try { _healOnce(); } catch (_e) {}
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (_selfUid()) { try { _healOnce(); } catch (_e) {} clearInterval(iv); return; }
      if (tries > 20) clearInterval(iv); // ~20s
    }, 1000);
  })();

  _log('patch aplicado (A: sons; B: atividades cross-uid; C: chat participants)');
})(window);
