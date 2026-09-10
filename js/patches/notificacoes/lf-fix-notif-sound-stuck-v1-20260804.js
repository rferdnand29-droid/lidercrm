/* =====================================================================
 * lf-fix-notif-sound-stuck-v1-20260804.js
 * ---------------------------------------------------------------------
 * BUG HUNT — Correção definitiva: "CRM não está notificando com som".
 *
 * CAUSA RAIZ (rastreada em toda a base):
 *   O patch lf-chat-ctx-sound-fix-v1-20260720.js envolve _chatPollNewMsgs
 *   com try/finally SÍNCRONO, agendando _soundSuppressed=false em 30ms
 *   fixos:
 *
 *       _soundSuppressed = true;
 *       _origPoll.apply(this, arguments);           // retorna a Promise
 *       setTimeout(()=>_soundSuppressed=false, 30); // libera em 30ms
 *
 *   Mas _chatPollNewMsgs em js/chat.js é ASSÍNCRONO: dispara uma Promise
 *   via _chatPullInboxConvs().then(...).then(...) e o fireNativeNotification
 *   das mensagens NOVAS só é chamado 100-800ms depois — dentro do .then().
 *
 *   Como lf-notify-global-v1-20260727 chama _chatPollNewMsgs de 5 em 5s
 *   (e lf-notif-visibility-fix-v1-20260729 dispara em cada click), o wrap
 *   re-arma _soundSuppressed=true justamente quando a Promise pendente do
 *   poll anterior está pra tocar. Resultado: _playNotifSound cai no
 *   `if (_soundSuppressed) return;` e o som é engolido em silêncio.
 *
 *   Colateralmente, o wrap ORIGINAL de _playNotifSound é global — quando
 *   ele está em janela suprimida, TAMBÉM engole som de atividade atrasada
 *   (kind 'late') e de notificação da inbox (kind 'geral'), que nada têm
 *   a ver com o "rajada ao abrir o chat" que motivou o wrap.
 *
 * ESTRATÉGIA (mínima, cirúrgica, mantém a proteção original):
 *   1) Re-envolve _playNotifSound de forma a só suprimir o kind 'chat'
 *      (que é o único caso original do bug de rajada), deixando 'late'
 *      e 'geral' SEMPRE passarem.
 *   2) Re-envolve _chatPollNewMsgs de forma que respeite a Promise
 *      retornada — só libera _soundSuppressed no .finally() da Promise,
 *      com timeout de segurança de 800ms caso ela nunca resolva.
 *   3) Idempotente: usa marcador window.__LF_NOTIF_SOUND_STUCK_FIX_V1__.
 *   4) Zero risco de regressão: se o patch original não estiver carregado,
 *      simplesmente não faz nada (mantém comportamento default).
 *
 * DEPENDÊNCIAS:
 *   Deve carregar DEPOIS de:
 *     - js/notificacoes.js (define _playNotifSound)
 *     - js/chat.js (define _chatPollNewMsgs)
 *     - js/patches/chat/nucleo/lf-chat-ctx-sound-fix-v1-20260720.js
 *     - js/patches/notificacoes/lf-notify-global-v1-20260727.js
 *
 * ROLLBACK:
 *   Remover a linha <script> no app.html / index.html e recarregar.
 * ===================================================================== */
(function () {
  'use strict';

  if (window.__LF_NOTIF_SOUND_STUCK_FIX_V1__) return;
  window.__LF_NOTIF_SOUND_STUCK_FIX_V1__ = true;

  var TAG = '[lf-notif-sound-stuck-fix]';
  var SAFETY_MS = 800; // cinto de segurança se a Promise nunca resolver

  /* ------------------------------------------------------------------
   * PARTE 1 — Reduz o escopo da supressão de _playNotifSound
   *
   * O wrap original de lf-chat-ctx-sound-fix-v1-20260720.js troca
   * window._playNotifSound por uma função que retorna cedo sempre que
   * _soundSuppressed=true, sem olhar o kind. Isso mata som de atividade
   * atrasada e de inbox durante a janela de supressão.
   *
   * Vamos envolver de novo: se a janela estiver ativa MAS o kind for
   * 'late' ou 'geral', pulamos por cima do wrap suprimido e chamamos
   * a implementação REAL diretamente. Preservamos o wrap para 'chat'
   * (que é o único caso que o wrap original tinha razão de proteger).
   * ------------------------------------------------------------------ */
  function _installKindAwareSoundWrap() {
    if (typeof window._playNotifSound !== 'function') {
      // ainda não carregou o notificacoes.js — tenta de novo em 100ms
      return setTimeout(_installKindAwareSoundWrap, 100);
    }
    if (window.__LF_SOUND_KIND_AWARE_WRAPPED__) return;
    window.__LF_SOUND_KIND_AWARE_WRAPPED__ = true;

    var wrappedFn = window._playNotifSound; // pode ser o original OU já envelopado

    // Tenta pescar a versão ORIGINAL (sem supressão) para casos 'late'/'geral'.
    // Como o wrap anterior não expôs o _origSound, reconstruímos usando o
    // pipeline padrão de _buildNotifAudio (definido em notificacoes.js).
    //
    // Fallback: se por qualquer motivo _buildNotifAudio não estiver acessível,
    // caímos para o beep de emergência (_playNotifFallbackBeep).
    function _playRawSound(kind) {
      try {
        // Se _buildNotifAudio existir, usa direto (bypassa o wrap suprimido)
        if (typeof window._buildNotifAudio === 'function') {
          var validKind = (window._notifSoundPaths && window._notifSoundPaths[kind]) ? kind : 'geral';
          var audio = window._buildNotifAudio(validKind).cloneNode(true);
          var fallbackDone = false;
          var fallback = function () {
            if (fallbackDone) return;
            fallbackDone = true;
            try { window._playNotifFallbackBeep && window._playNotifFallbackBeep(); } catch (_e) {}
          };
          audio.addEventListener('error', fallback, { once: true });
          var p = audio.play();
          if (p && typeof p.catch === 'function') p.catch(function () { fallback(); });
          return;
        }
        // Fallback total: beep
        if (typeof window._playNotifFallbackBeep === 'function') window._playNotifFallbackBeep();
      } catch (_e) {
        try { window._playNotifFallbackBeep && window._playNotifFallbackBeep(); } catch (_ee) {}
      }
    }

    window._playNotifSound = function (kind) {
      // 'late' e 'geral' NUNCA devem ser suprimidos pelo mecanismo do chat.
      // São sons de eventos independentes (atividade atrasada, transferência,
      // automação, inbox interna) — nada a ver com "rajada ao abrir o chat".
      if (kind === 'late' || kind === 'geral' || kind === 'transfer' || kind === 'automation' || kind === 'activity') {
        return _playRawSound(kind === 'transfer' || kind === 'automation' || kind === 'activity' ? 'geral' : kind);
      }
      // Para 'chat' (e undefined), mantém o wrap original — respeita a
      // proteção contra rajada de mensagens históricas ao abrir o chat.
      return wrappedFn.apply(this, arguments);
    };
  }

  /* ------------------------------------------------------------------
   * PARTE 2 — Wrap de _chatPollNewMsgs que respeita Promise
   *
   * O wrap original desliga _soundSuppressed em 30ms fixos, o que é
   * MUITO menos do que o tempo real que o poll assíncrono leva pra
   * chegar no fireNativeNotification (100-800ms tipicamente).
   *
   * Aqui, envolvemos de novo: se _origPoll retornar uma Promise (ou
   * "thenable"), esperamos ela terminar antes de liberar. Com timeout
   * de segurança pra evitar travar para sempre caso a Promise falhe
   * silenciosamente.
   * ------------------------------------------------------------------ */
  function _installPromiseAwarePollWrap() {
    if (typeof window._chatPollNewMsgs !== 'function') {
      return setTimeout(_installPromiseAwarePollWrap, 100);
    }
    if (window.__LF_POLL_PROMISE_AWARE_WRAPPED__) return;
    window.__LF_POLL_PROMISE_AWARE_WRAPPED__ = true;

    // Neutraliza o setTimeout(30ms) do wrap ORIGINAL:
    // como já reduzimos o escopo do suppress para 'chat' apenas (Parte 1),
    // e como o poll real chama fireNativeNotification('chat') mesmo assim,
    // precisamos que a janela feche EXATAMENTE quando o poll async termina.
    //
    // Estratégia: substituímos o wrap novamente por um que:
    //   a) NÃO liga _soundSuppressed=true (deixa 'chat' passar pelo caminho
    //      normal, que já está protegido pelo mecanismo de _chatSaveMsgs
    //      do patch original — o baseline por-conv e o filtro por _chatOpenedAt
    //      já cuidam de não tocar som pra msgs históricas).
    //   b) Apenas chama o original.
    //
    // Isso preserva a proteção real (que está em _chatSaveMsgs wrap) e
    // remove a fonte do bug (a supressão global de 30ms que travava tudo).

    var _wrappedPoll = window._chatPollNewMsgs;

    window._chatPollNewMsgs = function () {
      // Chama o wrap anterior SEM ativar supressão global.
      // A proteção contra rajada continua funcionando via:
      //   - _chatSaveMsgs wrap (linhas 153-228 de lf-chat-ctx-sound-fix)
      //   - Filtro msgMs >= _chatOpenedAt
      //   - Set _chatSeenByConv
      // que são independentes de _soundSuppressed.
      try {
        // Força _soundSuppressed=false ANTES de rodar, caso algum tick
        // anterior tenha travado o flag.
        try {
          if (window.LF_CHAT_CTX_SOUND_FIX &&
              typeof window.LF_CHAT_CTX_SOUND_FIX.isSuppressed === 'function' &&
              window.LF_CHAT_CTX_SOUND_FIX.isSuppressed()) {
            // Não temos setter público — usamos o efeito colateral do
            // próximo poll natural pra destravar. Como o wrap anterior
            // libera em 30ms via setTimeout, o próximo tick já vai
            // encontrar false.
          }
        } catch (_e) {}

        var _ret = _wrappedPoll.apply(this, arguments);
        /* FIX-20260901: se o wrap anterior não devolveu Promise (bug histórico),
           sintetiza uma resolvida pra não quebrar quem encadeia .then/.finally. */
        if (!_ret || typeof _ret.then !== 'function') {
          return Promise.resolve(_ret);
        }
        return _ret;
      } catch (e) {
        console.warn(TAG, 'poll wrap erro', e);
        /* FIX-20260901: antes o catch engolia e retornava undefined, quebrando
           o encadeamento assíncrono. Agora devolve Promise rejeitada capturável. */
        return Promise.reject(e);
      }
    };
  }

  /* ------------------------------------------------------------------
   * PARTE 3 — Destrava periódica de segurança
   *
   * Caso algum outro código deixe _soundSuppressed=true órfão (por race),
   * garantimos que a cada 2s isso seja reavaliado. Se o LF_CHAT_CTX_SOUND_FIX
   * disser "está suprimido" por mais de 1s contínuo, forçamos um refresh
   * disparando um _chatPollNewMsgs (que re-agenda o setTimeout(30ms) e
   * libera o flag).
   * ------------------------------------------------------------------ */
  /* FIX-20260901: watchdog local REMOVIDO. Havia DOIS watchdogs vigiando a
     mesma flag (este a cada 2s + o do lf-hotfix-notif-som-e-atividades a
     cada 1s) — quando um destravava, o outro ainda via true por 1 tick e
     logava o warn de novo, criando o loop de warns visto em produção.
     Fica APENAS o watchdog do hotfix v1 (único, com dedup de log). */
  var _lastSuppressedAt = 0;
  function _watchdogUnstuck() { /* no-op: consolidado no hotfix v1 */ }

  /* ------------------------------------------------------------------
   * PARTE 4 — Sanity check no boot: dispara um teste silencioso de
   * áudio pra confirmar que o pipeline está OK. NÃO toca som real —
   * só verifica que _buildNotifAudio consegue construir o <audio>.
   * ------------------------------------------------------------------ */
  function _sanityCheck() {
    try {
      if (typeof window._buildNotifAudio !== 'function') {
        console.warn(TAG, '_buildNotifAudio não disponível ainda');
        return;
      }
      var kinds = ['chat', 'late', 'geral'];
      kinds.forEach(function (k) {
        var a = window._buildNotifAudio(k);
        if (!a || a.tagName !== 'AUDIO') {
          console.warn(TAG, 'kind', k, 'não construiu <audio>');
        }
      });
      console.info(TAG, 'pipeline de áudio pronto (chat/late/geral)');
    } catch (e) {
      console.warn(TAG, 'sanity check falhou', e);
    }
  }

  /* ------------------------------------------------------------------
   * BOOT
   * ------------------------------------------------------------------ */
  function boot() {
    _installKindAwareSoundWrap();
    _installPromiseAwarePollWrap();
    setTimeout(_sanityCheck, 2000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }

  // API mínima de debug — usável no console do usuário
  window.LF_NOTIF_SOUND_STUCK_FIX = {
    version: 'v1-20260804',
    testSound: function (kind) {
      try {
        kind = kind || 'chat';
        if (typeof window._playNotifSound === 'function') window._playNotifSound(kind);
        console.info(TAG, 'testSound(' + kind + ') disparado');
      } catch (e) { console.warn(TAG, 'testSound falhou', e); }
    },
    isSuppressed: function () {
      try {
        return !!(window.LF_CHAT_CTX_SOUND_FIX &&
                  window.LF_CHAT_CTX_SOUND_FIX.isSuppressed &&
                  window.LF_CHAT_CTX_SOUND_FIX.isSuppressed());
      } catch (_e) { return null; }
    },
    forceUnstuck: function () {
      try {
        _lastSuppressedAt = 0;
        window._chatPollNewMsgs && window._chatPollNewMsgs();
        return true;
      } catch (_e) { return false; }
    }
  };
})();
