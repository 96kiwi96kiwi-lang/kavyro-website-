// Pure reward-policy layer. It performs no on-chain discovery and no payout.
// Amounts use bigint base units to avoid floating-point rounding errors.

export const REWARD_POLICY_VERSION = 'v1-draft';

/**
 * A verified observation is still only sampled evidence. It must not be treated
 * as proof of uninterrupted holding or as payout authorization.
 * @typedef {Readonly<{
 *   poolVerified: true,
 *   eligible: true,
 *   poolId: string,
 *   wallet: string,
 *   positionId: string,
 *   observationPeriod: string
 * }>} RewardVerifiedObservation
 */

/**
 * @typedef {Readonly<{
 *   policyVersion: string,
 *   wallet: string,
 *   positionId: string,
 *   observationPeriod: string,
 *   poolId: string,
 *   contributedKvroBaseUnits: bigint,
 *   rewardKvroBaseUnits: bigint,
 *   payoutAuthorized: false
 * }>} RewardEntitlement
 */

/**
 * Compute a read-only entitlement from already verified evidence.
 * This function cannot authorize or perform a payout.
 *
 * @param {unknown} input
 * @returns {RewardEntitlement}
 */
export function calculateReward(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('REWARD_INPUT_REQUIRED');
  }

  const { verifiedObservation, contributedKvroBaseUnits } = /** @type {{
   * verifiedObservation?: unknown,
   * contributedKvroBaseUnits?: unknown
   * }} */ (input);

  if (!verifiedObservation || typeof verifiedObservation !== 'object') {
    throw new Error('VERIFIED_OBSERVATION_REQUIRED');
  }

  const observation = /** @type {Partial<RewardVerifiedObservation>} */ (verifiedObservation);
  if (observation.poolVerified !== true || typeof observation.poolId !== 'string' || !observation.poolId) {
    throw new Error('POOL_NOT_VERIFIED');
  }
  if (observation.eligible !== true) {
    throw new Error('POSITION_NOT_ELIGIBLE');
  }
  if (
    typeof observation.wallet !== 'string' || !observation.wallet ||
    typeof observation.positionId !== 'string' || !observation.positionId ||
    typeof observation.observationPeriod !== 'string' || !observation.observationPeriod
  ) {
    throw new Error('INCOMPLETE_VERIFIED_OBSERVATION');
  }
  if (typeof contributedKvroBaseUnits !== 'bigint' || contributedKvroBaseUnits <= 0n) {
    throw new Error('INVALID_CONTRIBUTION_AMOUNT');
  }

  // Draft 1:1 calculation only. This produces an entitlement record; rewards
  // remain disabled and no value here is permission to build/sign/send a tx.
  return Object.freeze({
    policyVersion: REWARD_POLICY_VERSION,
    wallet: observation.wallet,
    positionId: observation.positionId,
    observationPeriod: observation.observationPeriod,
    poolId: observation.poolId,
    contributedKvroBaseUnits,
    rewardKvroBaseUnits: contributedKvroBaseUnits,
    payoutAuthorized: false,
  });
}
