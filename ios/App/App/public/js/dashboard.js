/* lf-fix-renderdash-undefined-v1-20260819-DASH */
/* lf-fix-dash-tab-count-bingo-v1-20260819-DASH — contador de aba respeita a regra do Bingo
   (mesma do renderTable em js/clientes.js): clientes com sourceCardId/sourceOriginalLeadId
   vinculados a um card de Negócios que saiu de agvid/presencial E foram arquivados por
   transição (bingoArchivedAt + steps[0]===false) ficam ocultos da tabela — logo, também
   não podem ser contados na aba. Filtros de busca/nicho/data continuam FORA da contagem
   (contador de aba reflete o total do status, não o filtro ativo). */
/* =====================================================================
 * dashboard.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

// [FIX 20260908] Pedido explícito: substitui as estatísticas antigas
// (Clientes/Fechados/Conversão) do card do consultor por uma lista das
// últimas vezes que ele esteve online — reaproveita o feed de eventos
// de login que já existe (logFeedEvent('login',...), disparado a cada
// login em js/app.js), sem precisar de nenhum dado novo.
function _renderMyLastSeenList(){
  var wrap=document.getElementById('mylastseen-list');if(!wrap)return;
  if(!S||!S.userId||typeof getFeed!=='function'){wrap.innerHTML='<div class="est" style="padding:8px 0">Sem dados ainda</div>';return;}
  var logins=getFeed().filter(function(f){return f&&f.type==='login'&&f.byId===S.userId;});
  // A sessão atual normalmente já é o [0] (login de agora) — mostra as
  // últimas 5, da mais recente pra trás, incluindo a de agora.
  var top=logins.slice(0,5);
  if(!top.length){wrap.innerHTML='<div class="est" style="padding:8px 0">Sem histórico de login ainda</div>';return;}
  var nowMs=Date.now();
  wrap.innerHTML=top.map(function(f,idx){
    var dt='';try{dt=new Date(f.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(_e){}
    var isNow=idx===0&&f.ts&&(nowMs-new Date(f.ts).getTime())<5*60*1000; // login nos últimos 5min = sessão atual
    return '<div style="display:flex;align-items:center;gap:7px;padding:5px 0;font-size:.76rem;color:'+(isNow?'var(--ok)':'var(--tx)')+'">'
      +'<span style="width:6px;height:6px;border-radius:50%;background:'+(isNow?'var(--ok)':'var(--mu)')+';flex-shrink:0"></span>'
      +(isNow?'Agora (sessão atual)':dt)
      +'</div>';
  }).join('');
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDash(){
  if(!S)return;
  if(typeof loadCli!=='function'||typeof getKB!=='function'){setTimeout(renderDash,200);return;}
  // Popula filtro de nicho com opcoes do NICHO_LABELS
  var ns=document.getElementById('flt-nicho');
  if(ns&&ns.options.length<=1){Object.keys(NICHO_LABELS).forEach(function(k){var o=document.createElement('option');o.value=k;o.textContent=NICHO_LABELS[k];ns.appendChild(o);});}
  loadCli(S.userId,function(list){
    var u=getUser(S.userId);
    var e;
    e=document.getElementById('mycnm');if(e)e.textContent=u?u.nome:S.nome;
    e=document.getElementById('mycargo');if(e)e.textContent=(u&&u.cargo)?u.cargo:'Consultor';
    _renderMyLastSeenList();
    renderTable(Array.isArray(list)?list:[]);
    /* Contagem alinhada à regra do Bingo em renderTable (js/clientes.js).
       Só a aba "normal" (Agendados) sofre arquivamento por transição; as
       demais mantêm a contagem simples por status. */
    var _bgByCardC=null,_bgByLeadC=null;
    try{
      if(typeof getKBFor==='function'){
        var _uidC=(S&&S.userId)||'';
        var _ownersC=(typeof getDepartmentVisibleUsers==='function')
          ?getDepartmentVisibleUsers(_uidC).map(function(u){return u.id;})
          :[_uidC];
        if(_ownersC.indexOf(_uidC)<0)_ownersC.push(_uidC);
        _bgByCardC={};_bgByLeadC={};
        _ownersC.forEach(function(_ownerUid){
          (getKBFor('negocios',_ownerUid)||[]).forEach(function(n){
            if(!n)return;
            var _rec={col:n.col,upd:n.updatedAt||null};
            if(n.id)_bgByCardC[n.id]=_rec;
            if(n.originalLeadId)_bgByLeadC[n.originalLeadId]=_rec;
          });
        });
      }
    }catch(_e){_bgByCardC=null;_bgByLeadC=null;}
    function _isBingoArchivedForCount(c){
      if(!_bgByCardC)return false;
      var _bRec=(c.sourceCardId&&_bgByCardC[c.sourceCardId])||(c.sourceOriginalLeadId&&_bgByLeadC[c.sourceOriginalLeadId]);
      if(!_bRec)return false;
      var _bCol=_bRec.col||_bRec;
      var _arch=!!c.bingoArchivedAt;
      var _agOff=(Array.isArray(c.steps)&&c.steps[0]===false);
      return _arch&&_agOff&&_bCol&&_bCol!=='agvid'&&_bCol!=='presencial';
    }
    var counts={normal:0,atendido:0,remarcar:0,noshow:0};
    list.forEach(function(c){
      var s=c.status||STATUS_NORMAL;
      if(s===STATUS_NORMAL&&_isBingoArchivedForCount(c))return; /* mesma ocultação da tabela */
      if(counts[s]!==undefined)counts[s]++;else counts.normal++;
    });
    Object.keys(counts).forEach(function(k){var ce=document.getElementById('cnt-'+k);if(ce)ce.textContent=counts[k];});
  });
}

function setDashTab(tab,btn){_dashTab=tab;document.querySelectorAll('.dtab').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');loadCli(S.userId,function(l){renderTable(Array.isArray(l)?l:[]);});}

function onSearch(q){_searchQ=q.toLowerCase();var cl=document.getElementById('srch-cl');if(cl)cl.style.display=q?'':'none';loadCli(S.userId,function(l){renderTable(Array.isArray(l)?l:[]);});}

function clearSearch(){clearTimeout(_dbTimers['srch']);_searchQ='';var si=document.getElementById('srch-inp');if(si)si.value='';var cl=document.getElementById('srch-cl');if(cl)cl.style.display='none';loadCli(S.userId,function(l){renderTable(Array.isArray(l)?l:[]);});}

function applyDashFilters(){
  _fltNicho=(document.getElementById('flt-nicho')||{}).value||'';
  _fltDate=(document.getElementById('flt-date')||{}).value||'';
  _updateFltClearBtn();
  try{saveSavedFiltersRemote();}catch(e){}
  loadCli(S.userId,function(l){renderTable(Array.isArray(l)?l:[]);});
}

function clearDashFilters(){
  _fltNicho='';_fltDate='';
  var fn=document.getElementById('flt-nicho');if(fn)fn.value='';
  var fd=document.getElementById('flt-date');if(fd)fd.value='';
  _updateFltClearBtn();
  try{saveSavedFiltersRemote();}catch(e){}
  loadCli(S.userId,function(l){renderTable(Array.isArray(l)?l:[]);});
}

function _updateFltClearBtn(){var active=_fltNicho||_fltDate;var b=document.getElementById('flt-clear');if(b)b.style.display=active?'inline-block':'none';}

/* Fonte de verdade combinada (mesmo padrão já usado em _kbHasOverdueLinkedActivity,
   js/kanban.js): primeiro consulta a store central de atividades
   (getActivitiesLocalFor) — que é onde conclusão/reagendamento realmente são
   gravados — e só cai no espelho legado (c.activities) se a store central não
   tiver nada pra esse card. Sem isso, um lembrete concluído/reagendado (que só
   atualiza a store central) continuava aparecendo como atrasado aqui porque
   c.activities ficava com a cópia antiga (done:false, data vencida). */
function _isOverdue(c){
  if(!c||typeof c!=='object')return false;
  var uid=c._timeOwnerUid||c.userId||(S&&S.userId)||'';
  if(typeof getActivitiesLocalFor==='function'&&uid){
    var now1=Date.now();
    var hasLate=getActivitiesLocalFor(uid).some(function(a){
      if(!a||typeof a!=='object')return false;
      if(a.done)return false;if(!a.id)return false;
      if(!a.scheduledAt)return false;
      if(String(a.clientId||'')!==String(c.id||''))return false;
      return _isScheduledExpired(a.scheduledAt,now1);
    });
    if(hasLate)return true;
  }
  var acts=c.activities;
  if(!Array.isArray(acts)||acts.length===0)return false;
  var now=Date.now();
  for(var i=0;i<acts.length;i++){
    var a=acts[i];
    if(!a||typeof a!=='object')continue;
    if(a.done)continue;if(!a.id)continue;
    if(!a.scheduledAt)continue;
    if(_isScheduledExpired(a.scheduledAt,now))return true;
  }
  return false;
}

// ANALYTICS
// ============================================================
var _per='hoje';

var ECR=['#C39A2D','#E07B00','#7B4FA6','#0F7ABF','#3A9FE0','#1B8A5E','#0B6045'];

var PCR=['#C39A2D','#0F7ABF','#1B8A5E','#7B4FA6'];

function setPer(p,btn){_per=p;document.querySelectorAll('.pb').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');var dr=document.getElementById('dr');if(dr)dr.style.display=p==='custom'?'flex':'none';loadCli(S.userId,function(l){drawAnal(l,'krow','funil','psvg','pleg');drawNegKPIs(S.userId,'krow2',(typeof _analyticsDateRange==='function')?_analyticsDateRange('krow'):null);});}

function renderAnal(){loadCli(S.userId,function(l){drawAnal(l,'krow','funil','psvg','pleg');drawNegKPIs(S.userId,'krow2',(typeof _analyticsDateRange==='function')?_analyticsDateRange('krow'):null);});}

function _analyticsRangeConfig(kid){
  if(String(kid||'').indexOf('time-')===0)return {per:(typeof _timePer!=='undefined'?_timePer:'mes'),d1:'time-d1',d2:'time-d2',uids:(typeof _timeViewUid!=='undefined'&&_timeViewUid?[ _timeViewUid ]:[])};
  if(kid==='kadm'){
    var admUsers=(typeof getUsers==='function'?getUsers():[]).filter(function(u){return u&&u.ativo!==false;}).map(function(u){return u.id;});
    return {per:null,d1:null,d2:null,uids:admUsers};
  }
  return {per:(typeof _per!=='undefined'?_per:'mes'),d1:'d1',d2:'d2',uids:(S&&S.userId?[ S.userId ]:[])};
}

function _analyticsDateRange(kid){
  var cfg=_analyticsRangeConfig(kid),per=cfg.per||null;
  if(!per)return null;
  var now=new Date(),start=null,end=null;
  if(per==='hoje'){
    start=new Date(now.getFullYear(),now.getMonth(),now.getDate(),0,0,0,0);
    end=new Date(now.getFullYear(),now.getMonth(),now.getDate(),23,59,59,999);
  }else if(per==='semana'){
    start=new Date(now.getTime()-7*86400000);
    end=now;
  }else if(per==='mes'){
    start=new Date(now.getFullYear(),now.getMonth(),1,0,0,0,0);
    end=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59,999);
  }else if(per==='custom'){
    var d1=cfg.d1?document.getElementById(cfg.d1):null,d2=cfg.d2?document.getElementById(cfg.d2):null;
    if(!(d1&&d2&&d1.value&&d2.value))return null;
    var v1=d1.value,v2=d2.value;
    if(v1>v2){var tmp=v1;v1=v2;v2=tmp;d1.value=v1;d2.value=v2;}
    start=new Date(v1+'T00:00:00');
    end=new Date(v2+'T23:59:59.999');
  }
  if(!start||!end||isNaN(start.getTime())||isNaN(end.getTime()))return null;
  return {start:start,end:end};
}

function _isDateWithinRange(value,range){
  if(!range)return true;
  if(!value)return false;
  var d=(value instanceof Date)?value:new Date(value);
  if(isNaN(d.getTime()))return false;
  return d>=range.start&&d<=range.end;
}

function _countClosedNegocios(uids,range){
  if(typeof getKBFor!=='function')return 0;
  return (uids||[]).reduce(function(sum,uid){
    var arr=getKBFor('negocios',uid)||[];
    return sum+arr.filter(function(c){
      if(!c||c.col!=='fechado')return false;
      if(!range)return true;
      // [FIX 20260820] stageEnteredAt (quando entrou na etapa ATUAL) na
      // frente de updatedAt (qualquer edição) — closedAt continua primeiro
      // por ser o mais específico dos três, quando existir.
      var ref=c.closedAt||c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;
      return _isDateWithinRange(ref,range);
    }).length;
  },0);
}

/* Mesmo padrão de _countClosedNegocios, pra "Compareceu" (steps[4]).
   Antes, "Compareceu" só contava c.steps[4] do registro do Bingo — uma
   bolinha marcada manualmente na tabela. Mover o card de Negócios pra
   Vídeo/Loja muda o status do Bingo (via lf-bingo-sync-v1) mas nunca
   marcava essa bolinha, então a métrica dependia só do toggle manual.
   Conta como "compareceu" qualquer card que JÁ PASSOU por Vídeo/Loja —
   a própria etapa 'vidp' e tudo que só existe depois dela no funil
   ('fich','aprov','fecham','fechado') — exceto se foi desviado pra
   'reag' (remarcado, não chegou a comparecer) ou 'noshow' (não veio). */
var KB_NEG_COLS_ATENDIDO=['vidp','fich','aprov','fecham','fechado'];
function _countAtendidoNegocios(uids,range){
  if(typeof getKBFor!=='function')return 0;
  return (uids||[]).reduce(function(sum,uid){
    var arr=getKBFor('negocios',uid)||[];
    return sum+arr.filter(function(c){
      if(!c||KB_NEG_COLS_ATENDIDO.indexOf(c.col)<0)return false;
      if(!range)return true;
      // [FIX 20260820] mesma correção — stageEnteredAt na frente de
      // updatedAt. Nota: reflete quando entrou na etapa ATUAL, então se o
      // card já passou de vidp pra uma etapa seguinte (fich/aprov/fecham),
      // a data aqui é a da etapa mais recente, não a do primeiro instante
      // em que cruzou o vidp — mais preciso que updatedAt de qualquer
      // forma (que não tinha relação nenhuma com mudança de etapa).
      var ref=c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;
      return _isDateWithinRange(ref,range);
    }).length;
  },0);
}

/* Mesmo padrão, pra "Fichas" (steps[5], "Liberação de Ficha"). Mover um
   card pra coluna 'fich' do Kanban de Negócios nunca atualizava
   c.steps[5] — mesma lacuna que Fechamentos/Compareceu tinham. */
function _countFichaNegocios(uids,range){
  if(typeof getKBFor!=='function')return 0;
  return (uids||[]).reduce(function(sum,uid){
    var arr=getKBFor('negocios',uid)||[];
    return sum+arr.filter(function(c){
      if(!c||c.col!=='fich')return false;
      if(!range)return true;
      var ref=c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;
      return _isDateWithinRange(ref,range);
    }).length;
  },0);
}

/* Mesmo padrão, pra "Agendado" (steps[0] — a base de todo o funil, de
   onde vem o "Total" e o denominador da Taxa). CALIBRAÇÃO 2026-08-17
   (pedido explícito do usuário): clientes migrados do CRM antigo
   (Bitrix) foram colocados direto na etapa Vídeo/Loja do Kanban de
   Negócios, sem passar pelas etapas normais — o toggle manual
   c.steps[0] nunca foi marcado pra eles, então "Compareceu" contava
   esses 20+ migrados (via _countAtendidoNegocios) mas "Agendado" ficava
   só com os poucos marcados manualmente, estourando a % (Compareceu
   aparecia 314% do Agendado). Toda etapa do funil de Negócios, EXCETO
   'retag' (Retornar — ainda não foi agendado), só existe porque em
   algum momento houve agendamento — inclusive 'noshow' (foi agendado e
   sumiu) e 'reag' (foi agendado, precisa remarcar). Conta como
   "agendado" qualquer card fora de 'retag'. */
var KB_NEG_COL_NAO_AGENDADO='retag';
function _countAgendadoNegocios(uids,range){
  if(typeof getKBFor!=='function')return 0;
  return (uids||[]).reduce(function(sum,uid){
    var arr=getKBFor('negocios',uid)||[];
    return sum+arr.filter(function(c){
      if(!c||c.col===KB_NEG_COL_NAO_AGENDADO)return false;
      if(!range)return true;
      // [FIX 20260820] Esta é a métrica citada no pedido — "Agendado" deve
      // refletir a data em que o negócio ENTROU na etapa, não a última vez
      // que qualquer campo dele foi editado. stageEnteredAt na frente de
      // updatedAt resolve exatamente isso.
      var ref=c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;
      return _isDateWithinRange(ref,range);
    }).length;
  },0);
}

/* [FIX 20260821] CALIBRAÇÃO DE ANALYTICS — pedido explícito do usuário
   pra trocar métricas por versões mais específicas do funil real:
   "Leads adicionados no CRM", "Leads agendados (AG Vídeo/Presencial)",
   "Negócios fechados", "Valor fechado", "No-Show/Desistência" e "Taxa"
   (desdobrada em duas: Lead→Negócio e Vídeo/Loja→Ficha). As três
   funções abaixo são novas — as métricas de Negócios (Agendado,
   Fechado, Compareceu, Ficha) já existiam e continuam do jeito que
   estavam, só ganharam rótulo/tooltip mais claros mais abaixo. */

/* "Leads Adicionados no CRM" — pedido explícito: antes o card "Total"
   contava registros do BINGO (tabela de clientes/ligações), que não é
   a mesma coisa que Leads de verdade no Kanban. Conta LEADS
   (board='leads') criados dentro do período — fonte de dado diferente
   de tudo mais nesta página, por isso é uma função própria. */
function _countLeadsAdicionados(uids,range){
  if(typeof getKBFor!=='function')return 0;
  return (uids||[]).reduce(function(sum,uid){
    var arr=getKBFor('leads',uid)||[];
    return sum+arr.filter(function(c){
      if(!c)return false;
      if(!range)return true;
      var ref=c.createdAt||c.data||null;
      return _isDateWithinRange(ref,range);
    }).length;
  },0);
}

/* [FIX 20260906] Pedido explícito: Taxa de Conversão deve ser "dos
   leads ADICIONADOS no período, quantos já foram convertidos" — não
   "quantos leads convertidos no período, comparado com quantos
   adicionados no período" (datas diferentes pro numerador e
   denominador, o que já gerou taxa de 160% — mais leads antigos
   convertendo agora do que leads novos entrando). Ambos os lados
   agora filtram pela MESMA data: c.createdAt (quando o lead foi
   adicionado), não a data em que entrou na etapa "conv". */
function _countLeadsConvertidos(uids,range){
  if(typeof getKBFor!=='function')return 0;
  return (uids||[]).reduce(function(sum,uid){
    var arr=getKBFor('leads',uid)||[];
    return sum+arr.filter(function(c){
      if(!c||c.col!=='conv')return false;
      if(!range)return true;
      var ref=c.createdAt||c.data||null; // mesma referência de _countLeadsAdicionados
      return _isDateWithinRange(ref,range);
    }).length;
  },0);
}

/* "Taxa Vídeo/Loja → Ficha" — numerador: Negócios que JÁ chegaram em
   'fich' ou etapa posterior (aprov/fecham/fechado) — mesmo raciocínio
   de KB_NEG_COLS_ATENDIDO (_countAtendidoNegocios) já usado pra
   "Compareceu": quem passou de 'fich' pra frente também já passou por
   'fich', então conta. O denominador desta taxa é
   _countAtendidoNegocios (quem chegou em vidp ou além) — já existia,
   não precisa de função nova. */
var KB_NEG_COLS_FICHA_OU_ALEM=['fich','aprov','fecham','fechado'];
function _countFichaOuAlemNegocios(uids,range){
  if(typeof getKBFor!=='function')return 0;
  return (uids||[]).reduce(function(sum,uid){
    var arr=getKBFor('negocios',uid)||[];
    return sum+arr.filter(function(c){
      if(!c||KB_NEG_COLS_FICHA_OU_ALEM.indexOf(c.col)<0)return false;
      if(!range)return true;
      var ref=c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;
      return _isDateWithinRange(ref,range);
    }).length;
  },0);
}

function _getClosingReconciliationMetrics(list,opts){
  opts=opts||{};
  var steps=ETP.map(function(_,i){return (list||[]).filter(function(c){return c.steps&&c.steps[i];}).length;});
  var range=('range' in opts)?opts.range:_analyticsDateRange(opts.kid);
  var agCli=steps[0]||0;
  var agKB=_countAgendadoNegocios(opts.uids||[],range);
  var ag=Math.max(agCli,agKB);
  steps[0]=ag;
  var fecCli=steps[6]||0;
  var fecKB=_countClosedNegocios(opts.uids||[],range);
  var fec=Math.max(fecCli,fecKB);
  steps[6]=fec;
  var comCli=steps[4]||0;
  var comKB=_countAtendidoNegocios(opts.uids||[],range);
  var com=Math.max(comCli,comKB);
  steps[4]=com;
  var ficCli=steps[5]||0;
  var ficKB=_countFichaNegocios(opts.uids||[],range);
  var fic=Math.max(ficCli,ficKB);
  steps[5]=fic;
  return {steps:steps,agendamentosCli:agCli,agendamentosKanban:agKB,agendamentos:ag,fechamentosCli:fecCli,fechamentosKanban:fecKB,fechamentos:fec,compareceuCli:comCli,compareceuKanban:comKB,compareceu:com,fichasCli:ficCli,fichasKanban:ficKB,fichas:fic,taxa:ag>0?Math.round(fec/ag*100):0};
}

function drawAnal(list,kid,fid,svid,lgid){
  var now=new Date();
  var filtered=list.filter(function(c){
    if(!c.data)return true;var d=_parseLocalDate(c.data);
    if(_per==='hoje')return d.toDateString()===now.toDateString();
    if(_per==='semana'){var s=new Date(now);s.setDate(now.getDate()-7);return d>=s;}
    if(_per==='mes')return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    if(_per==='custom'){var d1=document.getElementById('d1'),d2=document.getElementById('d2');if(d1&&d2&&d1.value&&d2.value){var _d1v=d1.value,_d2v=d2.value;if(!_parseLocalDate(_d1v).getTime||isNaN(_parseLocalDate(_d1v).getTime())||isNaN(_parseLocalDate(_d2v).getTime())){toast('Data inválida no filtro.');return true;}if(_d1v>_d2v){toast('Data inicial maior que final. Ajustando automaticamente.');d1.value=_d2v;d2.value=_d1v;_d1v=d1.value;_d2v=d2.value;}return c.data>=_d1v&&c.data<=_d2v;}return false;}
    return true;
  });
  var tot=filtered.length;
  var ctx=_analyticsRangeConfig(kid);
  var metr=_getClosingReconciliationMetrics(filtered,{kid:kid,uids:ctx.uids});
  var steps=metr.steps;
  var ag=steps[0]||0,c30=steps[1]||0,c24=steps[2]||0,c2h=steps[3]||0,com=steps[4]||0,fic=steps[5]||0,fec=metr.fechamentos;
  // [FIX 20260821] CALIBRAÇÃO — pedido explícito do usuário. "Total"
  // (registros do Bingo) e "Taxa" (fechamentos÷agendamentos) saem
  // daqui; entram: Leads Adicionados no CRM (fonte de dado nova — o
  // board de Leads de verdade, não o Bingo), Leads Agendados (mesmo
  // cálculo de "ag" acima, só renomeado+detalhado: qualquer Negócio
  // que já passou por AG Vídeo/Presencial), Negócios Fechados (mesmo
  // "fec" acima) e Taxa de Conversão Lead→Negócio (nova: Leads com
  // etapa "Convertido" ÷ Leads Adicionados, ambos no período).
  var range=_analyticsDateRange(kid);
  var leadsAdd=_countLeadsAdicionados(ctx.uids,range);
  var leadsConv=_countLeadsConvertidos(ctx.uids,range);
  var txConv=leadsAdd>0?Math.round(leadsConv/leadsAdd*100):0;
  var kEl=document.getElementById(kid);
  if(kEl)kEl.innerHTML=[
    '<div class="kc k1" style="cursor:pointer" onclick="openAnalyticsDrillDown(\'adicionados\',\''+kid+'\')" title="Leads criados no board de Leads, com data de criação dentro do período selecionado — clique para ver a lista"><div class="kv">'+leadsAdd+'</div><div class="kl">Leads Adicionados</div></div>',
    '<div class="kc k2" style="cursor:pointer" onclick="openAnalyticsDrillDown(\'agendados\',\''+kid+'\')" title="Negócios que chegaram em AG Vídeo ou Presencial (ou etapa posterior), dentro do período selecionado — clique para ver a lista"><div class="kv">'+ag+'</div><div class="kl">Leads Agendados</div></div>',
    '<div class="kc k3" style="cursor:pointer" onclick="openAnalyticsDrillDown(\'fechados\',\''+kid+'\')" title="Negócios que entraram na etapa Fechado dentro do período selecionado — clique para ver a lista"><div class="kv">'+fec+'</div><div class="kl">Negócios Fechados</div></div>',
    '<div class="kc k4" style="cursor:pointer" onclick="openAnalyticsDrillDown(\'convertidos\',\''+kid+'\')" title="Leads Convertidos ÷ Leads Adicionados, no período selecionado — clique para ver os leads convertidos"><div class="kv">'+txConv+'%</div><div class="kl">Taxa Conversão</div></div>'
  ].join('');
  var fEl=document.getElementById(fid);
  if(fEl){var max=Math.max(ag,1);fEl.innerHTML=ETP.map(function(l,i){var v=steps[i]||0;var w=Math.round(v/max*100);return '<div class="fi"><div class="fil">'+l+'</div><div class="fibw"><div class="fib" style="width:'+w+'%;background:'+ECR[i]+'"><span>'+v+'</span></div></div><div class="fip">'+w+'%</div></div>';}).join('');}
  var sEl=document.getElementById(svid),lEl=document.getElementById(lgid);
  if(sEl&&lEl){var cats=[{l:'Agendado',v:ag,c:PCR[0]},{l:'Compareceu',v:com,c:PCR[1]},{l:'Fechou',v:fec,c:PCR[2]},{l:'Outros',v:Math.max(0,tot-ag-com-fec),c:PCR[3]}];var totP=cats.reduce(function(s,c){return s+c.v;},0)||1;var svg='',leg='',angle=0;cats.forEach(function(cat){var slice=cat.v/totP*360;var start=angle;angle+=slice;var r=45,cx=52,cy=52;if(slice>0){var sa=Math.PI*(start-90)/180,ea=Math.PI*(start+slice-90)/180;var x1=cx+r*Math.cos(sa),y1=cy+r*Math.sin(sa),x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea);var lf=slice>180?1:0;svg+='<path d="M'+cx+','+cy+' L'+x1.toFixed(1)+','+y1.toFixed(1)+' A'+r+','+r+' 0 '+lf+',1 '+x2.toFixed(1)+','+y2.toFixed(1)+' Z" fill="'+cat.c+'"/>';}leg+='<div class="pli"><div class="psc" style="background:'+cat.c+'"></div><span>'+cat.l+'</span><span class="plv">'+cat.v+'</span></div>';});sEl.innerHTML=svg;lEl.innerHTML=leg;}
}

function renderAnalWithList(list,kid,fid,svid,lgid){drawAnal(list,kid,fid,svid,lgid);}

function drawNegKPIs(uid,elId,range,kid){
  var el=document.getElementById(elId||'krow2');if(!el)return;
  if(!uid){console.warn('[dash] drawNegKPIs: uid inválido');return;}
  kid=kid||'krow';
  var arr=(typeof getKBFor==='function'?getKBFor('negocios',uid):[]);
  var noshow=arr.filter(function(c){
    if(!c||c.col!=='noshow')return false;
    if(!range)return true;
    var ref=c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;
    return _isDateWithinRange(ref,range);
  }).length;
  // [FIX 20260821] "Negócios Ativos" continua sem filtro de período —
  // é uma contagem do estado ATUAL (quantos estão em aberto agora),
  // não um evento datado como os outros cartões.
  var emAndamento=arr.filter(function(c){return c.col!=='fechado'&&c.col!=='noshow';}).length;
  var valorTotal=arr.filter(function(c){
    if(!c||c.col!=='fechado')return false;
    if(!range)return true;
    var ref=c.closedAt||c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;
    return _isDateWithinRange(ref,range);
  }).reduce(function(s,c){return s+(parseFloat(c.valor)||0);},0);
  var atendido=(typeof _countAtendidoNegocios==='function')?_countAtendidoNegocios([uid],range):0;
  var ficaOuAlem=(typeof _countFichaOuAlemNegocios==='function')?_countFichaOuAlemNegocios([uid],range):0;
  var txFicha=atendido>0?Math.round(ficaOuAlem/atendido*100):0;
  el.innerHTML=[
    '<div class="kc k2" style="cursor:pointer" onclick="openAnalyticsDrillDown(\'ativos\',\''+kid+'\')" title="Negócios que ainda não fecharam nem foram marcados como No-Show/Desistência — clique para ver a lista"><div class="kv">'+emAndamento+'</div><div class="kl">Negócios Ativos</div></div>',
    '<div class="kc k1" style="cursor:pointer" onclick="openAnalyticsDrillDown(\'valorfechado\',\''+kid+'\')" title="Soma do valor de todos os Negócios fechados — clique para ver a lista"><div class="kv" style="font-size:1.1rem">'+fmtBRL(valorTotal)+'</div><div class="kl">Valor Fechado</div></div>',
    '<div class="kc k4" style="cursor:pointer" onclick="openAnalyticsDrillDown(\'noshow\',\''+kid+'\')" title="Negócios que não vieram no AG Vídeo/Presencial, ou que vieram no Vídeo/Loja e não fecharam — clique para ver a lista"><div class="kv">'+noshow+'</div><div class="kl">No-Show/Desistência</div></div>',
    '<div class="kc k3" style="cursor:pointer" onclick="openAnalyticsDrillDown(\'ficha\',\''+kid+'\')" title="Negócios que chegaram em Ficha (ou etapa posterior) ÷ Negócios que chegaram em Vídeo/Loja (ou etapa posterior) — clique para ver a lista"><div class="kv">'+txFicha+'%</div><div class="kl">Taxa Vídeo/Loja → Ficha</div></div>'
  ].join('');
}

// ============================================================
// DETALHAMENTO DOS CARTÕES DO ANALYTICS (pedido explícito: clicar
// num cartão mostra a lista específica de leads/negócios daquele
// número, não só o total).
// ============================================================
var _ANALYTICS_DRILL_DEFS={
  adicionados:{board:'leads',title:'Leads Adicionados',pred:function(c){return true;},ref:function(c){return c.createdAt||c.data||null;}},
  agendados:{board:'negocios',title:'Leads Agendados',pred:function(c){return c.col!==KB_NEG_COL_NAO_AGENDADO;},ref:function(c){return c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;}},
  fechados:{board:'negocios',title:'Negócios Fechados',pred:function(c){return c.col==='fechado';},ref:function(c){return c.closedAt||c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;}},
  convertidos:{board:'leads',title:'Leads Convertidos (dos adicionados no período)',pred:function(c){return c.col==='conv';},ref:function(c){return c.createdAt||c.data||null;}},
  ativos:{board:'negocios',title:'Negócios Ativos',pred:function(c){return c.col!=='fechado'&&c.col!=='noshow';},ref:null},
  valorfechado:{board:'negocios',title:'Valor Fechado',pred:function(c){return c.col==='fechado';},ref:function(c){return c.closedAt||c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;}},
  noshow:{board:'negocios',title:'No-Show/Desistência',pred:function(c){return c.col==='noshow';},ref:function(c){return c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;}},
  ficha:{board:'negocios',title:'Chegaram em Ficha (ou etapa posterior)',pred:function(c){return KB_NEG_COLS_FICHA_OU_ALEM.indexOf(c.col)>=0;},ref:function(c){return c.stageEnteredAt||c.updatedAt||c.createdAt||c.data||null;}}
};
function openAnalyticsDrillDown(kind,kid){
  var def=_ANALYTICS_DRILL_DEFS[kind];if(!def)return;
  var cfg=_analyticsRangeConfig(kid||'krow');
  var range=('range' in (cfg||{}))?cfg.range:_analyticsDateRange(kid||'krow');
  var items=[];
  (cfg.uids||[]).forEach(function(uid){
    (getKBFor(def.board,uid)||[]).forEach(function(c){
      if(!c||!def.pred(c))return;
      if(def.ref&&range&&!_isDateWithinRange(def.ref(c),range))return;
      items.push({card:c,uid:uid});
    });
  });
  items.sort(function(a,b){
    var da=(def.ref?def.ref(a.card):a.card.createdAt)||'';
    var db=(def.ref?def.ref(b.card):b.card.createdAt)||'';
    return db<da?-1:(db>da?1:0);
  });
  var body=document.getElementById('anal-drill-body');
  var titleEl=document.getElementById('anal-drill-title');
  if(titleEl)titleEl.textContent=def.title+' ('+items.length+')';
  if(body){
    body.innerHTML=items.length?items.map(function(it){
      var c=it.card;
      var dt='';try{var d=def.ref?def.ref(c):c.createdAt;if(d)dt=new Date(d).toLocaleDateString('pt-BR');}catch(_e){}
      var stageLbl=(typeof _colLabel==='function')?_colLabel(def.board,c.col):c.col;
      return '<div class="anal-drill-item" onclick="closeM(\'mo-anal-drill\');openKBDet(\''+c.id+'\',\''+def.board+'\',\''+it.uid+'\')">'
        +'<div class="anal-drill-name">'+eH(c.name||'')+'</div>'
        +'<div class="anal-drill-sub">'+eH(stageLbl||'')+(dt?' · '+dt:'')+(c.tel?' · '+eH(c.tel):'')+'</div>'
        +'</div>';
    }).join(''):'<div class="est">Nenhum registro neste período</div>';
  }
  openM('mo-anal-drill');
}

// ============================================================
// BUSCA GLOBAL
// ============================================================
function openGSearch(){
  openM('mo-gsearch');
  var res=document.getElementById('gsearch-results');
  if(res)res.innerHTML='<div style="color:var(--mu);font-size:.78rem;text-align:center;padding:20px">Digite para buscar...</div>';
  setTimeout(function(){var inp=document.getElementById('gsearch-inp');if(inp){inp.value='';inp.focus();}},150);
}

function runGSearch(){
  if(typeof getKBFor!=='function'||typeof getKB!=='function'){toast('Carregando... tente novamente em instantes.');return;}
  var _gsi=document.getElementById('gsearch-inp');
  var q=(_gsi?_gsi.value||'':'').trim().toLowerCase();
  var res=document.getElementById('gsearch-results');if(!res)return;
  if(q.length<2){res.innerHTML='<div style="color:var(--mu);font-size:.78rem;text-align:center;padding:16px">Digite ao menos 2 caracteres</div>';return;}
  var hits=[];
  // Leads e Negócios
  ['leads','negocios'].forEach(function(board){
    var users=hasAdminAccess()?getUsers().filter(function(u){return u.ativo;}):[{id:S.userId,nome:S.nome}];
    users.forEach(function(u){
      getKBFor(board,u.id).forEach(function(c){
        if(c.name.toLowerCase().indexOf(q)>=0||(c.tel||'').indexOf(q)>=0||(c.obs||'').toLowerCase().indexOf(q)>=0){
          hits.push({type:board,label:board==='leads'?'Lead':'Negócio',icon:board==='leads'?'🎯':'💼',nome:c.name,sub:_colLabel(board,c.col)+(c.tel?' · '+c.tel:''),id:c.id,uid:u.id,board:board});
        }
      });
    });
  });
  // Clientes (dashboard)
  if(hasAdminAccess()){
    getUsers().filter(function(u){return u.ativo;}).forEach(function(u){
      getCliLocal(u.id).forEach(function(c){
        if((c.nome||c.name||'').toLowerCase().indexOf(q)>=0||(c.tel||'').indexOf(q)>=0){
          hits.push({type:'cliente',label:'Cliente',icon:'👤',nome:c.nome||c.name||'?',sub:'Dashboard',id:c.id,uid:u.id,board:null});
        }
      });
    });
  } else {
    getCliLocal(S.userId).forEach(function(c){
      if((c.nome||c.name||'').toLowerCase().indexOf(q)>=0||(c.tel||'').indexOf(q)>=0){
        hits.push({type:'cliente',label:'Cliente',icon:'👤',nome:c.nome||c.name||'?',sub:'Dashboard',id:c.id,uid:S.userId,board:null});
      }
    });
  }
  hits=hits.slice(0,40);
  if(!hits.length){res.innerHTML='<div style="color:var(--mu);font-size:.78rem;text-align:center;padding:16px">Nenhum resultado para "'+eH(q)+'"</div>';return;}
  res.innerHTML=hits.map(function(h){
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;cursor:pointer;margin-bottom:3px;transition:background .15s" onmouseover="this.style.background=\'rgba(195,154,45,.09)\'" onmouseout="this.style.background=\'\'" onclick="gSearchOpen(\''+_jsSq(h.type)+'\',\''+_jsSq(h.id)+'\',\''+_jsSq(h.uid)+'\',\''+_jsSq(h.board)+'\')"><span style="font-size:1.1rem">'+h.icon+'</span><div style="flex:1;min-width:0"><div style="font-size:.82rem;color:var(--tx);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+eH(h.nome)+'</div><div style="font-size:.67rem;color:var(--mu)"><span style="color:var(--al)">'+h.label+'</span> · '+eH(h.sub)+'</div></div></div>';
  }).join('');
}

function gSearchOpen(type,id,uid,board){
  closeM('mo-gsearch');
  function _tryOpen(fn,retries){
    retries=retries||0;
    try{fn();}catch(e){if(retries<6)setTimeout(function(){_tryOpen(fn,retries+1);},120);}
  }
  if(type==='leads'||type==='negocios'){
    _kbViewUid[type]=uid!==S.userId?uid:null;_kbNavFromAdm=!!(_kbViewUid[type]);
    goPage(type);
    setTimeout(function(){_tryOpen(function(){openKBDet(id,type,uid);});},200);
  } else if(type==='cliente'){
    goPage('dash');
    // CORREÇÃO (auditoria, rastreamento de proveniência): chamava openTimeline(id) direto,
    // sem passar por admOpenTimeline() — que é quem seta _tlOwnerUid (variável global lida
    // por openTimeline/setCliStatus/autoSaveObs/changeResponsible). Como _tlOwnerUid é
    // resetada pra null a cada fechamento do modal (ver closeM), buscar um cliente de OUTRO
    // consultor pela Busca Global caía no fallback S.userId (o próprio ADM): o timeline
    // certo nunca era encontrado nessa lista errada e o modal simplesmente não abria, sem
    // nenhum aviso. Usa admOpenTimeline(uid,id) — que já seta _tlOwnerUid corretamente e
    // mostra um toast de "Nao encontrado" no caso de falha real.
    setTimeout(function(){_tryOpen(function(){admOpenTimeline(uid,id);});},200);
  }
}

/* Preenche o cabeçalho do drawer (avatar/nome/cargo) e mostra/esconde os links de
   Time/ADM de acordo com a permissão atual do usuário logado. */
function renderMobileMenu(){
  if(!S)return;
  var u=getUser(S.userId);
  var av=document.getElementById('mmd-av');
  if(av){av.textContent=(u?u.nome:S.nome).charAt(0).toUpperCase();av.style.background=AVB[(u?u.cor:0)%AVB.length];}
  var nm=document.getElementById('mmd-name');if(nm)nm.textContent=u?u.nome:S.nome;
  var cg=document.getElementById('mmd-cargo');if(cg)cg.textContent=u?(u.cargo||''):'';
  var admLink=document.getElementById('mmd-adm-link');if(admLink)admLink.style.display=hasAdminAccess()?'':'none';
  // Mantém o menu mobile alinhado com a navegação desktop: ADM também precisa do atalho
  // para "Time", já que possui acesso de supervisor e no celular não existe a barra superior.
  var timeLink=document.getElementById('mmd-time-link');if(timeLink)timeLink.style.display=hasSupervisorAccess()?'':'none';
}

/* Espelha avatar/badge de atividades do header desktop para os elementos mobile
   equivalentes (mtb-av, mtb-act-badge), já que IDs não podem se repetir no DOM. */
function syncMobileHeaderFromDesktop(){
  var dav=document.getElementById('nav-av'),mav=document.getElementById('mtb-av');
  if(dav&&mav){mav.textContent=dav.textContent;mav.style.background=dav.style.background;}
  var dbadge=document.getElementById('act-badge'),mbadge=document.getElementById('mtb-act-badge');
  if(dbadge&&mbadge){mbadge.textContent=dbadge.textContent;mbadge.className=dbadge.className;}
}

// Observa mudanças no avatar/badge desktop pra manter os espelhos mobile sincronizados,
// sem precisar caçar todo lugar do código que já atualiza nav-av/act-badge.
// CORREÇÃO (2026-07-14): esses observers escrevem em elementos diferentes dos
// que observam (nav-av/act-badge -> mtb-av/mtb-act-badge), então hoje não
// causam auto-disparo. Mesmo assim, adicionamos a mesma trava usada no
// Messenger como proteção contra regressão futura (ex.: se algum dia esses
// elementos passarem a ficar aninhados).
(function(){
  var syncScheduled=false;
  function syncGuarded(){
    if(syncScheduled)return;
    syncScheduled=true;
    (window.requestAnimationFrame||function(cb){setTimeout(cb,16);})(function(){
      syncScheduled=false;
      syncMobileHeaderFromDesktop();
    });
  }
  var navAv=document.getElementById('nav-av');
  if(navAv&&window.MutationObserver){
    new MutationObserver(syncGuarded).observe(navAv,{childList:true,characterData:true,subtree:true,attributes:true});
  }
  var actBadge=document.getElementById('act-badge');
  if(actBadge&&window.MutationObserver){
    new MutationObserver(syncGuarded).observe(actBadge,{childList:true,characterData:true,subtree:true,attributes:true});
  }
})();

/* ===== DASHBOARD MOBILE ===== */
function renderMobileDash(){
  if(!S)return;
  var u=getUser(S.userId);
  var greet=document.getElementById('mdash-greet');
  if(greet){
    var h=new Date().getHours();
    var saud=h<12?'Bom dia':(h<18?'Boa tarde':'Boa noite');
    greet.textContent=saud+', '+((u&&u.nome)?(u.nome.split(' ')[0]):(S&&S.nome?S.nome.split(' ')[0]:'Usuário'))+'!';
  }
  /* Fonte unica: reconcilia o cadastro legado 'cli/steps' (usado no desktop, ver renderDash/
     renderAdmMetrics) com o kanban 'kb leads/negocios' (unica fonte usada aqui antes desta
     correcao), pelo mesmo criterio ja aplicado em renderAdmMetrics (Math.max entre as duas
     fontes). Sem isso, o card 'Meu Painel' do mobile e o card 'Meus' do desktop podiam mostrar
     Total/Fechamentos/Taxa diferentes para o mesmo consultor: bases distintas e a Taxa usava
     denominadores diferentes (negs.length no mobile vs agendamentos no desktop). */
  loadCli(S.userId,function(list){
    var leads=getKB('leads'),negs=getKB('negocios');
    var tot=Math.max(list.length,leads.length);
    var fecCli=list.filter(function(c){return c.steps&&c.steps[6];}).length;
    var fecKB=negs.filter(function(c){return c.col==='fechado';}).length;
    var fech=Math.max(fecCli,fecKB);
    var ag=list.filter(function(c){return c.steps&&c.steps[0];}).length;
    var tx=ag>0?Math.round(fech/ag*100):0;
    var acts=(typeof getActivities==='function')?getActivities():[];
    // [FIX 20260820] mesma exclusão de órfãs — sem isso "Atividades
    // Pendentes" contava tarefas de leads/negócios já excluídos.
    var pend=acts.filter(function(a){
      if(!a||a.done)return false;
      if(typeof _isActivityOrphanOrInactive==='function'&&_isActivityOrphanOrInactive(a,S&&S.userId))return false;
      return true;
    }).length;
    var elL=document.getElementById('mdash-kpi-leads');if(elL)elL.textContent=tot;
    var elF=document.getElementById('mdash-kpi-fech');if(elF)elF.textContent=fech;
    var elT=document.getElementById('mdash-kpi-tx');if(elT)elT.textContent=tx+'%';
    var elP=document.getElementById('mdash-kpi-pend');if(elP)elP.textContent=pend;
  });
  var recEl=document.getElementById('mdash-recent');
  if(recEl){
    var feed=(typeof getFeed==='function'?getFeed():[]).slice(0,5);
    if(!feed.length)recEl.innerHTML='<div class="act-empty">Nenhuma atividade recente.</div>';
    else recEl.innerHTML=feed.map(function(f){
      var dt=new Date(f.ts).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
      return '<div class="mdash-recent-item"><strong>'+eH((f.byName||'?').split(' ')[0])+'</strong> &middot; '+eH(f.itemName||'')+(f.detail?' &mdash; '+eH(f.detail):'')+'<div class="mr-time">'+dt+'</div></div>';
    }).join('');
  }
}

/* Hook não-invasivo: depois que goPage() termina de rotear, sincroniza o "chrome" mobile
   (título do header, item ativo da nav inferior) e atualiza o dashboard mobile.
   A lista mobile de Leads/Negócios já é tratada dentro do próprio renderKB(). */
function hookMobileGoPage() {
  if (typeof goPage === 'function' && !goPage._mobileHooked) {
    var _origGoPage = goPage;
    goPage = function(p) {
      _origGoPage(p);
      if (p === 'dash') renderMobileDash();
    };
    goPage._mobileHooked = true;
  } else if (typeof goPage === 'undefined') {
    // Se goPage ainda não existe (race condition), tenta novamente em breve
    setTimeout(hookMobileGoPage, 50);
  }
}
hookMobileGoPage();

window.addEventListener('resize',function(){
  if(_mbResizeTimer)clearTimeout(_mbResizeTimer);
  _mbResizeTimer=setTimeout(function(){
    var active=document.querySelector('.pg.on');
    if(!active)return;
    var id=active.id.replace('pg-','');
    if(id==='leads')renderKBLocal('leads');
    if(id==='negocios')renderKBLocal('negocios');
    if(id==='dash')renderMobileDash();
  },200);
  // Bug fix: o widget de ligações (#lig-widget) é posicionado com left/top em px
  // fixos, calculados contra window.innerWidth/innerHeight no momento do drag.
  // Ao girar o dispositivo (retrato<->paisagem) ou redimensionar a janela, essas
  // coordenadas antigas podem cair fora da nova viewport, deixando o widget preso
  // fora da tela e inacessível. Reencaixa nos limites atuais sempre que o resize
  // dispara, tanto se estiver visível quanto oculto (evita reaparecer fora da tela
  // na próxima abertura).
  var _lw=document.getElementById('lig-widget');
  if(_lw&&_lw.style.left){
    var _lwL=parseFloat(_lw.style.left)||0,_lwT=parseFloat(_lw.style.top)||0;if(!isFinite(_lwL))_lwL=0;if(!isFinite(_lwT))_lwT=0;
    _lw.style.left=Math.max(0,Math.min(window.innerWidth-_lw.offsetWidth,_lwL))+'px';
    _lw.style.top=Math.max(56,Math.min(window.innerHeight-_lw.offsetHeight,_lwT))+'px';
  }
},{passive:true});
