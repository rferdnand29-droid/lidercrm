(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var relatorios = modules.relatorios = modules.relatorios || {};

  var FEED_KEY='lf13_feed';

function getFeed(){return (typeof global.sg==='function')?global.sg(FEED_KEY)||[]:[];}

function saveFeed(list){var trimmed=list.slice(0,200);if(typeof global.ss==='function')global.ss(FEED_KEY,trimmed);if(global.DB_MODE==='firebase'&&global.db){global.db.collection('config').doc('feed').set({list:trimmed,ts:Date.now()}).catch(function(e){console.warn("[feed] saveFeed firebase falhou",e);});}}

// Normaliza os diferentes valores de "canal" usados no Banco de Objeções
// (zap_ou_ligacao/preferir_ligacao/somente_ligacao) e nas Objeções da Equipe
// (whatsapp/ligacao/ambos) para um único padrão de 3 opções usado no filtro
// do feed de atividades da equipe: 'chamada' | 'whatsapp' | 'ambos'.
function _canalToFeedTag(canal){
  if(canal==='whatsapp')return 'whatsapp';
  if(canal==='ligacao'||canal==='preferir_ligacao'||canal==='somente_ligacao')return 'chamada';
  if(canal==='ambos'||canal==='zap_ou_ligacao')return 'ambos';
  return null;
}

var CANAL_FEED_LBL={chamada:'☎️ Ligação',whatsapp:'📱 WhatsApp',ambos:'🔁 Ambos'}

function logFeedEvent(type,byId,itemName,detail,board,canal){
  var u=(typeof global.getUser==='function')?global.getUser(byId):null;
  var entry={id:'f'+Date.now(),type:type,byId:byId,byName:u?u.nome:'?',byCor:u?u.cor:0,itemName:itemName,detail:detail,board:board,canal:canal||null,ts:new Date().toISOString()};
  // Cache local: mantém mais recente primeiro (usado por getFeed() em leituras instantâneas,
  // ex. resumo do Dashboard) — grava direto, sem depender da nuvem.
  var localFeed=getFeed();localFeed.unshift(entry);ss(FEED_KEY,localFeed.slice(0,200));
  // Fase 3.4: em vez de GET+merge+SET do array inteiro (que perdia eventos quando dois
  // consultores gravavam quase ao mesmo tempo), cada evento agora é o seu próprio
  // documento no Worker (feed/<id>, sempre um INSERT — nunca sobrescreve o de outro
  // consultor). Ver feed-controller.js. Mesmo fallback reversível dos módulos anteriores:
  // se o Worker não estiver disponível, volta pro arrayUnion do Firestore (que já
  // resolvia a mesma concorrência do lado do adaptador legado).
  var root=window.LiderCRM;
  var wc=root&&root.api&&root.api.workerClient;
  if(root&&root.config&&root.config.useWorkerApi&&wc&&typeof wc.logFeedEventRemote==='function'){
    wc.logFeedEventRemote(entry).catch(function(e){console.warn("[feed] logFeedEvent worker falhou",e);});
  }else if(DB_MODE==='firebase'&&db){
    db.collection('config').doc('feed').set({list:firebase.firestore.FieldValue.arrayUnion(entry),ts:Date.now()},{merge:true}).catch(function(e){console.warn("[feed] logFeedEvent firebase falhou",e);});
  }
}

// Helpers puros extraídos de js/relatorios.js na rodada 2026-07-17 (parte 3).
function _kbDeleteReasonLabel(reason){
  var labels={numero_errado:'Número errado',lead_duplicado:'Lead duplicado',em_tratativa:'Em tratativa',ja_comprou:'Já comprou',sem_interesse:'Sem interesse',sem_contato:'Sem contato'};
  return labels[reason]||reason||'Motivo não informado';
}

function _admAtivClassify(a){
  if(a.done||!a.scheduledAt)return null;
  var diff=window._scheduledAtTs(a.scheduledAt)-Date.now();
  if(!isFinite(diff))return null;
  if(diff<0)return 'atrasada';
  if(diff<=24*3600*1000)return 'vence24';
  if(diff<=48*3600*1000)return 'vence48';
  return 'futura';
}


  // R14-03: expor funções ao escopo global — getFeed, saveFeed, logFeedEvent são
  // chamadas diretamente por js/relatorios.js, js/dashboard.js, js/kanban.js,
  // js/agenda.js, js/clientes.js, js/notificacoes.js como funções globais.
  global.getFeed = getFeed;
  global.saveFeed = saveFeed;
  global.logFeedEvent = logFeedEvent;
  global._canalToFeedTag = _canalToFeedTag;
  global.CANAL_FEED_LBL = CANAL_FEED_LBL;
  global._kbDeleteReasonLabel = _kbDeleteReasonLabel;
  global._admAtivClassify = _admAtivClassify;
  global.FEED_KEY = FEED_KEY;

  relatorios.runtime = {
    FEED_KEY: FEED_KEY,
    getFeed: getFeed,
    saveFeed: saveFeed,
    _canalToFeedTag: _canalToFeedTag,
    CANAL_FEED_LBL: CANAL_FEED_LBL,
    logFeedEvent: logFeedEvent,
    _kbDeleteReasonLabel: _kbDeleteReasonLabel,
    _admAtivClassify: _admAtivClassify
  };
})(window);
