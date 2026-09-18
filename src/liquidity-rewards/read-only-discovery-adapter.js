// KAVYRO Liquidity Rewards — read-only discovery adapter
// Converts data returned by an injected read-only fetcher into normalized candidates.
// This module deliberately has no wallet, signing, transaction-building, or send path.

import { normalizeDiscoveredPools } from './pool-discovery.js';

export async function discoverPoolsReadOnly({ fetchPools, source } = {}) {
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
    const records = await fetchPools();
    if (!Array.isArray(records)) throw new TypeError('READ_ONLY_DISCOVERY_INVALID_RESPONSE');

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
