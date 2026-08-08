// @vitest-environment happy-dom
// =====================================================================
// tests/retry-queue-cross-tab.test.js
// AUDITORIA-FINAL-10 (2026-08-01, item 2.6) — reproduz o cenário exato
// do bug encontrado (duas abas, uma sobrescreve o que a outra gravou) e
// confirma que a correção (_resync antes de mutar) resolve.
//
// Carrega o arquivo-fonte real via eval, não um mock: se alguém mudar
// retry-queue.js de um jeito que reintroduza o bug, este teste falha
// contra o código de produção de verdade, não contra uma cópia.
// =====================================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  path.join(__dirname, '..', 'src', 'core', 'offline', 'retry-queue.js'),
  'utf8'
);

function freshQueueInstance() {
  // Cada chamada reavalia o IIFE contra o `window` do happy-dom deste
  // teste, criando uma instância nova — equivalente a "abrir uma aba nova".
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
  return window.LiderCRM.offline.retryQueue;
}

describe('RetryQueue — correção de perda de item entre abas (item 2.6)', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.LiderCRM;
  });

  it('sem a correção o bug seria: 2ª aba perde o item da 1ª — com a correção, os dois sobrevivem', () => {
    // As duas abas abrem ANTES de qualquer enqueue — cada uma carrega o
    // mesmo estado inicial (vazio) no construtor. Isso é o que faz o bug
    // original acontecer: o cache em memória de cada instância fica
    // desatualizado assim que a OUTRA grava, não só "se a instância for
    // criada antes". Se tabB fosse criada DEPOIS do enqueue de tabA, o
    // próprio construtor já pegaria o estado atualizado e o teste passaria
    // mesmo sem a correção — não provaria nada.
    const tabA = freshQueueInstance();
    const tabB = freshQueueInstance();

    const itemA = tabA.enqueue({ method: 'POST', path: '/api/v1/leads', body: { nome: 'A' } });
    // Neste ponto, sem a correção, tabB.items ainda seria [] (o valor lido
    // no construtor, antes do enqueue da tabA) — o enqueue abaixo, sem
    // _resync(), sobrescreveria o localStorage com só [itemB], perdendo itemA.
    const itemB = tabB.enqueue({ method: 'POST', path: '/api/v1/leads', body: { nome: 'B' } });

    // A prova real: o localStorage final tem os DOIS itens, não só o
    // último a escrever.
    const finalRaw = JSON.parse(localStorage.getItem('lidercrm_retry_queue_v1'));
    const ids = finalRaw.map((i) => i.id).sort();
    expect(ids).toEqual([itemA.id, itemB.id].sort());
  });

  it('remove() na aba B não ressuscita um item que a aba A já tinha removido', () => {
    const tabA = freshQueueInstance();
    const tabB = freshQueueInstance();
    const item1 = tabA.enqueue({ method: 'GET', path: '/x' });
    const item2 = tabB.enqueue({ method: 'GET', path: '/y' }); // tabB só sabe do item1 via resync

    // Aba A remove o item 1 (precisa de resync pra saber do item2 também).
    tabA.remove(item1.id);
    const afterRemove = JSON.parse(localStorage.getItem('lidercrm_retry_queue_v1'));
    expect(afterRemove.map((i) => i.id)).toEqual([item2.id]);
  });

  it('due() enxerga itens enfileirados por outra aba depois que esta instância foi criada', () => {
    const tabA = freshQueueInstance();
    const tabB = freshQueueInstance();
    tabB.enqueue({ method: 'GET', path: '/z', nextAt: Date.now() - 1000 }); // já vencido

    // tabA nunca chamou enqueue, mas due() deve ver o item que tabB gravou
    // (exige reler do storage, não só filtrar o array vazio do construtor).
    expect(tabA.due()).toHaveLength(1);
  });
});
