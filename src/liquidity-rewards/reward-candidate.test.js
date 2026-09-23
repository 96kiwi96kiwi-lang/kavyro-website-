import test from 'node:test';
import assert from 'node:assert/strict';
import { createReplayRecord } from './replay-ledger.js';
import { createObservationAuditEvidence } from './integrity-audit.js';
import { createReviewableRewardCandidate } from './reward-candidate.js';

const entitlement = Object.freeze({
  entitlementEligible: true,
  wallet: 'TEST_WALLET',
  positionId: 'TEST_POSITION',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  entitledKvroBaseUnits: 100n,
  ownershipEvidenceId: 'OWNERSHIP_EVIDENCE',
  contributionEvidenceId: 'CONTRIBUTION_EVIDENCE',
  firstObservationPeriod: 10,
  lastObservationPeriod: 12,
  consecutivePeriods: 3,
  entitlementAuthorized: false,
  payoutAuthorized: false,
});

/** @param {Record<string, unknown>} [value] */
function auditFor(value = {}) {
  return createObservationAuditEvidence({
    wallet: entitlement.wallet,
    positionId: entitlement.positionId,
    poolId: entitlement.poolId,
    observationPeriod: entitlement.lastObservationPeriod,
    contextSlot: 1000,
    observedAtSeconds: 12 * 3600,
    ...value,
  });
}

test('creates review-only candidate from matching consumed replay and intact audit evidence', () => {
  const replay = createReplayRecord(entitlement);
  const audit = auditFor();
  assert.equal(audit.valid, true);
  if (!audit.valid) throw new Error('AUDIT_EXPECTED');
  const candidate = createReviewableRewardCandidate(entitlement, replay, audit.evidence, audit.digest);
  assert.equal(candidate.reviewable, true);
  assert.equal(candidate.rewardBaseUnits, 100n);
  assert.equal(candidate.ownershipProvenByCandidate, false);
  assert.equal(candidate.contributionProvenByCandidate, false);
  assert.equal(candidate.entitlementAuthorized, false);
  assert.equal(candidate.payoutAuthorized, false);
  assert.equal(candidate.canBuildTransaction, false);
  assert.equal(candidate.canSignTransaction, false);
  assert.equal(candidate.canSendTransaction, false);
});

test('fails closed when replay identity does not match entitlement', () => {
  const replay = { ...createReplayRecord(entitlement), evidenceKey: 'FORGED' };
  const audit = auditFor();
  assert.equal(audit.valid, true);
  if (!audit.valid) throw new Error('AUDIT_EXPECTED');
  assert.throws(() => createReviewableRewardCandidate(entitlement, replay, audit.evidence, audit.digest), /REPLAY_RECORD_MISMATCH/);
});

test('fails closed on tampered audit evidence or wrong terminal observation period', () => {
  const replay = createReplayRecord(entitlement);
  const audit = auditFor();
  assert.equal(audit.valid, true);
  if (!audit.valid) throw new Error('AUDIT_EXPECTED');
  assert.throws(() => createReviewableRewardCandidate(entitlement, replay, { ...audit.evidence, contextSlot: 1001 }, audit.digest), /INTACT_AUDIT_EVIDENCE_REQUIRED/);

  const wrongPeriodAudit = auditFor({ observationPeriod: 11, observedAtSeconds: 11 * 3600 });
  assert.equal(wrongPeriodAudit.valid, true);
  if (!wrongPeriodAudit.valid) throw new Error('AUDIT_EXPECTED');
  assert.throws(() => createReviewableRewardCandidate(entitlement, replay, wrongPeriodAudit.evidence, wrongPeriodAudit.digest), /AUDIT_PERIOD_MISMATCH/);
});

test('fails closed when audit identity differs from entitlement', () => {
  const replay = createReplayRecord(entitlement);
  const audit = auditFor({ wallet: 'OTHER_TEST_WALLET' });
  assert.equal(audit.valid, true);
  if (!audit.valid) throw new Error('AUDIT_EXPECTED');
  assert.throws(() => createReviewableRewardCandidate(entitlement, replay, audit.evidence, audit.digest), /AUDIT_IDENTITY_MISMATCH/);
});
