// KAVYRO Liquidity Rewards — sustained-holding eligibility.
// Pure, fail-closed logic. It does not discover pools, read wallets, or authorize payouts.

export const MIN_CONSECUTIVE_OBSERVATION_PERIODS = 24;

function requirePeriod(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_OBSERVATION_PERIOD');
  return value;
}

function requirePositiveBigInt(value) {
  if (typeof value !== 'bigint' || value <= 0n) throw new Error('INVALID_LP_AMOUNT');
  return value;
}

export function evaluateHoldingEligibility({ observations, minimumPeriods = MIN_CONSECUTIVE_OBSERVATION_PERIODS }) {
  if (!Array.isArray(observations) || observations.length === 0) throw new Error('OBSERVATIONS_REQUIRED');
  if (!Number.isSafeInteger(minimumPeriods) || minimumPeriods < 2) throw new Error('INVALID_MINIMUM_PERIODS');

  const normalized = observations.map((observation) => {
    if (!observation || typeof observation !== 'object') throw new Error('INVALID_OBSERVATION');
    if (observation.poolVerified !== true || !observation.poolId) throw new Error('POOL_NOT_VERIFIED');
    if (!observation.wallet || !observation.positionId) throw new Error('POSITION_IDENTITY_REQUIRED');
    return {
      ...observation,
      observationPeriod: requirePeriod(observation.observationPeriod),
      contributedKvroBaseUnits: requirePositiveBigInt(observation.contributedKvroBaseUnits),
    };
  }).sort((a, b) => a.observationPeriod - b.observationPeriod);

  const first = normalized[0];
  const seenPeriods = new Set();
  let minimumContribution = first.contributedKvroBaseUnits;

  for (let i = 0; i < normalized.length; i += 1) {
    const current = normalized[i];
    if (current.wallet !== first.wallet || current.positionId !== first.positionId || current.poolId !== first.poolId) {
      throw new Error('OBSERVATION_IDENTITY_CHANGED');
    }
    if (seenPeriods.has(current.observationPeriod)) throw new Error('DUPLICATE_OBSERVATION_PERIOD');
    seenPeriods.add(current.observationPeriod);
    if (i > 0 && current.observationPeriod !== normalized[i - 1].observationPeriod + 1) {
      throw new Error('OBSERVATION_PERIOD_GAP');
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
    lastObservationPeriod: normalized.at(-1).observationPeriod,
    consecutivePeriods: normalized.length,
    minimumContributionKvroBaseUnits: minimumContribution,
    reason: eligible ? 'SUSTAINED_HOLDING_VERIFIED' : 'INSUFFICIENT_HOLDING_PERIOD',
    payoutAuthorized: false,
  });
}
