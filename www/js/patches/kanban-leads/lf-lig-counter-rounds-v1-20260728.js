/* =====================================================================
 * lf-lig-counter-rounds-v1-20260728.js
 * ---------------------------------------------------------------------
 * BUG ORIGINAL (auditoria 2026-07-28)
 * ----------------------------------
 * 1) O widget de bingo (js/agenda.js / bloco LIGAÇÕES COUNTER, linhas
 *    731-758) SOMA a lista atual (_ligMarked, persistida em lf13_lig_*_<uid>_<data>)
 *    em uma única "rodada" de 1..10. Ao chegar em 10, dispara o toast
 *    'BINGO!' uma vez e zera visualmente.
 *
 * 2) O reset (resetLig) esvazia a lista da rodada atual e salva []. A
 *    lista passa a ter 0/1 elementos IMEDIATAMENTE após o reset.
 *
 * 3) O feed ADM (js/relatorios.js / renderAdmLigacoes) lê
 *    `getLigToday(u.id).length` para a "Somatória Hoje". Como essa
 *    leitura é a lista da RODADA ATUAL (não do dia), após reset o ADM
 *    vê "1 ou nenhuma" — mesmo que o consultor tenha feito 20, 30, 40...
 *
 * 4) Não havia NENHUM evento no feed quando o bingo fechava a rodada,
 *    então o ADM não recebia notificação "10 ligações concluídas".
 *
 * O QUE ESTE PATCH FAZ (preservando o comportamento atual)
 * --------------------------------------------------------
 * A) Mantém duas chaves de storage por (uid + data):
 *      lf13_lig_total_<uid>_<data>   → soma acumulada do dia
 *      lf13_lig_rounds_<uid>_<data>  → quantas rodadas de 10 foram
 *                                       completadas HOJE
 *    Essas chaves SOBREVIVEM ao reset (que continua zerando só a
 *    grid atual, como antes — não muda UX do consultor).
 *
 * B) Envelopa window.toggleLig (já existente em js/agenda.js):
 *    - Lê o tamanho da lista ANTES e DEPOIS do clique.
 *    - delta = +1 quando liga, -1 quando desmarca.
 *    - Atualiza o total acumulado do dia com o delta.
 *    - Detecta "transição para 10" (prevRoundLen<10 && afterLen===10).
 *      Quando acontece, incrementa rounds E dispara
 *      logFeedEvent('lig_bingo', uid, ..., 'chamada') que aparece na
 *      timeline do ADM Feed ("completou rodada de BINGO").
 *
 * C) Envelopa window.resetLig (já existente em js/agenda.js):
 *    - NÃO zera o acumulador (a função original já não mexia; aqui só
 *      garantimos por construção).
 *    - Loga uma entrada 'lig_reset' no feed ADM toda vez que o consultor
 *      fecha a rodada atual (com o total acumulado até então).
 *
 * D) Envelopa window._admFeedRenderList (js/relatorios.js) para tornar
 *    legíveis os novos tipos (lig_bingo, lig_reset) — vira "completou
 *    rodada de BINGO" / "reiniciou o contador de ligações" no painel
 *    de Movimentações da equipe.
 *
 * E) Expõe LiderCRM.ligCounterRounds.{getLigTotal(uid,date),
 *    getLigRounds(uid,date)} para o patch de calendário
 *    (lf-adm-feed-datepick-v1-20260728.js) ler totais de QUALQUER dia.
 *
 * GARANTIAS (não muda o que já funciona)
 * --------------------------------------
 * - Não mexe em js/agenda.js, js/relatorios.js, no Worker, no banco, no
 *   auth, no kanban, no chat, no feed-runtime.js. Apenas adiciona um
 *   wrapper em window.
 * - Idempotente: guard window.__LF_LIG_COUNTER_ROUNDS_V1__ impede
 *   reinstalação em hot-reload.
 * - Não altera o formato de getLigToday()/ligKey(). Quem consumir isso
 *   de fora continua enxergando o mesmo array [{n,hora}].
 * - Tracker de data baseado em global.today() — quando virar o dia,
 *   as chaves mudam (lf13_lig_*_<uid>_<YYYY-MM-DD>) e o histórico
 *   anterior fica preservado para consulta futura.
 * ===================================================================== */
(function(global){
  'use strict';
  if(global.__LF_LIG_COUNTER_ROUNDS_V1__){return;}
  global.__LF_LIG_COUNTER_ROUNDS_V1__=true;

  var TAG='[lf-lig-counter-rounds]';
  function _log(){try{if(global.console&&console.debug)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{if(global.console&&console.warn)console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _todayFn(){
    if(typeof global.today==='function')return global.today();
    var d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function _totalKey(uid,date){return 'lf13_lig_total_'+(uid||'')+'_'+(date||_todayFn());}
  function _roundsKey(uid,date){return 'lf13_lig_rounds_'+(uid||'')+'_'+(date||_todayFn());}

  function _ss(k,v){try{if(typeof global.ss==='function')global.ss(k,v);}catch(_e){}}
  function _sg(k){try{if(typeof global.sg==='function')return global.sg(k);return null;}catch(_e){return null;}}

  function getLigTotal(uid,date){var v=_sg(_totalKey(uid,date));return (typeof v==='number'&&v>0)?v:(parseInt(v,10)||0);}
  function getLigRounds(uid,date){var v=_sg(_roundsKey(uid,date));return (typeof v==='number'&&v>0)?v:(parseInt(v,10)||0);}

  function _setTotal(uid,date,v){_ss(_totalKey(uid,date),Math.max(0,v|0));}
  function _setRounds(uid,date,v){_ss(_roundsKey(uid,date),Math.max(0,v|0));}

  function _uidNow(){
    try{return (global.S&&global.S.userId)||null;}catch(_e){return null;}
  }

  function _listLenNow(uid){
    try{
      if(typeof global.getLigToday==='function'){
        var arr=global.getLigToday(uid)||[];
        return arr.length;
      }
    }catch(_e){}
    return 0;
  }

  /* Envolve toggleLig: cada clique gera +1 ou -1 no total do dia;
     ao cruzar o 10 (transição de 9 para 10), loga evento no feed e
     incrementa rounds. Tudo idempotente. */
  function _wrapToggleLig(){
    var orig=global.toggleLig;
    if(typeof orig!=='function'){
      _warn('toggleLig ausente — aguardando js/agenda.js carregar…');
      setTimeout(_install,250);
      return false;
    }
    if(orig.__lfRoundsWrapped)return true;

    global.toggleLig=function(n){
      var uid=_uidNow();
      var today=_todayFn();
      var beforeLen=_listLenNow(uid);

      var ret=orig.apply(this,arguments);

      var afterLen=_listLenNow(uid);
      var delta=afterLen-beforeLen; // +1 ligou, -1 desligou
      if(delta===0)return ret;

      if(delta>0){
        var tBefore=getLigTotal(uid,today);
        var newTotal=tBefore+1;
        _setTotal(uid,today,newTotal);

        // BINGO: prevRound < 10 && agora === 10 (transição limpa)
        var prevRoundLen=beforeLen;
        if(prevRoundLen<10 && afterLen===10){
          var rBefore=getLigRounds(uid,today);
          var newRounds=rBefore+1;
          _setRounds(uid,today,newRounds);
          try{
            if(typeof global.logFeedEvent==='function'){
              var labelRodada = newRounds+'\u00aa rodada';
              global.logFeedEvent(
                'lig_bingo',
                uid,
                '\uD83C\uDFAF BINGO! '+labelRodada+' de liga\u00e7\u00f5es (10/10)',
                'Acumulado do dia: '+newTotal+' liga\u00e7\u00f5es em '+newRounds+' rodada'+(newRounds!==1?'s':''),
                'agenda',
                'chamada'
              );
            }
          }catch(_e){_warn('logFeedEvent falhou',_e);}
        }
      }else if(delta<0){
        // Ao desmarcar uma c\u00e9lula j\u00e1 contabilizada: rollback conservador
        var t=getLigTotal(uid,today);
        if(t>0)_setTotal(uid,today,t-1);
      }
      return ret;
    };
    global.toggleLig.__lfRoundsWrapped=true;
    _log('toggleLig envolvido');
    return true;
  }

  /* Envolve resetLig: mant\u00e9m o acumulador (que \u00e9 do dia) e loga
     um evento de "rodada fechada" no feed ADM para o supervisor saber
     que o consultor continuou marcando. */
  function _wrapResetLig(){
    var orig=global.resetLig;
    if(typeof orig!=='function'){
      _warn('resetLig ausente — aguardando js/agenda.js carregar…');
      setTimeout(_install,250);
      return false;
    }
    if(orig.__lfRoundsWrapped)return true;

    global.resetLig=function(){
      var uid=_uidNow();
      var today=_todayFn();
      var totalAntes=getLigTotal(uid,today);
      var roundsAntes=getLigRounds(uid,today);
      // S\u00f3 registra "rodada fechada" se houver contagem no grid atual
      // (evita poluir feed na primeira vez que o consultor abre o bingo).
      var gridLenAntes=_listLenNow(uid);

      var ret=orig.apply(this,arguments);

      try{
        if(typeof global.logFeedEvent==='function' && gridLenAntes>0){
          var totalDepois=getLigTotal(uid,today);
          global.logFeedEvent(
            'lig_reset',
            uid,
            '\uD83D\uDD04 Contador de liga\u00e7\u00f5es reiniciado',
            'Acumulado do dia: '+totalDepois+' liga\u00e7\u00f5es em '+roundsAntes+' rodada'+(roundsAntes!==1?'s':'')+' — continua contando',
            'agenda',
            'chamada'
          );
        }
      }catch(_e){_warn('logFeedEvent (reset) falhou',_e);}
      return ret;
    };
    global.resetLig.__lfRoundsWrapped=true;
    _log('resetLig envolvido');
    return true;
  }

  /* Torna os tipos novos (lig_bingo / lig_reset) leg\u00edveis no ADM feed.
     O renderizador original (js/relatorios.js / _admFeedRenderList) gera
     o HTML e usa um dicion\u00e1rio tL fixo — substitu\u00edmos o texto
     literal p\u00f3s-render. */
  function _wrapAdmFeedRender(){
    var orig=global._admFeedRenderList;
    if(typeof orig!=='function'){
      _warn('_admFeedRenderList ausente — aguardando js/relatorios.js carregar…');
      setTimeout(_install,250);
      return false;
    }
    if(orig.__lfBingoLabel)return true;
    global._admFeedRenderList=function(){
      var ret=orig.apply(this,arguments);
      try{
        var lbls={
          'lig_bingo':'completou rodada de BINGO \uD83C\uDFAF',
          'lig_reset':'reiniciou o contador de liga\u00e7\u00f5es'
        };
        var items=document.querySelectorAll('#adm-feed-list .adm-feed-item .adm-feed-txt');
        items.forEach(function(txt){
          if(!txt)return;
          var h=txt.innerHTML;
          var changed=false;
          Object.keys(lbls).forEach(function(k){
            var re=new RegExp('\\b'+k+'\\b','g');
            if(re.test(h)){h=h.replace(re,lbls[k]);changed=true;}
          });
          if(changed)txt.innerHTML=h;
        });
      }catch(_e){_warn('p\u00f3s-render do ADM feed falhou',_e);}
      return ret;
    };
    global._admFeedRenderList.__lfBingoLabel=true;
    _log('_admFeedRenderList envolvido (labels do bingo)');
    return true;
  }

  function _install(){
    if(!global.S||!global.S.userId){
      // sem sess\u00e3o ainda — tenta no pr\u00f3ximo tick
      setTimeout(_install,300);
      return;
    }
    if(!_wrapToggleLig())return;
    if(!_wrapResetLig())return;
    _wrapAdmFeedRender();

    // Reconcilia\u00e7\u00e3o leve: se o consultor j\u00e1 tinha hist\u00f3rico
    // (lista com 10 itens E rounds=0 no storage novo) — s\u00f3 sinaliza
    // um evento retroativo inicial para o ADM n\u00e3o estranhar a
    // discrep\u00e2ncia na primeira renderiza\u00e7\u00e3o ap\u00f3s o patch.
    try{
      var uid=global.S.userId;
      var today=_todayFn();
      var total=getLigTotal(uid,today);
      var rounds=getLigRounds(uid,today);
      var curLen=_listLenNow(uid);
      if(curLen===10 && total===0 && rounds===0 && typeof global.logFeedEvent==='function'){
        _setTotal(uid,today,10);
        _setRounds(uid,today,1);
        global.logFeedEvent(
          'lig_bingo',
          uid,
          '\uD83C\uDFAF BINGO! 1\u00aa rodada de liga\u00e7\u00f5es (10/10)',
          'Acumulado do dia: 10 liga\u00e7\u00f5es em 1 rodada \u2014 reconcilia\u00e7\u00e3o inicial do patch',
          'agenda',
          'chamada'
        );
      }
    }catch(_e){/* no-op */}

    // API p\u00fablica (consumida pelo patch de calend\u00e1rio)
    global.LiderCRM=global.LiderCRM||{};
    global.LiderCRM.ligCounterRounds={
      getLigTotal:getLigTotal,
      getLigRounds:getLigRounds,
      resetDay:function(uid,date){
        _setTotal(uid,date||_todayFn(),0);
        _setRounds(uid,date||_todayFn(),0);
      }
    };

    _log('patch instalado');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{
    _install();
  }
})(window);
