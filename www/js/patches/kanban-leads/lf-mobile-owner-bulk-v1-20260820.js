/* =====================================================================
 * lf-mobile-owner-bulk-v1-20260820.js
 * ---------------------------------------------------------------------
 * PEDIDO: no mobile, ao lado das abas Leads/Negócios, um botão "Dono"
 * que ativa seleção múltipla por toque nos cards, com opção de
 * transferir o responsável pra outro usuário e escolher se continua
 * Lead ou vira Negócio.
 *
 * NÃO REINVENTA NADA: o desktop já tem esse recurso pronto e testado —
 * seleção múltipla (_bulkSelected/toggleBulkSelect), transferir
 * responsável (bulkResp/applyBulkResp/_kbTransferCard) e converter em
 * Negócio (bulkConvert) já existem em js/kanban.js e funcionam via
 * clique nos cards do board desktop. O board MOBILE (renderKBMobile,
 * .mb-card) é uma renderização completamente separada, sem nenhum
 * gancho de seleção — por isso o recurso nunca apareceu lá.
 *
 * Este patch só adiciona o GATILHO mobile:
 *   1) Botão "👤 Dono" (já no HTML, index.html/app.html) liga/desliga
 *      um modo de seleção por board (_mbOwnerMode.leads/.negocios).
 *   2) Um listener em fase de CAPTURA no <body> intercepta cliques em
 *      qualquer .mb-card enquanto o modo está ligado PRO BOARD DAQUELE
 *      card específico — chama toggleBulkSelect() (a mesma função do
 *      desktop) em vez de deixar o clique abrir o detalhe/menu/etc.
 *      Cápture roda ANTES do onclick interno do elemento, então
 *      preventDefault+stopPropagation bloqueiam o comportamento normal
 *      só quando o modo está ativo — fora do modo, os cards funcionam
 *      exatamente como sempre funcionaram.
 *   3) Uma barrinha de ação mobile (já no HTML, mb-owner-bar-<board>)
 *      mostra "Transferir"/"Converter"/"Cancelar" — chamando
 *      bulkResp()/bulkConvert()/clearBulk() (0% de lógica nova, só a
 *      MESMA que o desktop já usa).
 *   4) updateBulkBar() e clearBulk() são envelopadas (sem alterar seu
 *      comportamento original) só pra manter a barrinha mobile e o
 *      destaque do botão "Dono" sincronizados com _bulkSelected,
 *      não importa de onde a mudança veio.
 *
 * Idempotente: guard global.__lfFixMobileOwnerBulkV1.
 * ===================================================================== */
(function (global) {
  'use strict';
  if (global.__lfFixMobileOwnerBulkV1) return;
  global.__lfFixMobileOwnerBulkV1 = true;

  var _mbOwnerMode = { leads: false, negocios: false };

  function _syncOwnerUI() {
    ['leads', 'negocios'].forEach(function (board) {
      var count = (global._bulkSelected || []).filter(function (x) { return x.board === board; }).length;
      var btn = document.getElementById('mb-owner-btn-' + board);
      if (btn) btn.classList.toggle('on', !!_mbOwnerMode[board]);
      var wrap = document.getElementById(board + '-mobile-list');
      if (wrap) wrap.classList.toggle('mb-owner-mode-active', !!_mbOwnerMode[board]);
      var bar = document.getElementById('mb-owner-bar-' + board);
      if (bar) bar.classList.toggle('v', !!_mbOwnerMode[board] && count > 0);
      var cEl = document.getElementById('mb-owner-count-' + board);
      if (cEl) cEl.textContent = count + ' selecionado' + (count !== 1 ? 's' : '');
      var convBtn = document.getElementById('mb-owner-conv-' + board);
      if (convBtn) convBtn.style.display = (board === 'leads' && count > 0) ? '' : 'none';
    });
  }

  // Chamada pelo botão "Dono" (onclick já está no HTML) e pelo "Cancelar"
  // da barra mobile (toggleMbOwnerMode(board, true) força desligar).
  global.toggleMbOwnerMode = function (board, forceOff) {
    if (!board) return;
    if (forceOff || _mbOwnerMode[board]) {
      _mbOwnerMode[board] = false;
      // Limpa só a seleção deste board — se por acaso o outro board também
      // estivesse em modo (não deveria, mas por segurança), preserva.
      if (typeof global._bulkSelected !== 'undefined' && global._bulkSelected.length) {
        var otherHasSelection = global._bulkSelected.some(function (x) { return x.board !== board; });
        if (!otherHasSelection && typeof global.clearBulk === 'function') {
          global.clearBulk();
          return; // clearBulk já chama _syncOwnerUI via wrapper abaixo
        }
        // remove só os itens deste board da seleção, mantém os do outro
        global._bulkSelected = global._bulkSelected.filter(function (x) { return x.board !== board; });
        document.querySelectorAll('.mb-card[data-board="' + board + '"].selected').forEach(function (e) { e.classList.remove('selected'); });
      }
    } else {
      _mbOwnerMode[board] = true;
      try { if (typeof global.toast === 'function') global.toast('Toque nos cards pra selecionar. Toque em "Dono" de novo pra sair.'); } catch (_e) {}
    }
    _syncOwnerUI();
  };

  function _clickIntercept(e) {
    var card = e.target && e.target.closest ? e.target.closest('.mb-card') : null;
    if (!card) return;
    var board = card.getAttribute('data-board');
    if (!board || !_mbOwnerMode[board]) return; // fora do modo — clique normal, não mexe
    e.preventDefault();
    e.stopPropagation();
    var id = card.getAttribute('data-id');
    var ownerUid = card.getAttribute('data-owner') || null;
    if (typeof global.toggleBulkSelect === 'function') global.toggleBulkSelect(id, board, ownerUid, card);
  }

  function _wrapUpdateBulkBar() {
    var orig = global.updateBulkBar;
    if (typeof orig !== 'function' || orig.__lfMbOwnerWrapped) return false;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { _syncOwnerUI(); } catch (_e) {}
      return r;
    };
    wrapped.__lfMbOwnerWrapped = true;
    global.updateBulkBar = wrapped;
    return true;
  }

  function _wrapClearBulk() {
    var orig = global.clearBulk;
    if (typeof orig !== 'function' || orig.__lfMbOwnerWrapped) return false;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      // Uma ação em massa concluída (transferir/converter/mover/etc.)
      // termina em clearBulk() — sai do modo "Dono" nos dois boards,
      // igual o desktop reseta a seleção ao terminar.
      _mbOwnerMode.leads = false;
      _mbOwnerMode.negocios = false;
      try { _syncOwnerUI(); } catch (_e) {}
      return r;
    };
    wrapped.__lfMbOwnerWrapped = true;
    global.clearBulk = wrapped;
    return true;
  }

  function _install() {
    var ok = true;
    ok = _wrapUpdateBulkBar() && ok;
    ok = _wrapClearBulk() && ok;
    return ok;
  }

  document.addEventListener('click', _clickIntercept, true); // captura — roda antes do onclick do card

  var _tries = 0;
  function _boot() {
    if (_install()) return;
    _tries++;
    if (_tries < 40) setTimeout(_boot, 250);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot, { once: true });
  } else {
    _boot();
  }

})(window);
