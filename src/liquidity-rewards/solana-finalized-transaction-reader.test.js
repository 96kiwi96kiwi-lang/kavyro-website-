import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolanaFinalizedTransactionReader } from './solana-finalized-transaction-reader.js';

const SIGNATURE = '1'.repeat(64);
const OTHER_SIGNATURE = `${'1'.repeat(63)}2`;

const DEFAULT_OPERATOR_BINDING = Object.freeze({
  rpcOperator: 'operator-a',
  statusRpcOperator: 'operator-b',
});

/** @param {Parameters<typeof createSolanaFinalizedTransactionReader>[0]} options */
const createReader = (options) => createSolanaFinalizedTransactionReader({
  ...DEFAULT_OPERATOR_BINDING,
  ...options,
});

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

/** @param {unknown} envelope @param {number} [status] */
const rawJsonResponse = (envelope, status = 200) => {
  const encoded = new TextEncoder().encode(JSON.stringify(envelope));
  let delivered = false;
  return {
    ok: true,
    status,
    headers: {
      get: (/** @type {string} */ name) => {
        if (name.toLowerCase() === 'content-type') return 'application/json; charset=utf-8';
        if (name.toLowerCase() === 'content-length') return String(encoded.byteLength);
        return null;
      },
    },
    body: {
      getReader: () => ({
        read: async () => {
          if (delivered) return { done: true };
          delivered = true;
          return { done: false, value: encoded };
        },
        cancel: async () => {},
      }),
    },
  };
};

/** @param {{body: string}} init @param {Record<string, unknown>} payload */
const rpcResponse = (init, payload) => {
  const request = JSON.parse(init.body);
  return rawJsonResponse({ jsonrpc: '2.0', id: request.id, ...payload });
};

test('requires explicit canonical identities for two independent RPC operators', () => {
  const fetchImpl = async (
    /** @type {string} */ _url,
    /** @type {{body: string}} */ init,
  ) => rpcResponse(init, { result: null });
  const endpoints = {
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    fetchImpl,
  };

  for (const options of [
    endpoints,
    { ...endpoints, rpcOperator: 'operator-a' },
    { ...endpoints, statusRpcOperator: 'operator-b' },
  ]) {
    assert.throws(
      () => createSolanaFinalizedTransactionReader(options),
      /rpcOperator|statusRpcOperator/,
    );
  }
  for (const operator of ['', ' Operator-A', 'Operator-A', 'operator/a', 'a'.repeat(65)]) {
    assert.throws(
      () => createSolanaFinalizedTransactionReader({
        ...endpoints,
        rpcOperator: operator,
        statusRpcOperator: 'operator-b',
      }),
      /rpcOperator must be a canonical lowercase operator id/,
    );
  }
  assert.throws(
    () => createSolanaFinalizedTransactionReader({
      ...endpoints,
      rpcOperator: 'same-operator',
      statusRpcOperator: 'same-operator',
    }),
    /independent operator/,
  );
});

test('requires a distinct status RPC hostname before reading evidence', () => {
  const fetchImpl = async (
    /** @type {string} */ _url,
    /** @type {{body: string}} */ init,
  ) => rpcResponse(init, { result: null });
  assert.throws(
    () => createReader({ rpcUrl: 'https://rpc.invalid', fetchImpl }),
    /statusRpcUrl is required/,
  );
  assert.throws(
    () => createReader({
      rpcUrl: 'https://rpc.invalid/transaction',
      statusRpcUrl: 'https://rpc.invalid/status',
      fetchImpl,
    }),
    /independent hostname/,
  );
  assert.throws(
    () => createReader({
      rpcUrl: 'https://rpc.invalid',
      statusRpcUrl: '/relative',
      fetchImpl,
    }),
    /absolute/,
  );
  for (const timeoutMs of [0, -1, 1.5, 30_001, '10']) {
    assert.throws(
      () => createReader({
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
      () => createReader({ ...options, fetchImpl }),
      options.expected,
    );
  }
});


test('aborts and fails closed when a read-only RPC call exceeds its timeout', async () => {
  let aborted = false;
  const reader = createReader({
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


test('enforces the RPC deadline when transport ignores the abort signal', async () => {
  let aborted = false;
  const reader = createReader({
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise(() => {
      init.signal.addEventListener('abort', () => {
        aborted = true;
      }, { once: true });
    }),
  });

  await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /getTransaction timeout/);
  assert.equal(aborted, true);
});

test('cancels a response body when an abort-ignoring transport resolves after deadline', async () => {
  let aborted = false;
  let bodyRead = false;
  let cancelled = false;
  const reader = createReader({
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise((resolve) => {
      init.signal.addEventListener('abort', () => {
        aborted = true;
      }, { once: true });
      setTimeout(() => resolve({
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
        body: {
          getReader: () => ({
            read: async () => {
              bodyRead = true;
              return { done: true };
            },
            cancel: async () => {
              cancelled = true;
            },
          }),
        },
      }), 20);
    }),
  });

  await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /getTransaction timeout/);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(aborted, true);
  assert.equal(bodyRead, false);
  assert.equal(cancelled, true);
});

test('keeps the RPC timeout active while streaming the response body', async () => {
  let aborted = false;
  const reader = createReader({
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      body: {
        getReader: () => ({
          read: () => new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              aborted = true;
              reject(new Error('aborted'));
            }, { once: true });
          }),
          cancel: async () => {},
        }),
      },
    }),
  });

  await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /getTransaction timeout/);
  assert.equal(aborted, true);
});

test('cancels a stalled RPC response stream when its deadline expires', async () => {
  let aborted = false;
  let cancelled = false;
  const reader = createReader({
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    timeoutMs: 5,
    fetchImpl: async (_url, init) => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      body: {
        getReader: () => ({
          read: () => new Promise(() => {
            init.signal.addEventListener('abort', () => {
              aborted = true;
            }, { once: true });
          }),
          cancel: async () => {
            cancelled = true;
          },
        }),
      },
    }),
  });

  await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /getTransaction timeout/);
  assert.equal(aborted, true);
  assert.equal(cancelled, true);
});

test('rejects non-200 RPC responses even when fetch marks them successful', async () => {
  for (const status of [201, 206]) {
    const reader = createReader({
      rpcUrl: 'https://rpc.invalid',
      statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async (_url, init) => {
        const request = JSON.parse(init.body);
        return rawJsonResponse({
          jsonrpc: '2.0',
          id: request.id,
          result: finalizedTransaction(),
        }, status);
      },
    });

    await assert.rejects(
      () => reader.readFinalizedTransaction(SIGNATURE),
      new RegExp(`Solana RPC HTTP ${status}`),
    );
  }
});

test('rejects non-JSON and oversized declared RPC responses without reading their body', async () => {
  for (const headers of [
    { 'content-type': 'text/html', 'content-length': '2' },
    { 'content-type': 'application/json', 'content-length': String(4 * 1024 * 1024 + 1) },
    { 'content-type': 'application/json', 'content-length': 'not-a-number' },
  ]) {
    let bodyRead = false;
    const responseHeaders = /** @type {Record<string, string>} */ (headers);
    const reader = createReader({
      rpcUrl: 'https://rpc.invalid',
      statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        headers: { get: (name) => responseHeaders[name.toLowerCase()] ?? null },
        body: {
          getReader: () => ({
            read: async () => {
              bodyRead = true;
              return { done: true };
            },
            cancel: async () => {},
          }),
        },
      }),
    });

    await assert.rejects(
      () => reader.readFinalizedTransaction(SIGNATURE),
      /content type rejected|response too large/,
    );
    assert.equal(bodyRead, false);
  }
});

test('cancels and rejects a chunked RPC response that exceeds the byte cap', async () => {
  let cancelled = false;
  let reads = 0;
  const reader = createReader({
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      body: {
        getReader: () => ({
          read: async () => {
            reads += 1;
            return { done: false, value: new Uint8Array(4 * 1024 * 1024 + 1) };
          },
          cancel: async () => {
            cancelled = true;
          },
        }),
      },
    }),
  });

  await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /response too large/);
  assert.equal(reads, 1);
  assert.equal(cancelled, true);
});

test('rejects and cancels non-canonical UTF-8 RPC evidence', async () => {
  let cancelled = false;
  let delivered = false;
  const reader = createReader({
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      body: {
        getReader: () => ({
          read: async () => {
            if (delivered) return { done: true };
            delivered = true;
            return {
              done: false,
              value: Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]),
            };
          },
          cancel: async () => {
            cancelled = true;
          },
        }),
      },
    }),
  });

  await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /Malformed Solana RPC getTransaction UTF-8/);
  assert.equal(cancelled, true);
});

test('cross-checks exact finalized transaction and signature status evidence without transaction capability', async () => {
  /** @type {Array<{ method: string, params: unknown[] }>} */
  const requests = [];
  /** @type {string[]} */
  const endpoints = [];
  /** @type {Array<string | undefined>} */
  const redirectPolicies = [];
  const reader = createReader({
    rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid',
    fetchImpl: async (url, init) => {
      const request = JSON.parse(init.body);
      endpoints.push(url);
      redirectPolicies.push(init.redirect);
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
  assert.deepEqual(result.providers, {
    transactionOperator: 'operator-a',
    statusOperator: 'operator-b',
  });
  assert.deepEqual(endpoints, [
    'https://rpc.invalid',
    'https://status-rpc.invalid',
    'https://rpc.invalid',
    'https://status-rpc.invalid',
  ]);
  assert.deepEqual(redirectPolicies, ['error', 'error', 'error', 'error']);
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
    {
      method: 'getSignatureStatuses',
      params: [[SIGNATURE], { searchTransactionHistory: true }],
      jsonrpc: '2.0',
      id: 4,
    },
  ]);
  assert.deepEqual(reader.capabilities, { read: true, buildTransaction: false, signTransaction: false, sendTransaction: false });
});

test('returns deeply immutable transaction evidence after independent verification', async () => {
  const reader = createReader({
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body);
      return rpcResponse(init, {
        result: request.method === 'getTransaction'
          ? finalizedTransaction()
          : finalizedStatusResult(),
      });
    },
  });

  const result = await reader.readFinalizedTransaction(SIGNATURE);
  if (!('transaction' in result)) {
    assert.fail('Expected verified transaction evidence');
  }
  const transaction = /** @type {Record<string, unknown>} */ (result.transaction);
  const meta = /** @type {Record<string, unknown>} */ (result.meta);
  const signatures = /** @type {unknown[]} */ (transaction.signatures);
  const message = /** @type {Record<string, unknown>} */ (transaction.message);
  const preTokenBalances = /** @type {unknown[]} */ (meta.preTokenBalances);

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(transaction), true);
  assert.equal(Object.isFrozen(meta), true);
  assert.equal(Object.isFrozen(signatures), true);
  assert.equal(Object.isFrozen(message), true);
  assert.equal(Object.isFrozen(preTokenBalances), true);
  assert.throws(() => {
    signatures[0] = OTHER_SIGNATURE;
  }, TypeError);
  assert.throws(() => {
    message.injected = true;
  }, TypeError);
  assert.throws(() => {
    preTokenBalances.push({ forged: true });
  }, TypeError);
  assert.equal(signatures[0], SIGNATURE);
});

test('requires each RPC provider to independently report the exact finalized signature slot', async () => {
  for (const invalidEndpoint of ['https://rpc.invalid', 'https://status-rpc.invalid']) {
    const reader = createReader({
      rpcUrl: 'https://rpc.invalid',
      statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async (url, init) => {
        const request = JSON.parse(init.body);
        if (request.method === 'getTransaction') {
          return rpcResponse(init, { result: finalizedTransaction() });
        }
        const result = url === invalidEndpoint
          ? finalizedStatusResult(finalizedSignatureStatus({ confirmationStatus: 'confirmed', confirmations: 1 }))
          : finalizedStatusResult();
        return rpcResponse(init, { result });
      },
    });

    await assert.rejects(
      () => reader.readFinalizedTransaction(SIGNATURE),
      /finalized signature status mismatch/,
    );
  }
});

test('binds every RPC response to its JSON-RPC version and request id', async () => {
  const invalidEnvelopes = [
    { result: finalizedTransaction() },
    { jsonrpc: '1.0', id: 1, result: finalizedTransaction() },
    { jsonrpc: '2.0', id: 999, result: finalizedTransaction() },
  ];

  for (const envelope of invalidEnvelopes) {
    const reader = createReader({
      rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async () => rawJsonResponse(envelope),
    });
    await assert.rejects(() => reader.readFinalizedTransaction(SIGNATURE), /response mismatch/);
  }
});

test('fails closed on failed or malformed transaction evidence', async () => {
  const failed = createReader({ rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid', fetchImpl: async (_url, init) => rpcResponse(init, { result: { slot: 1, blockTime: 2, transaction: {}, meta: { err: { custom: 1 } } } }) });
  await assert.rejects(() => failed.readFinalizedTransaction(SIGNATURE), /transaction failed/);
  const malformed = createReader({ rpcUrl: 'https://rpc.invalid', statusRpcUrl: 'https://status-rpc.invalid', fetchImpl: async (_url, init) => rpcResponse(init, { result: { slot: 0 } }) });
  await assert.rejects(() => malformed.readFinalizedTransaction(SIGNATURE), /Malformed/);
});

test('reports a missing finalized transaction only when both RPC providers agree', async () => {
  /** @type {string[]} */
  const endpoints = [];
  const reader = createReader({
    rpcUrl: 'https://rpc.invalid',
    statusRpcUrl: 'https://status-rpc.invalid',
    fetchImpl: async (url, init) => {
      endpoints.push(url);
      const request = JSON.parse(init.body);
      return rpcResponse(init, {
        result: request.method === 'getTransaction'
          ? null
          : finalizedStatusResult(null),
      });
    },
  });
  assert.deepEqual(await reader.readFinalizedTransaction(SIGNATURE), {
    exists: false,
    signature: SIGNATURE,
    providers: {
      transactionOperator: 'operator-a',
      statusOperator: 'operator-b',
    },
  });
  assert.deepEqual(endpoints, [
    'https://rpc.invalid',
    'https://status-rpc.invalid',
    'https://rpc.invalid',
    'https://status-rpc.invalid',
  ]);
});

test('fails closed when transaction payloads are missing but either provider still finds the signature', async () => {
  for (const statusEndpoint of ['https://rpc.invalid', 'https://status-rpc.invalid']) {
    const reader = createReader({
      rpcUrl: 'https://rpc.invalid',
      statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async (url, init) => {
        const request = JSON.parse(init.body);
        return rpcResponse(init, {
          result: request.method === 'getTransaction'
            ? null
            : finalizedStatusResult(url === statusEndpoint ? finalizedSignatureStatus() : null),
        });
      },
    });
    await assert.rejects(
      () => reader.readFinalizedTransaction(SIGNATURE),
      /absence status mismatch/,
    );
  }
});

test('fails closed when only one RPC provider reports the finalized transaction as missing', async () => {
  for (const missingEndpoint of ['https://rpc.invalid', 'https://status-rpc.invalid']) {
    const reader = createReader({
      rpcUrl: 'https://rpc.invalid',
      statusRpcUrl: 'https://status-rpc.invalid',
      fetchImpl: async (url, init) => rpcResponse(init, {
        result: url === missingEndpoint ? null : finalizedTransaction(),
      }),
    });
    await assert.rejects(
      () => reader.readFinalizedTransaction(SIGNATURE),
      /absence evidence mismatch/,
    );
  }
});

test('rejects malformed signatures before any transaction RPC request', async () => {
  let requests = 0;
  const reader = createReader({
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
    const reader = createReader({
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
    const reader = createReader({
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
    const reader = createReader({
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
    const reader = createReader({
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
