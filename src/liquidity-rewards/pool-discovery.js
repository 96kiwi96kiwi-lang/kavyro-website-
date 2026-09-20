// KAVYRO Liquidity Rewards — read-only pool discovery normalization
// Accepts externally observed pool records only. It performs no network writes
// and deliberately cannot build, sign, send, or authorize transactions.

import { createReadOnlyPoolCandidate } from './read-only-boundary.js';

/**
 * @typedef {object} DiscoveredPoolRecord
 * @property {unknown} [source]
 * @property {unknown} [poolId]
 * @property {unknown} [mintA]
 * @property {unknown} [mintB]
 * @property {unknown} [onChainExists]
 */

/**
 * Narrow an untrusted discovery record before reading any fields. Discovery is
 * evidence only; it never proves on-chain existence, LP ownership, contribution,
 * eligibility, entitlement, or payout authorization. In particular, a provider
 * supplied `onChainExists` flag is ignored: only the independent RPC verification
 * boundary may establish on-chain existence later in the pipeline.
 * @param {unknown} record
 */
export function normalizeDiscoveredPool(record = {}) {
  /** @type {DiscoveredPoolRecord} */
  const input = record && typeof record === 'object' ? record : {};
  const source = typeof input.source === 'string' && input.source.trim()
    ? input.source.trim()
    : null;

  const candidate = createReadOnlyPoolCandidate({
    poolId: input.poolId,
    mintA: input.mintA,
    mintB: input.mintB,
    // Discovery is untrusted. Never promote a provider assertion to RPC proof.
    onChainExists: false,
  });

  const reasons = [...candidate.reasons];
  if (!source) reasons.push('DISCOVERY_SOURCE_MISSING');

  return Object.freeze({
    ...candidate,
    source,
    discoveryOnly: true,
    candidateVerified: false,
    payoutAuthorized: false,
    canBuildTransaction: false,
    canSignTransaction: false,
    canSendTransaction: false,
    reasons: Object.freeze(reasons),
  });
}

/**
 * @param {unknown} records
 */
export function normalizeDiscoveredPools(records) {
  if (!Array.isArray(records)) return Object.freeze([]);
  return Object.freeze(records.map((record) => normalizeDiscoveredPool(record)));
}
