/* =====================================================================
 * storage.js
 * Gerado automaticamente a partir do index.html monolítico original.
 * Trecho corresponde ao(s) bloco(s) de código original relativos a este
 * módulo, na MESMA ordem relativa em que apareciam no arquivo original
 * (importante: alguns blocos dependem de outros terem sido carregados
 * antes - ver ordem de <script src> no index.html).
 * ===================================================================== */

function sg(k){try{return JSON.parse(localStorage.getItem(k));}catch(e){return null;}}

function ss(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){if(e.name==="QuotaExceededError"||e.code===22||e.code===1014){if(typeof toast==="function")toast("⚠️ Armazenamento local cheio! Exporte seus dados e limpe o cache.",5000);}console.error("ss() falhou para a chave",k,e);return false;}}

// R5: estimativa de uso do localStorage (%)
function sq(){
  try{
    var used=0;
    for(var i=0;i<localStorage.length;i++){
      var k=localStorage.key(i);
      used+=(k.length+(localStorage.getItem(k)||'').length)*2; // UTF-16
    }
    return Math.min(99,Math.round(used/(5*1024*1024)*100)); // assume 5MB
  }catch(e){return -1;}
}

// R5: monitor de storage — loga warning se uso > 80%
function smon(){
  var pct=sq();
  if(pct>=80){console.warn('[storage] localStorage usage high: '+pct+'%');}
  if(pct>=90&&typeof toast==='function'){
    toast('⚠️ Armazenamento local em '+pct+'%. Considere limpar o cache.',4000);
  }
  return pct;
}
