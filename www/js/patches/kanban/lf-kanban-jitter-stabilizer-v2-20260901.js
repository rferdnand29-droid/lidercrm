/* =====================================================================
 * lf-kanban-jitter-stabilizer-v2-20260901.js
 * ---------------------------------------------------------------------
 * Serializa sincronizações remotas e agrupa redraws do Kanban que chegam
 * no mesmo frame (polling, SSE e BroadcastChannel). Não altera os dados:
 * apenas evita que duas fontes reconstruam o mesmo DOM ao mesmo tempo.
 *
 * Reversão: remover este script e o link CSS correspondente.
 * ===================================================================== */
(function(global){
  'use strict';
  if(global.__LF_KB_JITTER_STABILIZER_V2__)return;
  global.__LF_KB_JITTER_STABILIZER_V2__=true;

  var _renderOriginal=global.renderKBLocal;
  var _renderState={};
  var _renderWindowMs=72;

  function _isDesktopBoard(board){
    return global.innerWidth>768 &&
      (board==='leads'||board==='negocios') &&
      !!global.document.getElementById(board==='leads'?'leads-kanban':'negocios-kanban');
  }

  /*
   * A primeira pintura continua imediata (ações do usuário não esperam rede).
   * Pinturas seguintes do mesmo board dentro de uma janela curta ficam em
   * uma única pintura de trailing, em vez de derrubar/recriar os cards várias
   * vezes no mesmo ciclo do navegador.
   */
  if(typeof _renderOriginal==='function'){
    global.renderKBLocal=function(board){
      if(!_isDesktopBoard(board))return _renderOriginal.apply(this,arguments);
      var st=_renderState[board]||(_renderState[board]={busy:false,queued:false,timer:null});
      if(st.busy){
        st.queued=true;
        return;
      }
      st.busy=true;
      try{
        _renderOriginal.apply(this,arguments);
      }finally{
        if(st.timer)clearTimeout(st.timer);
        st.timer=setTimeout(function(){
          st.timer=null;
          st.busy=false;
          if(st.queued){
            st.queued=false;
            global.renderKBLocal(board);
          }
        },_renderWindowMs);
      }
    };
  }

  /*
   * O mesmo board pode receber um evento SSE e o tick do polling quase
   * simultaneamente. O leading call mantém a atualização rápida; chamadas
   * próximas são reencaminhadas uma vez, sem iniciar uma tempestade de
   * requests paralelos.
   */
  var _syncOriginal=global._syncKBRemoteBG;
  var _syncState={};
  var _syncWindowMs=180;
  if(typeof _syncOriginal==='function'){
    global._syncKBRemoteBG=function(board){
      if(!_isDesktopBoard(board))return _syncOriginal.apply(this,arguments);
      var st=_syncState[board]||(_syncState[board]={busy:false,queued:false,timer:null});
      if(st.busy){
        st.queued=true;
        return;
      }
      st.busy=true;
      try{
        _syncOriginal.apply(this,arguments);
      }finally{
        if(st.timer)clearTimeout(st.timer);
        st.timer=setTimeout(function(){
          st.timer=null;
          st.busy=false;
          if(st.queued){
            st.queued=false;
            global._syncKBRemoteBG(board);
          }
        },_syncWindowMs);
      }
    };
  }

  /*
   * A restauração antiga escrevia scrollTop em 3 rAFs + setTimeout(400ms).
   * Com scroll-behavior global suave isso virava quatro animações visíveis.
   * Uma restauração depois do layout do frame é suficiente; a captura já
   * contém âncora por card para sobreviver a inserção/remoção.
   */
  var _restoreOriginal=global._kbRestoreScrollSnapshot;
  var _restoreState={pending:null,raf:0};
  if(typeof _restoreOriginal==='function'){
    global._kbScheduleScrollRestore=function(snap){
      _restoreState.pending=snap;
      if(_restoreState.raf)return;
      _restoreState.raf=global.requestAnimationFrame(function(){
        _restoreState.raf=0;
        var next=_restoreState.pending;
        _restoreState.pending=null;
        if(next)_restoreOriginal.call(global,next);
      });
    };
  }
})(window);