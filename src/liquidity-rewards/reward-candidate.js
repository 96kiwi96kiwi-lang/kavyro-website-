// KAVYRO Liquidity Rewards — review-only reward candidate boundary.
// A candidate is an audit artifact for human review. It never authorizes payout.

import { createReplayRecord } from './replay-ledger.js';
import { verifyObservationAuditEvidence } from './integrity-audit.js';

/**
 * Create a reviewable candidate only when entitlement identity, consumed replay
 * identity and tamper-evident trusted observation evidence all agree.
 * This boundary deliberately cannot build, sign or send transactions.
 * @param {unknown} entitlementValue
 * @param {unknown} replayValue
 * @param {unknown} auditEvidenceValue
 * @param {unknown} auditDigest
 */
export function createReviewableRewardCandidate(entitlementValue, replayValue, auditEvidenceValue, auditDigest) {
  if (!entitlementValue || typeof entitlementValue !== 'object') throw new Error('ENTITLEMENT_REQUIRED');
  const entitlement = /** @type {Record<string, unknown>} */ (entitlementValue);
  const expectedReplay = createReplayRecord(entitlementValue);

  if (!replayValue || typeof replayValue !== 'object') throw new Error('CONSUMED_REPLAY_RECORD_REQUIRED');
  const replay = /** @type {Record<string, unknown>} */ (replayValue);
  for (const key of ['entitlementKey', 'evidenceKey', 'wallet', 'positionId', 'poolId']) {
    if (replay[key] !== expectedReplay[key]) throw new Error('REPLAY_RECORD_MISMATCH');
  }
  if (replay.payoutAuthorized !== false) throw new Error('REPLAY_RECORD_MISMATCH');

  const auditVerification = verifyObservationAuditEvidence(auditEvidenceValue, auditDigest);
  if (!auditVerification.valid) throw new Error('INTACT_AUDIT_EVIDENCE_REQUIRED');
  if (!auditEvidenceValue || typeof auditEvidenceValue !== 'object') throw new Error('INTACT_AUDIT_EVIDENCE_REQUIRED');
  const audit = /** @type {Record<string, unknown>} */ (auditEvidenceValue);
  for (const key of ['wallet', 'positionId', 'poolId']) {
    if (audit[key] !== entitlement[key]) throw new Error('AUDIT_IDENTITY_MISMATCH');
  }
  if (audit.observationPeriod !== entitlement.lastObservationPeriod) throw new Error('AUDIT_PERIOD_MISMATCH');

  if (typeof entitlement.entitledKvroBaseUnits !== 'bigint' || entitlement.entitledKvroBaseUnits <= 0n) {
    throw new Error('INVALID_REWARD_AMOUNT');
  }

  return Object.freeze({
    reviewable: true,
    wallet: /** @type {string} */ (entitlement.wallet),
    positionId: /** @type {string} */ (entitlement.positionId),
    poolId: /** @type {string} */ (entitlement.poolId),
    rewardBaseUnits: /** @type {bigint} */ (entitlement.entitledKvroBaseUnits),
    entitlementKey: expectedReplay.entitlementKey,
    evidenceKey: expectedReplay.evidenceKey,
    auditDigest: /** @type {string} */ (auditDigest),
    ownershipProvenByCandidate: false,
    contributionProvenByCandidate: false,
    entitlementAuthorized: false,
    payoutAuthorized: false,
    canBuildTransaction: false,
    canSignTransaction: false,
    canSendTransaction: false,
  });
}
