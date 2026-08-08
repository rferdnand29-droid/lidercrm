(function(global){
  'use strict';
  // Motor puro do adaptador "Firestore-like" sobre o Supabase (fs_documents).
  // Extraído de js/supabase.js na rodada 2026-07-17 (parte 3). Sem dependência
  // de estado do módulo, rede ou DOM — apenas transformação de dados em memória.
  var root = global.LiderCRM = global.LiderCRM || {};
  var modules = root.modules = root.modules || {};
  var storage = modules.storage = modules.storage || {};

function _cloneJson(v){
  if(v===undefined)return undefined;
  return JSON.parse(JSON.stringify(v));
}

function _isPlainObject(v){
  return !!v && Object.prototype.toString.call(v)==='[object Object]';
}

function _fieldParts(key){
  return String(key||'').split('.').filter(function(part){return part!=='';});
}

function _splitFieldOps(data){
  var plain=[],unions=[],removes=[],increments=[],deletes=[];
  Object.keys(data||{}).forEach(function(k){
    var v=data[k],item={path:String(k),value:v};
    if(v&&v.__fsOp==='arrayUnion')unions.push({path:String(k),values:(v.values||[]).slice()});
    else if(v&&v.__fsOp==='arrayRemove')removes.push({path:String(k),values:(v.values||[]).slice()});
    else if(v&&v.__fsOp==='increment')increments.push({path:String(k),value:Number(v.value)||0});
    else if(v&&v.__fsOp==='delete')deletes.push({path:String(k)});
    else plain.push(item);
  });
  return {plain:plain,unions:unions,removes:removes,increments:increments,deletes:deletes};
}

function _ensureContainer(obj,key){
  if(!_isPlainObject(obj[key]))obj[key]={};
  return obj[key];
}

function _setField(obj,key,value){
  if(!obj||!key)return obj;
  var parts=_fieldParts(key),cur=obj;
  if(!parts.length)return obj;
  for(var i=0;i<parts.length-1;i++)cur=_ensureContainer(cur,parts[i]);
  cur[parts[parts.length-1]]=_cloneJson(value);
  return obj;
}

function _deleteField(obj,key){
  if(!obj||!key)return obj;
  var parts=_fieldParts(key),cur=obj,stack=[];
  if(!parts.length)return obj;
  for(var i=0;i<parts.length-1;i++){
    if(!_isPlainObject(cur))return obj;
    stack.push([cur,parts[i]]);
    cur=cur[parts[i]];
    if(cur==null)return obj;
  }
  if(cur&&typeof cur==='object')delete cur[parts[parts.length-1]];
  for(var j=stack.length-1;j>=0;j--){
    var parent=stack[j][0],part=stack[j][1],node=parent[part];
    if(_isPlainObject(node)&&!Object.keys(node).length)delete parent[part];
    else break;
  }
  return obj;
}

function _deepMergeInto(target,src){
  if(!_isPlainObject(src))return _cloneJson(src);
  Object.keys(src).forEach(function(k){
    var sv=src[k];
    if(_isPlainObject(sv)){
      if(!_isPlainObject(target[k]))target[k]={};
      _deepMergeInto(target[k],sv);
    }else{
      target[k]=_cloneJson(sv);
    }
  });
  return target;
}

function _applyPlainWrites(target,plain,merge){
  (plain||[]).forEach(function(item){
    var path=item.path,val=item.value;
    if(path.indexOf('.')>=0){
      _setField(target,path,val);
      return;
    }
    if(merge&&_isPlainObject(val)){
      if(!_isPlainObject(target[path]))target[path]={};
      _deepMergeInto(target[path],val);
      return;
    }
    _setField(target,path,val);
  });
  return target;
}

function _applyArrayUnion(target,path,values){
  var arr=_readField(target,path);
  arr=Array.isArray(arr)?arr.slice():[];
  (values||[]).forEach(function(v){
    var exists=arr.some(function(x){return JSON.stringify(x)===JSON.stringify(v);});
    if(!exists)arr.push(_cloneJson(v));
  });
  _setField(target,path,arr);
}

function _applyArrayRemove(target,path,values){
  var arr=_readField(target,path);
  arr=Array.isArray(arr)?arr.slice():[];
  arr=arr.filter(function(x){
    return !(values||[]).some(function(v){return JSON.stringify(v)===JSON.stringify(x);});
  });
  _setField(target,path,arr);
}

function _applyIncrement(target,path,delta){
  var cur=Number(_readField(target,path));
  if(!isFinite(cur))cur=0;
  _setField(target,path,cur+(Number(delta)||0));
}

function _readField(obj,key){
  if(!obj||!key)return undefined;
  var cur=obj,parts=_fieldParts(key);
  for(var i=0;i<parts.length;i++){
    if(cur==null)return undefined;
    cur=cur[parts[i]];
  }
  return cur;
}

function _cmpVal(a,b){
  if(a===b)return 0;
  if(a===undefined||a===null)return -1;
  if(b===undefined||b===null)return 1;
  if(typeof a==='number'&&typeof b==='number')return a-b;
  return String(a).localeCompare(String(b),'pt-BR',{numeric:true,sensitivity:'base'});
}

function _applyQueryRows(rows,q){
  q=q||{};
  var out=(rows||[]).slice();
  (q.filters||[]).forEach(function(f){
    out=out.filter(function(r){
      var src=(r&&r.data)||{};
      var v=_readField(src,f.field);
      if(f.op==='array-contains')return Array.isArray(v)&&v.indexOf(f.value)>=0;
      if(f.op==='=='||f.op==='=')return JSON.stringify(v)===JSON.stringify(f.value);
      if(f.op==='!=')return JSON.stringify(v)!==JSON.stringify(f.value);
      return true;
    });
  });
  if(q.orderBy&&q.orderBy.field){
    var field=q.orderBy.field,desc=String(q.orderBy.dir||'asc').toLowerCase()==='desc';
    out.sort(function(a,b){
      var av=_readField((a&&a.data)||{},field),bv=_readField((b&&b.data)||{},field);
      var c=_cmpVal(av,bv);
      return desc?-c:c;
    });
  }
  if(q.limit>0)out=out.slice(0,q.limit);
  return out;
}

  storage.runtime = storage.runtime || {};
  storage.runtime._cloneJson = _cloneJson;
  storage.runtime._isPlainObject = _isPlainObject;
  storage.runtime._fieldParts = _fieldParts;
  storage.runtime._splitFieldOps = _splitFieldOps;
  storage.runtime._ensureContainer = _ensureContainer;
  storage.runtime._setField = _setField;
  storage.runtime._deleteField = _deleteField;
  storage.runtime._deepMergeInto = _deepMergeInto;
  storage.runtime._applyPlainWrites = _applyPlainWrites;
  storage.runtime._applyArrayUnion = _applyArrayUnion;
  storage.runtime._applyArrayRemove = _applyArrayRemove;
  storage.runtime._applyIncrement = _applyIncrement;
  storage.runtime._readField = _readField;
  storage.runtime._cmpVal = _cmpVal;
  storage.runtime._applyQueryRows = _applyQueryRows;

  /* R14-17: expor funções ao escopo global */
  if(typeof _cloneJson === 'function') global._cloneJson = _cloneJson;
  if(typeof _isPlainObject === 'function') global._isPlainObject = _isPlainObject;
  if(typeof _fieldParts === 'function') global._fieldParts = _fieldParts;
  if(typeof _splitFieldOps === 'function') global._splitFieldOps = _splitFieldOps;
  if(typeof _ensureContainer === 'function') global._ensureContainer = _ensureContainer;
  if(typeof _setField === 'function') global._setField = _setField;
  if(typeof _deleteField === 'function') global._deleteField = _deleteField;
  if(typeof _deepMergeInto === 'function') global._deepMergeInto = _deepMergeInto;
  if(typeof _applyPlainWrites === 'function') global._applyPlainWrites = _applyPlainWrites;
  if(typeof _applyArrayUnion === 'function') global._applyArrayUnion = _applyArrayUnion;
  if(typeof _applyArrayRemove === 'function') global._applyArrayRemove = _applyArrayRemove;
  if(typeof _applyIncrement === 'function') global._applyIncrement = _applyIncrement;
  if(typeof _readField === 'function') global._readField = _readField;
  if(typeof _cmpVal === 'function') global._cmpVal = _cmpVal;
  if(typeof _applyQueryRows === 'function') global._applyQueryRows = _applyQueryRows;

})(window);
