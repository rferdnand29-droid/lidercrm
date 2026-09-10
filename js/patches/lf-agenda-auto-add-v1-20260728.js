/* ============================================================
 * lf-agenda-auto-add-v1-20260728.js
 * ------------------------------------------------------------
 * PEDIDO: além do lembrete automático que já abre sozinho quando um
 * card de Negócios entra em "AG Vídeo" ou "Presencial" (ver
 * js/notificacoes.js -> _autoOpenReminderFor), agora, assim que esse
 * lembrete é resolvido (salvo ou cancelado), o sistema pergunta:
 *
 *     "Deseja adicionar esse cliente na agenda também?"
 *
 *   - SIM  -> abre o modal padrão "Novo Agendamento" (mo-agd) já com
 *             o nome do cliente e o nicho preenchidos automaticamente
 *             a partir do próprio card/lead. Só falta escolher
 *             data/horário e clicar em Salvar — vai direto pra agenda.
 *   - NÃO  -> não faz mais nada. Fica só o lembrete, como já era.
 *
 * QUANDO DISPARA (mesmos 2 gatilhos do lembrete automático, mas só
 * quando a etapa final do card é "AG Vídeo" ou "Presencial"):
 *   1) Card de Negócios movido para AG Vídeo/Presencial
 *      (js/relatorios.js, _kbMoveCard, linha do _autoOpenReminderFor).
 *   2) Lead convertido em Negócio já direto numa dessas duas etapas
 *      (js/relatorios.js, convertToNeg).
 * Isso cobre exatamente "todos os fluxos que um lead for pra AG Vídeo
 * ou Presencial" pedidos, sem alterar o comportamento pra outras
 * etapas (ex.: card entrando em "Retornar" continua só com o
 * lembrete, sem a pergunta extra).
 *
 * NÃO dispara:
 *  - Em ações em massa (bulk) — igual ao lembrete automático, que já
 *    ignora bulk pra não abrir vários modais em sequência.
 *  - Quando a automação de lembretes está desligada em Configurações
 *    (isAutoReminderOn()===false) — a pergunta de agenda é um passo
 *    A MAIS do mesmo fluxo, então segue o mesmo interruptor.
 *  - Quando o "Adicionar Lembrete" é aberto manualmente (botão do
 *    card, atalho do menu de contexto) — só entra no fluxo quando o
 *    lembrete foi aberto pela AUTOMAÇÃO, pra não incomodar o usuário
 *    toda vez que ele mesmo abrir um lembrete de um card qualquer que
 *    por acaso já esteja em AG Vídeo/Presencial.
 *
 * Estilo: wrappers idempotentes (mesmo padrão dos outros patches
 * lf-*, ex. lf-flow-hardening-v1). Não altera HTML/CSS existente —
 * o modal de confirmação e o toast de dica são criados via DOM, na
 * hora, e removidos assim que fecham. Não remove nem substitui
 * nenhuma feature existente.
 * ============================================================ */
(function(global){
  'use strict';
  if(global.__lfAgendaAutoAddV1) return;
  global.__lfAgendaAutoAddV1 = true;

  var TAG = '[lf-agenda-auto-add]';
  function _log(){ try{ console.info.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }
  function _warn(){ try{ console.warn.apply(console, [TAG].concat([].slice.call(arguments))); }catch(_e){} }

  /* Etapas de Negócios que disparam a pergunta extra. */
  var TARGET_COLS = { agvid: true, presencial: true };

  /* Guarda o card (Negócio) que acabou de ganhar o lembrete automático
     e que ainda precisa da pergunta "adicionar na agenda também?".
     Só existe 1 por vez — igual ao lembrete automático, que também só
     dispara pra 1 card por ação explícita do usuário. */
  var _pending = null;

  function _hasDeps(){
    return typeof global._autoOpenReminderFor === 'function' &&
           typeof global.closeM === 'function' &&
           typeof global.getKBFor === 'function';
  }

  /* --------------------------------------------------------------
   * PASSO 1: no exato momento em que o lembrete automático dispara,
   * decide se este card também é candidato à pergunta de agenda —
   * usando o estado do card JÁ ATUALIZADO (col já é agvid/presencial
   * nesse ponto, tanto em _kbMoveCard quanto em convertToNeg, que
   * gravam o card antes de chamar _autoOpenReminderFor).
   * -------------------------------------------------------------- */
  function _hookAutoOpenReminder(){
    if(typeof global._autoOpenReminderFor !== 'function') return;
    if(global._autoOpenReminderFor.__lfAgendaAutoAdd) return;
    var orig = global._autoOpenReminderFor;
    var wrapped = function(cardId, board, ownerUid){
      try{
        var reminderOn = (typeof global.isAutoReminderOn === 'function') ? global.isAutoReminderOn() : true;
        if(reminderOn && board === 'negocios'){
          var uid = ownerUid || (global.S && global.S.userId);
          var arr = (typeof global.getKBFor === 'function') ? (global.getKBFor(board, uid) || []) : [];
          var card = arr.filter(function(c){ return c && c.id === cardId; })[0];
          if(card && TARGET_COLS[card.col]){
            _pending = {
              cardId: cardId,
              board: board,
              ownerUid: uid,
              nome: card.name || '',
              nicho: card.nicho || '',
              col: card.col
            };
          } else {
            // Card não está numa etapa-alvo (ex.: lembrete disparado por
            // conversão de Lead pra uma etapa que não é agvid/presencial)
            // — não empilha pendência de outro card.
            _pending = null;
          }
        }
      }catch(e){ _warn('falha ao avaliar card p/ pergunta de agenda', e); }
      return orig.apply(this, arguments);
    };
    wrapped.__lfAgendaAutoAdd = true;
    global._autoOpenReminderFor = wrapped;
  }

  /* --------------------------------------------------------------
   * PASSO 2: quando o modal do lembrete (mo-quick-act) fecha — seja
   * porque o usuário salvou (saveQuickActivity), cancelou, ou clicou
   * fora — e existe uma pendência batendo com o card que estava
   * mesmo aberto ali, mostra a pergunta de agenda.
   * Confere _kbDetId/_kbDetBoard/_kbDetOwnerUid (contexto real do
   * modal que acabou de fechar) contra o _pending, pra não disparar
   * a pergunta errada caso o usuário tenha aberto/fechado outro
   * lembrete manualmente entre o disparo automático e o fechamento.
   * -------------------------------------------------------------- */
  function _hookCloseM(){
    if(typeof global.closeM !== 'function') return;
    if(global.closeM.__lfAgendaAutoAdd) return;
    var orig = global.closeM;
    var wrapped = function(id){
      var sameCard = _pending &&
        id === 'mo-quick-act' &&
        global._kbDetId === _pending.cardId &&
        global._kbDetBoard === _pending.board;
      var toAsk = sameCard ? _pending : null;
      _pending = null; // consumida (ou descartada) — nunca reaproveita
      var res = orig.apply(this, arguments);
      if(toAsk){
        // pequeno atraso pra deixar a animação de fechamento do
        // lembrete terminar antes de abrir a pergunta seguinte —
        // mesmo padrão de atraso já usado em _autoOpenReminderFor.
        setTimeout(function(){ _askAddToAgenda(toAsk); }, 260);
      }
      return res;
    };
    wrapped.__lfAgendaAutoAdd = true;
    global.closeM = wrapped;
  }

  /* --------------------------------------------------------------
   * Modal de confirmação "Deseja adicionar na agenda também?".
   * Criado via DOM (não depende de HTML novo em index.html/app.html),
   * com estilo inline auto-suficiente — não depende de nenhuma regra
   * CSS externa pra aparecer, então funciona mesmo se o tema mudar.
   * -------------------------------------------------------------- */
  function _askAddToAgenda(pending){
    if(document.getElementById('lf-agd-ask')) return; // já tem uma pergunta na tela
    var etapaLbl = (pending.col === 'presencial') ? 'Presencial' : 'AG Vídeo';
    var nomeSeg = (typeof global.eH === 'function') ? global.eH(pending.nome) : String(pending.nome || '');

    var host = document.createElement('div');
    host.id = 'lf-agd-ask';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;'
      + 'padding:16px;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';

    host.innerHTML =
      '<div style="width:100%;max-width:380px;background:rgba(17,20,24,.97);border:1px solid rgba(255,255,255,.08);'
        + 'border-radius:18px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.6);font-family:Outfit,sans-serif;color:#fff;">'
        + '<div style="font-size:1.02rem;font-weight:600;margin-bottom:6px;">🗓️ Adicionar na agenda também?</div>'
        + '<div style="font-size:.82rem;color:rgba(255,255,255,.7);line-height:1.5;margin-bottom:16px;">'
          + '<strong>' + nomeSeg + '</strong> acabou de entrar em <strong>' + etapaLbl + '</strong>. '
          + 'Se confirmar, já criamos o agendamento com o nome do cliente preenchido — '
          + 'só falta escolher data e horário e salvar.'
        + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">'
          + '<button type="button" data-act="no" style="padding:9px 16px;border-radius:10px;border:1.5px solid rgba(255,255,255,.14);'
            + 'background:transparent;color:#fff;font-family:inherit;font-size:.82rem;cursor:pointer;">Não</button>'
          + '<button type="button" data-act="yes" style="padding:9px 16px;border-radius:10px;border:none;'
            + 'background:var(--al,#c39a2d);color:#141414;font-family:inherit;font-weight:600;font-size:.82rem;cursor:pointer;">'
            + 'Sim, adicionar</button>'
        + '</div>'
      + '</div>';

    document.body.appendChild(host);

    function _close(){ try{ host.remove(); }catch(_e){} }

    host.addEventListener('click', function(e){
      if(e.target === host){ _close(); return; } // clicar fora = recusar, só fica o lembrete
      var act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
      if(!act) return;
      if(act === 'no'){ _close(); return; }
      if(act === 'yes'){ _close(); _openAgdPrefilled(pending); return; }
    });

    // Foco inicial no botão "Sim" — ação mais provável, agiliza quem usa teclado.
    var yesBtn = host.querySelector('[data-act="yes"]');
    if(yesBtn) yesBtn.focus();
  }

  /* Nichos válidos no select de agendamento (agd-f-nicho) — os mesmos
     valores usados no select de nicho do Lead/Negócio (kb-nicho), por
     isso dá pra reaproveitar o valor do card direto, sem conversão. */
  var VALID_NICHOS = { imovel: true, caminhao: true, carro: true, pesados: true, outro: true };

  /* --------------------------------------------------------------
   * Abre o modal padrão de "Novo Agendamento" (mo-agd) já com nome do
   * cliente e nicho preenchidos a partir do card de origem. Reaproveita
   * 100% o fluxo normal de salvar (agdSave/agdDoSave) — nenhuma escrita
   * direta na agenda por fora do caminho já existente e testado.
   * -------------------------------------------------------------- */
  function _openAgdPrefilled(pending){
    if(typeof global.agdOpenNew !== 'function'){
      _warn('agdOpenNew indisponível — não foi possível abrir o agendamento.');
      if(typeof global.toast === 'function') global.toast('⚠️ Não foi possível abrir a agenda automaticamente.');
      return;
    }
    // agdOpenNew já seta consultor = usuário logado, data = hoje/última
    // selecionada e status = "Agendado" por padrão — só sobra pra gente
    // completar cliente e nicho.
    global.agdOpenNew();

    var cliInp = document.getElementById('agd-f-cli');
    if(cliInp) cliInp.value = pending.nome || '';

    var nichoSel = document.getElementById('agd-f-nicho');
    if(nichoSel && pending.nicho && VALID_NICHOS[pending.nicho]) nichoSel.value = pending.nicho;

    // Se o card também tem um consultor específico (dono do negócio),
    // já deixa selecionado — evita agendar sem querer pra outra pessoa.
    var consSel = document.getElementById('agd-f-cons');
    if(consSel && pending.ownerUid){
      var hasOpt = Array.prototype.some.call(consSel.options, function(o){ return o.value === pending.ownerUid; });
      if(hasOpt) consSel.value = pending.ownerUid;
    }

    if(typeof global.agdCheckConflictLive === 'function') global.agdCheckConflictLive();

    // Foca direto no campo de data — é literalmente só o que falta
    // preencher (junto do horário) antes de Salvar.
    var dataInp = document.getElementById('agd-f-data');
    if(dataInp){ try{ dataInp.focus(); }catch(_e){} }

    if(typeof global.toast === 'function'){
      global.toast('Cliente e nicho já preenchidos — escolha data e horário e salve.');
    }
  }

  /* --------------------------------------------------------------
   * Boot: tenta plugar os hooks agora; se algum dos globais ainda não
   * existir (ordem de carregamento dos <script>), tenta de novo em
   * seguida, poucas vezes, sem travar o boot do app.
   * -------------------------------------------------------------- */
  function _tryInstall(attemptsLeft){
    if(_hasDeps()){
      _hookAutoOpenReminder();
      _hookCloseM();
      _log('instalado.');
      return;
    }
    if(attemptsLeft <= 0){
      _warn('dependências não encontradas (_autoOpenReminderFor/closeM/getKBFor) — patch não instalado.');
      return;
    }
    setTimeout(function(){ _tryInstall(attemptsLeft - 1); }, 300);
  }

  _tryInstall(10);

})(window);
