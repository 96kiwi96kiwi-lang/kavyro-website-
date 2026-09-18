// KAVYRO Liquidity Rewards — read-only pool discovery normalization
// Accepts externally observed pool records only. It performs no network writes
// and deliberately cannot build, sign, send, or authorize transactions.

import { createReadOnlyPoolCandidate } from './read-only-boundary.js';

export function normalizeDiscoveredPool(record = {}) {
  const source = typeof record.source === 'string' && record.source.trim()
    ? record.source.trim()
    : null;

  const candidate = createReadOnlyPoolCandidate({
    poolId: record.poolId,
    mintA: record.mintA,
    mintB: record.mintB,
    onChainExists: record.onChainExists,
  });

  const reasons = [...candidate.reasons];
  if (!source) reasons.push('DISCOVERY_SOURCE_MISSING');

  return Object.freeze({
    ...candidate,
    source,
    candidateVerified: candidate.candidateVerified && source !== null,
    payoutAuthorized: false,
    canBuildTransaction: false,
    canSignTransaction: false,
    canSendTransaction: false,
    reasons: Object.freeze(reasons),
  });
}

export function normalizeDiscoveredPools(records) {
  if (!Array.isArray(records)) return Object.freeze([]);
  return Object.freeze(records.map((record) => normalizeDiscoveredPool(record)));
}
