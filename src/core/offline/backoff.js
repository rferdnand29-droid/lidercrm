(function(global){
  'use strict';
  var root = global.LiderCRM = global.LiderCRM || {};
  var offline = root.offline = root.offline || {};

  // Backoff exponencial com jitter — usado por RetryQueue e SyncManager
  //   attempt 0 -> baseMs
  //   attempt N -> min(maxMs, baseMs * factor^N) * (0.75..1.25)
  offline.Backoff = function(options){
    options = options || {};
    this.baseMs  = options.baseMs  || 1000;
    this.maxMs   = options.maxMs   || 60000;
    this.factor  = options.factor  || 2;
    this.jitter  = options.jitter  !== false;
  };
  offline.Backoff.prototype.delay = function(attempt){
    var raw = this.baseMs * Math.pow(this.factor, Math.max(0, attempt));
    var capped = Math.min(this.maxMs, raw);
    if(!this.jitter) return capped;
    var jf = 0.75 + Math.random() * 0.5;
    return Math.round(capped * jf);
  };
  offline.Backoff.prototype.wait = function(attempt){
    var ms = this.delay(attempt);
    return new Promise(function(resolve){ setTimeout(resolve, ms); });
  };
})(window);
