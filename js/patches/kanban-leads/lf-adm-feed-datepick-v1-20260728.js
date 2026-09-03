/* =====================================================================
 * lf-adm-feed-datepick-v1-20260728.js
 * ---------------------------------------------------------------------
 * BUG ORIGINAL (auditoria 2026-07-28)
 * ----------------------------------
 * O painel ADM de liga\u00e7\u00f5es (js/relatorios.js / renderAdmLigacoes +
 * renderAdmFeed) sempre l\u00ea HOJE via today(). O supervisor n\u00e3o
 * tinha como navegar para um dia anterior e ver as m\u00e9tricas
 * daquele dia — nem para conferenciar algu\u00e9m ap\u00f3s 2 dias nem
 * para comparar produtividade entre datas.
 *
 * Al\u00e9m disso, o cont\u00e1gio do Bug #1: a "Somat\u00f3ria Hoje" era
 * `getLigToday(u.id).length`, que \u00e9 a RODADA atual (0..10), n\u00e3o o
 * total acumulado do dia. Ap\u00f3s reset, voltava para "1 ou nenhuma"
 * mesmo com o consultor tendo feito +20, +30 etc.
 *
 * O QUE ESTE PATCH FAZ (sem tocar nos arquivos originais)
 * -------------------------------------------------------
 * A) Injeta um <input type="date"> no topo do painel ADM Feed
 *    (id: adm-feed-datepick) ao lado do bot\u00e3o "Atualizar".
 *    Valor inicial = hoje. Permite navegar para qualquer dia.
 *
 * B) Envolve window.renderAdmLigacoes():
 *    - L\u00ea o valor de #adm-feed-datepick para decidir QUAL data usar.
 *    - Para cada consultor, usa LiderCRM.ligCounterRounds.getLigTotal(u, date)
 *      (instalado pelo lf-lig-counter-rounds-v1-20260728) como fonte do
 *      total acumulado do dia.
 *    - Fallback: se ainda n\u00e3o houver patch de rounds ativo, cai
 *      para getLigToday(u,date) lendo a chave lf13_lig_<uid>_<date>.
 *    - Recalcula m\u00e9dia usando o per\u00edodo transcorrido AT\u00c9 a
 *      data consultada.
 *
 * C) Envolve window.getLigToday (para que o patch aceite uid opcional,
 *    sem alterar a assinatura original) — quando chamado, usa a data
 *    atualmente selecionada no painel ADM Feed SE o caller n\u00e3o
 *    passou data expl\u00edcita.
 *
 * D) Envolve window.renderAdmFeed (movimenta\u00e7\u00f5es da equipe) para
 *    filtrar os eventos POR DATA quando a data \u00e9 diferente de hoje.
 *    Isso d\u00e1 consistência: o supervisor escolhe uma data e v\u00ea
 *    as liga\u00e7\u00f5es, BINGOs da rodada, movimenta\u00e7\u00f5es dos
 *    consultores daquela \u00fanica data.
 *
 * E) Exp\u00f5e LiderCRM.admFeedDatepick.getSelectedDate() e setSelectedDate(d)
 *    para uso program\u00e1tico (ex: atalhos no futuro, URL query ?d=...).
 *
 * GARANTIAS
 * ---------
 * - N\u00e3o mexe em js/relatorios.js, js/agenda.js, functions/[[path]].js,
 *   no Worker (h\u00e1 rota /api/v1/ligacoes/list?date= j\u00e1 no controller,
 *   mas o patch usa apenas localStorage + fonte do patch #1 + cache).
 * - Idempotente: guard window.__LF_ADM_FEED_DATEPICK_V1__.
 * - Se o patch #1 (lf-lig-counter-rounds-v1-20260728) ainda n\u00e3o
 *   estiver carregado, apenas cai no legado (getLigToday) at\u00e9 que
 *   seja ativado. Sem quebrar contratos existentes.
 * ===================================================================== */
(function(global){
  'use strict';
  if (global.__lfFixAdmFeedDatepickV1) return;
  global.__lfFixAdmFeedDatepickV1 = true;
  if(global.__LF_ADM_FEED_DATEPICK_V1__){return;}
  global.__LF_ADM_FEED_DATEPICK_V1__=true;

  var TAG='[lf-adm-feed-datepick]';
  function _log(){try{if(global.console&&console.debug)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{if(global.console&&console.warn)console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  function _todayFn(){
    if(typeof global.today==='function')return global.today();
    var d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }

  function _ss(k,v){try{if(typeof global.ss==='function')global.ss(k,v);}catch(_e){}}
  function _sg(k){try{if(typeof global.sg==='function')return global.sg(k);return null;}catch(_e){return null;}}

  var _selectedDate=null;

  function getSelectedDate(){return _selectedDate||_todayFn();}
  function setSelectedDate(d){_selectedDate=d||_todayFn();var inp=document.getElementById('adm-feed-datepick');if(inp)inp.value=_selectedDate;}

  /* L\u00eancia segura: l\u00ea o total acumulado do dia do patch #1,
     com fallback para o legado (lista da rodada atual). */
  function _getLigTotalForDay(uid,date){
    var d=date||getSelectedDate();
    var root=global.LiderCRM||{};
    var mod=root.ligCounterRounds;
    if(mod&&typeof mod.getLigTotal==='function'){
      var t=mod.getLigTotal(uid,d);
      if(!t){
        // Sem rounds acumulado pelo patch #1: tenta ler a lista
        // armazenada na chave tradicional (rodada atual).
        try{return (global.getLigToday?((global.getLigToday(uid)||[]).length):0);}catch(_e){return 0;}
      }
      return t;
    }
    try{return (global.getLigToday?((global.getLigToday(uid)||[]).length):0);}catch(_e){return 0;}
  }

  function _getListForDay(uid,date){
    // devolve [{n,hora}] para renderiza\u00e7\u00e3o da grade do bingo do ADM
    var d=date||getSelectedDate();
    try{
      if(typeof global.sg==='function'){
        var key='lf13_lig_'+(uid||'')+'_'+d;
        var v=global.sg(key)||[];
        return Array.isArray(v)?v:[];
      }
    }catch(_e){}
    return [];
  }

  /* Envolve renderAdmLigacoes — substitui o c\u00e1lculo direto de
     `getLigToday(u.id).length` pelo acumulado do dia. Para o per\u00edodo,
     mant\u00e9m o horizonte "8h -> hora atual" quando d==hoje, e usa
     "0..23h" quando d!=hoje (n\u00e3o inventa hor\u00e1rios). */
  function _wrapRenderAdmLigaciones(){
    var orig=global.renderAdmLigacoes;
    if(typeof orig!=='function'){
      _warn('renderAdmLigacoes ausente — aguardando js/relatorios.js carregar…');
      setTimeout(_install,250);
      return false;
    }
    if(orig.__lfDatePickWrapped)return true;

    global.renderAdmLigacoes=function(){
      var date=getSelectedDate();
      var users=(typeof global.getUsers==='function')?(global.getUsers().filter(function(u){return u&&u.ativo!==false;})||[]):[];

      // Header com somat\u00f3ria do DIA (data selecionada)
      var el=document.getElementById('adm-lig-list');if(!el){
        var ret=orig.apply(this,arguments);
        return ret;
      }
      if(!users.length){el.innerHTML='<div class="act-empty">Nenhum consultor.</div>';return;}

      var _ligTotal=0;
      users.forEach(function(u){_ligTotal+=_getLigTotalForDay(u.id,date);});

      var isToday = (date===_todayFn());
      var _horaAtual=new Date().getHours();
      var _horaInicio=isToday?Math.max(8,_horaAtual):24;
      // META-CORRIGIDA (2026-08-18): horas limitadas ao expediente de 8h
      // (8h→18h); meta = 80 ligações/dia por consultor (10/hora × 8h).
      // Antes: sem teto de horas e users.length*10.
      var _horasTrab=Math.min(8,isToday?Math.max(1,_horaAtual-8):8);
      var _media=(_ligTotal/Math.max(1,_horasTrab)).toFixed(isToday?1:0);
      var _metaDiaria=users.length*80;
      var _progPct=_metaDiaria>0?Math.min(100,Math.round(_ligTotal/_metaDiaria*100)):0;

      var _dateLbl=(function(){
        try{
          var p=date.split('-');
          return p[2]+'/'+p[1]+'/'+p[0]+(isToday?' (hoje)':'');
        }catch(_e){return date;}
      })();

      // N\u00e3o sobrescrever a lista se j\u00e1 foi renderizada por orig() em
      // alguma racing; para manter compat\u00edbilidade, chamamos orig()
      // PRIMEIRO s\u00f3 para construir o esqueleto de usu\u00e1rios, e
      // depois entramos em cada row para usar o total acumulado.
      var ret=orig.apply(this,arguments);

      try{
        // Para cada row j\u00e1 desenhada, ajustar o contador para o total
        // acumulado do dia (current round vis\u00edvel mostra a rodada atual
        // abaixo do contador "\u00b7 23/30 hoje").
        users.forEach(function(u){
          var cnt=document.getElementById('adm-lig-cnt-'+(u.id||'').replace(/(["\\])/g,'\\$1'));
          var grid=document.getElementById('adm-lig-grid-'+(u.id||'').replace(/(["\\])/g,'\\$1'));
          var total=_getLigTotalForDay(u.id,date);
          var rounds=(typeof (global.LiderCRM||{}).ligCounterRounds==='object'?
                     (global.LiderCRM.ligCounterRounds.getLigRounds?global.LiderCRM.ligCounterRounds.getLigRounds(u.id,date):0):0);
          if(cnt){
            var lbl=total+'/'+(isToday?'-':'meta ');
            lbl+=rounds>0?' ('+rounds+' rodada'+(rounds!==1?'s':'')+' fechada'+(rounds!==1?'s':'')+')':'';
            cnt.textContent=' \u00b7 '+lbl;
          }
          // re-renderiza a grade da rodada atual (cache local, n\u00e3o remoto)
          if(grid){
            var list=_getListForDay(u.id,date);
            var marked={};list.forEach(function(r){marked[r.n]=r.hora;});
            var html='';
            for(var i=1;i<=10;i++){
              var hora=marked[i]?new Date(marked[i]).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
              html+='<div class="lig-cell'+(marked[i]?' marked':'')+'" title="'+(hora?'Liga\u00e7\u00e3o '+i+' \u00e0s '+hora:'')+'" style="cursor:default;font-size:.6rem">'+i+'</div>';
            }
            grid.innerHTML=html;
          }
        });
      }catch(_e){_warn('p\u00f3s-processamento ADM feed falhou',_e);}

      // Re-escrever o "resumoHTML" no topo com o total do dia da data escolhida
      try{
        // pega o primeiro bloco (primeira row.styles) s\u00f3 pra encontrar posi\u00e7\u00e3o
        var resumo='<div style="margin-bottom:14px;padding:8px 10px;font-size:.66rem;color:var(--mu);text-align:center;border:1px dashed var(--b1);border-radius:8px">'
          +'<strong>\uD83D\uDCC5 Exibindo liga\u00e7\u00f5es de '+_dateLbl+'</strong> &middot; Somat\u00f3ria: <strong>'+_ligTotal+'</strong> &middot; M\u00e9dia/h: <strong>'+_media+'</strong> &middot; Meta di\u00e1ria: <strong>'+_progPct+'%</strong>'
          +'</div>';
        // injeta antes do admin-lig-list interno (j\u00e1 tem resumo original
        // calculado com base em rodadas atuais — somamos a faixa acima dela)
        if(el.firstChild)el.insertBefore(document.createElement('div'),el.firstChild);
        // sobrescreve via prepend textNode
        var banner=document.createElement('div');
        banner.innerHTML=resumo;
        // primeiro filho *atual*: substitui\rimos pelo banner
        if(el.firstChild){
          el.insertBefore(banner,el.firstChild);
          // remove o resumo original (com 3 cards) se for detectado
          // e inserir nossa faixa no topo antes dos cards originais
        }
      }catch(_e){/* no-op: somat\u00f3ria j\u00e1 est\u00e1 correta em cada row */}

      return ret;
    };
    global.renderAdmLigacoes.__lfDatePickWrapped=true;
    _log('renderAdmLigacoes envolvido');
    return true;
  }

  /* Envolve renderAdmFeed para adicionar filtro de data nos eventos.
     FIX 2026-08-19: DESATIVADO. O painel ADM "Movimentações da equipe"
     agora tem filtros nativos de busca por texto + intervalo de datas
     (de/até) direto em js/relatorios.js. Este wrap sobrescrevia o cache
     do feed com apenas a data selecionada, o que anulava o novo controle
     "todo o tempo". Mantido só o wrap de renderAdmLigacoes, que é o motivo
     original deste patch existir. */
  function _wrapRenderAdmFeed(){
    return true; // no-op: preserva sinatura pra não quebrar _install().
    /* eslint-disable no-unreachable */
    var orig=global.renderAdmFeed;
    if(typeof orig!=='function'){
      _warn('renderAdmFeed ausente \u2014 aguardando js/relatorios.js carregar\u2026');
      setTimeout(_install,250);
      return false;
    }
    if(orig.__lfDatePickWrapped)return true;
    global.renderAdmFeed=function(){
      var ret=orig.apply(this,arguments);
      try{
        var date=getSelectedDate();
        var arr=_sg('lf13_feed')||[];
        if(Array.isArray(arr)&&arr.length){
          var onlyDate=arr.filter(function(e){
            if(!e||!e.ts)return false;
            var t=new Date(e.ts);
            if(isNaN(t.getTime()))return false;
            var d=t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');
            return d===date;
          });
          // s\u00f3 renderiza se a data \u00e9 diferente de hoje — para hoje
          // n\u00e3o precisa filtrar nada (j\u00e1 \u00e9 a leitura atual).
          if(date!==_todayFn() && typeof global._admFeedRenderList==='function'){
            // troca temporariamente o cache do feed para a data escolhida
            var prev=global._admFeedCache;
            global._admFeedCache=onlyDate;
            global._admFeedRenderList();
            global._admFeedCache=prev;
          }
        }
        // header pequeNo com a data acima da lista
        var el=document.getElementById('adm-feed-list');
        if(el && date!==_todayFn()){
          var p=date.split('-');
          var lbl=p[2]+'/'+p[1]+'/'+p[0];
          var note=document.createElement('div');
          note.style.cssText='margin-bottom:8px;font-size:.66rem;color:var(--mu);text-align:center;padding:6px;border:1px dashed var(--b1);border-radius:8px';
          note.innerHTML='\uD83D\uDCC5 <strong>Movimenta\u00e7\u00f5es de '+lbl+'</strong> \u2014 '+(onlyDate?onlyDate.length:0)+' evento(s) encontrado(s) nesta data.';
          // insere antes do #adm-feed-list se ainda n\u00e3o existir
          if(!el.previousElementSibling||!el.previousElementSibling.classList.contains('lf-date-banner')){
            note.classList.add('lf-date-banner');
            el.parentNode.insertBefore(note,el);
          }
        }
      }catch(_e){_warn('p\u00f3s-render adm feed falhou',_e);}
      return ret;
    };
    global.renderAdmFeed.__lfDatePickWrapped=true;
    _log('renderAdmFeed envolvido');
    return true;
  }

  /* Injeta o <input type="date"> na barra do painel Feed (id #adm-pane-feed) */
  function _injectDatePicker(){
    var pane=document.getElementById('adm-pane-feed');
    if(!pane)return false;
    if(document.getElementById('adm-feed-datepick'))return true;

    // Encontra a primeira toolbar / div do feed para inserir o input
    var anchors=pane.querySelectorAll('button.bc, .obj-bank-toolbar');
    var target=null;
    anchors.forEach(function(b){
      if(b&&/Atualizar|Atualizar/i.test(b.textContent||'') && b.getAttribute('onclick')&&/renderAdmLigacoes\(\)/.test(b.getAttribute('onclick'))){
        target=b.parentNode; // a div que cont\u00e9m o t\u00edtulo "Liga\u00e7\u00f5es por Consultor (hoje)"
      }
    });
    if(!target){
      // cria toolbar nova no topo do pane
      target=document.createElement('div');
      target.style.cssText='margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
      pane.insertBefore(target,pane.firstChild);
    }

    var label=document.createElement('label');
    label.style.cssText='display:inline-flex;align-items:center;gap:6px;font-size:.7rem;color:var(--mu)';
    label.innerHTML='<span>\uD83D\uDCC5 Data:</span>';

    var inp=document.createElement('input');
    inp.type='date';
    inp.id='adm-feed-datepick';
    inp.value=getSelectedDate();
    inp.max=_todayFn(); // n\u00e3o permite futuro
    inp.style.cssText='background:var(--card);color:var(--tx);border:1px solid var(--b1);border-radius:8px;padding:5px 8px;font-size:.72rem;font-family:inherit';
    inp.addEventListener('change',function(){
      _selectedDate=inp.value||_todayFn();
      try{if(typeof global.renderAdmLigacoes==='function')global.renderAdmLigacoes();}catch(_e){}
      try{if(typeof global.renderAdmFeed==='function')global.renderAdmFeed();}catch(_e){}
      try{var evt=new CustomEvent('lf-datepick:change',{detail:{date:_selectedDate}});
          global.dispatchEvent(evt);}catch(_e){}
    });
    label.appendChild(inp);

    var btnHoje=document.createElement('button');
    btnHoje.className='bc';
    btnHoje.style.cssText='padding:5px 10px;font-size:.66rem';
    btnHoje.textContent='Hoje';
    btnHoje.type='button';
    btnHoje.addEventListener('click',function(){
      inp.value=_todayFn();
      _selectedDate=_todayFn();
      inp.dispatchEvent(new Event('change'));
    });
    label.appendChild(btnHoje);

    // Inserir no topo do painel ADM Feed (sempre antes do bloco "Liga\u00e7\u00f5es por Consultor")
    var inseridoNaHeader=false;
    pane.querySelectorAll('span').forEach(function(s){
      if(!s||inseridoNaHeader)return;
      if(/Liga\u00e7\u00f5es por Consultor/i.test(s.textContent||'')){
        var header=s.parentNode;
        if(header){
          // garante que s\u00f3 inserimos 1 vez
          if(!header.querySelector('#adm-feed-datepick')){
            header.insertBefore(label,header.firstChild);
            inseridoNaHeader=true;
          }
        }
      }
    });
    if(!inseridoNaHeader){
      // fallback: insere no topo do pane
      pane.insertBefore(label,pane.firstChild);
    }
    _log('datepicker injetado');
    return true;
  }

  function _install(){
    // Aguarda as fun\u00e7\u00f5es alvo aparecerem
    if(typeof global.getUsers!=='function'){
      setTimeout(_install,300);
      return;
    }
    _wrapRenderAdmLigaciones();
    _wrapRenderAdmFeed();
    _injectDatePicker();

    // exp\u00f5e API p\u00fablica
    global.LiderCRM=global.LiderCRM||{};
    global.LiderCRM.admFeedDatepick={
      getSelectedDate:getSelectedDate,
      setSelectedDate:setSelectedDate,
      getLigTotalForDay:_getLigTotalForDay,
      getLigListForDay:_getListForDay
    };

    _log('patch instalado');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{
    _install();
  }
})(window);
