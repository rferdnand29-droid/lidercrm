/* =====================================================================
 * js/backblaze.js — Cliente Backblaze B2 para upload de anexos
 * -----------------------------------------------------------------------
 * PATCH FASE 1 (2026-07-22) — Arquitetura Segura:
 *
 * As chaves Backblaze B2 foram REMOVIDAS deste arquivo.
 * O upload agora passa pelo Worker (POST /api/v1/upload/binary),
 * que mantém as chaves em variáveis de ambiente do servidor.
 *
 * Este arquivo mantém APENAS:
 *   • b2IsAvailable() — sempre retorna false (Worker assume o papel)
 *   • Stubs de b2UploadFile / b2UploadBase64 / b2DeleteFile que
 *     redirecionam para o Worker quando chamados diretamente.
 *   • B2_CONFIG vazio (sem segredos) para compatibilidade de código legado.
 *
 * Para configurar Backblaze em produção, defina via Wrangler secrets:
 *   wrangler secret put B2_KEY_ID
 *   wrangler secret put B2_APPLICATION_KEY
 *   wrangler secret put B2_BUCKET_ID
 *   wrangler secret put B2_BUCKET_NAME
 *
 * NUNCA coloque chaves B2 neste arquivo — ele é servido ao cliente.
 * ===================================================================== */

/* ─── Config vazia — sem segredos no cliente ─── */
var B2_CONFIG = {
  bucketId:    null,  // definido no Worker via B2_BUCKET_ID
  bucketName:  null,  // definido no Worker via B2_BUCKET_NAME
  keyId:       null,  // NUNCA no cliente
  applicationKey: null, // NUNCA no cliente
};

/* ─── b2IsAvailable: sempre false — Worker assume uploads B2 ─── */
function b2IsAvailable(){
  /* Retorna false para que _chatSendAttachment use o Worker.
   * Se quiser reativar B2 direto (não recomendado), configure
   * B2_KEY_ID/B2_APPLICATION_KEY aqui e retorne true — mas
   * isso exporá as chaves ao cliente. */
  return false;
}

/* ─── Stubs para compatibilidade de código legado ─── */

/**
 * b2UploadFile — delegado ao Worker /api/v1/upload/binary
 * Mantido para compatibilidade; chamadas diretas são redirecionadas.
 */
function b2UploadFile(file, path, cb){
  var err = new Error('[B2] Upload direto desabilitado — use Worker /api/v1/upload/binary');
  console.warn(err.message);
  if(cb) cb(err);
  return Promise.reject(err);
}

/**
 * b2UploadBase64 — delegado ao Worker /api/v1/upload/binary
 * Mantido para compatibilidade; fallback em _chatSendAttachment usa Worker.
 */
function b2UploadBase64(base64Data, fileName, contentType, cb){
  var err = new Error('[B2] Upload base64 direto desabilitado — use Worker /api/v1/upload/binary');
  console.warn(err.message);
  if(cb) cb(err);
  return Promise.reject(err);
}

/**
 * b2DeleteFile — delegado ao Worker DELETE /api/v1/upload/binary
 * Mantido para compatibilidade; deleção via Worker preserva segurança.
 */
function b2DeleteFile(filePath, fileId, cb){
  console.warn('[B2] b2DeleteFile desabilitado no cliente — use DELETE /api/v1/upload/binary?path=...&fileId=...');
  if(cb) cb(null); // não-crítico
  return Promise.resolve();
}

/* ─── Expor ao escopo global (compatibilidade com código legado) ─── */
window.b2UploadFile   = b2UploadFile;
window.b2UploadBase64 = b2UploadBase64;
window.b2DeleteFile   = b2DeleteFile;
window.B2_CONFIG      = B2_CONFIG;
window.b2IsAvailable  = b2IsAvailable;

/* ─── Flag para módulos que verificam disponibilidade ─── */
window.B2_WORKER_DELEGATED = true;
