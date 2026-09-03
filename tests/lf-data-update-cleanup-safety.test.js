// @vitest-environment happy-dom
// O pós-update só deve reidratar dados; não deve apagar namespaces de negócio.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(__dirname, '..', rel), 'utf8');
const RECOVERY_SRC = read('js/patches/usuarios-auth/lf-post-update-recovery-v1-20260729.js');
const CLIENTS_SRC = read('_worker_src/worker/controllers/clientes-controller.js');
const CLIENTS_HTTP_SRC = read('src/shared/http/worker-client.js');
const NOTIF_SRC = read('_worker_src/worker/controllers/notificacoes-controller.js');
const NOTIF_SERVICE_SRC = read('src/services/notification-service.js');

describe('segurança dos dados durante update e concorrência', () => {
  it('mantém o cleanup em modo seguro e sem exclusão de dados de negócio', () => {
    expect(RECOVERY_SRC).toContain("var PATCH_APP_VERSION = 'lf_v15_data_safe_20260901';");
    expect(RECOVERY_SRC).toContain('nenhuma chave de domínio pode ser tratada como');
    const cleanup = RECOVERY_SRC.match(/function _shouldDropDerivedCache\(key\)\{([\s\S]*?)\n  \}/);
    expect(cleanup).not.toBeNull();
    expect(cleanup[1]).not.toContain('return true;');
  });

  it('protege também a lista de clientes contra PUT antigo', () => {
    expect(CLIENTS_SRC).toContain('const incomingClientTs = Number(body.clientTs);');
    expect(CLIENTS_SRC).toContain('incomingClientTs < currentClientTs');
    expect(CLIENTS_HTTP_SRC).toContain('saveClientesList: function(uid, list, clientTs)');
  });

  it('protege a inbox de notificações contra PUT antigo', () => {
    expect(NOTIF_SRC).toContain('const incomingClientTs = Number(body && body.clientTs);');
    expect(NOTIF_SRC).toContain('incomingClientTs < currentClientTs');
    expect(NOTIF_SERVICE_SRC).toContain('clientTs: clientTs');
  });
});