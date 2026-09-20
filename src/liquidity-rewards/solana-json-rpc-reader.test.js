import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolanaJsonRpcAccountReader } from './solana-json-rpc-reader.js';

const POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';

test('uses only finalized getAccountInfo and exposes no transaction capability', async () => {
  /** @type {Record<string, unknown>[]} */
  const requests = [];
  const reader = createSolanaJsonRpcAccountReader({
    rpcUrl: 'https://rpc.invalid',
    fetchImpl: async (_url, init) => {
      assert.equal(typeof init.body, 'string');
      requests.push(JSON.parse(/** @type {string} */ (init.body)));
      return { ok: true, json: async () => ({ result: { context: { slot: 123 }, value: { owner: 'RAYDIUM_PROGRAM_TEST_ONLY', data: ['AQID', 'base64'], lamports: 1, executable: false, rentEpoch: 0 } } }) };
    },
  });

  const result = await reader.readRawAccount(POOL);
  assert.equal(requests[0].method, 'getAccountInfo');
  assert.deepEqual(requests[0].params, [POOL, { encoding: 'base64', commitment: 'finalized' }]);
  assert.equal(result.exists, true);
  assert.equal(result.exists, true);
  assert.equal(result.owner, 'RAYDIUM_PROGRAM_TEST_ONLY');
  assert.equal(result.contextSlot, 123);
  assert.deepEqual(reader.capabilities, { read: true, buildTransaction: false, signTransaction: false, sendTransaction: false });
});

test('returns a non-existing observation when RPC account value is null', async () => {
  const reader = createSolanaJsonRpcAccountReader({
    rpcUrl: 'https://rpc.invalid',
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: { context: { slot: 124 }, value: null } }) }),
  });
  assert.deepEqual(await reader.readRawAccount(POOL), { exists: false, address: POOL, contextSlot: 124 });
});

test('fails closed on HTTP, JSON-RPC, and malformed account responses', async () => {
  const http = createSolanaJsonRpcAccountReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => http.readRawAccount(POOL));

  const rpc = createSolanaJsonRpcAccountReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => ({ ok: true, json: async () => ({ error: { code: -1 } }) }) });
  await assert.rejects(() => rpc.readRawAccount(POOL));

  const malformed = createSolanaJsonRpcAccountReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => ({ ok: true, json: async () => ({ result: { context: { slot: 1 }, value: { owner: '', data: [] } } }) }) });
  await assert.rejects(() => malformed.readRawAccount(POOL));
});

test('rejects missing endpoint and empty account addresses', async () => {
  assert.throws(() => createSolanaJsonRpcAccountReader({ rpcUrl: '' }), TypeError);
  const reader = createSolanaJsonRpcAccountReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => { throw new Error('must not run'); } });
  await assert.rejects(() => reader.readRawAccount(''), TypeError);
});
