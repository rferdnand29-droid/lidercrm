// =====================================================================
// tests/authz-controller-fixes.test.js
// AUDITORIA-FINAL-10 (2026-08-01) — confirma que os 2 achados de alta
// prioridade aplicados (usuarios: create/bulk sem checagem; settings:
// put/delete sem checagem) realmente NEGAM acesso sem privilégio.
// Testa só o caminho de rejeição (a propriedade de segurança que
// importa: "isto barra quem não deveria passar?"), não o caminho de
// sucesso completo — esse exigiria mockar Supabase/fs_documents, fora
// de proporção para o tamanho desta correção pontual.
// =====================================================================
import { describe, it, expect } from 'vitest';
import { putSettingCtrl, deleteSettingCtrl } from '../_worker_src/worker/controllers/settings-controller.js';
import { createOrUpsertUsuario, bulkUpsertUsuarios } from '../_worker_src/worker/controllers/usuarios-controller.js';
import { putAdmDocumentos } from '../_worker_src/worker/controllers/documentos-controller.js';
import { putAutomationRules } from '../_worker_src/worker/controllers/notificacoes-controller.js';
import { ForbiddenError } from '../_worker_src/worker/errors/http-errors.js';

// Nota: HttpError (classe-mãe) fixa this.name='HttpError' em TODAS as
// subclasses — ForbiddenError não sobrescreve. `instanceof` é o jeito
// correto de checar o tipo aqui (funciona via prototype chain, não
// depende de .name); `.status===403` como segunda confirmação.
function expectForbidden(promise) {
  return expect(promise).rejects.toSatisfy(
    (err) => err instanceof ForbiddenError && err.status === 403,
    'esperava um ForbiddenError (status 403)'
  );
}

function fakeRequest(url, body) {
  return {
    url,
    json: async () => body || {},
  };
}

describe('settings-controller — putSettingCtrl/deleteSettingCtrl exigem adminUI (item confirmado de alta prioridade)', () => {
  it('putSettingCtrl rejeita sem caps.adminUI, antes de tocar no banco', async () => {
    const ctx = { caps: { adminUI: false }, cfg: null, headers: {} };
    const req = fakeRequest('https://x/api/v1/settings?scope=global&key=app.name', { value: 'hackeado' });
    await expectForbidden(putSettingCtrl(req, ctx));
  });

  it('putSettingCtrl rejeita quando ctx.caps nem existe', async () => {
    const ctx = { cfg: null, headers: {} };
    const req = fakeRequest('https://x/api/v1/settings?scope=global&key=app.name', { value: 'x' });
    await expectForbidden(putSettingCtrl(req, ctx));
  });

  it('deleteSettingCtrl rejeita sem caps.adminUI', async () => {
    const ctx = { caps: { adminUI: false }, cfg: null, headers: {} };
    const req = fakeRequest('https://x/api/v1/settings?scope=global&key=app.name');
    await expectForbidden(deleteSettingCtrl(req, ctx));
  });
});

describe('usuarios-controller — createOrUpsertUsuario/bulkUpsertUsuarios exigem admin (escalação de privilégio corrigida)', () => {
  it('createOrUpsertUsuario rejeita quando ctx.user não tem sub (fail-closed)', async () => {
    const ctx = { user: {}, cfg: null, headers: {} };
    const req = fakeRequest('https://x/api/v1/usuarios', { id: 'algum-uid', role: 'master' });
    await expectForbidden(createOrUpsertUsuario(req, ctx));
  });

  it('createOrUpsertUsuario rejeita cargo não-admin no JWT antes de consultar o banco (não trava/lança erro de rede)', async () => {
    // sub existe mas role é 'consultor' — cai no fallback relacional, que
    // vai falhar (cfg:null) e ser capturado pelo try/catch interno de
    // resolveActorPrivilege, resultando em {ok:false} (fail-closed), não
    // numa exceção de rede vazando pro chamador.
    const ctx = { user: { sub: 'user-123', role: 'consultor' }, cfg: {}, headers: {} };
    const req = fakeRequest('https://x/api/v1/usuarios', { id: 'user-123', role: 'master' });
    await expectForbidden(createOrUpsertUsuario(req, ctx));
  });

  it('bulkUpsertUsuarios rejeita quando ctx.user não tem sub', async () => {
    const ctx = { user: {}, cfg: null, headers: {} };
    const req = fakeRequest('https://x/api/v1/usuarios/bulk', { list: [{ id: 'a', role: 'master' }] });
    await expectForbidden(bulkUpsertUsuarios(req, ctx));
  });
});

describe('documentos-controller — putAdmDocumentos exige adminUI (decisão confirmada: gerente pra cima)', () => {
  it('rejeita sem caps.adminUI', async () => {
    const ctx = { caps: { adminUI: false }, cfg: null, headers: {} };
    const req = fakeRequest('https://x/api/v1/documentos/adm', { list: [{ nome: 'contrato-modelo.pdf' }] });
    await expectForbidden(putAdmDocumentos(req, ctx));
  });
});

describe('notificacoes-controller — putAutomationRules exige adminUI (decisão confirmada: gerente pra cima)', () => {
  it('rejeita sem caps.adminUI', async () => {
    const ctx = { caps: { adminUI: false }, cfg: null, headers: {} };
    const req = fakeRequest('https://x/api/v1/notificacoes/rules', { list: [{ board: 'leads', trigger: 'stale_2d', action: 'move_livre' }] });
    await expectForbidden(putAutomationRules(req, ctx));
  });
});
