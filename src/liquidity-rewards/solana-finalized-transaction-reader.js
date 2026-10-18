// Read-only Solana JSON-RPC finalized transaction reader.
// It can fetch transaction history evidence but cannot build, sign, or send transactions.

/** @param {unknown} value @returns {string} */
const clean = (value) => typeof value === 'string' ? value.trim() : '';

/** @param {unknown} value @returns {string} */
function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new Error('Malformed Solana RPC JSON evidence');
}

/**
 * @typedef {{ok: boolean, status?: number, json?: () => Promise<unknown>}} ReadOnlyHttpResponse
 * @typedef {(url: string, init: {method: 'POST', headers: {'content-type': string}, body: string}) => Promise<ReadOnlyHttpResponse>} ReadOnlyFetch
 */

/**
 * @param {{rpcUrl?: unknown, statusRpcUrl?: unknown, fetchImpl?: ReadOnlyFetch}} options
 */
export function createSolanaFinalizedTransactionReader(options) {
  const transactionEndpoint = clean(options?.rpcUrl);
  const statusEndpoint = clean(options?.statusRpcUrl);
  if (!transactionEndpoint) throw new TypeError('rpcUrl is required');
  if (!statusEndpoint) throw new TypeError('statusRpcUrl is required');
  let transactionOrigin;
  let statusOrigin;
  try {
    transactionOrigin = new URL(transactionEndpoint).origin;
    statusOrigin = new URL(statusEndpoint).origin;
  } catch {
    throw new TypeError('Solana RPC URLs must be absolute');
  }
  if (!/^https?:$/.test(new URL(transactionEndpoint).protocol) ||
      !/^https?:$/.test(new URL(statusEndpoint).protocol)) {
    throw new TypeError('Solana RPC URLs must use HTTP(S)');
  }
  if (transactionOrigin === statusOrigin) {
    throw new TypeError('statusRpcUrl must use an independent origin');
  }
  const configuredFetch = options.fetchImpl ?? (typeof globalThis.fetch === 'function' ? /** @type {ReadOnlyFetch} */ (globalThis.fetch) : undefined);
  if (typeof configuredFetch !== 'function') throw new TypeError('fetchImpl must be a function');
  const fetchImpl = /** @type {ReadOnlyFetch} */ (configuredFetch);
  let requestId = 0;

  /**
   * @param {string} endpoint
   * @param {string} method
   * @param {unknown[]} params
   * @returns {Promise<Record<string, unknown>>}
   */
  async function callRpc(endpoint, method, params) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    });
    if (!response || response.ok !== true) throw new Error(`Solana RPC HTTP ${response?.status ?? 'error'}`);
    if (typeof response.json !== 'function') throw new Error('Malformed Solana RPC response');
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || ('error' in payload && payload.error) || !('result' in payload)) {
      throw new Error(`Solana RPC ${method} error`);
    }
    return /** @type {Record<string, unknown>} */ (payload);
  }

  return Object.freeze({
    /**
     * Fetch one transaction by exact signature. This transport deliberately
     * returns raw finalized RPC evidence; CPMM decoding/binding is a separate boundary.
     * A second read-only signature-status query independently binds finalized status
     * to the same signature and slot so missing/pruned/reorg-inconsistent evidence fails closed.
     * @param {unknown} signature
     */
    async readFinalizedTransaction(signature) {
      const exactSignature = clean(signature);
      if (!exactSignature) throw new TypeError('transaction signature is required');
      const transactionParams = [exactSignature, {
        commitment: 'finalized',
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
      }];
      const payload = await callRpc(transactionEndpoint, 'getTransaction', transactionParams);
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
      const signatures = Array.isArray(transaction.signatures) ? transaction.signatures : [];
      const matchingSignatures = signatures.filter((value) => clean(value) === exactSignature);
      if (clean(signatures[0]) !== exactSignature || matchingSignatures.length !== 1) {
        throw new Error('Solana transaction primary signature mismatch');
      }

      const independentPayload = await callRpc(statusEndpoint, 'getTransaction', transactionParams);
      const independentResult = independentPayload.result;
      if (!independentResult || typeof independentResult !== 'object') {
        throw new Error('Independent Solana transaction evidence required');
      }
      const primaryEvidence = {
        slot: r.slot,
        blockTime: r.blockTime,
        transaction: r.transaction,
        meta: r.meta,
      };
      const independent = /** @type {Record<string, unknown>} */ (independentResult);
      const independentEvidence = {
        slot: independent.slot,
        blockTime: independent.blockTime,
        transaction: independent.transaction,
        meta: independent.meta,
      };
      if (canonicalJson(primaryEvidence) !== canonicalJson(independentEvidence)) {
        throw new Error('Independent Solana transaction evidence mismatch');
      }

      const statusPayload = await callRpc(statusEndpoint, 'getSignatureStatuses', [
        [exactSignature],
        { searchTransactionHistory: true },
      ]);
      const statusResult = statusPayload.result;
      if (!statusResult || typeof statusResult !== 'object') {
        throw new Error('Solana finalized signature status required');
      }
      const statusRecord = /** @type {Record<string, unknown>} */ (statusResult);
      const context = statusRecord.context;
      if (!context || typeof context !== 'object') {
        throw new Error('Solana finalized signature status context required');
      }
      const contextSlot = /** @type {Record<string, unknown>} */ (context).slot;
      const statusValue = statusRecord.value;
      if (!Array.isArray(statusValue) || statusValue.length !== 1 ||
          !statusValue[0] || typeof statusValue[0] !== 'object') {
        throw new Error('Solana finalized signature status required');
      }
      const status = /** @type {Record<string, unknown>} */ (statusValue[0]);
      if (!Number.isSafeInteger(contextSlot) ||
          /** @type {number} */ (contextSlot) < /** @type {number} */ (r.slot) ||
          status.err != null ||
          status.confirmationStatus !== 'finalized' ||
          status.confirmations !== null ||
          !Number.isSafeInteger(status.slot) ||
          status.slot !== r.slot) {
        throw new Error('Solana finalized signature status mismatch');
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
