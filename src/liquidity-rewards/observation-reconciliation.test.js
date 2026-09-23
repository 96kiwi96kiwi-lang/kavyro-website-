import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileObservationEvidence } from './observation-reconciliation.js';

const persisted = {
  wallet: 'wallet-a',
  positionId: 'position-a',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  observationPeriod: 7,
  contextSlot: 123456789,
  observedAtSeconds: 25200,
};

test('reconciles only identical observation identifiers and trusted time without authorizing rewards', () => {
  const result = reconcileObservationEvidence(persisted, { ...persisted });
  assert.equal(result.reconciled, true);
  assert.equal(result.contextSlot, persisted.contextSlot);
  assert.equal(result.observedAtSeconds, persisted.observedAtSeconds);
  assert.equal(result.ownershipProven, false);
  assert.equal(result.contributionProven, false);
  assert.equal(result.entitlementAuthorized, false);
  assert.equal(result.payoutAuthorized, false);
});

test('fails closed when persisted and verified identities conflict', () => {
  const result = reconcileObservationEvidence(persisted, { ...persisted, positionId: 'position-b' });
  assert.deepEqual(result, {
    reconciled: false,
    reason: 'IDENTITY_MISMATCH',
    payoutAuthorized: false,
  });
});

test('fails closed when pool evidence conflicts', () => {
  const result = reconcileObservationEvidence(persisted, { ...persisted, poolId: 'OTHER_TEST_POOL' });
  assert.deepEqual(result, {
    reconciled: false,
    reason: 'POOL_MISMATCH',
    payoutAuthorized: false,
  });
});

test('fails closed when trusted RPC time conflicts', () => {
  assert.deepEqual(reconcileObservationEvidence(persisted, { ...persisted, contextSlot: persisted.contextSlot + 1 }), {
    reconciled: false,
    reason: 'TRUSTED_TIME_MISMATCH',
    payoutAuthorized: false,
  });
  assert.deepEqual(reconcileObservationEvidence(persisted, { ...persisted, observedAtSeconds: persisted.observedAtSeconds + 1 }), {
    reconciled: false,
    reason: 'TRUSTED_TIME_MISMATCH',
    payoutAuthorized: false,
  });
});

test('fails closed on malformed or missing trusted-time evidence', () => {
  assert.deepEqual(reconcileObservationEvidence(null, persisted), {
    reconciled: false,
    reason: 'INVALID_RECONCILIATION_EVIDENCE',
    payoutAuthorized: false,
  });
  assert.deepEqual(reconcileObservationEvidence(persisted, { ...persisted, observationPeriod: -1 }), {
    reconciled: false,
    reason: 'INVALID_RECONCILIATION_EVIDENCE',
    payoutAuthorized: false,
  });
  const { contextSlot: _contextSlot, ...withoutSlot } = persisted;
  assert.deepEqual(reconcileObservationEvidence(persisted, withoutSlot), {
    reconciled: false,
    reason: 'INVALID_RECONCILIATION_EVIDENCE',
    payoutAuthorized: false,
  });
});

test('does not expose transaction or payout execution capabilities', () => {
  const result = reconcileObservationEvidence(persisted, persisted);
  assert.equal('sign' in result, false);
  assert.equal('send' in result, false);
  assert.equal('buildTransaction' in result, false);
  assert.equal(result.payoutAuthorized, false);
});
