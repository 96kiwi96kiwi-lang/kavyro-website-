import { validateRaydiumPool } from './pool-validator.js';
import { observationPeriodForTimestamp } from './observation-period.js';

/**
 * @typedef {object} PositionObservation
 * @property {unknown} [wallet]
 * @property {unknown} [positionId]
 * @property {unknown} [observationPeriod]
 * @property {unknown} [observedAtSeconds]
 * @property {unknown} [eligible]
 */

/**
 * Bridges independent pool validation to the reward ledger without trusting a
 * caller-supplied poolVerified boolean or Pool ID. The supplied observation
 * period must also agree with its timestamp-derived period so callers cannot
 * accelerate sustained-holding evidence by forging period indexes. This
 * boundary does not prove LP ownership or contribution amount and cannot
 * authorize payout.
 *
 * @param {unknown} input
 * @returns {Readonly<{
 *   wallet: string,
 *   positionId: string,
 *   observationPeriod: number,
 *   observedAtSeconds: number,
 *   eligible: true,
 *   poolVerified: true,
 *   poolId: string,
 *   payoutAuthorized: false
 * }>}
 */
export function buildVerifiedObservation(input) {
  if (!input || typeof input !== 'object' || !('candidatePool' in input) || !('position' in input)) {
    throw new Error('VERIFIED_OBSERVATION_INPUT_INVALID');
  }

  const validation = validateRaydiumPool(input.candidatePool);
  if (validation.verified !== true || typeof validation.poolId !== 'string' || !validation.poolId) {
    throw new Error(`POOL_NOT_VERIFIED:${validation.reason}`);
  }

  const rawPosition = input.position;
  if (!rawPosition || typeof rawPosition !== 'object') {
    throw new Error('POSITION_DATA_MISSING');
  }

  /** @type {PositionObservation} */
  const position = rawPosition;
  if (position.eligible !== true) throw new Error('POSITION_NOT_ELIGIBLE');

  const wallet = typeof position.wallet === 'string' ? position.wallet.trim() : '';
  const positionId = typeof position.positionId === 'string' ? position.positionId.trim() : '';
  const observationPeriod = position.observationPeriod;
  const observedAtSeconds = position.observedAtSeconds;

  if (!wallet || !positionId) throw new Error('POSITION_IDENTITY_INVALID');
  if (typeof observationPeriod !== 'number' || !Number.isSafeInteger(observationPeriod) || observationPeriod < 0) {
    throw new Error('OBSERVATION_PERIOD_INVALID');
  }
  if (typeof observedAtSeconds !== 'number' || !Number.isSafeInteger(observedAtSeconds) || observedAtSeconds < 0) {
    throw new Error('OBSERVATION_TIMESTAMP_INVALID');
  }
  if (observationPeriodForTimestamp(observedAtSeconds) !== observationPeriod) {
    throw new Error('OBSERVATION_PERIOD_MISMATCH');
  }

  return Object.freeze({
    wallet,
    positionId,
    observationPeriod,
    observedAtSeconds,
    eligible: true,
    poolVerified: true,
    poolId: validation.poolId,
    payoutAuthorized: false,
  });
}
