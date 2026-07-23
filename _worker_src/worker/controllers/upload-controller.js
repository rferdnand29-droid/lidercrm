import { validate, readJsonBody, sanitizeString } from '../validators/validate.js';
import { uploadSchema } from '../schemas/index.js';
import { uploadToStorage, deleteFromStorage } from '../lib/supabase-rest.js';
import { uploadsRepo } from '../repositories/index.js';
import { created, ok } from '../utils/response.js';
import { BadRequestError } from '../errors/http-errors.js';

function decodeBase64(raw) {
  const match = String(raw).match(/^data:([^;]+);base64,(.+)$/);
  const b64 = match ? match[2] : raw;
  const contentType = match ? match[1] : null;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType };
}

export async function uploadController(request, ctx) {
  const body = await readJsonBody(request);
  const data = validate(body, uploadSchema);
  const filename = sanitizeString(data.filename, 200);
  if (!filename) throw new BadRequestError('filename inválido.');
  const folder = data.folder ? sanitizeString(data.folder, 200).replace(/^\/+|\/+$/g, '') : 'uploads';
  const path = folder + '/' + Date.now().toString(36) + '-' + filename;
  const decoded = decodeBase64(data.data);
  const contentType = data.contentType || decoded.contentType || 'application/octet-stream';
  const storage = await uploadToStorage(ctx.cfg, path, decoded.bytes, contentType);
  const record = {
    filename, path, url: storage.publicUrl, content_type: contentType,
    size: decoded.bytes.length,
    uploaded_by: ctx.user && ctx.user.sub,
    created_at: new Date().toISOString(),
  };
  try { await uploadsRepo.insert(ctx.cfg, record); } catch (_e) { /* opcional */ }
  return created(record, { endpoint: '/api/v1/upload' }, ctx.headers);
}

export async function deleteUploadController(request, ctx) {
  const url = new URL(request.url);
  const path = sanitizeString(url.searchParams.get('path'), 500);
  if (!path) throw new BadRequestError('path é obrigatório.');
  await deleteFromStorage(ctx.cfg, path);
  return ok({ path, deleted: true }, { endpoint: '/api/v1/upload' }, ctx.headers);
}
