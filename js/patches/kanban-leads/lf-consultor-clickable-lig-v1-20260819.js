/*!
 * lf-consultor-clickable-lig-v1-20260819.js
 * ---------------------------------------------------------------------------
 * patch-id : consultor-clickable-lig-v1-20260819
 * escopo   : ADM > Ligações (adm-lig-*) e Time > Ligações (time-lig-*)
 * depende  : js/relatorios.js
 *            js/patches/kanban-leads/lf-fix-rolante-order-adm-lig-total-v1-20260728.js
 *            js/patches/kanban-leads/lf-lig-counter-rounds-v1-20260728.js
 *            js/patches/kanban-leads/lf-lig-counter-sync-cloud-v1-20260728.js
 *
 * Objetivo
 * --------
 * 1) Tornar o CARTÃO do consultor clicável nas duas telas (ADM e Time),
 *    abrindo um modal com o histórico consolidado de ligações — mesma UX
 *    nos dois painéis.
 * 2) Histórico consolidado LOCAL POR PADRÃO (últimos 30 dias montados a
 *    partir do que já existe em localStorage: lf13_lig_<uid>_<yyyy-mm-dd>,
 *    lf13_lig_total_* e lf13_lig_rounds_*).
 * 3) Botão "Buscar servidor (últimos 30 dias)" que só sob demanda dispara
 *    workerClient.ligacoesList(uid, d) para cada uma das 30 datas e mescla
 *    com o local por MAX (mesma regra do sync de bingo).
 *
 * Retrocompatibilidade
 * --------------------
 * NÃO altera o formato da marcação (`{n, hora}`). NÃO troca chaves. NÃO
 * mexe no worker/PUT. Só LÊ.
 *
 * Idempotência
 * ------------
 * Delegated click handler no `document` protegido por flag
 * (`__LF_CONS_CLICK_LIG_V1__`). Se algum outro patch já registrar clique
 * no `.adm-lig-row`, este segue por cima sem duplicar (o modal só abre em
 * cliques que NÃO tenham origem em `<button>`/`<input>`/`<a>`).
 * ---------------------------------------------------------------------------
 */
(function(global){
  'use strict';
  if (global.__lfFixConsultorClickableLigV1) return;
  global.__lfFixConsultorClickableLigV1 = true;
  if(global.__LF_CONS_CLICK_LIG_V1__)return;
  global.__LF_CONS_CLICK_LIG_V1__=true;

  var TAG='[lf-cons-click-lig]';
  function _log(){try{if(global.__LF_DEBUG__)console.debug.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}
  function _warn(){try{console.warn.apply(console,[TAG].concat([].slice.call(arguments)));}catch(_e){}}

  // ---------- helpers ---------------------------------------------------------
  function _eH(s){
    if(typeof global.eH==='function')return global.eH(s);
    return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function _today(){
    if(typeof global.today==='function'){try{return global.today();}catch(_e){}}
    var d=new Date();
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function _fmtDateBR(iso){
    if(!iso||typeof iso!=='string')return iso||'';
    var m=iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return iso;
    return m[3]+'/'+m[2]+'/'+m[1];
  }
  function _parseDay(iso){
    var m=iso&&iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    return new Date(parseInt(m[1],10),parseInt(m[2],10)-1,parseInt(m[3],10));
  }
  function _dayName(iso){
    var d=_parseDay(iso);if(!d)return '';
    var names=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    return names[d.getDay()];
  }
  function _addDaysISO(iso, delta){
    var d=_parseDay(iso);if(!d)return iso;
    d.setDate(d.getDate()+delta);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }
  function _fmtHM(ts){
    try{return new Date(ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
    catch(_e){return '';}
  }

  // Leitura local — replica o esquema usado em js/agenda.js (ligKey / _ligTotalKey
  // / _ligRoundsKey) sem depender das funções, já que elas leem da chave do
  // usuário LOGADO (S.userId), não do consultor cujo cartão foi clicado.
  function _sg(key){
    try{
      var raw=localStorage.getItem(key);
      if(raw==null)return null;
      try{return JSON.parse(raw);}catch(_e){return raw;}
    }catch(_e){return null;}
  }
  function _ligDayKey(uid,date){return 'lf13_lig_'+uid+'_'+date;}
  function _ligTotalKeyLocal(uid,date){return 'lf13_lig_total_'+uid+'_'+date;}
  function _ligRoundsKeyLocal(uid,date){return 'lf13_lig_rounds_'+uid+'_'+date;}

  function _readLocalDay(uid,date){
    var list=_sg(_ligDayKey(uid,date));
    if(!Array.isArray(list))list=[];
    var totalRaw=_sg(_ligTotalKeyLocal(uid,date));
    var total=(typeof totalRaw==='number')?totalRaw:parseInt(totalRaw,10);
    if(!Number.isFinite(total)||total<0)total=0;
    var roundsRaw=_sg(_ligRoundsKeyLocal(uid,date));
    var rounds=(typeof roundsRaw==='number')?roundsRaw:parseInt(roundsRaw,10);
    if(!Number.isFinite(rounds)||rounds<0)rounds=0;
    // Reconciliação: total nunca menor que rounds*10 + len(rodada atual).
    var reconciled=Math.max(total, rounds*10 + list.length, list.length);
    return {list:list, total:reconciled, rounds:rounds, source:'local'};
  }

  function _mergeDay(local, remote){
    // "MAX" — mesma regra do sync de bingo em nuvem.
    // Escolhe a rodada atual (list) com mais marcações; empate = mantém a local
    // (evita perder um `hora` gravado offline).
    var chosenList=local.list;
    if(remote&&Array.isArray(remote.list)&&remote.list.length>local.list.length){
      chosenList=remote.list;
    }
    var total=Math.max(
      local.total|0,
      (remote&&(remote.total|0))||0,
      ((remote&&(remote.rounds|0))||0)*10 + ((remote&&remote.list)?remote.list.length:0),
      chosenList.length
    );
    var rounds=Math.max(local.rounds|0,(remote&&(remote.rounds|0))||0);
    // Coerência: se total < rounds*10, ajusta rounds pra baixo.
    if(total<rounds*10)rounds=Math.floor(total/10);
    return {list:chosenList, total:total, rounds:rounds, source:(remote?'merged':'local')};
  }

  // ---------- coleta dos últimos 30 dias (LOCAL) ------------------------------
  function _last30Dates(){
    var out=[]; var d=_today();
    for(var i=0;i<30;i++){out.push(d);d=_addDaysISO(d,-1);}
    return out;
  }
  function _buildLocalHistory(uid){
    var dates=_last30Dates();
    var rows=dates.map(function(d){
      var day=_readLocalDay(uid,d);
      return {date:d, total:day.total, rounds:day.rounds, list:day.list, source:day.source};
    });
    var somaTotal=rows.reduce(function(a,r){return a+(r.total|0);},0);
    var diasCom=rows.filter(function(r){return (r.total|0)>0;}).length;
    var somaRounds=rows.reduce(function(a,r){return a+(r.rounds|0);},0);
    return {rows:rows, somaTotal:somaTotal, diasCom:diasCom, somaRounds:somaRounds, hasRemote:false};
  }

  // ---------- modal ----------------------------------------------------------
  var MODAL_ID='lf-cons-lig-modal';
  var _openState={uid:null,userName:'',history:null};

  function _ensureModalNode(){
    var el=document.getElementById(MODAL_ID);
    if(el)return el;
    el=document.createElement('div');
    el.className='mo lf-cons-lig-mo';
    el.id=MODAL_ID;
    el.setAttribute('role','dialog');
    el.setAttribute('aria-modal','true');
    el.addEventListener('click',function(e){if(e.target===el)_close();});
    el.innerHTML=
      '<div class="mo-b lf-cons-lig-box">'
      +  '<div class="lf-cons-lig-head">'
      +    '<div class="lf-cons-lig-title" id="lf-cons-lig-title">Ligações do consultor</div>'
      +    '<button type="button" class="lf-cons-lig-close" aria-label="Fechar" onclick="window.__lfConsLigClose&&window.__lfConsLigClose()">×</button>'
      +  '</div>'
      +  '<div class="lf-cons-lig-tabs" role="tablist">'
      +    '<button type="button" class="lf-cons-lig-tab on" data-tab="today" role="tab" aria-selected="true">Hoje</button>'
      +    '<button type="button" class="lf-cons-lig-tab" data-tab="all" role="tab" aria-selected="false">Todos os dias</button>'
      +  '</div>'
      +  '<div class="lf-cons-lig-body">'
      +    '<div class="lf-cons-lig-pane on" id="lf-cons-lig-pane-today" role="tabpanel"></div>'
      +    '<div class="lf-cons-lig-pane" id="lf-cons-lig-pane-all" role="tabpanel">'
      +      '<div class="lf-cons-lig-all-head">'
      +        '<div class="lf-cons-lig-all-summary" id="lf-cons-lig-all-summary"></div>'
      +        '<button type="button" class="bc lf-cons-lig-fetch" id="lf-cons-lig-fetch-btn"'
      +          ' onclick="window.__lfConsLigFetchServer&&window.__lfConsLigFetchServer()">'
      +          '🔎 Buscar servidor (últimos 30 dias)'
      +        '</button>'
      +      '</div>'
      +      '<div class="lf-cons-lig-all-list" id="lf-cons-lig-all-list"></div>'
      +    '</div>'
      +  '</div>'
      +  '<div class="lf-cons-lig-foot">'
      +    '<button type="button" class="bc" onclick="window.__lfConsLigClose&&window.__lfConsLigClose()">Fechar</button>'
      +  '</div>'
      +'</div>';
    document.body.appendChild(el);
    // Delegated tab clicks
    el.addEventListener('click',function(e){
      var t=e.target&&e.target.closest&&e.target.closest('.lf-cons-lig-tab');
      if(!t)return;
      var tab=t.getAttribute('data-tab');
      _switchTab(tab);
    });
    return el;
  }

  function _switchTab(tab){
    var el=document.getElementById(MODAL_ID);if(!el)return;
    el.querySelectorAll('.lf-cons-lig-tab').forEach(function(b){
      var on=(b.getAttribute('data-tab')===tab);
      b.classList.toggle('on',on);b.setAttribute('aria-selected',on?'true':'false');
    });
    var pt=document.getElementById('lf-cons-lig-pane-today');
    var pa=document.getElementById('lf-cons-lig-pane-all');
    if(pt)pt.classList.toggle('on',tab==='today');
    if(pa)pa.classList.toggle('on',tab==='all');
  }

  function _open(uid, userName){
    if(!uid)return;
    _ensureModalNode();
    _openState={uid:uid, userName:userName||'', history:null};
    var el=document.getElementById(MODAL_ID);
    var ttl=document.getElementById('lf-cons-lig-title');
    if(ttl)ttl.textContent='Ligações — '+(userName||'Consultor');
    _switchTab('today');
    _renderToday();
    _renderAll();
    _openState.history=_buildLocalHistory(uid);
    _renderAll();
    // openM/closeM (utils.js) já gerenciam scroll-lock e z-index. Se
    // indisponíveis por qualquer motivo, cai para display:flex direto.
    if(typeof global.openM==='function'){
      try{global.openM(MODAL_ID);return;}catch(_e){}
    }
    el.classList.add('open');
    el.style.display='flex';
  }

  function _close(){
    var el=document.getElementById(MODAL_ID);
    if(typeof global.closeM==='function'){
      try{global.closeM(MODAL_ID);}catch(_e){}
    }
    if(el){el.classList.remove('open');el.style.display='';}
    _openState={uid:null,userName:'',history:null};
  }

  function _renderToday(){
    var pane=document.getElementById('lf-cons-lig-pane-today');
    if(!pane||!_openState.uid)return;
    var day=_readLocalDay(_openState.uid, _today());
    var horas=(day.list||[]).slice().filter(function(r){return r&&r.hora;}).sort(function(a,b){return (a.n|0)-(b.n|0);});

    // Grid 10 células (mesma cara do bingo).
    var grid='<div class="lf-cons-lig-grid">';
    var marked={}; horas.forEach(function(r){marked[r.n]=r.hora;});
    for(var i=1;i<=10;i++){
      var h=marked[i]?_fmtHM(marked[i]):'';
      grid+='<div class="lf-cons-lig-cell'+(marked[i]?' marked':'')+'" title="'+
        (h?('Ligação '+i+' às '+h):('Ligação '+i))+'">'+i+
        (h?'<span class="lf-cons-lig-cell-h">'+_eH(h)+'</span>':'')+
      '</div>';
    }
    grid+='</div>';

    var kpis=''
      +'<div class="lf-cons-lig-kpis">'
      +  '<div class="lf-cons-lig-kpi"><div class="lf-cons-lig-kpi-v">'+(day.total|0)+'</div><div class="lf-cons-lig-kpi-l">Ligações hoje</div></div>'
      +  '<div class="lf-cons-lig-kpi"><div class="lf-cons-lig-kpi-v">'+(day.rounds|0)+'</div><div class="lf-cons-lig-kpi-l">Rodadas fechadas</div></div>'
      +  '<div class="lf-cons-lig-kpi"><div class="lf-cons-lig-kpi-v">'+(day.list?day.list.length:0)+'/10</div><div class="lf-cons-lig-kpi-l">Rodada atual</div></div>'
      +'</div>';

    var linha;
    if(horas.length){
      linha='<div class="lf-cons-lig-linha"><div class="lf-cons-lig-linha-t">Horários</div><div class="lf-cons-lig-linha-b">'+
        horas.map(function(r){return '<span class="lf-cons-lig-chip">'+r.n+'ª · '+_eH(_fmtHM(r.hora))+'</span>';}).join('')+
      '</div></div>';
    }else{
      linha='<div class="lf-cons-lig-linha lf-cons-lig-empty">Nenhuma ligação marcada hoje.</div>';
    }

    pane.innerHTML=kpis+grid+linha;
  }

  function _renderAll(){
    var summary=document.getElementById('lf-cons-lig-all-summary');
    var list=document.getElementById('lf-cons-lig-all-list');
    if(!summary||!list||!_openState.uid)return;
    var h=_openState.history;
    if(!h){
      summary.innerHTML='<div class="lf-cons-lig-hint">Preparando histórico local…</div>';
      list.innerHTML='';
      return;
    }
    var scopeLbl=h.hasRemote?'local + servidor':'somente local';
    summary.innerHTML=''
      +'<div class="lf-cons-lig-sum-kpis">'
      +  '<div class="lf-cons-lig-sum"><b>'+(h.somaTotal|0)+'</b> ligações em 30 dias</div>'
      +  '<div class="lf-cons-lig-sum"><b>'+(h.diasCom|0)+'</b> dias com atividade</div>'
      +  '<div class="lf-cons-lig-sum"><b>'+(h.somaRounds|0)+'</b> rodadas fechadas</div>'
      +'</div>'
      +'<div class="lf-cons-lig-scope">Fonte: '+_eH(scopeLbl)+'.</div>';

    list.innerHTML=(h.rows||[]).map(function(r){
      var isToday=(r.date===_today());
      var badge=isToday?'<span class="lf-cons-lig-badge">hoje</span>':'';
      var srcCls=(r.source==='merged')?' src-merged':(r.source==='remote'?' src-remote':' src-local');
      return '<div class="lf-cons-lig-row'+srcCls+(r.total>0?' has-lig':'')+'">'
        +'<div class="lf-cons-lig-row-d"><b>'+_eH(_fmtDateBR(r.date))+'</b> <span class="lf-cons-lig-dow">'+_eH(_dayName(r.date))+'</span> '+badge+'</div>'
        +'<div class="lf-cons-lig-row-v">'+(r.total|0)+' ligações · '+(r.rounds|0)+' rodada'+((r.rounds|0)===1?'':'s')+'</div>'
        +'</div>';
    }).join('') || '<div class="lf-cons-lig-empty">Sem histórico local nos últimos 30 dias.</div>';
  }

  // ---------- busca em servidor sob demanda ----------------------------------
  function _fetchServer(){
    if(!_openState.uid){_warn('fetchServer sem uid');return;}
    var uid=_openState.uid;
    var root=global.LiderCRM;
    var wc=root&&root.api&&root.api.workerClient;
    var useWorker=root&&root.config&&root.config.useWorkerApi;
    var btn=document.getElementById('lf-cons-lig-fetch-btn');
    if(!wc||typeof wc.ligacoesList!=='function'||!useWorker){
      if(btn){btn.disabled=true;btn.textContent='Servidor indisponível';}
      if(typeof global.toast==='function')global.toast('Servidor indisponível no momento.',2200);
      return;
    }
    if(btn){btn.disabled=true;btn.textContent='Buscando…';}
    var dates=_last30Dates();
    var local=_buildLocalHistory(uid);
    var localByDate={}; local.rows.forEach(function(r){localByDate[r.date]=r;});

    var promises=dates.map(function(d){
      return wc.ligacoesList(uid,d).then(function(doc){
        var list=(doc&&Array.isArray(doc.list))?doc.list:[];
        var total=(doc&&(doc.total|0))||0;
        var rounds=(doc&&(doc.rounds|0))||0;
        return {date:d, list:list, total:total, rounds:rounds, ok:true};
      }).catch(function(){return {date:d, list:[], total:0, rounds:0, ok:false};});
    });

    Promise.all(promises).then(function(results){
      var merged=[]; var somaTotal=0; var somaRounds=0; var diasCom=0;
      results.forEach(function(rem){
        var loc=localByDate[rem.date]||{date:rem.date,list:[],total:0,rounds:0,source:'local'};
        var m=_mergeDay(loc, rem);
        var row={date:rem.date, list:m.list, total:m.total, rounds:m.rounds, source:rem.ok?'merged':'local'};
        merged.push(row);
        somaTotal+=(row.total|0);
        somaRounds+=(row.rounds|0);
        if((row.total|0)>0)diasCom++;
      });
      _openState.history={rows:merged, somaTotal:somaTotal, diasCom:diasCom, somaRounds:somaRounds, hasRemote:true};
      _renderAll();
      // Se o dia de HOJE mudou depois do merge, atualiza a aba "Hoje" também.
      _renderToday();
      if(btn){btn.disabled=false;btn.textContent='↺ Atualizar servidor';}
      if(typeof global.toast==='function')global.toast('Servidor consultado ('+results.filter(function(r){return r.ok;}).length+'/30 dias).',2200);
    }).catch(function(err){
      _warn('fetchServer falhou',err);
      if(btn){btn.disabled=false;btn.textContent='🔎 Buscar servidor (últimos 30 dias)';}
      if(typeof global.toast==='function')global.toast('Falha ao consultar servidor. Mostrando somente local.',2500);
    });
  }

  // Exposições para uso pelo próprio modal (onclick inline).
  global.__lfConsLigClose=_close;
  global.__lfConsLigFetchServer=_fetchServer;

  // ---------- delegated click no cartão --------------------------------------
  function _handleClick(e){
    var t=e.target;
    if(!t||!t.closest)return;
    // Nunca sequestra cliques em controles interativos internos.
    if(t.closest('button,input,textarea,select,a'))return;
    // Só aceita cartões dentro dos painéis conhecidos (evita colidir com
    // outras telas que reusem `.adm-lig-row`).
    var listAdm=document.getElementById('adm-lig-list');
    var listTime=document.getElementById('time-lig-list');
    var row=t.closest('.adm-lig-row');
    if(!row)return;
    if(!(listAdm&&listAdm.contains(row))&&!(listTime&&listTime.contains(row)))return;

    // Recupera uid do id do row (prefixo é 'adm-lig-row-' OU 'time-lig-row-').
    var id=row.id||'';
    var uid=null;
    if(id.indexOf('adm-lig-row-')===0)uid=id.slice('adm-lig-row-'.length);
    else if(id.indexOf('time-lig-row-')===0)uid=id.slice('time-lig-row-'.length);
    if(!uid)return;

    // Nome do consultor: usa o <strong>/1º filho do row (já renderizado pelos
    // patches anteriores). Fallback: getUsers().
    var nome='';
    try{
      var head=row.querySelector('div[style*="font-weight:600"]');
      if(head){
        // O head contém "Nome <span>…</span>". Pega só o primeiro node de texto.
        var cn=head.firstChild;
        if(cn&&cn.nodeType===3)nome=String(cn.nodeValue||'').trim();
      }
    }catch(_e){}
    if(!nome&&typeof global.getUsers==='function'){
      try{
        var u=(global.getUsers()||[]).find(function(x){return x&&x.id===uid;});
        if(u&&u.nome)nome=u.nome;
      }catch(_e){}
    }

    _open(uid, nome||'Consultor');
    e.preventDefault();
  }

  // Registro no capture pra não ser cancelado por outros handlers.
  document.addEventListener('click', _handleClick, false);

  // ESC fecha o modal (redundante com openM/closeM, mas cobre o fallback).
  document.addEventListener('keydown', function(e){
    if(e.key!=='Escape')return;
    var el=document.getElementById(MODAL_ID);
    if(el&&(el.classList.contains('open')||el.style.display==='flex'))_close();
  });

  _log('installed');
})(window);
