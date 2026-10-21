import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolanaFinalizedTransactionReader } from './solana-finalized-transaction-reader.js';

const SIGNATURE = '1'.repeat(64);
const OTHER_SIGNATURE = `${'1'.repeat(63)}2`;

/** @param {unknown[]} [signatures] */
const finalizedTransaction = (signatures = [SIGNATURE]) => ({
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

/** @param {unknown} [status] @param {unknown} [contextSlot] */
const finalizedStatusResult = (status = finalizedSignatureStatus(), contextSlot = 130) => ({
  context: { slot: contextSlot },
  value: [status],
});

/** @param {{body: string}} init @param {Record<string, unknown>} payload */
const rpcResponse = (init, payload) => {
  const request = JSON.parse(init.body);
  return {
    ok: true,
    json: async () => ({ jsonrpc: '2.0', id: request.id, ...payload }),
  };
};

test('requires a distinct status RPC hostname before reading evidence', () => {
  const fetchImpl = async (
    /** @type {string} */ _url,
    /** @type {{body: string}} */ init,
  ) => rpcResponse(init, { result: null });
  assert.throws(
    () => createSolanaFinalizedTransactionReader({ rpcUrl: 'https://rpc.invalid', fetchImpl }),
    /statusRpcUrl is required/,
  );
  assert.throws(
    () => createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid/transaction',
      statusRpcUrl: 'https://rpc.invalid/status',
      fetchImpl,
    }),
    /independent hostname/,
  );
  assert.throws(
    () => createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid',
      statusRpcUrl: '/relative',
      fetchImpl,
    }),
    /absolute/,
  );
  for (const timeoutMs of [0, -1, 1.5, 30_001, '10']) {
    assert.throws(
      () => createSolanaFinalizedTransactionReader({
        rpcUrl: 'https://rpc.invalid',
        statusRpcUrl: 'https://status-rpc.invalid',
        timeoutMs,
        fetchImpl,
      }),
      /timeoutMs must be an integer/,
    );
  }
});

test('rejects transport downgrade, same-host port aliases, and URL userinfo', () => {
  const fetchImpl = async (
    /** @type {string} */ _url,
    /** @type {{body: string}} */ init,
  ) => rpcResponse(init, { result: null });

  for (const options of [
    {
      rpcUrl: 'http://rpc.invalid',
      statusRpcUrl: 'https://status-rpc.invalid',
      expected: /must use HTTPS/,
    },
    {
      rpcUrl: 'https://rpc.invalid',
      statusRpcUrl: 'http://status-rpc.invalid',
      expected: /must use HTTPS/,
    },
    {
      rpcUrl: 'https://rpc.invalid:443',
      statusRpcUrl: 'https://rpc.invalid:8443',
      expected: /independent hostname/,
    },
    {
      rpcUrl: 'https://token@rpc.invalid',
      statusRpcUrl: 'https://status-rpc.invalid',
      expected: /userinfo credentials/,
    },
  ]) {
    assert.throws(
      () => createSolanaFinalizedTransactionReader({ ...options, fetchImpl }),
      options.expected,
    );
  }
});


test('aborts and fails closed when a read-only RPC call exceeds its timeout', async () => {
  let aborted = false;
  const reader = createSolanaFinalizedTransactionReader({
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('aborted'));
      }, { once: true });
    }),
  });

  await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /getTransaction timeout/);
  assert.equal(aborted, true);
});

test('cross-checks exact finalized transaction and signature status evidence without transaction capability', async () => {
  /** @type {Array<{ method: string, params: unknown[] }>} */
  const requests = [];
  /** @type {string[]} */
  const endpoints = [];
  const reader = createSolanaFinalizedTransactionReader({
    rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid',
    fetchImpl: async (url, init) => {
      const request = JSON.parse(init.body);
      endpoints.push(url);
      requests.push(request);
      if (request.method === 'getTransaction') {
        return rpcResponse(init, { result: finalizedTransaction() });
      }
      if (request.method === 'getSignatureStatuses') {
        return rpcResponse(init, { result: finalizedStatusResult() });
      }
      throw new Error(`Unexpected RPC method: ${request.method}`);
    },
  });

  const result = await reader.readFinalizedTransaction(SIGNATURE);

  assert.equal(result.exists, true);
  assert.equal(result.finalized, true);
  assert.equal(result.signature, SIGNATURE);
  assert.deepEqual(endpoints, [
    'https://rpc.invalid',
    'https://status-rpc.invalid',
    'https://status-rpc.invalid',
  ]);
  assert.deepEqual(requests, [
    {
      method: 'getTransaction',
      params: [SIGNATURE, { commitment: 'finalized', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      jsonrpc: '2.0',
      id: 1,
    },
    {
      method: 'getTransaction',
      params: [SIGNATURE, { commitment: 'finalized', encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      jsonrpc: '2.0',
      id: 2,
    },
    {
      method: 'getSignatureStatuses',
      params: [[SIGNATURE], { searchTransactionHistory: true }],
      jsonrpc: '2.0',
      id: 3,
    },
  ]);
  assert.deepEqual(reader.capabilities, { read: true, buildTransaction: false, signTransaction: false, sendTransaction: false });
});

test('binds every RPC response to its JSON-RPC version and request id', async () => {
  const invalidEnvelopes = [
    { result: finalizedTransaction() },
    { jsonrpc: '1.0', id: 1, result: finalizedTransaction() },
    { jsonrpc: '2.0', id: 999, result: finalizedTransaction() },
  ];

  for (const envelope of invalidEnvelopes) {
    const reader = createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async () => ({ ok: true, json: async () => envelope }),
    });
    await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /response mismatch/);
  }
});

test('fails closed on failed or malformed transaction evidence', async () => {
  const failed = createSolanaFinalizedTransactionReader({ rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid', fetchImpl: async (_url, init) => rpcResponse(init, { result: { slot: 1, blockTime: 2, transaction: {}, meta: { err: { custom: 1 } } } }) });
  await assert.rejects(() => failed.readFinalizedTransaction(SIGNATURE), /transaction failed/);
  const malformed = createSolanaFinalizedTransactionReader({ rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid', fetchImpl: async (_url, init) => rpcResponse(init, { result: { slot: 0 } }) });
  await assert.rejects(() => malformed.readFinalizedTransaction(SIGNATURE), /Malformed/);
});

test('reports missing finalized transaction without inventing contribution facts', async () => {
  const reader = createSolanaFinalizedTransactionReader({ rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid', fetchImpl: async (_url, init) => rpcResponse(init, { result: null }) });
  assert.deepEqual(await reader.readFinalizedTransaction(SIGNATURE), { exists: false, signature: SIGNATURE });
});

test('rejects malformed signatures before any transaction RPC request', async () => {
  let requests = 0;
  const reader = createSolanaFinalizedTransactionReader({
    rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid',
    fetchImpl: async (_url, init) => {
      requests += 1;
      return rpcResponse(init, { error: { code: -1 } });
    },
  });
  for (const signature of [
    '',
    ` ${SIGNATURE}`,
    '0'.repeat(64),
    '1'.repeat(63),
    '1'.repeat(65),
    123,
  ]) {
    await assert.rejects(
      () => reader.readFinalizedTransaction(signature),
      /canonical base58 encoding of 64 bytes/,
    );
  }
  assert.equal(requests, 0);
  await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /getTransaction error/);
  assert.equal(requests, 1);
});

test('rejects finalized RPC payloads unless the requested signature is first and unique', async () => {
  for (const signatures of [[], [OTHER_SIGNATURE], [null, SIGNATURE], [OTHER_SIGNATURE, SIGNATURE], [SIGNATURE, SIGNATURE]]) {
    const reader = createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async (_url, init) => rpcResponse(init, { result: finalizedTransaction(signatures) }),
    });
    await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /signature mismatch/);
  }
});

test('fails closed when independent RPC transaction evidence differs', async () => {
  const base = finalizedTransaction();
  const mismatches = [
    { ...base, slot: 124 },
    { ...base, blockTime: 1001 },
    { ...base, transaction: { ...base.transaction, message: { accountKeys: ['FORGED'] } } },
    { ...base, meta: { ...base.meta, postTokenBalances: [{ accountIndex: 1 }] } },
  ];

  for (const independentResult of mismatches) {
    const reader = createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async (url, init) => {
        const request = JSON.parse(init.body);
        if (request.method === 'getTransaction') {
          const result = url === 'https://rpc.invalid' ? base : independentResult;
          return rpcResponse(init, { result });
        }
        return rpcResponse(init, { result: finalizedStatusResult() });
      },
    });
    await assert.rejects(
      () => reader.readFinalizedTransaction(SIGNATURE),
      /Independent Solana transaction evidence mismatch/,
    );
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
      rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        if (request.method === 'getTransaction') {
          return rpcResponse(init, { result: finalizedTransaction() });
        }
        return rpcResponse(init, { result: finalizedStatusResult(status) });
      },
    });
    await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /finalized signature status/);
  }
});

test('fails closed on malformed or errored signature status RPC evidence', async () => {
  for (const payload of [
    { result: null },
    { result: { context: { slot: 130 }, value: [] } },
    { result: { value: [finalizedSignatureStatus()] } },
    { result: finalizedStatusResult(finalizedSignatureStatus(), 122) },
    { result: finalizedStatusResult(finalizedSignatureStatus(), 123.5) },
    { error: { code: -1 } },
  ]) {
    const reader = createSolanaFinalizedTransactionReader({
      rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        if (request.method === 'getTransaction') {
          return rpcResponse(init, { result: finalizedTransaction() });
        }
        return rpcResponse(init, payload);
      },
    });
    await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /getSignatureStatuses|finalized signature status/);
  }
});
