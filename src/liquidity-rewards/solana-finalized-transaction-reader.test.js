import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolanaFinalizedTransactionReader } from './solana-finalized-transaction-reader.js';

test('fetches only exact finalized transaction evidence and exposes no transaction capability', async () => {
  /** @type {Array<{ method: string, params: unknown[] }>} */
  const requests = [];
  const reader = createSolanaFinalizedTransactionReader({
    rpcUrl: 'https://rpc.invalid',
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ result: {
        slot: 123,
        blockTime: 1000,
        transaction: { signatures: ['SIG'], message: {} },
        meta: { err: null, preTokenBalances: [], postTokenBalances: [] },
      } }) };
    },
  });
  const result = await reader.readFinalizedTransaction('SIG');
  assert.equal(result.exists, true);
  assert.equal(result.finalized, true);
  assert.equal(result.signature, 'SIG');
  assert.equal(requests[0].method, 'getTransaction');
  assert.deepEqual(requests[0].params, ['SIG', { commitment: 'finalized', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
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

test('rejects empty signatures and RPC errors', async () => {
  const reader = createSolanaFinalizedTransactionReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => ({ ok: true, json: async () => ({ error: { code: -1 } }) }) });
  await assert.rejects(() => reader.readFinalizedTransaction(''), TypeError);
  await assert.rejects(() => reader.readFinalizedTransaction('SIG'), /transaction error/);
});

test('rejects mismatched, absent, or cosigner-only RPC signatures', async () => {
  for (const signatures of [undefined, null, [], ['OTHER'], ['OTHER', 'SIG'], 'SIG', [42]]) {
    const reader = createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid',
      fetchImpl: async () => ({ ok: true, json: async () => ({ result: {
        slot: 123, blockTime: 1000, transaction: { signatures, message: {} }, meta: { err: null },
      } }) }),
    });
    await assert.rejects(() => reader.readFinalizedTransaction('SIG'), /signature mismatch/);
  }
});
