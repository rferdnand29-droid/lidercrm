import test from 'node:test';
import assert from 'node:assert/strict';

import {
  documentEtag,
  expectedDocumentVersion,
  normalizeDocumentVersion,
  saveVersionedDocument,
} from '../_worker_src/worker/utils/document-version.js';

test('normaliza If-Match e gera ETag estável', () => {
  assert.equal(normalizeDocumentVersion('W/"v1"'), 'v1');
  assert.equal(normalizeDocumentVersion('"v2"'), 'v2');
  assert.equal(expectedDocumentVersion(
    new Request('https://example.test', { headers: { 'If-Match': 'W/"v3"' } }),
    { version: 'body-version' },
  ), 'v3');
  assert.equal(documentEtag('v3'), 'W/"v3"');
});

test('transforma uma corrida detectada no UPDATE em conflito 409', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(JSON.stringify([{
      path: 'kanban/list/leads/u1',
      parent_path: 'kanban/list/leads',
      data: { list: [{ id: 'lead-1' }] },
      updated_at: 'v1',
    }]), { status: 200 }),
    new Response('[]', { status: 200 }),
    new Response(JSON.stringify([{
      path: 'kanban/list/leads/u1',
      parent_path: 'kanban/list/leads',
      data: { list: [{ id: 'lead-1', nome: 'alterado' }] },
      updated_at: 'v2',
    }]), { status: 200 }),
  ];
  globalThis.fetch = async () => responses.shift();
  try {
    await assert.rejects(
      saveVersionedDocument(
        { SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon' },
        'kanban/list/leads/u1',
        { list: [] },
        { version: 'v1' },
      ),
      (error) => error.status === 409
        && error.code === 'CONFLICT'
        && error.details.serverVersion === 'v2',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});