// =====================================================================
// schemas/index.js
// Schemas de validação por rota. Cada schema é consumido pelo helper
// validate(payload, schema) em validators/validate.js.
// =====================================================================

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN  = /^[0-9a-fA-F-]{8,}$/;

export const loginSchema = {
  email:    { required: true, type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
  password: { required: true, type: 'string', minLength: 4,           maxLength: 200 },
};

// Fase 3.2 — ponte de sessão legada:
// o cliente envia (uid, email, ts, sig) onde `sig` = HMAC-SHA256(JWT_SECRET,
// `${uid}|${email}|${ts}|${ph}`), com `ph` sendo o hash da senha já
// existente no user legado (nunca trafega — o cliente só usa localmente).
export const legacyBridgeSchema = {
  uid:   { required: true, type: 'string', minLength: 1,   maxLength: 200 },
  email: { required: true, type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
  ts:    { required: true, type: 'number' },
  sig:   { required: true, type: 'string', minLength: 32,  maxLength: 128 },
};

export const clienteCreateSchema = {
  nome:      { required: true,  type: 'string', minLength: 1, maxLength: 200 },
  email:     { required: false, type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
  telefone:  { required: false, type: 'string', maxLength: 40 },
  documento: { required: false, type: 'string', maxLength: 40 },
  origem:    { required: false, type: 'string', maxLength: 80 },
  status:    { required: false, type: 'string', maxLength: 40 },
  observacoes:{ required: false, type: 'string', maxLength: 4000 },
  atendente_id: { required: false, type: ['string', 'number'] },
};

export const clienteUpdateSchema = {
  id:        { required: true,  type: ['string', 'number'] },
  nome:      { required: false, type: 'string', minLength: 1, maxLength: 200 },
  email:     { required: false, type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
  telefone:  { required: false, type: 'string', maxLength: 40 },
  status:    { required: false, type: 'string', maxLength: 40 },
  observacoes:{ required: false, type: 'string', maxLength: 4000 },
};

export const leadCreateSchema = {
  nome:      { required: true,  type: 'string', minLength: 1, maxLength: 200 },
  telefone:  { required: false, type: 'string', maxLength: 40 },
  email:     { required: false, type: 'string', pattern: EMAIL_PATTERN, maxLength: 200 },
  origem:    { required: false, type: 'string', maxLength: 80 },
  status:    { required: false, type: 'string', maxLength: 40 },
  interesse: { required: false, type: 'string', maxLength: 200 },
  observacoes:{ required: false, type: 'string', maxLength: 4000 },
  atendente_id: { required: false, type: ['string', 'number'] },
};

export const uploadSchema = {
  filename:    { required: true, type: 'string', minLength: 1, maxLength: 200,
                 pattern: /^[^\/\\\x00]+$/ },
  contentType: { required: false, type: 'string', maxLength: 100 },
  // data em base64 (data URL ou puro)
  data:        { required: true, type: 'string', minLength: 4 },
  folder:      { required: false, type: 'string', maxLength: 200 },
};

export const notificacaoCreateSchema = {
  destinatario_id: { required: true, type: ['string', 'number'] },
  titulo:          { required: true, type: 'string', minLength: 1, maxLength: 200 },
  mensagem:        { required: true, type: 'string', minLength: 1, maxLength: 2000 },
  tipo:            { required: false, type: 'string', maxLength: 40 },
};

// Troca de senha autenticada (Fase 3.5 — pedido de segurança):
// currentPassword é obrigatória SEMPRE (o próprio dono confirmando posse
// da conta) — não existe rota “reset livre”, o Worker recusa qualquer
// tentativa sem currentPassword mesmo pro ADM. targetUserId permite
// que um ADM troque a senha de outro usuário (case "resetei tudo pra
// esse consultor"); se omitido, a troca é aplicada ao próprio usuário
// da sessão JWT.
export const changePasswordSchema = {
  currentPassword: { required: true,  type: 'string', minLength: 1,  maxLength: 200 },
  newPassword:     { required: true,  type: 'string', minLength: 8,  maxLength: 200 },
  targetUserId:    { required: false, type: 'string', minLength: 1,  maxLength: 200 },
};

export const documentoCreateSchema = {
  titulo:      { required: true,  type: 'string', minLength: 1, maxLength: 200 },
  tipo:        { required: false, type: 'string', maxLength: 40 },
  cliente_id:  { required: false, type: ['string', 'number'] },
  storage_path:{ required: false, type: 'string', maxLength: 500 },
  content:     { required: false, type: 'string', maxLength: 200000 },
};

export { EMAIL_PATTERN, UUID_PATTERN };
