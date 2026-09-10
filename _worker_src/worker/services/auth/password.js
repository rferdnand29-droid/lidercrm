// =====================================================================
// password.js — Password hashing & verification
// ---------------------------------------------------------------------
// CORREÇÃO (CERT-01): Substituído SHA-256 por PBKDF2 (Web Crypto API).
//   SHA-256 é uma hash rápida, inadequada para senhas — um atacante com
//   a hash pode testar bilhões de candidatos por segundo. PBKDF2 com
//   210k iterações e SHA-256 como PRF é a recomendação OWASP 2023+.
// CORREÇÃO (CERT-02): Removida a comparação de senha em texto puro
//   (plain === password). Usuários legados com senha em texto plano
//   devem redefinir a senha no próximo login.
// CORREÇÃO (2026-07-22 login-fix):
//   • verifyLegacyPassword agora nunca lança — qualquer exceção do
//     Web Crypto (chave inválida, salt hex malformado) vira `false`.
//     Antes, um `ph` corrompido no fs_documents fazia crypto.subtle.
//     deriveBits() rejeitar → exceção vazava até o api-handler → 500
//     opaco no /api/v1/login em vez de 401.
//   • hexToBuf agora valida entrada — hex ímpar/inválido vira erro
//     capturado no verify, não DOMException.
// CORREÇÃO (2026-07-27 iter-cap):
//   • Bug raiz de "Hudson não consegue logar": hashes pbkdf2$ armazenadas
//     com 210000 iterações (geradas em build anterior) eram passadas
//     crus para crypto.subtle.deriveBits. O runtime Cloudflare Workers
//     (workerd) tem cap PÚBLICO de 100000 iterações em PBKDF2
//     (https://github.com/cloudflare/workerd/issues/1346). A exceção
//     DOMException era silenciosamente engolida pelo try/catch deste
//     arquivo, virando 401 "Senha inválida" mesmo com hash/senha
//     corretas.
//   • Correção: adicionada constante PBKDF2_MAX_ITERATIONS (cap do
//     workerd) e classe tipada HashIterCapExceededError. Antes de chamar
//     deriveBits, o código compara storedIters contra o cap — se passar,
//     lança erro tipado em vez de chamar deriveBits. O login-service.js
//     captura esse erro, marca o usuário como needs_password_reset no
//     banco (best-effort) e devolve 401 tipado (code = hash_iter_cap_exceeded)
//     em vezdo 401 genérico.
//   • Iterações continuam sendo LIDAS do próprio hash armazenado (não
//     hardcoded) — isso preserva compatibilidade com hashes geradas em
//     qualquer número de iterações (incluindo migrações futuras).
// =====================================================================

const PBKDF2_ITERATIONS = 100000;
// Cap público do runtime Cloudflare Workers (workerd) para PBKDF2.
// Fonte oficial: https://github.com/cloudflare/workerd/issues/1346
const PBKDF2_MAX_ITERATIONS = 100000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const PBKDF2_HASH = 'SHA-256';

// Erro tipado: hash armazenada com iter > cap do runtime Cloudflare.
// Antes isso era silenciosamente engolido pelo try/catch do verify,
// transformando hash válida em 401 opaco (era a causa do "não consigo
// logar" para hashes geradas com PBKDF2_ITERATIONS em build anterior).
export class HashIterCapExceededError extends Error {
  constructor(email, storedIters, cap) {
    super('hash_iter_cap_exceeded: stored=' + storedIters +
          ' cap=' + cap +
          ' email=' + (email || '(unknown)'));
    this.name = 'HashIterCapExceededError';
    this.code = 'hash_iter_cap_exceeded';
    this.email = email || null;
    this.storedIters = storedIters;
    this.cap = cap;
  }
}

function bufToHex(buf) {
  const arr = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
  return hex;
}

function hexToBuf(hex) {
  const clean = String(hex || '');
  if (!clean || (clean.length % 2) !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error('invalid_hex');
  }
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.substr(i * 2, 2), 16);
  return arr.buffer;
}

// pbkdf2Derive: wrapper simples de pbkdf2DeriveWithIters usando o nº
// padrão de iterações. Eliminada a implementação duplicada — antes
// existiam dois corpos idênticos em funções diferentes; agora delegamos.
async function pbkdf2Derive(saltHex, password) {
  return pbkdf2DeriveWithIters(saltHex, password, PBKDF2_ITERATIONS);
}

export function djb2Base36(input) {
  let h = 5381;
  const value = String(input || '');
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h) ^ value.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export async function verifyLegacyPassword(userRecord, password) {
  try {
    const ph = (userRecord && userRecord.ph) || '';
    if (!password || !ph) return false;

    // Formato s2$ — SHA-256 com salt (legado). Ainda aceito para login,
    // mas ao trocar senha a nova hash será pbkdf2$.
    if (ph.indexOf('s2$') === 0) {
      const parts = ph.split('$');
      if (parts.length !== 3) return false;
      const saltHex = parts[1];
      const hashHex = parts[2];
      // Verifica com SHA-256 (legado)
      const { sha256Hex } = await import('../../utils/crypto.js');
      const computed = await sha256Hex(saltHex + ':' + password);
      return computed === hashHex;
    }

    // Formato pbkdf2$ — novo padrão seguro
    if (ph.indexOf('pbkdf2$') === 0) {
      const parts = ph.split('$');
      if (parts.length !== 4) return false;
      // CORREÇÃO (2026-07-27): iters SEMPRE vem do próprio ph armazenado
      // (parte 1 do split) — NUNCA hardcodar, senão hashes geradas em
      // qualquer número de iterações futura ficam inacessíveis para
      // verificação (o hash armazenado carrega a "receita" do KDF).
      const storedIters = parseInt(parts[1], 10);
      // Sanidade: NaN / negativo / abaixo do mínimo absoluto.
      if (!Number.isFinite(storedIters) || storedIters < 1000) return false;
      // Cap do runtime Cloudflare — checado ANTES de chamar deriveBits.
      // Caso contrário, workerd joga DOMException que o catch abaixo
      // transformava em 401 "Senha inválida" mesmo com hash válida.
      if (storedIters > PBKDF2_MAX_ITERATIONS) {
        throw new HashIterCapExceededError(
          userRecord && userRecord.email, storedIters, PBKDF2_MAX_ITERATIONS
        );
      }
      const saltHex = parts[2];
      const hashHex = parts[3];
      const computed = await pbkdf2DeriveWithIters(saltHex, password, storedIters);
      return computed === hashHex;
    }

    // djb2 — hash muito fraca legada (apenas comparação, sem texto plano)
    if (ph && ph.indexOf('s2$') !== 0 && ph.indexOf('pbkdf2$') !== 0) {
      return djb2Base36(password) === ph;
    }

    // CERT-02: Removida comparação de texto puro.
    // Usuários sem hash válida devem redefinir senha via ADM.
    return false;
  } catch (err) {
    // Erro tipado (hash acima do cap) PROPAGA para o login-service —
    // ele trata marcando o usuário como needs_password_reset e
    // devolvendo 401 tipado em vez de 401 opaco.
    if (err instanceof HashIterCapExceededError) throw err;
    // login-fix: demais exceções (corrompido, hex malformado) viram
    // `false` — segurança contra vazar exceção bruta ao cliente.
    return false;
  }
}

async function pbkdf2DeriveWithIters(saltHex, password, iters) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: hexToBuf(saltHex),
      iterations: iters,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    PBKDF2_KEY_LENGTH * 8
  );
  return bufToHex(bits);
}

export function randomSaltHex() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  let hex = '';
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
  return hex;
}

// Nova hash usa PBKDF2 — formato: pbkdf2$<iters>$<salt>$<hash>
export async function hashPasswordS2(password) {
  const saltHex = randomSaltHex();
  const hashHex = await pbkdf2Derive(saltHex, password);
  return 'pbkdf2$' + PBKDF2_ITERATIONS + '$' + saltHex + '$' + hashHex;
}
