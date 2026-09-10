// =====================================================================
// response.js
// Helpers de resposta padronizada para o Worker.
// Todos os endpoints v1 respondem { ok, data|error, meta } — mesma
// estrutura já usada por endpointNotImplemented() no worker.js original.
// =====================================================================

export function json(payload, init = {}, extraHeaders = {}) {
  const headers = new Headers((init && init.headers) || {});
  headers.set('content-type', 'application/json; charset=UTF-8');
  Object.keys(extraHeaders || {}).forEach((k) => headers.set(k, extraHeaders[k]));
  return new Response(JSON.stringify(payload), {
    status: (init && init.status) || 200,
    headers,
  });
}

export function ok(data, meta = {}, extraHeaders = {}) {
  return json({ ok: true, data, meta }, { status: 200 }, extraHeaders);
}

export function created(data, meta = {}, extraHeaders = {}) {
  return json({ ok: true, data, meta }, { status: 201 }, extraHeaders);
}

export function noContent(extraHeaders = {}) {
  const headers = new Headers();
  Object.keys(extraHeaders || {}).forEach((k) => headers.set(k, extraHeaders[k]));
  return new Response(null, { status: 204, headers });
}

export function error(status, code, message, details, extraHeaders = {}) {
  const payload = { ok: false, error: { code, message } };
  if (details !== undefined) payload.error.details = details;
  return json(payload, { status }, extraHeaders);
}

export function fromHttpError(err, extraHeaders = {}) {
  const status = err && err.status ? err.status : 500;
  const code = err && err.code ? err.code : 'WORKER_ERROR';
  const message = err && err.message ? err.message : 'Erro inesperado no Worker.';
  const details = err && err.details;
  return error(status, code, message, details, extraHeaders);
}
