import test from 'node:test';
import assert from 'node:assert/strict';
import { createObservationAuditEvidence, verifyObservationAuditEvidence } from './integrity-audit.js';

const evidence = {
  wallet: 'wallet-a',
  positionId: 'position-a',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  observationPeriod: 7,
  contextSlot: 123456,
  observedAtSeconds: 7 * 3600 + 42,
};

test('creates deterministic audit evidence without authorizing rewards', () => {
  const first = createObservationAuditEvidence(evidence);
  const second = createObservationAuditEvidence({ ...evidence });
  assert.equal(first.valid, true);
  assert.equal(second.valid, true);
  if (!first.valid || !second.valid) assert.fail('expected valid audit evidence');
  assert.equal(first.digest, second.digest);
  assert.equal(first.digest.length, 64);
  assert.deepEqual(first.evidence, evidence);
  assert.equal(first.ownershipProven, false);
  assert.equal(first.contributionProven, false);
  assert.equal(first.entitlementAuthorized, false);
  assert.equal(first.payoutAuthorized, false);
});

test('verifies intact audit evidence without elevating authority', () => {
  const created = createObservationAuditEvidence(evidence);
  assert.equal(created.valid, true);
  if (!created.valid) assert.fail('expected valid audit evidence');
  const result = verifyObservationAuditEvidence(evidence, created.digest);
  assert.equal(result.valid, true);
  if (!result.valid) assert.fail('expected intact audit evidence');
  assert.equal(result.ownershipProven, false);
  assert.equal(result.contributionProven, false);
  assert.equal(result.entitlementAuthorized, false);
  assert.equal(result.payoutAuthorized, false);
});

test('fails closed when audit evidence is tampered', () => {
  const created = createObservationAuditEvidence(evidence);
  assert.equal(created.valid, true);
  if (!created.valid) assert.fail('expected valid audit evidence');
  assert.deepEqual(verifyObservationAuditEvidence({ ...evidence, poolId: 'OTHER_TEST_POOL' }, created.digest), {
    valid: false,
    reason: 'AUDIT_EVIDENCE_TAMPERED',
    payoutAuthorized: false,
  });
});

test('binds trusted RPC slot and time into the audit digest', () => {
  const created = createObservationAuditEvidence(evidence);
  assert.equal(created.valid, true);
  if (!created.valid) assert.fail('expected valid audit evidence');

  for (const tampered of [
    { ...evidence, contextSlot: evidence.contextSlot + 1 },
    { ...evidence, observedAtSeconds: evidence.observedAtSeconds + 1 },
  ]) {
    assert.deepEqual(verifyObservationAuditEvidence(tampered, created.digest), {
      valid: false,
      reason: 'AUDIT_EVIDENCE_TAMPERED',
      payoutAuthorized: false,
    });
  }
});

test('fails closed when trusted time is missing or inconsistent with observation period', () => {
  const { contextSlot: _slot, ...missingSlot } = evidence;
  const { observedAtSeconds: _time, ...missingTime } = evidence;
  assert.equal(createObservationAuditEvidence(missingSlot).valid, false);
  assert.equal(createObservationAuditEvidence(missingTime).valid, false);
  assert.equal(createObservationAuditEvidence({ ...evidence, observedAtSeconds: 8 * 3600 }).valid, false);
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
