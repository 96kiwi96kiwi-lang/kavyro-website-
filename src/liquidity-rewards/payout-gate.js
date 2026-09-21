// KAVYRO Liquidity Rewards — terminal read-only payout gate.
// This boundary never builds, signs, sends, or authorizes a transaction.

/**
 * @param {unknown} value
 * @returns {Readonly<{ gateOpen: false, manualReviewEligible: boolean, rewardsEnabled: false, payoutAuthorized: false, reason: string, entitlementKey: string | null }>}
 */
export function evaluatePayoutGate(value) {
  const deny = (reason) => Object.freeze({ gateOpen: false, manualReviewEligible: false, rewardsEnabled: false, payoutAuthorized: false, reason, entitlementKey: null });
  if (!value || typeof value !== 'object') return deny('REPLAY_RECORD_REQUIRED');
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.payoutAuthorized !== false) return deny('PAYOUT_MUST_BE_UNAUTHORIZED');
  if (typeof record.entitlementKey !== 'string' || record.entitlementKey.length === 0) return deny('ENTITLEMENT_KEY_REQUIRED');
  if (typeof record.evidenceKey !== 'string' || record.evidenceKey.length === 0) return deny('EVIDENCE_KEY_REQUIRED');
  for (const field of ['wallet', 'positionId', 'poolId']) {
    if (typeof record[field] !== 'string' || record[field].length === 0) return deny('IDENTITY_REQUIRED');
  }
  return Object.freeze({ gateOpen: false, manualReviewEligible: true, rewardsEnabled: false, payoutAuthorized: false, reason: 'MANUAL_REVIEW_ONLY', entitlementKey: /** @type {string} */ (record.entitlementKey) });
}
