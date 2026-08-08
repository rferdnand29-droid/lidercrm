/* =====================================================================
 * lf-fix-rolante-order-adm-lig-total-v1-20260728.js
 * ---------------------------------------------------------------------
 * patch-id: fix-rolante-order-adm-lig-total-v1-20260728
 *
 * CORRIGE DOIS BUGS DEFINITIVAMENTE (causa raiz, não sintoma):
 *
 * ====== BUG 1: Ordenação de leads nos rolantes (kanban) ============
 * SINTOMA: Leads novos apareciam no FINAL da coluna em vez do TOPO.
 *          Devem ficar primeiro os mais recentes, no final os mais
 *          antigos. Aplica-se a todos os fluxos de rolantes de etapas.
 *
 * CAUSA RAIZ: _sortCardsForColumn() em js/kanban.js (linhas 406-419)
 *   usa `manualOrder` como prioridade PRIMÁRIA de ordenação:
 *
 *     if(am!==null&&bm!==null&&am!==bm)return am-bm;  // manualOrder primeiro
 *     if(am!==null&&bm===null)return -1;              // card SEM manualOrder vai DEPOIS
 *     if(am===null&&bm!==null)return 1;               // ← NOVOS cards caem aqui
 *     // createdAt DESC só como fallback quando AMBOS sem manualOrder
 *
 *   Novos cards criados por _finalizeSaveKBCard() (kanban.js linha 755)
 *   NÃO recebem `manualOrder` (ficam undefined → null). Cards que já
 *   estão na coluna RECEBEM `manualOrder` via _recalcManualOrder()
 *   (relatorios.js linha 450) a cada _kbMoveCard. Resultado: o novo
 *   card ordena DEPOIS de todos os cards que têm manualOrder, ou seja,
 *   no FINAL da coluna — exatamente o oposto do desejado.
 *
 *   O mesmo problema afeta:
 *   - confirmBatchImport() (kanban.js linha 1849): push sem manualOrder
 *   - convertToNeg() (relatorios.js linha 676): push sem manualOrder
 *
 * CORREÇÃO: Inverte a prioridade — createdAt DESC como PRIMÁRIO (mais
 *   recentes primeiro, mais antigos ao final), manualOrder como
 *   SECUNDÁRio (apenas para tiebreak de cards com mesmo timestamp).
 *   Isto garante que novos leads SEMPRE apareçam no topo de qualquer
 *   etapa/coluna, independentemente de manualOrder.
 *
 * ====== BUG 2: Somatória de ligações no feed do ADM ================
 * SINTOMA: "Somatória Hoje" no feed do ADM não soma o total do dia.
 *          O botão de 1 a 10 dos consultores reseta ao chegar em 10,
 *          e o ADM só vê a rodada atual (0-10), não o acumulado (20,
 *          30, 40...). Usuário pede: "aparecer total do dia horas
 *          acontecidas".
 *
 * CAUSA RAIZ: renderAdmLigacoes() em js/relatorios.js (linha 89):
 *
 *     users.forEach(function(u){_ligTotal+=getLigToday(u.id).length;});
 *
 *   getLigToday(u.id) retorna a lista da RODADA ATUAL (chave
 *   lf13_lig_<uid>_<hoje>), que vai de 0 a 10. Ao clicar "Reset"
 *   (resetLig em agenda.js linha 758), a lista é esvaziada →
 *   getLigToday().length volta a 0. O ADM vê "0" ou "1 a 10" mesmo
 *   quando o consultor fez 20, 30, 40 ligações.
 *
 *   O patch lf-lig-counter-rounds-v1-20260728.js JÁ mantém
 *   lf13_lig_total_<uid>_<date> (acumulado do dia) e expõe
 *   LiderCRM.ligCounterRounds.getLigTotal(uid, date). MAS o
 *   renderAdmLigacoes original NÃO usa essa API — continua lendo
 *   getLigToday().length.
 *
 *   O patch lf-adm-feed-datepick-v1-20260728.js TENTA corrigir
 *   envolvendo renderAdmLigacoes, mas:
 *   - Chama orig() PRIMEIRO (que renderiza o card "Somatória Hoje"
 *     com o valor ERRADO baseado em getLigToday().length)
 *   - Depois tenta inserir um banner, mas NÃO substitui os 3 cards
 *     de resumo originais
 *   - O card "Somatória Hoje" permanece com o número incorreto
 *
 * CORREÇÃO: Substitui renderAdmLigacoes por versão que:
 *   1. Usa getLigTotal() (patch de rounds) como fonte do total
 *   2. Reconcilia: total = max(getLigTotal, rounds*10 + roundLen,
 *      roundLen) — cobre caso do patch de rounds ter sido instalado
 *      após ligações já feitas
 *   3. Faz merge com Worker (doc.total/doc.rounds quando disponíveis)
 *      usando max() — nunca regride a contagem
 *   4. Atualiza o card "Somatória" após todas as buscas remotas
 *      completarem (total consolidado)
 *   5. Adiciona "Horas Acontecidas" ao resumo (solicitado pelo user)
 *   6. Mostra total acumulado + rodadas fechadas por consultor
 *
 * GARANTIAS (não regredir nada):
 * - Não mexe em js/kanban.js, js/relatorios.js, js/agenda.js, Worker,
 *   auth, chat, feed-runtime. Apenas adiciona wrappers em window.
 * - Idempotente: guard window.__LF_FIX_ROLANTE_ADM_LIG_V1__
 * - Compatível com lf-lig-counter-rounds-v1, lf-lig-counter-sync-cloud-v1,
 *   lf-adm-feed-datepick-v1 (lê a data selecionada do datepicker deles)
 * - O datepicker injetado pelo patch datepick continua funcionando
 *   (seu event handler change chama renderAdmLigacoes() que agora é
 *   esta versão corrigida)
 * ===================================================================== */
(function(global){
  'use strict';
  if(global.__LF_FIX_ROLANTE_ADM_LIG_V1__){return;}
  global.__LF_FIX_ROLANTE_ADM_LIG_V1__=true;

  var TAG='[lf-fix-rolante-adm-lig]';
  function _log(){try{if(global.console&&console.debug)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{if(global.console&&console.warn)console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  // padStart polyfill-safe
  function _pad2(n){return (n<10?'0':'')+n;}
  function _todaySafe(){
    if(typeof global.today==='function')return global.today();
    var d=new Date();
    return d.getFullYear()+'-'+_pad2(d.getMonth()+1)+'-'+_pad2(d.getDate());
  }

  function _ss(k,v){try{if(typeof global.ss==='function')global.ss(k,v);}catch(_e){}}
  function _sg(k){try{if(typeof global.sg==='function')return global.sg(k);return null;}catch(_e){return null;}}
  function _eH(s){try{if(typeof global.eH==='function')return global.eH(s);}catch(_e){}return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  // ===================================================================
  // BUG 1: CORRIGIR ORDENAÇÃO DOS ROLANTES (KANBAN)
  // ===================================================================
  function _patchSortCardsForColumn(){
    if(typeof global._sortCardsForColumn!=='function'){
      _warn('_sortCardsForColumn ausente — aguardando js/kanban.js…');
      setTimeout(_install,250);
      return false;
    }
    if(global._sortCardsForColumn.__lfFixOrderWrapped)return true;

    global._sortCardsForColumn=function(cards){
      return (cards||[]).slice().sort(function(a,b){
        /* CORREÇÃO 2026-08-03: a versão anterior usava createdAt DESC
           como prioridade SEMPRE primária, com manualOrder só como
           tiebreak de mesmo timestamp — na prática isso deixava a
           reordenação manual (arrastar um lead pro lugar de outro)
           SEM NENHUM EFEITO VISÍVEL, porque dois cards quase nunca têm
           o mesmo createdAt. Reportado como "mudar a ordem dos leads
           não funciona".
           Nova prioridade:
           1) os dois já foram reordenados manualmente nesta coluna
              (ambos com manualOrder) → respeita a ordem manual;
           2) só um dos dois tem manualOrder → o que NÃO tem (é novo,
              nunca foi movido) fica por CIMA — preserva a regra
              original pedida ("lead novo aparece no topo");
           3) nenhum dos dois tem manualOrder → mais recente primeiro
              (createdAt DESC), igual antes. */
        var am=Number.isFinite(a&&a.manualOrder)?a.manualOrder:null;
        var bm=Number.isFinite(b&&b.manualOrder)?b.manualOrder:null;
        if(am!==null&&bm!==null&&am!==bm)return am-bm;
        if(am!==null&&bm===null)return 1;
        if(am===null&&bm!==null)return -1;

        var at=new Date((a&&(a.createdAt||a.updatedAt))||0).getTime();
        var bt=new Date((b&&(b.createdAt||b.updatedAt))||0).getTime();
        return bt-at;
      });
    };
    global._sortCardsForColumn.__lfFixOrderWrapped=true;
    _log('_sortCardsForColumn corrigido 2026-08-03: manualOrder passa a valer de verdade (leads novos continuam no topo)');
    return true;
  }

  // ===================================================================
  // BUG 2: CORRIGIR SOMATÓRIA DE LIGAÇÕES NO FEED DO ADM
  // ===================================================================

  /* Total efetivo do dia para um consultor.
     Fonte de verdade (em ordem de prioridade):
     1. getLigTotal() do patch de rounds (lf13_lig_total_<uid>_<date>)
     2. Leitura direta de localStorage (mesma chave)
     3. Reconciliação: rounds * 10 + roundLen (caso o patch de rounds
        foi instalado depois de ligações já terem sido feitas)
     4. Fallback: tamanho da rodada atual (getLigToday)
     Safety: Math.max(total, roundLen) — nunca mostrar menos que a
     rodada atual visível. */
  function _getEffectiveTotal(uid,date){
    var d=date||_todaySafe();
    var total=0;

    /* 1. getLigTotal do patch de rounds */
    try{
      var mod=global.LiderCRM&&global.LiderCRM.ligCounterRounds;
      if(mod&&typeof mod.getLigTotal==='function'){
        total=mod.getLigTotal(uid,d)||0;
      }
    }catch(_e){}

    /* 2. Leitura direta do localStorage */
    if(!total){
      try{
        var v=_sg('lf13_lig_total_'+uid+'_'+d);
        total=(typeof v==='number'&&v>0)?v:(parseInt(v,10)||0);
      }catch(_e){}
    }

    /* 3. Reconciliação com rounds e rodada atual */
    var rounds=_getEffectiveRounds(uid,d);
    var roundLen=_getRoundLen(uid,d);

    if(total===0&&(rounds>0||roundLen>0)){
      total=rounds*10+roundLen;
      /* Salva o total reconciliado para futuras leituras e para
         o patch de cloud sync detectar e sincronizar */
      try{_ss('lf13_lig_total_'+uid+'_'+d,total);}catch(_e){}
      _log('reconciliado total de',uid,'para',total,'(rounds='+rounds+', roundLen='+roundLen+')');
    }

    /* Safety: nunca mostrar menos que a rodada atual visível */
    return Math.max(total,roundLen);
  }

  function _getEffectiveRounds(uid,date){
    var d=date||_todaySafe();
    var rounds=0;
    try{
      var mod=global.LiderCRM&&global.LiderCRM.ligCounterRounds;
      if(mod&&typeof mod.getLigRounds==='function'){
        rounds=mod.getLigRounds(uid,d)||0;
      }
    }catch(_e){}
    if(!rounds){
      try{
        var v=_sg('lf13_lig_rounds_'+uid+'_'+d);
        rounds=(typeof v==='number'&&v>0)?v:(parseInt(v,10)||0);
      }catch(_e){}
    }
    return rounds;
  }

  function _getRoundLen(uid,date){
    var d=date||_todaySafe();
    try{
      if(d===_todaySafe()&&typeof global.getLigToday==='function'){
        return (global.getLigToday(uid)||[]).length;
      }
      var arr=_sg('lf13_lig_'+uid+'_'+d);
      return Array.isArray(arr)?arr.length:0;
    }catch(_e){}
    return 0;
  }

  function _getListForDay(uid,date){
    var d=date||_todaySafe();
    try{
      if(d===_todaySafe()&&typeof global.getLigToday==='function'){
        return global.getLigToday(uid)||[];
      }
      var arr=_sg('lf13_lig_'+uid+'_'+d);
      return Array.isArray(arr)?arr:[];
    }catch(_e){}
    return [];
  }

  function _getSelectedDate(){
    try{
      var mod=global.LiderCRM&&global.LiderCRM.admFeedDatepick;
      if(mod&&typeof mod.getSelectedDate==='function')return mod.getSelectedDate();
    }catch(_e){}
    try{
      var inp=document.getElementById('adm-feed-datepick');
      if(inp&&inp.value)return inp.value;
    }catch(_e){}
    return _todaySafe();
  }

  /* Atualiza o contador de uma row com o total correto */
  function _updateAdmLigCount(uid,total,rounds){
    var cnt=document.getElementById('adm-lig-cnt-'+uid);
    if(!cnt)return;
    var roundsTxt=rounds>0?' ('+rounds+' rodada'+(rounds!==1?'s':'')+' fechada'+(rounds!==1?'s':'')+')':'';
    cnt.innerHTML=' &middot; '+total+' liga&ccedil;&otilde;'+(total!==1?'es':'&atilde;o')+' hoje'+roundsTxt;
  }

  /* Desenha a grade 1-10 da rodada atual */
  function _drawAdmLigGrid(uid,list){
    var g=document.getElementById('adm-lig-grid-'+uid);
    if(!g)return;
    var marked={};
    (list||[]).forEach(function(r){if(r&&r.n)marked[r.n]=r.hora;});
    var html='';
    for(var i=1;i<=10;i++){
      var hora=marked[i]?new Date(marked[i]).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
      html+='<div class="lig-cell'+(marked[i]?' marked':'')+'" title="'+(hora?'Liga&ccedil;&atilde;o '+i+' &agrave;s '+hora:'')+'" style="cursor:default;font-size:.6rem">'+i+'</div>';
    }
    g.innerHTML=html;
  }

  /* Atualiza o card "Somatória" no topo após todas as buscas remotas */
  function _updateSummaryTotal(newTotal, numUsers, isToday){
    var el=document.getElementById('adm-lig-list');
    if(!el)return;
    /* Encontra o primeiro card de resumo (Somatória) */
    var card=el.querySelector('div[style*="text-align:center"] div[style*="font-size:1.6rem"]');
    /* Alternativa: procura pelo texto "Somatória" */
    var allCards=el.querySelectorAll('div[style*="text-align:center"]');
    for(var i=0;i<allCards.length;i++){
      var c=allCards[i];
      var lbl=c.querySelector('div[style*="font-size:.6rem"]');
      if(lbl&&/Somat/i.test(lbl.textContent||'')){
        var numEl=c.querySelector('div[style*="font-size:1.6rem"]');
        if(numEl){
          var oldVal=parseInt(numEl.textContent,10)||0;
          if(newTotal>oldVal){
            numEl.textContent=newTotal;
            /* Recalcula média e progresso */
            var _horaAtual=new Date().getHours();
            var _horasTrab=isToday?Math.max(1,_horaAtual-8):Math.max(1,24-8);
            var _media=(newTotal/_horasTrab).toFixed(isToday?1:0);
            var _metaDiaria=numUsers*10;
            var _progPct=_metaDiaria>0?Math.min(100,Math.round(newTotal/_metaDiaria*100)):0;
            /* Atualiza média */
            for(var j=0;j<allCards.length;j++){
              var cj=allCards[j];
              var lblj=cj.querySelector('div[style*="font-size:.6rem"]');
              if(lblj&&/M/i.test(lblj.textContent||'')&&/Hora/i.test(lblj.textContent||'')){
                var medEl=cj.querySelector('div[style*="font-size:1.6rem"]');
                if(medEl)medEl.textContent=_media;
              }
              if(lblj&&/Meta/i.test(lblj.textContent||'')){
                var pctEl=cj.querySelector('div[style*="font-size:1.6rem"]');
                if(pctEl)pctEl.textContent=_progPct+'%';
              }
            }
            /* Atualiza barra de progresso */
            var bar=el.querySelector('div[style*="height:100%"]');
            if(bar)bar.style.width=_progPct+'%';
          }
        }
        break;
      }
    }
  }

  function _patchRenderAdmLigacoes(){
    if(typeof global.renderAdmLigacoes!=='function'){
      _warn('renderAdmLigacoes ausente — aguardando js/relatorios.js…');
      setTimeout(_install,250);
      return false;
    }
    if(global.renderAdmLigacoes.__lfFixTotalWrapped)return true;

    global.renderAdmLigacoes=function(){
      var el=document.getElementById('adm-lig-list');
      if(!el)return;

      var users=(typeof global.getUsers==='function')?(global.getUsers().filter(function(u){return u&&u.ativo!==false;})||[]):[];
      if(!users.length){el.innerHTML='<div class="act-empty">Nenhum consultor.</div>';return;}

      var date=_getSelectedDate();
      var isToday=(date===_todaySafe());

      /* Calcular total efetivo de cada consultor (síncrono, do local) */
      var userTotals=[];
      var _ligTotal=0;
      users.forEach(function(u){
        var t=_getEffectiveTotal(u.id,date);
        var r=_getEffectiveRounds(u.id,date);
        userTotals.push({user:u,total:t,rounds:r});
        _ligTotal+=t;
      });

      /* Horas acontecidas (solicitado pelo usuário) */
      var _horaAtual=new Date().getHours();
      var _horaInicio=8;
      var _horasAcontecidas=isToday?Math.max(0,_horaAtual-_horaInicio):(24-8);
      var _horasTrab=Math.max(1,_horasAcontecidas);
      var _media=(_ligTotal/_horasTrab).toFixed(isToday?1:0);
      var _metaDiaria=users.length*10;
      var _progPct=_metaDiaria>0?Math.min(100,Math.round(_ligTotal/_metaDiaria*100)):0;

      var _dateLbl=(function(){
        try{
          var p=date.split('-');
          return p[2]+'/'+p[1]+'/'+p[0]+(isToday?' (hoje)':'');
        }catch(_e){return date;}
      })();

      /* Card de resumo: 4 métricas (Somatória | Horas Acontecidas | Média/h | Meta) */
      var resumoHTML='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">'
        +'<div style="background:var(--card);border:1px solid var(--b1);border-radius:10px;padding:10px;text-align:center">'
        +'<div style="font-family:\'Cormorant Garamond\',serif;font-weight:700;font-size:1.6rem;color:var(--al)">'+_ligTotal+'</div>'
        +'<div style="font-size:.6rem;color:var(--mu);margin-top:2px">Somat&oacute;ria '+_eH(_dateLbl)+'</div></div>'
        +'<div style="background:var(--card);border:1px solid var(--b1);border-radius:10px;padding:10px;text-align:center">'
        +'<div style="font-family:\'Cormorant Garamond\',serif;font-weight:700;font-size:1.6rem;color:var(--bl)">'+_horasAcontecidas+'h</div>'
        +'<div style="font-size:.6rem;color:var(--mu);margin-top:2px">Horas Acontecidas</div></div>'
        +'<div style="background:var(--card);border:1px solid var(--b1);border-radius:10px;padding:10px;text-align:center">'
        +'<div style="font-family:\'Cormorant Garamond\',serif;font-weight:700;font-size:1.6rem;color:var(--ok)">'+_media+'</div>'
        +'<div style="font-size:.6rem;color:var(--mu);margin-top:2px">M&eacute;dia / Hora</div></div>'
        +'<div style="background:var(--card);border:1px solid var(--b1);border-radius:10px;padding:10px;text-align:center">'
        +'<div style="font-family:\'Cormorant Garamond\',serif;font-weight:700;font-size:1.6rem;color:var(--bd)">'+_progPct+'%</div>'
        +'<div style="font-size:.6rem;color:var(--mu);margin-top:2px">Meta Di&aacute;ria</div></div>'
        +'</div>'
        +'<div style="background:var(--bg3);border-radius:6px;height:7px;overflow:hidden;margin-bottom:14px">'
        +'<div style="height:100%;width:'+_progPct+'%;background:linear-gradient(90deg,var(--bd),var(--bl));border-radius:6px;transition:width .6s"></div>'
        +'</div>';

      /* Renderizar rows com total correto por consultor */
      el.innerHTML=resumoHTML+users.map(function(u,i){
        var t=userTotals[i];
        var roundsTxt=t.rounds>0?' ('+t.rounds+' rodada'+(t.rounds!==1?'s':'')+' fechada'+(t.rounds!==1?'s':'')+')':'';
        return '<div class="adm-lig-row" id="adm-lig-row-'+u.id+'" style="margin-bottom:10px;padding:10px;border:1px solid var(--b1);border-radius:10px">'
          +'<div style="font-size:.78rem;font-weight:600;margin-bottom:6px">'+_eH(u.nome)
          +' <span style="color:var(--mu);font-weight:400" id="adm-lig-cnt-'+u.id+'"> &middot; '+t.total+' liga&ccedil;&otilde;'+(t.total!==1?'es':'&atilde;o')+' hoje'+roundsTxt+'</span></div>'
          +'<div class="lig-grid" id="adm-lig-grid-'+u.id+'" style="grid-template-columns:repeat(10,1fr);max-width:320px"></div></div>';
      }).join('');

      /* Tracker para atualizar a somatória após todas as buscas remotas */
      var _pendingFetches=users.length;
      var _consolidatedTotal=_ligTotal;

      function _onRowFetched(uid, effectiveTotal, oldLocalTotal){
        if(effectiveTotal>oldLocalTotal){
          _consolidatedTotal+=(effectiveTotal-oldLocalTotal);
        }
        _pendingFetches--;
        if(_pendingFetches<=0){
          _updateSummaryTotal(_consolidatedTotal, users.length, isToday);
        }
      }

      /* Para cada consultor: buscar dados remotos e desenhar a grade */
      users.forEach(function(u,i){
        var t=userTotals[i];
        var root=global.LiderCRM;
        var wc=root&&root.api&&root.api.workerClient;
        if(root&&root.config&&root.config.useWorkerApi&&wc&&typeof wc.ligacoesList==='function'){
          wc.ligacoesList(u.id,date).then(function(doc){
            var serverTotal=(doc&&typeof doc.total==='number')?doc.total:0;
            var serverRounds=(doc&&typeof doc.rounds==='number')?doc.rounds:0;
            var list=(doc&&Array.isArray(doc.list))?doc.list:_getListForDay(u.id,date);

            /* Merge conservador: max(local, server) — nunca regride */
            var effectiveTotal=Math.max(t.total,serverTotal);
            var effectiveRounds=Math.max(t.rounds,serverRounds);

            /* Reconciliar localStorage com o valor do servidor */
            if(effectiveTotal>t.total){
              try{_ss('lf13_lig_total_'+u.id+'_'+date,effectiveTotal);}catch(_e){}
            }
            if(effectiveRounds>t.rounds){
              try{_ss('lf13_lig_rounds_'+u.id+'_'+date,effectiveRounds);}catch(_e){}
            }

            _updateAdmLigCount(u.id,effectiveTotal,effectiveRounds);
            _drawAdmLigGrid(u.id,list);
            _onRowFetched(u.id,effectiveTotal,t.total);
          }).catch(function(){
            _updateAdmLigCount(u.id,t.total,t.rounds);
            _drawAdmLigGrid(u.id,_getListForDay(u.id,date));
            _onRowFetched(u.id,t.total,t.total);
          });
        }else if(global.DB_MODE==='firebase'&&global.db){
          global.db.collection('ligacoes').doc(u.id+'_'+date).get().then(function(d){
            var data=d.exists?d.data():null;
            var list=(data&&data.list)?data.list:[];
            var serverTotal=(data&&typeof data.total==='number')?data.total:0;
            var effectiveTotal=Math.max(t.total,serverTotal);
            if(effectiveTotal>t.total){
              try{_ss('lf13_lig_total_'+u.id+'_'+date,effectiveTotal);}catch(_e){}
            }
            _updateAdmLigCount(u.id,effectiveTotal,t.rounds);
            _drawAdmLigGrid(u.id,list);
            _onRowFetched(u.id,effectiveTotal,t.total);
          }).catch(function(){
            _updateAdmLigCount(u.id,t.total,t.rounds);
            _drawAdmLigGrid(u.id,_getListForDay(u.id,date));
            _onRowFetched(u.id,t.total,t.total);
          });
        }else{
          _updateAdmLigCount(u.id,t.total,t.rounds);
          _drawAdmLigGrid(u.id,_getListForDay(u.id,date));
          _onRowFetched(u.id,t.total,t.total);
        }
      });
    };
    global.renderAdmLigacoes.__lfFixTotalWrapped=true;
    /* Marca também como datepick-wrapped para o patch lf-adm-feed-datepick-v1
       não re-envolver esta função (nós já lemos a data selecionada via
       _getSelectedDate que acessa a API deles). */
    global.renderAdmLigacoes.__lfDatePickWrapped=true;
    _log('renderAdmLigacoes corrigido: total acumulado do dia + horas acontecidas');
    return true;
  }

  // ===================================================================
  // INSTALAÇÃO
  // ===================================================================
  function _install(){
    if(!global.S||!global.S.userId){
      setTimeout(_install,300);
      return;
    }
    var ok1=_patchSortCardsForColumn();
    var ok2=_patchRenderAdmLigacoes();
    if(ok1&&ok2){
      _log('patch instalado — 2 correções ativas (ordenção rolantes + somatória ADM)');
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',_install);
  }else{
    _install();
  }
})(window);
