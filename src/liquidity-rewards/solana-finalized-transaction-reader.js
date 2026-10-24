// Read-only Solana JSON-RPC finalized transaction reader.
// It can fetch transaction history evidence but cannot build, sign, or send transactions.

/** @param {unknown} value @returns {string} */
const clean = (value) => typeof value === 'string' ? value.trim() : '';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** @param {string} value @returns {boolean} */
function isEncodedSolanaSignature(value) {
  let leadingZeroBytes = 0;
  while (leadingZeroBytes < value.length && value[leadingZeroBytes] === '1') {
    leadingZeroBytes += 1;
  }
  let numeric = 0n;
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return false;
    numeric = numeric * 58n + BigInt(digit);
  }
  let nonZeroBytes = 0;
  while (numeric > 0n) {
    numeric >>= 8n;
    nonZeroBytes += 1;
  }
  return leadingZeroBytes + nonZeroBytes === 64;
}

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

const MAX_RPC_RESPONSE_BYTES = 4 * 1024 * 1024;

/**
 * @typedef {{read: () => Promise<{done: boolean, value?: Uint8Array}>, cancel: () => Promise<void>}} ReadOnlyBodyReader
 * @typedef {{
 *   ok: boolean,
 *   status?: number,
 *   headers?: {get: (name: string) => string | null},
 *   body?: {getReader: () => ReadOnlyBodyReader} | null
 * }} ReadOnlyHttpResponse
 * @typedef {(url: string, init: {method: 'POST', headers: {'content-type': string}, body: string, signal: AbortSignal, redirect: 'error'}) => Promise<ReadOnlyHttpResponse>} ReadOnlyFetch
 */

/**
 * Consume JSON-RPC evidence with a hard byte cap. The caller's abort timer stays
 * active while this function reads the response stream.
 * @param {ReadOnlyHttpResponse} response
 * @param {string} method
 * @returns {Promise<unknown>}
 */
async function readBoundedJson(response, method) {
  const rawContentType = clean(response.headers?.get?.('content-type'));
  const mediaType = rawContentType.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    throw new Error(`Solana RPC ${method} content type rejected`);
  }

  const contentLength = clean(response.headers?.get?.('content-length'));
  if (contentLength) {
    if (!/^\d+$/.test(contentLength) ||
        BigInt(contentLength) > BigInt(MAX_RPC_RESPONSE_BYTES)) {
      throw new Error(`Solana RPC ${method} response too large`);
    }
  }

  let bodyText = '';
  const body = response.body;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let receivedBytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) {
        throw new Error(`Malformed Solana RPC ${method} response body`);
      }
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > MAX_RPC_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // The response is rejected even if cancelling the untrusted stream fails.
        }
        throw new Error(`Solana RPC ${method} response too large`);
      }
      try {
        bodyText += decoder.decode(chunk.value, { stream: true });
      } catch {
        try {
          await reader.cancel();
        } catch {
          // Invalid evidence remains rejected even if stream cancellation fails.
        }
        throw new Error(`Malformed Solana RPC ${method} UTF-8`);
      }
    }
    try {
      bodyText += decoder.decode();
    } catch {
      throw new Error(`Malformed Solana RPC ${method} UTF-8`);
    }
  } else {
    throw new Error(`Malformed Solana RPC ${method} response body`);
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    throw new Error(`Malformed Solana RPC ${method} JSON`);
  }
}

/**
 * @param {{rpcUrl?: unknown, statusRpcUrl?: unknown, timeoutMs?: unknown, fetchImpl?: ReadOnlyFetch}} options
 */
export function createSolanaFinalizedTransactionReader(options) {
  const transactionEndpoint = clean(options?.rpcUrl);
  const statusEndpoint = clean(options?.statusRpcUrl);
  if (!transactionEndpoint) throw new TypeError('rpcUrl is required');
  if (!statusEndpoint) throw new TypeError('statusRpcUrl is required');
  let transactionUrl;
  let statusUrl;
  try {
    transactionUrl = new URL(transactionEndpoint);
    statusUrl = new URL(statusEndpoint);
  } catch {
    throw new TypeError('Solana RPC URLs must be absolute');
  }
  if (transactionUrl.protocol !== 'https:' || statusUrl.protocol !== 'https:') {
    throw new TypeError('Solana RPC URLs must use HTTPS');
  }
  if (transactionUrl.username || transactionUrl.password ||
      statusUrl.username || statusUrl.password) {
    throw new TypeError('Solana RPC URLs must not contain userinfo credentials');
  }
  if (transactionUrl.hostname === statusUrl.hostname) {
    throw new TypeError('statusRpcUrl must use an independent hostname');
  }
  const configuredFetch = options.fetchImpl ?? (typeof globalThis.fetch === 'function' ? /** @type {ReadOnlyFetch} */ (globalThis.fetch) : undefined);
  if (typeof configuredFetch !== 'function') throw new TypeError('fetchImpl must be a function');
  const fetchImpl = /** @type {ReadOnlyFetch} */ (configuredFetch);
  const configuredTimeout = options?.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(configuredTimeout) ||
      /** @type {number} */ (configuredTimeout) <= 0 ||
      /** @type {number} */ (configuredTimeout) > 30_000) {
    throw new TypeError('timeoutMs must be an integer from 1 to 30000');
  }
  const timeoutMs = /** @type {number} */ (configuredTimeout);
  let requestId = 0;

  /**
   * @param {string} endpoint
   * @param {string} method
   * @param {unknown[]} params
   * @returns {Promise<Record<string, unknown>>}
   */
  async function callRpc(endpoint, method, params) {
    const id = ++requestId;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: controller.signal,
        // A redirect could collapse the configured endpoint separation or cross
        // a transport boundary. Evidence reads must stay bound to the exact URL.
        redirect: 'error',
      });
      if (!response || response.ok !== true) throw new Error(`Solana RPC HTTP ${response?.status ?? 'error'}`);
      const payload = await readBoundedJson(response, method);
      if (!payload || typeof payload !== 'object' || ('error' in payload && payload.error) || !('result' in payload)) {
        throw new Error(`Solana RPC ${method} error`);
      }
      const rpcPayload = /** @type {Record<string, unknown>} */ (payload);
      if (rpcPayload.jsonrpc !== '2.0' || rpcPayload.id !== id) {
        throw new Error(`Solana RPC ${method} response mismatch`);
      }
      return rpcPayload;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Solana RPC ${method} timeout`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
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
      if (typeof signature !== 'string' || signature !== exactSignature ||
          !isEncodedSolanaSignature(exactSignature)) {
        throw new TypeError('transaction signature must be canonical base58 encoding of 64 bytes');
      }
      const transactionParams = [exactSignature, {
        commitment: 'finalized',
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
      }];
      const statusParams = [
        [exactSignature],
        { searchTransactionHistory: true },
      ];
      const payload = await callRpc(transactionEndpoint, 'getTransaction', transactionParams);
      const independentPayload = await callRpc(statusEndpoint, 'getTransaction', transactionParams);
      const result = payload.result;
      const independentResult = independentPayload.result;
      if (result == null || independentResult == null) {
        if (result == null && independentResult == null) {
          for (const [endpoint, source] of [
            [transactionEndpoint, 'Primary'],
            [statusEndpoint, 'Independent'],
          ]) {
            const absencePayload = await callRpc(endpoint, 'getSignatureStatuses', statusParams);
            const absenceResult = absencePayload.result;
            if (!absenceResult || typeof absenceResult !== 'object') {
              throw new Error(`${source} Solana transaction absence status required`);
            }
            const absenceRecord = /** @type {Record<string, unknown>} */ (absenceResult);
            const absenceContext = absenceRecord.context;
            const absenceValue = absenceRecord.value;
            const absenceContextSlot = absenceContext && typeof absenceContext === 'object'
              ? /** @type {Record<string, unknown>} */ (absenceContext).slot
              : undefined;
            if (!Number.isSafeInteger(absenceContextSlot) ||
                /** @type {number} */ (absenceContextSlot) < 0 ||
                !Array.isArray(absenceValue) ||
                absenceValue.length !== 1 ||
                absenceValue[0] !== null) {
              throw new Error(`${source} Solana transaction absence status mismatch`);
            }
          }
          return Object.freeze({ exists: false, signature: exactSignature });
        }
        throw new Error('Independent Solana transaction absence evidence mismatch');
      }
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

      if (typeof independentResult !== 'object') {
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

      for (const [endpoint, source] of [
        [transactionEndpoint, 'Primary'],
        [statusEndpoint, 'Independent'],
      ]) {
        const statusPayload = await callRpc(endpoint, 'getSignatureStatuses', statusParams);
        const statusResult = statusPayload.result;
        if (!statusResult || typeof statusResult !== 'object') {
          throw new Error(`${source} Solana finalized signature status required`);
        }
        const statusRecord = /** @type {Record<string, unknown>} */ (statusResult);
        const context = statusRecord.context;
        if (!context || typeof context !== 'object') {
          throw new Error(`${source} Solana finalized signature status context required`);
        }
        const contextSlot = /** @type {Record<string, unknown>} */ (context).slot;
        const statusValue = statusRecord.value;
        if (!Array.isArray(statusValue) || statusValue.length !== 1 ||
            !statusValue[0] || typeof statusValue[0] !== 'object') {
          throw new Error(`${source} Solana finalized signature status required`);
        }
        const status = /** @type {Record<string, unknown>} */ (statusValue[0]);
        if (!Number.isSafeInteger(contextSlot) ||
            /** @type {number} */ (contextSlot) < /** @type {number} */ (r.slot) ||
            status.err != null ||
            status.confirmationStatus !== 'finalized' ||
            status.confirmations !== null ||
            !Number.isSafeInteger(status.slot) ||
            status.slot !== r.slot) {
          throw new Error(`${source} Solana finalized signature status mismatch`);
        }
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
