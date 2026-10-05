// Read-only Solana JSON-RPC finalized transaction reader.
// It can fetch transaction history evidence but cannot build, sign, or send transactions.

/** @param {unknown} value @returns {string} */
const clean = (value) => typeof value === 'string' ? value.trim() : '';

/**
 * @typedef {{ok: boolean, status?: number, json?: () => Promise<unknown>}} ReadOnlyHttpResponse
 * @typedef {(url: string, init: {method: 'POST', headers: {'content-type': string}, body: string}) => Promise<ReadOnlyHttpResponse>} ReadOnlyFetch
 */

/**
 * @param {{rpcUrl?: unknown, fetchImpl?: ReadOnlyFetch}} options
 */
export function createSolanaFinalizedTransactionReader(options) {
  const endpoint = clean(options?.rpcUrl);
  if (!endpoint) throw new TypeError('rpcUrl is required');
  const fetchImpl = options.fetchImpl ?? (typeof globalThis.fetch === 'function' ? /** @type {ReadOnlyFetch} */ (globalThis.fetch) : undefined);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  let requestId = 0;

  return Object.freeze({
    /**
     * Fetch one transaction by exact signature. This transport deliberately
     * returns raw finalized RPC evidence; CPMM decoding/binding is a separate boundary.
     * @param {unknown} signature
     */
    async readFinalizedTransaction(signature) {
      const exactSignature = clean(signature);
      if (!exactSignature) throw new TypeError('transaction signature is required');
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: ++requestId,
          method: 'getTransaction',
          params: [exactSignature, {
            commitment: 'finalized',
            encoding: 'jsonParsed',
            maxSupportedTransactionVersion: 0,
          }],
        }),
      });
      if (!response || response.ok !== true) throw new Error(`Solana RPC HTTP ${response?.status ?? 'error'}`);
      if (typeof response.json !== 'function') throw new Error('Malformed Solana RPC response');
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || ('error' in payload && payload.error) || !('result' in payload)) {
        throw new Error('Solana RPC transaction error');
      }
      const result = payload.result;
      if (result == null) return Object.freeze({ exists: false, signature: exactSignature });
      if (typeof result !== 'object') throw new Error('Malformed Solana transaction response');
      const r = /** @type {Record<string, unknown>} */ (result);
      if (!Number.isSafeInteger(r.slot) || /** @type {number} */ (r.slot) <= 0 ||
          !Number.isSafeInteger(r.blockTime) || /** @type {number} */ (r.blockTime) < 0 ||
          !r.transaction || typeof r.transaction !== 'object' ||
          !r.meta || typeof r.meta !== 'object') {
        throw new Error('Malformed Solana transaction response');
      }
      const meta = /** @type {Record<string, unknown>} */ (r.meta);
      if (meta.err != null) throw new Error('Solana transaction failed');
      const transaction = /** @type {Record<string, unknown>} */ (r.transaction);
      // Solana identifies a transaction by its first signature. Never relabel a
      // different RPC result with the requested signature (including a cosigner).
      if (!Array.isArray(transaction.signatures) || transaction.signatures[0] !== exactSignature) {
        throw new Error('Solana transaction signature mismatch');
      }
      return Object.freeze({
        exists: true,
        finalized: true,
        signature: exactSignature,
        slot: r.slot,
        blockTimeSeconds: r.blockTime,
        transaction: r.transaction,
        meta: r.meta,
      });
    },
    capabilities: Object.freeze({ read: true, buildTransaction: false, signTransaction: false, sendTransaction: false }),
  });
}
