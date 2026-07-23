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
// =====================================================================

const PBKDF2_ITERATIONS = 210000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const PBKDF2_HASH = 'SHA-256';

function bufToHex(buf) {
  const arr = new Uint8Array(buf);
  let hex = '';
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, '0');
  return hex;
}

function hexToBuf(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
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
  const ph = (userRecord && userRecord.ph) || '';
  if (!password) return false;

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
    const iters = parseInt(parts[1], 10);
    const saltHex = parts[2];
    const hashHex = parts[3];
    const computed = await pbkdf2DeriveWithIters(saltHex, password, iters || PBKDF2_ITERATIONS);
    return computed === hashHex;
  }

  // djb2 — hash muito fraca legada (apenas comparação, sem texto plano)
  if (ph && ph.indexOf('s2$') !== 0 && ph.indexOf('pbkdf2$') !== 0) {
    return djb2Base36(password) === ph;
  }

  // CERT-02: Removida comparação de texto puro.
  // Usuários sem hash válida devem redefinir senha via ADM.
  return false;
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
