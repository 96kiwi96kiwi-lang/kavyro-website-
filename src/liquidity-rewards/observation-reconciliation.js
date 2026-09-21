// KAVYRO Liquidity Rewards — read-only reconciliation boundary.
// Reconciliation never proves LP ownership/contribution and never authorizes payout.

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value */
function normalize(value) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_RECONCILIATION_EVIDENCE');
  const record = /** @type {Record<string, unknown>} */ (value);
  const wallet = text(record.wallet);
  const positionId = text(record.positionId);
  const poolId = text(record.poolId);
  const observationPeriod = record.observationPeriod;
  if (!wallet || !positionId || !poolId || typeof observationPeriod !== 'number' || !Number.isInteger(observationPeriod) || observationPeriod < 0) {
    throw new Error('INVALID_RECONCILIATION_EVIDENCE');
  }
  return Object.freeze({
    key: `${wallet}:${positionId}:${observationPeriod}`,
    wallet,
    positionId,
    poolId,
    observationPeriod,
  });
}

/**
 * Compare independently verified observation evidence with the persisted ledger.
 * Equality only establishes consistency of identifiers; it does not establish
 * LP ownership, contribution amount, eligibility, entitlement, or payout authority.
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

  return Object.freeze({
    reconciled: true,
    reason: 'CONSISTENT_OBSERVATION_IDENTIFIERS',
    key: ledger.key,
    poolId: ledger.poolId,
    ownershipProven: false,
    contributionProven: false,
    entitlementAuthorized: false,
    payoutAuthorized: false,
  });
}
