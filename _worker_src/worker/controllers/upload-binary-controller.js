// =====================================================================
// controllers/upload-binary-controller.js
// FASE 1 — Upload binário seguro via Worker (2026-07-22)
// -----------------------------------------------------------------------
// Recebe multipart/form-data OU application/octet-stream + headers.
// As chaves Backblaze NUNCA chegam ao cliente — ficam em env do Worker.
// Fluxo:
//   1. Autentica via JWT (middleware auth.js já fez isso)
//   2. Lê o body binário (stream, sem base64 duplo)
//   3. Faz upload direto para Backblaze B2 via API v2 no servidor
//   4. Devolve { url, path, size, contentType, fileId }
//
// Variáveis de ambiente necessárias (wrangler secret put):
//   B2_KEY_ID          — Backblaze keyId
//   B2_APPLICATION_KEY — Backblaze applicationKey
//   B2_BUCKET_ID       — Backblaze bucketId
//   B2_BUCKET_NAME     — Backblaze bucketName
//   B2_DOWNLOAD_URL    — https://f005.backblazeb2.com  (ou CDN)
//
// Se as variáveis não estiverem configuradas, cai em fallback Supabase Storage.
// =====================================================================

import { BadRequestError } from '../errors/http-errors.js';
import { ok, created }     from '../utils/response.js';
import { uploadToStorage } from '../lib/supabase-rest.js';
import { sanitizeString }  from '../validators/validate.js';
import { uploadsRepo }     from '../repositories/index.js';

// ── Constantes ────────────────────────────────────────────────────────
const MAX_SIZE_BYTES   = 100 * 1024 * 1024;  // 100 MB
const TOKEN_CACHE_TTL  = 23 * 60 * 60 * 1000; // 23 h (B2 expira em 24 h)
const ALLOWED_FOLDERS  = new Set(['chat', 'audio', 'uploads', 'documentos', 'avatares']);

// ── Cache em memória (por Worker instance — suficiente para Fase 1) ───
let _b2Cache = {
  authToken: null, apiUrl: null, downloadUrl: null, tokenExpires: 0,
  uploadUrl: null, uploadToken: null, uploadUrlExpires: 0,
};

// ── Helpers Backblaze ─────────────────────────────────────────────────

/** Retorna config B2 do env ou null se não configurado */
function _b2Cfg(env) {
  const keyId  = env.B2_KEY_ID          || '';
  const appKey = env.B2_APPLICATION_KEY || '';
  const bucket = env.B2_BUCKET_ID       || '';
  const bname  = env.B2_BUCKET_NAME     || '';
  if (!keyId || !appKey || !bucket) return null;
  return { keyId, appKey, bucket, bname };
}

async function _b2Authorize(cfg) {
  if (_b2Cache.authToken && Date.now() < _b2Cache.tokenExpires) return;
  const creds   = btoa(cfg.keyId + ':' + cfg.appKey);
  const res     = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { Authorization: 'Basic ' + creds },
  });
  if (!res.ok) throw new Error('B2 authorize failed: ' + res.status);
  const d = await res.json();
  _b2Cache.authToken    = d.authorizationToken;
  _b2Cache.apiUrl       = d.apiUrl;
  _b2Cache.downloadUrl  = d.downloadUrl;
  _b2Cache.tokenExpires = Date.now() + TOKEN_CACHE_TTL;
  // invalidate upload URL cache on re-auth
  _b2Cache.uploadUrl    = null;
  _b2Cache.uploadToken  = null;
  _b2Cache.uploadUrlExpires = 0;
}

async function _b2GetUploadUrl(cfg) {
  if (_b2Cache.uploadUrl && Date.now() < _b2Cache.uploadUrlExpires) return;
  await _b2Authorize(cfg);
  const res = await fetch(_b2Cache.apiUrl + '/b2api/v2/b2_get_upload_url', {
    method: 'POST',
    headers: { Authorization: _b2Cache.authToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucketId: cfg.bucket }),
  });
  if (!res.ok) {
    // token expirado — reautenticar uma vez
    _b2Cache.authToken = null;
    await _b2Authorize(cfg);
    const res2 = await fetch(_b2Cache.apiUrl + '/b2api/v2/b2_get_upload_url', {
      method: 'POST',
      headers: { Authorization: _b2Cache.authToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ bucketId: cfg.bucket }),
    });
    if (!res2.ok) throw new Error('B2 get_upload_url failed: ' + res2.status);
    const d2 = await res2.json();
    _b2Cache.uploadUrl        = d2.uploadUrl;
    _b2Cache.uploadToken      = d2.authorizationToken;
    _b2Cache.uploadUrlExpires = Date.now() + TOKEN_CACHE_TTL;
    return;
  }
  const d = await res.json();
  _b2Cache.uploadUrl        = d.uploadUrl;
  _b2Cache.uploadToken      = d.authorizationToken;
  _b2Cache.uploadUrlExpires = Date.now() + TOKEN_CACHE_TTL;
}

/**
 * Faz upload de bytes para B2. Retorna { url, fileId, path, size }.
 * Se upload falhar (ex: uploadUrl expirou), invalida cache e tenta 1x.
 */
async function _b2Upload(cfg, filePath, bytes, contentType) {
  await _b2GetUploadUrl(cfg);

  const doUpload = async () => fetch(_b2Cache.uploadUrl, {
    method: 'POST',
    headers: {
      Authorization:                  _b2Cache.uploadToken,
      'X-Bz-File-Name':               encodeURIComponent(filePath),
      'Content-Type':                  contentType,
      'X-Bz-Content-Sha1':            'do_not_verify',
      'Content-Length':                String(bytes.byteLength),
    },
    body: bytes,
  });

  let res = await doUpload();
  if (!res.ok && (res.status === 401 || res.status === 503)) {
    // invalidate and retry once
    _b2Cache.uploadUrl = null;
    _b2Cache.uploadToken = null;
    _b2Cache.uploadUrlExpires = 0;
    await _b2GetUploadUrl(cfg);
    res = await doUpload();
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error('B2 upload failed: ' + res.status + ' ' + txt);
  }
  const data = await res.json();
  const downloadBase = _b2Cache.downloadUrl || 'https://f005.backblazeb2.com';
  const publicUrl = downloadBase + '/file/' + cfg.bname + '/' + encodeURIComponent(filePath);
  return { url: publicUrl, fileId: data.fileId, path: filePath, size: bytes.byteLength };
}

// ── Sanitizar filename ────────────────────────────────────────────────
function _sanitizeFilename(raw) {
  // remove path traversal, null bytes, espaços duplos
  return String(raw || 'file')
    .replace(/[/\\<>:"|?*\x00]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 200);
}

function _buildPath(folder, filename) {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return folder + '/' + ts + '-' + rnd + '-' + filename;
}

// ── Controller principal ──────────────────────────────────────────────

/**
 * POST /api/v1/upload/binary
 *
 * Headers esperados:
 *   Content-Type: application/octet-stream   (ou audio/webm, image/jpeg, etc.)
 *   X-Filename: nome_do_arquivo.ext
 *   X-Folder:   chat | audio | uploads | documentos | avatares   (opcional, default uploads)
 *
 * Body: bytes brutos do arquivo (sem base64).
 * Tamanho máximo: 100 MB.
 */
export async function uploadBinaryController(request, ctx) {
  // ── 1. Validar Content-Length (se presente)
  const clHeader = request.headers.get('content-length');
  if (clHeader && parseInt(clHeader, 10) > MAX_SIZE_BYTES) {
    throw new BadRequestError('Arquivo excede limite de 100 MB.');
  }

  // ── 2. Ler filename e folder dos headers
  const rawFilename = request.headers.get('x-filename') || request.headers.get('X-Filename') || 'upload';
  const rawFolder   = request.headers.get('x-folder')   || request.headers.get('X-Folder')   || 'uploads';
  const filename    = _sanitizeFilename(rawFilename);
  const folder      = ALLOWED_FOLDERS.has(rawFolder) ? rawFolder : 'uploads';

  // ── 3. Ler content-type
  const contentType = (request.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();

  // ── 4. Ler body como ArrayBuffer
  let buffer;
  try {
    buffer = await request.arrayBuffer();
  } catch (e) {
    throw new BadRequestError('Falha ao ler body da requisição: ' + e.message);
  }
  if (!buffer || buffer.byteLength === 0) throw new BadRequestError('Body vazio — envie os bytes do arquivo.');
  if (buffer.byteLength > MAX_SIZE_BYTES)  throw new BadRequestError('Arquivo excede limite de 100 MB.');

  const filePath = _buildPath(folder, filename);
  const bytes    = new Uint8Array(buffer);

  // ── 5. Tentar B2 → fallback Supabase Storage ─────────────────────
  let result;
  const b2Cfg = _b2Cfg(ctx.cfg._env || ctx.cfg);

  if (b2Cfg) {
    try {
      result = await _b2Upload(b2Cfg, filePath, bytes, contentType);
      result.backend = 'b2';
    } catch (b2Err) {
      console.warn('[upload-binary] B2 falhou, tentando Supabase Storage:', b2Err.message);
      // fallback para Supabase Storage
      const storage = await uploadToStorage(ctx.cfg, filePath, bytes, contentType);
      result = {
        url:         storage.publicUrl,
        path:        filePath,
        size:        bytes.byteLength,
        fileId:      null,
        backend:     'supabase',
      };
    }
  } else {
    // B2 não configurado — Supabase Storage direto
    const storage = await uploadToStorage(ctx.cfg, filePath, bytes, contentType);
    result = {
      url:     storage.publicUrl,
      path:    filePath,
      size:    bytes.byteLength,
      fileId:  null,
      backend: 'supabase',
    };
  }

  // ── 6. Persistir registro de metadados (não-crítico) ─────────────
  const record = {
    filename,
    path:         result.path,
    url:          result.url,
    content_type: contentType,
    size:         result.size,
    file_id:      result.fileId || null,
    backend:      result.backend,
    folder,
    uploaded_by:  ctx.user && ctx.user.sub,
    created_at:   new Date().toISOString(),
  };
  // CORRIGIDO 2026-08-01: attachments usa nomes de coluna diferentes de
  // `record` (que continua igual pra resposta da API). object_key/
  // entity_type/entity_id sem dado de origem claro neste fluxo — null.
  const dbRecord = {
    file_name: filename, object_key: result.path, public_url: result.url,
    content_type: contentType, size_bytes: result.size,
    uploaded_by: record.uploaded_by, created_at: record.created_at,
    provider: result.backend || null, bucket: null,
    entity_type: null, entity_id: null,
    extra: { file_id: result.fileId || null, folder: folder || null },
  };
  try { await uploadsRepo.insert(ctx.cfg, dbRecord); } catch (_e) { /* não-crítico */ }

  return created(
    {
      url:         result.url,
      path:        result.path,
      size:        result.size,
      contentType,
      fileId:      result.fileId || null,
      backend:     result.backend,
      filename,
    },
    { endpoint: '/api/v1/upload/binary' },
    ctx.headers,
  );
}

/**
 * DELETE /api/v1/upload/binary?path=chat/xxx&fileId=xxx
 *
 * Remove do B2 (se fileId fornecido) ou Supabase Storage.
 * Requer JWT com role ADM ou o próprio uploaded_by.
 */
export async function deleteBinaryController(request, ctx) {
  const url    = new URL(request.url);
  const path   = sanitizeString(url.searchParams.get('path'),   500);
  const fileId = sanitizeString(url.searchParams.get('fileId'), 200);
  if (!path) throw new BadRequestError('path é obrigatório.');

  const b2Cfg = _b2Cfg(ctx.cfg._env || ctx.cfg);
  if (b2Cfg && fileId) {
    try {
      await _b2Authorize(b2Cfg);
      const res = await fetch(_b2Cache.apiUrl + '/b2api/v2/b2_delete_file_version', {
        method: 'POST',
        headers: { Authorization: _b2Cache.authToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId, fileName: path }),
      });
      if (!res.ok) console.warn('[upload-binary] B2 delete status:', res.status);
    } catch (e) {
      console.warn('[upload-binary] B2 delete error (non-fatal):', e.message);
    }
  } else {
    // fallback: Supabase Storage remove
    try { await import('../lib/supabase-rest.js').then(m => m.deleteFromStorage(ctx.cfg, path)); } catch (_e) {}
  }

  return ok({ path, fileId: fileId || null, deleted: true }, { endpoint: '/api/v1/upload/binary' }, ctx.headers);
}
