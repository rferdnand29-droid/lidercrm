// =====================================================================
// http-errors.js
// Hierarquia central de erros HTTP para o Worker.
// Fase 2 (2026-07-16) — mantém compatibilidade com o handler global do
// worker.js, que serializa qualquer erro em { ok:false, error:{...} }.
// =====================================================================

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message || code || 'HTTP_ERROR');
    this.name = 'HttpError';
    this.status = status || 500;
    this.code = code || 'HTTP_ERROR';
    if (details !== undefined) this.details = details;
  }
  toJSON() {
    const payload = { code: this.code, message: this.message };
    if (this.details !== undefined) payload.details = this.details;
    return payload;
  }
}

export class BadRequestError extends HttpError {
  constructor(message, details) { super(400, 'BAD_REQUEST', message || 'Requisição inválida.', details); }
}
export class UnauthorizedError extends HttpError {
  constructor(message, details) { super(401, 'UNAUTHORIZED', message || 'Não autenticado.', details); }
}
export class ForbiddenError extends HttpError {
  constructor(message, details) { super(403, 'FORBIDDEN', message || 'Acesso negado.', details); }
}
export class NotFoundError extends HttpError {
  constructor(message, details) { super(404, 'NOT_FOUND', message || 'Recurso não encontrado.', details); }
}
export class ConflictError extends HttpError {
  constructor(message, details) { super(409, 'CONFLICT', message || 'Conflito de estado.', details); }
}
export class ValidationError extends HttpError {
  constructor(message, details) { super(422, 'VALIDATION_ERROR', message || 'Falha de validação.', details); }
}
export class RateLimitedError extends HttpError {
  constructor(message, details) { super(429, 'RATE_LIMITED', message || 'Muitas requisições.', details); }
}
export class UpstreamError extends HttpError {
  constructor(message, details) { super(502, 'UPSTREAM_ERROR', message || 'Falha no upstream.', details); }
}
