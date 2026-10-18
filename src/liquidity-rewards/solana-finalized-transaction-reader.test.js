import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolanaFinalizedTransactionReader } from './solana-finalized-transaction-reader.js';

/** @param {unknown[]} [signatures] */
const finalizedTransaction = (signatures = ['SIG']) => ({
  slot: 123,
  blockTime: 1000,
  transaction: { signatures, message: {} },
  meta: { err: null, preTokenBalances: [], postTokenBalances: [] },
});

const finalizedSignatureStatus = (overrides = {}) => ({
  slot: 123,
  confirmations: null,
  confirmationStatus: 'finalized',
  err: null,
  ...overrides,
});

test('cross-checks exact finalized transaction and signature status evidence without transaction capability', async () => {
  /** @type {Array<{ method: string, params: unknown[] }>} */
  const requests = [];
  const reader = createSolanaFinalizedTransactionReader({
    rpcUrl: 'https://rpc.invalid',
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      if (request.method === 'getTransaction') {
        return { ok: true, json: async () => ({ result: finalizedTransaction() }) };
      }
      if (request.method === 'getSignatureStatuses') {
        return { ok: true, json: async () => ({ result: { value: [finalizedSignatureStatus()] } }) };
      }
      throw new Error(`Unexpected RPC method: ${request.method}`);
    },
  });

  const result = await reader.readFinalizedTransaction('SIG');

  assert.equal(result.exists, true);
  assert.equal(result.finalized, true);
  assert.equal(result.signature, 'SIG');
  assert.deepEqual(requests, [
    {
      method: 'getTransaction',
      params: ['SIG', { commitment: 'finalized', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      jsonrpc: '2.0',
      id: 1,
    },
    {
      method: 'getSignatureStatuses',
      params: [['SIG'], { searchTransactionHistory: true }],
      jsonrpc: '2.0',
      id: 2,
    },
  ]);
  assert.deepEqual(reader.capabilities, { read: true, buildTransaction: false, signTransaction: false, sendTransaction: false });
});

test('fails closed on failed or malformed transaction evidence', async () => {
  const failed = createSolanaFinalizedTransactionReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => ({ ok: true, json: async () => ({ result: { slot: 1, blockTime: 2, transaction: {}, meta: { err: { custom: 1 } } } }) }) });
  await assert.rejects(() => failed.readFinalizedTransaction('SIG'), /transaction failed/);
  const malformed = createSolanaFinalizedTransactionReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => ({ ok: true, json: async () => ({ result: { slot: 0 } }) }) });
  await assert.rejects(() => malformed.readFinalizedTransaction('SIG'), /Malformed/);
});

test('reports missing finalized transaction without inventing contribution facts', async () => {
  const reader = createSolanaFinalizedTransactionReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => ({ ok: true, json: async () => ({ result: null }) }) });
  assert.deepEqual(await reader.readFinalizedTransaction('SIG'), { exists: false, signature: 'SIG' });
});

test('rejects empty signatures and transaction RPC errors', async () => {
  const reader = createSolanaFinalizedTransactionReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => ({ ok: true, json: async () => ({ error: { code: -1 } }) }) });
  await assert.rejects(() => reader.readFinalizedTransaction(''), TypeError);
  await assert.rejects(() => reader.readFinalizedTransaction('SIG'), /getTransaction error/);
});

test('rejects finalized RPC payloads that do not contain the requested signature', async () => {
  for (const signatures of [[], ['OTHER'], [null, 'OTHER']]) {
    const reader = createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid',
      fetchImpl: async () => ({ ok: true, json: async () => ({ result: finalizedTransaction(signatures) }) }),
    });
    await assert.rejects(() => reader.readFinalizedTransaction('SIG'), /signature mismatch/);
  }
});

test('fails closed unless signature status independently confirms the same finalized slot', async () => {
  const invalidStatuses = [
    null,
    finalizedSignatureStatus({ confirmationStatus: 'confirmed', confirmations: 1 }),
    finalizedSignatureStatus({ slot: 124 }),
    finalizedSignatureStatus({ err: { custom: 1 } }),
    finalizedSignatureStatus({ confirmations: 0 }),
  ];

  for (const status of invalidStatuses) {
    const reader = createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid',
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        if (request.method === 'getTransaction') {
          return { ok: true, json: async () => ({ result: finalizedTransaction() }) };
        }
        return { ok: true, json: async () => ({ result: { value: [status] } }) };
      },
    });
    await assert.rejects(() => reader.readFinalizedTransaction('SIG'), /finalized signature status/);
  }
});

test('fails closed on malformed or errored signature status RPC evidence', async () => {
  for (const payload of [
    { result: null },
    { result: { value: [] } },
    { error: { code: -1 } },
  ]) {
    const reader = createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid',
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        if (request.method === 'getTransaction') {
          return { ok: true, json: async () => ({ result: finalizedTransaction() }) };
        }
        return { ok: true, json: async () => payload };
      },
    });
    await assert.rejects(() => reader.readFinalizedTransaction('SIG'), /getSignatureStatuses|finalized signature status/);
  }
});
