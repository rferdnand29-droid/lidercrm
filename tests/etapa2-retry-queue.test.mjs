import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(root, '..', 'src/core/offline/retry-queue.js'), 'utf8');

function makeStorage() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    clear() { data.clear(); },
  };
}

function loadQueue(storage) {
  const context = {
    console,
    localStorage: storage,
    window: null,
    Date,
    Math,
  };
  context.window = context;
  vm.runInNewContext(source, context);
  return context.LiderCRM.offline.retryQueue;
}

test('fila única mantém itens entre instâncias equivalentes a abas', () => {
  const storage = makeStorage();
  const tabA = loadQueue(storage);
  const tabB = loadQueue(storage);
  const itemA = tabA.enqueue({ method: 'PUT', path: '/kanban/list', body: { list: [] } });
  const itemB = tabB.enqueue({ method: 'PUT', path: '/clientes/list', body: { list: [] } });
  const persisted = JSON.parse(storage.getItem('lidercrm_retry_queue_v1'));
  assert.deepEqual(persisted.map((item) => item.id).sort(), [itemA.id, itemB.id].sort());
});