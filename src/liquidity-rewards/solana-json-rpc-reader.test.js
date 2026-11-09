import test from 'node:test';
import assert from 'node:assert/strict';
import { KAVYRO_MINT, WRAPPED_SOL_MINT } from './config.js';
import { createRaydiumCpmmPoolReader, RAYDIUM_CPMM_PROGRAM_ID, RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR } from './raydium-cpmm-pool-reader.js';
import { createSolanaJsonRpcAccountReader } from './solana-json-rpc-reader.js';

const POOL = 'TEST_ONLY_POOL_ID_NOT_PRODUCTION';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** @param {string} value */
function base58Decode(value) {
  const bytes = [0];
  for (const char of value) {
    let carry = ALPHABET.indexOf(char);
    assert.notEqual(carry, -1);
    for (let i = 0; i < bytes.length; i += 1) { carry += bytes[i] * 58; bytes[i] = carry & 0xff; carry >>= 8; }
    while (carry > 0) { bytes.push(carry & 0xff); carry >>= 8; }
  }
  let zeros = 0;
  while (zeros < value.length && value[zeros] === '1') zeros += 1;
  return Uint8Array.from([...new Array(zeros).fill(0), ...bytes.reverse()]);
}

function poolData() {
  const data = Buffer.alloc(232);
  Buffer.from(RAYDIUM_CPMM_POOL_STATE_DISCRIMINATOR).copy(data, 0);
  Buffer.from(base58Decode(WRAPPED_SOL_MINT)).copy(data, 136);
  Buffer.from(base58Decode(KAVYRO_MINT)).copy(data, 168);
  Buffer.from(base58Decode(WRAPPED_SOL_MINT)).copy(data, 200);
  return data.toString('base64');
}

/**
 * @param {unknown} [overrides]
 */
function accountValue(overrides = {}) {
  return {
    owner: 'RAYDIUM_PROGRAM_TEST_ONLY',
    data: ['AQID', 'base64'],
    lamports: 1,
    executable: false,
    rentEpoch: 0,
    ...(overrides && typeof overrides === 'object' ? overrides : {}),
  };
}

/**
 * @param {unknown} result
 * @param {Record<string, unknown>} [envelope]
 * @returns {(url: string, init: {method: 'POST', headers: {'content-type': string}, body: string}) => Promise<{ok: true, json: () => Promise<unknown>}>}
 */
function fetchResult(result, envelope = {}) {
  return async (_url, init) => {
    const body = /** @type {{id?: unknown}} */ (JSON.parse(init.body));
    const id = Object.hasOwn(envelope, 'id') ? envelope.id : body.id;
    /** @type {Record<string, unknown>} */
    const payload = { id, result };
    if (Object.hasOwn(envelope, 'jsonrpc')) payload.jsonrpc = envelope.jsonrpc;
    else payload.jsonrpc = '2.0';
    if (Object.hasOwn(envelope, 'error')) payload.error = envelope.error;
    return { ok: true, json: async () => payload };
  };
}

/**
 * @param {unknown} result
 * @param {Record<string, unknown>} [envelope]
 */
function readerFor(result, envelope) {
  return createSolanaJsonRpcAccountReader({
    rpcUrl: 'https://rpc.invalid',
    fetchImpl: fetchResult(result, envelope),
  });
}

test('uses only finalized getAccountInfo and exposes no transaction capability', async () => {
  /** @type {Record<string, unknown>[]} */
  const requests = [];
  const reader = createSolanaJsonRpcAccountReader({
    rpcUrl: 'https://rpc.invalid',
    fetchImpl: async (_url, init) => {
      assert.equal(typeof init.body, 'string');
      const body = /** @type {Record<string, unknown>} */ (JSON.parse(/** @type {string} */ (init.body)));
      requests.push(body);
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: body.id,
          result: { context: { slot: 123 }, value: accountValue() },
        }),
      };
    },
  });

  const result = await reader.readRawAccount(POOL);
  assert.equal(requests[0].method, 'getAccountInfo');
  assert.deepEqual(requests[0].params, [POOL, { encoding: 'base64', commitment: 'finalized' }]);
  assert.equal(result.exists, true);
  if (result.exists !== true) return;
  assert.equal(result.owner, 'RAYDIUM_PROGRAM_TEST_ONLY');
  assert.equal(result.contextSlot, 123);
  assert.equal(result.executable, false);
  assert.equal(result.dataBase64, 'AQID');
  assert.deepEqual(reader.capabilities, { read: true, buildTransaction: false, signTransaction: false, sendTransaction: false });
});

test('preserves an explicit executable flag instead of collapsing it', async () => {
  const result = await readerFor({ context: { slot: 9 }, value: accountValue({ executable: true }) }).readRawAccount(POOL);
  assert.equal(result.exists, true);
  if (result.exists !== true) return;
  assert.equal(result.executable, true);
});

test('returns a non-existing observation when RPC account value is null', async () => {
  const reader = readerFor({ context: { slot: 124 }, value: null });
  assert.deepEqual(await reader.readRawAccount(POOL), { exists: false, address: POOL, contextSlot: 124 });
});

test('fails closed on HTTP, JSON-RPC, and malformed account responses', async () => {
  const http = createSolanaJsonRpcAccountReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => http.readRawAccount(POOL), /Solana RPC HTTP 503/);

  const rpc = readerFor(
    { context: { slot: 1 }, value: null },
    { error: { code: -1 } },
  );
  await assert.rejects(() => rpc.readRawAccount(POOL), /Solana RPC returned an error/);

  const malformed = readerFor({ context: { slot: 1 }, value: { owner: '', data: [] } });
  await assert.rejects(() => malformed.readRawAccount(POOL), /Malformed Solana account response/);
});

test('rejects missing endpoint and empty or padded account addresses', async () => {
  assert.throws(() => createSolanaJsonRpcAccountReader({ rpcUrl: '' }), TypeError);
  const reader = createSolanaJsonRpcAccountReader({ rpcUrl: 'https://rpc.invalid', fetchImpl: async () => { throw new Error('must not run'); } });
  await assert.rejects(() => reader.readRawAccount(''), TypeError);
  await assert.rejects(() => reader.readRawAccount(` ${POOL}`), TypeError);
  await assert.rejects(() => reader.readRawAccount(`${POOL} `), TypeError);
});

test('rejects account evidence that is not the JSON-RPC result for this request', async () => {
  /** @type {Array<[string, unknown, Record<string, unknown>]>} */
  const cases = [
    ['wrong jsonrpc version', { context: { slot: 1 }, value: null }, { jsonrpc: '1.0' }],
    ['missing jsonrpc version', { context: { slot: 1 }, value: null }, { jsonrpc: undefined }],
    ['mismatched id', { context: { slot: 1 }, value: null }, { id: 999 }],
    ['stringified id', { context: { slot: 1 }, value: null }, { id: '1' }],
    ['missing context slot', { value: null }, {}],
    ['negative context slot', { context: { slot: -1 }, value: null }, {}],
    ['fractional context slot', { context: { slot: 1.5 }, value: null }, {}],
    ['unsafe context slot', { context: { slot: Number.MAX_SAFE_INTEGER + 1 }, value: null }, {}],
  ];
  for (const [label, result, envelope] of cases) {
    const reader = readerFor(result, envelope);
    await assert.rejects(() => reader.readRawAccount(POOL), /Malformed Solana RPC response/, label);
  }
});

test('rejects non-canonical account fields instead of coercing them into evidence', async () => {
  const missingExecutable = {
    owner: 'RAYDIUM_PROGRAM_TEST_ONLY',
    data: ['AQID', 'base64'],
    lamports: 1,
    rentEpoch: 0,
  };
  const inheritedExecutable = Object.create({ executable: false });
  Object.assign(inheritedExecutable, missingExecutable);
  const accessorExecutable = accountValue();
  Object.defineProperty(accessorExecutable, 'executable', { get: () => false });

  /** @type {Array<[string, unknown]>} */
  const cases = [
    ['missing executable', missingExecutable],
    ['inherited executable', inheritedExecutable],
    ['accessor executable', accessorExecutable],
    ['string executable', accountValue({ executable: 'false' })],
    ['numeric executable', accountValue({ executable: 0 })],
    ['null executable', accountValue({ executable: null })],
    ['base58 encoding tag', accountValue({ data: ['AQID', 'base58'] })],
    ['missing encoding tag', accountValue({ data: ['AQID'] })],
    ['extra data tuple field', accountValue({ data: ['AQID', 'base64', 'ignored'] })],
    ['non-canonical base64', accountValue({ data: ['AQIDBA', 'base64'] })],
    ['padded owner', accountValue({ owner: ' RAYDIUM_PROGRAM_TEST_ONLY' })],
    ['blank owner', accountValue({ owner: '' })],
  ];
  for (const [label, value] of cases) {
    const reader = readerFor({ context: { slot: 7 }, value });
    await assert.rejects(() => reader.readRawAccount(POOL), /Malformed Solana account response/, label);
  }

  const omittedValue = readerFor({ context: { slot: 7 } });
  await assert.rejects(() => omittedValue.readRawAccount(POOL), /Malformed Solana account response/);
});

test('omitted executable or a non-base64 tag cannot decode as a CPMM pool', async () => {
  const encodedPool = poolData();
  const missingExecutable = {
    owner: RAYDIUM_CPMM_PROGRAM_ID,
    data: [encodedPool, 'base64'],
    lamports: 1,
    rentEpoch: 0,
  };
  const wrongEncoding = {
    ...missingExecutable,
    executable: false,
    data: [encodedPool, 'base58'],
  };

  for (const value of [missingExecutable, wrongEncoding]) {
    const accounts = readerFor({ context: { slot: 50 }, value });
    const pools = createRaydiumCpmmPoolReader({
      readRawAccount: async (address) => accounts.readRawAccount(address),
    });
    await assert.rejects(() => pools.readPoolAccount(POOL), /Malformed Solana account response/);
  }
});
