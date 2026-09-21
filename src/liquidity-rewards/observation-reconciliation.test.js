import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileObservationEvidence } from './observation-reconciliation.js';

const persisted = {
  wallet: 'wallet-a',
  positionId: 'position-a',
  poolId: 'TEST_ONLY_POOL_ID_NOT_PRODUCTION',
  observationPeriod: 7,
};

test('reconciles only identical observation identifiers without authorizing rewards', () => {
  const result = reconcileObservationEvidence(persisted, { ...persisted });
  assert.equal(result.reconciled, true);
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

test('fails closed on malformed evidence', () => {
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
});

test('does not expose transaction or payout execution capabilities', () => {
  const result = reconcileObservationEvidence(persisted, persisted);
  assert.equal('sign' in result, false);
  assert.equal('send' in result, false);
  assert.equal('buildTransaction' in result, false);
  assert.equal(result.payoutAuthorized, false);
});
