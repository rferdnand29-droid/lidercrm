/* =====================================================================
 * dashboard.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

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
    var tot=list.length,fec=list.filter(function(c){return c.steps&&c.steps[6];}).length;
    var ag=list.filter(function(c){return c.steps&&c.steps[0];}).length;
    /* Reconcilia com o kanban 'kb negocios' (mesma fonte usada no mobile), igual ao criterio
       ja usado em renderAdmMetrics, para que 'Meus' (desktop) e 'Meu Painel' (mobile) nunca
       mostrem Fechamentos/Taxa divergentes para o mesmo consultor. Ver [SUSPEITO] original. */
    var fecKB=getKB('negocios').filter(function(c){return c.col==='fechado';}).length;
    fec=Math.max(fec,fecKB);
    var tx=ag>0?Math.round(fec/ag*100):0;
    var u=getUser(S.userId);
    var e;
    e=document.getElementById('mycnm');if(e)e.textContent=u?u.nome:S.nome;
    e=document.getElementById('mytot');if(e)e.textContent=tot;
    e=document.getElementById('myfec');if(e)e.textContent=fec;
    e=document.getElementById('mytx');if(e)e.textContent=tx+'%';
    renderTable(list);
    var counts={normal:0,atendido:0,remarcar:0,noshow:0};
    list.forEach(function(c){var s=c.status||STATUS_NORMAL;if(counts[s]!==undefined)counts[s]++;else counts.normal++;});
    Object.keys(counts).forEach(function(k){var ce=document.getElementById('cnt-'+k);if(ce)ce.textContent=counts[k];});
  });
}

function setDashTab(tab,btn){_dashTab=tab;document.querySelectorAll('.dtab').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');loadCli(S.userId,function(l){renderTable(l);});}

function onSearch(q){_searchQ=q.toLowerCase();var cl=document.getElementById('srch-cl');if(cl)cl.style.display=q?'':'none';loadCli(S.userId,function(l){renderTable(l);});}

function clearSearch(){clearTimeout(_dbTimers['srch']);_searchQ='';var si=document.getElementById('srch-inp');if(si)si.value='';var cl=document.getElementById('srch-cl');if(cl)cl.style.display='none';loadCli(S.userId,function(l){renderTable(l);});}

function applyDashFilters(){
  _fltNicho=(document.getElementById('flt-nicho')||{}).value||'';
  _fltDate=(document.getElementById('flt-date')||{}).value||'';
  _updateFltClearBtn();
  try{saveSavedFiltersRemote();}catch(e){}
  loadCli(S.userId,function(l){renderTable(l);});
}

function toggleLateFilter(btn){
  _fltLate=!_fltLate;
  if(btn){btn.classList.toggle('on',_fltLate);btn.setAttribute('aria-pressed',_fltLate?'true':'false');}
  _updateFltClearBtn();
  try{saveSavedFiltersRemote();}catch(e){}
  loadCli(S.userId,function(l){renderTable(l);});
}

function clearDashFilters(){
  _fltNicho='';_fltDate='';_fltLate=false;
  var fn=document.getElementById('flt-nicho');if(fn)fn.value='';
  var fd=document.getElementById('flt-date');if(fd)fd.value='';
  var fl=document.getElementById('flt-late');if(fl){fl.classList.remove('on');fl.setAttribute('aria-pressed','false');}
  _updateFltClearBtn();
  try{saveSavedFiltersRemote();}catch(e){}
  loadCli(S.userId,function(l){renderTable(l);});
}

function _updateFltClearBtn(){var active=_fltNicho||_fltDate||_fltLate;var b=document.getElementById('flt-clear');if(b)b.style.display=active?'inline-block':'none';}

function _isOverdue(c){
  // "Atrasada": tem atividade agendada no passado que ainda nao foi concluida
  if(!c.activities&&!c.obs)return false;
  var now=Date.now();
  if(c.activities)return c.activities.some(function(a){return !a.done&&a.scheduledAt&&_isScheduledExpired(a.scheduledAt,now);});
  return false;
}

// ANALYTICS
// ============================================================
var _per='mes';

var ECR=['#C39A2D','#E07B00','#7B4FA6','#0F7ABF','#3A9FE0','#1B8A5E','#0B6045'];

var PCR=['#C39A2D','#0F7ABF','#1B8A5E','#7B4FA6'];

function setPer(p,btn){_per=p;document.querySelectorAll('.pb').forEach(function(b){b.classList.remove('on');});if(btn)btn.classList.add('on');var dr=document.getElementById('dr');if(dr)dr.style.display=p==='custom'?'flex':'none';loadCli(S.userId,function(l){drawAnal(l,'krow','funil','psvg','pleg','metas');drawNegKPIs(S.userId);});}

function renderAnal(){loadCli(S.userId,function(l){drawAnal(l,'krow','funil','psvg','pleg','metas');drawNegKPIs(S.userId);});}

function drawAnal(list,kid,fid,svid,lgid,mgid){
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
  var steps=ETP.map(function(_,i){return filtered.filter(function(c){return c.steps&&c.steps[i];}).length;});
  var ag=steps[0]||0,c30=steps[1]||0,c24=steps[2]||0,c2h=steps[3]||0,com=steps[4]||0,fic=steps[5]||0,fec=steps[6]||0;
  var tx=ag>0?Math.round(fec/ag*100):0;
  var kEl=document.getElementById(kid);
  if(kEl)kEl.innerHTML=['<div class="kc k1"><div class="kv">'+tot+'</div><div class="kl">Total</div></div>','<div class="kc k2"><div class="kv">'+ag+'</div><div class="kl">Agendamentos</div></div>','<div class="kc k3"><div class="kv">'+fec+'</div><div class="kl">Fechamentos</div></div>','<div class="kc k4"><div class="kv">'+tx+'%</div><div class="kl">Taxa</div></div>'].join('');
  var fEl=document.getElementById(fid);
  if(fEl){var max=Math.max(ag,1);fEl.innerHTML=ETP.map(function(l,i){var v=steps[i]||0;var w=Math.round(v/max*100);return '<div class="fi"><div class="fil">'+l+'</div><div class="fibw"><div class="fib" style="width:'+w+'%;background:'+ECR[i]+'"><span>'+v+'</span></div></div><div class="fip">'+w+'%</div></div>';}).join('');}
  var sEl=document.getElementById(svid),lEl=document.getElementById(lgid);
  if(sEl&&lEl){var cats=[{l:'Agendado',v:ag,c:PCR[0]},{l:'Compareceu',v:com,c:PCR[1]},{l:'Fechou',v:fec,c:PCR[2]},{l:'Outros',v:Math.max(0,tot-ag-com-fec),c:PCR[3]}];var totP=cats.reduce(function(s,c){return s+c.v;},0)||1;var svg='',leg='',angle=0;cats.forEach(function(cat){var slice=cat.v/totP*360;var start=angle;angle+=slice;var r=45,cx=52,cy=52;if(slice>0){var sa=Math.PI*(start-90)/180,ea=Math.PI*(start+slice-90)/180;var x1=cx+r*Math.cos(sa),y1=cy+r*Math.sin(sa),x2=cx+r*Math.cos(ea),y2=cy+r*Math.sin(ea);var lf=slice>180?1:0;svg+='<path d="M'+cx+','+cy+' L'+x1.toFixed(1)+','+y1.toFixed(1)+' A'+r+','+r+' 0 '+lf+',1 '+x2.toFixed(1)+','+y2.toFixed(1)+' Z" fill="'+cat.c+'"/>';}leg+='<div class="pli"><div class="psc" style="background:'+cat.c+'"></div><span>'+cat.l+'</span><span class="plv">'+cat.v+'</span></div>';});sEl.innerHTML=svg;lEl.innerHTML=leg;}
  var mEl=document.getElementById(mgid);
  if(mgid&&mEl){var metas=METAS;mEl.innerHTML=[{l:'Agend.',v:ag,t:metas.ag},{l:'Compareceu',v:com,t:metas.comp},{l:'Conf 24h',v:c24,t:metas.c24},{l:'Conf 2h',v:c2h,t:metas.c2h},{l:'Fichas',v:fic,t:metas.fic},{l:'Fecham.',v:fec,t:metas.fec}].map(function(m){var pct=Math.min(100,Math.round(m.v/m.t*100));var ok=pct>=100;return '<div class="mc"><div class="mc-n">'+m.l+'</div><div class="mc-p" style="color:'+(ok?'var(--ok)':'var(--al)')+'">'+m.v+'<span style="font-size:.7rem;color:var(--mu)">/'+m.t+'</span></div><div class="mc-t">'+pct+'%</div><div class="mc-r">'+(ok?'✅':'')+'</div></div>';}).join('');}
}

function renderAnalWithList(list,kid,fid,svid,lgid,mgid){drawAnal(list,kid,fid,svid,lgid,mgid);}

function drawNegKPIs(uid,elId){
  var el=document.getElementById(elId||'krow2');if(!el)return;
  if(!uid){console.warn('[dash] drawNegKPIs: uid inválido');return;}
  var arr=(typeof getKBFor==='function'?getKBFor('negocios',uid):[]);
  var fechado=arr.filter(function(c){return c.col==='fechado';}).length;
  var noshow=arr.filter(function(c){return c.col==='noshow'||c.col==='desist';}).length;
  var emAndamento=arr.filter(function(c){return c.col!=='fechado'&&c.col!=='noshow'&&c.col!=='desist';}).length;
  var valorTotal=arr.filter(function(c){return c.col==='fechado';}).reduce(function(s,c){return s+(parseFloat(c.valor)||0);},0);
  el.innerHTML=['<div class="kc k2"><div class="kv">'+emAndamento+'</div><div class="kl">Negocios Ativos</div></div>','<div class="kc k3"><div class="kv">'+fechado+'</div><div class="kl">Negocios Fechados</div></div>','<div class="kc k1"><div class="kv" style="font-size:1.1rem">'+fmtBRL(valorTotal)+'</div><div class="kl">Valor Fechado</div></div>','<div class="kc k4"><div class="kv">'+noshow+'</div><div class="kl">No-Show/Desistencia</div></div>'].join('');
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
    return '<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:9px;cursor:pointer;margin-bottom:3px;transition:background .15s" onmouseover="this.style.background=\'rgba(195,154,45,.09)\'" onmouseout="this.style.background=\'\'" onclick="gSearchOpen(\''+h.type+'\',\''+h.id+'\',\''+h.uid+'\',\''+h.board+'\')"><span style="font-size:1.1rem">'+h.icon+'</span><div style="flex:1;min-width:0"><div style="font-size:.82rem;color:var(--tx);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+eH(h.nome)+'</div><div style="font-size:.67rem;color:var(--mu)"><span style="color:var(--al)">'+h.label+'</span> · '+eH(h.sub)+'</div></div></div>';
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
    var pend=acts.filter(function(a){return !a.done;}).length;
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
