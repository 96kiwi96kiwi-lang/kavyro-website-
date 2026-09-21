// KAVYRO Liquidity Rewards — LP contribution evidence boundary.
// Pure/read-only. Pool verification alone never proves ownership or contribution.

/**
 * @typedef {object} ContributionEvidence
 * @property {boolean} poolVerified
 * @property {boolean} ownershipVerified
 * @property {boolean} contributionVerified
 * @property {string} poolId
 * @property {string} wallet
 * @property {string} positionId
 * @property {bigint} contributedKvroBaseUnits
 * @property {string} ownershipEvidenceId
 * @property {string} contributionEvidenceId
 */

/**
 * Convert independently verified LP evidence into the narrow observation shape
 * consumed by holding eligibility. All proof flags and identities are required;
 * the result still never authorizes entitlement or payout.
 *
 * @param {unknown} value
 * @returns {Readonly<{
 *   verified: true,
 *   poolVerified: true,
 *   ownershipProven: true,
 *   contributionProven: true,
 *   poolId: string,
 *   wallet: string,
 *   positionId: string,
 *   contributedKvroBaseUnits: bigint,
 *   ownershipEvidenceId: string,
 *   contributionEvidenceId: string,
 *   entitlementAuthorized: false,
 *   payoutAuthorized: false
 * }>}
 */
export function requireVerifiedContributionEvidence(value) {
  if (!value || typeof value !== 'object') throw new Error('CONTRIBUTION_EVIDENCE_REQUIRED');
  const evidence = /** @type {Record<string, unknown>} */ (value);
  if (evidence.poolVerified !== true) throw new Error('POOL_NOT_VERIFIED');
  if (evidence.ownershipVerified !== true) throw new Error('LP_OWNERSHIP_NOT_PROVEN');
  if (evidence.contributionVerified !== true) throw new Error('LP_CONTRIBUTION_NOT_PROVEN');

  const requiredStrings = ['poolId', 'wallet', 'positionId', 'ownershipEvidenceId', 'contributionEvidenceId'];
  for (const key of requiredStrings) {
    if (typeof evidence[key] !== 'string' || evidence[key].length === 0) throw new Error('INVALID_CONTRIBUTION_EVIDENCE');
  }
  if (typeof evidence.contributedKvroBaseUnits !== 'bigint' || evidence.contributedKvroBaseUnits <= 0n) {
    throw new Error('INVALID_CONTRIBUTION_AMOUNT');
  }

  return Object.freeze({
    verified: true,
    poolVerified: true,
    ownershipProven: true,
    contributionProven: true,
    poolId: /** @type {string} */ (evidence.poolId),
    wallet: /** @type {string} */ (evidence.wallet),
    positionId: /** @type {string} */ (evidence.positionId),
    contributedKvroBaseUnits: evidence.contributedKvroBaseUnits,
    ownershipEvidenceId: /** @type {string} */ (evidence.ownershipEvidenceId),
    contributionEvidenceId: /** @type {string} */ (evidence.contributionEvidenceId),
    entitlementAuthorized: false,
    payoutAuthorized: false,
  });
}
