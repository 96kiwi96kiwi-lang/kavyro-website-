// KAVYRO Liquidity Rewards — read-only discovery adapter
// Converts data returned by an injected read-only fetcher into normalized candidates.
// This module deliberately has no wallet, signing, transaction-building, or send path.

import { normalizeDiscoveredPools } from './pool-discovery.js';

/** @typedef {{ fetchPools?: unknown, source?: unknown }} ReadOnlyDiscoveryInput */

/**
 * @param {unknown} [input]
 * @returns {Promise<Readonly<{
 *   ok: boolean,
 *   source: string | null,
 *   candidates: readonly unknown[],
 *   reasons: readonly string[],
 *   payoutAuthorized: false,
 *   canBuildTransaction: false,
 *   canSignTransaction: false,
 *   canSendTransaction: false
 * }>>}
 */
export async function discoverPoolsReadOnly(input = {}) {
  /** @type {ReadOnlyDiscoveryInput} */
  const request = input && typeof input === 'object' ? input : {};
  const { fetchPools, source } = request;

  if (typeof fetchPools !== 'function') {
    return Object.freeze({
      ok: false,
      source: null,
      candidates: Object.freeze([]),
      reasons: Object.freeze(['READ_ONLY_FETCHER_MISSING']),
      payoutAuthorized: false,
      canBuildTransaction: false,
      canSignTransaction: false,
      canSendTransaction: false,
    });
  }

  const normalizedSource = typeof source === 'string' && source.trim() ? source.trim() : null;
  if (!normalizedSource) {
    return Object.freeze({
      ok: false,
      source: null,
      candidates: Object.freeze([]),
      reasons: Object.freeze(['DISCOVERY_SOURCE_MISSING']),
      payoutAuthorized: false,
      canBuildTransaction: false,
      canSignTransaction: false,
      canSendTransaction: false,
    });
  }

  try {
    /** @type {unknown} */
    const response = await fetchPools();
    if (!Array.isArray(response)) throw new TypeError('READ_ONLY_DISCOVERY_INVALID_RESPONSE');

    const records = response.filter((record) => record !== null && typeof record === 'object');
    const candidates = normalizeDiscoveredPools(records.map((record) => ({
      ...record,
      source: normalizedSource,
    })));

    return Object.freeze({
      ok: true,
      source: normalizedSource,
      candidates,
      reasons: Object.freeze([]),
      payoutAuthorized: false,
      canBuildTransaction: false,
      canSignTransaction: false,
      canSendTransaction: false,
    });
  } catch {
    return Object.freeze({
      ok: false,
      source: normalizedSource,
      candidates: Object.freeze([]),
      reasons: Object.freeze(['READ_ONLY_DISCOVERY_FAILED']),
      payoutAuthorized: false,
      canBuildTransaction: false,
      canSignTransaction: false,
      canSendTransaction: false,
    });
  }
}
