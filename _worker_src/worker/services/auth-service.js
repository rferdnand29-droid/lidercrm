// =====================================================================
// auth-service.js (backend)
// ---------------------------------------------------------------------
// Mantém a API pública original do Worker, mas agora distribui a lógica
// em módulos menores dentro de `src/worker/services/auth/`.
//
// Ganho arquitetural desta rodada:
//   • elimina um arquivo >400 linhas desta camada crítica;
//   • separa login, ponte legada, hashing e troca de senha;
//   • preserva 100% dos imports já usados pelos controllers.
// =====================================================================

export { loginService } from './auth/login-service.js';
export { issueLegacySessionToken, legacyBridgeNonce } from './auth/legacy-bridge-service.js';
export { changePasswordService } from './auth/change-password-service.js';
