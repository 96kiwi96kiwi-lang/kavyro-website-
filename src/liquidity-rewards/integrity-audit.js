// KAVYRO Liquidity Rewards — read-only integrity/audit boundary.
// Audit evidence is tamper-evident only; it never proves LP ownership/contribution
// and never authorizes entitlement or payout.

import { createHash } from 'node:crypto';

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value */
function normalize(value) {
  if (!value || typeof value !== 'object') throw new Error('INVALID_AUDIT_EVIDENCE');
  const record = /** @type {Record<string, unknown>} */ (value);
  const wallet = text(record.wallet);
  const positionId = text(record.positionId);
  const poolId = text(record.poolId);
  const observationPeriod = record.observationPeriod;
  if (!wallet || !positionId || !poolId || typeof observationPeriod !== 'number' || !Number.isInteger(observationPeriod) || observationPeriod < 0) {
    throw new Error('INVALID_AUDIT_EVIDENCE');
  }
  return Object.freeze({ wallet, positionId, poolId, observationPeriod });
}

/** @param {{wallet:string,positionId:string,poolId:string,observationPeriod:number}} evidence */
function digest(evidence) {
  const canonical = JSON.stringify([
    evidence.wallet,
    evidence.positionId,
    evidence.poolId,
    evidence.observationPeriod,
  ]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Produce deterministic, tamper-evident audit evidence from a reconciled observation.
 * @param {unknown} value
 */
export function createObservationAuditEvidence(value) {
  try {
    const evidence = normalize(value);
    return Object.freeze({
      valid: true,
      reason: 'AUDIT_EVIDENCE_CREATED',
      evidence,
      digest: digest(evidence),
      ownershipProven: false,
      contributionProven: false,
      entitlementAuthorized: false,
      payoutAuthorized: false,
    });
  } catch {
    return Object.freeze({ valid: false, reason: 'INVALID_AUDIT_EVIDENCE', payoutAuthorized: false });
  }
}

/**
 * Verify that persisted audit evidence has not changed since its digest was created.
 * @param {unknown} value
 * @param {unknown} expectedDigest
 */
export function verifyObservationAuditEvidence(value, expectedDigest) {
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest)) {
    return Object.freeze({ valid: false, reason: 'INVALID_AUDIT_DIGEST', payoutAuthorized: false });
  }
  try {
    const evidence = normalize(value);
    if (digest(evidence) !== expectedDigest) {
      return Object.freeze({ valid: false, reason: 'AUDIT_EVIDENCE_TAMPERED', payoutAuthorized: false });
    }
    return Object.freeze({
      valid: true,
      reason: 'AUDIT_EVIDENCE_INTACT',
      ownershipProven: false,
      contributionProven: false,
      entitlementAuthorized: false,
      payoutAuthorized: false,
    });
  } catch {
    return Object.freeze({ valid: false, reason: 'INVALID_AUDIT_EVIDENCE', payoutAuthorized: false });
  }
}
