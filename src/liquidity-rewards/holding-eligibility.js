// KAVYRO Liquidity Rewards — sustained-holding eligibility.
// Pure, fail-closed logic. It does not discover pools, read wallets, or authorize payouts.

import { observationPeriodForTimestamp } from './observation-period.js';

export const MIN_CONSECUTIVE_OBSERVATION_PERIODS = 24;

/**
 * @typedef {object} HoldingObservation
 * @property {boolean} poolVerified
 * @property {string} poolId
 * @property {string} wallet
 * @property {string} positionId
 * @property {number} observationPeriod
 * @property {number} contextSlot
 * @property {number} observedAtSeconds
 * @property {bigint} contributedKvroBaseUnits
 */

/** @typedef {object} HoldingEligibilityInput
 * @property {HoldingObservation[]} observations
 * @property {number} [minimumPeriods]
 */

/** @param {unknown} value @returns {number} */
function requirePeriod(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_OBSERVATION_PERIOD');
  return value;
}

/** @param {unknown} value @returns {number} */
function requireTrustedTimeInteger(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('OBSERVATION_TRUSTED_TIME_REQUIRED');
  }
  return value;
}

/** @param {unknown} value @returns {bigint} */
function requirePositiveBigInt(value) {
  if (typeof value !== 'bigint' || value <= 0n) throw new Error('INVALID_LP_AMOUNT');
  return value;
}

/**
 * Evaluate whether one already-verified LP position has been observed for a
 * continuous minimum number of periods. Trusted RPC slot/time must advance
 * with the sequence so caller-supplied period labels cannot create eligibility.
 * A successful result never authorizes payout.
 *
 * @param {HoldingEligibilityInput} input
 */
export function evaluateHoldingEligibility({ observations, minimumPeriods = MIN_CONSECUTIVE_OBSERVATION_PERIODS }) {
  if (!Array.isArray(observations) || observations.length === 0) throw new Error('OBSERVATIONS_REQUIRED');
  if (!Number.isSafeInteger(minimumPeriods) || minimumPeriods < 2) throw new Error('INVALID_MINIMUM_PERIODS');

  const normalized = observations.map((observation) => {
    if (!observation || typeof observation !== 'object') throw new Error('INVALID_OBSERVATION');
    if (observation.poolVerified !== true || !observation.poolId) throw new Error('POOL_NOT_VERIFIED');
    if (!observation.wallet || !observation.positionId) throw new Error('POSITION_IDENTITY_REQUIRED');
    const observationPeriod = requirePeriod(observation.observationPeriod);
    const contextSlot = requireTrustedTimeInteger(observation.contextSlot);
    const observedAtSeconds = requireTrustedTimeInteger(observation.observedAtSeconds);
    if (observationPeriodForTimestamp(observedAtSeconds) !== observationPeriod) {
      throw new Error('OBSERVATION_TRUSTED_TIME_PERIOD_MISMATCH');
    }
    return {
      ...observation,
      observationPeriod,
      contextSlot,
      observedAtSeconds,
      contributedKvroBaseUnits: requirePositiveBigInt(observation.contributedKvroBaseUnits),
    };
  }).sort((a, b) => a.observationPeriod - b.observationPeriod);

  const first = normalized[0];
  const seenPeriods = new Set();
  const seenSlots = new Set();
  const seenTimes = new Set();
  let minimumContribution = first.contributedKvroBaseUnits;

  for (let i = 0; i < normalized.length; i += 1) {
    const current = normalized[i];
    if (current.wallet !== first.wallet || current.positionId !== first.positionId || current.poolId !== first.poolId) {
      throw new Error('OBSERVATION_IDENTITY_CHANGED');
    }
    if (seenPeriods.has(current.observationPeriod)) throw new Error('DUPLICATE_OBSERVATION_PERIOD');
    if (seenSlots.has(current.contextSlot) || seenTimes.has(current.observedAtSeconds)) {
      throw new Error('OBSERVATION_REPLAY_DETECTED');
    }
    seenPeriods.add(current.observationPeriod);
    seenSlots.add(current.contextSlot);
    seenTimes.add(current.observedAtSeconds);
    if (i > 0) {
      const previous = normalized[i - 1];
      if (current.observationPeriod !== previous.observationPeriod + 1) throw new Error('OBSERVATION_PERIOD_GAP');
      if (current.contextSlot <= previous.contextSlot || current.observedAtSeconds <= previous.observedAtSeconds) {
        throw new Error('OBSERVATION_REPLAY_DETECTED');
      }
    }
    if (current.contributedKvroBaseUnits < minimumContribution) minimumContribution = current.contributedKvroBaseUnits;
  }

  const eligible = normalized.length >= minimumPeriods;
  return Object.freeze({
    eligible,
    wallet: first.wallet,
    positionId: first.positionId,
    poolId: first.poolId,
    firstObservationPeriod: first.observationPeriod,
    lastObservationPeriod: normalized[normalized.length - 1].observationPeriod,
    consecutivePeriods: normalized.length,
    minimumContributionKvroBaseUnits: minimumContribution,
    reason: eligible ? 'SUSTAINED_HOLDING_VERIFIED' : 'INSUFFICIENT_HOLDING_PERIOD',
    payoutAuthorized: false,
  });
}
