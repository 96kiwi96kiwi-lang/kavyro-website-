import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservationAuditEvidence, verifyObservationAuditEvidence } from './integrity-audit.js';

const evidence = {
  wallet: 'wallet-a',
  positionId: 'position-a',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  observationPeriod: 7,
};

test('creates deterministic audit evidence without authorizing rewards', () => {
  const first = createObservationAuditEvidence(evidence);
  const second = createObservationAuditEvidence({ ...evidence });
  assert.equal(first.valid, true);
  assert.equal(first.digest, second.digest);
  assert.equal(first.digest.length, 64);
  assert.equal(first.ownershipProven, false);
  assert.equal(first.contributionProven, false);
  assert.equal(first.entitlementAuthorized, false);
  assert.equal(first.payoutAuthorized, false);
});

test('verifies intact audit evidence without elevating authority', () => {
  const created = createObservationAuditEvidence(evidence);
  assert.equal(created.valid, true);
  if (!created.valid) return;
  const result = verifyObservationAuditEvidence(evidence, created.digest);
  assert.equal(result.valid, true);
  assert.equal(result.ownershipProven, false);
  assert.equal(result.contributionProven, false);
  assert.equal(result.entitlementAuthorized, false);
  assert.equal(result.payoutAuthorized, false);
});

test('fails closed when audit evidence is tampered', () => {
  const created = createObservationAuditEvidence(evidence);
  assert.equal(created.valid, true);
  if (!created.valid) return;
  assert.deepEqual(verifyObservationAuditEvidence({ ...evidence, poolId: 'OTHER_TEST_POOL' }, created.digest), {
    valid: false,
    reason: 'AUDIT_EVIDENCE_TAMPERED',
    payoutAuthorized: false,
  });
});

test('fails closed on malformed evidence or digest', () => {
  assert.deepEqual(createObservationAuditEvidence(null), {
    valid: false,
    reason: 'INVALID_AUDIT_EVIDENCE',
    payoutAuthorized: false,
  });
  assert.deepEqual(verifyObservationAuditEvidence(evidence, 'not-a-digest'), {
    valid: false,
    reason: 'INVALID_AUDIT_DIGEST',
    payoutAuthorized: false,
  });
});

test('does not expose transaction or payout execution capabilities', () => {
  const result = createObservationAuditEvidence(evidence);
  assert.equal('sign' in result, false);
  assert.equal('send' in result, false);
  assert.equal('buildTransaction' in result, false);
  assert.equal(result.payoutAuthorized, false);
});
