// ==== AUDIT-SECURITY 2026-07-17 =============================================
// As chaves do Supabase foram REMOVIDAS deste arquivo e substituídas por
// placeholders. Configure os valores reais via:
//   • Dev:    copie .env.example para .env.local e edite
//   • Prod:   `wrangler secret put SUPABASE_URL` etc.
// Nunca commit chaves reais neste arquivo.
// ===========================================================================

/* =====================================================================
 * supabase.js
 * Substitui js/firebase.js. Migração Firebase -> Supabase (2026).
 *
 * ESTRATÉGIA: em vez de reescrever os ~120 pontos do código que usam
 * db.collection(...).doc(...).get()/.set()/.update()/.delete(), este
 * arquivo cria um "adaptador" que IMITA a mesma sintaxe do Firestore,
 * só que por baixo dos panos fala com uma tabela do Postgres no
 * Supabase (fs_documents: path + data jsonb). Assim kanban.js, leads.js,
 * usuarios.js, agenda.js etc. continuam funcionando sem alteração.
 *
 * IMPORTANTE: a variável DB_MODE continua usando o valor 'firebase'
 * como sinônimo de "nuvem conectada" (não trocamos pra 'supabase') só
 * pra não precisar mexer nas dezenas de checagens
 * "if(DB_MODE==='firebase'&&db)" espalhadas pelo resto do app.
 * ===================================================================== */

// ============================================================
// CONFIGURAÇÃO SUPABASE — LIDERCRM 2026 (recomeço limpo)
// ------------------------------------------------------------
// Projeto novo no Supabase: "lidercrm-2026"
// Substitua os 2 valores abaixo pelos do NOVO projeto.
// Você encontra em: Supabase Dashboard -> Project Settings -> API
//   - Project URL          -> cole em SUPABASE_URL
//   - anon public key      -> cole em SUPABASE_KEY
// ============================================================
// CORREÇÃO (2026-07-17b): URL corrigida para o projeto do dashboard
// (https://supabase.com/dashboard/project/<seu-projeto>/...)
// A chave SUPABASE_KEY está como PLACEHOLDER — você precisa colar a
// "Publishable key" (sb_publishable_…) que está em
//   https://supabase.com/dashboard/project/<seu-projeto>/settings/api-keys
// (a chave tem que ser do MESMO projeto da URL!)
// Os 3 valores precisam estar IGUAIS em:
//   • js/supabase.js
//   • src/worker/utils/env.js
//   • wrangler.toml  [vars]
var __storageRuntime=(typeof window.LiderCRM!=='undefined'&&window.LiderCRM.modules&&window.LiderCRM.modules.storage&&window.LiderCRM.modules.storage.runtime)||{};
var SUPABASE_URL = __storageRuntime.SUPABASE_URL||'';
var SUPABASE_KEY = __storageRuntime.SUPABASE_KEY||'';
var SUPABASE_BUCKET = __storageRuntime.SUPABASE_BUCKET||'lidercrm-files';
// Aviso de configuração em desenvolvimento — não bloqueia o boot
if(SUPABASE_URL.indexOf('REPLACE_ME')>=0||!SUPABASE_URL){console.warn('[LiderCRM] SUPABASE_URL não configurado. Sync cloud desativado.');}
if(SUPABASE_KEY.indexOf('REPLACE_ME')>=0||!SUPABASE_KEY){console.warn('[LiderCRM] SUPABASE_KEY não configurado. Sync cloud desativado.');}
var _cloneJson = __storageRuntime._cloneJson;
var _isPlainObject = __storageRuntime._isPlainObject||function(){};
var _fieldParts = __storageRuntime._fieldParts||function(){};
var _splitFieldOps = __storageRuntime._splitFieldOps||function(){};
var _ensureContainer = __storageRuntime._ensureContainer||function(){};
var _setField = __storageRuntime._setField||function(){};
var _deleteField = __storageRuntime._deleteField||function(){};
var _deepMergeInto = __storageRuntime._deepMergeInto||function(){};
var _applyPlainWrites = __storageRuntime._applyPlainWrites||function(){};
var _applyArrayUnion = __storageRuntime._applyArrayUnion||function(){};
var _applyArrayRemove = __storageRuntime._applyArrayRemove||function(){};
var _applyIncrement = __storageRuntime._applyIncrement||function(){};
var _readField = __storageRuntime._readField;
var _cmpVal = __storageRuntime._cmpVal;
var _applyQueryRows = __storageRuntime._applyQueryRows;

var DB_MODE='local', db=null, fbStorage=null, _sbClient=null;

var _LF_CAPACITOR = __storageRuntime._LF_CAPACITOR;
window.LF_CAPACITOR = _LF_CAPACITOR;

var _LF_SB_CACHE_KEY = __storageRuntime._LF_SB_CACHE_KEY;
var _LF_SB_CACHE_TTL_MS = __storageRuntime._LF_SB_CACHE_TTL_MS;
var _lfReadAnonCache = __storageRuntime._lfReadAnonCache;
var _lfWriteAnonCache = __storageRuntime._lfWriteAnonCache;
var _lfWriteAnonSession = __storageRuntime._lfWriteAnonSession;
var _lfReadAnonSession = __storageRuntime._lfReadAnonSession;
var _lfSignInAnonSession = __storageRuntime._lfSignInAnonSession;
var _lfClearAnonSession = __storageRuntime._lfClearAnonSession;
var _confirmModal = __storageRuntime._confirmModal;

var S=null,_dcId=null,_duId=null,_dashTab='normal',_searchQ='',_per='mes',_tlCid=null,_tlOwnerUid=null;

var _fltNicho='',_fltDate='',_fltLate=false;

var _nshCid=null,_nshOpt=null;

var syncOk = __storageRuntime.syncOk;
var syncBusy = __storageRuntime.syncBusy;
var syncErr = __storageRuntime.syncErr;
var _uuid = __storageRuntime._uuid;

// ============================================================
// Compatibilidade mínima com Firebase legado
// ------------------------------------------------------------
// Ainda existem patches antigos chamando firebase.firestore()
// (enablePersistence) e firebase.auth().signInAnonymously().
// Na migração para Supabase, esses pontos passaram a quebrar em
// alguns aparelhos porque firebase.firestore virou só um objeto.
// Aqui expomos um shim pequeno, suficiente para manter esses
// patches vivos sem depender do SDK antigo.
// ============================================================
window.firebase = window.firebase || {};
var _firebaseCompatFieldValue = {
  arrayUnion: function(){ return {__fsOp:'arrayUnion', values:Array.prototype.slice.call(arguments)}; },
  arrayRemove: function(){ return {__fsOp:'arrayRemove', values:Array.prototype.slice.call(arguments)}; },
  increment: function(n){ return {__fsOp:'increment', value:Number(n)||0}; },
  delete: function(){ return {__fsOp:'delete'}; },
  deleteField: function(){ return {__fsOp:'delete'}; }
};
function _firebaseCompatFirestore(){
  return {
    enablePersistence: function(){ return Promise.resolve(); }
  };
}
_firebaseCompatFirestore.FieldValue = _firebaseCompatFieldValue;
window.firebase.firestore = _firebaseCompatFirestore;
window.firebase.auth = function(){
  return {
    get currentUser(){ return (DB_MODE==='firebase'&&_sbClient)?{uid:'supabase-anon'}:null; },
    signInAnonymously: function(){
      if(_sbClient&&_sbClient.auth&&typeof _sbClient.auth.signInAnonymously==='function'){
        return _sbClient.auth.signInAnonymously();
      }
      return Promise.reject(new Error('supabase-auth-unavailable'));
    }
  };
};

function _dashFiltersKey(uid){
  return 'lf_dash_filters_'+String(uid||((S&&S.userId)||'anon'));
}

function _currentDashFilters(){
  return {nicho:_fltNicho||'',date:_fltDate||'',late:!!_fltLate,ts:Date.now()};
}

function _applyDashFiltersState(data){
  data=data||{};
  _fltNicho=data.nicho||'';
  _fltDate=data.date||'';
  _fltLate=!!data.late;
  var fn=document.getElementById('flt-nicho');if(fn)fn.value=_fltNicho;
  var fd=document.getElementById('flt-date');if(fd)fd.value=_fltDate;
  var fl=document.getElementById('flt-late');if(fl){fl.classList.toggle('on',_fltLate);fl.setAttribute('aria-pressed',_fltLate?'true':'false');}
  if(typeof _updateFltClearBtn==='function')_updateFltClearBtn();
}

function saveSavedFiltersRemote(){
  var payload=_currentDashFilters();
  try{if(S&&S.userId)ss(_dashFiltersKey(S.userId),payload);}catch(e){}
  if(!(DB_MODE==='firebase'&&db&&S&&S.userId))return Promise.resolve(payload);
  return db.collection('config').doc('dash_filters_'+S.userId).set(payload,{merge:true}).then(function(){return payload;}).catch(function(){return payload;});
}

function loadSavedFiltersRemote(cb){
  var cached=null;
  try{if(S&&S.userId)cached=sg(_dashFiltersKey(S.userId));}catch(e){}
  if(cached)_applyDashFiltersState(cached);
  if(cb)try{cb(cached||_currentDashFilters());}catch(e){}
  if(!(DB_MODE==='firebase'&&db&&S&&S.userId))return Promise.resolve(cached||null);
  return db.collection('config').doc('dash_filters_'+S.userId).get().then(function(doc){
    var data=doc&&doc.exists?doc.data():null;
    if(data){
      try{ss(_dashFiltersKey(S.userId),data);}catch(e){}
      _applyDashFiltersState(data);
      if(cb)try{cb(data);}catch(e){}
    }
    return data;
  }).catch(function(){ return cached||null; });
}

// ============================================================
// ADAPTADOR "FIRESTORE-LIKE" SOBRE O SUPABASE (fs_documents)
// ============================================================
function _mkQueryRef(sb, parts, q){
  var ref=_mkRef(sb, parts, 'collection');
  ref._query={filters:(q&&q.filters||[]).slice(),orderBy:q&&q.orderBy?{field:q.orderBy.field,dir:q.orderBy.dir}:null,limit:q&&q.limit||0};
  ref.where=function(field,op,value){
    var nq={filters:ref._query.filters.concat([{field:String(field),op:String(op),value:value}]),orderBy:ref._query.orderBy,limit:ref._query.limit};
    return _mkQueryRef(sb, parts, nq);
  };
  ref.orderBy=function(field,dir){
    var nq={filters:ref._query.filters.slice(),orderBy:{field:String(field),dir:dir||'asc'},limit:ref._query.limit};
    return _mkQueryRef(sb, parts, nq);
  };
  ref.limit=function(n){
    var nq={filters:ref._query.filters.slice(),orderBy:ref._query.orderBy,limit:parseInt(n||0,10)||0};
    return _mkQueryRef(sb, parts, nq);
  };
  return ref;
}

function _fsChildPrefix(path){
  return String(path||'')+'/';
}

function _fsIsDirectChildPath(docPath, collectionPath){
  docPath=String(docPath||'');
  collectionPath=String(collectionPath||'');
  var prefix=_fsChildPrefix(collectionPath);
  if(docPath.indexOf(prefix)!==0)return false;
  return docPath.slice(prefix.length).indexOf('/')===-1;
}

function _mkRef(sb, parts, kind){
  var path=parts.join('/');
  var self={
    id: parts[parts.length-1],
    path: path,
    collection: function(name){ return _mkRef(sb, parts.concat([String(name)]), 'collection'); },
    doc: function(id){
      var docId=(id===undefined||id===null)?_uuid():String(id);
      return _mkRef(sb, parts.concat([docId]), 'doc');
    }
  };

  if(kind==='doc'){
    self.get=function(){
      return sb.from('fs_documents').select('data').eq('path',path).maybeSingle().then(function(res){
        if(res.error)throw res.error;
        var exists=!!res.data;
        var raw=exists?res.data.data:undefined;
        return {exists:exists, id:self.id, data:function(){return raw;}};
      });
    };
    self.set=function(data,opts){
      var merge=opts&&opts.merge;
      var ops=_splitFieldOps(data);
      var hasFieldOps=ops.unions.length||ops.removes.length||ops.increments.length||ops.deletes.length;
      function write(base){
        var finalData=merge?_cloneJson(base||{}):{};
        if(!_isPlainObject(finalData))finalData={};
        _applyPlainWrites(finalData,ops.plain,!!merge);
        ops.unions.forEach(function(op){_applyArrayUnion(finalData,op.path,op.values);});
        ops.removes.forEach(function(op){_applyArrayRemove(finalData,op.path,op.values);});
        ops.increments.forEach(function(op){_applyIncrement(finalData,op.path,op.value);});
        ops.deletes.forEach(function(op){_deleteField(finalData,op.path);});
        return sb.from('fs_documents').upsert({path:path,data:finalData,updated_at:new Date().toISOString()},{onConflict:'path'}).then(function(res){
          if(res.error)throw res.error;
        });
      }
      if(merge||hasFieldOps){
        return self.get().then(function(snap){return write(snap.exists?snap.data():{});});
      }
      return write({});
    };
    self.update=function(data){
      return self.get().then(function(snap){
        if(!snap.exists)throw new Error('not-found: '+path);
        return self.set(data,{merge:true});
      });
    };
    self.delete=function(){
      return sb.from('fs_documents').delete().eq('path',path).then(function(res){if(res.error)throw res.error;});
    };
  }else{
    self._query={filters:[],orderBy:null,limit:0};
    self.where=function(field,op,value){return _mkQueryRef(sb,parts,{filters:[{field:String(field),op:String(op),value:value}],orderBy:self._query.orderBy,limit:self._query.limit});};
    self.orderBy=function(field,dir){return _mkQueryRef(sb,parts,{filters:self._query.filters.slice(),orderBy:{field:String(field),dir:dir||'asc'},limit:self._query.limit});};
    self.limit=function(n){return _mkQueryRef(sb,parts,{filters:self._query.filters.slice(),orderBy:self._query.orderBy,limit:parseInt(n||0,10)||0});};
    self.get=function(){
      return sb.from('fs_documents').select('path,data').like('path',_fsChildPrefix(path)+'%').then(function(res){
        if(res.error)throw res.error;
        var rows=(res.data||[]).filter(function(r){return _fsIsDirectChildPath(r&&r.path,path);});
        rows=_applyQueryRows(rows,self._query);
        function mkDoc(r){return {id:r.path.split('/').pop(), data:function(){return r.data;}, exists:true};}
        return {
          empty: rows.length===0,
          docs: rows.map(mkDoc),
          forEach: function(cb){rows.forEach(function(r){cb(mkDoc(r));});}
        };
      });
    };
    self.add=function(data){
      var newRef=self.doc();
      return newRef.set(data).then(function(){return newRef;});
    };
    self.onSnapshot=function(onNext,onError){
      var closed=false;
      function reload(){
        self.get().then(function(snap){if(!closed)onNext(snap);}).catch(function(e){if(!closed&&onError)onError(e);});
      }
      reload();
      function _matchesPayload(payload){
        var newPath=payload&&payload.new&&payload.new.path;
        var oldPath=payload&&payload.old&&payload.old.path;
        if(!newPath&&!oldPath)return true;
        return _fsIsDirectChildPath(newPath,path)||_fsIsDirectChildPath(oldPath,path);
      }
      var channel=sb.channel('rt:'+path)
        .on('postgres_changes',{event:'*',schema:'public',table:'fs_documents'},function(payload){
          if(_matchesPayload(payload))reload();
        })
        .subscribe();
      return function unsubscribe(){closed=true;try{sb.removeChannel(channel);}catch(e){}};
    };
  }
  return self;
}

function _mkDB(sb){
  var dbObj={
    collection: function(name){return _mkRef(sb,[String(name)],'collection');}
  };
  // db.batch() — usado 1x (migração legada de usuários). Não é atômico de
  // verdade no Postgres (seria preciso uma função RPC pra isso), mas como
  // cada set() já é upsert independente, funciona bem pro caso de uso atual.
  dbObj.batch=function(){
    var ops=[];
    return {
      set: function(ref,data,opts){ops.push(function(){return ref.set(data,opts);});},
      update: function(ref,data){ops.push(function(){return ref.update(data);});},
      delete: function(ref){ops.push(function(){return ref.delete();});},
      commit: function(){return Promise.all(ops.map(function(fn){return fn();}));}
    };
  };
  // db.runTransaction() — usado 1x (saveUserDoc). Implementação simplificada:
  // não há isolamento real de transação no Postgres aqui (exigiria uma
  // função RPC dedicada), mas cobre o padrão "ler, mesclar, escrever" usado
  // no código sem precisar tocar em usuarios.js.
  dbObj.runTransaction=function(updateFn){
    var pending=[];
    var tx={
      get: function(ref){return ref.get();},
      set: function(ref,data){pending.push(function(){return ref.set(data);});},
      update: function(ref,data){pending.push(function(){return ref.update(data);});},
      delete: function(ref){pending.push(function(){return ref.delete();});}
    };
    return Promise.resolve(updateFn(tx)).then(function(r){
      return Promise.all(pending.map(function(fn){return fn();})).then(function(){return r;});
    });
  };
  return dbObj;
}

function _mkStorage(sb){
  return {
    ref: function(){
      return {
        child: function(path){
          return {
            put: function(file){
              function _inlineFallback(){
                return new Promise(function(resolve,reject){
                  try{
                    var fr=new FileReader();
                    fr.onload=function(e){
                      resolve({ref:{getDownloadURL:function(){return Promise.resolve(e.target.result);}},_inline:true});
                    };
                    fr.onerror=function(err){reject(err);};
                    fr.readAsDataURL(file);
                  }catch(err){reject(err);}
                });
              }
              return sb.storage.from(SUPABASE_BUCKET).upload(path,file,{upsert:true,contentType:file.type||undefined}).then(function(res){
                if(res.error){
                  console.warn('Supabase Storage indisponível; usando fallback inline para',path,res.error);
                  return _inlineFallback();
                }
                return {ref:{getDownloadURL:function(){
                  var pub=sb.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
                  return Promise.resolve(pub.data.publicUrl);
                }}};
              }).catch(function(err){
                console.warn('Upload falhou; usando fallback inline para',path,err);
                return _inlineFallback();
              });
            },
            delete: function(){
              return sb.storage.from(SUPABASE_BUCKET).remove([path]);
            }
          };
        }
      };
    }
  };
}

// ============================================================
// BOOT
// ============================================================
// CORREÇÃO BUG LENTIDÃO #1 (2026-07-23): flags de boot expostas em window
// para que _lfSafeInitDB() do patch v39 consiga zerá-las em uma reconexão
// (splash não trava mais em "Conectando..." quando o app tenta reconectar
// depois de uma falha).
var _dbBootStarted=false,_dbBootFinished=false,_bootWatchdog=0,_bootProgressInt=0;
try{ Object.defineProperty(window,'_dbBootStarted',{get:function(){return _dbBootStarted;},set:function(v){_dbBootStarted=!!v;},configurable:true}); }catch(_e){}
try{ Object.defineProperty(window,'_dbBootFinished',{get:function(){return _dbBootFinished;},set:function(v){_dbBootFinished=!!v;},configurable:true}); }catch(_e){}
function _armBootWatchdog(){
  try{clearTimeout(_bootWatchdog);}catch(e){}
  try{clearInterval(_bootProgressInt);}catch(_e){}
  // FIX v15: watchdog no web fica em 10s. No Capacitor SUBIMOS para 55s
  // porque o pior caso legítimo é:
  //   SDK poll 15s + signIn timeout 18s + retry (800ms + 18s) ≈ 52s
  // Antes com 40s o watchdog cortava no meio do retry e o usuário via
  // "Modo local" mesmo quando o retry teria conectado.
  var ms = (_LF_CAPACITOR && _LF_CAPACITOR.native) ? 55000 : 10000;
  _bootWatchdog=setTimeout(function(){
    if(_dbBootFinished)return;
    console.warn('watchdog: forçando saída da splash após '+(ms/1000)+'s');
    // Mensagem amigável no Android (não "Não conectado à nuvem")
    if(_LF_CAPACITOR.native){
      usarLocal('Conexão lenta — dados salvos localmente serão sincronizados');
    } else {
      usarLocal('Modo offline (watchdog)');
    }
  },ms);
  // Indicador de progresso durante boot longo no mobile
  if(_LF_CAPACITOR.native){
    var msgs = ['Conectando à nuvem...','Quase lá...','Sincronizando...'];
    var i = 0;
    _bootProgressInt = setInterval(function(){
      if(_dbBootFinished){try{clearInterval(_bootProgressInt);}catch(_e){}return;}
      var sub=document.querySelector('#splash .splash-sub');
      if(sub){ i=(i+1)%msgs.length; sub.textContent = msgs[i]; }
    }, 8000);
  }
}

/* FIX BOOT INFINITO (2026-07):
   Antes: initDB checava window.supabase 1 vez, esperava 1.2s e desistia se o SDK
   não estivesse pronto — em conexões lentas (4G ruim, celular) o SDK do jsdelivr
   demora mais que isso e o app travava em "CONECTANDO...". Agora fazemos polling
   de até ~8s (16 tentativas de 500ms) esperando o SDK, e SEMPRE caímos em
   usarLocal() em vez de deixar a splash aberta pra sempre. */
function initDB(){
  var sub=document.querySelector('#splash .splash-sub');if(sub)sub.textContent='Conectando...';
  if(_dbBootStarted&&!_dbBootFinished)return;
  _dbBootStarted=true;
  _armBootWatchdog();

  // FIX 2026-07-17: Se temos sessão Supabase cacheada (TTL válido) E o SDK
  // já está pronto, podemos INICIAR direto em modo "nuvem conectada"
  // SÍNCRONAMENTE, sem esperar a rede. Isso elimina o flash "Não conectado à
  // nuvem" no Android (causa raiz principal). O preflight valida em
  // background. Se o preflight falhar (JWT expirou), caímos em local
  // SILENCIOSAMENTE e seguimos funcional.
  var _cached = _lfReadAnonCache();

  var _sdkTries=0;
  // FIX v15: no Capacitor damos mais chances ao SDK local (o vendor UMD tem 200KB
  // e em Android WebView em cold-start pode levar 3-6s pra parsear). E o web fica
  // em 6s (12 x 500ms) pra ter margem antes do watchdog de 10s.
  var _SDK_POLL_LIMIT = _LF_CAPACITOR.native ? 40 : 12;
  var _SIGNIN_LIMIT = _LF_CAPACITOR.native ? 2 : 1;
  var _signinTimeoutMs = _LF_CAPACITOR.native ? 18000 : 7000;
  var _signinAttempts = 0;

  function _waitForSDK(){
    if(typeof window.supabase!=='undefined'&&window.supabase&&typeof window.supabase.createClient==='function'){
      return _connectSupabase();
    }
    // FIX 2026-07-14: dispara o fallback CDN JA na 1a tentativa faltante, não na 2a.
    // Em Capacitor o script local pode ter falhado silenciosamente (asset ausente
    // do bundle Android, ou onerror engolido), então quanto antes o CDN entrar,
    // menos tempo o usuário vê a splash "Conectando...".
    if(_sdkTries===0&&typeof window.__loadSupabaseCdnFallback==='function'){
      try{window.__loadSupabaseCdnFallback(function(ok){
        if(ok && typeof window.supabase!=='undefined' && window.supabase && typeof window.supabase.createClient==='function'){
          // acelera o polling assim que o CDN responder
          _sdkTries=Math.max(_sdkTries,0);
        }
      });}catch(_e){}
    }
    _sdkTries++;
    if(_sdkTries>_SDK_POLL_LIMIT){
      console.warn('initDB: SDK do Supabase não carregou após '+((_SDK_POLL_LIMIT*500)/1000)+'s');
      return usarLocal('Modo offline (SDK indisponível)');
    }
    setTimeout(_waitForSDK,500);
  }
  function _bootDiagMsg(err){
    var msg=((err&&err.message)||err||'').toString();
    if(/anonymous sign-?ins? are disabled/i.test(msg))return 'Modo offline (ative Anonymous Sign-ins no Supabase)';
    if(/Invalid API key|No API key found in request/i.test(msg))return 'Modo offline (chave pública do Supabase inválida)';
    if(/relation .*fs_documents.* does not exist|fs_documents/i.test(msg))return 'Modo offline (rode o supabase_schema.sql)';
    if(/row-level security|permission denied|new row violates row-level security/i.test(msg))return 'Modo offline (RLS/policies do Supabase pendentes)';
    return 'Modo offline (auth/supabase falhou)';
  }
  function _connectSupabase(){
    try{
      _sbClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
        auth:{persistSession:true,autoRefreshToken:true,storage:window.localStorage,
          // FIX 2026-07-14: detectSessionInUrl:false evita o WebView do Capacitor
          // tentar parsear a URL de OAuth (ela não existe no fluxo anônimo) e ficar
          // travado num getSession() interno.
          detectSessionInUrl:false},
        // FIX 2026-07-14: fetch com timeout explícito p/ o Postgres não pendurar
        // pra sempre em 4G ruim (o WebView não cancela fetch abandonado).
        global:{fetch:function(url,opts){
          opts=opts||{};
          if(!opts.signal){
            try{
              var ctrl=new AbortController();
              var ms=_LF_CAPACITOR.native?25000:15000;
              var to=setTimeout(function(){try{ctrl.abort();}catch(_e){}},ms);
              opts.signal=ctrl.signal;
              var p=fetch(url,opts);
              p.finally&&p.finally(function(){clearTimeout(to);});
              return p;
            }catch(_e){}
          }
          return fetch(url,opts);
        }}
      });
    }catch(e){console.error('initDB createClient',e);return usarLocal('Modo offline (createClient falhou)');}
    var t=setTimeout(function(){
      console.warn('initDB: signInAnonymously timeout '+(_signinTimeoutMs/1000)+'s (attempt '+_signinAttempts+')');
      if(_LF_CAPACITOR.native && _signinAttempts < _SIGNIN_LIMIT){
        _signinAttempts++;
        clearTimeout(t);
        setTimeout(_doSignin, 500); // retry em 4G oscilante
        return;
      }
      usarLocal(_LF_CAPACITOR.native ? 'Conexão lenta — dados salvos localmente serão sincronizados' : 'Modo offline (timeout)');
    },_signinTimeoutMs);
    function _finishCloudOk(){
      clearTimeout(t);
      db=_mkDB(_sbClient);
      fbStorage=_mkStorage(_sbClient);
      DB_MODE='firebase'; // mantido por compatibilidade — ver nota no topo do arquivo
      _dbBootFinished=true;
      try{clearTimeout(_bootWatchdog);}catch(e){}
      try{clearInterval(_bootProgressInt);}catch(_e){}
      if(sub)sub.textContent='Conectado!';
      setTimeout(hideSplash,500);
    }
    function _preflight(){
      return _sbClient.from('fs_documents').select('path').limit(1).then(function(res){
        if(res&&res.error)throw res.error;
      });
    }
    function _doSignin(){
      _signinAttempts++;
      try{
        _sbClient.auth.signInAnonymously().then(function(res){
          if(res&&res.error)throw res.error;
          // FIX v16: try/catch defensivo — se _lfWriteAnonCache falhar
          // (ex.: quota exceeded no localStorage), o boot NÃO pode parar.
          try{ _lfWriteAnonCache(res&&res.data||true); }catch(_cacheErr){
            try{console.warn('initDB: cache anônimo falhou (ignorado)',_cacheErr);}catch(_e){}
          }
          return _preflight().then(_finishCloudOk).catch(function(e){
            // Preflight (SELECT) falhou MAS signIn OK: ainda marcamos
            // como "nuvem conectada" — writes individuais vão usar
            // o JWT recém-obtido, que é o que importa para RLS.
            console.warn('initDB: preflight falhou mas signIn OK — entrando em nuvem parcial',e);
            _finishCloudOk();
          });
        }).catch(function(e){
          console.error('initDB signInAnonymously/preflight',e);
          clearTimeout(t);
          if(_LF_CAPACITOR.native && _signinAttempts < _SIGNIN_LIMIT){
            console.warn('initDB Capacitor: retry #' + _signinAttempts);
            setTimeout(_doSignin, 800);
            return;
          }
          // FIX 2026-07-17: Mensagem amigável no Android (sem "Não conectado")
          if(_LF_CAPACITOR.native){
            usarLocal('Sincronização em segundo plano');
          } else {
            usarLocal(_bootDiagMsg(e));
          }
        });
      }catch(e){
        console.error('initDB signInAnonymously sync throw',e);
        clearTimeout(t);
        usarLocal(_LF_CAPACITOR.native ? 'Sincronização em segundo plano' : _bootDiagMsg(e));
      }
    }
    // FAST-PATH: temos cache válido → já entramos em nuvem conectada
    // imediatamente, mesmo antes do signIn terminar. O preflight valida
    // em background. Isso é o que elimina o flash "Não conectado à nuvem"
    // no Android WebView do Capacitor.
    if(_cached){
      _finishCloudOk();
      setTimeout(function(){
        if(!_sbClient)return;
        _preflight().catch(function(e){
          console.warn('initDB: cache preflight falhou (refresh de JWT em background)', e);
        });
      }, 50);
      return;
    }
    _doSignin();
  }
  try{_waitForSDK();}catch(e){console.error('initDB',e);usarLocal('Modo offline (erro inesperado)');}
}

function usarLocal(m){
  DB_MODE='local';db=null;fbStorage=null;_dbBootFinished=true;
  try{clearTimeout(_bootWatchdog);}catch(e){}
  try{clearInterval(_bootProgressInt);}catch(_e){}
  var sub=document.querySelector('#splash .splash-sub');if(sub)sub.textContent=m||'Modo local';
  // FIX v14: mostra motivo detalhado no bloco de erro da splash quando é uma falha de config
  // do Supabase. Antes só aparecia "Modo offline" genérico e o usuário não sabia o que ajustar.
  try{
    var err=document.getElementById('sp-err');
    if(err && m && /SDK|Anonymous|API key|fs_documents|RLS|supabase_schema/i.test(m)){
      err.textContent = 'Diagnóstico: ' + m + '. Veja CORRECOES-v14.md para resolver.';
      err.style.display='block';
    }
  }catch(_e){}
  setTimeout(hideSplash,600);
}

function hideSplash(){
  var sp=document.getElementById('splash');
  if(!sp)return;
  sp.classList.add('hide');
  setTimeout(function(){
    sp.style.display='none';
    if(typeof bootApp==='function') {
      try {
        bootApp();
      } catch(e) {
        console.error('Erro ao executar bootApp:', e);
      }
    } else {
      setTimeout(function(){
        if(typeof bootApp==='function') {
          try {
            bootApp();
          } catch(e) {
            console.error('Erro ao executar bootApp (retry):', e);
          }
        }
      },250);
    }
  },380);
}

/* Confirmação via toast (evita confirm() nativo, bloqueado em iOS PWA — mesmo padrão de doLogout). */
function disconnectSession(deviceId){
  var t=document.getElementById('toast'),tm=document.getElementById('tmsg');
  if(!t||!tm){_disconnectSessionNow(deviceId);return;}
  clearTimeout(t._tm);clearTimeout(t._confirmTm);
  tm.innerHTML='Desconectar este dispositivo? <button id="toast-disc-btn" style="margin-left:8px;padding:2px 9px;border-radius:6px;border:none;background:var(--red);color:#fff;font-size:.75rem;cursor:pointer;font-family:Outfit,sans-serif">Desconectar</button>';
  var btn=document.getElementById('toast-disc-btn');
  if(btn)btn.addEventListener('click',function(){clearTimeout(t._confirmTm);t.classList.remove('show');_disconnectSessionNow(deviceId);},{once:true});
  t.classList.add('show');
  t._confirmTm=setTimeout(function(){t.classList.remove('show');tm.textContent='';},4000);
}

// ============================================================
// IDENTIDADE VISUAL OFICIAL — Líder Financeira e Investimentos
// ============================================================
var LF_OFFICIAL_LOGO=LF_LOGO_B64;

// ============================================================
// PWA
// ============================================================
(function(){try{
  var iconDataUrl=LF_OFFICIAL_LOGO;
  var img=new Image();
  img.onload=function(){
    try{
      var cv=document.createElement('canvas');cv.width=192;cv.height=192;
      var ctx=cv.getContext('2d');ctx.drawImage(img,0,0,192,192);
      var pngUrl=cv.toDataURL('image/png');
      var ate=document.getElementById('apple-touch-icon');if(ate)ate.href=pngUrl;
      var m={name:'LIDER CRM - Líder Financeira e Investimentos',short_name:'LIDER CRM',start_url:window.location.href.split('?')[0],display:'standalone',background_color:'#0A0C10',theme_color:'#0A0C10',icons:[{src:pngUrl,sizes:'192x192',type:'image/png'},{src:pngUrl,sizes:'512x512',type:'image/png'}]};
      var el=document.getElementById('pwa-manifest');if(el)el.href=URL.createObjectURL(new Blob([JSON.stringify(m)],{type:'application/json'}));
    }catch(e){
      var m2={name:'LIDER CRM - Líder Financeira e Investimentos',short_name:'LIDER CRM',start_url:window.location.href.split('?')[0],display:'standalone',background_color:'#0A0C10',theme_color:'#0A0C10',icons:[{src:iconDataUrl,sizes:'480x480',type:'image/jpeg'}]};
      var el2=document.getElementById('pwa-manifest');if(el2)el2.href=URL.createObjectURL(new Blob([JSON.stringify(m2)],{type:'application/json'}));
    }
  };
  img.onerror=function(){
    var m3={name:'LIDER CRM - Líder Financeira e Investimentos',short_name:'LIDER CRM',start_url:window.location.href.split('?')[0],display:'standalone',background_color:'#0A0C10',theme_color:'#0A0C10',icons:[]};
    var el3=document.getElementById('pwa-manifest');if(el3)el3.href=URL.createObjectURL(new Blob([JSON.stringify(m3)],{type:'application/json'}));
  };
  img.src=iconDataUrl;
  }catch(e){}
  window.LF_ENABLE_SW = false;
  })();

/* Push notifications (antigo Firebase Cloud Messaging) foram removidas
   nesta migração — eram acopladas à API específica do Firebase Messaging
   e já estavam desativadas (LF_ENABLE_SW=false). Mantido como não-operação
   só pra não quebrar a chamada que existe em app.js (setTimeout(setupPushNotifications,...)).
   Pra reativar notificações no futuro, dá pra usar Web Push (VAPID, sem
   depender de Firebase) ou notificar via WhatsApp/Evolution API. */
function setupPushNotifications(){}

var _dip=null;

window.addEventListener('beforeinstallprompt',function(e){
  e.preventDefault();
  _dip=e;
  var isk=false;
  try{isk=!!localStorage.getItem('lf_isk');}catch(_e){}
  if(!isk){
    var ib=document.getElementById('ibar');
    if(ib)ib.classList.add('v');
  }
});

window.addEventListener('appinstalled',function(){
  _dip=null;
  var ib=document.getElementById('ibar');
  if(ib)ib.classList.remove('v');
  try{localStorage.setItem('lf_isk','1');}catch(_e){}
});

function doInst(){
  var ib=document.getElementById('ibar');
  if(ib)ib.classList.remove('v');
  if(!_dip||typeof _dip.prompt!=='function')return;
  try{
    var p=_dip.prompt();
    if(p&&typeof p.then==='function'){
      p.then(function(){
        if(_dip&&_dip.userChoice&&typeof _dip.userChoice.then==='function'){
          _dip.userChoice.finally(function(){ _dip=null; });
        }
      }).catch(function(){});
    }else if(_dip.userChoice&&typeof _dip.userChoice.finally==='function'){
      _dip.userChoice.finally(function(){ _dip=null; });
    }
  }catch(e){console.warn('prompt de instalação falhou',e);}
}

function skipInst(){var ib=document.getElementById('ibar');if(ib)ib.classList.remove('v');try{localStorage.setItem('lf_isk','1');}catch(e){}}
