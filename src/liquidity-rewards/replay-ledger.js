// KAVYRO Liquidity Rewards — read-only entitlement replay boundary.
// Pure state transition: it records evidence consumption only; it never authorizes payout.

/** @typedef {Readonly<{ entitlementKey: string, evidenceKey: string, wallet: string, positionId: string, poolId: string, payoutAuthorized: false }>} ReplayRecord */

/**
 * Build a deterministic one-time identity for an already verified entitlement.
 * No pool/eligibility assertion here upgrades evidence or authorizes payout.
 * @param {unknown} value
 * @returns {Readonly<{ entitlementKey: string, evidenceKey: string, wallet: string, positionId: string, poolId: string, payoutAuthorized: false }>}
 */
export function createReplayRecord(value) {
  if (!value || typeof value !== 'object') throw new Error('ENTITLEMENT_REQUIRED');
  const entitlement = /** @type {Record<string, unknown>} */ (value);
  if (entitlement.entitlementEligible !== true || entitlement.entitlementAuthorized !== false || entitlement.payoutAuthorized !== false) {
    throw new Error('VERIFIED_UNAUTHORIZED_ENTITLEMENT_REQUIRED');
  }
  const fields = ['wallet', 'positionId', 'poolId', 'ownershipEvidenceId', 'contributionEvidenceId'];
  for (const field of fields) {
    if (typeof entitlement[field] !== 'string' || entitlement[field].length === 0) throw new Error('ENTITLEMENT_IDENTITY_REQUIRED');
  }
  if (typeof entitlement.entitledKvroBaseUnits !== 'bigint' || entitlement.entitledKvroBaseUnits <= 0n) {
    throw new Error('INVALID_ENTITLEMENT_AMOUNT');
  }
  if (!Number.isSafeInteger(entitlement.firstObservationPeriod) || !Number.isSafeInteger(entitlement.lastObservationPeriod)) {
    throw new Error('INVALID_OBSERVATION_RANGE');
  }
  const first = /** @type {number} */ (entitlement.firstObservationPeriod);
  const last = /** @type {number} */ (entitlement.lastObservationPeriod);
  if (first < 0 || last < first) throw new Error('INVALID_OBSERVATION_RANGE');

  const wallet = /** @type {string} */ (entitlement.wallet);
  const positionId = /** @type {string} */ (entitlement.positionId);
  const poolId = /** @type {string} */ (entitlement.poolId);
  const ownershipEvidenceId = /** @type {string} */ (entitlement.ownershipEvidenceId);
  const contributionEvidenceId = /** @type {string} */ (entitlement.contributionEvidenceId);
  const amount = /** @type {bigint} */ (entitlement.entitledKvroBaseUnits);
  const evidenceKey = `${ownershipEvidenceId}:${contributionEvidenceId}`;
  return Object.freeze({
    entitlementKey: `${wallet}:${positionId}:${poolId}:${amount.toString()}:${first}:${last}`,
    evidenceKey,
    wallet,
    positionId,
    poolId,
    payoutAuthorized: false,
  });
}

/**
 * Fail closed on duplicate entitlement identity OR reused evidence identity.
 * Returns a new immutable ledger; caller decides persistence. This function cannot pay.
 * @param {readonly ReplayRecord[]} ledgerValue
 * @param {ReplayRecord} record
 * @returns {readonly ReplayRecord[]}
 */
export function appendReplayRecord(ledgerValue, record) {
  if (!Array.isArray(ledgerValue)) throw new Error('REPLAY_LEDGER_REQUIRED');
  if (!record || typeof record !== 'object' || record.payoutAuthorized !== false) throw new Error('VALID_REPLAY_RECORD_REQUIRED');
  for (const existing of ledgerValue) {
    if (!existing || typeof existing !== 'object') throw new Error('MALFORMED_REPLAY_LEDGER');
    if (existing.entitlementKey === record.entitlementKey) throw new Error('ENTITLEMENT_REPLAY_DETECTED');
    if (existing.evidenceKey === record.evidenceKey) throw new Error('EVIDENCE_REUSE_DETECTED');
  }
  return Object.freeze([...ledgerValue, Object.freeze({ ...record, payoutAuthorized: false })]);
}
