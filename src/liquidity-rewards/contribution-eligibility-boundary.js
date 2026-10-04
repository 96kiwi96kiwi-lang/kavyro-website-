// Trust-boundary adapter from verified historical CPMM evidence into eligibility observations.
// It cannot discover evidence, infer a contribution from current LP balance, or authorize payout.
import { verifyCpmmContributionReceipt } from './cpmm-contribution-receipt.js';

/**
 * Bind an independently verified historical contribution receipt to one trusted
 * holding observation. Caller-supplied contributionProven/amount fields are ignored.
 * @param {unknown} receiptValue
 * @param {unknown} observationValue
 */
export function bindContributionEvidenceToObservation(receiptValue, observationValue) {
  const receipt = verifyCpmmContributionReceipt(receiptValue);
  if (!observationValue || typeof observationValue !== 'object') throw new Error('HOLDING_OBSERVATION_REQUIRED');
  const observation = /** @type {Record<string, unknown>} */ (observationValue);
  for (const key of ['wallet', 'poolId']) {
    if (observation[key] !== receipt[key]) throw new Error('CONTRIBUTION_OBSERVATION_IDENTITY_MISMATCH');
  }
  if (typeof observation.positionId !== 'string' || !observation.positionId) throw new Error('POSITION_IDENTITY_REQUIRED');
  if (observation.poolVerified !== true) throw new Error('POOL_NOT_VERIFIED');
  return Object.freeze({
    ...observation,
    contributionProven: true,
    contributedKvroBaseUnits: receipt.contributedKvroBaseUnits,
    contributionEvidenceId: receipt.contributionEvidenceId,
    contributionSignature: receipt.signature,
    contributionSlot: receipt.contextSlot,
    contributionObservedAtSeconds: receipt.observedAtSeconds,
    payoutAuthorized: false,
  });
}
