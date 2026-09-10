// =====================================================================
// tests/login-iter-cap-fallback.test.js
// -----------------------------------------------------------------------
// Regressão do bug crítico relatado: "usuário criado, depois de um
// deploy a senha passou a dar 'incorreta', e nem resetar a senha pelo
// ADM resolvia."
//
// Causa raiz: quando o hash relacional (public.users) tem um número de
// iterações PBKDF2 acima do cap do runtime Cloudflare Workers (ex.:
// gerado numa build anterior à correção do cap), verifyLegacyPassword
// lança HashIterCapExceededError. loginService relançava esse erro NA
// HORA, encerrando a função inteira — nunca chegava a checar
// fs_documents, mesmo que fs_documents tivesse a senha certa (ex.:
// acabou de ser redefinida por um ADM, que grava nos dois lugares).
//
// Este teste garante que, daqui pra frente, um hash relacional acima
// do cap SEMPRE dá ao fs_documents uma chance real de resolver o
// login antes de desistir.
// =====================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const relUpdateLastLogin = vi.fn(() => Promise.resolve());
const relFindUserByEmail = vi.fn();
const relationalToLegacy = vi.fn((row, roleSlug) => ({ ...row, role: roleSlug }));
const selectFrom = vi.fn(() => Promise.resolve({ rows: [] }));
const signInWithPassword = vi.fn(() => Promise.reject(new Error('supabase indisponível no teste')));
const loadLegacyUsers = vi.fn();
const findLegacyUserByEmail = vi.fn();
const markUserNeedsPasswordReset = vi.fn(() => Promise.resolve());
const issueToken = vi.fn((cfg, payload) => Promise.resolve('TOKEN:' + JSON.stringify(payload)));
const buildJwtPayloadFromLegacy = vi.fn((user) => ({ sub: user.id || user.legacy_id, email: user.email }));
const buildJwtPayloadFromSupabase = vi.fn((auth, email) => ({ sub: 'supabase', email }));

vi.mock('../_worker_src/worker/lib/supabase-rest.js', () => ({
  signInWithPassword: (...a) => signInWithPassword(...a),
  selectFrom: (...a) => selectFrom(...a),
}));
vi.mock('../_worker_src/worker/repositories/users-relational-repository.js', () => ({
  findUserByEmail: (...a) => relFindUserByEmail(...a),
  updateLastLogin: (...a) => relUpdateLastLogin(...a),
  relationalToLegacy: (...a) => relationalToLegacy(...a),
}));
vi.mock('../_worker_src/worker/services/auth/legacy-users.js', () => ({
  loadLegacyUsers: (...a) => loadLegacyUsers(...a),
  findLegacyUserByEmail: (...a) => findLegacyUserByEmail(...a),
}));
vi.mock('../_worker_src/worker/services/auth/iter-cap-recovery.js', () => ({
  markUserNeedsPasswordReset: (...a) => markUserNeedsPasswordReset(...a),
}));
vi.mock('../_worker_src/worker/services/auth/tokens.js', () => ({
  buildJwtPayloadFromLegacy: (...a) => buildJwtPayloadFromLegacy(...a),
  buildJwtPayloadFromSupabase: (...a) => buildJwtPayloadFromSupabase(...a),
  issueToken: (...a) => issueToken(...a),
}));

// verifyLegacyPassword é o único ponto que decide "bateu"/"não bateu"/
// "estourou o cap" — mockado por chamada, controlado em cada teste.
const verifyLegacyPassword = vi.fn();
vi.mock('../_worker_src/worker/services/auth/password.js', async () => {
  const actual = await vi.importActual('../_worker_src/worker/services/auth/password.js');
  return {
    ...actual,
    verifyLegacyPassword: (...a) => verifyLegacyPassword(...a),
  };
});

const { loginService } = await import('../_worker_src/worker/services/auth/login-service.js');
const { HashIterCapExceededError } = await import('../_worker_src/worker/services/auth/password.js');

const cfg = {};

describe('loginService — fallback pro fs_documents quando o relacional estoura o cap de iterações', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cai pro fs_documents e loga com sucesso quando o hash relacional está acima do cap mas o fs_documents tem a senha certa (cenário do bug relatado: ADM resetou e só o legado pegou)', async () => {
    relFindUserByEmail.mockResolvedValue({ id: 'u1', email: 'teste@lider.com', password_hash: 'pbkdf2$210000$aa$bb', role_id: null });
    loadLegacyUsers.mockResolvedValue([{ id: 'u1', email: 'teste@lider.com', ph: 'pbkdf2$100000$cc$dd' }]);
    findLegacyUserByEmail.mockImplementation((users, email) => users.find((u) => u.email === email) || null);

    verifyLegacyPassword.mockImplementation(async (user) => {
      if (user.password_hash === 'pbkdf2$210000$aa$bb' || user.ph === 'pbkdf2$210000$aa$bb') {
        throw new HashIterCapExceededError('teste@lider.com', 210000, 100000);
      }
      // fs_documents (ph = pbkdf2$100000$cc$dd) tem a senha nova, correta
      return true;
    });

    const token = await loginService(cfg, 'teste@lider.com', 'senhaNova123');

    expect(token).toContain('TOKEN:');
    // NÃO pode ter marcado precisar de reset — o login funcionou de verdade
    expect(markUserNeedsPasswordReset).not.toHaveBeenCalled();
  });

  it('só marca needs_password_reset e recusa o login se NENHUM dos dois armazenamentos resolver (relacional acima do cap E fs_documents também falha)', async () => {
    relFindUserByEmail.mockResolvedValue({ id: 'u1', email: 'teste@lider.com', password_hash: 'pbkdf2$210000$aa$bb', role_id: null });
    loadLegacyUsers.mockResolvedValue([{ id: 'u1', email: 'teste@lider.com', ph: 'pbkdf2$210000$aa$bb' }]);
    findLegacyUserByEmail.mockImplementation((users, email) => users.find((u) => u.email === email) || null);

    verifyLegacyPassword.mockImplementation(async () => {
      throw new HashIterCapExceededError('teste@lider.com', 210000, 100000);
    });

    await expect(loginService(cfg, 'teste@lider.com', 'qualquerSenha')).rejects.toThrow(/redefinida por um administrador/);
    expect(markUserNeedsPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('comportamento normal (sem cap estourado) continua igual: senha certa no relacional loga direto, sem tocar no fs_documents', async () => {
    relFindUserByEmail.mockResolvedValue({ id: 'u1', email: 'teste@lider.com', password_hash: 'pbkdf2$100000$aa$bb', role_id: null });
    verifyLegacyPassword.mockResolvedValue(true);

    const token = await loginService(cfg, 'teste@lider.com', 'senhaCorreta');

    expect(token).toContain('TOKEN:');
    expect(loadLegacyUsers).not.toHaveBeenCalled();
  });
});
