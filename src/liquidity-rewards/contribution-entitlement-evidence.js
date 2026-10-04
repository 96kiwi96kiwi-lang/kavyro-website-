// Read-only composition boundary for historical contribution + independently verified LP ownership.
// Neither current LP balance nor caller flags can prove the historical contribution.
import { verifyCpmmContributionReceipt } from './cpmm-contribution-receipt.js';

/**
 * Compose entitlement evidence only when the verified historical receipt and
 * independently verified ownership evidence agree on wallet, pool and LP mint.
 * @param {unknown} receiptValue
 * @param {unknown} ownershipValue
 */
export function composeContributionEntitlementEvidence(receiptValue, ownershipValue) {
  const receipt = verifyCpmmContributionReceipt(receiptValue);
  if (!ownershipValue || typeof ownershipValue !== 'object') throw new Error('OWNERSHIP_EVIDENCE_REQUIRED');
  const ownership = /** @type {Record<string, unknown>} */ (ownershipValue);
  if (ownership.verified !== true || ownership.poolVerified !== true || ownership.ownershipProven !== true) {
    throw new Error('VERIFIED_OWNERSHIP_REQUIRED');
  }
  for (const [key, expected] of [['wallet', receipt.wallet], ['poolId', receipt.poolId], ['lpMint', receipt.lpMint]]) {
    if (ownership[key] !== expected) throw new Error('CONTRIBUTION_OWNERSHIP_IDENTITY_MISMATCH');
  }
  if (typeof ownership.positionId !== 'string' || !ownership.positionId) throw new Error('POSITION_IDENTITY_REQUIRED');
  if (typeof ownership.ownershipEvidenceId !== 'string' || !ownership.ownershipEvidenceId) throw new Error('OWNERSHIP_EVIDENCE_ID_REQUIRED');
  return Object.freeze({
    verified: true,
    poolVerified: true,
    ownershipProven: true,
    contributionProven: true,
    wallet: receipt.wallet,
    positionId: ownership.positionId,
    poolId: receipt.poolId,
    lpMint: receipt.lpMint,
    contributedKvroBaseUnits: receipt.contributedKvroBaseUnits,
    ownershipEvidenceId: ownership.ownershipEvidenceId,
    contributionEvidenceId: receipt.contributionEvidenceId,
    payoutAuthorized: false,
  });
}
