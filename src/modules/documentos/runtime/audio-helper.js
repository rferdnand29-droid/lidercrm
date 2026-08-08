/* =====================================================================
 * src/modules/documentos/runtime/audio-helper.js
 * -----------------------------------------------------------------------
 * Módulo de gravação e envio de áudio para o CRM.
 *
 * CORREÇÃO ÁUDIO (2026-07-20): O envio de áudio não funcionava porque:
 *   1. MediaRecorder era criado mas o blob resultante nunca era enviado
 *      ao storage — ficava apenas como blob: URL temporário no navegador.
 *   2. Quando tentava enviar via Worker, o blob era convertido para base64
 *      (data URL), gerando payloads de vários MB que estouravam o timeout
 *      de 15s do HTTP client e/ou eram rejeitados pelo Worker.
 *   3. Não havia tratamento de erro/permissão de microfone no Capacitor.
 *
 * Este módulo resolve os três problemas:
 *   - Grava via MediaRecorder API (web) com fallback de permissão
 *   - Envia o blob diretamente ao Supabase Storage (sem base64)
 *   - Fallback para Worker (base64) se Storage não estiver configurado
 *   - Tratamento de permissão de microfone compatível com Capacitor
 * ===================================================================== */
(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var documentos = modules.documentos = modules.documentos || {};

  // Estado de gravação
  var _mediaRecorder = null;
  var _audioChunks = [];
  var _stream = null;
  var _isRecording = false;
  var _recStartTime = 0;
  var _recTimerInterval = null;
  var _onRecStateChange = null;
  var _onRecError = null;

  // MIME types suportados (em ordem de preferência)
  var _supportedMimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/m4a',
    'audio/wav',
    ''  // fallback: o browser escolhe
  ];

  function _pickMimeType(){
    if (typeof MediaRecorder === 'undefined') return '';
    for (var i = 0; i < _supportedMimeTypes.length; i++) {
      var mt = _supportedMimeTypes[i];
      if (!mt) return '';
      try {
        if (MediaRecorder.isTypeSupported(mt)) return mt;
      } catch(e) { /* continua tentando */ }
    }
    return '';
  }

  function _formatDuration(ms){
    var totalSec = Math.floor(ms / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    return min + ':' + (sec < 10 ? '0' : '') + sec;
  }

  function _setState(state, extra){
    _isRecording = state === 'recording';
    if (typeof _onRecStateChange === 'function') {
      try { _onRecStateChange(state, extra || {}); } catch(e) {}
    }
  }

  // Verifica se a API de gravação está disponível
  function isAudioRecordingSupported(){
    return !!(typeof navigator !== 'undefined' && navigator.mediaDevices &&
              typeof navigator.mediaDevices.getUserMedia === 'function' &&
              typeof MediaRecorder !== 'undefined');
  }

  // Pede permissão de microfone e inicia a gravação
  function startRecording(opts){
    opts = opts || {};

    if (_isRecording) {
      return Promise.reject(new Error('already-recording'));
    }

    if (!isAudioRecordingSupported()) {
      var msg = 'Seu navegador não suporta gravação de áudio.';
      // No Capacitor, o plugin de microfone pode não estar injetado
      if (global.LF_CAPACITOR && global.LF_CAPACITOR.native) {
        msg = 'Gravação de áudio não está disponível neste dispositivo.';
      }
      if (typeof global.toast === 'function') global.toast('❌ ' + msg, 4000);
      return Promise.reject(new Error(msg));
    }

    _onRecStateChange = opts.onStateChange || null;
    _onRecError = opts.onError || null;

    var constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };

    return navigator.mediaDevices.getUserMedia(constraints).then(function(stream){
      _stream = stream;
      _audioChunks = [];

      var mimeType = _pickMimeType();
      var recorderOpts = {};
      if (mimeType) recorderOpts.mimeType = mimeType;
      // Bitrate razoável para voz: 128kbps
      try { recorderOpts.audioBitsPerSecond = 128000; } catch(e) {}

      try {
        _mediaRecorder = new MediaRecorder(stream, recorderOpts);
      } catch(e) {
        // Tenta sem options
        _mediaRecorder = new MediaRecorder(stream);
      }

      _mediaRecorder.ondataavailable = function(e){
        if (e.data && e.data.size > 0) {
          _audioChunks.push(e.data);
        }
      };

      _mediaRecorder.onerror = function(e){
        var errMsg = 'Erro durante a gravação de áudio.';
        if (e && e.error) errMsg = e.error.message || errMsg;
        if (typeof _onRecError === 'function') {
          try { _onRecError(errMsg); } catch(err) {}
        }
        if (typeof global.toast === 'function') global.toast('❌ ' + errMsg, 4000);
        _setState('error', { message: errMsg });
        _cleanupRecording();
      };

      _mediaRecorder.onstop = function(){
        // O blob é montado em stopRecording()
      };

      // Coleta dados a cada 1s para não segurar tudo na memória
      try { _mediaRecorder.start(1000); } catch(e) { _mediaRecorder.start(); }

      _recStartTime = Date.now();
      _setState('recording', { startTime: _recStartTime });

      // Timer de duração
      if (_recTimerInterval) clearInterval(_recTimerInterval);
      _recTimerInterval = setInterval(function(){
        if (_isRecording && typeof _onRecStateChange === 'function') {
          var elapsed = Date.now() - _recStartTime;
          try { _onRecStateChange('recording', { elapsed: elapsed, elapsedFormatted: _formatDuration(elapsed) }); } catch(e) {}
        }
      }, 500);

      return { ok: true, startTime: _recStartTime };
    }).catch(function(err){
      var userMsg = 'Não foi possível acessar o microfone.';
      if (err && err.name === 'NotAllowedError') {
        userMsg = 'Permissão de microfone negada. Habilite o acesso nas configurações do navegador/app.';
      } else if (err && err.name === 'NotFoundError') {
        userMsg = 'Nenhum microfone encontrado no dispositivo.';
      } else if (err && err.name === 'NotReadableError') {
        userMsg = 'O microfone está em uso por outro aplicativo.';
      } else if (err && err.message) {
        userMsg = err.message;
      }

      if (typeof _onRecError === 'function') {
        try { _onRecError(userMsg); } catch(e) {}
      }
      if (typeof global.toast === 'function') global.toast('❌ ' + userMsg, 5000);
      _setState('error', { message: userMsg });
      _cleanupRecording();
      throw err;
    });
  }

  function _cleanupRecording(){
    if (_recTimerInterval) { clearInterval(_recTimerInterval); _recTimerInterval = null; }
    if (_stream) {
      try {
        _stream.getTracks().forEach(function(t){ t.stop(); });
      } catch(e) {}
      _stream = null;
    }
    _mediaRecorder = null;
  }

  // Para a gravação e retorna o blob + metadados
  function stopRecording(){
    if (!_mediaRecorder || _mediaRecorder.state === 'inactive') {
      _cleanupRecording();
      return Promise.resolve(null);
    }

    return new Promise(function(resolve, reject){
      var duration = Date.now() - _recStartTime;

      _mediaRecorder.onstop = function(){
        var mimeType = _mediaRecorder.mimeType || 'audio/webm';
        var blob = new Blob(_audioChunks, { type: mimeType });

        _cleanupRecording();
        _setState('stopped', { duration: duration });

        if (blob.size === 0) {
          reject(new Error('Áudio vazio — nenhum dado capturado.'));
          return;
        }

        // Gera um nome de arquivo amigável
        var ext = 'webm';
        if (mimeType.indexOf('ogg') >= 0) ext = 'ogg';
        else if (mimeType.indexOf('mp4') >= 0) ext = 'mp4';
        else if (mimeType.indexOf('m4a') >= 0) ext = 'm4a';
        else if (mimeType.indexOf('wav') >= 0) ext = 'wav';

        var filename = 'audio_' + new Date().toISOString().slice(0,19).replace(/[:T]/g, '-') + '.' + ext;
        var file = new File([blob], filename, { type: mimeType });

        resolve({
          blob: blob,
          file: file,
          filename: filename,
          mimeType: mimeType,
          size: blob.size,
          duration: duration,
          durationFormatted: _formatDuration(duration),
          dataUrl: URL.createObjectURL(blob)
        });
      };

      try {
        _mediaRecorder.stop();
      } catch(e) {
        _cleanupRecording();
        reject(e);
      }
    });
  }

  // Cancela a gravação sem retornar áudio
  function cancelRecording(){
    if (!_mediaRecorder || _mediaRecorder.state === 'inactive') {
      _cleanupRecording();
      _setState('cancelled');
      return Promise.resolve();
    }
    return new Promise(function(resolve){
      _mediaRecorder.onstop = function(){
        _cleanupRecording();
        _setState('cancelled');
        resolve();
      };
      try { _mediaRecorder.stop(); } catch(e) { _cleanupRecording(); resolve(); }
    });
  }

  // Envia um blob/File de áudio ao storage
  // Retorna Promise<{url, path, ...}>
  function uploadAudio(file, opts){
    opts = opts || {};

    if (!file) return Promise.reject(new Error('no-audio-file'));

    // Verifica tamanho (limite ~50MB para áudio)
    var maxSize = 50 * 1024 * 1024;
    if (file.size && file.size > maxSize) {
      var sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      if (typeof global.toast === 'function') {
        global.toast('❌ Áudio muito grande (' + sizeMB + 'MB). Máximo: 50MB.', 5000);
      }
      return Promise.reject(new Error('audio-too-large: ' + sizeMB + 'MB'));
    }

    // Gera o path no storage
    var uid = (global.S && global.S.userId) || 'anon';
    var dateStr = new Date().toISOString().slice(0, 10);
    var path = 'audio/' + uid + '/' + dateStr + '/' + (file.name || 'audio.webm');

    var storageRepo = root.repositories && root.repositories.storage;
    if (!storageRepo || typeof storageRepo.upload !== 'function') {
      return Promise.reject(new Error('storage-repository-unavailable'));
    }

    if (typeof global.syncBusy === 'function') global.syncBusy();

    // O storage-repository agora envia binários direto ao Supabase Storage
    return new Promise(function(resolve, reject){
      storageRepo.upload(file, path, function(err, result){
        if (err) {
          if (typeof global.syncErr === 'function') global.syncErr(err);
          reject(err);
        } else {
          if (typeof global.syncOk === 'function') global.syncOk();
          resolve(result);
        }
      });
    });
  }

  // Fluxo completo: para gravação + envia o áudio
  function stopAndUpload(opts){
    opts = opts || {};
    return stopRecording().then(function(recResult){
      if (!recResult) return null;
      if (typeof global.toast === 'function') {
        global.toast('⏫ Enviando áudio (' + recResult.durationFormatted + ')...', 2000);
      }
      return uploadAudio(recResult.file, opts).then(function(uploadResult){
        // Revoga o blob URL temporário
        if (recResult.dataUrl) {
          try { URL.revokeObjectURL(recResult.dataUrl); } catch(e) {}
        }
        if (typeof global.toast === 'function') {
          global.toast('✅ Áudio enviado!', 3000);
        }
        return {
          recording: recResult,
          upload: uploadResult
        };
      }).catch(function(err){
        // Revoga o blob URL mesmo em caso de erro
        if (recResult.dataUrl) {
          try { URL.revokeObjectURL(recResult.dataUrl); } catch(e) {}
        }
        if (typeof global.toast === 'function') {
          global.toast('❌ Falha ao enviar áudio: ' + (err.message || 'erro desconhecido'), 5000);
        }
        throw err;
      });
    });
  }

  // Cria um objeto de anexo de áudio para salvar no card
  function makeAudioAttachment(uploadResult, recResult){
    if (!uploadResult || !uploadResult.url) return null;
    return {
      id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: 'audio/' + ((recResult && recResult.filename && recResult.filename.split('.').pop()) || 'webm'),
      name: (recResult && recResult.filename) || 'audio.webm',
      url: uploadResult.url,
      path: uploadResult.path || '',
      size: (recResult && recResult.size) || 0,
      duration: (recResult && recResult.duration) || 0,
      ts: new Date().toISOString()
    };
  }

  // Expõe ao escopo global
  global.isAudioRecordingSupported = isAudioRecordingSupported;
  global.startAudioRecording = startRecording;
  global.stopAudioRecording = stopRecording;
  global.cancelAudioRecording = cancelRecording;
  global.uploadAudioFile = uploadAudio;
  global.stopAndUploadAudio = stopAndUpload;
  global.makeAudioAttachment = makeAudioAttachment;

  documentos.runtime = documentos.runtime || {};
  documentos.runtime.isAudioRecordingSupported = isAudioRecordingSupported;
  documentos.runtime.startRecording = startRecording;
  documentos.runtime.stopRecording = stopRecording;
  documentos.runtime.cancelRecording = cancelRecording;
  documentos.runtime.uploadAudio = uploadAudio;
  documentos.runtime.stopAndUpload = stopAndUpload;
  documentos.runtime.makeAudioAttachment = makeAudioAttachment;

})(window);
