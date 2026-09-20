// KAVYRO Liquidity Rewards — fail-closed read-only observation pipeline.
// This module composes provider discovery with independent RPC verification and
// observation safety validation. It never authorizes payouts or exposes transaction capabilities.

import { discoverFromReadOnlyProvider } from './provider-discovery.js';
import { enforceObservationSafety } from './observation-safety.js';

const DENIED = Object.freeze({
  payoutAuthorized: false,
  canBuildTransaction: false,
  canSignTransaction: false,
  canSendTransaction: false,
});

/**
 * @typedef {Readonly<{
 *   poolId: string,
 *   mintA: string,
 *   mintB: string,
 *   source?: string,
 *   onChainExists?: boolean,
 *   poolVerified?: boolean
 * }>} SafeObservation
 * @typedef {{ verifyCandidate: (candidate: unknown) => Promise<unknown> }} ReadOnlyPoolVerifier
 */

/**
 * Collect discovery candidates through an independent RPC verification boundary
 * before observation safety validation. Discovery, RPC pool verification, and
 * locally safe observations are not proof of LP ownership, contribution,
 * eligibility, entitlement, or payout authorization. Missing/malformed verifier
 * input fails closed.
 *
 * @param {unknown} provider
 * @param {unknown} verifier
 * @returns {Promise<Readonly<{
 *   ok: boolean,
 *   source: string | null,
 *   observations: readonly SafeObservation[],
 *   reasons: readonly string[],
 *   rejectedCount?: number,
 *   payoutAuthorized: false,
 *   canBuildTransaction: false,
 *   canSignTransaction: false,
 *   canSendTransaction: false
 * }>>}
 */
export async function collectSafeObservations(provider, verifier) {
  const discovery = await discoverFromReadOnlyProvider(provider);

  if (!discovery.ok) {
    return Object.freeze({
      ok: false,
      source: discovery.source ?? null,
      observations: /** @type {readonly SafeObservation[]} */ (Object.freeze([])),
      reasons: Object.freeze(discovery.reasons ?? ['DISCOVERY_FAILED']),
      ...DENIED,
    });
  }

  if (!verifier || typeof verifier !== 'object' || !('verifyCandidate' in verifier) || typeof verifier.verifyCandidate !== 'function') {
    return Object.freeze({
      ok: false,
      source: discovery.source,
      observations: /** @type {readonly SafeObservation[]} */ (Object.freeze([])),
      reasons: Object.freeze(['RPC_VERIFIER_REQUIRED']),
      ...DENIED,
    });
  }

  /** @type {ReadOnlyPoolVerifier} */
  const poolVerifier = verifier;
  /** @type {SafeObservation[]} */
  const observations = [];
  /** @type {string[]} */
  const rejected = [];
  /** @type {Set<string>} */
  const seenPoolIds = new Set();

  for (const candidate of discovery.candidates ?? []) {
    let verification;
    try {
      verification = await poolVerifier.verifyCandidate(candidate);
    } catch {
      rejected.push('RPC_VERIFICATION_FAILED');
      continue;
    }

    if (!verification || typeof verification !== 'object' || !('verified' in verification) || verification.verified !== true) {
      const reason = verification && typeof verification === 'object' && 'reason' in verification && typeof verification.reason === 'string'
        ? verification.reason
        : 'RPC_VERIFICATION_FAILED';
      rejected.push(reason);
      continue;
    }

    const checked = enforceObservationSafety(verification);
    if (!checked.ok || !checked.observation) {
      rejected.push(...checked.reasons);
      continue;
    }

    if (seenPoolIds.has(checked.observation.poolId)) {
      rejected.push('DUPLICATE_POOL_OBSERVATION');
      continue;
    }

    seenPoolIds.add(checked.observation.poolId);
    observations.push(checked.observation);
  }

  return Object.freeze({
    ok: true,
    source: discovery.source,
    observations: Object.freeze(observations),
    rejectedCount: rejected.length,
    reasons: Object.freeze(rejected),
    ...DENIED,
  });
}
