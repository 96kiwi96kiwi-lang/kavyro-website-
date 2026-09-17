// Pure reward-policy layer. It performs no on-chain discovery and no payout.
// Amounts use bigint base units to avoid floating-point rounding errors.

export const REWARD_POLICY_VERSION = 'v1-draft';

export function calculateReward({ verifiedObservation, contributedKvroBaseUnits }) {
  if (!verifiedObservation || typeof verifiedObservation !== 'object') {
    throw new Error('VERIFIED_OBSERVATION_REQUIRED');
  }
  if (verifiedObservation.poolVerified !== true || !verifiedObservation.poolId) {
    throw new Error('POOL_NOT_VERIFIED');
  }
  if (verifiedObservation.eligible !== true) {
    throw new Error('POSITION_NOT_ELIGIBLE');
  }
  if (typeof contributedKvroBaseUnits !== 'bigint' || contributedKvroBaseUnits <= 0n) {
    throw new Error('INVALID_CONTRIBUTION_AMOUNT');
  }

  // Current draft incentive: reward the same KVRO amount as the verified KVRO
  // contribution. This only computes an entitlement; it never transfers tokens.
  return Object.freeze({
    policyVersion: REWARD_POLICY_VERSION,
    wallet: verifiedObservation.wallet,
    positionId: verifiedObservation.positionId,
    observationPeriod: verifiedObservation.observationPeriod,
    poolId: verifiedObservation.poolId,
    contributedKvroBaseUnits,
    rewardKvroBaseUnits: contributedKvroBaseUnits,
    payoutAuthorized: false,
  });
}
