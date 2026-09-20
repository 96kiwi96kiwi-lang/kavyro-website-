// KAVYRO Liquidity Rewards — fail-closed read-only observation pipeline.
// This module composes provider discovery with observation safety validation.
// It never authorizes payouts or exposes transaction capabilities.

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
 */

/**
 * Collect discovery candidates through the read-only safety boundary. Discovery
 * and locally safe observations are not proof of LP ownership, contribution,
 * eligibility, entitlement, or payout authorization. Unknown providers fail
 * closed in the discovery layer.
 *
 * @param {unknown} provider
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
export async function collectSafeObservations(provider) {
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

  /** @type {SafeObservation[]} */
  const observations = [];
  /** @type {string[]} */
  const rejected = [];
  /** @type {Set<string>} */
  const seenPoolIds = new Set();

  for (const candidate of discovery.candidates ?? []) {
    const checked = enforceObservationSafety(candidate);
    if (!checked.ok) {
      rejected.push(...checked.reasons);
      continue;
    }

    // A pool must appear at most once in a collection. This prevents duplicate
    // upstream observations from ever becoming duplicate reward inputs later.
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
