// =====================================================================
// validate.js
// Validador leve inspirado em Zod, sem dependência externa. Retorna
// ValidationError (422) com detalhes se a payload não bater.
// =====================================================================

import { ValidationError } from '../errors/http-errors.js';

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function checkField(value, rules, fieldName, errors) {
  if (rules.required && (value === undefined || value === null || value === '')) {
    errors.push({ field: fieldName, code: 'REQUIRED', message: 'Campo obrigatório.' });
    return;
  }
  if (value === undefined || value === null) return;
  if (rules.type) {
    const t = typeOf(value);
    const expected = Array.isArray(rules.type) ? rules.type : [rules.type];
    if (!expected.includes(t)) {
      errors.push({ field: fieldName, code: 'TYPE', message: 'Tipo esperado ' + expected.join('|') + ', recebido ' + t });
      return;
    }
  }
  if (rules.minLength != null && typeof value === 'string' && value.length < rules.minLength) {
    errors.push({ field: fieldName, code: 'MIN_LENGTH', message: 'Mínimo ' + rules.minLength + ' caracteres.' });
  }
  if (rules.maxLength != null && typeof value === 'string' && value.length > rules.maxLength) {
    errors.push({ field: fieldName, code: 'MAX_LENGTH', message: 'Máximo ' + rules.maxLength + ' caracteres.' });
  }
  if (rules.pattern && typeof value === 'string' && !rules.pattern.test(value)) {
    errors.push({ field: fieldName, code: 'PATTERN', message: 'Formato inválido.' });
  }
  if (rules.enum && !rules.enum.includes(value)) {
    errors.push({ field: fieldName, code: 'ENUM', message: 'Valor não permitido.' });
  }
  if (typeof rules.custom === 'function') {
    const msg = rules.custom(value);
    if (msg) errors.push({ field: fieldName, code: 'CUSTOM', message: String(msg) });
  }
}

export function validate(payload, schema) {
  const errors = [];
  const data = payload && typeof payload === 'object' ? payload : {};
  Object.keys(schema || {}).forEach((field) => {
    checkField(data[field], schema[field], field, errors);
  });
  if (errors.length) throw new ValidationError('Payload inválida.', errors);
  return data;
}

// Sanitiza strings (trim + remove chars de controle) — usado nos
// controllers para não persistir lixo no Supabase.
export function sanitizeString(v, maxLength) {
  if (v === null || v === undefined) return v;
  let s = String(v).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (maxLength && s.length > maxLength) s = s.slice(0, maxLength);
  return s;
}

export function sanitizeObject(obj, allowedKeys) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  (allowedKeys || Object.keys(obj)).forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out;
}

// R5: limite de 2 MB no body bruto para evitar exaustão de memória
const MAX_BODY_SIZE = 2 * 1024 * 1024;

export async function readJsonBody(request) {
  const contentType = (request.headers.get('Content-Type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    if (request.method === 'GET' || request.method === 'DELETE') return {};
    throw new ValidationError('Content-Type deve ser application/json.');
  }
  const text = await request.text();
  if (!text) return {};
  if (text.length > MAX_BODY_SIZE) {
    throw new ValidationError('Body excede o limite de 2 MB.');
  }
  try { return JSON.parse(text); }
  catch (_e) { throw new ValidationError('JSON malformado.'); }
}
