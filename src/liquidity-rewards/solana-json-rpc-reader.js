// Read-only Solana JSON-RPC account reader.
// This transport only calls getAccountInfo and cannot build, sign, or send transactions.

/** @param {unknown} value @returns {string} */
const clean = (value) => typeof value === 'string' ? value.trim() : '';

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
   * @returns {Promise<Readonly<{exists: false, address: string, contextSlot: unknown}> |
   * Readonly<{exists: true, address: string, contextSlot: unknown, owner: string,
   * dataBase64: string, lamports: unknown, executable: boolean, rentEpoch: unknown}>>}
   */
  const readRawAccount = async (address) => {
    const accountAddress = clean(address);
    if (!accountAddress) throw new TypeError('account address is required');

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: ++requestId,
        method: 'getAccountInfo',
        params: [accountAddress, { encoding: 'base64', commitment: 'finalized' }],
      }),
    });

    if (!response || response.ok !== true) throw new Error(`Solana RPC HTTP ${response?.status ?? 'error'}`);
    if (typeof response.json !== 'function') throw new Error('Malformed Solana RPC response');

    const payload = await response.json();
    if (!payload || typeof payload !== 'object') throw new Error('Malformed Solana RPC response');
    if ('error' in payload && payload.error) throw new Error('Solana RPC returned an error');
    if (!('result' in payload) || !payload.result || typeof payload.result !== 'object') {
      throw new Error('Malformed Solana RPC response');
    }

    const result = payload.result;
    const contextSlot = 'context' in result && result.context && typeof result.context === 'object' && 'slot' in result.context
      ? result.context.slot
      : undefined;
    const value = 'value' in result ? result.value : undefined;
    if (value == null) return Object.freeze({ exists: false, address: accountAddress, contextSlot });
    if (typeof value !== 'object') throw new Error('Malformed Solana account response');

    const owner = clean('owner' in value ? value.owner : undefined);
    const data = 'data' in value ? value.data : undefined;
    const encoded = Array.isArray(data) ? data[0] : '';
    if (!owner || typeof encoded !== 'string' || !encoded) throw new Error('Malformed Solana account response');

    return Object.freeze({
      exists: true,
      address: accountAddress,
      owner,
      dataBase64: encoded,
      contextSlot,
      lamports: 'lamports' in value ? value.lamports : undefined,
      executable: 'executable' in value && value.executable === true,
      rentEpoch: 'rentEpoch' in value ? value.rentEpoch : undefined,
    });
  };

  return Object.freeze({
    readRawAccount,
    capabilities: Object.freeze({ read: true, buildTransaction: false, signTransaction: false, sendTransaction: false }),
  });
}
