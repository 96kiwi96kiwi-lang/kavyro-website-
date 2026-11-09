// Read-only Solana JSON-RPC account reader.
// This transport only calls getAccountInfo and cannot build, sign, or send transactions.
// Evidence is accepted only from the JSON-RPC 2.0 result for the request that was sent.
// `executable` must be an own boolean (it is never coerced to false), and account bytes
// must be canonical base64. Missing, inherited, or non-boolean executable evidence is
// rejected so an executable account cannot be reported as ordinary account data.

/** @param {unknown} value @returns {string} */
const clean = (value) => typeof value === 'string' ? value.trim() : '';

/**
 * Own data property only. Inherited values and accessors are ignored so a
 * prototype cannot supply executable=false or any other evidence field.
 * @param {unknown} value
 * @param {string} key
 * @returns {unknown}
 */
function ownData(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return undefined;
    return descriptor.value;
  } catch {
    return undefined;
  }
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function canonicalAccountOwner(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x20 || codePoint === 0x7f) return null;
  }
  return value;
}

/**
 * Solana base64 account data is a non-empty canonical string. Characters outside
 * the alphabet are not ignored, and a different encoding tag is not reinterpreted.
 * @param {unknown} encoded
 * @param {unknown} encoding
 * @returns {string | null}
 */
function canonicalBase64AccountData(encoded, encoding) {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoding !== 'base64') return null;
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length === 0 || decoded.toString('base64') !== encoded) return null;
  return encoded;
}

/**
 * @typedef {{ok: boolean, status?: number, json?: () => Promise<unknown>}} ReadOnlyHttpResponse
 * @typedef {(url: string, init: {method: 'POST', headers: {'content-type': string}, body: string}) => Promise<ReadOnlyHttpResponse>} ReadOnlyFetch
 * @typedef {{rpcUrl?: unknown, fetchImpl?: ReadOnlyFetch}} SolanaJsonRpcReaderOptions
 */

/**
 * @param {SolanaJsonRpcReaderOptions} [options]
 */
export function createSolanaJsonRpcAccountReader(options = {}) {
  const endpoint = clean(options.rpcUrl);
  if (!endpoint) throw new TypeError('rpcUrl is required');

  /** @type {ReadOnlyFetch | undefined} */
  const fetchImpl = options.fetchImpl ?? (typeof globalThis.fetch === 'function'
    ? /** @type {ReadOnlyFetch} */ (globalThis.fetch)
    : undefined);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  let requestId = 0;

  /**
   * @param {unknown} address
   * @returns {Promise<Readonly<{exists: false, address: string, contextSlot: number}> |
   * Readonly<{exists: true, address: string, contextSlot: number, owner: string,
   * dataBase64: string, lamports: unknown, executable: boolean, rentEpoch: unknown}>>}
   */
  const readRawAccount = async (address) => {
    if (typeof address !== 'string' || address.length === 0 || address.trim() !== address) {
      throw new TypeError('account address is required');
    }
    const accountAddress = address;
    const id = ++requestId;

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'getAccountInfo',
        params: [accountAddress, { encoding: 'base64', commitment: 'finalized' }],
      }),
    });

    if (!response || response.ok !== true) throw new Error(`Solana RPC HTTP ${response?.status ?? 'error'}`);
    if (typeof response.json !== 'function') throw new Error('Malformed Solana RPC response');

    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Malformed Solana RPC response');
    }
    if (ownData(payload, 'jsonrpc') !== '2.0' || ownData(payload, 'id') !== id) {
      throw new Error('Malformed Solana RPC response');
    }
    if (ownData(payload, 'error') != null) throw new Error('Solana RPC returned an error');

    const result = ownData(payload, 'result');
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Malformed Solana RPC response');
    }
    const context = ownData(result, 'context');
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      throw new Error('Malformed Solana RPC response');
    }
    const slotValue = ownData(context, 'slot');
    if (typeof slotValue !== 'number' || !Number.isSafeInteger(slotValue) || slotValue < 0) {
      throw new Error('Malformed Solana RPC response');
    }
    const contextSlot = slotValue;

    const value = ownData(result, 'value');
    if (value === null) return Object.freeze({ exists: false, address: accountAddress, contextSlot });
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Malformed Solana account response');
    }

    const owner = canonicalAccountOwner(ownData(value, 'owner'));
    const data = ownData(value, 'data');
    const encoded = Array.isArray(data) && data.length === 2
      ? canonicalBase64AccountData(data[0], data[1])
      : null;
    const executable = ownData(value, 'executable');
    if (owner === null || encoded === null || typeof executable !== 'boolean') {
      throw new Error('Malformed Solana account response');
    }

    return Object.freeze({
      exists: true,
      address: accountAddress,
      owner,
      dataBase64: encoded,
      contextSlot,
      lamports: ownData(value, 'lamports'),
      executable,
      rentEpoch: ownData(value, 'rentEpoch'),
    });
  };

  return Object.freeze({
    readRawAccount,
    capabilities: Object.freeze({ read: true, buildTransaction: false, signTransaction: false, sendTransaction: false }),
  });
}
