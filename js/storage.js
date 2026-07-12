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
