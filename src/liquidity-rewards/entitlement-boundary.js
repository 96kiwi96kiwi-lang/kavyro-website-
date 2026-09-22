// KAVYRO Liquidity Rewards — entitlement decision boundary.
// Pure/read-only. Eligibility never authorizes payout or transaction execution.

/**
 * Convert independently verified contribution evidence plus sustained holding
 * eligibility into a narrow entitlement record. Identity and contribution
 * must agree across both inputs; all mismatches fail closed.
 *
 * @param {unknown} contributionValue
 * @param {unknown} eligibilityValue
 * @returns {Readonly<{
 *   entitlementEligible: true,
 *   wallet: string,
 *   positionId: string,
 *   poolId: string,
 *   entitledKvroBaseUnits: bigint,
 *   ownershipEvidenceId: string,
 *   contributionEvidenceId: string,
 *   firstObservationPeriod: number,
 *   lastObservationPeriod: number,
 *   consecutivePeriods: number,
 *   entitlementAuthorized: false,
 *   payoutAuthorized: false
 * }>}
 */
export function requireVerifiedEntitlement(contributionValue, eligibilityValue) {
  if (!contributionValue || typeof contributionValue !== 'object') throw new Error('CONTRIBUTION_EVIDENCE_REQUIRED');
  if (!eligibilityValue || typeof eligibilityValue !== 'object') throw new Error('ELIGIBILITY_EVIDENCE_REQUIRED');
  const contribution = /** @type {Record<string, unknown>} */ (contributionValue);
  const eligibility = /** @type {Record<string, unknown>} */ (eligibilityValue);

  if (contribution.verified !== true || contribution.poolVerified !== true ||
      contribution.ownershipProven !== true || contribution.contributionProven !== true) {
    throw new Error('VERIFIED_CONTRIBUTION_REQUIRED');
  }
  if (eligibility.eligible !== true || eligibility.reason !== 'SUSTAINED_HOLDING_VERIFIED') {
    throw new Error('SUSTAINED_HOLDING_REQUIRED');
  }

  const identityKeys = ['wallet', 'positionId', 'poolId'];
  for (const key of identityKeys) {
    if (typeof contribution[key] !== 'string' || contribution[key].length === 0 ||
        typeof eligibility[key] !== 'string' || eligibility[key].length === 0) {
      throw new Error('ENTITLEMENT_IDENTITY_REQUIRED');
    }
    if (contribution[key] !== eligibility[key]) throw new Error('ENTITLEMENT_IDENTITY_MISMATCH');
  }

  if (typeof contribution.contributedKvroBaseUnits !== 'bigint' || contribution.contributedKvroBaseUnits <= 0n ||
      typeof eligibility.minimumContributionKvroBaseUnits !== 'bigint' || eligibility.minimumContributionKvroBaseUnits <= 0n) {
    throw new Error('INVALID_ENTITLEMENT_AMOUNT');
  }
  if (eligibility.minimumContributionKvroBaseUnits > contribution.contributedKvroBaseUnits) {
    throw new Error('CONTRIBUTION_EVIDENCE_MISMATCH');
  }
  if (typeof contribution.ownershipEvidenceId !== 'string' || contribution.ownershipEvidenceId.length === 0 ||
      typeof contribution.contributionEvidenceId !== 'string' || contribution.contributionEvidenceId.length === 0) {
    throw new Error('ENTITLEMENT_EVIDENCE_ID_REQUIRED');
  }
  if (!Number.isSafeInteger(eligibility.firstObservationPeriod) || !Number.isSafeInteger(eligibility.lastObservationPeriod) ||
      !Number.isSafeInteger(eligibility.consecutivePeriods) || /** @type {number} */ (eligibility.consecutivePeriods) < 2) {
    throw new Error('INVALID_HOLDING_EVIDENCE');
  }
  const firstObservationPeriod = /** @type {number} */ (eligibility.firstObservationPeriod);
  const lastObservationPeriod = /** @type {number} */ (eligibility.lastObservationPeriod);
  const consecutivePeriods = /** @type {number} */ (eligibility.consecutivePeriods);
  if (firstObservationPeriod < 0 || lastObservationPeriod < firstObservationPeriod ||
      consecutivePeriods !== lastObservationPeriod - firstObservationPeriod + 1) {
    throw new Error('INVALID_HOLDING_EVIDENCE');
  }

  return Object.freeze({
    entitlementEligible: true,
    wallet: /** @type {string} */ (contribution.wallet),
    positionId: /** @type {string} */ (contribution.positionId),
    poolId: /** @type {string} */ (contribution.poolId),
    entitledKvroBaseUnits: /** @type {bigint} */ (eligibility.minimumContributionKvroBaseUnits),
    ownershipEvidenceId: contribution.ownershipEvidenceId,
    contributionEvidenceId: contribution.contributionEvidenceId,
    firstObservationPeriod,
    lastObservationPeriod,
    consecutivePeriods,
    entitlementAuthorized: false,
    payoutAuthorized: false,
  });
}
