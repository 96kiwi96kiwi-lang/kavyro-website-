// KAVYRO Liquidity Rewards — read-only reconciliation boundary.
// Reconciliation never proves LP ownership/contribution and never authorizes payout.

import { observationPeriodForTimestamp } from './observation-period.js';

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value @returns {number | null} */
function safeNonNegativeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** @param {unknown} value */
function normalize(value) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RECONCILIATION_EVIDENCE');
  const record = /** @type {Record<string, unknown>} */ (value);
  const wallet = text(record.wallet);
  const positionId = text(record.positionId);
  const poolId = text(record.poolId);
  const observationPeriod = safeNonNegativeInteger(record.observationPeriod);
  const contextSlot = safeNonNegativeInteger(record.contextSlot);
  const observedAtSeconds = safeNonNegativeInteger(record.observedAtSeconds);
  if (!wallet || !positionId || !poolId || observationPeriod === null || contextSlot === null || observedAtSeconds === null) {
    throw new Error('INVALID_RECONCILIATION_EVIDENCE');
  }
  if (observationPeriodForTimestamp(observedAtSeconds) !== observationPeriod) {
    throw new Error('INVALID_RECONCILIATION_EVIDENCE');
  }
  return Object.freeze({
    key: `${wallet}:${positionId}:${observationPeriod}`,
    wallet,
    positionId,
    poolId,
    observationPeriod,
    contextSlot,
    observedAtSeconds,
  });
}

/**
 * Compare independently verified observation evidence with the persisted ledger.
 * Equality only establishes consistency of identifiers and trusted RPC time; it
 * does not establish LP ownership, contribution amount, eligibility, entitlement,
 * or payout authority.
 * @param {unknown} persisted
 * @param {unknown} verified
 */
export function reconcileObservationEvidence(persisted, verified) {
  let ledger;
  let evidence;
  try {
    ledger = normalize(persisted);
    evidence = normalize(verified);
  } catch {
    return Object.freeze({ reconciled: false, reason: 'INVALID_RECONCILIATION_EVIDENCE', payoutAuthorized: false });
  }

  if (ledger.key !== evidence.key) {
    return Object.freeze({ reconciled: false, reason: 'IDENTITY_MISMATCH', payoutAuthorized: false });
  }
  if (ledger.poolId !== evidence.poolId) {
    return Object.freeze({ reconciled: false, reason: 'POOL_MISMATCH', payoutAuthorized: false });
  }
  if (ledger.contextSlot !== evidence.contextSlot || ledger.observedAtSeconds !== evidence.observedAtSeconds) {
    return Object.freeze({ reconciled: false, reason: 'TRUSTED_TIME_MISMATCH', payoutAuthorized: false });
  }

  return Object.freeze({
    reconciled: true,
    reason: 'CONSISTENT_OBSERVATION_IDENTIFIERS_AND_TRUSTED_TIME',
    key: ledger.key,
    poolId: ledger.poolId,
    contextSlot: ledger.contextSlot,
    observedAtSeconds: ledger.observedAtSeconds,
    ownershipProven: false,
    contributionProven: false,
    entitlementAuthorized: false,
    payoutAuthorized: false,
  });
}
