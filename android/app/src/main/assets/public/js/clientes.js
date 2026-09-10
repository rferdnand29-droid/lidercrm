/* R10-18: guard para loadCli ainda não disponível no boot */
function _safeLoadCli(uid,cb){if(typeof loadCli==='function')loadCli(uid,cb);else{cb([]);console.warn('[clientes] loadCli não disponível');}}
/* =====================================================================
 * clientes.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

function ck(uid){return 'lf6_c_'+uid;}

/* Cache curto do índice etapa-atual dos Negócios usado por renderTable()
   (ver comentário completo lá dentro). */
var _bgIndexCache=null;

function getCliLocal(uid){return sg(ck(uid))||[];}

// FASE 3.3 (parte 2, 2026-07-17): saveCli() passa a preferir
// LiderCRM.api.workerClient.saveClientesList() — grava o mesmo formato
// { list, uid, ts } só que via POST /api/v1/clientes/list em vez de
// db.collection('clientes').doc(uid).set() (adaptador legado de
// js/supabase.js). Fallback pro caminho antigo só se o Worker não
// estiver disponível (config.useWorkerApi=false ou script não
// carregado), pra não quebrar em produção durante o rollout.
function saveCli(uid,list){
  var okS=ss(ck(uid),list);
  var clientTs=Date.now();
  var root=window.LiderCRM;
  var wc=root&&root.api&&root.api.workerClient;
  var cfg=root&&root.config;
  if(cfg&&cfg.useWorkerApi&&wc&&typeof wc.saveClientesList==='function'){
    // [FIX 20260829] Antes não tinha nenhuma retentativa — uma falha de rede
    // (mesmo passageira) fazia a gravação desistir na hora, sem tentar de
    // novo. Mesma robustez agora aplicada em saveKBFor: 1 retry automático
    // (1,5s) e, se ainda falhar, entra na fila de retentativas persistente
    // (src/core/offline/retry-queue.js) — reenviada sozinha depois.
    function _remoteSaveCli(attempt){
      syncBusy();
      wc.saveClientesList(uid,list,clientTs).then(syncOk).catch(function(e){
        if(attempt<2){setTimeout(function(){_remoteSaveCli(attempt+1);},1500);}
        else{
          syncErr(e);
          try{
            if(window.LiderCRM&&window.LiderCRM.offline&&window.LiderCRM.offline.retryQueue){
              window.LiderCRM.offline.retryQueue.enqueue({
                method:'PUT',
                path:'/clientes/list?uid='+encodeURIComponent(uid),
                 body:{uid:uid,list:list,clientTs:clientTs},
                meta:{type:'clientes-save',uid:uid}
              });
            }
          }catch(_qe){}
          try{if(typeof toast==='function')toast('⚠️ Sem internet no momento — vou tentar salvar de novo automaticamente assim que a conexão voltar.',5000);}catch(_te){}
        }
      });
    }
    _remoteSaveCli(1);
  }else if(DB_MODE==='firebase'&&db){
    syncBusy();db.collection('clientes').doc(uid).set({list:list,uid:uid,ts:Date.now()}).then(syncOk).catch(syncErr);
  }
  return okS;
}

/* ===== BINGO: regra de etapa + exclusão que "gruda" (2026-08-03) =====
   Regra pedida: no Bingo (aba "Agendados"/Clientes Ativos), só aparece
   cliente cujo Negócio vinculado está em AG Vídeo ou Presencial. Cliente
   sem vínculo (ex.: "+ Lançar Cliente" manual, sem passar pelo Kanban de
   Negócios) continua aparecendo normalmente — a regra só vale quando
   existe de fato um Negócio ligado.
   Isso resolve dois relatos: (1) cliente cujo Negócio já voltou pra
   "Retornar" continuando a aparecer no Bingo; (2) exclusão de um cliente
   do Bingo "não pegando" — a reconciliação (lf-bingo-sync-v1-20260722.js)
   recriava o registro no boot seguinte se o card ainda estivesse parado
   em AG Vídeo/Presencial. Guardamos aqui uma "lápide" por card — versão
   (updatedAt) do card no momento da exclusão — que esse patch consulta
   antes de recriar. Se o card mudou desde então, a lápide expira sozinha
   (é um evento novo, ex.: cliente foi reagendado de verdade). */
function _bingoDismissKey(c){
  if(!c)return null;
  if(c.sourceCardId)return 'card:'+c.sourceCardId;
  if(c.sourceOriginalLeadId)return 'lead:'+c.sourceOriginalLeadId;
  return null;
}
function _bingoDismissedMap(uid){return sg('lf6_bingo_dismissed_'+uid)||{};}
function _bingoRecordDismissal(uid,c,linkedCard){
  var key=_bingoDismissKey(c);if(!key||!uid)return;
  var map=_bingoDismissedMap(uid);
  map[key]=(linkedCard&&(linkedCard.updatedAt||linkedCard.createdAt))||'';
  ss('lf6_bingo_dismissed_'+uid,map);
  // Sincronia em nuvem (2026-08-13): sem isso, a lápide só existe no
  // localStorage DESTE aparelho — qualquer outro dispositivo/supervisor
  // nunca soube da exclusão e a reconciliação do Bingo recria o cliente
  // assim que roda lá. Reaproveita o mesmo mecanismo genérico de
  // documento (getConfig/putConfig) já usado por outras partes do CRM
  // (ver src/shared/http/worker-client.js) — não é endpoint novo.
  setTimeout(_bingoPushCloudDismissals,0);
}
/* Consultado por lf-bingo-sync-v1-20260722.js antes de recriar um
   registro no Bingo. Retorna true = "não recriar" (exclusão ainda vale). */
function _bingoIsDismissed(uid,card){
  if(!card||!uid)return false;
  var map=_bingoDismissedMap(uid);
  var key=card.id?('card:'+card.id):(card.originalLeadId?('lead:'+card.originalLeadId):null);
  if(!key||!Object.prototype.hasOwnProperty.call(map,key))return false;
  var stamp=(card.updatedAt||card.createdAt)||'';
  if(map[key]===stamp)return true;
  delete map[key];ss('lf6_bingo_dismissed_'+uid,map); // card mudou: lápide expira
  return false;
}
window._bingoIsDismissed=_bingoIsDismissed;

/* ===== Sincronia em nuvem das lápides do Bingo (2026-08-13) =====
   Agrega TODAS as lápides conhecidas neste aparelho (uma por owner já visto
   localmente) num único documento na nuvem ('bingo_dismissed_tombstones'),
   e mescla o que vier de outros aparelhos sem nunca apagar/sobrescrever uma
   lápide local com uma remota mais antiga — só preenche o que falta. */
var _bingoCloudSynced=false,_bingoSyncRetries=0;
var BINGO_CLOUD_KEY='bingo_dismissed_tombstones';
var BINGO_LOCAL_PREFIX='lf6_bingo_dismissed_';

function _bingoWorkerClient(){
  var root=window.LiderCRM;
  return (root&&root.api&&root.api.workerClient)||window.workerClient||null;
}
function _bingoKnownOwnerUids(){
  var out={};
  try{
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      if(k&&k.indexOf(BINGO_LOCAL_PREFIX)===0)out[k.slice(BINGO_LOCAL_PREFIX.length)]=true;
    }
  }catch(_e){}
  return Object.keys(out);
}
function _bingoPushCloudDismissals(){
  var wc=_bingoWorkerClient();
  if(!wc||typeof wc.putConfig!=='function')return Promise.resolve(false);
  var byOwner={};
  _bingoKnownOwnerUids().forEach(function(uid){byOwner[uid]=_bingoDismissedMap(uid);});
  return Promise.resolve()
    .then(function(){return wc.putConfig(BINGO_CLOUD_KEY,{byOwner:byOwner,ts:Date.now()});})
    .catch(function(e){console.warn('[bingo] envio de lápides falhou',e);return false;});
}
function _bingoMergeRemoteIntoLocal(remoteByOwner){
  Object.keys(remoteByOwner||{}).forEach(function(uid){
    var remoteMap=remoteByOwner[uid]||{};
    var localMap=_bingoDismissedMap(uid);
    var changed=false;
    Object.keys(remoteMap).forEach(function(key){
      if(!Object.prototype.hasOwnProperty.call(localMap,key)){
        localMap[key]=remoteMap[key];
        changed=true;
      }
    });
    if(changed)ss('lf6_bingo_dismissed_'+uid,localMap);
  });
}
function _bingoSyncCloudDismissals(){
  if(_bingoCloudSynced)return;
  var wc=_bingoWorkerClient();
  if(!wc||typeof wc.getConfig!=='function'){
    if(_bingoSyncRetries++<20)setTimeout(_bingoSyncCloudDismissals,500);
    return;
  }
  wc.getConfig(BINGO_CLOUD_KEY).then(function(doc){
    var byOwner=(doc&&doc.byOwner)||(doc&&doc.value)||doc||{};
    _bingoCloudSynced=true;
    _bingoMergeRemoteIntoLocal((byOwner&&typeof byOwner==='object')?byOwner:{});
    _bingoPushCloudDismissals();
  }).catch(function(e){
    console.warn('[bingo] leitura de lápides da nuvem falhou',e);
    if(_bingoSyncRetries++<8)setTimeout(_bingoSyncCloudDismissals,Math.min(1500*Math.pow(2,_bingoSyncRetries),30000));
  });
}
// Roda uma vez, pouco depois do login (dá tempo do token do Worker ficar
// pronto — mesma folga usada pela reconciliação do lf-bingo-sync-v1).
(function _bingoScheduleCloudSyncBoot(){
  function _tryStart(){
    if(window.S&&window.S.userId){setTimeout(_bingoSyncCloudDismissals,1500);return;}
    setTimeout(_tryStart,1000);
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',_tryStart);}
  else{_tryStart();}
})();

var _cliPage=1, _cliPerPage=50;
function _cliPaginate(list){
  var total=list.length;
  var pages=Math.max(1,Math.ceil(total/_cliPerPage));
  if(_cliPage>pages)_cliPage=pages;
  if(_cliPage<1)_cliPage=1;
  var start=(_cliPage-1)*_cliPerPage;
  return {items:list.slice(start,start+_cliPerPage),total:total,pages:pages,page:_cliPage};
}
function _cliPageHTML(info){
  if(info.pages<=1)return '';
  var btns='';
  for(var i=1;i<=info.pages;i++){
    var cl=i===info.page?'fb on':'fb';
    btns+='<button class="'+cl+'" onclick="_cliGoPage('+i+')" style="min-width:30px">'+i+'</button>';
  }
  return '<div style="display:flex;gap:4px;justify-content:center;padding:10px 0;flex-wrap:wrap"><span style="font-size:.7rem;color:var(--mu);align-self:center;margin-right:6px">'+info.total+' itens</span>'+btns+'</div>';
}
function _cliGoPage(p){_cliPage=p;renderDash();}
function renderTable(list){
  // FIX (lf-fix-renderdash-undefined-v1-20260819): wrappers de patch (ex.: bingo-aggregate) podem
  // chamar renderTable(undefined) — sem guarda, list.filter() quebrava
  // o dashboard inteiro. Normaliza para [] antes de qualquer uso.
  if(!Array.isArray(list))list=[];
  var _uidBg=(S&&S.userId)||'';
  // Índice etapa-atual dos Negócios, montado 1x por render (não por linha) —
  // usado pela regra do bingo abaixo. Só monta quando a aba é "normal", que é
  // a única onde a regra se aplica.
  // Cobre TODOS os donos visíveis (não só o usuário logado): pra um consultor
  // comum isso é só ele mesmo (sem custo extra, mesmo resultado de antes) —
  // mas pra supervisor/ADM, o Bingo pode ter clientes vinculados a cards de
  // Negócios de subordinados. Sem isso, o índice não achava a etapa desses
  // cards (retornava undefined) e o filtro não escondia clientes cujo
  // Negócio já tinha saído de AG Vídeo/Presencial havia tempo.
  // CACHE (curto, 800ms): pra ADM com escopo "todos" (dezenas/centenas de
  // usuários), montar esse índice é uma leitura de localStorage por usuário
  // visível — barato uma vez, mas renderTable() roda a cada tecla digitada
  // na busca (onSearch) e a cada troca de aba. Sem cache isso vira leitura
  // repetida da MESMA base a cada tecla — é exatamente o padrão que travou
  // o CRM pro ADM "Hudson" no atual (visto na auditoria: N usuários × M
  // cards de JSON.parse síncrono por render). Aqui não chega a ser N×M
  // (o índice é O(N), não por card), mas o cache elimina o custo repetido
  // mesmo assim, sem precisar de nenhuma camada extra por fora.
  var _bgByCard=null,_bgByLead=null;
  if(_dashTab==='normal'&&typeof getKBFor==='function'){
    var _now=Date.now();
    if(_bgIndexCache&&_bgIndexCache.uid===_uidBg&&(_now-_bgIndexCache.at)<800){
      _bgByCard=_bgIndexCache.byCard;_bgByLead=_bgIndexCache.byLead;
    }else{
      _bgByCard={};_bgByLead={};
      var _bgOwners=(typeof getDepartmentVisibleUsers==='function')
        ?getDepartmentVisibleUsers(_uidBg).map(function(u){return u.id;})
        :[_uidBg];
      if(_bgOwners.indexOf(_uidBg)<0)_bgOwners.push(_uidBg);
      _bgOwners.forEach(function(_ownerUid){
        (getKBFor('negocios',_ownerUid)||[]).forEach(function(n){
          if(!n)return;
          /* BUG #2 (2026-08-19): o índice passa a carregar também o
             updatedAt do Negócio, pra o filtro decidir arquivamento
             pela TRANSIÇÃO (neg.updatedAt > bingoArchivedAt) e não
             mais pela coluna atual sozinha. */
          var _rec={col:n.col,upd:n.updatedAt||null};
          if(n.id)_bgByCard[n.id]=_rec;
          if(n.originalLeadId)_bgByLead[n.originalLeadId]=_rec;
        });
      });
      _bgIndexCache={uid:_uidBg,at:_now,byCard:_bgByCard,byLead:_bgByLead};
    }
  }
  var filtered=list.filter(function(c){
    var st=c.status||STATUS_NORMAL;
    // FIX (lf-bingo-sync v1 20260722): a aba "normal" (Agendados) aceitava também
    // STATUS_ATENDIDO — o que fazia o cliente NÃO sumir de Agendados ao virar
    // Atendimento (ex.: quando o card de Negócios entra em Video/Loja e este patch
    // muda o status pra atendido). Agora "normal" mostra só quem ainda está de fato
    // Agendado; os Atendidos ficam só na aba própria.
    if(_dashTab==='normal'&&st!==STATUS_NORMAL)return false;
    if(_dashTab==='atendido'&&st!==STATUS_ATENDIDO)return false;
    if(_dashTab==='remarcar'&&st!==STATUS_REMARCAR)return false;
    if(_dashTab==='noshow'&&st!==STATUS_NOSHOW)return false;
    // REGRA DO BINGO — ARQUIVAR POR TRANSIÇÃO (correção 2026-08-19).
    // Antes: filtro estrito pela COLUNA ATUAL do Negócio — qualquer
    // saída temporária de agvid/presencial (mesmo já revertida por
    // outra aba/dispositivo) sumia com o cliente até a próxima sync.
    // Agora: o arquivamento acontece UMA VEZ, no momento da transição
    // (syncNegocioToBingo), e grava c.bingoArchivedAt + steps[0]=false.
    // Aqui só ocultamos quem foi arquivado por transição E cujo card
    // NÃO voltou às colunas operacionais. Se o card voltou pra
    // agvid/presencial (por qualquer aba/dispositivo), o cliente
    // reaparece imediatamente — o reconcile restore-only do patch
    // strict re-marca steps[0]. Sem vínculo (lançado manual) ou sem
    // arquivamento por transição: comportamento preservado.
    if(_bgByCard){
      var _bRec=(c.sourceCardId&&_bgByCard[c.sourceCardId])||(c.sourceOriginalLeadId&&_bgByLead[c.sourceOriginalLeadId]);
      if(_bRec){
        var _bCol=_bRec.col||_bRec; /* compat: string (cache antigo) ou objeto */
        var _arch=!!c.bingoArchivedAt;
        var _agOff=(Array.isArray(c.steps)&&c.steps[0]===false);
        if(_arch&&_agOff&&_bCol&&_bCol!=='agvid'&&_bCol!=='presencial')return false;
      }
    }
    if(_searchQ&&(c.nome||"").toLowerCase().indexOf(_searchQ)<0)return false;
    if(_fltNicho&&(c.nicho||'')!==_fltNicho)return false;
    if(_fltDate&&(c.data||'').slice(0,10)!==_fltDate)return false;
    return true;
  });
  var lb=document.getElementById('twt-label');
  if(lb){var labs={normal:'Clientes Ativos',atendido:'Atendimentos',remarcar:'Para Remarcar',noshow:'No-Shows'};lb.textContent=labs[_dashTab]||'Clientes';}
  var tb=document.getElementById('tbody');if(!tb)return;
  if(!filtered.length){tb.innerHTML='<tr><td colspan="9" class="est">Nenhum cliente.</td></tr>';return;}
  var pg=_cliPaginate(filtered);
  tb.innerHTML=pg.items.map(function(c){
    var stp=ETP.map(function(_,i){var done=c.steps&&c.steps[i];var dcClass=done?(i===6?'cls':'done'):'pend';var tipDate=done&&c.stepDates&&c.stepDates[i]?' — '+new Date(c.stepDates[i]).toLocaleString('pt-BR'):'';var tipText=ETP[i]+tipDate;return '<td><div class="sd-wrap"><span class="sd '+dcClass+'" onclick="toggleStep(\''+_jsSq(c.id)+'\','+i+')" title="'+_htmlAttr(ETP[i])+'">'+SLB[i]+'</span><div class="sd-tip">'+escapeHtml(tipText)+'</div></div></td>';}).join('');
    var sbadge='';if(c.status===STATUS_REMARCAR)sbadge='<span class="sbadge rem">Remarcar</span>';if(c.status===STATUS_NOSHOW)sbadge='<span class="sbadge nsh">No-Show</span>';
    var ownerUidJs=_jsSq(c.__ownerUid||'');
    var statusBtn='<button class="bingo-status-btn" title="Mudar status" aria-label="Mudar status" onclick="event.stopPropagation();openBingoStatusPicker(\''+_jsSq(c.id)+'\',\''+ownerUidJs+'\',\''+_jsSq(c.status||STATUS_NORMAL)+'\')">🔄</button>';
    return '<tr><td class="tdn"><span onclick="openCliLinkedLead(\''+_jsSq(c.id)+'\')" style="cursor:pointer">'+escapeHtml(c.nome)+sbadge+'</span>'+statusBtn+'</td>'+stp+'<td><button class="bdl" aria-label="Remover cliente" onclick="openDelCli(\''+_jsSq(c.id)+'\')">&#128465;</button></td></tr>';
  }).join('');
  var pgEl=document.getElementById('cli-pagination');
  if(pgEl)pgEl.innerHTML=_cliPageHTML(pg);
}

// Dashboard clientes CRUD

function toggleStep(cid,idx){
  if(!S||!S.userId)return;
  var list=getCliLocal((S&&S.userId)||'');
  var c=list.find(function(x){return x.id===cid;});
  if(!c)return;
  if(!c.steps)c.steps=Array(7).fill(false);
  if(!c.stepDates)c.stepDates=Array(7).fill(null);
  c.steps[idx]=!c.steps[idx];
  c.stepDates[idx]=c.steps[idx]?new Date().toISOString():null;
  /* CORREÇÃO 2026-08-05: faltava atualizar c.updatedAt aqui. O merge
     entre servidor e cache local (_mergeKeepLocalOnly, ver
     src/modules/kanban/runtime/kanban-helpers.js) decide qual versão
     "ganha" comparando updatedAt — sem bumpar esse campo, marcar uma
     bolinha (Ag/30s/etc) num aparelho podia ficar sem refletir em
     outro (relatado: "cliente Presencial, Ag não pintado no
     Capacitor, mas pintado no PC") — o dado até chegava no servidor,
     mas o timestamp desatualizado deixava o merge inseguro sobre qual
     versão era realmente a mais nova. */
  c.updatedAt=new Date().toISOString();
  saveCli((S&&S.userId)||'',list);
  renderDash();
}

function openDelCli(id){_dcId=id;if(!S||!S.userId)return;var l=getCliLocal((S&&S.userId)||'');var c=l.find(function(x){return x.id===id;});var m=document.getElementById('dcmsg');if(m)m.textContent='Remover '+(c?c.nome:'')+' ?';openM('mo-dc');}

function closeDC(){closeM('mo-dc');_dcId=null;}

function confirmDC(){
  if(!_dcId||!S||!S.userId)return;
  var full=getCliLocal(S.userId);
  var _delC=full.find(function(x){return x.id===_dcId;});
  if(_delC&&(_delC.sourceCardId||_delC.sourceOriginalLeadId)&&typeof getKBFor==='function'){
    // Busca o card vinculado em TODOS os donos visíveis, não só no logado —
    // um Negócio pode ter sido transferido de responsável depois que o
    // registro do Bingo foi criado (o vínculo sourceCardId não muda com a
    // transferência). Sem isso, excluir aqui não "grudava": _linked ficava
    // null, a lápide era gravada com stamp vazio, e a próxima sincronização
    // recriava o cliente porque a checagem de "card mudou" comparava a
    // lápide vazia com o updatedAt real do card (sempre diferente).
    var _ownerUids=(typeof getDepartmentVisibleUsers==='function')
      ?getDepartmentVisibleUsers(S.userId).map(function(u){return u.id;})
      :[S.userId];
    if(_ownerUids.indexOf(S.userId)<0)_ownerUids.push(S.userId);
    var _linked=null,_linkedOwner=S.userId;
    for(var i=0;i<_ownerUids.length&&!_linked;i++){
      var _negs=getKBFor('negocios',_ownerUids[i])||[];
      var _hit=(_delC.sourceCardId&&_negs.find(function(n){return n&&n.id===_delC.sourceCardId;}))||
                (_delC.sourceOriginalLeadId&&_negs.find(function(n){return n&&n.originalLeadId===_delC.sourceOriginalLeadId;}))||null;
      if(_hit){_linked=_hit;_linkedOwner=_ownerUids[i];}
    }
    _bingoRecordDismissal(S.userId,_delC,_linked);
    // Grava também sob o dono real do card (se for diferente de quem está
    // excluindo), pra que a reconciliação que roda quando ESSE dono logar
    // também respeite a exclusão.
    if(_linked&&_linkedOwner!==S.userId)_bingoRecordDismissal(_linkedOwner,_delC,_linked);
  }
  var l=full.filter(function(x){return x.id!==_dcId;});
  if(typeof window._lfMarkRecentlyDeleted==='function')window._lfMarkRecentlyDeleted(_dcId);
  saveCli(S.userId,l);closeDC();renderDash();toast('Removido');
}

// [FIX 20260828] Pedido explícito: mudar o status (Agendado/Remarcar/
// No-Show) direto na lista do Bingo, sem precisar entrar nos detalhes
// do lead. Abre um popup pequeno e chama setCliStatus/openNoShowModal
// com skipNav:true — muda o status e fecha, sem navegação nenhuma.
var _bpsCid=null,_bpsOwnerUid=null;
function openBingoStatusPicker(cid,ownerUid,currentStatus){
  _bpsCid=cid;_bpsOwnerUid=ownerUid||(S&&S.userId);
  var body=document.getElementById('bps-body');
  if(body){
    var opts=[
      {val:STATUS_NORMAL,lbl:'✅ Agendado (normal)'},
      {val:STATUS_REMARCAR,lbl:'🔁 Remarcar'},
      {val:STATUS_NOSHOW,lbl:'🚫 No-Show'}
    ];
    body.innerHTML=opts.map(function(o){
      var on=(currentStatus||STATUS_NORMAL)===o.val;
      return '<button class="bps-opt'+(on?' on':'')+'" onclick="_bpsPick(\''+o.val+'\')">'+o.lbl+(on?' <span class="bps-cur">(atual)</span>':'')+'</button>';
    }).join('');
  }
  openM('mo-bps');
}
function _bpsPick(tipo){
  if(!_bpsCid)return;
  var cid=_bpsCid,ownerUid=_bpsOwnerUid;
  closeM('mo-bps');
  if(tipo===STATUS_NORMAL){
    // "Normal" desfaz qualquer status ativo — setCliStatus alterna, então
    // só chama se o status atual não for já normal (senão não faz nada).
    var list=getCliLocal(ownerUid);var c=list.find(function(x){return x.id===cid;});
    if(c&&c.status&&c.status!==STATUS_NORMAL)setCliStatus(cid,c.status,{ownerUid:ownerUid,skipNav:true});
  }else{
    setCliStatus(cid,tipo,{ownerUid:ownerUid,skipNav:true});
  }
  _bpsCid=null;_bpsOwnerUid=null;
}

// No-Show modal
function _resetNoShowModalState(){
  _nshCid=null;_nshOpt=null;_nshOpts=null;
  document.querySelectorAll('.nsh-radio').forEach(function(r){r.classList.remove('sel');});
  var cb=document.getElementById('nsh-confirm-btn');if(cb)cb.disabled=true;
}

function openNoShowModal(cid,opts){
  _resetNoShowModalState();
  _nshCid=cid;
  _nshOpts=opts||{};
  openM('mo-nsh');
}

function selNshOpt(n){_nshOpt=n;document.querySelectorAll('.nsh-radio').forEach(function(r){r.classList.remove('sel');});var el=document.getElementById('nsh-opt-'+n);if(el)el.classList.add('sel');var cb=document.getElementById('nsh-confirm-btn');if(cb)cb.disabled=false;}

function confirmNoShow(){
  if(!_nshCid||!_nshOpt)return;
  var opts=_nshOpts||{};
  var uid=opts.ownerUid||_tlOwnerUid||(S&&S.userId);
  var cid=_nshCid;
  var list=getCliLocal(uid);var c=list.find(function(x){return x.id===cid;});if(!c)return;
  var labels={1:'Sumiu',2:'Cancelou a reuniao'};
  if(!c.statusDates)c.statusDates={};if(!c.remarkHistory)c.remarkHistory=[];
  c.remarkHistory.push({n:(c.remarkHistory.length+1),steps:(c.steps||Array(7).fill(false)).slice(),stepDates:(c.stepDates||[]).slice(),motivo:STATUS_NOSHOW,virou:new Date().toISOString()});
  c.status=STATUS_NOSHOW;c.statusDates[STATUS_NOSHOW]=new Date().toISOString();c.nshMotivoLabel=labels[_nshOpt];c.steps=Array(7).fill(false);c.stepDates=Array(7).fill(null);
  c.updatedAt=new Date().toISOString(); /* 2026-08-05: mesma correção do toggleStep — ver comentário lá */
  saveCli(uid,list);closeM('mo-nsh');renderDash();if(!opts.skipNav&&_tlCid===cid)openTimeline(cid);toast('No-Show registrado');
}

// ============================================================
// TIMELINE
// ============================================================
/* [FIX 20260822] Pedido explícito: clicar no nome do cliente no Bingo não
   abre mais o menu próprio do Bingo (openTimeline/#mo-tl) — direciona pro
   Lead/Negócio vinculado, igual já acontece ao clicar numa notificação de
   Lead (mesma função openKBDet). openTimeline continua existindo intacto
   pra quem ainda precisa dele (Busca Global → admOpenTimeline).

   Todo registro do Bingo nasce vinculado a um Negócio (sourceCardId) —
   nunca direto a um Lead. Quando esse Negócio veio de converter um Lead,
   também guarda sourceOriginalLeadId (o Lead original). Preferência:
   1) sourceOriginalLeadId existe → abre o LEAD original (é o que o
      usuário chamou de "o lead desse cliente").
   2) senão, sourceCardId existe → abre o NEGÓCIO (não existe Lead de
      origem pra abrir — é o registro mais próximo disponível).
   3) nenhum dos dois (lançamento manual no Bingo, sem vínculo) → avisa
      com um toast em vez de não fazer nada. */
function openCliLinkedLead(cid){
  var uid=_tlOwnerUid||(S&&S.userId);
  var list=getCliLocal(uid);
  var c=list.find(function(x){return x.id===cid;});
  if(!c){toast('Cliente não encontrado');return;}
  var ownerUid=c.sourceOwnerUid||uid;
  var board=null,targetId=null;
  if(c.sourceOriginalLeadId){board='leads';targetId=c.sourceOriginalLeadId;}
  else if(c.sourceCardId){board='negocios';targetId=c.sourceCardId;}
  if(!board||!targetId){toast('Este cliente não tem Lead/Negócio vinculado.');return;}
  var arr=(typeof getKBFor==='function')?getKBFor(board,ownerUid):[];
  if(!arr.some(function(x){return x.id===targetId;})){
    toast((board==='leads'?'Esse lead':'Esse negócio')+' não está mais disponível');
    return;
  }
  openKBDet(targetId,board,ownerUid);
}

function openTimeline(cid){
  var uid=_tlOwnerUid||(S&&S.userId);
  var list=getCliLocal(uid);var c=list.find(function(x){return x.id===cid;});if(!c)return;
  _tlCid=cid;
  document.querySelectorAll('#mo-tl .mo-tab-pane').forEach(function(p){p.classList.remove('on');});
  document.querySelectorAll('#mo-tl .mo-tab').forEach(function(b){b.classList.remove('on');});
  var fp=document.getElementById('tl-pane-tl'),fb=document.querySelector('#mo-tl .mo-tab');if(fp)fp.classList.add('on');if(fb)fb.classList.add('on');
  document.getElementById('tl-nome').textContent=c.nome;
  var dt=c.data?_parseLocalDate(c.data).toLocaleString('pt-BR'):'';
  document.getElementById('tl-datacad').textContent=dt?'Cadastrado em '+dt:'';
  // Responsavel
  // FIX #11 (unificação 2026-07-20): esse seletor tinha a mesma limitação já corrigida
  // no Kanban (kanban.js/det-resp-sel) — só listava usuários ATIVOS e ignorava a
  // preferência "Ocultar ADM das listas". Reaplicando aqui a MESMA lógica, pra qualquer
  // lista de "novo responsável" do CRM se comportar de forma consistente: mostra todos os
  // usuários (inativos marcados), respeita o toggle de ocultar ADM, mas nunca esconde o
  // dono ATUAL do registro (senão o <select> perderia a opção selecionada e o cliente
  // seria reatribuído silenciosamente ao salvar).
  var rs=document.getElementById('tl-resp-sel');
  if(rs){
    var oUid=c.responsavelId||uid;
    var _hideAdmCli=false;
    try{
      var _prefsCli=(typeof getPrefs==='function')?(getPrefs()||{}):{};
      if(_prefsCli&&(_prefsCli.hideAdmInLists===true||_prefsCli.adm_hidden_in_lists===true))_hideAdmCli=true;
      if(!_hideAdmCli){var _lsCli=localStorage.getItem('lf_hide_adm_lists');if(_lsCli==='1'||_lsCli==='true')_hideAdmCli=true;}
    }catch(_e){}
    var users=getUsers().filter(function(u){return _hideAdmCli?(u.id!=='adm'||u.id===oUid):true;});
    rs.innerHTML=users.map(function(u){return '<option value="'+_htmlAttr(u.id)+'"'+(u.id===oUid?' selected':'')+'>'+escapeHtml(u.nome.split(' ')[0])+(u.ativo===false?' (Inativo)':'')+'</option>';}).join('');
    rs.disabled=!hasAdminAccess();
  }
  // Status buttons
  var st=c.status||STATUS_NORMAL,btns='',cIdJs=_jsSq(c.id);
  if(st!==STATUS_REMARCAR)btns+='<button class="bstat rem" onclick="setCliStatus(\''+cIdJs+'\',\'remarcar\')">Remarcar</button>';else btns+='<button class="bstat rev" onclick="setCliStatus(\''+cIdJs+'\',\'remarcar\')">Desfazer Remarcar</button>';
  if(st!==STATUS_NOSHOW)btns+='<button class="bstat nsh" onclick="setCliStatus(\''+cIdJs+'\',\'noshow\')">No-Show</button>';else btns+='<button class="bstat rev" onclick="setCliStatus(\''+cIdJs+'\',\'noshow\')">Desfazer No-Show</button>';
  document.getElementById('tl-status-btns').innerHTML=btns;
  // Timeline body
  var sd=c.stepDates||[],html='<div class="tl2">';
  for(var i=0;i<ETP.length;i++){var done=c.steps&&c.steps[i];var dc=done?(i===6?'cls':'done'):'pend';var last=i===ETP.length-1;html+='<div class="tl2-item"><div class="tl2-left"><div class="tl2-dot '+dc+'"></div>'+(last?'':'<div class="tl2-line"></div>')+'</div><div class="tl2-content"><div class="tl2-label'+(done?'':' pend')+'">'+(done?'<span style="color:var(--ok)">✓</span> ':'')+ETP[i]+'</div>'+(done&&sd[i]?'<div class="tl2-date">'+new Date(sd[i]).toLocaleString('pt-BR')+'</div>':'<div class="tl2-date" style="color:var(--m2)">Pendente</div>')+'</div></div>';}
  if(c.status&&c.status!==STATUS_NORMAL&&c.statusDates&&c.statusDates[c.status]){var sL={atendido:'Atendimento',remarcar:'Remarcado',noshow:'No-Show'};html+='<div class="tl2-item"><div class="tl2-left"><div class="tl2-dot act"></div></div><div class="tl2-content"><div class="tl2-label">'+sL[c.status]+'</div><div class="tl2-date">'+new Date(c.statusDates[c.status]).toLocaleString('pt-BR')+'</div></div></div>';}
  if(c.respHistory&&c.respHistory.length){c.respHistory.forEach(function(rh){html+='<div class="tl2-item"><div class="tl2-left"><div class="tl2-dot sys"></div></div><div class="tl2-content"><div class="tl2-label" style="color:var(--bl)">Responsavel alterado</div><div class="tl2-note">De: '+escapeHtml(rh.from)+' - Para: '+escapeHtml(rh.to)+'</div><div class="tl2-date">'+new Date(rh.ts).toLocaleString('pt-BR')+'</div></div></div>';});}
  html+='</div>';document.getElementById('tl-body').innerHTML=html;
  renderTlActivities(c);
  document.getElementById('tl-obs').value=c.obs||'';document.getElementById('obs-saved-msg').textContent='';
  var oh=c.obsHistory||[],ohH='';
  if(oh.length>1){ohH='<div style="font-size:.65rem;color:var(--mu);margin-top:10px">Versoes anteriores:</div>';oh.slice().reverse().slice(1,4).forEach(function(o){ohH+='<div class="obs-note">'+escapeHtml(o.txt)+'<div class="obs-note-ts">'+new Date(o.ts).toLocaleString('pt-BR')+'</div></div>';});}
  document.getElementById('tl-obs-hist').innerHTML=ohH;
  var rh=c.remarkHistory||[],rmH='';
  if(!rh.length){rmH='<p style="color:var(--mu);font-size:.8rem">Nenhuma remarcacao.</p>';}
  else{var mL={remarcar:'Remarcado',noshow:'No-Show',normal:'Reativado',atendido:'Atendido'};rh.slice().reverse().forEach(function(r){var dH=ETP.map(function(_,i){var dn=r.steps&&r.steps[i];var cl=dn?(i===6?'cls':'done'):'pend';return '<span class="sd '+cl+'" style="font-size:.62rem">'+SLB[i]+'</span>';}).join('');rmH+='<div class="rem-item"><div class="rem-item-n">Ciclo '+r.n+' → '+(mL[r.motivo]||r.motivo)+'</div><div class="rem-item-steps">'+dH+'</div><div class="rem-item-date">'+new Date(r.virou).toLocaleString('pt-BR')+'</div></div>';});}
  document.getElementById('tl-rem-body').innerHTML=rmH;
  var af=document.getElementById('tl-act-form');if(af)af.classList.remove('open');
  openM('mo-tl');
}

function setCliStatus(cid,tipo,opts){
  opts=opts||{};
  var uid=opts.ownerUid||_tlOwnerUid||(S&&S.userId);if(!uid)return;var list=getCliLocal(uid);var c=list.find(function(x){return x.id===cid;});if(!c)return;
  if(tipo===STATUS_NOSHOW&&c.status!==STATUS_NOSHOW){openNoShowModal(cid,opts);return;}
  if(!c.statusDates)c.statusDates={};
  if(c.status===tipo){c.status=STATUS_NORMAL;delete c.statusDates[tipo];}
  else{if(c.status&&c.status!==STATUS_NORMAL){if(!c.remarkHistory)c.remarkHistory=[];c.remarkHistory.push({n:(c.remarkHistory.length+1),steps:(c.steps||Array(7).fill(false)).slice(),stepDates:(c.stepDates||[]).slice(),motivo:tipo,virou:new Date().toISOString()});c.steps=Array(7).fill(false);c.stepDates=Array(7).fill(null);}c.status=tipo;c.statusDates[tipo]=new Date().toISOString();}
  c.updatedAt=new Date().toISOString(); /* 2026-08-05: mesma correção do toggleStep — ver comentário lá */
  saveCli(uid,list);renderDash();
  // [FIX 20260828] Pedido explícito: permite trocar o status direto na
  // lista do Bingo, sem navegar pro Timeline/detalhes do lead. Chamadores
  // antigos (de dentro do próprio Timeline) continuam reabrindo-o pra
  // ver o resultado — só pula essa navegação quando skipNav=true.
  if(!opts.skipNav){closeM('mo-tl');openTimeline(cid);}
}

function autoSaveObs(){
  var uid=_tlOwnerUid||(S&&S.userId);var list=getCliLocal(uid);var c=list.find(function(x){return x.id===_tlCid;});if(!c)return;
  var txt=document.getElementById('tl-obs').value||'';if(!c.obsHistory)c.obsHistory=[];if(!c.obsHistory.length||c.obsHistory[c.obsHistory.length-1].txt!==txt)c.obsHistory.push({txt:txt,ts:new Date().toISOString()});c.obs=txt;c.updatedAt=new Date().toISOString();saveCli(uid,list);
  var m=document.getElementById('obs-saved-msg');if(m){m.textContent='Salvo';setTimeout(function(){m.textContent='';},1500);}
}

function changeResponsible(newUid){
  var uid=_tlOwnerUid||(S&&S.userId);var list=getCliLocal(uid);var c=list.find(function(x){return x.id===_tlCid;});if(!c)return;var currentResp=c.responsavelId||uid;if(newUid===currentResp)return;
  var fromUser=getUser(uid),toUser=getUser(newUid);if(!toUser)return;
  if(!c.respHistory)c.respHistory=[];c.respHistory.push({from:fromUser?(fromUser.nome||'?'):'?',fromId:uid,to:(toUser&&toUser.nome)||newUid,toId:newUid,ts:new Date().toISOString(),by:(S&&S.nome)||'?'});c.responsavelId=newUid;
  // Grava no destino ANTES de remover da origem (mesma correção do _kbTransferCard): evita
  // perder o cliente por completo se o armazenamento estiver cheio ao salvar no novo responsável.
  // Também substitui um registro existente com o mesmo id em vez de duplicar o cliente na lista de destino.
  var newList=getCliLocal(newUid);
  var existingIdx=newList.findIndex(function(x){return x.id===c.id;});
  if(existingIdx>=0)newList[existingIdx]=c;else newList.push(c);
  var okTo=saveCli(newUid,newList);
  var okFrom=okTo&&saveCli(uid,list.filter(function(x){return x.id!==_tlCid;}));
  if(!okTo)toast('⚠️ Não foi possível transferir — armazenamento local cheio.',4500);
  else if(!okFrom)toast('⚠️ Cliente duplicado temporariamente (falha ao remover da lista de origem) — armazenamento local cheio.',4500);
  else toast('Transferido para '+(toUser&&toUser.nome?toUser.nome.split(' ')[0]:'usuário'));
  closeM('mo-tl');renderDash();
}

function admOpenTimeline(uid,cid){_tlOwnerUid=uid;var list=getCliLocal(uid);var c=list.find(function(x){return x.id===cid;});if(!c){toast('Nao encontrado');_tlOwnerUid=null;return;}openTimeline(cid);}
