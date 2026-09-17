import { validateRaydiumPool } from './pool-validator.js';

// Bridges pool validation to the reward ledger without trusting a caller-supplied
// `poolVerified` boolean or Pool ID. No discovery or payout occurs here.
export function buildVerifiedObservation({ candidatePool, position }) {
  const validation = validateRaydiumPool(candidatePool);
  if (validation.verified !== true) {
    throw new Error(`POOL_NOT_VERIFIED:${validation.reason}`);
  }

  if (!position || typeof position !== 'object') {
    throw new Error('POSITION_DATA_MISSING');
  }

  if (position.eligible !== true) {
    throw new Error('POSITION_NOT_ELIGIBLE');
  }

  return Object.freeze({
    wallet: position.wallet,
    positionId: position.positionId,
    observationPeriod: position.observationPeriod,
    eligible: true,
    poolVerified: true,
    poolId: validation.poolId,
  });
}
